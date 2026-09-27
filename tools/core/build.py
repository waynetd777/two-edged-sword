"""Builds the modules built into the app, so it works with nothing else installed: the KJV, the
KJV with Strong's numbers, Strong's Hebrew and Greek dictionaries, a King James concordance and
the Treasury of Scripture Knowledge.

    python3 tools/core/build.py [--if-missing]

Writes kjv.bbli, kjv+.bbli, strong.lexi, kjc.lexi and tsk.cmti to src-tauri/modules/, which the
app bundle carries in Contents/Resources/modules/ (and a debug build reads in place). With
--if-missing, does nothing when all five are there (the release build runs it that way). The ids
are the ones the app looks for first, so Word Study, the glosses and the cross-references find them.

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
The concordance and the dictionaries' occurrence counts are counted from the KJV's Strong's numbers.

Downloads are cached in ~/Library/Caches/Two-edged Sword/core.
"""
import gzip, html as html_, io, re, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path


class html:
    """html.escape without quotes: the text goes in elements, never attributes."""
    escape = staticmethod(lambda s: html_.escape(s, quote=False))

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import BUNDLED, module  # noqa: E402

CACHE = Path.home() / "Library/Caches/Two-edged Sword/core"
KJV_URL = "https://ebible.org/Scriptures/eng-kjv2006_usfm.zip"
GREEK_URL = "https://raw.githubusercontent.com/openscriptures/strongs/master/greek/StrongsGreekDictionaryXML_1.4.zip"
HEBREW_URL = "https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/StrongHebrewG.xml"
TSK_URL = "https://raw.githubusercontent.com/man4christ/Treasury-of-Scripture-Knowledge/master/data/tsk.imp.gz"
FILES = ["kjv.bbli", "kjv+.bbli", "strong.lexi", "kjc.lexi", "tsk.cmti"]

# The 66 books in order: USFM code, OSIS name, e-Sword's abbreviation (as in src/bible.ts), SWORD's name.
BOOKS = [b.split(":") for b in (
    "GEN:Gen:Gen:Genesis EXO:Exod:Exo:Exodus LEV:Lev:Lev:Leviticus NUM:Num:Num:Numbers DEU:Deut:Deu:Deuteronomy "
    "JOS:Josh:Jos:Joshua JDG:Judg:Jdg:Judges RUT:Ruth:Rut:Ruth 1SA:1Sam:1Sa:I_Samuel 2SA:2Sam:2Sa:II_Samuel "
    "1KI:1Kgs:1Ki:I_Kings 2KI:2Kgs:2Ki:II_Kings 1CH:1Chr:1Ch:I_Chronicles 2CH:2Chr:2Ch:II_Chronicles EZR:Ezra:Ezr:Ezra "
    "NEH:Neh:Neh:Nehemiah EST:Esth:Est:Esther JOB:Job:Job:Job PSA:Ps:Psa:Psalms PRO:Prov:Pro:Proverbs "
    "ECC:Eccl:Ecc:Ecclesiastes SNG:Song:Son:Song_of_Solomon ISA:Isa:Isa:Isaiah JER:Jer:Jer:Jeremiah LAM:Lam:Lam:Lamentations "
    "EZK:Ezek:Eze:Ezekiel DAN:Dan:Dan:Daniel HOS:Hos:Hos:Hosea JOL:Joel:Joe:Joel AMO:Amos:Amo:Amos OBA:Obad:Oba:Obadiah "
    "JON:Jonah:Jon:Jonah MIC:Mic:Mic:Micah NAM:Nah:Nah:Nahum HAB:Hab:Hab:Habakkuk ZEP:Zeph:Zep:Zephaniah HAG:Hag:Hag:Haggai "
    "ZEC:Zech:Zec:Zechariah MAL:Mal:Mal:Malachi MAT:Matt:Mat:Matthew MRK:Mark:Mar:Mark LUK:Luke:Luk:Luke JHN:John:Joh:John "
    "ACT:Acts:Act:Acts ROM:Rom:Rom:Romans 1CO:1Cor:1Co:I_Corinthians 2CO:2Cor:2Co:II_Corinthians GAL:Gal:Gal:Galatians "
    "EPH:Eph:Eph:Ephesians PHP:Phil:Php:Philippians COL:Col:Col:Colossians 1TH:1Thess:1Th:I_Thessalonians "
    "2TH:2Thess:2Th:II_Thessalonians 1TI:1Tim:1Ti:I_Timothy 2TI:2Tim:2Ti:II_Timothy TIT:Titus:Tit:Titus PHM:Phlm:Phm:Philemon "
    "HEB:Heb:Heb:Hebrews JAS:Jas:Jas:James 1PE:1Pet:1Pe:I_Peter 2PE:2Pet:2Pe:II_Peter 1JN:1John:1Jn:I_John "
    "2JN:2John:2Jn:II_John 3JN:3John:3Jn:III_John JUD:Jude:Jud:Jude REV:Rev:Rev:Revelation_of_John").split()]
USFM = {b[0]: i + 1 for i, b in enumerate(BOOKS)}
ABBR = {b[1]: b[2] for b in BOOKS} | {"1Macc": "1Ma", "2Macc": "2Ma"}
SWORD = {b[3].replace("_", " "): i + 1 for i, b in enumerate(BOOKS)}
BOOK_ABBR = [b[2] for b in BOOKS]


def fetch(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / url.rsplit("/", 1)[1]
    if not p.exists():
        print(f"downloading {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "Two-edged Sword tools/core"})
        with urllib.request.urlopen(req, timeout=300) as r:
            data = r.read()
        p.write_bytes(data)
    return p.read_bytes()


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
        t = re.sub(r"\\\+?(nd|tl|sc|bk|qs|k|pn|em|it|bd|no)\*?\s?", "", t)
        t = re.sub(r"\\\S+\s?", "", t)  # anything else left
        # e-Sword's spellings, so a search for "Caesar" or "God's" finds them.
        t = t.replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe").replace("’", "'")
        t = re.sub(r"\s+", " ", t).strip()
        t = re.sub(r"\s+([,.;:?!)])", r"\1", t).replace("<red> ", " <red>").replace(" </red>", "</red> ")
        return re.sub(r"(</red>|</i>)\s+([,.;:?!)])", r"\1\2", t).strip()

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


def main():
    if "--if-missing" in sys.argv and all((BUNDLED / f).exists() for f in FILES):
        return
    verses, words = kjv()
    write_kjv(verses)
    counts = Counter(n for *_, n in words)
    entries = greek() | hebrew()
    write_strong(entries, counts)
    write_kjc(entries, words)
    write_tsk()


if __name__ == "__main__":
    main()
