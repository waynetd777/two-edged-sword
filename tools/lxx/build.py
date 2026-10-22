# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds lxx_brenton.bbli ("Septuagint (Greek, Brenton 1844)"): the Greek Old Testament with the
Apocrypha as Sir Lancelot Brenton printed it, the stand-in in the library for the Sixtine
Septuagint of 1587 that the KJV's translators used.

    python3 tools/lxx/build.py

Writes to the app's modules folder, where the app finds it after Library → Rescan; tools/core builds it
into the app (src-tauri/modules), reading only the built-in KJV and RV.

Source: eBible.org's grcbrent (https://ebible.org/Scriptures/grcbrent_usfm.zip), "The Greek
Septuagint with Apocrypha, compiled by Sir Lancelot C. L. Brenton", public domain, in USFM. Brenton
printed the Vatican text as Valpy's edition of 1819 had it, which is the Sixtine edition's (Rome,
1587): the Sixtine text in all but small details.

The Septuagint numbers its verses its own way, and the app lines Bibles up by the KJV's, so each
verse is moved in two steps with SIL's standard versification tables (libpalaso's lxx.vrs and
eng.vrs, MIT): from the Septuagint's numbering to the Hebrew (Psalms 9–147, which the Septuagint
numbers one lower, and its splits and joins; Jeremiah's chapters 25–51, in another order; 2 Esdras
11–23, which is Nehemiah; Greek Esther and Daniel), and from the Hebrew to the KJV's (Malachi 4,
Joel 2–3, the Psalms' titles, and the rest). Rules here cover what the tables don't: eBible's
3 Kingdoms has chapters 20 and 21 the other way round (Naboth's vineyard first); Malachi ends
with Elijah before "Remember the law of Moses", the KJV's 4:4; 2 Esdras 17 (Nehemiah 7) has no verse 68,
as the KJV's numbering hasn't, so from 69 its verses keep their numbers; eBible's English Brenton has
Nehemiah as a book of its own too, numbered as the KJV, which is read instead of 2 Esdras 11–23; its
Proverbs has the Hebrew 30:1–14 as 24:22f–t (after five verses of its own, 24:22a–e, which stay with
24:22), 30:15–33 and 31:1–9 as 24:35–62, and no chapter 30; and in a chapter eBible already numbers as
the KJV does (Deuteronomy 28–29), the verses keep their numbers.

Where the Septuagint orders a passage otherwise and no table moves it, PLACES puts each verse at the
KJV verse it translates, worked out verse by verse against the KJV: Exodus 36–39 (the making of the
tabernacle in another order), Numbers 10:34–36, 21:20–22, 26:15–47 (the tribes in another order) and
27:4–8, Joshua 24:29–31, 1 Kings 6:1a–d and 7 (Solomon's house after the temple's furnishings), Proverbs 31:26–27,
Ezekiel 7:3–9.

In Leviticus 8, Sirach 30–36 and the additions to Esther each verse is placed by its words: eBible's
English Brenton matched with the KJV, or with the RV's Apocrypha, which numbers the additions Esther 10:4–16:24 as the
Vulgate does (aligned; the Greek numbers its verses as the English). Lettered verses that fill a gap in
the numbering take its numbers (Tobit 4:7a–l are 4:8–18).

What the KJV has no verse for is joined to the verse before it, as tools/vulgate does: a Psalm's
title to its verse 1; the Septuagint's added verses (1 Kings 2:35a–o, 12:24a–z, and the other
lettered ones) to the verse they follow; the Greek additions to Esther to the verse they follow;
the Prayer of Azariah and Song of the Three (Daniel 3:24–90) to 3:23. Psalm 151 keeps its number.
Susanna and Bel are Daniel 13 and 14, the Letter of Jeremiah Baruch 6, and the other books of the
Apocrypha are numbered as e-Sword numbers them (67 Tobit, 68 Judith, 69 Wisdom, 70 Sirach, 71
Baruch, 72–73 1–2 Maccabees, 74 1 Esdras, 76–77 3–4 Maccabees, 78 the Prayer of Manasseh) with
their own chapters and verses; Sirach's prologue opens its 1:1. Lamentations' Greek preface opens
Lamentations 1:1. Where the Septuagint lacks a verse the KJV has, there is none.

