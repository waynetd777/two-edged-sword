# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds the modules built into the app, so it works with nothing else installed: the KJV, the
KJV with Strong's numbers, Strong's Hebrew and Greek dictionaries, a King James concordance, the
Treasury of Scripture Knowledge, Matthew Henry's commentary and Easton's Bible Dictionary.

    python3 tools/core/build.py [--if-missing] [--only henry easton]

Writes kjv.bbli, kjv+.bbli, strong.lexi, kjc.lexi, tsk.cmti, henry.cmti and easton.dcti to
src-tauri/modules/, which the app bundle carries in Contents/Resources/modules/ (and a debug build
reads in place). With --if-missing, does nothing when all are there (the release build runs it that
way); --only builds just the ones named (after the KJV, which they check references against). The ids
are the ones the app looks for first, so Word Study, the glosses and the cross-references find them,
and e-Sword's henry.cmti and easton.dcti, where there are, take the place of these.

Every source is public domain, and none is e-Sword's (its licence forbids passing its modules on):
  eBible.org's eng-kjv2006, https://ebible.org/Scriptures/eng-kjv2006_usfm.zip: the 1769 KJV with
    Strong's numbers (CrossWire's KJV, in USFM). The words of Christ (\\wj) become <red>, the
    translators' supplied words (\\add) <i>, psalm titles (\\d) <b> at the start of verse 1.
    The translators' marginal notes and the ¶ marks are left out, as in e-Sword's KJV.
  Strong's Greek dictionary, Ulrik Petersen's XML 1.4 ("Public Domain -- Copy Freely"), and
    Strong's Hebrew dictionary, David Troidl's and David Instone-Brewer's XML (public domain),
    both from https://github.com/openscriptures/strongs. Only Strong's own text is used: the
    Hebrew file's outline definitions and TWOT numbers are left out.
  The Treasury of Scripture Knowledge, CrossWire's TSK 1.5 (public domain), as the IMP export in
    https://github.com/man4christ/Treasury-of-Scripture-Knowledge (data/tsk.imp.gz).
  Matthew Henry's Complete Commentary (CrossWire's MHC 2.2, a zCom4 module) and Easton's Bible
    Dictionary (CrossWire's Easton 2.0.1, a zLD module), both public domain, from the Christian
    Classics Ethereal Library, https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/.
    Their references are checked against the KJV's verses and repaired where CCEL's are wrong,
    and misspellings found by comparing with e-Sword's copies are corrected (EASTON_TYPOS).
The concordance and the dictionaries' occurrence counts are counted from the KJV's Strong's numbers.

The GitHub files are taken at a fixed commit and checked against their sha256, so a rebuild makes
the same modules; eBible.org's and CrossWire's zips have no fixed version to take, so they aren't.

Downloads are cached in ~/Library/Caches/Two-edged Sword/core.
"""
import gzip, html as html_, io, re, struct, sys, zipfile, zlib
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path


class html:
    """html.escape without quotes: the text goes in elements, never attributes."""
    escape = staticmethod(lambda s: html_.escape(s, quote=False))

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from books import BOOKS  # noqa: E402
from modules import BUNDLED, CACHES, chapter_lengths, fetch as fetch_to, module  # noqa: E402

CACHE = CACHES / "core"
KJV_URL = "https://ebible.org/Scriptures/eng-kjv2006_usfm.zip"
STRONGS = "https://raw.githubusercontent.com/openscriptures/strongs/0acd2f251c2d35ff8db2dece4e0593979d3ac223/"
GREEK_URL = STRONGS + "greek/StrongsGreekDictionaryXML_1.4.zip"
HEBREW_URL = STRONGS + "hebrew/StrongHebrewG.xml"
TSK_URL = "https://raw.githubusercontent.com/man4christ/Treasury-of-Scripture-Knowledge/ea69f732e1b680db08a8a2c47009ff52d2f077cd/data/tsk.imp.gz"
CROSSWIRE = "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/{}.zip"
SHA256 = {GREEK_URL: "fe91d26bf97d9c6d5ccf4384a580543a2dea46ee4383ccd984c612ab78439d1e",
          HEBREW_URL: "1f9659ea208f4c498843a0280dacb1448627c33ca77712642d8705793ab66061",
          TSK_URL: "cd8250ee59901ebc6cc3bc13ef4310a80850f77cbb2fe4e99370cbaa9d9c15a2"}
FILES = ["kjv.bbli", "kjv+.bbli", "strong.lexi", "kjc.lexi", "tsk.cmti", "henry.cmti", "easton.dcti"]

USFM = {b[0]: i + 1 for i, b in enumerate(BOOKS)}
ABBR = {b[1]: b[2] for b in BOOKS} | {"1Macc": "1Ma", "2Macc": "2Ma"}
SWORD = {b[3].replace("_", " "): i + 1 for i, b in enumerate(BOOKS)}
BOOK_ABBR = [b[2] for b in BOOKS]


def fetch(url):
    return fetch_to(url, CACHE / url.rsplit("/", 1)[1], sha256=SHA256.get(url), log=True, timeout=300).read_bytes()


def num(n):
    """"G0025" or "25" (with a language) → "G25"."""
    m = re.match(r"([GH])?0*(\d+)([a-z]?)$", n.strip())
    return f"{m[1] or ''}{m[2]}" if m else n


# ---- the KJV --------------------------------------------------------------------------------

def kjv():
    """{(book, chapter, verse): (plain, tagged)} and [(book, chapter, verse, rendering, number)]."""
    verses, words = {}, []
    z = zipfile.ZipFile(io.BytesIO(fetch(KJV_URL)))
    for name in sorted(z.namelist()):
        if not name.endswith(".usfm"):
            continue
        text = z.read(name).decode("utf-8-sig")
        book = USFM.get(re.search(r"\\id (\w+)", text)[1])
        if not book:
            continue
        chapter, title, heading = 0, "", ""
        # One marker and what follows it up to the next paragraph-level marker.
        for m in re.finditer(r"\\(c|v|d|s1|s2|mt1|mt2|toc\d|h|id|p|q\d?|b|m|pi\d?|li\d?|nb)\b ?(.*?)(?=\\(?:c|v|d|s1|s2|mt\d|toc\d|h|id|p|q\d?|b|m|pi\d?|li\d?|nb)\b(?![a-z*])|\Z)", text, re.S):
            tag, body = m[1], m[2]
            if tag == "c":
                subscription(verses, book, chapter, heading)
                chapter, title, heading = int(body.split()[0]), "", ""
            elif tag == "d":
                title = inline(body)
            elif tag == "s1":
                # Psalm 119's letters, and the epistles' subscriptions after their last verse.
                heading = re.sub(r"[\u0590-\u05ff]", "", inline(body)[0]).strip()
            elif tag == "v":
                vn, _, rest = body.strip().partition(" ")
                v = int(re.match(r"\d+", vn)[0])
                plain, tagged = inline(rest)
                if title:
                    plain, tagged = f"<b>{title[0]}</b> {plain}", f"<b>{title[1]}</b> {tagged}"
                    title = ""
                if heading:
                    plain, tagged, heading = f"{heading} {plain}", f"{heading} {tagged}", ""
                key = (book, chapter, v)
                if key in verses:  # a verse carried on after a paragraph marker
                    p0, t0 = verses[key]
                    plain, tagged = f"{p0} {plain}", f"{t0} {tagged}"
                verses[key] = (plain, tagged)
                for w, n in re.findall(r"\\\+?w ([^|\\]+)\|strong=\"([^\"]+)\"", rest):
                    words.append((book, chapter, v, w, num(n)))
            elif tag in ("p", "q", "q1", "q2", "m", "pi", "nb", "li", "li1", "b") and body.strip() and chapter:
                # Text after a paragraph marker belongs to the verse before it.
                last = max((k for k in verses if k[:2] == (book, chapter)), default=None)
                if last:
                    p0, t0 = verses[last]
                    p1, t1 = inline(body)
                    verses[last] = (f"{p0} {p1}", f"{t0} {t1}")
                    for w, n in re.findall(r"\\\+?w ([^|\\]+)\|strong=\"([^\"]+)\"", body):
                        words.append((*last, w, num(n)))
        subscription(verses, book, chapter, heading)
    return verses, words


def subscription(verses, book, chapter, heading):
    """A heading left over at a chapter's end is an epistle's subscription: after the last verse, as e-Sword's KJV has it."""
    last = max((k for k in verses if k[:2] == (book, chapter)), default=None)
    if heading and last:
        p0, t0 = verses[last]
        verses[last] = (f"{p0} <blu>{heading}</blu>", f"{t0} <blu>{heading}</blu>")


SPLIT = {"can": ("not",), "what": ("soever",), "where": ("unto", "in")}


def join_split(m):
    """"can not" → "cannot" (with Strong's numbers, "can<num>G1410</num> not<num>G3756</num>" → "cannot<num>G1410</num><num>G3756</num>")."""
    first, nums, second = m[1], m[2], m[3]
    return f"{first}{second}{nums}" if second in SPLIT[first.lower()] else m[0]


def inline(s):
    """USFM character markup → e-Sword markup, without Strong's numbers and with them."""
    s = re.sub(r"\\f .*?\\f\*", "", s, flags=re.S)  # the translators' notes
    s = re.sub(r"\\x .*?\\x\*", "", s, flags=re.S)
    s = s.replace("¶", "")

    def conv(tagged):
        t = s
        if tagged:
            t = re.sub(r"\\\+?w ([^|\\]+)\|strong=\"([^\"]+)\"\\\+?w\*", lambda m: f"{m[1]}<num>{num(m[2])}</num>", t)
        t = re.sub(r"\\\+?w ([^|\\]+)\|[^\\]*\\\+?w\*", r"\1", t)
        t = re.sub(r"\\\+?wj\s*", "<red>", t).replace("<red>*", "</red>")
        t = re.sub(r"\\\+?wj\*", "</red>", t)
        t = re.sub(r"\\\+?add ", "<i>", t)
        t = re.sub(r"\\\+?add\*", "</i>", t)
        # An opening marker's one space is part of the marker; a closing marker (\nd*) has none, and
        # the space after it is the text's ("\nd LORD\nd* is": "LORD is").
        t = re.sub(r"\\\+?(nd|tl|sc|bk|qs|k|pn|em|it|bd|no)\*", "", t)
        t = re.sub(r"\\\+?(nd|tl|sc|bk|qs|k|pn|em|it|bd|no)(?: |(?=\\)|$)", "", t)
        t = re.sub(r"\\[^\s\\*]+\*", "", t)  # anything else left: closing markers,
        t = re.sub(r"\\[^\s\\]+ ?", "", t)    # then opening ones
        # e-Sword's spellings, so a search for "Caesar" or "God's" finds them.
        t = t.replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe").replace("’", "'")
        t = re.sub(r"\s+", " ", t).strip()
        t = re.sub(r"\s+([,.;:?!)])", r"\1", t).replace("<red> ", " <red>").replace(" </red>", "</red> ")
        t = re.sub(r"(</red>|</i>)\s+([,.;:?!)])", r"\1\2", t)
        # Words the source splits in a few verses where the 1769 text has one ("can not" in Acts 4:16):
        # cannot, whatsoever, whereunto, wherein; but "every where in" (1 Cor 4:17) is two.
        t = re.sub(r"(?<!every )\b([Cc]an|[Ww]hat|[Ww]here)((?:<num>[^<]*</num>)*) (not|soever|unto|in)\b", join_split, t)
        return t.strip()

    return conv(False), conv(True)


def write_kjv(verses):
    rows = sorted(verses.items())
    info = ("<p>The 1769 King James Version of the Holy Bible (the Authorized Version), with the words of Christ in red.</p>"
            "<p>Public domain (outside the United Kingdom, where the Crown's patent applies). From eBible.org's eng-kjv2006, "
            "courtesy of the CrossWire Bible Society and eBible.org. Built by Two-edged Sword's tools/core.</p>")
    with module("kjv.bbli", "King James Version", "KJV", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", [(b, c, v, p) for (b, c, v), (p, _) in rows])
    info_plus = ("<p>The 1769 King James Version of the Holy Bible (the Authorized Version), with the words of Christ in red "
                 "and Strong's numbers for looking up the Hebrew or Greek behind each word.</p>"
                 "<p>Public domain (outside the United Kingdom, where the Crown's patent applies). Text and Strong's numbers "
                 "from eBible.org's eng-kjv2006, courtesy of the CrossWire Bible Society and eBible.org. "
                 "Built by Two-edged Sword's tools/core.</p>")
    with module("kjv+.bbli", "King James Version w/ Strong's Numbers", "KJV+", info_plus, strongs=True, into=BUNDLED) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", [(b, c, v, t) for (b, c, v), (_, t) in rows])
    print(f"kjv.bbli, kjv+.bbli: {len(rows)} verses")


# ---- Strong's -----------------------------------------------------------------------------

def greek_text(el, lang="G"):
    """An element's text with its markup as e-Sword's."""
    out = [html.escape(el.text or "")]
    for c in el:
        if c.tag == "greek":
            out.append(f"<grk>{html.escape(c.get('unicode', ''))}</grk> <lat>{html.escape(c.get('translit', ''))}</lat>")
        elif c.tag == "strongsref":
            out.append(f"<num>{'H' if c.get('language') == 'HEBREW' else 'G'}{num(c.get('strongs'))}</num>")
        elif c.tag == "pronunciation":
            out.append(f"<i>{html.escape(c.get('strongs', ''))}</i>")
        elif c.tag == "latin":
            out.append(f"<lat>{greek_text(c)}</lat>")
        elif c.tag not in ("see", "strongs"):
            out.append(greek_text(c))
        out.append(html.escape(c.tail or ""))
    return "".join(out)


def greek():
    z = zipfile.ZipFile(io.BytesIO(fetch(GREEK_URL)))
    root = ET.fromstring(z.read("strongsgreek.xml"))
    out = {}
    for e in root.iter("entry"):
        n = "G" + num(e.get("strongs"))
        g, pron = e.find("greek"), e.find("pronunciation")
        body = []
        tail_text = []
        for c in e:
            if c.tag in ("strongs_derivation", "strongs_def", "kjv_def"):
                body.append(greek_text(c).strip())
                if c.tail and c.tail.strip():
                    tail_text.append(html.escape(c.tail.strip()))
            elif c.tag == "strongsref" and body:
                tail_text.append(f"<num>{'H' if c.get('language') == 'HEBREW' else 'G'}{num(c.get('strongs'))}</num>")
                if c.tail and c.tail.strip():
                    tail_text.append(html.escape(c.tail.strip()))
        text = " ".join(x for x in body if x)
        text = re.sub(r"\s*:--\s*", " - ", text)
        text = re.sub(r"\s+", " ", (text + " " + " ".join(tail_text)).strip())
        text = re.sub(r"\s+([,.;:)])", r"\1", text)
        if not text:
            continue  # the numbers Strong left unused (3203–3302)
        out[n] = dict(word=f"<grk>{html.escape(g.get('unicode', '')) if g is not None else ''}</grk>",
                      translit=html.escape(g.get("translit", "")) if g is not None else "",
                      pron=html.escape(pron.get("strongs", "")) if pron is not None else "", text=text)
    return out


OSIS_NS = "{http://www.bibletechnologies.net/2003/OSIS/namespace}"


def hebrew_text(el):
    out = [html.escape(el.text or "")]
    for c in el:
        tag = c.tag.replace(OSIS_NS, "")
        if tag == "w":
            src = c.get("src")
            if src:
                out.append(f"<num>{'G' if src.startswith('G') else 'H'}{num(src.lstrip('GH'))}</num>")
            else:
                out.append(f"<heb>{html.escape(c.get('lemma', ''))}</heb> <lat>{html.escape(c.get('xlit', ''))}</lat>")
        elif tag == "hi":
            # Italic runs that touch are separate words ("<hi>governor</hi><hi>of a</hi>").
            if "".join(out).endswith("</i>"):
                out.append(" ")
            out.append(f"<i>{hebrew_text(c)}</i>")
        elif tag == "note":
            pass  # typo notes inside a note
        else:
            out.append(hebrew_text(c))
        out.append(html.escape(c.tail or ""))
    return "".join(out)


def hebrew():
    root = ET.fromstring(fetch(HEBREW_URL).decode("utf-8-sig"))
    out = {}
    for div in root.iter(OSIS_NS + "div"):
        if div.get("type") != "entry":
            continue
        w = div.find(OSIS_NS + "w")
        if w is None or not w.get("ID"):
            continue
        notes = {n.get("type"): hebrew_text(n).strip() for n in div.findall(OSIS_NS + "note")}
        parts = [notes.get("exegesis", ""), notes.get("explanation", "")]
        text = " ".join(p for p in parts if p)
        if notes.get("translation"):
            text += f": - {notes['translation']}"
        text = text.replace("[idiom]", "X").replace("[phrase]", "+")
        out[num(w.get("ID"))] = dict(word=f"<heb>{html.escape(w.get('lemma', ''))}</heb>", translit=html.escape(w.get("xlit", "")),
                                    pron=html.escape(w.get("POS", "")), text=re.sub(r"\s+", " ", text).strip())
    return out


def write_strong(entries, counts):
    info = ("<p>Strong's Hebrew and Greek dictionaries, from James Strong's Exhaustive Concordance of the Bible (1890).</p>"
            "<p>Public domain. The Greek is Ulrik Petersen's XML edition (1.4, 2007), the Hebrew David Troidl's and "
            "David Instone-Brewer's, both from the Open Scriptures project (github.com/openscriptures/strongs). "
            "The occurrences are counted in the KJV's Strong's numbers. Built by Two-edged Sword's tools/core.</p>"
            "<p>+ (addition) marks a rendering with other words; X (multiplication) a rendering from an idiom; "
            "( ) a word sometimes given with the main one; [ ] a word added.</p>")
    rows = []
    for n, e in entries.items():
        total = f"<p><b>Total KJV occurrences: {counts[n]}</b></p>" if counts.get(n) else ""
        rows.append((n, f"<p>{e['word']}</p><p><lat>{e['translit']}</lat></p><p><i>{e['pron']}</i></p><p>{e['text']}</p>{total}"))
    rows.sort(key=lambda r: (r[0][0], int(re.match(r"\d+", r[0][1:])[0])))
    with module("strong.lexi", "Strong's Hebrew and Greek Dictionaries", "Strong", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Lexicon VALUES (?,?)", rows)
    print(f"strong.lexi: {len(rows)} entries")


def write_kjc(entries, words):
    """For each Strong's number, how the KJV renders it, the commonest first, with where."""
    by = defaultdict(lambda: defaultdict(Counter))
    for b, c, v, w, n in words:
        r = re.sub(r"[^\w' -]", "", w.lower().replace("’", "'")).strip()
        r = re.sub(r"^(the|a|an) (?=\w)", "", r)
        if r:
            by[n][r][(b, c, v)] += 1
    rows = []
    for n, renderings in by.items():
        e = entries.get(n, {"word": "", "translit": ""})
        total = sum(sum(x.values()) for x in renderings.values())
        parts = [f"<p>{e['word']}</p><p><lat>{e['translit']}</lat></p><p><b>Total KJV Occurrences:</b> {total}</p>"]
        for r, where in sorted(renderings.items(), key=lambda x: (-sum(x[1].values()), x[0])):
            refs = ", ".join(f"<ref>{BOOK_ABBR[b - 1]} {c}:{v}</ref>" + (f" ({k})" if k > 1 else "") for (b, c, v), k in sorted(where.items()))
            parts.append(f"<p><b>{html.escape(r)}, {sum(where.values())}</b></p><p>{refs}</p>")
        rows.append((n, "".join(parts)))
    rows.sort(key=lambda r: (r[0][0], int(re.match(r"\d+", r[0][1:])[0])))
    info = ("<p>A King James concordance by Strong's number: every English word the KJV uses for each Hebrew and Greek word, "
            "how often, and where.</p><p>Counted from the Strong's numbers in eBible.org's eng-kjv2006 (public domain). "
            "Built by Two-edged Sword's tools/core.</p>")
    with module("kjc.lexi", "King James Concordance", "KJC", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Lexicon VALUES (?,?)", rows)
    print(f"kjc.lexi: {len(rows)} entries")


# ---- the Treasury of Scripture Knowledge ------------------------------------------------------

def ref(osis):
    """"John.1.1-John.1.3" → "Joh 1:1-3"; "Gen.1.1-Gen.2.3" → "Gen 1:1-2:3"; "Ps.23" → "Psa 23"."""
    a, _, b = osis.partition("-")
    pa = a.split(".")
    s = f"{ABBR.get(pa[0], pa[0])} {pa[1]}" + (f":{pa[2]}" if len(pa) > 2 else "")
    if b:
        pb = b.split(".")
        if pb[0] != pa[0]:
            s += f"-{ABBR.get(pb[0], pb[0])} {'.'.join(pb[1:]).replace('.', ':')}"
        elif len(pb) > 2 and pb[1] == pa[1]:
            s += f"-{pb[2]}"
        else:
            s += "-" + ":".join(pb[1:])
    return s


def tsk_html(s):
    s = re.sub(r'<reference osisRef="strong:([GH]\d+)">[^<]*</reference>', lambda m: f"<num>{num(m[1])}</num>", s)
    s = re.sub(r'<reference osisRef="([^"]+)">[^<]*</reference>', lambda m: f"<ref>{ref(m[1])}</ref>", s)
    s = s.replace('<lb type="x-begin-paragraph"/>', "<p>").replace('<lb type="x-end-paragraph"/>', "</p>")
    s = s.replace("<lb/>", "<br>")  # a line break in a quoted hymn (Lev 19:5)
    s = re.sub(r" -par(?=[A-Z])", "</p><p>", s)  # an RTF paragraph mark left in the text (Num 7:73)
    # A catchword opens its paragraph, in italics: e-Sword's TSK shows it bold with a colon.
    s = re.sub(r'<p>\s*<hi type="italic">([^<]*)</hi>', r"<p><b>\1:</b>", s)
    s = re.sub(r'<hi type="italic">([^<]*)</hi>', r"<i>\1</i>", s)
    s = re.sub(r"<p>\s*</p>", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    if s and not s.startswith("<p>"):
        s = "<p>" + s
    if s.count("<p>") > s.count("</p>"):
        s += "</p>"
    return s


def write_tsk():
    text = gzip.decompress(fetch(TSK_URL)).decode("utf-8")
    book_rows, chapter_rows, verse_rows = [], [], []
    for m in re.finditer(r"^\$\$\$(.+?) (\d+):(\d+)\n(.*?)(?=^\$\$\$|\Z)", text, re.S | re.M):
        b = SWORD.get(m[1])
        if not b:
            continue
        c, v, body = int(m[2]), int(m[3]), tsk_html(m[4])
        if not body:
            continue
        if c == 0:
            book_rows.append((b, body))
        elif v == 0:
            chapter_rows.append((b, c, body))
        else:
            verse_rows.append((b, c, v, c, v, body))
    info = ("<p>The Treasury of Scripture Knowledge: some 500,000 cross-references for every verse, by Canne, Browne, "
            "Blayney, Scott and others, with an introduction by R. A. Torrey (1834).</p>"
            "<p>Public domain. CrossWire's TSK module (1.5, 2008), as exported in "
            "github.com/man4christ/Treasury-of-Scripture-Knowledge. Built by Two-edged Sword's tools/core.</p>")
    with module("tsk.cmti", "Treasury of Scripture Knowledge", "TSK", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO BookCommentary VALUES (?,?)", book_rows)
        db.executemany("INSERT INTO ChapterCommentary VALUES (?,?,?)", chapter_rows)
        db.executemany("INSERT INTO VerseCommentary VALUES (?,?,?,?,?,?)", verse_rows)
    print(f"tsk.cmti: {len(verse_rows)} verses, {len(chapter_rows)} chapters, {len(book_rows)} books")


# ---- CrossWire's Matthew Henry and Easton ------------------------------------------------------

OSIS_BOOK = {b[1]: i + 1 for i, b in enumerate(BOOKS)}


def crosswire(name):
    """A CrossWire module's zip, and its versification (from tools/crosswire, which reads SWORD's canon tables)."""
    import crosswire.build as cw
    return zipfile.ZipFile(io.BytesIO(fetch(CROSSWIRE.format(name)))), cw.canon


def zcom4(z, test):
    """Every slot of a zCom4 testament as (where it's stored, text): slots stored in the same place
    are one entry linked to a run of verses."""
    def f(ext):
        return z.read(next(n for n in z.namelist() if n.endswith(f"/{test}.{ext}")))
    bzs, bzv, bzz = f("bzs"), f("bzv"), f("bzz")
    blocks, out = {}, []
    for i in range(len(bzv) // 12):
        block, offset, size = struct.unpack_from("<III", bzv, i * 12)
        if not size:
            out.append((None, ""))
            continue
        if block not in blocks:
            start, length, _ = struct.unpack_from("<III", bzs, block * 12)
            blocks[block] = zlib.decompress(bzz[start:start + length])
        out.append(((block, offset), blocks[block][offset:offset + size].decode("utf-8")))
    return out


def osis_part(p, book, last):
    """One "Book.C.V" of an osisRef as (book, chapter, verse); a part with no book, or one the
    source misspells ("Ge.17.20"), takes the book cited before it."""
    bits = p.split(".")
    if bits[0] in OSIS_BOOK:
        return OSIS_BOOK[bits[0]], *map(int, (bits[1:] + ["0", "0"])[:2])
    if bits[0].isdigit() and last:
        return last, *map(int, (bits + ["0"])[:2])
    if len(bits) == 3 and last:
        return last, int(bits[1]), int(bits[2])
    return None


def esword_ref(a, b=None):
    """(book, chapter, verse) to (book, chapter, verse) as e-Sword writes it: "Joh 3:1-21", "Gen 1:1-2:3"."""
    s = f"{BOOK_ABBR[a[0] - 1]} {a[1]}" + (f":{a[2]}" if a[2] else "")
    if b and b != a:
        if b[0] != a[0]:
            s += f"-{BOOK_ABBR[b[0] - 1]} {b[1]}" + (f":{b[2]}" if b[2] else "")
        elif b[1] == a[1] and b[2]:
            s += f"-{b[2]}"
        else:
            s += f"-{b[1]}" + (f":{b[2]}" if b[2] else "")
    return s


def henry_refs(s, book, chapter):
    """<reference osisRef> → <ref>. CCEL's links are mostly right; the wrong ones are repaired: "v. 4"
    and "ver. 17" are always the passage in hand (CCEL sometimes gives them the book cited just before),
    and a part with no book, or a misspelt one, takes the book before it."""
    last = [book]

    def one(m):
        osis, shown = m[1], m[2]
        refs = []
        for part in osis.split():
            a, _, b = part.partition("-")
            pa = osis_part(a, book, last[0])
            if not pa:
                continue
            pb = osis_part(b, book, pa[0]) if b else None
            if re.match(r"\s*(ver|v)\.", shown) and pa[0] != book:
                pa = (book, chapter, pa[2])
                pb = (book, chapter, pb[2]) if pb else None
            # A link to no real verse ("Jas 9:7" in Genesis 9) is usually the passage in hand; if not, it's left as text.
            for fix in ((pa, pb), ((book, *pa[1:]), pb and (book, *pb[1:])), ((book, chapter, pa[2]), pb and (book, chapter, pb[2]))):
                if real(*fix):
                    pa, pb = fix
                    break
            else:
                continue
            last[0] = pa[0]
            refs.append(f"<ref>{esword_ref(pa, pb)}</ref>")
        return "; ".join(refs) if refs else shown

    return re.sub(r'<reference osisRef="([^"]*)">(.*?)</reference>', one, s, flags=re.S)


def henry_html(s, book, chapter):
    """A stretch of Matthew Henry's OSIS as e-Sword's HTML."""
    s = henry_refs(s, book, chapter)
    s = re.sub(r"<note\b.*?</note>", "", s, flags=re.S)  # the editors' footnotes
    s = re.sub(r"(&lt;){3,}[^<]*", "", s)  # "<<< Unabridged", a marker left in the text
    s = re.sub(r'<title[^>]*>(.*?)</title>', r"<p><b>\1</b></p>", s, flags=re.S)
    s = re.sub(r'<div\b[^>]*sID="[^"]*"[^>]*type="x-p"[^>]*/>', "<p>", s)
    s = re.sub(r'<div\b[^>]*eID="[^"]*"[^>]*type="x-p"[^>]*/>', "</p>", s)
    s = re.sub(r"<lg\b[^>]*>", "<p>", s).replace("</lg>", "</p>")
    s = re.sub(r"<l\b[^>]*>(.*?)</l>", r"\1<br>", s, flags=re.S)
    tags = {"italic": "i", "bold": "b", "super": "sup", "underline": "u"}

    def hi(m):
        kind, text = m[1], m[2]
        if kind == "small-caps":  # a chapter's opening word, or "b. c." and "a. d." after a date
            return text.upper() if text == text.lower() else text
        return f"<{tags[kind]}>{text}</{tags[kind]}>" if kind in tags else text
    for _ in range(3):  # nested
        s = re.sub(r'<hi type="([^"]+)">((?:(?!<hi\b).)*?)</hi>', hi, s, flags=re.S)
    s = re.sub(r"<(?!/?(p|b|i|u|sup|br|ref)>)[^>]*>", " ", s)  # milestones, chapter and div markers
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,.;:?!)\]])", r"\1", s)
    s = re.sub(r"<sup>\s*</sup>", "", s)
    # Spaces the source lost: "Egypt.Note", "Testimony;Self-Denial", "judgment,that", "theValley".
    s = re.sub(r"([a-z])((?:</[ib]>)?)([.;,])((?:</?[ib]>)?)([A-Za-z])", lambda m: m[0] if m[3] != "," and m[5].islower() else f"{m[1]}{m[2]}{m[3]} {m[4]}{m[5]}", s)
    s = re.sub(r"\b(the|of|and)((?:<[ib]>)?)([A-Z][a-z])", r"\1 \2\3", s)
    s = re.sub(r"<b>(?:&lt;|[^\w<])*</b>", "", s)  # a title that is only a stray "<"
    # Paragraphs: a stretch of the source can start or end inside one, so they're rebuilt from the breaks.
    paras = (re.sub(r"^(<br>|\s)+|(<br>|\s)+$", "", x) for x in re.split(r"</?p>", s))
    return "".join(f"<p>{x}</p>" for x in paras if re.sub(r"<[^>]+>|\s", "", x))


def drop_scripture(s):
    """A section opens with its title and the KJV text it comments on (verse numbers in <sup>); the
    text is in the Bible beside it, so, like e-Sword's Matthew Henry, only the title is kept. A
    paragraph of that text sometimes has its number outside the <sup> ("<sup></sup> 18 And all")."""
    out, after_title = [], False
    for para in re.findall(r"<p>.*?</p>", s):
        if re.match(r"<p><sup>", para) or (re.match(r"<p>\d+ (<i>)?[A-Z(]", para) and (after_title or "<sup>" in para)):
            continue
        after_title = bool(re.fullmatch(r"<p><b>.*</b></p>", para))
        out.append(para)
    return "".join(out)


def write_henry():
    z, canon = crosswire("MHC")
    books, chapters, verses = [], [], []
    for test, bs in canon("KJV").items():
        slots = zcom4(z, test)
        i = 2  # the module's heading, the testament's
        for osis, lengths in bs:
            b = OSIS_BOOK[osis]
            i += 1  # the book's heading: only its name
            for c, n in enumerate(lengths, 1):
                head = slots[i][1]
                i += 1
                run = slots[i:i + n]
                i += n
                # Runs of verses linked to one entry.
                entries = []
                for v, (where, text) in enumerate(run, 1):
                    if entries and where and where == entries[-1][0]:
                        entries[-1][2] = v
                    elif text.strip():
                        entries.append([where, v, v, text])
                if not entries:
                    continue
                # The book's introduction (and a volume's preface) comes before the first chapter's
                # introduction, and the chapter's introduction before its first section.
                first = head + entries[0][3]
                intro = re.search(r'<div\b[^>]*sID="[^"]*"[^>]*type="introduction"[^>]*/>(.*?)<div\b[^>]*eID="[^"]*"[^>]*type="introduction"[^>]*/>', first, re.S)
                if intro:
                    before, after = first[:intro.start()], first[intro.end():]
                    if c == 1 and re.sub(r"<[^>]+>|\s", "", before):
                        books.append((b, correct(henry_html(before, b, c), HENRY_TYPOS)))
                    ch = correct(henry_html(intro[1], b, c), HENRY_TYPOS)
                    if ch:
                        chapters.append((b, c, ch))
                    entries[0][3] = after
                elif re.sub(r"<[^>]+>|\s", "", head):
                    # Some chapters' introductions aren't marked as one: the text in the chapter's heading.
                    chapters.append((b, c, correct(henry_html(head, b, c), HENRY_TYPOS)))
                # A section's Bible text is sometimes an entry of its own, linked to its verses, with the
                # commentary on them in the next entry (Genesis 19:15-23): its verses go with that one.
                start, covered = None, 0
                for _, v1, v2, text in entries:
                    # An entry filed a verse late (Joshua 18:1's under 18:2) starts where its Bible text does.
                    first = re.search(r'<hi type="super">(\d+)</hi>', text)
                    if first and covered < int(first[1]) < v1:
                        v1 = int(first[1])
                    covered = v2
                    body = correct(drop_scripture(henry_html(text, b, c)), HENRY_TYPOS)
                    if not re.sub(r"<p><b>.*?</b></p>|<[^>]+>|\s", "", body):
                        start = start or v1
                        continue
                    verses.append((b, c, start or v1, c, v2, body))
                    start = None
                if start and verses and verses[-1][:2] == (b, c):  # at a chapter's end, with the section before
                    verses[-1] = (*verses[-1][:4], n, verses[-1][5])
        if i != len(slots):
            sys.exit(f"MHC {test}: {len(slots)} slots, the versification has {i}")
    info = ("<p>Matthew Henry's Complete Commentary on the Whole Bible (1706–1721), finished from Romans to Revelation "
            "by his fellow ministers after his death.</p>"
            "<p>Public domain. CrossWire's MHC module (2.2), prepared from the Christian Classics Ethereal Library's text "
            "(ccel.org). The Bible text each section opens with is left out, as it is beside it in the Bible. "
            "Built by Two-edged Sword's tools/core.</p>")
    with module("henry.cmti", "Matthew Henry's Commentary on the Whole Bible", "Matthew Henry", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO BookCommentary VALUES (?,?)", books)
        db.executemany("INSERT INTO ChapterCommentary VALUES (?,?,?)", chapters)
        db.executemany("INSERT INTO VerseCommentary VALUES (?,?,?,?,?,?)", verses)
    print(f"henry.cmti: {len(verses)} sections, {len(chapters)} chapters, {len(books)} books")


def zld(z):
    """[(key, entry)] from a zLD dictionary: .idx points into .dat, which holds each key and where
    its entry is in the zlib blocks of .zdt (indexed by .zdx)."""
    def f(ext):
        return z.read(next(n for n in z.namelist() if n.endswith(f".{ext}") and "/dict." not in n))
    idx, dat, zdx, zdt = f("idx"), f("dat"), f("zdx"), f("zdt")
    blocks, out = {}, []
    for i in range(len(idx) // 8):
        off, size = struct.unpack_from("<II", idx, i * 8)
        key, _, rest = dat[off:off + size].partition(b"\n")
        block, entry = struct.unpack_from("<II", rest)
        if block not in blocks:
            bo, bs = struct.unpack_from("<II", zdx, block * 8)
            blocks[block] = zlib.decompress(zdt[bo:bo + bs])
        eo, es = struct.unpack_from("<II", blocks[block], 4 + entry * 8)
        out.append((key.rstrip(b"\r").decode("utf-8"), blocks[block][eo:eo + es].decode("utf-8")))
    return out


_VERSES = {}


def verse_counts():
    """{book: {chapter: verses}} from the KJV built above, to check a reference points at a real verse."""
    if not _VERSES:
        if not (BUNDLED / "kjv.bbli").is_file():
            sys.exit("no src-tauri/modules/kjv.bbli: build it first (python3 tools/core/build.py)")
        for (b, c), n in chapter_lengths(BUNDLED / "kjv.bbli").items():
            _VERSES.setdefault(b, {})[c] = n
    return _VERSES


def real(a, b=None):
    """Whether (book, chapter, verse) [to (book, chapter, verse)] is in the KJV (verse 0: the whole chapter)."""
    vc = verse_counts()
    for x in (a, b) if b else (a,):
        if x[0] not in vc or x[1] not in vc[x[0]] or x[2] > vc[x[0]][x[1]]:
            return False
    return not b or (b[:2] > a[:2] or (b[:2] == a[:2] and b[2] >= a[2]))


# Book names as Easton writes them in running text, where it names a book but links only the
# chapter and verse after it: "Daniel (11:31)", "Canticles (2:3, 5)", "Acts of the Apostles (2:38-41)".
BOOK_NAMES = {n.replace("_", " ").replace("III ", "3 ").replace("II ", "2 ").replace("I ", "1 "): i + 1 for i, n in enumerate(b[3] for b in BOOKS)}
BOOK_NAMES |= {"Revelation": 66, "Canticles": 22, "Cant": 22, "Song": 22, "Psalm": 19, "Acts of the Apostles": 44}
PLAIN_REF = re.compile(r"(?<![\w:.])(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?((?:,\s*\d{1,3}(?:[-–]\d{1,3})?(?![\d:]))*)")
SHOWN = re.compile(r"\s*(?:((?:[1-3]\s*)?[A-Za-z][A-Za-z. ]*?)\.?\s+)?(\d+)(?::(\d+))?(?:\s*[-–]\s*(\d+)(?::(\d+))?)?\s*[.,;]?\s*$")


def easton_refs(s, names):
    """Easton's references as e-Sword writes them, each in full ("Exo 2:1", "Exo 2:4"). The source links
    only the first of a run properly: "Ps. 68:15, 16; 87:1" links 16 to Genesis 1:16 and 87:1 to
    Exodus 37:1. So each is read from what it shows: a named book by its name (`names`, Easton's
    abbreviations), the rest by the book and chapter before them, or a book named in the text just
    before; bare chapter-and-verse runs the source doesn't link are linked the same way. Whatever
    still isn't a real verse is left as text."""
    # Links the source split: "8:33-9" then ":6"; "2" then "Chr." then "20:14".
    s = re.sub(r'(<ref osisRef="[^"]*">[^<]*?)</ref>:(\d+)', r"\1:\2</ref>", s)
    s = re.sub(r'<ref osisRef="[^"]*">([1-3])</ref>\s*([A-Z][a-z]+\.?)\s*<ref osisRef="([^"]*)">([^<]*)</ref>', r'<ref osisRef="\3">\1 \2 \4</ref>', s)
    out, last = [], {"book": None, "chapter": None, "chapters": False}
    tail = re.compile(r"\b(" + "|".join(sorted(map(re.escape, BOOK_NAMES), key=len, reverse=True)) + r")\.?\s*\(?\s*$")

    def link(b, c, v, c2=None, v2=None):
        a, z = (b, c, v or 0), ((b, c2 if c2 else c, v2) if v2 else (b, c2, 0) if c2 else None)
        return f"<ref>{esword_ref(a, z)}</ref>" if real(a, z) else None

    def plain(t):
        m = tail.search(t)
        if m:
            last.update(book=BOOK_NAMES[m[1]], chapter=None, chapters=False)
        if not last["book"]:
            return t
        def one(m):
            refs = [link(last["book"], int(m[1]), int(m[2]), v2=int(m[3]) if m[3] else None)]
            for x in re.findall(r"\d{1,3}(?:[-–]\d{1,3})?", m[4] or ""):
                a, _, z = x.replace("–", "-").partition("-")
                refs.append(link(last["book"], int(m[1]), int(a), v2=int(z) if z else None))
            if not all(refs):
                return m[0]
            last.update(chapter=int(m[1]), chapters=False)
            return ", ".join(refs)
        return PLAIN_REF.sub(one, t)

    pos = 0
    for m in re.finditer(r'<ref osisRef="(?:Bible:)?([^"]+)">(.*?)</ref>', s, re.S):
        out.append(plain(s[pos:m.start()]))
        pos = m.end()
        osis, shown = m[1], m[2]
        p = SHOWN.match(shown)
        if not p:
            out.append(shown)
            continue
        name, n1, n2, n3, n4 = p[1], int(p[2]), p[3] and int(p[3]), p[4] and int(p[4]), p[5] and int(p[5])
        if name:
            key = re.sub(r"\s+", " ", name.strip().rstrip("."))
            book = names.get(key) or BOOK_NAMES.get(key) or OSIS_BOOK.get(osis.split(".")[0])
            chapters = not n2
        else:
            book = last["book"]
            chapters = last["chapters"] and not n2
        if not book:
            out.append(shown)
            continue
        if n2:  # c:v, c:v-v2, c:v-c2:v2
            r = link(book, n1, n2, n3 if n4 else None, n4 or n3)
            chapter = n3 if n4 else n1
        elif chapters or not last["chapter"] or name:  # a chapter, or chapters
            r = link(book, n1, 0, n3) if n3 else link(book, n1, 0)
            chapter, chapters = n3 or n1, True
        else:  # a verse, or verses, of the chapter before
            r = link(book, last["chapter"], n1, v2=n3)
            chapter = last["chapter"]
        if not r:
            out.append(shown)
            continue
        last.update(book=book, chapter=chapter, chapters=chapters)
        out.append(r)
    out.append(plain(s[pos:]))
    return "".join(out)


def easton_names(entries):
    """Easton's abbreviations ("Ex.", "1 Chr.") and the books its links give them, the commonest for each."""
    seen = defaultdict(Counter)
    for _, x in entries:
        for osis, shown in re.findall(r'<ref osisRef="Bible:([^"]+)">([^<]*)</ref>', x):
            m = re.match(r"\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z. ]*?)\.?\s*\d", shown)
            if m and osis.split(".")[0] in OSIS_BOOK:
                seen[re.sub(r"\s+", " ", m[1].strip().rstrip("."))][OSIS_BOOK[osis.split(".")[0]]] += 1
    return {k: c.most_common(1)[0][0] for k, c in seen.items()}


def easton_html(s, names):
    s = re.sub(r"<title>.*?</title>", "", s, flags=re.S)
    s = re.sub(r"</?entryFree\b[^>]*>", "", s)

    def foreign(m):
        # "_" marks where the italics stop and start again inside a run: "anathema_ or _herem".
        parts = m[1].split("_")
        return "".join(f"<i>{p}</i>" if k % 2 == 0 else p for k, p in enumerate(parts) if p)
    s = re.sub(r"<foreign\b[^>]*>(.*?)</foreign>", foreign, s, flags=re.S)
    s = easton_refs(s, names)
    s = re.sub(r"<(?!/?(p|i|ref)>)[^>]*>", "", s)
    s = re.sub(r"_([^_<]+)_", r"<i>\1</i>", s)  # italics marked the plain-text way: "_haphar peroth_"
    s = re.sub(r"(?<=\w)_(?=\W)", "", s)  # and the end of one whose start was lost ("Mare Inferum_")
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)
    s = re.sub(r"\bes([A-Z][a-z])", r"es \1", s)  # "Tell esSafieh", as e-Sword has it
    s = re.sub(r"\s+,\s*", ", ", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s*(</?p>)\s*", r"\1", s)
    return s.strip()


# Misspellings in CrossWire's Easton, each checked in context (e-Sword's Easton has them corrected).
# Easton's British spellings (defence, travelled) are his own and stay.
EASTON_TYPOS = {
    "Isarael": "Israel", "isreal": "Israel", "preceeding": "preceding", "peristed": "persisted", "humilating": "humiliating", "wordly": "worldly",
    "nothern": "northern", "saluated": "saluted", "breat": "breast", "eigth": "eighth", "firmanent": "firmament", "hailstrom": "hailstorm",
    "condounding": "confounding", "orginally": "originally", "neglet": "neglect", "adultry": "adultery", "posibly": "possibly", "stict": "strict",
    "anoter": "another", "heros": "heroes", "rightenousness": "righteousness", "wildernes": "wilderness", "seond": "second", "brethen": "brethren",
    "ethiopans": "Ethiopians", "solem": "solemn", "partriarchal": "patriarchal", "occured": "occurred", "patriach": "patriarch", "familes": "families",
    "fullfilled": "fulfilled", "earlies": "earliest", "soverign": "sovereign", "foureen": "fourteen", "coloquial": "colloquial", "betwen": "between",
    "mediterraanean": "Mediterranean", "magnificient": "magnificent", "symbolcal": "symbolical", "labyrith": "labyrinth", "occuptaion": "occupation", "autmnal": "autumnal",
    "adapated": "adapted", "irresistable": "irresistible", "subterrean": "subterranean", "christain": "Christian", "ninteen": "nineteen", "regins": "reigns",
    "proppitatory": "propitiatory", "sacrifical": "sacrificial", "apear": "appear", "proetorium": "praetorium", "annointed": "anointed", "conspicious": "conspicuous",
    "conspicous": "conspicuous", "beseieging": "besieging", "rightousness": "righteousness", "eunchs": "eunuchs", "burnden": "burden", "fictious": "fictitious",
    "repleished": "replenished", "sucide": "suicide", "seritude": "servitude", "calamites": "calamities", "serveral": "several", "prevading": "pervading",
    "jersalem": "Jerusalem", "knowlege": "knowledge", "conforting": "comforting", "prosperty": "prosperity", "civilzation": "civilization", "refered": "referred",
    "sacrifies": "sacrifices", "strategem": "stratagem", "opression": "oppression", "unijured": "uninjured", "alloted": "allotted", "patriachs": "patriarchs",
    "patriachal": "patriarchal", "appered": "appeared", "acquinted": "acquainted", "promotory": "promontory", "knowning": "knowing", "insturcting": "instructing",
    "propitation": "propitiation", "beliver": "believer", "uncleaness": "uncleanness", "cermonial": "ceremonial", "hestitate": "hesitate", "rememberancer": "remembrancer",
    "presevation": "preservation", "isiah": "Isaiah", "agreable": "agreeable", "sancturary": "sanctuary", "pomegrante": "pomegranate", "burried": "buried",
    "conquerer": "conqueror", "thankgiving": "thanksgiving", "ezekel": "Ezekiel", "exteremity": "extremity", "pecularities": "peculiarities", "blosoms": "blossoms",
    "outght": "ought", "jodan": "Jordan", "afficted": "afflicted", "strengh": "strength", "nutured": "nurtured", "superintendant": "superintendent",
    "curel": "cruel", "mosiac": "Mosaic", "lewdwoman": "lewd woman", "fellowprisoner": "fellow-prisoner", "Wadyes": "Wady es",
}
HENRY_TYPOS = {"concecrate": "consecrate", "tallents": "talents"}


def correct(s, typos):
    """Whole-word corrections, keeping a capital letter; and "æ" and "œ" as e-Sword writes them, so a search for "Caesar" finds them."""
    s = s.replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe").replace("Œ", "Oe")
    pat = re.compile(r"\b(" + "|".join(map(re.escape, typos)) + r")\b", re.I)
    def fix(m):
        w = typos.get(m[0]) or typos.get(m[0].lower()) or typos.get(m[0][0].upper() + m[0][1:].lower())
        if w is None:
            return m[0]
        return w[0].upper() + w[1:] if m[0][0].isupper() else w
    return pat.sub(fix, s)


def write_easton():
    z, _ = crosswire("Easton")
    rows, entries = [], zld(z)
    names = easton_names(entries)
    for key, entry in entries:
        name = re.search(r'<entryFree n="([^"]+)"', entry)
        body = correct(easton_html(entry, names), EASTON_TYPOS)
        if body:
            rows.append((name[1] if name else key.title(), body))
    info = ("<p>Easton's Bible Dictionary: M. G. Easton's Illustrated Bible Dictionary, third edition (Thomas Nelson, 1897), "
            "without its illustrations.</p>"
            "<p>Public domain. CrossWire's Easton module (2.0.1), from the Christian Classics Ethereal Library. "
            "Built by Two-edged Sword's tools/core.</p>")
    with module("easton.dcti", "Easton's Bible Dictionary", "Easton", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Dictionary VALUES (?,?)", rows)
    print(f"easton.dcti: {len(rows)} topics")


def main():
    if "--if-missing" in sys.argv and all((BUNDLED / f).exists() for f in FILES):
        return
    if "--only" in sys.argv:  # --only henry easton: just those
        names = sys.argv[sys.argv.index("--only") + 1:]
        if not names or set(names) - {"henry", "easton"}:
            sys.exit(f"--only takes henry and/or easton, not {' '.join(sorted(set(names) - {'henry', 'easton'})) or 'nothing'}")
        if "henry" in names:
            write_henry()
        if "easton" in names:
            write_easton()
        return
    verses, words = kjv()
    write_kjv(verses)
    counts = Counter(n for *_, n in words)
    entries = greek() | hebrew()
    write_strong(entries, counts)
    write_kjc(entries, words)
    write_tsk()
    write_henry()
    write_easton()


if __name__ == "__main__":
    main()
