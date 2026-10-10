# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds lxx_brenton.bbli ("Septuagint (Greek, Brenton 1844)"): the Greek Old Testament with the
Apocrypha as Sir Lancelot Brenton printed it, the stand-in in the library for the Sixtine
Septuagint of 1587 that the KJV's translators used.

    python3 tools/lxx/build.py

Writes to the app's modules folder, where the app finds it after Library → Rescan.

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
with Elijah before "Remember the law of Moses", the KJV's 4:4; its
Proverbs has the Hebrew 30:1–14 as 24:22a–t (spread over the KJV's fourteen verses in order),
30:15–33 and 31:1–9 as 24:35–62, and no chapter 30; and in a chapter eBible already numbers as the
KJV does (Deuteronomy 28–29), the verses keep their numbers.

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
import html, io, re, sys, zipfile
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from books import USFM as BOOK_CODES  # noqa: E402
from modules import CACHES, LIBRARY, chapter_lengths, fetch, find, module  # noqa: E402
CACHE = CACHES / "lxx"
USFM = "https://ebible.org/Scriptures/grcbrent_usfm.zip"
VRS = "https://raw.githubusercontent.com/sillsdev/libpalaso/0e913f4b4ee64c9d42b1891254513b83dbb4906c/SIL.Scripture/Resources/{}.vrs.txt"

# The canon's Paratext codes in e-Sword's order (1–39).
CANON = BOOK_CODES[:39]
# The Apocrypha as e-Sword (and the library's Brenton, Latin and Douay-Rheims) numbers them.
APOCRYPHA = {"TOB": 67, "JDT": 68, "WIS": 69, "SIR": 70, "BAR": 71, "1MA": 72, "2MA": 73, "1ES": 74, "3MA": 76, "4MA": 77, "MAN": 78}


def get(url, name):
    return fetch(url, CACHE / name, timeout=300).read_bytes()


def usfm():
    """{book code: [(chapter, verse label, text)]} in the files' order, and the copyright page."""
    z = zipfile.ZipFile(io.BytesIO(get(USFM, "grcbrent_usfm.zip")))
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
        k = GREEK_LETTERS.index(seg)  # 22a–22t: 19 pieces of the Hebrew 30:1–14
        return ("PRO", 30, 1 + k * 14 // 19)
    if c == 24 and 35 <= base <= 53:
        return ("PRO", 30, base - 20)
    if c == 24 and 54 <= base <= 62:
        return ("PRO", 31, base - 53)
    return None


def build():
    books, about = usfm()
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
            if how in ("table", "rule") and not re.search(r"[a-z]", label):
                claimed.add((b, ch, v))

    out, order, joined, notes = {}, [], 0, []
    last = None
    for code, c, label, text, b, ch, v, how in placed:
        if v == 0:
            v = 1  # a Psalm's title opens verse 1
        key = (b, ch, v)
        extra = bool(re.search(r"[a-z]", label)) and how != "rule"  # a lettered verse a rule places isn't an addition
        homeless = b <= 39 and how != "own" and key not in kjv_verses()
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
    rows = [(b, c, v, " ".join(t for t in out[(b, c, v)] if t)) for b, c, v in sorted(out)]
    return rows, about, joined, notes


@lru_cache(maxsize=1)
def kjv_verses():
    return frozenset((b, c, v) for (b, c), n in kjv_lengths().items() for v in range(1, n + 1))


def main():
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
            "numbering with SIL's versification tables (lxx.vrs, eng.vrs); what the KJV has no verse for (Psalm titles, "
            "the Septuagint's added verses, the Greek additions to Esther and Daniel 3) is joined to the verse before it. "
            "Susanna and Bel are Daniel 13–14, the Letter of Jeremiah Baruch 6. Built by Two-edged Sword's tools/lxx.</p>"
            + (f"<p>eBible.org's text of {html.escape(dated.group(1).strip())}.</p>" if dated else ""))
    with module("lxx_brenton.bbli", "Septuagint (Greek, Brenton 1844)", "LXX-Brenton", info, nt=False, apocrypha=True) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    print(f"lxx_brenton.bbli: {len(rows)} verses")


if __name__ == "__main__":
    main()