SIL's tables are taken at a fixed commit (eBible.org's zip has no fixed version to take).
Downloads are cached in ~/Library/Caches/Two-edged Sword/lxx.
"""
import html, io, math, re, sqlite3, sys, zipfile
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from books import USFM as BOOK_CODES  # noqa: E402
from modules import BUNDLED, CACHES, LIBRARY, chapter_lengths, fetch, find, module  # noqa: E402
CACHE = CACHES / "lxx"
USFM = "https://ebible.org/Scriptures/grcbrent_usfm.zip"
VRS = "https://raw.githubusercontent.com/sillsdev/libpalaso/0e913f4b4ee64c9d42b1891254513b83dbb4906c/SIL.Scripture/Resources/{}.vrs.txt"

# The canon's Paratext codes in e-Sword's order (1–39).
CANON = BOOK_CODES[:39]
# The Apocrypha as e-Sword (and the library's Brenton, Latin and Douay-Rheims) numbers them.
APOCRYPHA = {"TOB": 67, "JDT": 68, "WIS": 69, "SIR": 70, "BAR": 71, "1MA": 72, "2MA": 73, "1ES": 74, "3MA": 76, "4MA": 77, "MAN": 78}


def get(url, name):
    return fetch(url, CACHE / name, timeout=300).read_bytes()


def usfm(url=USFM):
    """{book code: [(chapter, verse label, text)]} in the files' order, and the copyright page, of
    eBible's grcbrent (or another of its Septuagints, the English eng-Brenton)."""
    z = zipfile.ZipFile(io.BytesIO(get(url, url.rsplit("/", 1)[1])))
    books, about = {}, ""
    for name in sorted(z.namelist()):
        if name.endswith("copr.htm"):
            about = z.read(name).decode("utf-8", "replace")
        if not name.endswith(".usfm"):
            continue
        t = z.read(name).decode("utf-8-sig")
        code = re.search(r"\\id (\S+)", t).group(1)
        verses, c, pre = [], 0, ""
        # One verse runs from its \v to the next \v or \c; what comes before a chapter's first verse
        # and is text (Lamentations' preface) opens it.
        for m in re.finditer(r"\\(c|v) (\S+)([^\\]*(?:\\(?!c |v )[^\\]*)*)", t):
            kind, num, body = m.group(1), m.group(2), m.group(3)
            if kind == "c":
                c = int(num)
                ip = re.search(r"\\ip ([^\\]*)", body)
                pre = clean(ip.group(1)) if ip else ""
                continue
            text = clean(body)
            if pre:
                text, pre = f"{pre} {text}", ""
            verses.append((c, num, text))
        # Text before chapter 1 (Lamentations' \ip) is found here.
        head = t.split("\\c 1", 1)[0]
        ip = re.search(r"\\ip ([^\\\n]*)", head)
        if ip and verses:
            c1, n1, t1 = verses[0]
            verses[0] = (c1, n1, f"{clean(ip.group(1))} {t1}")
        books[code] = verses
    return books, about


ENG = "https://ebible.org/Scriptures/eng-Brenton_usfm.zip"
# Where the Septuagint orders a passage otherwise and no table moves it, the KJV verse each of its verses translates,
# worked out verse by verse: (book, chapter, its verses, the KJV's chapter, verse). "9-38" go to consecutive verses
# from there, "18,19,20" all to the one verse (joined, in order), as do the verses of several entries that name one.
# A verse the Septuagint lacks is left empty (Exodus 36:10-33, the curtains' loops and the boards; 1 Kings 7:31). The Greek numbers its
# verses as the English, so the same places serve both.
PLACES = [
    # Exodus 36-39: the priests' garments first (36:8-38, the KJV's 39:1-31), then the tabernacle and its court
    # (37), the ark, table, candlestick and altars (38), the metals and the finished work (39).
    ("EXO", 36, "8", 39, 1), ("EXO", 36, "9-38", 39, 2),
    ("EXO", 37, "1-2", 36, 8), ("EXO", 37, "3-6", 36, 35), ("EXO", 37, "7-21", 38, 9),
    ("EXO", 38, "1-3", 37, 1), ("EXO", 38, "4", 37, 5), ("EXO", 38, "5-9", 37, 6), ("EXO", 38, "10", 37, 13),
    ("EXO", 38, "11-12", 37, 15), ("EXO", 38, "13-16", 37, 17), ("EXO", 38, "17", 37, 23),
    ("EXO", 38, "18,19,20", 36, 34),  # the posts gilded, and rings and chapiters the Hebrew hasn't
    ("EXO", 38, "21", 38, 20), ("EXO", 38, "22", 38, 1), ("EXO", 38, "23", 38, 3), ("EXO", 38, "24", 38, 4),
    ("EXO", 38, "25", 37, 29), ("EXO", 38, "26,27", 38, 8),  # the laver, and what it was for
    ("EXO", 39, "1-4", 38, 24), ("EXO", 39, "5", 38, 27), ("EXO", 39, "6-9", 38, 28), ("EXO", 39, "10", 38, 30),
    ("EXO", 39, "11", 39, 32), ("EXO", 39, "12,13", 39, 1),  # the gold and the blue that were left
    ("EXO", 39, "14", 39, 33), ("EXO", 39, "15", 39, 35), ("EXO", 39, "16", 39, 38), ("EXO", 39, "17", 39, 37),
    ("EXO", 39, "18", 39, 36), ("EXO", 39, "19", 39, 41), ("EXO", 39, "20", 39, 40), ("EXO", 39, "21", 39, 34),
    ("EXO", 39, "22-23", 39, 42),
    # Numbers: the ark's setting out before the cloud; the stations to Pisgah in one verse; the tribes counted in
    # another order (Judah, Issachar and Zebulun before Gad, Asher before Manasseh); the daughters' plea in one verse.
    ("NUM", 10, "34-35", 10, 35), ("NUM", 10, "36", 10, 34),
    ("NUM", 21, "20-21", 21, 21), ("NUM", 21, "22", 21, 22),
    ("NUM", 26, "15-18", 26, 19), ("NUM", 26, "19-21", 26, 23), ("NUM", 26, "22-23", 26, 26), ("NUM", 26, "24-27", 26, 15),
    ("NUM", 26, "28-31", 26, 44), ("NUM", 26, "32-38", 26, 28), ("NUM", 26, "39-41", 26, 35), ("NUM", 26, "42-45", 26, 38),
    ("NUM", 26, "46-47", 26, 42),
    ("NUM", 27, "4-7", 27, 5), ("NUM", 27, "8", 27, 8),
    # Joshua's people serving the Lord before his death and burial, and the knives buried with him.
    ("JOS", 24, "29", 24, 31), ("JOS", 24, "30-31", 24, 29), ("JOS", 24, "31a", 24, 30),
    # 3 Kingdoms 6:1a-d: the foundation stones (the KJV's 5:17-18) and the years of the building (6:37-38).
    ("1KI", 6, "1a", 5, 17), ("1KI", 6, "1b", 5, 18), ("1KI", 6, "1c", 6, 37), ("1KI", 6, "1d", 6, 38),
    # 3 Kingdoms 7: Hiram and the temple's furnishings (the KJV's 7:13-51) before Solomon's house (7:1-12).
    ("1KI", 7, "1-2", 7, 13), ("1KI", 7, "3-6", 7, 15), ("1KI", 7, "7", 7, 21), ("1KI", 7, "8", 7, 19),
    ("1KI", 7, "9", 7, 20), ("1KI", 7, "10-11", 7, 23), ("1KI", 7, "12", 7, 26), ("1KI", 7, "13", 7, 25), ("1KI", 7, "14-17", 7, 27),
    ("1KI", 7, "18-31", 7, 32), ("1KI", 7, "32", 7, 47), ("1KI", 7, "33", 7, 46), ("1KI", 7, "34-37", 7, 48),
    ("1KI", 7, "38-49", 7, 1), ("1KI", 7, "50", 7, 1),  # "and Solomon finished all his house", the end of the KJV's 7:1
    # The good wife's household (the KJV's 31:27) before her mouth opened in wisdom (31:26).
    ("PRO", 31, "26", 31, 27), ("PRO", 31, "27", 31, 26),
    # Ezekiel 7: "the end is come" (the KJV's 7:6-9) before "now is the end come upon thee" (7:3-5).
    ("EZK", 7, "3-6", 7, 6), ("EZK", 7, "7-9", 7, 3),
]


def places():
    """PLACES as {(book code, chapter, verse label): (e-Sword book, chapter, verse)}."""
    out = {}
    for code, c, labels, kc, kv in PLACES:
        if "-" in labels:
            a, b = map(int, labels.split("-"))
            pairs = [(str(n), kv + n - a) for n in range(a, b + 1)]
        else:
            pairs = [(x, kv) for x in labels.split(",")]
        for label, v in pairs:
            assert (code, c, label) not in out, f"PLACES: {code} {c}:{label} twice"
            out[(code, c, label)] = (CANON.index(code) + 1, kc, v)
    return out


# Where the Septuagint orders or numbers a passage so differently that no table moves it and the passage is too long
# to place by hand, its verses are placed by their words: Brenton's English matched with the KJV's (Leviticus 8) or
# with the RV's Apocrypha (Sirach 30-36, where the Greek has two sections the other way round; Esther's additions,
# at Esther 10:4-16:24, as the Vulgate and the RV number them). The Greek numbers its verses as the English does, so
# the same places serve it.
ALIGN = [("LEV", range(8, 9), "kjv.bbli", 3, range(8, 9)),
         ("SIR", range(30, 37), "rv.bbli", 70, range(30, 37)), ("ESG", range(1, 11), "rv.bbli", 17, range(1, 17))]
STOP = set("the and of to in that he his him they them a for i is be it unto with was shall all not which their thou "
           "thee thy ye you your my me we our upon by from as but this were are so have had an at on or who".split())


def words(t):
    return {w for w in re.findall(r"[a-z]+", re.sub(r"<[^>]+>", " ", t).lower()) if w not in STOP and len(w) > 2}


@lru_cache(maxsize=1)
def aligned():
    """{(book code, chapter, verse label): (e-Sword book, chapter, verse)} for the passages in ALIGN: each Brenton
    verse at the reference verse whose words it shares most (cosine of their words, 0.3 at least), the best
    matches placed first, one Brenton verse to a reference verse. A verse left unmatched is placed as before."""
    eng, _ = usfm(ENG)
    out = {}
    for code, chs, ref_file, book, ref_chs in ALIGN:
        path = BUNDLED / ref_file if (BUNDLED / ref_file).is_file() else find(ref_file)  # the built-in RV has the Apocrypha; e-Sword's hasn't
        db = sqlite3.connect(f"file:{path}?immutable=1", uri=True)
        ref = {(c, v): words(t) for c, v, t in db.execute("SELECT Chapter, Verse, Scripture FROM Bible WHERE Book=?", (book,)) if c in ref_chs}
        db.close()
        src = [(c, label, words(t)) for c, label, t in eng.get(code, []) if c in chs]
        scores = sorted(((len(w & rw) / math.sqrt(len(w) * len(rw)), i, k) for i, (_, _, w) in enumerate(src) if w
                         for k, rw in ref.items() if rw and w & rw), reverse=True)
        got, taken = {}, set()
        for score, i, k in scores:
            if score >= 0.3 and i not in got and k not in taken:
                got[i] = k
                taken.add(k)
        out |= {(code, src[i][0], src[i][1]): (book, *k) for i, k in got.items()}
    return out


def fill_gaps(vs):
    """Lettered verses that fill a gap in the numbering take its numbers: Tobit 4:7a-7l, then 19, are 4:8-18."""
    out, k = list(vs), 0
    while k < len(out):
        c, label, _ = out[k]
        run = k + 1
        while run < len(out) and out[run][0] == c and re.fullmatch(rf"{re.escape(label)}[a-z]", out[run][1]):
            run += 1
        if label.isdigit() and run > k + 1 and run < len(out) and out[run][0] == c and out[run][1].isdigit() \
                and int(out[run][1]) - int(label) - 1 == run - k - 1:
            for j in range(k + 1, run):
                out[j] = (c, str(int(label) + j - k), out[j][2])
        k = run
    return out


def clean(body):
    """A verse's USFM as plain text: notes and cross-references out, paragraph and heading markers
    (\\p \\q \\nb \\m \\d \\s1 \\is1 and the like, with a heading's words) out, character markers
    reduced to their text."""
    s = re.sub(r"\\f .*?\\f\*|\\x .*?\\x\*", "", body, flags=re.S)
    s = re.sub(r"\\(?:s\d?|is\d?|mt\d?|ms\d?|h|toc\d?|ip|id|rem)\b[^\n]*", "", s)  # a heading's own line
    s = re.sub(r"\\\+?[a-z0-9]+\*", "", s)  # a character marker's end
    s = re.sub(r"\\\+?[a-z0-9]+\s?", "", s)  # a marker's start
    return re.sub(r"\s+", " ", s).strip()


def expand(left, right):
    """A line of a .vrs file, "EXO 8:1-4 = EXO 7:26-29" or "JER 25:20 = JER 49:34", as verse pairs."""
    lb, lc, lv = left.split()[0], *map(int, re.match(r"(\d+):(\d+)", left.split()[1]).groups())
    rb, rc, rv = right.split()[0], *map(int, re.match(r"(\d+):(\d+)", right.split()[1]).groups())
    le = re.search(r"-(\d+)$", left.split()[1])
    re_ = re.search(r"-(\d+)$", right.split()[1])
    n = (int(le.group(1)) - lv + 1) if le else 1
    m = (int(re_.group(1)) - rv + 1) if re_ else 1
    # One verse for several ("PSA 51:0 = PSA 51:1-2", a two-verse title) maps each of them to it.
    return [((lb, lc, lv + min(k, n - 1)), (rb, rc, rv + min(k, m - 1))) for k in range(max(n, m, 1))]


def versification(name):
    """A .vrs file's mappings as (this versification's verse, the original's) pairs, in the file's
    order, and its chapter lengths {(book, chapter): verses}."""
    maps, lengths = [], {}
    for line in get(VRS.format(name), f"{name}.vrs").decode("utf-8", "replace").splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        if "=" in line:
            left, right = (x.strip() for x in line.split("="))
            if not re.match(r"[A-Z0-9]{3} \d+:\d+", left) or not re.match(r"[A-Z0-9]{3} \d+:\d+", right):
                continue
            maps += expand(left, right)
        elif re.match(r"[A-Z0-9]{3} \d+:\d+", line):
            b, *cs = line.split()
            for x in cs:
                if re.fullmatch(r"\d+:\d+", x):
                    c, v = map(int, x.split(":"))
                    lengths[(b, c)] = v
    return maps, lengths


@lru_cache(maxsize=1)
def kjv_lengths():
    return chapter_lengths("kjv.bbli")


GREEK_LETTERS = "abcdefghiklmnopqrstuvwxyz"


def proverbs(c, label):
    """eBible's order of Proverbs 24–31 as the Hebrew verse it is, or None."""
    base, seg = re.fullmatch(r"(\d+)([a-z]*)", label).groups()
    base = int(base)
    if c == 24 and base == 22 and seg:
        k = GREEK_LETTERS.index(seg)  # 22a–e are the Septuagint's own, after 24:22; 22f–t the Hebrew 30:1–14
        return ("PRO", 24, 22) if k < 5 else ("PRO", 30, k - 4)
    if c == 24 and 35 <= base <= 53:
        return ("PRO", 30, base - 20)
    if c == 24 and 54 <= base <= 62:
        return ("PRO", 31, base - 53)
    return None


def build(url=USFM):
    books, about = usfm(url)
    if "NEH" in books:  # Nehemiah twice (the English): its own book, not 2 Esdras 11-23
        books["EZR"] = [x for x in books["EZR"] if x[0] <= 10]
    books = {code: fill_gaps(vs) for code, vs in books.items()}
    # Proverbs 24:22f ends the Septuagint's own verses ("…and repent.]") and begins Agur's words (the KJV's 30:1):
    # the first part goes with 24:22e
    pro = books.get("PRO", [])
    for i, (c, label, text) in enumerate(pro):
        if (c, label) == (24, "22f") and "] " in text and pro[i - 1][:2] == (24, "22e"):
            head, rest = text.split("] ", 1)
            pro[i - 1] = (24, "22e", f"{pro[i - 1][2]} {head}]")
            pro[i] = (c, label, rest)
    placed_by_words, by_hand = aligned(), places()
    lxx, to_eng = {}, {}
    for a, b in versification("lxx")[0]:
        lxx.setdefault(a, b)  # the first for a verse wins
    for e, o in versification("eng")[0]:
        to_eng.setdefault(o, e)  # every original verse, even two for one ("PSA 51:0 = PSA 51:1", "= PSA 51:2")
    _, org_len = versification("org")
    kjv = kjv_lengths()

    # Greek chapter lengths, to find a chapter eBible already numbers as the KJV does.
    glen = {}
    for code, vs in books.items():
        for c, label, _ in vs:
            n = int(re.match(r"\d+", label).group())
            glen[(code, c)] = max(glen.get((code, c), 0), n)

    def target(code, c, label):
        """Where a Greek verse goes: (e-Sword book, chapter, verse, how it was placed)."""
        if (code, c, label) in by_hand:
            return *by_hand[(code, c, label)], "rule"
        if (code, c, label) in placed_by_words:
            return *placed_by_words[(code, c, label)], "aligned"
        base = int(re.match(r"\d+", label).group())
        if code == "SUS":
            return 27, 13, base, "own"
        if code == "BEL":
            return 27, 14, base, "own"
        if code == "LJE":
            return 71, 6, base, "own"
        if code in APOCRYPHA:
            return APOCRYPHA[code], c, base, "own"
        o = proverbs(c, label) if code == "PRO" else None
        if code == "MAL" and c == 3 and base in (22, 23, 24):
            o = ("MAL", 3, {22: 23, 23: 24, 24: 22}[base])  # Elijah (the Hebrew 3:23–24) before "Remember the law of Moses" (3:22)
        if code == "NEH":  # the English's Nehemiah, beside 2 Esdras 11-23 (left out), is numbered as the KJV
            return 16, c, base, "own"
        if code == "EZR" and c == 17 and base >= 69:
            # 2 Esdras 17 (Nehemiah 7) has no verse 68, as the KJV's numbering hasn't: from 69 the numbers are the KJV's,
            # where the table moves the Hebrew's 7:68-72 to 7:69-73
            return 16, 7, base, "own"
        if code == "1KI" and c in (20, 21):
            o = ("1KI", 41 - c, base)  # 3 Kingdoms 20 is Naboth's vineyard (the KJV's 21), 21 the siege of Samaria (20)
        how = "rule" if o else None
        if not o:
            o = lxx.get((code, c, base))
            how = "table" if o else None
        if not o:
            b = {"ESG": "EST", "DAG": "DAN"}.get(code, code)
            o = (b, c, base)
            how = "same"
        b, oc, ov = o
        if b not in CANON:
            return 19, 151, base, "own"  # Psalm 151, which the table calls a book of its own (PS2)
        book = CANON.index(b) + 1
        # A chapter eBible numbers as the KJV does (Deuteronomy 28–29) stays as it is.
        if how == "same" and glen.get((code, c)) == kjv.get((book, c)) != org_len.get((b, c)):
            return book, c, base, "kjv"
        e = to_eng.get((b, oc, ov))
        if e:
            eb, ec, ev = e
            return CANON.index(eb) + 1, ec, ev, how
        return book, oc, ov, how

    # Verses that a table or rule puts somewhere: a verse left as it is may not take their places
    # (Daniel 3:24–30 are the Greek 3:91–97).
    placed = []
    claimed = set()
    for code, vs in books.items():
        for c, label, text in vs:
            b, ch, v, how = target(code, c, label)
            placed.append((code, c, label, text, b, ch, v, how))
            if how in ("table", "rule", "aligned") and not re.search(r"[a-z]", label) or how == "aligned":
                claimed.add((b, ch, v))

    out, order, joined, notes = {}, [], 0, []
    last = None
    for code, c, label, text, b, ch, v, how in placed:
        if v == 0:
            v = 1  # a Psalm's title opens verse 1
        key = (b, ch, v)
        extra = bool(re.search(r"[a-z]", label)) and how not in ("rule", "aligned")  # a lettered verse a rule places isn't an addition
        homeless = b <= 39 and how not in ("own", "aligned") and key not in kjv_verses()  # Esther 10:4-16:24 are the additions' own
        if (extra or homeless or (how == "same" and key in claimed)) and last and last[0] == b:
            key = last  # joined to the verse before it
            joined += 1
            if homeless and not extra:
                notes.append(f"{code} {c}:{label} -> joined to {key[0]}:{key[1]}:{key[2]}")
        if key not in out:
            out[key] = []
            order.append(key)
        out[key].append(text)
        last = key
    rows = [(b, c, v, joined_text(out[(b, c, v)])) for b, c, v in sorted(out)]
    return rows, about, joined, notes


def joined_text(parts):
    """The verses joined into one, a verse that follows a full stop with a capital ("…thirteen years. And Solomon")."""
    out = ""
    for t in (t for t in parts if t):
        if re.search(r"[.!?][\]\)'’\"”]*$", out):
            t = re.sub(r"^([^\w]*)(\w)", lambda m: m[1] + m[2].upper(), t, count=1)
        out = f"{out} {t}" if out else t
    return out


@lru_cache(maxsize=1)
def kjv_verses():
    return frozenset((b, c, v) for (b, c), n in kjv_lengths().items() for v in range(1, n + 1))


def main(into=None):
    """Writes lxx_brenton.bbli to the app's modules folder, or to `into`."""
    if not find("kjv.bbli").exists():
        sys.exit(f"no kjv.bbli in {LIBRARY}, e-Sword X's library or the app")
    rows, about, joined, notes = build()
    have = {(b, c, v) for b, c, v, _ in rows}
    missing = sorted(k for k in kjv_verses() if k[0] <= 39 and k not in have)
    print(f"{len(rows)} verses; {joined} Greek verses joined to the verse before them")
    print(f"  canon: {sum(1 for r in rows if r[0] <= 39)} of the KJV's {sum(1 for k in kjv_verses() if k[0] <= 39)} Old Testament verses; apocrypha: {sum(1 for r in rows if r[0] > 39)}")
    if missing:
        by = {}
        for b, c, v in missing:
            by.setdefault((b, c), []).append(v)
        print(f"  KJV verses with no Greek: {len(missing)}: " + "; ".join(f"{CANON[b - 1]} {c}:{','.join(map(str, vs[:8]))}{'…' if len(vs) > 8 else ''}" for (b, c), vs in list(by.items())[:40]))
    # Greek verses with no KJV verse, in runs: "DAG 3:24–90 -> 27:3:23".
    runs = []
    for n in notes:
        m = re.match(r"(\S+) (\d+):(\d+) -> joined to (\S+)", n)
        code, c, v, to = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
        if runs and runs[-1][0] == code and runs[-1][1] == c and runs[-1][3] == v - 1 and runs[-1][4] == to:
            runs[-1][3] = v
        else:
            runs.append([code, c, v, v, to])
    if runs:
        print("  Greek verses with no KJV verse, joined to the one before: " + "; ".join(f"{a} {c}:{v}{'–' + str(w) if w != v else ''} → {t}" for a, c, v, w, t in runs))

    dated = re.search(r"source files dated ([^<\n]+)", about)
    info = ("<p>The Greek Septuagint with Apocrypha, compiled by Sir Lancelot C. L. Brenton (1844), from eBible.org's "
            "grcbrent: public domain. Brenton printed the Vatican text as Valpy's edition had it, which is the Sixtine "
            "edition's (Rome, 1587), the Septuagint the KJV's translators had.</p><p>The verses are moved to the KJV's "
            "numbering with SIL's versification tables (lxx.vrs, eng.vrs), and where the Septuagint orders a passage otherwise "
            "(Exodus 36–39, Numbers 26, 1 Kings 7, Sirach 30–36 and others) each verse is at the verse it is; a Psalm's "
            "title opens its verse 1, and the Septuagint's added verses and Daniel 3's are joined to the verse before them. "
            "The additions to Esther are Esther 10:4–16:24, as in the Vulgate and the Revised Version; Susanna and Bel are Daniel 13–14, the Letter of "
            "Jeremiah Baruch 6. Built by Two-edged Sword's tools/lxx.</p>"
            + (f"<p>eBible.org's text of {html.escape(dated.group(1).strip())}.</p>" if dated else ""))
    with module("lxx_brenton.bbli", "Septuagint (Greek, Brenton 1844)", "LXX-Brenton", info, nt=False, apocrypha=True, into=into) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    print(f"lxx_brenton.bbli: {len(rows)} verses")


if __name__ == "__main__":
    main()
