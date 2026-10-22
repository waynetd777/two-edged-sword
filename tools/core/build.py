# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds the modules built into the app, so it works with nothing else installed: the KJV, the
KJV with Strong's numbers, Strong's Hebrew and Greek dictionaries, a King James concordance, the
Treasury of Scripture Knowledge, four commentaries (Matthew Henry, JFB, Clarke, Barnes), four
dictionaries (Easton's, Smith's, Nave's, the ISBE), Webster's 1828 dictionary, the unabridged
Brown-Driver-Briggs Hebrew lexicon, seven more public-domain English Bibles (the ASV, the WEB, Young's,
Darby's, Webster's, the Revised Version and the Berean Standard Bible), and the BSB and Webster's with
Strong's numbers; and Wesley's notes, Torrey's and Hitchcock's dictionaries, Abbott-Smith's Greek lexicon,
Spurgeon's Morning and Evening and Daily Light, Weymouth's New Testament, Brenton's English Septuagint,
the Byzantine Greek New Testament (plain and word by word), WLC+ (tools/wlc's, bundled), and
OpenBible.info's cross-references and Bible places.

    python3 tools/core/build.py [--if-missing] [--only henry easton jfb clarke barnes smith nave isbe webster1828 bdb wesley torrey hitchcock abbott sme daily maps
                                       byz byz+ brenton weymouth wlc+ openbible places asv web ylt darby webster rv bsb bsb+ webster+]

Writes kjv.bbli, kjv+.bbli, strong.lexi, kjc.lexi, tsk.cmti, henry.cmti, jfb.cmti, clarke.cmti,
barnes.cmti, easton.dcti, smith.dcti, nave.dcti, isbe.dcti, webster1828.dcti, bdb_unabridged.lexi,
wesley.cmti, torrey.dcti, hitchcock.dcti, abbott.lexi, sme.devi, daily.devi, byz.bbli, byz+.bbli, brenton.bbli,
weymouth.bbli, wlc+.bbli, openbible_xref.cmti, places.dcti, maps.refi (tools/maps), asv.bbli, web.bbli, ylt.bbli, darby.bbli, webster.bbli, rv.bbli, bsb.bbli, bsb+.bbli and webster+.bbli to src-tauri/modules/, which the app bundle carries in
Contents/Resources/modules/ (and a debug build reads in place). With --if-missing, builds only the
commentaries, dictionaries and Bibles not there yet, or everything if the KJV and what's built from
it aren't (the release build runs it that way); --only builds just the ones named (after the KJV,
which they check references against, built first if it isn't there). The ids are the ones the app
looks for first, so Word Study, the glosses and the cross-references find them, and e-Sword's own
copies (henry.cmti, asv.bbli and so on), where there are, take the place of these.

Every source is public domain but Webster's 1828 (CC BY-SA), STEPBible's and Open Scriptures' data and
OpenBible.info's (CC BY), each credited in its module, and none is e-Sword's (its licence forbids
passing its modules on):
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
  More of CrossWire's modules, each "DistributionLicense=Public Domain" in its .conf, from the same
    rawzip folder: Jamieson, Fausset & Brown (JFB 3.0, zCom4, OSIS from CCEL), Adam Clarke (Clarke
    2.0, zCom, OSIS from Wikisource), Barnes' Notes on the New Testament (Barnes 1.1, zCom, ThML;
    CrossWire has no Old Testament), Smith's Bible Dictionary (Smith 1.3, RawLD, ThML), Nave's
    Topical Bible (Nave 3.0, zLD, TEI from CCEL) and the International Standard Bible Encyclopedia
    (ISBE 2.2, zLD, TEI). Every reference is checked against the KJV's verses: one CCEL linked to the
    wrong book ("Re 1:1, 4, 9", 4 and 9 linked to 1 Corinthians) is read from what it shows, and one
    that is still no real verse is left as text. Barnes' notes are placed by their own labels
    ("Verses 22, 23."), as CrossWire's module has the books' prefaces in their first verses' slots.
    Gill's Exposition isn't here: CrossWire has no module of it.
  Webster's 1828 dictionary (webster1828.dcti): Akai Tsurugi's edition, CrossWire's Webster1828 1.2
    (zLD, TEI), https://github.com/akaitsurugi/webster1828; its references, written out ("Philippians
    1:27"), are linked (link_plain_refs, as Wesley's). The dictionary is public domain; this
    edition is CC BY-SA 4.0, so the module credits it and is shared under the same licence. Its
    CrossWire About (the compiler's opinions) isn't used: the module has its own description.
  Brown-Driver-Briggs (bdb_unabridged.lexi): the unabridged 1906 lexicon, Eliran Wong's edition,
    https://github.com/eliranwong/unabridged-BDB-Hebrew-lexicon (public domain; from Bible Analyzer's
    text, references parsed by Stephen Ku), taken at a fixed commit. An entry per Strong's number, as
    e-Sword's bdb.lexi (an abridged BDB) has them; its file name differs so e-Sword's doesn't take its
    place. The source lists every number an article mentions and is a row out here and there, so each
    article is filed by its headword against Strong's (write_bdb). Its 165,000 references are in the Hebrew Bible's numbering: each shows BDB's and links to
    the KJV's verse, through the Open Scriptures VerseMap tools/wlc reads; one its editor flagged for
    checking, or that is no verse in the KJV, is left as text. Arabic, Syriac and Ethiopic words were
    pictures in the source and are shown as "…". Not used: the Open Scriptures BDB, whose entries are
    mostly still short glosses without references.
  More of CrossWire's public-domain modules: Wesley's Notes (Wesley 1.1, zCom, ThML; the words each note
    is on, before " - " at a sentence's start, bold), Torrey's New Topical Textbook (Torrey 1.3, RawLD,
    ThML, its outline tidied: a subtopic and its verses on one line, a heading in capitals bold), Hitchcock's
    Bible Names (Hitchcock 2.0, zLD, TEI), Abbott-Smith's Manual Greek Lexicon
    (AbbottSmithStrongs 4.1, zLD, TEI: each Strong's number's key links to its headword's entry, so
    abbott.lexi has an entry per number; the keys CrossWire has wrong are put right, and a form Strong
    numbers apart opens its word's entry: write_abbott), Spurgeon's Morning and Evening (SME 1.7, OSIS) and Daily Light
    (Daily 1.0, ThML, its 70-column lines rejoined, each reading's first verse in bold) as devotionals,
    and Weymouth's New Testament (Weymouth 1.1, GBF zText; 15 verses its Greek hasn't are missing).
  The Byzantine text (byz, byz+): Robinson and Pierpont's 2018 edition, public domain,
    https://github.com/byztxt/byzantine-majority-text at a fixed commit, its accented text and its
    parsed one (every word with Strong's number and Robinson's code), which line up word for word in
    every verse. Romans 14:24-26, the doxology where the Majority Text has it, are moved to 16:25-27, as
    the WEB's. byz+ is word by word as Beza 1598+ (tools/beza/plus.py, whose glosses it uses: STEPBible's
    TBESG, CC BY), the numbers Robinson's but for the forms Strong numbers apart (εἶπεν G2036, ἦν G2258,
    σου G4675), which take the number TAGNT has for each form (as the KJV+ has them).
  Brenton's English Septuagint (brenton): eBible.org's eng-Brenton (public domain), with the Apocrypha,
    numbered as the KJV by tools/lxx's tables and rules, as its Greek is.
  WLC+: tools/wlc's build, written here to be bundled (CC BY 4.0: Open Scriptures and STEPBible).
  OpenBible.info (CC BY 4.0): its cross-references (https://a.openbible.info/data/cross-references.zip),
    those voted helpful 5 times or more (117,000 for 19,900 verses), most votes first; and its Bible
    places (https://github.com/openbibleinfo/Bible-Geocoding-Data at a fixed commit), a dictionary
    entry for each with its identifications, likeliest first, their confidence and coordinates
    (not those taken from OpenStreetMap, whose licence is the ODbL), and the verses that name it.
  The other Bibles, from eBible.org's USFM zips (https://ebible.org/Scriptures/<id>_usfm.zip), each
    marked public domain in its copr.htm and in eBible's catalogue (translations.csv):
      asv      eng-asv      American Standard Version (1901)
      web      engwebp      World English Bible, the 66-book edition (dedicated to the public domain;
                            "World English Bible" is eBible's trademark, kept only for its unchanged text)
      ylt      engylt       Young's Literal Translation (1898)
      darby    engDBY       Darby Translation (1890)
      webster  engwebster   Noah Webster's revision of the KJV (1833)
      rv       eng-rv       The Revised Version (1881-1885), with its Apocrypha (1895), numbered as
                            e-Sword numbers the Apocrypha (APOCRYPHA)
    Words of Christ (\\wj, the WEB's) become <red>, supplied words (\\add, Webster's and the ASV's)
    <i>, Darby's emphasis (\\bd) <b>, psalm titles (\\d) <b> at the start of verse 1. Notes,
    cross-references, headings and their Strong's numbers (which eBible matched by machine) are left
    out; a verse that is only a note (the ASV's Mat 17:21, "Many authorities ... insert v. 21") keeps
    it, in brackets. All are numbered as the KJV but the WEB, whose Romans 14:24-26 (the doxology,
    where the Majority Text has it) are moved to 16:25-27 (MOVES); Darby has no Mat 23:14, Act 8:37
    or Act 15:34, as his Greek text hasn't. The Douay-Rheims isn't here: it is numbered as the Vulgate
    and has the deuterocanon, and tools/crosswire builds it (drc.bbli) for the modules folder.
  The Berean Standard Bible (bsb), the Berean Bible's own USFM, https://bereanbible.com/bsb_usfm.zip,
    "officially dedicated to the public domain as of April 30, 2023. All uses are freely permitted"
    (https://berean.bible/terms.htm, which asks that a text varying from theirs not bear the Berean
    name: the words here are theirs unchanged; notes and headings are left out, as for the others).
    Its psalm titles (\\d \\v 1 ...) are <b>. It hasn't the 16 verses the KJV has and its Greek text
    doesn't (Mat 17:21, Joh 5:4, Act 8:37, ...), nor the subscription to Hab 3:19.
  Strong's numbers (bsb+, webster+), in the KJV+'s form ("loved<num>G25</num>", a number after the
    words it translates). Each edition's text is its plain one's unchanged, with only the numbers put in.
      bsb+      The BSB's translation tables, https://bereanbible.com/bsb_tables.tsv (public domain with
                the text), which give every Hebrew and Greek word with its Strong's number and the
                English that translates it, in the English order: each phrase is found in the verse and
                its numbers put after it (bsb_tables). All but 6 of its 386,065 phrases are found. The
                numbers are Strong's but for a word's dictionary form throughout (G1510 for every form
                of "to be", where Strong's and the KJV+ have G2258, G2071 and so on), and the article
                (G3588) and the Hebrew object marker (H853) are numbered where they are translated
                ("the", "who", "them"), as the KJV+ mostly doesn't.
      webster+  The KJV+'s numbers carried onto Webster's words (carry_numbers): Webster's is the KJV
                with words updated, so its words are lined up with the KJV's and a number goes after
                the word in Webster's place of the one it follows in the KJV+; 98.6% are carried, the
                rest (where Webster reworded a phrase) left out.
    Checked against the KJV+ on 163 verses (Gen 1, Exo 20:1-17, Ps 23, Isa 53, Mat 5:1-12, John 1:1-18,
    3:16, Rom 8, Heb 11:1-6, Rev 22), the share of words that are content words and have the same
    number as the KJV+'s same word is 92% for the BSB+ (its differences are mostly the KJV+'s: numbers
    for a phrase on its last word, "every living creature<num>H2416</num>", where the BSB+ numbers
    "every" too) and 99% for Webster+. Not here: eBible.org's ASV, WEB and Darby have Strong's numbers,
    but matched by machine and often wrong ("the<num>H1254</num>", "And<num>H1961</num>", God unnumbered
    in Gen 1:3; "should<num>G2316</num>" in John 3:16): 72%, 72% and 81% of their content words agree
    with the KJV+, and 36-38%, 25% of their numbered function words don't. CrossWire's ASV is the
    same text and numbers (TextSource eBible). Carrying the KJV+'s numbers onto the ASV, WEB, Young's
    or Darby's as onto Webster's puts some on the wrong words where they reorder a phrase (the ASV's
    Rom 8:28, "to them that<num>G25</num>"), and Young's has no tagged source.
The concordance and the dictionaries' occurrence counts are counted from the KJV's Strong's numbers.

The GitHub files are taken at a fixed commit and checked against their sha256, so a rebuild makes
the same modules; eBible.org's, CrossWire's and the Berean Bible's files have no fixed version to
take, so they aren't (a rebuild from the same files makes the same modules; if the BSB's tables and
text drift apart, the phrases not found are printed).

Downloads are cached in ~/Library/Caches/Two-edged Sword/core.
"""
import csv, gzip, html as html_, io, json, re, sqlite3, struct, sys, unicodedata, zipfile, zlib
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path


class html:
    """html.escape without quotes: the text goes in elements, never attributes."""
    escape = staticmethod(lambda s: html_.escape(s, quote=False))

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from books import BOOKS  # noqa: E402
from modules import BUNDLED, CACHES, chapter_lengths, fetch as fetch_to, greek_key, module  # noqa: E402

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
# The KJV and what is built from it, in one go; the rest can be built one at a time.
CORE = list(FILES)

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
        chapter, title, heading, title_words = 0, "", "", []
        # One marker and what follows it up to the next paragraph-level marker.
        for m in re.finditer(r"\\(c|v|d|s1|s2|mt1|mt2|toc\d|h|id|p|q\d?|b|m|pi\d?|li\d?|nb)\b ?(.*?)(?=\\(?:c|v|d|s1|s2|mt\d|toc\d|h|id|p|q\d?|b|m|pi\d?|li\d?|nb)\b(?![a-z*])|\Z)", text, re.S):
            tag, body = m[1], m[2]
            if tag == "c":
                subscription(verses, book, chapter, heading)
                chapter, title, heading = int(body.split()[0]), "", ""
            elif tag == "d":
                title = inline(body)
                title_words = re.findall(r"\\\+?w ([^|\\]+)\|strong=\"([^\"]+)\"", body)  # counted with verse 1, which it opens
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
                for w, n in title_words + re.findall(r"\\\+?w ([^|\\]+)\|strong=\"([^\"]+)\"", rest):
                    words.append((book, chapter, v, w, num(n)))
                title_words = []
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
    # Strong's numbers the source leaves off a word that renders two Greek or Hebrew words, as
    # e-Sword's KJV+ has them: the word's last occurrence in the verse gets the second number.
    for key, word, has, add in KJV_ADDED_STRONGS:
        plain, tagged = verses[key]
        old = f"{word}<num>{has}</num>"
        at = tagged.rfind(old)
        assert at >= 0, f"KJV_ADDED_STRONGS: no {old} in {key}"
        verses[key] = (plain, f"{tagged[:at]}{old}<num>{add}</num>{tagged[at + len(old):]}")
        words.append((*key, word, add))
    return verses, words


# (book, chapter, verse), the word, the number it has, the number it lacks.
KJV_ADDED_STRONGS = [
    ((48, 4, 9), "again", "G3825", "G509"),  # "ye desire again": πάλιν ἄνωθεν
]


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
        text = re.sub(r";\s*,", ";", re.sub(r"\s+,", ",", e["text"])).replace("\ufffd", "").strip()  # "multitude; , the same as"
        text = re.sub(r"<i>([^<]*?[a-z])</i>([a-z]+)", r"<i>\1\2</i>", text).replace("<heb></heb>", "")  # "<i>to have affection f</i>or"
        text = re.sub(r"\s+", " ", re.sub(r",?\s*<lat></lat>\s*;", ";", text))  # H595's "sometimes, <lat></lat>;", a form lost
        rows.append((n, f"<p>{e['word']}</p><p><lat>{e['translit']}</lat></p><p><i>{e['pron']}</i></p><p>{text}</p>{total}"))
    rows.sort(key=lambda r: (r[0][0], int(re.match(r"\d+", r[0][1:])[0])))
    with module("strong.lexi", "Strong's Hebrew and Greek Dictionaries", "Strong", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Lexicon VALUES (?,?)", rows)
    print(f"strong.lexi: {len(rows)} entries")


def write_kjc(entries, words):
    """For each Strong's number, how the KJV renders it, the commonest first, with where."""
    by, forms = defaultdict(lambda: defaultdict(Counter)), defaultdict(Counter)
    for b, c, v, w, n in words:
        r = re.sub(r"[^\w' -]", "", w.replace("’", "'")).strip()
        r = re.sub(r"^(?:the|a|an) (?=\w)", "", r, flags=re.I)
        key = r if r.isupper() and len(r) > 1 else r.lower()  # LORD and GOD apart from Lord and God
        if key:
            by[n][key][(b, c, v)] += 1
            forms[(n, key)][r] += 1

    def shown(n, key):
        """A rendering as the KJV writes it most often: God and Jesus with their capitals, "come" without the one it
        has starting a sentence."""
        return forms[(n, key)].most_common(1)[0][0]
    rows = []
    for n, renderings in by.items():
        e = entries.get(n, {"word": "", "translit": ""})
        total = sum(sum(x.values()) for x in renderings.values())
        parts = [f"<p>{e['word']}</p><p><lat>{e['translit']}</lat></p><p><b>Total KJV Occurrences:</b> {total}</p>"]
        for r, where in sorted(renderings.items(), key=lambda x: (-sum(x[1].values()), x[0])):
            refs = ", ".join(f"<ref>{BOOK_ABBR[b - 1]} {c}:{v}</ref>" + (f" ({k})" if k > 1 else "") for (b, c, v), k in sorted(where.items()))
            parts.append(f"<p><b>{html.escape(shown(n, r))}, {sum(where.values())}</b></p><p>{refs}</p>")
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
    s = re.sub(r'<p>\s*<hi type="italic">([^<]{1,100})</hi>', r"<p><b>\1:</b>", s)  # not a long quotation (1Sa 14:41's Latin)
    s = re.sub(r'<hi type="italic">([^<]*)</hi>', r"<i>\1</i>", s)
    s = re.sub(r"<p>\s*</p>", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    if s and not s.startswith("<p>"):
        s = "<p>" + s
    if s.count("<p>") > s.count("</p>"):
        s += "</p>"
    return s


HEBREW_1255 = re.compile(r"<i>([^<]*[\u0370-\u03ff][^<]*)</i>(?=\s*<num>H\d+)|<i>([^<]*ΰ[^<]*)</i>")


def tsk_hebrew(s):
    """The TSK's Hebrew words that CrossWire's text has in the Windows Greek code page ("ΰω�ψΰμδ", before H841): the
    same bytes read as Windows Hebrew (אשראלה). The letters the conversion lost (�) are dropped."""
    def one(m):
        w = (m[1] or m[2]).replace("\ufffd", "")
        try:
            heb = w.encode("cp1253").decode("cp1255")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return m[0]
        return f"<heb>{heb.strip()}</heb>"
    s = HEBREW_1255.sub(one, s)

    def run(m):  # a run of such letters outside <i> (the Exodus introduction's "εΰμδ ωׁξεϊ")
        w = m[0]
        if not (re.search("ΰ|[\u05b0-\u05c7]|ς(?=[\u0370-\u03ff])", w)):
            return w
        try:
            return "<heb>" + "".join(ch if "\u05b0" <= ch <= "\u05c7" else ch.encode("cp1253").decode("cp1255")
                                     for ch in w.replace("\ufffd", "")) + "</heb>"
        except (UnicodeEncodeError, UnicodeDecodeError):
            return w
    parts = re.split(r"(<heb>.*?</heb>|<[^>]+>)", s)
    s = "".join(x if x.startswith("<") else re.sub(r"[\u0370-\u03ff\u05b0-\u05c7]+(?: [\u0370-\u03ff\u05b0-\u05c7]+)*", run, x)
                for x in parts)
    # Latin words with letters in the Greek code page too: æ as ζ ("prζtorium"), ê as κ ("grκle"); æ as e-Sword's "ae".
    latin = {"ζ": "ae", "Ζ": "Ae", "κ": "ê"}
    s = re.sub(r"\b[A-Za-zΖζκ]*(?:[a-z][Ζζκ]|[Ζζκ][a-z])[A-Za-zΖζκ]*\b", lambda m: "".join(latin.get(ch, ch) for ch in m[0]), s)
    return re.sub(r"(\w|</i>)\s+,", r"\1,", s)  # "the land , Am haaretz"


def write_tsk():
    text = gzip.decompress(fetch(TSK_URL)).decode("utf-8")
    book_rows, chapter_rows, verse_rows = [], [], []
    for m in re.finditer(r"^\$\$\$(.+?) (\d+):(\d+)\n(.*?)(?=^\$\$\$|\Z)", text, re.S | re.M):
        b = SWORD.get(m[1])
        if not b:
            continue
        c, v, body = int(m[2]), int(m[3]), tsk_hebrew(tsk_html(m[4]))
        if not body:
            continue
        if c == 0:
            book_rows.append((b, body))
        elif v == 0:
            chapter_rows.append((b, c, body))
        else:
            verse_rows.append((b, c, v, c, v, body))
    info = ("<p>The Treasury of Scripture Knowledge: some 500,000 cross-references for every verse, from the margins of "
            "Canne, Browne, Blayney, Scott and others, published by Samuel Bagster (about 1834), with an introduction by "
            "R. A. Torrey in later editions.</p>"
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
    if not all(x.isdigit() for x in bits[1:]):  # "John.1Jo.2" (JFB)
        return None
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
        if b[0] != a[0]:  # into another book ("1Ki 22:51-2Ki 1:18"): the app reads no such range, so its start
            pass
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


def rtf_escapes(s):
    """What an RTF conversion left in the text: \\uN (a character by its number, "\\uu903?" in Clarke's Greek), and
    backslashes alone (Henry's "to the \\ utmost")."""
    s = re.sub(r"\\u+(-?\d+)\??", lambda m: chr(int(m[1]) % 65536), s)
    return re.sub(r"\s*\\+\s*", " ", s)


def henry_html(s, book, chapter):
    """A stretch of Matthew Henry's OSIS as e-Sword's HTML."""
    s = henry_refs(rtf_escapes(s), book, chapter)
    s = re.sub(r"<note\b.*?</note>", "", s, flags=re.S)  # the editors' footnotes
    s = re.sub(r"(&lt;){3,}[^<]*", "", s)  # "<<< Unabridged", a marker left in the text
    def title(m):
        """A heading, in bold; but a "heading" holding a whole note (JFB's "Gen 49:5-7. Simeon and Levi were associate
        in wickedness…") is the note: only its opening reference is bold."""
        if len(re.sub(r"<[^>]+>", "", m[1]).strip()) <= 150:
            return f"<p><b>{m[1]}</b></p>"
        lead = re.match(r"\s*((?:<ref>[^<]*</ref>[,;]?\s*)+\.?)(.*)", m[1], re.S)
        return f"<p><b>{lead[1].strip()}</b> {lead[2].strip()}</p>" if lead else f"<p>{m[1]}</p>"
    s = re.sub(r'<title[^>]*>(.*?)</title>', title, s, flags=re.S)
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

    def run_on(m):
        """A catchword whose bold the source never closed, running on into the note (JFB's Exo 16:3, Deu 3:3): bold to
        its "--", or only its verse label ("3-8."), or not at all."""
        t = m[1]
        if len(re.sub(r"<[^>]+>", "", t)) <= 150:
            return m[0]
        cut = t.find("--")
        if 0 <= cut < 150:
            return f"<b>{t[:cut + 2]}</b>{t[cut + 2:]}"
        label = re.match(r"\d+(?:[-,]\s*\d+)?\.\s*", t)
        return f"<b>{label[0].strip()}</b> {t[label.end():]}" if label else t
    s = re.sub(r"<b>((?:(?!</?b>).)*)</b>", run_on, s, flags=re.S)
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
    def f(ext):  # the module's own files, or dict.* where those are its name (Nave's)
        names = [n for n in z.namelist() if n.endswith(f".{ext}")]
        return z.read(next((n for n in names if "/dict." not in n), names[0]))
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
    s = re.sub(r'<ref target="[^"]*">(.*?)</ref>', r"\1", s, flags=re.S)  # "See ABIJAH": the name, which the app links
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
    if not typos:
        return s
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
            rows.append((tidy_topic(name[1] if name else key.title()).replace("Arippa", "Agrippa"), body))
    joined = {}
    for t, b in rows:  # Kadesh and Salmon twice: one topic each, numbered
        joined.setdefault(t, []).append(b)
    rows = [(t, numbered(b)) for t, b in joined.items()]
    info = ("<p>Easton's Bible Dictionary: M. G. Easton's Illustrated Bible Dictionary, third edition (Thomas Nelson, 1897), "
            "without its illustrations.</p>"
            "<p>Public domain. CrossWire's Easton module (2.0.1), from the Christian Classics Ethereal Library. "
            "Built by Two-edged Sword's tools/core.</p>")
    with module("easton.dcti", "Easton's Bible Dictionary", "Easton", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Dictionary VALUES (?,?)", rows)
    print(f"easton.dcti: {len(rows)} topics")


# ---- More of CrossWire's commentaries and dictionaries ------------------------------------------

def utf8_or_1252(raw):
    """A slot's text: UTF-8, but for single bytes in Windows-1252 among it (Barnes' "30° 50'" and "(†)" beside UTF-8 Greek)."""
    t = raw.decode("utf-8", "surrogateescape")
    return re.sub(r"[\udc80-\udcff]", lambda m: bytes([ord(m[0]) - 0xdc00]).decode("cp1252", "replace"), t)


def zcom(z, test):
    """Every slot of a zCom testament, as zcom4 gives them: the same format with a 2-byte size in
    the verse index. A module blocked by chapter (Barnes) names its files .czs, .czv and .czz."""
    def f(ext):
        return z.read(next(n for n in z.namelist() if re.search(rf"/{test}\.[bcv]{ext}$", n)))
    bzs, bzv, bzz = f("zs"), f("zv"), f("zz")
    blocks, out = {}, []
    for i in range(len(bzv) // 10):
        block, offset, size = struct.unpack_from("<IIH", bzv, i * 10)
        if not size:
            out.append((None, ""))
            continue
        if block not in blocks:
            start, length, _ = struct.unpack_from("<III", bzs, block * 12)
            blocks[block] = zlib.decompress(bzz[start:start + length])
        out.append(((block, offset), utf8_or_1252(blocks[block][offset:offset + size])))
    return out


def sword_chapters(z, canon, reader):
    """Each chapter of a SWORD commentary in the KJV's versification, as (book, chapter, verses,
    heading, entries): the heading is the chapter's slot (and, for chapter 1, the book's), and
    entries are [first verse, last verse, text], verses linked to one entry being one."""
    for test, bs in canon("KJV").items():
        try:
            slots = reader(z, test)
        except StopIteration:  # a module of one testament (Barnes)
            continue
        i = 2  # the module's heading, the testament's
        for osis, lengths in bs:
            book_head = slots[i][1]
            i += 1
            for c, n in enumerate(lengths, 1):
                head = (book_head if c == 1 else "") + slots[i][1]
                i += 1
                entries = []
                for v, (where, text) in enumerate(slots[i:i + n], 1):
                    if entries and where and where == entries[-1][0]:
                        entries[-1][2] = v
                    elif text.strip():
                        entries.append([where, v, v, text])
                i += n
                yield OSIS_BOOK[osis], c, n, head, [e[1:] for e in entries]
        if i != len(slots):
            sys.exit(f"{test}: {len(slots)} slots, the versification has {i}")


# Book names and abbreviations the sources use where a reference isn't OSIS ("Mt 3:3", "1Timm 2:5",
# "nu 26:59", osisRef "1Jn.3.1"): each name's books, the likeliest first; a reference takes the first
# with the verse it names.
ABBREVS = {
    "ge": "Gen", "ex": "Exod", "le": "Lev", "nu": "Num", "de": "Deut", "jos": "Josh", "jdg": "Judg", "ju": "Judg",
    "jud": "Judg Jude", "ru": "Ruth", "es": "Esth", "est": "Esth", "ne": "Neh", "ps": "Ps", "pss": "Ps", "pr": "Prov",
    "ec": "Eccl", "so": "Song", "song": "Song", "cant": "Song", "is": "Isa", "je": "Jer", "la": "Lam", "eze": "Ezek",
    "ezk": "Ezek", "ez": "Ezek", "da": "Dan", "ho": "Hos", "joe": "Joel", "am": "Amos", "ob": "Obad", "jon": "Jonah",
    "mi": "Mic", "na": "Nah", "zep": "Zeph", "ze": "Zech", "mt": "Matt", "mk": "Mark", "mr": "Mark", "lk": "Luke",
    "lu": "Luke", "jn": "John", "ca": "Song", "jno": "John", "joh": "John", "ac": "Acts", "ro": "Rom", "rm": "Rom", "ga": "Gal",
    "ep": "Eph", "ph": "Phil Phlm", "phi": "Phil Phlm", "php": "Phil", "co": "Col", "phm": "Phlm Phil", "philem": "Phlm",
    "he": "Heb", "jas": "Jas", "jam": "Jas", "re": "Rev", "1jo": "1John", "2jo": "2John", "3jo": "3John",
    "1jn": "1John", "2jn": "2John", "3jn": "3John", "1joh": "1John", "2joh": "2John", "3joh": "3John",
}
BOOK_KEYS = [(i + 1, [x.lower() for x in (b[1], b[2], n.replace(" ", ""))]) for i, (b, n) in enumerate(zip(BOOKS, BOOK_NAMES))]


def books_named(name):
    """The books a name or abbreviation may be ("Jud": Judges, Jude), the likeliest first; a name the
    source misspelt ("1Timm", "Actst") is read as the longest start of it that names one."""
    # "II Kings", "I Cor": a numeral only with a space or stop after it (or II, III), so Isaiah's "Isa" stays Isaiah
    if re.match(r"(?i)\s*(i{1,3}[\s.]|i{2,3})", name):
        name = re.sub(r"(?i)^\s*(i{1,3})[\s.]*(?=co|th|ti|pe|jn|jo|ki|kg|sa|ch|es|ma)", lambda m: str(len(m[1])), name)
    k = re.sub(r"[\s.]", "", name).lower()
    for n in range(len(k), 1, -1):
        p = k[:n]
        if p in ABBREVS:
            return [OSIS_BOOK[x] for x in ABBREVS[p].split()]
        found = [b for b, keys in BOOK_KEYS if any(x == p for x in keys)] or [b for b, keys in BOOK_KEYS if any(x.startswith(p) for x in keys)]
        if found:
            return found
    return []


def fix_osis_books(s):
    """osisRefs with a book that isn't OSIS's ("1Jn.3.1" in Clarke) given the book it means."""
    def one(m):
        def part(p):
            bits = p.split(".")
            if bits[0] in OSIS_BOOK or not re.match(r"[1-3]?[A-Za-z]", bits[0]):
                return p
            for b in books_named(bits[0]):
                q = [b] + [int(x) for x in bits[1:3] if x.isdigit()]
                if len(q) == 1 or real(tuple((q + [0, 0])[:3])):
                    return ".".join([BOOKS[b - 1][1]] + bits[1:])
            return p
        return f'osisRef="{" ".join("-".join(part(x) for x in r.split("-")) for r in m[1].split())}"'
    return re.sub(r'osisRef="([^"]*)"', one, s)


PASSAGE = re.compile(r"\s*((?:[1-3]|I{1,3})?\s*[A-Za-z][A-Za-z.]*)?\.?\s*(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$")


def passage_refs(p, book=None, chapter=None):
    """A passage ("Lev 4:3, 6:20, Ex 28:41", "ge 12:10-20", "4, 9" after Rev 1:1) as e-Sword's <ref>s,
    each checked against the KJV, with the book and chapter it ends in (a part with no book is in the
    one before); None if any part isn't a real verse."""
    out = []
    for part in re.split(r"[;,]", p.replace("&amp;", ",").replace(" and ", ",")):
        if not part.strip():
            continue
        m = PASSAGE.match(part)
        if not m:
            return None
        name, n1, n2, n3, n4 = m[1], int(m[2]), m[3] and int(m[3]), m[4] and int(m[4]), m[5] and int(m[5])
        candidates = books_named(name) if name else [book]
        if not candidates or candidates == [None]:
            return None
        for b in candidates:
            if n2:  # c:v, c:v-v2, c:v-c2:v2
                a, z = (b, n1, n2), (b, n3, n4) if n4 else (b, n1, n3) if n3 else None
            elif name and b in (31, 57, 63, 64, 65):  # a book of one chapter: "Jude 20" is its verse 20
                a, z = (b, 1, n1), (b, 1, n3) if n3 else None
            elif name or chapter is None:  # a chapter, or chapters
                a, z = (b, n1, 0), (b, n3, 0) if n3 else None
            else:  # a verse, or verses, of the chapter before
                a, z = (b, chapter, n1), (b, chapter, n3) if n3 else None
            if real(a, z):
                break
        else:
            return None
        book, chapter = b, (z or a)[1] if a[2] else None
        out.append(f"<ref>{esword_ref(a, z)}</ref>")
    return ("; ".join(out), book, chapter) if out else None


def thml_refs(s):
    """ThML's <scripRef passage="…">shown</scripRef> as <ref>s, from the passage or else from what
    it shows; a passage with no book takes the one cited before it. One that is no real verse is
    left as text."""
    last = [None, None]

    def one(m):
        passage, shown = m[1], m[2]
        for p in (passage, re.sub(r"<[^>]+>", "", shown)):
            r = p and passage_refs(html_.unescape(p), *last)
            if r:
                last[:] = r[1:]
                return r[0]
        return shown
    return re.sub(r'<scripRef\b(?:[^>]*?\bpassage="([^"]*)")?[^>]*>(.*?)</scripRef>', one, s, flags=re.S)


def tidy(s):
    """Spacing and paragraphs, as the other builders leave them."""
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,.;:?!)\]])", r"\1", s)
    paras = (re.sub(r"^(<br>|\s)+|(<br>|\s)+$", "", x) for x in re.split(r"</?p>", s))
    return "".join(f"<p>{x}</p>" for x in paras if re.sub(r"<[^>]+>|\s", "", x))


def has_text(s):
    return bool(re.sub(r"<[^>]+>|&\w+;|\W", "", s))


# The commentaries' labels for the verses a note is on: Clarke's "<hi type="bold">Verse 2</hi>",
# JFB's "<hi type="bold">14-16. And as Moses--</hi>", Barnes' "Verses 22, 23." at a paragraph's start.
CLARKE_LABEL = re.compile(r'<hi type="bold">\s*Verses?\s+(\d+)')
JFB_LABEL = re.compile(r'<hi type="bold">\s*(\d+)(?:[-,]\s*\d+)?\.')
# The start of a chapter's own introduction, in the text before its first note.
CHAPTER_START = re.compile(r'<title[^>]*>\s*CHAPTER\s+[\dIVXLC]+\b|<title type="x-s">Introduction</title>\s*<div\b[^>]*\bsID="[^"]*"[^>]*type="introduction"', re.I)


def shown_refs(s, book, chapter):
    """CCEL's links are often wrong where a reference shows no book ("Re 1:1, 4, 9" links 4, 9 to
    1 Corinthians 4:9): those are read from what they show, in the book and chapter cited before
    (or the passage in hand), unless the link is to a real verse of that book. The rest are left for
    henry_refs."""
    last = [book, chapter]

    def one(m):
        osis, shown = m[1], m[2]
        text = re.sub(r"<[^>]+>", "", shown)
        p = osis_part(osis.split()[0].split("-")[0], book, last[0]) if osis else None
        named = re.match(r"\s*(?:[1-3]\s*)?[A-Za-z]{2}", text)
        if not named and p and p[0] == last[0] and real(p):
            last[:] = [p[0], p[1]]
            return m[0]
        r = passage_refs(html_.unescape(text), *last)
        if r:
            last[:] = r[1:]
            return r[0]
        if p:
            last[:] = [p[0], p[1]]
        return m[0]
    return re.sub(r'<reference osisRef="([^"]*)">(.*?)</reference>', one, s, flags=re.S)


def commentary_html(s, book, chapter, typos):
    """A stretch of an OSIS commentary as e-Sword's HTML, its references written as text ("[Ge 1:31]", "(Mal 3:6)",
    the "17, 18" after a link) linked too."""
    s = correct(henry_html(shown_refs(fix_osis_books(s), book, chapter), book, chapter), typos)
    return link_continuations(link_plain_refs(s))


def osis_commentary(name, typos, label):
    """A CrossWire OSIS commentary (JFB's zCom4, Clarke's zCom) as e-Sword's three tables. The text
    before a chapter's first note is its introduction (and, in chapter 1, the book's before that);
    references are repaired as in Matthew Henry's."""
    z, canon = crosswire(name)
    from crosswire.build import conf
    reader = zcom4 if conf(z)["ModDrv"] == "zCom4" else zcom
    books, chapters, verses = [], [], []
    for b, c, n, head, entries in sword_chapters(z, canon, reader):
        if not entries:
            if has_text(commentary_html(head, b, c, typos)):
                chapters.append((b, c, commentary_html(head, b, c, typos)))
            continue
        first = head + entries[0][2]
        m = label.search(first)
        end = m.start() if m else len(first)
        if c == 1:  # the book's introduction, up to the chapter's heading or its first note
            starts = list(CHAPTER_START.finditer(first, 0, end))
            cut = starts[-1].start() if starts else end if m else 0
            intro = commentary_html(first[:cut], b, c, typos)
            if has_text(intro):
                books.append((b, intro))
            first, end = first[cut:], end - cut
        pre, entries[0][2] = (first[:end], first[end:]) if m else ("", first)
        # A chapter's introduction is its own entry; headings alone stay with the first note.
        plain = re.sub(r"<[^>]+>|\s+", " ", re.sub(r"<title\b.*?</title>", "", pre, flags=re.S)).strip()
        if 'type="introduction"' in pre or len(plain) > 300:
            chapters.append((b, c, commentary_html(pre, b, c, typos)))
        else:
            entries[0][2] = pre + entries[0][2]
        covered, pending = 0, ""
        for v1, v2, text in entries:
            # An entry filed a verse late starts where its label says, or where the heading before it names
            # (JFB's '<title><reference osisRef="Gen.49.5-Gen.49.7">', filed at Gen 49:10).
            m = label.search(text)
            h = re.match(rf'\s*(?:<[^>]+>\s*)*<title[^>]*>\s*<reference osisRef="[^".]+\.{c}\.(\d+)', text)
            if m and covered < int(m[1]) < v1:
                v1 = int(m[1])
            elif h and covered < int(h[1]) < v1:
                v1 = int(h[1])
            covered = v2
            body = pending + commentary_html(text, b, c, typos)
            # Headings alone are short bold paragraphs; a note that is all bold (JFB's Gen 49:5-7) is a note.
            if has_text(re.sub(r"<p><b>(?:(?!</p>).){0,200}?</b></p>", "", body)):
                verses.append((b, c, v1, c, v2, body))
                pending = ""
            else:  # headings with no note: with the next note
                pending = body
        if pending and verses and verses[-1][:2] == (b, c):
            verses[-1] = (*verses[-1][:4], n, verses[-1][5] + pending)
    return books, chapters, verses


def write_commentary(file, title, abbrev, info, tables):
    books, chapters, verses = tables
    with module(file, title, abbrev, info, into=BUNDLED) as db:
        db.executemany("INSERT INTO BookCommentary VALUES (?,?)", books)
        db.executemany("INSERT INTO ChapterCommentary VALUES (?,?,?)", chapters)
        db.executemany("INSERT INTO VerseCommentary VALUES (?,?,?,?,?,?)", verses)
    print(f"{file}: {len(verses)} notes, {len(chapters)} chapters, {len(books)} books, {(BUNDLED / file).stat().st_size / 1e6:.1f} MB")


def write_jfb():
    info = ("<p>A Commentary, Critical and Explanatory, on the Old and New Testaments, by Robert Jamieson, A. R. Fausset "
            "and David Brown (1871).</p>"
            "<p>Public domain. CrossWire's JFB module (3.0), from the Christian Classics Ethereal Library's text (ccel.org). "
            "Built by Two-edged Sword's tools/core.</p>")
    write_commentary("jfb.cmti", "Jamieson, Fausset & Brown Commentary", "JFB", info, osis_commentary("JFB", {}, JFB_LABEL))


def write_clarke():
    info = ("<p>Adam Clarke's Commentary and Critical Notes on the Holy Bible (1810–1826).</p>"
            "<p>Public domain. CrossWire's Clarke module (2.0), from Wikisource's text. Built by Two-edged Sword's tools/core.</p>")
    write_commentary("clarke.cmti", "Adam Clarke's Commentary on the Bible", "Clarke", info, osis_commentary("Clarke", {}, CLARKE_LABEL))


BARNES_LABEL = re.compile(r"(?:^|<br\s*/?>|<blockquote>)\s*(?:(?:[1-3]\s?)?[A-Z][A-Za-z]+\s+)?(?:Verses?|Ver)\.?\s*(\d+)(?:\s*(?:[-–,]|and)\s*(\d+))*\b[.:]?")
BARNES_NONE = re.compile(r"No (?:specific (?:Barnes text|notes from Barnes) on|entry from BARNES for) this verse\.?\s*(?:<scripRef[^>]*>[^<]*</scripRef>\.?)?", re.I)


def link_continuations(s):
    """Verses after a link that the source left bare ("<ref>Pro 1:11</ref>, 17, 18"): each linked, in the same chapter."""
    def more(m):
        book, ch = m[2], m[3]
        rest = re.sub(r"(?<=[,;] )(\d{1,3})(?:[-–](\d{1,3}))?(?![\d:])",
                      lambda n: f"<ref>{book} {ch}:{n[1]}{'-' + n[2] if n[2] else ''}</ref>"
                      if passage_refs(f"{book} {ch}:{n[1]}") else n[0], m[4])
        return m[1] + rest
    return re.sub(r"(<ref>(\w+) (\d+):\d+(?:-\d+)?</ref>)((?:[,;] \d{1,3}(?:[-–]\d{1,3})?(?![\d:]))+)", more, s)


def barnes_html(s):
    """Barnes' ThML as e-Sword's HTML: a blank line or a block quotation is a paragraph."""
    s = s.replace('Greek, "\ufffde are the sons', 'Greek, "Ye are the sons')  # Act 3:25, a letter lost in the source
    # The e-text's notes on itself ("Due to the length of Introductory Material, please find it starting in …"), whose links go nowhere.
    s = re.sub(r"(?:Note: )?Due to the length of [^<]*?please find it starting in <scripRef[^>]*>[^<]*</scripRef>\.?|"
               r"Also, [Ss]ee an Outline of the Entire Book <scripRef[^>]*>[^<]*</scripRef>\.?", "", s)
    s = thml_refs(BARNES_NONE.sub("", s))
    s = re.sub(r"(?<=[a-z,;])\s*<br\s*/?>\s*(?=[a-z])", " ", s)  # a line break inside a sentence
    s = re.sub(r"(?:<br\s*/?>\s*){2,}|</?blockquote>", "</p><p>", s)
    s = re.sub(r"<br\s*/?>", "<br>", s)
    s = re.sub(r"<(?!/?(p|b|i|br|ref)>)[^>]*>", " ", s)
    return link_continuations(link_plain_refs(tidy(s.replace("&nbsp;", " "))))


def write_barnes():
    """Barnes' notes, placed by their labels ("Verse 16.", "Verses 22, 23."): CrossWire's module has
    the books' prefaces in the first verses' slots, and notes a slot or two from their verses."""
    z, canon = crosswire("Barnes")
    books, chapters, verses = [], [], []
    for b, c, n, head, entries in sword_chapters(z, canon, zcom):
        # A chapter's own slot holds a stray copy of a note from the chapter before, so it's left out.
        text = "<br /><br />".join(t for _, _, t in entries)
        marks = [m for m in BARNES_LABEL.finditer(text) if 1 <= int(m[1]) <= n]
        pre = text[:marks[0].start()] if marks else text
        pre = re.sub(r"^\s*(?:[A-Z]+\s+)*CHAPTER\s+[\w.]+\.?", "", pre.strip(), flags=re.I)
        pre = re.sub(r"^\s*(?:<br\s*/?>\s*)*INTRO:", "", pre)
        intro = re.sub(r"<p>(?:[A-Z]+\s+)*CHAPTER\s+[\w.]+\.?</p>", "", barnes_html(pre), flags=re.I)  # the heading alone
        if has_text(intro):
            (books.append((b, intro)) if c == 1 else chapters.append((b, c, intro)))
        for k, m in enumerate(marks):
            body = text[m.start():marks[k + 1].start() if k + 1 < len(marks) else len(text)]
            v1 = int(m[1])
            v2 = max(int(x) for x in re.findall(r"\d+", m[0][m.start(1) - m.start():]))
            v2 = v2 if v1 <= v2 <= n else v1
            html = barnes_html(body)
            if not has_text(re.sub(r"^<p>[^<]*?(Verses?|Ver)\.?\s*[\d\s,–-]*\.?", "", html)):
                continue
            if verses and verses[-1][:3] == (b, c, v1):  # the same verse again: one note
                verses[-1] = (b, c, v1, c, max(v2, verses[-1][4]), verses[-1][5] + html)
            else:
                verses.append((b, c, v1, c, v2, html))
    info = ("<p>Albert Barnes' Notes on the New Testament, Explanatory and Practical (1832–1851).</p>"
            "<p>Public domain. CrossWire's Barnes module (1.1); only the New Testament. Built by Two-edged Sword's tools/core.</p>")
    # A verse noted more than once (CrossWire's Luke 11:14-23 has the same note in each verse's slot): one note, each paragraph once.
    merged = {}
    for b, c, v1, c2, v2, body in verses:
        k = (b, c, v1)
        if k in merged:
            merged[k] = (b, c, v1, c2, max(v2, merged[k][4]), merged[k][5] + body)
        else:
            merged[k] = (b, c, v1, c2, v2, body)
    verses = [(*r[:5], "".join(dict.fromkeys(re.findall(r"<p>.*?</p>", r[5], flags=re.S)))) for r in merged.values()]
    write_commentary("barnes.cmti", "Barnes' Notes on the New Testament", "Barnes", info, (books, chapters, verses))


def rawld(z):
    """[(key, entry)] from a RawLD dictionary: .idx gives each entry's place and size in .dat, which
    holds its key, a line break and the entry. Old modules are in Latin-1 (Windows-1252)."""
    def f(ext):
        return z.read(next(n for n in z.namelist() if n.endswith(f".{ext}")))
    idx, dat = f("idx"), f("dat")
    out = []
    for i in range(len(idx) // 6):
        off, size = struct.unpack_from("<IH", idx, i * 6)
        key, _, body = dat[off:off + size].partition(b"\n")
        def dec(x):
            try:
                return x.decode("utf-8")
            except UnicodeDecodeError:
                return x.decode("cp1252", "replace")
        out.append((dec(key.rstrip(b"\r")), dec(body)))
    return out


SMALL = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"}


def topic_case(key):
    """"LOVE, BROTHERLY" → "Love, Brotherly"; "AARON'S ROD" → "Aaron's Rod"; "JOHN, GOSPEL OF" →
    "John, Gospel of", as e-Sword's dictionaries have them."""
    words = re.split(r"(\W+)", key.strip().lower())
    out = []
    for k, w in enumerate(words):
        prev = "".join(words[:k])
        if w and w[0].isalpha() and not (w in SMALL and prev.strip()) and not prev.endswith("'"):
            w = w[0].upper() + w[1:]
        out.append(w)
    s = "".join(out)
    s = re.sub(r"\b([IVX][ivx]*)\b(?=\s*(?:\)|,|;|$))", lambda m: m[1].upper(), s)  # "Herod Ii" → "Herod II"
    return re.sub(r"\b([AaRr])\. ?([Vv])\.", lambda m: f"{m[1].upper()}. {m[2].upper()}.", s)  # "(R. V.)", "(A. V.)"


def osis_dict_refs(s):
    """TEI <ref osisRef> → <ref>, each checked against the KJV, and "See <ref target>NAME</ref>" →
    the name, which the app links. One to no real verse is left as text."""
    s = re.sub(r'<ref osisRef="(?:Bible:)?([^".]+)\.1\.1">([^<]*)</ref>:(\d+)', r'<ref osisRef="\1.1.\3">\2:\3</ref>', s)  # "2Jo 1</ref>:6"
    s = fix_osis_books(s)

    def one(m):
        refs = []
        for part in m[1].split():
            a, _, b = part.partition("-")
            pa = osis_part(a, None, None)
            pb = osis_part(b, None, pa[0]) if b and pa else None
            if not pa or not real(pa, pb):
                return m[2]
            refs.append(f"<ref>{esword_ref(pa, pb)}</ref>")
        return "; ".join(refs)
    s = re.sub(r'<ref osisRef="(?:Bible:)?([^"]+)">(.*?)</ref>', one, s, flags=re.S)
    s = re.sub(r"<ref\s[^>]*>(.*?)</ref>", r"\1", s, flags=re.S)
    return s.replace("</ref>,<ref>", "</ref>, <ref>")


def tei_html(s):
    """A TEI dictionary entry (Nave's, ISBE) as e-Sword's HTML: lines (<lb/>) and list items are paragraphs."""
    s = re.sub(r"</?entryFree\b[^>]*>|</?def>|</?list>", "", s)
    s = osis_dict_refs(s)
    s = re.sub(r'<hi rend="(bold|italic|underline)">(.*?)</hi>', lambda m: f"<{m[1][0]}>{m[2]}</{m[1][0]}>", s, flags=re.S)
    s = re.sub(r"<lb\s*/>|</?item>", "</p><p>", s)
    s = re.sub(r"<(?!/?(p|b|i|u|ref)>)[^>]*>", "", s)
    return tidy(s)


def thml_dict_html(s):
    """Smith's ThML: scripture references, italics, and numbered lists as numbered paragraphs."""
    s = thml_refs(s)
    k = [0]

    def item(m):
        k[0] += 1
        return f"</p><p>{k[0]}. "
    s = re.sub(r"<ol\b[^>]*>", lambda m: (k.__setitem__(0, 0), "</p>")[1], s)
    s = re.sub(r"<li\b[^>]*>", item, s)
    s = re.sub(r"</li>|</ol>", "</p><p>", s)
    s = re.sub(r"<br\s*/?>", "</p><p>", s)
    s = re.sub(r"<(?!/?(p|b|i|ref)>)[^>]*>", "", s)
    return tidy(s)


def numbered(bodies):
    """Entries joined under one topic, each numbered when there are several (Smith's Arad the city, 1., and Arad the
    Benjamite, 2.), so one doesn't run into the next."""
    if len(bodies) == 1:
        return bodies[0]
    return "".join(re.sub(r"^<p>", f"<p><b>{k}.</b> ", b, count=1) for k, b in enumerate(bodies, 1))


def tidy_topic(t):
    """A topic as the app lists it: no trailing comma or stop ("Rail; Railing; Railer,", "Agrippa I."), "&c." as written."""
    return re.sub(r"[,.;]+$", "", re.sub(r"&C\b\.?", "&c.", t)).strip()


def write_dictionary(file, title, abbrev, info, entries, to_html, topics=None):
    """Entries under the same topic are joined, in the source's order, and numbered; `topics` renames ones the
    source names wrongly."""
    rows = {}
    for key, entry in entries:
        name = re.search(r'<entryFree n="([^"]+)"', entry)
        topic = tidy_topic(topic_case(html_.unescape(name[1] if name else key)))
        topic = (topics or {}).get(topic, topic)
        body = correct(to_html(entry), {})
        if body:
            rows.setdefault(topic, []).append(body)
    rows = {t: numbered(b) for t, b in rows.items()}
    with module(file, title, abbrev, info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Dictionary VALUES (?,?)", sorted(rows.items(), key=lambda r: r[0].lower()))
    print(f"{file}: {len(rows)} topics, {(BUNDLED / file).stat().st_size / 1e6:.1f} MB")


def write_smith():
    z, _ = crosswire("Smith")
    info = ("<p>Smith's Bible Dictionary, by William Smith (1884 edition).</p>"
            "<p>Public domain. CrossWire's Smith module (1.3). Built by Two-edged Sword's tools/core.</p>")
    write_dictionary("smith.dcti", "Smith's Bible Dictionary", "Smith", info, rawld(z), smith_html, SMITH_TOPICS)


# Smith's topics the source names wrongly.
SMITH_TOPICS = {"High Places6813 Priest": "High Priest"}
# Lapidoth has Laodiceans' text in the source; Smith's own: "the husband of Deborah the prophetess. (Judg 4:4)".
SMITH_TEXT = [("(<i>torches</i>), the inhabitants of Laodicea.",
               '(<i>torches</i>), the husband of Deborah the prophetess. (<scripRef passage="jud 4:4">Judges 4:4</scripRef>)')]


def smith_html(s):
    """Smith's ThML, its cross-references ("[ABILENE]", "[ZARETAN, OR ZARTHAN]") written as "See ABILENE", which the
    app links; a name the source doubled ("THREE TAVERNS TAVERNS") once."""
    def see(m):
        name = re.sub(r"\b(\w+) \1\b", r"\1", m[1].split(",")[0].strip())
        return f"See {name}."
    s = re.sub(r"\[((?:<term>)?[A-Z][^\]<]*(?:</term>)?(?:[^\]]*))\]", lambda m: f"[{re.sub(r'<[^>]+>', '', m[1])}]", s)
    s = re.sub(r"\[([A-Z][A-Z '-]{2,}(?:, [A-Z ,'-]+)?)\]", see, s)
    for wrong, right in SMITH_TEXT:  # an entry the source has another's text for
        if s.startswith(wrong):
            s = right
    return thml_dict_html(s)


def write_nave():
    z, _ = crosswire("Nave")
    info = ("<p>Nave's Topical Bible: some 20,000 topics and subtopics with the verses on each, by Orville J. Nave (1896).</p>"
            "<p>Public domain. CrossWire's Nave module (3.0), from the Christian Classics Ethereal Library. "
            "Built by Two-edged Sword's tools/core.</p>")
    write_dictionary("nave.dcti", "Nave's Topical Bible", "Nave", info, zld(z), nave_html)


def nave_html(s):
    """Nave's TEI, but for a ">" the source escaped twice ("See DEATH&amp;gt;") and sentences it ran together ("Martha.Sickness")."""
    s = re.sub(r"&amp;gt;|&gt;", "", s.replace("&amp;amp;", "&amp;"))
    return re.sub(r"(?<=[a-z])\.(?=[A-Z][a-z])", ". ", tei_html(s))


def write_isbe():
    z, _ = crosswire("ISBE")
    info = ("<p>The International Standard Bible Encyclopedia, edited by James Orr (1915).</p>"
            "<p>Public domain. CrossWire's ISBE module (2.2). Built by Two-edged Sword's tools/core.</p>")
    write_dictionary("isbe.dcti", "International Standard Bible Encyclopedia", "ISBE", info, zld(z), isbe_html)


def isbe_html(s):
    """The ISBE's TEI, but for characters an old conversion left in code page 437 ("90ø F." for 90° F., "termsú" for
    "terms."), the "||" before its outlines, and pieces of markup ("CS&gt;;", ".&gt;.")."""
    s = re.sub(r"(?<=\d)ø", "°", s)
    s = re.sub(r"ú(?=\s*(?:</p>|<|$|[A-Z(]))", ".", s)
    s = s.replace(" ú ", " ").replace("ú", "")
    s = re.sub(r"[A-Z]{0,3}&gt;;?", "", s)
    s = re.sub(r"<p>\s*\|\|\s*", "<p>", tei_html(s))
    return re.sub(r"\.\.(?=</p>)", ".", s)


PLAIN_PASSAGE = re.compile(r"\b((?:[1-3] ?)?[A-Z][a-z]{1,15}\.?) (\d{1,3}):(\d{1,3})(?:[-–]\d{1,3})?(?:, ?\d{1,3}(?![\d:]))*")


def link_plain_refs(s):
    """References written as text ("Philippians 1:27", "Lu 6:1, 3") as <ref>s, where each is a real verse; text
    in tags and in <ref>s already is left alone."""
    def one(m):
        r = passage_refs(m[0])
        return r[0] if r else m[0]
    parts = re.split(r"(<ref\b.*?</ref>|<[^>]+>)", s, flags=re.S)
    return "".join(x if x.startswith("<") else PLAIN_PASSAGE.sub(one, x) for x in parts)


def write_webster1828():
    z, _ = crosswire("Webster1828")
    info = ("<p>An American Dictionary of the English Language, by Noah Webster (1828): English words as they were "
            "used in his day, close to the King James Version's English.</p>"
            "<p>The dictionary is public domain. This edition is Akai Tsurugi's (https://github.com/akaitsurugi/webster1828), "
            "as CrossWire's Webster1828 module (1.2), licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). "
            "Built by Two-edged Sword's tools/core, and shared under the same licence.</p>")
    write_dictionary("webster1828.dcti", "Webster's Dictionary (1828)", "Webster 1828", info, zld(z), lambda e: link_plain_refs(re.sub(r"\brn(?=(?:[1-3] ?)?[A-Z][a-z]{1,3} \d)", "", tei_html(e))))


# ---- Brown-Driver-Briggs, unabridged ---------------------------------------------------------------

BDB_URL = ("https://raw.githubusercontent.com/eliranwong/unabridged-BDB-Hebrew-lexicon/"
           "6e8326c6884f8ef1399c7a365d660da9bb9e2d01/unabridged-BDB-Hebrew-lexicon.csv.zip")
SHA256[BDB_URL] = "056276bd606cb394a8b5026dfd3401c3a8e27e9d3f858e45a20a48ce520a98e6"
BDB_SIGLA = {"ᵐ5": "LXX", "ᵑ7": "Tg", "ᵑ6": "Syr", "ᵑ0": "MT", "ᵑ9": "Vg"}
BDB_REF = re.compile(r'(<checkingNeeded/>\s*)?<ref ref="[^"]*" b="(\d+)" cBegin="(\d+)" vBegin="(\d+)" cEnd="(\d+)" vEnd="(\d+)"[^>]*>(.*?)</ref>', re.S)


def bdb_html(s, vmap):
    """An entry of Eliran Wong's BDB as e-Sword's HTML. Its references are in the Hebrew Bible's
    numbering: each links to the KJV's verse (`vmap`, the WLC's to the KJV's) and shows BDB's own. One
    its editor marked for checking (<checkingNeeded/>), or that is no verse in the KJV, is left as text."""
    s = re.sub(r"<h1>.*?</h1>|<div class=\"navigation\">.*?</div>|<wrongReferenceRemoved/>|«[^»]*»|\\&emsp;", "", s, flags=re.S)

    def ref(m):
        flagged, (b, c, v, c2, v2), shown = m[1], map(int, m.group(2, 3, 4, 5, 6)), m[7]
        kjv = vmap.get((b, c, v), {}).get(None, (b, c, v)) if b <= 39 else (b, c, v)
        if flagged:  # its book, which the source's parser guessed, is often wrong ("only Psalm Eccl 139:9"): the verse alone
            return re.sub(r"^.*?(\d+:\d+(?:[-–]\d+)?)\s*$", r"\1", shown)
        if not 1 <= b <= 66 or not real(kjv):
            return shown
        end = vmap.get((b, c2, v2), {}).get(None, (b, c2, v2)) if b <= 39 else (b, c2, v2)
        to = f"-{end[2]}" if end[:2] == kjv[:2] and end[2] > kjv[2] and real(end) else ""
        return f'<ref v="{BOOK_ABBR[kjv[0] - 1]} {kjv[1]}:{kjv[2]}{to}">{shown}</ref>'
    s = BDB_REF.sub(ref, s)
    s = re.sub(r"<checkingNeeded/>", "", s)
    # The ancient versions, which the source writes with stand-ins for BDB's signs: the Septuagint, Targum and so on.
    s = re.sub(r"<bdbheb>(?:<reflink>)?(ᵐ5|ᵑ7|ᵑ6|ᵑ0|ᵑ9)(?:</reflink>)?</bdbheb>", lambda m: BDB_SIGLA[m[1]], s)
    s = re.sub(r"<placeholder\d*/>", "…", s)  # an Arabic, Syriac or Ethiopic word, a picture in the source
    s = re.sub(r"<(/?)(?:bdbheb|bdbarc)>", r"<\1heb>", s)
    s = re.sub(r"<(/?)highlightword>", r"<\1b>", s)
    s = re.sub(r"<(/?)(?:highlight|transliteration)>", r"<\1i>", s)
    s = re.sub(r"<div\b[^>]*>|</div>|<hr\s*/?>|<br\s*/?>", "</p><p>", s)
    s = re.sub(r"<(?!/?(p|b|i|sup|sub|heb|grk|ref)\b)[^>]*>", "", s)  # lookup, entry, reflink, big: their text
    s = re.sub(r"<(i|b)>\s*</\1>|<i><i>|</i></i>", "", s).replace("\\", "")
    return balanced(tidy(s))


def balanced(s):
    """`s` with each <i>, <b>, <heb>, <grk>, <sup> and <sub> closed where it was opened, within its paragraph: one the
    source left open is closed at the paragraph's end, one it never opened is dropped."""
    out, open_ = [], []
    for t in re.split(r"(</?(?:i|b|p|heb|grk|sup|sub)>)", s):
        m = re.fullmatch(r"<(/?)(i|b|p|heb|grk|sup|sub)>", t)
        if not m:
            out.append(t)
        elif m[2] == "p":
            if m[1]:
                out += [f"</{x}>" for x in reversed(open_)]
                open_ = []
            out.append(t)
        elif not m[1]:
            open_.append(m[2])
            out.append(t)
        elif m[2] in open_:
            while open_:
                x = open_.pop()
                out.append(f"</{x}>")
                if x == m[2]:
                    break
    return "".join(out)


def hebrew_key(w, level):
    """A Hebrew headword for matching, at three levels: 0 its letters and vowels (no accents; holam on vav one
    way), 1 its letters, 2 its letters but for ו and י (מָקוֹם and מָקֹם alike). Final forms count as the others."""
    t = unicodedata.normalize("NFD", w or "").replace("\u05ba", "\u05b9")
    keep = (lambda ch: "\u05d0" <= ch <= "\u05ea" or "\u05b0" <= ch <= "\u05bc" or ch in "\u05c1\u05c2") if level == 0 else \
        (lambda ch: "\u05d0" <= ch <= "\u05ea")
    t = "".join(ch for ch in t if keep(ch)).translate(str.maketrans("ךםןףץ", "כמנפצ"))
    return t.replace("ו", "").replace("י", "") if level == 2 else t


# Articles the headwords can't place: their numbers, by BDB id. זֶה is H2088 (and its feminine זֹאת H2063), which
# the source lists only as H2063, H2089 sharing the headword.
BDB_NUMBERS = {"BDB2289": ["H2088", "H2063"]}


def write_bdb():
    """bdb_unabridged.lexi: an entry per Strong's number, the BDB articles for it in BDB's order. The source
    lists with an article every number it mentions (the YHWH article with צָבָא's and אֱלֹהִים's), and here
    and there its numbers are a row out (Gamaliel under H1581, camel's; camel under none). So each article is
    filed by its headword: under the numbers it lists whose Strong's headword is its own (pointed, then by
    letters, then by letters but for ו and י), or else under the one Strong's number whose headword it is;
    failing both, under the numbers it lists. A number it lists that is left with no article (יָלַךְ, which
    BDB treats under הָלַךְ) has those articles again. A root ("√ of following"), and an article with no
    number and no headword of its own, goes before the next article that is filed."""
    import wlc.build as wlc
    vmap = wlc.verse_map()
    z = zipfile.ZipFile(io.BytesIO(fetch(BDB_URL)))
    text = z.read(next(n for n in z.namelist() if n.endswith(".csv") and "__MACOSX" not in n)).decode("utf-8-sig")
    sdb = sqlite3.connect(f"file:{BUNDLED / 'strong.lexi'}?mode=ro", uri=True)
    strong = {t: (re.search(r"<heb>(.*?)</heb>", d) or [None, ""])[1] for t, d in sdb.execute("SELECT Topic, Definition FROM Lexicon WHERE Topic LIKE 'H%'")}
    sdb.close()
    by_key = [defaultdict(list) for _ in range(3)]
    for n, w in strong.items():
        for level in range(3):
            by_key[level][hebrew_key(w, level)].append(n)
    articles = []  # (numbers, body, headword)
    for line in text.split("\n")[1:]:
        if not line.strip():
            continue
        bdb_id, nums, content = line.split("\t", 2)
        head = (re.search(r"<bdbheb>(.*?)</bdbheb>", re.sub(r"<h1>.*?</h1>|<div class=\"navigation\">.*?</div>", "", content)) or [None, ""])[1]
        nums = [num(n) for n in nums.split("_") if n.strip() and num(n) != "H0"]
        articles.append((nums, bdb_html(content, vmap), re.sub(r"<[^>]+>", "", head), bdb_id))

    def file_under(nums, head, body):
        root = "√" in re.sub(r"<[^>]+>", "", body)[:200]
        for level in range(3):
            c = by_key[level].get(hebrew_key(head, level), []) if hebrew_key(head, level) else []
            listed = [n for n in nums if n in c]
            if listed:
                return listed
            if len(c) == 1 and not root:
                return c
        return nums
    filed = [BDB_NUMBERS.get(a[3]) or file_under(a[0], a[2], a[1]) for a in articles]
    have = {n for f in filed for n in f}
    for k, (nums, *_) in enumerate(articles):
        filed[k] = filed[k] + [n for n in nums if n not in have and n not in filed[k]]
    rows, pending = {}, ""
    for (_, body, *_), f in zip(articles, filed, strict=True):
        if not f:
            pending += body
            continue
        for n in f:
            rows[n] = rows.get(n, "") + pending + body
        pending = ""
    moved = sum(1 for (n, *_), f in zip(articles, filed, strict=True) if set(n) != set(f))
    print(f"  bdb: {moved} articles filed otherwise than the source lists them")
    unplaced = len(pending) > 0
    info = ("<p>A Hebrew and English Lexicon of the Old Testament, by Francis Brown, S. R. Driver and Charles A. Briggs "
            "(1906), unabridged, with its Biblical Aramaic, under the Strong's numbers of its words.</p>"
            "<p>Its references are BDB's, in the Hebrew Bible's numbering, and open the same verse in the KJV's. "
            "Arabic, Syriac and Ethiopic words, pictures in the source, are shown as …</p>"
            "<p>Public domain. Eliran Wong's edition (https://github.com/eliranwong/unabridged-BDB-Hebrew-lexicon), "
            "from Tim Morton's text for Bible Analyzer, with references parsed by Stephen Ku. "
            "Built by Two-edged Sword's tools/core.</p>")
    with module("bdb_unabridged.lexi", "Brown-Driver-Briggs Hebrew Lexicon (unabridged)", "BDB", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Lexicon VALUES (?,?)", sorted(rows.items(), key=lambda r: (len(r[0]), r[0])))
    print(f"bdb_unabridged.lexi: {len(rows)} numbers{', a root at the end left out' if unplaced else ''}, "
          f"{(BUNDLED / 'bdb_unabridged.lexi').stat().st_size / 1e6:.1f} MB")


# The commentaries and dictionaries beyond Matthew Henry and Easton: id → (file, builder).
MORE = {"jfb": ("jfb.cmti", write_jfb), "clarke": ("clarke.cmti", write_clarke), "barnes": ("barnes.cmti", write_barnes),
        "smith": ("smith.dcti", write_smith), "nave": ("nave.dcti", write_nave), "isbe": ("isbe.dcti", write_isbe),
        "webster1828": ("webster1828.dcti", write_webster1828), "bdb": ("bdb_unabridged.lexi", write_bdb)}
# ---- other public-domain English Bibles, from eBible.org ------------------------------------------

EBIBLE = "https://ebible.org/Scriptures/{}_usfm.zip"
# id: (eBible's id, title, abbreviation, what it is). The ids are e-Sword's, so its copies take their place.
BIBLES = {
    "asv": ("eng-asv", "American Standard Version", "ASV",
            "The American Standard Version of 1901, the American edition of the Revised Version."),
    "web": ("engwebp", "World English Bible", "WEB",
            "The World English Bible, a modern English update of the American Standard Version, with the words of Christ in red. "
            "This edition has the 66 books of the Old and New Testaments, without the Deuterocanon. Romans 14:24-26, the "
            "doxology where the Majority Text has it, are at 16:25-27, as in the KJV."),
    "ylt": ("engylt", "Young's Literal Translation", "YLT",
            "Robert Young's Literal Translation of the Holy Bible (revised edition, 1898), translated word for word from the Hebrew and Greek. "
            "Words in brackets were supplied by the translator."),
    "darby": ("engDBY", "Darby Translation", "Darby",
              "The Holy Scriptures, a New Translation from the Original Languages, by J. N. Darby (1890). "
              "Words in bold are emphasised in the original, words in brackets were supplied by the translator."),
    "webster": ("engwebster", "Webster's Bible", "Webster",
                "The Holy Bible in the Common Version, with Amendments of the Language, by Noah Webster (1833): "
                "the King James Version with its archaic words and spellings updated, the translators' supplied words in italics."),
    "rv": ("eng-rv", "Revised Version", "RV",
           "The Revised Version (New Testament 1881, Old Testament 1885, Apocrypha 1895), the English revision of the "
           "King James Version. The Rest of Esther is Esther 10:4-16:24, Susanna and Bel Daniel 13 and 14, and the Song "
           "of the Three Children is part of Daniel 3:23."),
}
# Paragraph-level markers: what follows one up to the next. Text after a paragraph marker carries on
# the verse before it; headings, speakers' names, introductions and the like are left out.
PARA = r"(?:c|v|d|p|m|nb|b|pi\d?|pmo|pm|q\d?|qc|qr|qa|qm\d?|li\d?|s\d?|ms\d?|mt\d?|mr|sp|cl|h|toc\d|id|ide|ip|ipi|is\d?|ib|imt\d?|io\d?|iot|rem|r|cp|sr|periph)"
FILES += [f"{bid}.bbli" for bid in BIBLES]
CONTINUES = re.compile(r"(?:p|m|nb|b|pi\d?|pmo|pm|q\d?|qc|qr|qm\d?|li\d?)$")


def pd_inline(s):
    """USFM character markup → e-Sword's, for a Bible without Strong's numbers: the words of Christ
    (\\wj) <red>, supplied words (\\add) <i>, emphasis (\\bd) <b>; notes and cross-references left out.
    A verse that is only a note ("Many authorities ... insert v. 21") keeps the note, in brackets."""
    notes = [re.sub(r"\\f[rk] [^\\]*", "", n) for n in re.findall(r"\\fe? \S+ (.*?)\\fe?\*", s, re.S)]  # without the caller (+)
    t = re.sub(r"\\(fe?|x) .*?\\(fe?|x)\*", " ", s, flags=re.S)  # a space where it was: "sons:\\f…\\f*This"
    t = re.sub(r"\\\+?w ([^|\\]*)(?:\|[^\\]*)?\\\+?w\*", r"\1", t)
    t = re.sub(r"\\\+?wj\*", "</red>", t)
    t = re.sub(r"\\\+?wj ", "<red>", t)
    t = re.sub(r"\\\+?add ", "<i>", t)
    t = re.sub(r"\\\+?add\*", "</i>", t)
    t = re.sub(r"\\\+?bd ", "<b>", t)
    t = re.sub(r"\\\+?bd\*", "</b>", t)
    t = re.sub(r"\\[^\s\\*]+\*", "", t)  # any other closing markers,
    t = re.sub(r"\\[^\s\\]+ ?", "", t)    # then opening ones
    if not re.sub(r"<[^>]+>", "", t).strip() and notes:
        t = "[" + re.sub(r"\\[^\s\\]+ ?", "", " ".join(notes)).strip() + "]"
    # e-Sword's spellings and plain quotes, so a search for "Caesar" or "God's" finds them.
    t = t.replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe").replace("Œ", "Oe")
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    t = html.escape(t).replace("&lt;", "<").replace("&gt;", ">")  # the text's & only; the tags made above stay
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"<(red|i|b)>\s+", r" <\1>", t)
    t = re.sub(r"\s+</(red|i|b)>", r"</\1> ", t)
    t = re.sub(r"\s+([,.;:?!)])", r"\1", t)
    t = re.sub(r"<(red|i|b)></\1>", "", t)
    t = re.sub(r"</(red|i|b)>(\s*)<\1>", r"\2", t)  # one run of red, not one per sentence
    t = re.sub(r"\[(['\"]+)\]", "", t)  # the BSB's closing quotes in brackets ("exposed on it.'['']"), uncertain in the Greek
    t = re.sub(r"\(\s+", "(", t)
    t = re.sub(r"(?<=\s)\*(?=\w)", "", t)  # Darby's note mark ("thy *word")
    # Words the sources doubled ("for the the lambs", "shall shall stand", "carried the <i>the people"): never meant.
    t = re.sub(r"\b(the|of|shall|or)\s+((?:<i>)?)\1\b", r"\2\1", t, flags=re.I)
    t = re.sub(r"\s+([,;:?!])", r"\1", t)  # "I am he ,'" where a note was
    return re.sub(r"\s+", " ", t).strip()


def pd_bible(ebible_id, url=None, more=None):
    """{(book, chapter, verse): text} of one of eBible.org's USFM Bibles (or the USFM zip at `url`): the
    66 books, and the books in `more` (USFM code: book; (book, chapter) for a book that is a chapter of
    another; (book, chapter, verse) for one joined to a verse), its Apocrypha as e-Sword numbers them."""
    verses = {}
    z = zipfile.ZipFile(io.BytesIO(fetch(url or EBIBLE.format(ebible_id))))
    for name in sorted(z.namelist()):
        if not name.endswith(".usfm"):
            continue
        text = z.read(name).decode("utf-8-sig")
        code = re.search(r"\\id (\w+)", text)[1]
        book, at = USFM.get(code), ()
        if not book and code in (more or {}):
            book, *at = more[code] if isinstance(more[code], tuple) else (more[code],)
        if not book:
            continue
        chapter, title, last, titled, lead = 0, "", None, False, ""
        for m in re.finditer(rf"\\({PARA})\b ?(.*?)(?=\\{PARA}\b(?![a-z*])|\Z)", text, re.S):
            tag, body = m[1], m[2]
            if tag == "c":
                chapter, title, last, lead = at[0] if at else int(body.split()[0]), "", None, ""
            elif tag == "d" and chapter and re.fullmatch(r"\s*Psalms \d+[–-]\d+\s*", body):
                pass  # the BSB's book label ("Psalms 1–41", the Psalter's Book I), not a title
            elif tag == "qc" and re.fullmatch(r"\s*[\u05d0-\u05ea]\s+[A-Z]+\.?\s*", body):
                title = pd_inline(body)  # Psalm 119's acrostic heading (the ASV's "א ALEPH."): bold, before its stanza
            elif tag == "d" and chapter:
                title = pd_inline(body)  # a psalm's title: <b> at the start of verse 1, as in the KJV
                titled = not body.strip()  # the BSB's "\d \v 1 A Psalm of David.": the title is verse 1's first line
            elif tag == "v" and chapter:
                vn, _, rest = body.lstrip().partition(" ")  # its end kept: a marker there ("\\wj " before the next \\v) opens the next verse's words
                last = (book, *at) if len(at) == 2 else (book, chapter, int(re.match(r"\d+", vn)[0]))
                t = re.sub(r"<(red|i|b)>\s+", r"<\1>", f"{lead} {pd_inline(rest)}".strip())  # a marker before a chapter's first verse ("\\p \\wj \\v 1") opens it
                lead = ""
                if title:
                    t, title = f"<b>{title}</b> {t}".strip(), ""
                elif titled and t:
                    t = f"<b>{t}</b>"
                titled = False
                verses[last] = f"{verses[last]} {t}".strip() if last in verses else t
            elif CONTINUES.match(tag) and last and body.strip():
                verses[last] = f"{verses[last]} {pd_inline(body)}".strip()
            elif CONTINUES.match(tag) and chapter and body.strip():
                lead += " " + pd_inline(body)
    # A verse's lines joined: one run of red over them, not one per line.
    verses = {k: re.sub(r"</(red|i|b)>(\s*)<\1>", r"\2", t) for k, t in verses.items()}
    return red_by_verse(verses)


def red_by_verse(verses, tag="red"):
    """The words of Christ (or another `tag`) closed in each verse: a quotation the USFM opens in one verse and
    closes in the next (the BSB's Mat 3:14-15) is closed at the first verse's end and opened again at the next's."""
    out, carry = {}, False
    for k in sorted(verses):
        t = (f"<{tag}>" + verses[k]) if carry else verses[k]
        depth = 0
        for m in re.finditer(rf"<(/?){tag}>", t):
            depth = max(depth + (-1 if m[1] else 1), 0)
        carry = depth > 0
        t = re.sub(rf"<{tag}>\s*$", "", t) + (f"</{tag}>" if carry and not re.search(rf"<{tag}>\s*$", t) else "")
        out[k] = re.sub(rf"<{tag}>\s*</{tag}>", "", t).strip()
    return out


TITLE_WORDS = re.compile(r"\b(Psalm|Song|Musician|Maschil|Michtam|Prayer|David|Asaph|Korah|Moses|Solomon|Heman|Ethan|"
                         r"Jeduthun|Shiggaion|Neginoth|Gittith|Alamoth|Sheminith|Muth-?labben|Aijeleth|Shoshannim|degrees|ascents)\b", re.I)


def bold_psalm_titles(verses):
    """A psalm's title in bold at the start of verse 1, as in the KJV, for a Bible whose source doesn't mark it
    (Webster's, Young's, Brenton's): where the KJV's psalm has a title, the sentence of this verse 1 that ends
    nearest to the KJV title's length, if it reads as a title ("A Psalm of David.")."""
    kdb = sqlite3.connect(f"file:{BUNDLED / 'kjv.bbli'}?immutable=1", uri=True)
    kjv_titles = {c: len(m[1]) for c, t in kdb.execute("SELECT Chapter, Scripture FROM Bible WHERE Book=19 AND Verse=1")
                  if (m := re.match(r"<b>(.*?)</b>", t))}
    kdb.close()
    out = dict(verses)
    for c, n in kjv_titles.items():
        t = out.get((19, c, 1), "")
        if not t or t.startswith("<b>"):
            continue
        ends = [m.end() for m in re.finditer(r"[.:](?=\s+\S)", t[:2 * n + 30])]
        ends = [e for e in ends if TITLE_WORDS.search(t[:e]) and "<b>" not in t[:e]
                and all(t[:e].count(f"<{x}>") == t[:e].count(f"</{x}>") for x in ("i", "red", "num"))]
        if ends:
            e = min(ends, key=lambda e: abs(e - n))
            out[(19, c, 1)] = f"<b>{t[:e]}</b>{t[e:]}"
    return out


# Verses numbered differently from the KJV, moved to the KJV's numbers: (book, chapter, first verse, last), to (chapter, first verse).
# The WEB has Romans' closing doxology at the end of chapter 14, where the Majority Text puts it, and a note in 16:25.
MOVES = {"web": [((45, 14, 24, 26), (16, 25))], "byz": [((45, 14, 24, 26), (16, 25))]}
UNTITLED = {"webster", "ylt"}  # psalm titles not marked (\\d) in the source: found by bold_psalm_titles
# The Apocrypha of the Bibles that have it, as e-Sword numbers it (src/bible.ts): the Rest of Esther is
# Esther 10:4-16:24, as in the Vulgate; Susanna and Bel are Daniel 13 and 14; the Song of the Three
# Children is joined to Daniel 3:23, where it is read, as tools/lxx joins it; Baruch 6 is the Epistle of Jeremy.
APOCRYPHA = {"rv": {"TOB": 67, "JDT": 68, "WIS": 69, "SIR": 70, "BAR": 71, "1MA": 72, "2MA": 73, "1ES": 74, "2ES": 75,
                    "MAN": 78, "ESG": 17, "SUS": (27, 13), "BEL": (27, 14), "S3Y": (27, 3, 23)}}


def write_bible(bid):
    """Builds `bid`.bbli (one of BIBLES) and prints how its verses differ from the KJV's."""
    ebible_id, title, abbrev, about = BIBLES[bid]
    verses = pd_bible(ebible_id, more=APOCRYPHA.get(bid))
    if bid in UNTITLED:
        verses = bold_psalm_titles(verses)
    for (b, c, v0, v1), (c2, v2) in MOVES.get(bid, []):
        for v in range(v0, v1 + 1):
            verses[(b, c2, v2 + v - v0)] = verses.pop((b, c, v))
    info = (f"<p>{html.escape(about)}</p>"
            f"<p>Public domain. From eBible.org's {ebible_id} (https://ebible.org/{ebible_id}/), courtesy of eBible.org. "
            "Built by Two-edged Sword's tools/core.</p>")
    write_verses(bid, title, abbrev, info, verses)


def write_verses(bid, title, abbrev, info, verses, strongs=False):
    """Writes `bid`.bbli and prints how its verses differ from the KJV's, in the testaments it has."""
    vc = verse_counts()
    ot, nt = any(b <= 39 for b, _, _ in verses), any(40 <= b <= 66 for b, _, _ in verses)
    apocrypha = any(b > 66 or c > len(vc.get(b, {})) for b, c, _ in verses)
    kjv_refs = {(b, c, v) for b, chs in vc.items() for c, n in chs.items() for v in range(1, n + 1) if (ot if b <= 39 else nt)}
    extra, missing = sorted(k for k in set(verses) - kjv_refs if k[0] <= 66), sorted(kjv_refs - set(verses))
    empty = sorted(k for k, t in verses.items() if not t)
    for what, refs in (("not in the KJV", extra), ("missing", missing), ("empty", empty)):
        if refs:
            print(f"  {bid}: {len(refs)} verses {what}: " + ", ".join(f"{BOOK_ABBR[b - 1]} {c}:{v}" for b, c, v in refs[:12]))
    with module(f"{bid}.bbli", title, abbrev, info, ot=ot, nt=nt, apocrypha=apocrypha, strongs=strongs, into=BUNDLED) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", [(b, c, v, t) for (b, c, v), t in sorted(verses.items())])
    print(f"{bid}.bbli: {len(verses)} verses")


# ---- the Berean Standard Bible, and Strong's numbers for it and for Webster's -----------------------

BSB_URL = "https://bereanbible.com/bsb_usfm.zip"
BSB_TABLES_URL = "https://bereanbible.com/bsb_tables.tsv"
BSB_ABOUT = ("The Berean Standard Bible (2023, third printing), a modern English translation from the Hebrew, Aramaic "
             "and Greek, with the words of Christ in red.")
BSB_INFO = ("<p>Public domain: the Berean Bible texts were dedicated to the public domain on April 30, 2023 "
            "(https://berean.bible/terms.htm). The Holy Bible, Berean Standard Bible, BSB is produced in cooperation "
            "with Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee. "
            "From https://berean.bible/downloads.htm. Built by Two-edged Sword's tools/core.</p>")
WORD = re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)*")


def words_at(t):
    """[(word, where it ends)] of e-Sword text's words, its tags and numbers skipped."""
    return [(m[0].lower().replace("’", "'"), m.end()) for m in re.finditer(r"<num>[^<]*</num>|<[^>]+>|" + WORD.pattern, t)
            if not m[0].startswith("<")]


def put_numbers(t, at):
    """`t` with each {where: [numbers]} of `at` put in as <num>s."""
    out, last = [], 0
    for pos in sorted(at):
        out += [t[last:pos], "".join(f"<num>{n}</num>" for n in dict.fromkeys(at[pos]))]
        last = pos
    return "".join(out) + t[last:]


def bsb_tables():
    """{(book, chapter, verse): [(words, how many of them the numbers follow, numbers)]} from the BSB's
    translation tables: each Hebrew or Greek word, its Strong's number, and the English it is
    translated by, in the English order. A word marked "vvv" is translated with the next one, so its
    number goes there; one translated as ". . ." (within the phrase before it: "the Israelites" is H1121
    and H3478) goes after that phrase's; one translated as "-" (not at all) is left out.
    Bracketed words ([His], supplied) count as the phrase's; words in braces moved after it ("the stars
    {as well}") come after the number, which is the phrase's before them."""
    names = BOOK_NAMES | {"Psalm": 19, "Song of Songs": 22, "Revelation": 66}
    out, ref, carry = {}, None, []
    rows = fetch(BSB_TABLES_URL).decode("utf-8-sig").split("\n")
    head = rows[0].split("\t")
    col = {k: head.index(k) for k in ("Str Heb", "Str Grk", "VerseId")} | {"eng": [h.strip() for h in head].index("BSB version")}
    for line in rows[1:]:
        row = line.split("\t")
        if len(row) <= col["eng"]:
            continue
        if row[col["VerseId"]].strip():
            m = re.match(r"(.+) (\d+):(\d+)$", row[col["VerseId"]].strip())
            ref, carry = (names[m[1]], int(m[2]), int(m[3])), []
            out[ref] = []
        heb, grk = row[col["Str Heb"]].strip(), row[col["Str Grk"]].strip()
        n = f"H{int(heb)}" if heb else f"G{int(grk)}" if grk else None
        eng = re.sub(r"<[^>]*>", " ", row[col["eng"]]).strip()
        if eng == "vvv":
            carry += [n] if n else []
            continue
        if eng.replace(" ", "") == "..." and n and out[ref]:
            out[ref][-1][2].append(n)
            continue
        tail = re.search(r"\{[^{}]*\}\s*$", eng)
        ws = [w.lower().replace("’", "'") for w in WORD.findall(re.sub(r"[\[\]{}]", "", eng))]
        if not ws:
            continue
        upto = len(ws) - len(WORD.findall(tail[0])) if tail and len(WORD.findall(tail[0])) < len(ws) else len(ws)
        out[ref].append((ws, upto, carry + ([n] if n else [])))
        carry = []
    return out


def tag_bsb(text, phrases):
    """The verse with the tables' numbers after the words they translate, and how many phrases
    weren't found in it: each phrase is looked for a few words on from the last one found."""
    words, at, i, missed = words_at(text), {}, 0, 0
    for ws, upto, nums in phrases:
        k = len(ws)
        j = next((j for j in range(i, min(i + 8, len(words) - k + 1)) if [w for w, _ in words[j:j + k]] == ws), None)
        if j is None:
            missed += 1
            continue
        if nums:
            at.setdefault(words[j + upto - 1][1], []).extend(nums)
        i = j + k
    return put_numbers(text, at), missed


def write_bsb():
    write_verses("bsb", "Berean Standard Bible", "BSB", f"<p>{BSB_ABOUT}</p>{BSB_INFO}", pd_bible(None, BSB_URL))


def write_bsb_plus():
    tables, missed = bsb_tables(), Counter()
    verses = {}
    for k, t in pd_bible(None, BSB_URL).items():
        verses[k], missed[k] = tag_bsb(t, tables.get(k, []))
    phrases = sum(len(p) for k, p in tables.items() if k in verses)
    print(f"  bsb+: {sum(missed.values())} of {phrases} phrases of the tables not found in the text: "
          + ", ".join(f"{BOOK_ABBR[b - 1]} {c}:{v}" for (b, c, v), n in sorted(missed.items()) if n))
    info = (f"<p>{BSB_ABOUT} With Strong's numbers for looking up the Hebrew or Greek behind each word, from the "
            "Berean Bible's translation tables (bsb_tables), which give each Hebrew and Greek word with the English it is "
            "translated by.</p>" + BSB_INFO)
    write_verses("bsb+", "Berean Standard Bible w/ Strong's Numbers", "BSB+", info, verses, strongs=True)


def kjv_groups(tagged):
    """The KJV+ verse's words, which run of numbers each is under (the words since the run before),
    and {run: (its last word, the numbers)}."""
    words, under, runs = [], [], {}
    for m in re.finditer(r"((?:<num>[^<]*</num>)+)|<[^>]+>|" + WORD.pattern, tagged):
        if m[1]:
            if words and under and under[-1] == len(runs):
                runs[len(runs)] = (len(words) - 1, m[1])
            else:
                runs[len(runs)] = (None, m[1])  # a run with no words before it
        elif not m[0].startswith("<"):
            words.append(m[0].lower().replace("’", "'"))
            under.append(len(runs))
    return words, under, {r: v for r, v in runs.items() if v[0] is not None}


def carry_numbers(tagged, text):
    """The KJV+'s numbers carried onto Webster's words: the two texts' words are lined up (difflib),
    a word kept or replaced one for one ("unto" → "to", "Holy Ghost" → "Holy Spirit") gets the KJV
    word's place, and each run of numbers goes after its last word's counterpart. A run whose last
    word has none, or would go out of order, is left out, and counted."""
    kw, under, runs = kjv_groups(tagged)
    words = words_at(text)
    to = {}
    for op, i1, i2, j1, j2 in SequenceMatcher(None, kw, [w for w, _ in words], autojunk=False).get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            to.update({i1 + d: j1 + d for d in range(i2 - i1)})
        elif op == "replace" and "".join(kw[i1:i2]) == "".join(w for w, _ in words[j1:j2]):  # "firstborn", "first-born"
            to[i2 - 1] = j2 - 1
    at, last, left = {}, -1, 0
    for r, (i, nums) in sorted(runs.items()):
        j = to.get(i)
        if j is None or j <= last:
            left += 1
            continue
        at.setdefault(words[j][1], []).extend(re.findall(r"<num>([^<]*)</num>", nums))
        last = j
    return put_numbers(text, at), left, len(runs)


def write_webster_plus():
    tagged = {k: t for k, (_, t) in kjv()[0].items()}
    verses, left, runs = {}, 0, 0
    for k, t in bold_psalm_titles(pd_bible(BIBLES["webster"][0])).items():
        verses[k], l, n = carry_numbers(tagged[k], t) if k in tagged else (t, 0, 0)
        left, runs = left + l, runs + n
    print(f"  webster+: {runs - left} of the KJV+'s {runs} runs of Strong's numbers carried over, {left} left out")
    info = (f"<p>{html.escape(BIBLES['webster'][3])} With the KJV+'s Strong's numbers, carried over to the words Webster "
            "kept or changed one for one; where he reworded a phrase, its numbers are left out.</p>"
            "<p>Public domain. Text from eBible.org's engwebster (https://ebible.org/engwebster/), courtesy of eBible.org; "
            "Strong's numbers from the KJV+ (eBible.org's eng-kjv2006, courtesy of the CrossWire Bible Society and eBible.org). "
            "Built by Two-edged Sword's tools/core.</p>")
    write_verses("webster+", "Webster's Bible w/ Strong's Numbers", "Webster+", info, verses, strongs=True)


# Bibles built one at a time, beyond BIBLES: id → (file, builder).
MORE |= {"bsb": ("bsb.bbli", write_bsb), "bsb+": ("bsb+.bbli", write_bsb_plus), "webster+": ("webster+.bbli", write_webster_plus)}


# ---- more commentaries, dictionaries, lexicons and devotionals from CrossWire ------------------------

def write_wesley():
    """Wesley's notes, a ThML zCom. Each note names the words it is on before " - ", at the start of a sentence:
    they're bold, as in e-Sword's."""
    z, canon = crosswire("Wesley")
    books, chapters, verses = [], [], []

    def note(s):
        s = re.sub(r"(?<=\w) - (?=[a-z])", "-", s)  # its hyphens spaced as its dashes: "high - priest", "pre - existent"
        s = link_continuations(link_plain_refs(barnes_html(s)))
        if "<br>" not in s:  # braces the source has for parentheses ("{mentioned by St. Paul, Php 2:6,7,}"), not in its tables
            s = s.replace("{", "(").replace("}", ")")
        return re.sub(r"(<p>|[.?!;] )([A-Z][^<.?!;:]{0,80}?) - (?=[A-Z(\"'])", r"\1<b>\2</b> - ", s)

    def once(z, test):
        """The slots, but one that points at a note stored for an earlier, other slot reads as empty: CrossWire's
        Wesley links its book and chapter headings, and the books it has no notes on (Judges, 1 Kings, Jonah,
        Philemon), to notes elsewhere. A run of verses linked to one note keeps it."""
        seen, prev, out = set(), None, []
        for where, text in zcom(z, test):
            out.append((where, "" if where in seen and where != prev else text))
            if where:
                seen.add(where)
            prev = where
        return out
    seen = set()  # Wesley wrote no note twice: one seen already is CrossWire linking a slot to it
    for b, c, n, head, entries in sword_chapters(z, canon, once):
        intro = note(head)
        if has_text(intro) and not any(re.sub(r"^<p>|</p>$", "", x) in intro for x in seen):  # a copy, or two copies, of one
            (books.append((b, intro)) if c == 1 else chapters.append((b, c, intro)))
            seen.add(intro)
        for v1, v2, t in entries:
            if has_text(note(t)) and note(t) not in seen:
                verses.append((b, c, v1, c, v2, note(t)))
                seen.add(note(t))
    info = ("<p>Explanatory Notes upon the Old and New Testaments, by John Wesley (1754–1765).</p>"
            "<p>Public domain. CrossWire's Wesley module (1.1), from Sulu Kelley's and Bill Brown's electronic edition. "
            "Built by Two-edged Sword's tools/core.</p>")
    write_commentary("wesley.cmti", "Wesley's Explanatory Notes", "Wesley", info, (books, chapters, verses))


def write_torrey():
    z, _ = crosswire("Torrey")
    info = ("<p>The New Topical Text Book, by R. A. Torrey (1897): some 620 topics, each with the verses on it, by subtopic.</p>"
            "<p>Public domain. CrossWire's Torrey module (1.3). Built by Two-edged Sword's tools/core.</p>")
    write_dictionary("torrey.dcti", "Torrey's Topical Textbook", "Torrey", info, rawld(z), torrey_html)


def torrey_html(s):
    """Torrey's outline: each subtopic ("- Commanded") with its verses after it on one line, a heading in
    capitals ("- THE OBJECTS OF, ARE") bold in sentence case, and the points under it (". God") marked ·."""
    paras = re.findall(r"<p>(.*?)</p>", thml_dict_html(s))
    out = []
    for x in paras:
        if x.startswith("<ref>") and out and not out[-1].startswith("<b>"):
            out[-1] += f": {x}"
            continue
        m = re.match(r"([-.])\s*(.*)", x)
        if m and m[2].isupper():
            out.append(f"<b>{m[2][0]}{m[2][1:].lower()}</b>")
        elif m:
            out.append(("· " if m[1] == "." else "") + m[2])
        else:
            out.append(x)
    return "".join(f"<p>{x}</p>" for x in out)


def write_hitchcock():
    z, _ = crosswire("Hitchcock")
    info = ("<p>Hitchcock's Bible Names Dictionary: the meanings of some 2,600 names in the Bible, from Roswell D. Hitchcock's "
            "New and Complete Analysis of the Holy Bible (1869).</p>"
            "<p>Public domain. CrossWire's Hitchcock module (2.0), from the Christian Classics Ethereal Library. "
            "Built by Two-edged Sword's tools/core.</p>")
    write_dictionary("hitchcock.dcti", "Hitchcock's Bible Names", "Hitchcock", info, zld(z), tei_html)


def abbott_html(s):
    """An Abbott-Smith entry (TEI) as e-Sword's HTML: the headword's paragraph, the Septuagint's Hebrew
    (with its Strong's number), then a paragraph for each numbered sense."""
    s = re.sub(r"<ref>(.*?)</ref>", r"\1", s, flags=re.S)  # a <ref> without osisRef names another entry's word
    s = re.sub(r'osisRef="0(al|en)\.', r'osisRef="G\1.', s)  # Galatians and Genesis, "0al.4.6" in the source
    s = osis_dict_refs(s)
    s = re.sub(r'<foreign n="(H\d+)"[^>]*>(.*?)</foreign>', r"<heb>\2</heb> <num>\1</num>", s, flags=re.S)
    s = re.sub(r'<foreign xml:lang="heb">(.*?)</foreign>', r"<heb>\1</heb>", s, flags=re.S)
    s = re.sub(r'<foreign xml:lang="grc">(.*?)</foreign>', r"<grk>\1</grk>", s, flags=re.S)
    s = re.sub(r'<hi rend="(bold|italic)">(.*?)</hi>', lambda m: f"<{m[1][0]}>{m[2]}</{m[1][0]}>", s, flags=re.S)
    s = re.sub(r'<sense n="\s*([^"]*?)\s*">', lambda m: f"</p><p><b>{m[1]}</b> ", s)
    s = re.sub(r"</?(form|etym|re)\b[^>]*>", "</p><p>", s)
    s = re.sub(r"<(?!/?(p|b|i|grk|heb|num|ref)>)[^>]*>", "", s)
    return tidy(s)


# Strong's "accusative case singular of G4771", "imperfect of G1510", "reflexive of G681": a form of another word
# (not "from G25", a word derived from it). The forms of ἐγώ name one another ("a shorter form of G1691"), so are listed.
FORM_OF = re.compile(r"^(?:(?!from\b|origin\b)[^<]){0,100}?\bof\s+<num>(G\d+)</num>")
FORMS = {n: "G1473" for n in ("G3165", "G3427", "G3450", "G1691", "G1698", "G1700", "G2248", "G2249", "G2254", "G2257")}
FORMS |= {"G2036": "G3004", "G2046": "G3004", "G4483": "G3004"}
# CrossWire's keys that open another word's entry: σύ's forms open αὐτός, ἐκκόπτω ἐκκοπή, συμβασιλεύω συμβουλεύω, …
ABBOTT_WRONG = {"G4571", "G4671", "G4675", "G5209", "G5210", "G5213", "G1581", "G4821", "G4347", "G4776"}  # εἶπον, ἐρῶ, ῥέω: the tenses of λέγω, which Abbott-Smith gives under it


def write_abbott():
    """abbott.lexi: Abbott-Smith's entries under the Strong's numbers of their words. CrossWire's AbbottSmithStrongs
    keys each number to a headword ("00026" → "@LINK ἀγάπη"), but some keys are wrong (σέ, G4571, opens αὐτός), so an
    entry is kept under its key unless the key is one of those (ABBOTT_WRONG, or a key the entry's own numbers
    haven't); else the number takes the entry whose headword is Strong's; and a number Strong calls a form of
    another word ("accusative case singular of G4771", "reflexive of G681") takes that word's entry."""
    z, _ = crosswire("AbbottSmithStrongs")
    entries = zld(z)
    heads = {unicodedata.normalize("NFC", k).upper(): v for k, v in entries if not k.isdigit()}
    by_word = {}  # by the headword as printed (μέν is not με, nor εἰ εἶ)
    for v in heads.values():
        m = re.search(r'<entry n="([^"|]+)', v)
        if m:
            by_word.setdefault(accented_form(m[1]), v)
    keyed = {}
    for k, v in entries:
        if k.isdigit():
            body = heads.get(unicodedata.normalize("NFC", v.removeprefix("@LINK").strip("\x00 \n")).upper())
            if body:
                keyed[f"G{int(k)}"] = body
    sdb = sqlite3.connect(f"file:{BUNDLED / 'strong.lexi'}?mode=ro", uri=True)
    strong = {t: (re.search(r"<grk>(.*?)</grk>", d) or [None, ""])[1] for t, d in sdb.execute("SELECT Topic, Definition FROM Lexicon WHERE Topic LIKE 'G%'")}
    form_of = {t: m[1] for t, d in sdb.execute("SELECT Topic, Definition FROM Lexicon WHERE Topic LIKE 'G%'")
               if (m := FORM_OF.search(re.sub(r"^(?:<p>.*?</p>){3}<p>", "", d)))}
    sdb.close()

    def own(n):
        """Its keyed entry, unless the key is wrong (listed, or not among the numbers the entry gives itself: γάζα
        "treasure" keyed to Gaza); else the entry whose headword is Strong's."""
        body = keyed.get(n)
        listed = re.search(r'<entry n="[^"|]*\|?([^"]*)"', body or "")
        if body and n not in ABBOTT_WRONG and (not listed or not listed[1] or n in {f"G{int(x)}" for x in re.findall(r"\d+", listed[1])}):
            return body
        return by_word.get(accented_form(strong.get(n, "")))
    rows, how = {}, Counter()
    for n in strong:
        body = own(n)
        how["own" if body and body is keyed.get(n) else "by headword" if body else ""] += 1
        lemma, hops = n, 0
        while not body and hops < 3 and (lemma := FORMS.get(lemma) or form_of.get(lemma)):  # ὑμῖν, of ὑμεῖς, of σύ
            body, hops = own(lemma), hops + 1
            how["form of another" if body else "none"] += 1
        if body:
            rows[n] = abbott_html(body)
    wrong = sum(1 for n, b in keyed.items() if n in rows and abbott_html(b) != rows[n])
    print(f"  abbott: {how['own']} numbers keyed right, {wrong} keyed wrongly and moved, {how['by headword']} by headword, "
          f"{how['form of another']} as a form of another word")
    info = ("<p>A Manual Greek Lexicon of the New Testament, by G. Abbott-Smith (1922), under the Strong's numbers of its words: "
            "each word's meanings, with the Hebrew it translates in the Septuagint.</p>"
            "<p>Its marks: * before a word, not found in the Septuagint or the other Greek versions of the Old Testament "
            "and Apocrypha; ** found only in the Apocrypha or the later Greek versions; * after a list of Septuagint passages, "
            "found nowhere else in it; † before a word, not found in the classical Greek writers; † at the end, every "
            "occurrence in the New Testament is cited.</p>"
            "<p>Public domain. CrossWire's AbbottSmithStrongs module (4.1), from the TEI edition at "
            "https://github.com/translatable-exegetical-tools/Abbott-Smith. Built by Two-edged Sword's tools/core.</p>")
    with module("abbott.lexi", "Abbott-Smith's Manual Greek Lexicon", "Abbott-Smith", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Lexicon VALUES (?,?)", sorted(rows.items(), key=lambda r: (len(r[0]), r[0])))
    print(f"abbott.lexi: {len(rows)} numbers, "
          f"{(BUNDLED / 'abbott.lexi').stat().st_size / 1e6:.1f} MB")


def write_devotional(file, title, abbrev, info, days):
    """days: {(month, day): html}."""
    with module(file, title, abbrev, info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Devotional VALUES (?,?,?)", [(m, d, t) for (m, d), t in sorted(days.items())])
    print(f"{file}: {len(days)} days")


# References wrong in the source itself: the iron did swim, 2 Kings 6:6; walking in the light, 1 John 1:7.
SME_FIXES = {"01.13": [(">2 Kings 6:9<", ">2 Kings 6:6<")], "08.31": [(">John 1:7<", ">1 John 1:7<")]}


def write_spurgeon():
    """Spurgeon's Morning and Evening, CrossWire's SME (OSIS, from CCEL): each day's two readings."""
    z, _ = crosswire("SME")
    days = {}
    for key, s in zld(z):
        m = re.match(r"(\d\d)\.(\d\d)$", key)
        if not m:
            continue
        for wrong, right in SME_FIXES.get(key, []):
            s = s.replace(wrong, right)
        # Each reference by what it shows ("Jude 1"): the source's own code has Jude as Judges (Jul 12, Oct 8-10).
        s = re.sub(r'<reference osisRef="([^"]+)">(.*?)</reference>',
                   lambda m: (passage_refs(re.sub(r"<[^>]+>", "", m[2])) or [f'<ref osisRef="{m[1]}">{m[2]}</ref>'])[0], s, flags=re.S)
        s = osis_dict_refs(s)
        s = re.sub(r"<title>(.*?)</title>", r"</p><p><b>\1</b></p><p>", s, flags=re.S)
        s = re.sub(r'<hi type="italic">(.*?)</hi>', r"<i>\1</i>", s, flags=re.S)
        s = re.sub(r'<hi type="bold">(.*?)</hi>', r"<b>\1</b>", s, flags=re.S)
        s = re.sub(r"<lb\s*/>", "<br>", s)
        s = re.sub(r"<(?!/?(p|b|i|br|ref)>)[^>]*>", "", s)
        days[(int(m[1]), int(m[2]))] = tidy(s)
    info = ("<p>Morning and Evening: Daily Readings, by C. H. Spurgeon (1865): a reading for each morning and evening of the year.</p>"
            "<p>Public domain. CrossWire's SME module (1.7), from the Christian Classics Ethereal Library. "
            "Built by Two-edged Sword's tools/core.</p>")
    write_devotional("sme.devi", "Morning and Evening", "Spurgeon M&E", info, days)


def write_daily_light():
    """Daily Light, CrossWire's Daily (ThML, from bf.org): its lines rejoined into paragraphs (the source
    breaks them at 70 columns), the day's text (the first after "Morning:" or "Evening:") in bold, the KJV's
    supplied words ("[is]") in italics, and its references linked."""
    z, _ = crosswire("Daily")
    days = {}
    for key, s in rawld(z):
        m = re.match(r"(\d\d)\.(\d\d)$", key)
        if not m:
            continue

        def refs(m):  # "Isa 38:17 Mic 7:18,19", "Ps 37:23,24 73:23,24": a part per book, or per chapter of the same book
            parts = re.split(r"\s+(?=(?:[1-3])?[A-Z][a-z]+\.? \d)|(?<=[\d,])\s+(?=\d+:\d)", m[1].strip())
            return "; ".join(f'<scripRef passage="{p}">{p}</scripRef>' for p in parts)
        s = re.sub(r"<scripRef[^>]*>(.*?)</scripRef>", refs, s, flags=re.S)
        s = thml_refs(s)
        out, heading = [], False
        for block in re.split(r"(?:<br\s*/>\n?){2,}", s):  # a blank line; a line's indent is kept
            lines = [x for x in re.split(r"<br\s*/>\n?", block) if x.strip()]
            if not lines:
                continue
            text = re.sub(r"\s*--\s*", " — ", " ".join(x.strip() for x in lines))  # its -- between verses
            text = re.sub(r"\s*\. \. \.", " …", text)
            text = re.sub(r"\[([^\]<]+)\]", r"<i>\1</i>", text)  # the KJV's supplied words, in italics as in the KJV
            if heading:
                text = f"<b>{text}</b>"
            heading = bool(re.fullmatch(r"<i>(Morning|Evening)</i>:", text))
            out.append(text)
        days[(int(m[1]), int(m[2]))] = tidy("".join(f"<p>{x}</p>" for x in out))
    info = ("<p>Daily Light on the Daily Path, by Jonathan Bagster and his family (1875): for each morning and evening, "
            "verses on one theme in the words of the King James Version.</p>"
            "<p>Public domain. CrossWire's Daily module (1.0), from the Bible Foundation. Built by Two-edged Sword's tools/core.</p>")
    write_devotional("daily.devi", "Daily Light on the Daily Path", "Daily Light", info, days)


# ---- more Bibles: the Byzantine Greek NT, Brenton's English Septuagint, Weymouth ---------------------

BYZ = "https://raw.githubusercontent.com/byztxt/byzantine-majority-text/27a45ff1b7be6c17ccbfeac414f3f55732ae8e28/csv-unicode/{}/{}.csv"
BYZ_BOOKS = ["MAT", "MAR", "LUK", "JOH", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI",
             "TIT", "PHM", "HEB", "JAM", "1PE", "2PE", "1JO", "2JO", "3JO", "JUD", "REV"]
BYZ_INFO = ("Maurice A. Robinson and William G. Pierpont, The New Testament in the Original Greek: Byzantine Textform (2018), "
            "public domain, from https://github.com/byztxt/byzantine-majority-text")


def byz():
    """{(book, chapter, verse): (accented text, [(word, Strong's number, Robinson's code)])}: the accented
    text (ccat/no-variants) and the parsed one (strongs/with-parsing) have the same words, verse by verse."""
    out = {}
    for i, code in enumerate(BYZ_BOOKS):
        def rows(kind, code=code):
            name = f"byz-{kind.replace('/', '-')}-{code}.csv"  # each book's two files have the same name
            text = fetch_to(BYZ.format(kind, code), CACHE / name, log=True).read_text(encoding="utf-8-sig")
            return {(int(r["chapter"]), int(r["verse"])): r["text"] for r in csv.DictReader(io.StringIO(text))}
        acc, parsed = rows("ccat/no-variants"), rows("strongs/with-parsing")
        for (c, v), t in parsed.items():
            tagged = re.findall(r"(\S+) (\d+)(?: \d+)? \{([^}]+)\}", t)
            words = [w for w in acc[(c, v)].split() if greek_key(w)]
            if [greek_key(w) for w in words] != [greek_key(w) for w, _, _ in tagged]:
                sys.exit(f"Byzantine {code} {c}:{v}: the accented and parsed texts differ")
            out[(40 + i, c, v)] = (acc[(c, v)], [(w, f"G{n}", k) for w, (_, n, k) in zip(words, tagged, strict=True)])
    for (b, c, v0, v1), (c2, v2) in MOVES["byz"]:  # Romans' doxology, where the Majority Text has it, as the WEB's
        for v in range(v0, v1 + 1):
            out[(b, c2, v2 + v - v0)] = out.pop((b, c, v))
    return out


def write_byz():
    # Without its ¶ marks, as the KJV; its dash, a hyphen on the word before ("ἁμαρτίας-"), as a dash.
    verses = {k: html.escape(re.sub(r"(?<=\w)-(?=\s|$)", "—", re.sub(r"\s*¶\s*", " ", t)).strip()) for k, (t, _) in byz().items()}
    info = (f"<p>The Greek New Testament in the Byzantine (Majority) text, accented. {BYZ_INFO}. "
            "Built by Two-edged Sword's tools/core.</p>")
    write_verses("byz", "Greek NT: Byzantine Majority Text (2018)", "Byz 2018", info, verses)


def accented_form(w):
    """A Greek word as printed, for matching forms between editions: lower case, NFC, a grave accent as acute
    (ἐστὶ is ἐστί), no punctuation."""
    t = unicodedata.normalize("NFD", w.lower()).replace("\u0300", "\u0301")
    return unicodedata.normalize("NFC", re.sub(r"[^\w\u0300-\u036f]", "", t))


def write_byz_plus():
    """byz+.bbli: word by word, as Beza 1598+ (tools/beza/plus.py): each word with its English, Strong's number and
    grammar. The numbers are Robinson's, which number every form by its dictionary word (εἶπεν as λέγω, G3004;
    ἦν as εἰμί, G1510), but where Strong and the KJV+ number a form apart (G2036, G2258): each form takes the
    number TAGNT has for it most often, where that is at least 90% of its uses and not Robinson's."""
    import beza.plus as bp
    from stepbible import robinson, tagnt
    G, tag = bp.glosses(), tagnt()
    forms = defaultdict(Counter)
    for ws in tag.values():
        for w in ws:
            if w.num:
                forms[accented_form(w.greek)][w.num] += 1
    usual = {}
    for f, c in forms.items():
        n, k = c.most_common(1)[0]
        if k >= 0.9 * sum(c.values()):
            usual[f] = n
    verses, changed = {}, Counter()
    for k, (_, ws) in byz().items():
        s = []
        for w, n, code in ws:
            form = usual.get(accented_form(w))
            if form and form != n:
                changed[(n, form)] += 1
                n = form
            g = bp.gloss_for(n, code, G)
            w = w.replace("¶", "")  # a paragraph mark, before the word
            w = re.sub(r"(?<=\w)-$", "—", w)  # the source's dash, a hyphen on the word before it
            s.append(f"<div><grk>{html.escape(w)}</grk><num>{n}</num><tvm>{html.escape(robinson(code))}</tvm>"
                     f"<gra>{html.escape(g) or '—'}</gra></div>")
        verses[k] = "".join(s)
    print(f"  byz+: {sum(changed.values())} words given Strong's form numbers from TAGNT, commonest "
          + ", ".join(f"{a}→{b} {n}" for (a, b), n in changed.most_common(8)))
    info = (f"<p>The Byzantine Greek New Testament word by word: each word with its Strong's number and grammar (Robinson's "
            f"own, from his parsed text; ἐγώ, σύ and εἰμί numbered by form, as Strong and the KJV+ number them, from STEPBible's "
            f"TAGNT, CC BY 4.0) and the English of STEPBible's TBESG (Tyndale House, CC BY 4.0, "
            f"https://github.com/STEPBible/STEPBible-Data). The English is the dictionary sense, not a translation of the verse. "
            f"{BYZ_INFO}. Built by Two-edged Sword's tools/core.</p>")
    write_verses("byz+", "Greek NT: Byzantine (2018) w/ glosses", "Byz 2018+", info, verses, strongs=True)


def write_brenton():
    """Brenton's English Septuagint, eBible's eng-Brenton, numbered as the KJV with tools/lxx's tables and rules."""
    import lxx.build as lxx
    rows, _, joined, _ = lxx.build("https://ebible.org/Scriptures/eng-Brenton_usfm.zip")
    # e-Sword's spellings and plain quotes, as the other Bibles ("Mardochaeus", so a search finds it in each)
    plain = {(b, c, v): html.escape(t).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
             .replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe") for b, c, v, t in rows}
    rows = [(b, c, v, t) for (b, c, v), t in sorted(bold_psalm_titles(plain).items())]
    info = ("<p>The Septuagint in English, translated by Sir Lancelot C. L. Brenton (1844), with the Apocrypha: the Greek "
            "Old Testament the apostles quoted.</p><p>Public domain. From eBible.org's eng-Brenton, courtesy of eBible.org. "
            "The verses are numbered as the KJV's: a Psalm's title opens its verse 1, the Septuagint's added verses are "
            "joined to the verse before them, and where the Septuagint orders a passage otherwise (Exodus 35–40) each verse "
            "is at the KJV verse it translates. The Apocrypha is numbered as in the Revised Version: the additions to Esther "
            "are Esther 10:4–16:24, Sirach 30–36 in the Latin order, Susanna and Bel Daniel 13–14, the Letter of Jeremiah "
            "Baruch 6, Psalm 151 its own; Sirach's prologue opens 1:1. Built by Two-edged Sword's tools/core.</p>")
    with module("brenton.bbli", "Brenton's English Septuagint", "Brenton", info, nt=False, apocrypha=True, into=BUNDLED) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    print(f"brenton.bbli: {len(rows)} verses, {joined} joined to the verse before them")


def write_weymouth():
    """Weymouth's New Testament, CrossWire's Weymouth (GBF zText, KJV versification)."""
    import crosswire.build as cw
    c, books, _ = cw.read("Weymouth")
    verses = {(OSIS_BOOK[b], ch, v): cw.text(t, c.get("SourceType", "GBF")) for b, rows in books.items() for ch, v, t in rows}
    def tidy_gbf(t):
        """Its plain-text conventions as the other Bibles': `quote' (an opening single quote), -- (a dash), *word* (emphasis)."""
        t = re.sub(r"\*([^*<]+)\*", r"<i>\1</i>", t.replace("`", "'"))
        return re.sub(r"\s*--\s*", "—", t)
    verses = {k: html.escape(tidy_gbf(t)).replace("&lt;", "<").replace("&gt;", ">") for k, t in verses.items() if t}
    verses = red_by_verse(red_by_verse(verses, "i"))  # Mar 16:9-20, Joh 7:53-8:11 in italics throughout
    info = ("<p>The New Testament in Modern Speech, by Richard Francis Weymouth (third edition, 1912, revised by Ernest Hampden-Cook).</p>"
            "<p>Public domain. CrossWire's Weymouth module (1.1), https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=Weymouth. "
            "Where Weymouth joins verses, the joined text is under the first; his emphasis is in italics. "
            "Built by Two-edged Sword's tools/core.</p>")
    write_verses("weymouth", "Weymouth New Testament", "Weymouth", info, verses)


def write_wlc_plus():
    import wlc.build as wlc
    wlc.main(into=BUNDLED)


# ---- OpenBible.info's cross-references and places --------------------------------------------------

OPENBIBLE_XREF = "https://a.openbible.info/data/cross-references.zip"
GEO = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/7eb18a5ee62f27b9b93bd6689ea272d76dd23b8f/data/{}.jsonl"
XREF_VOTES = 5  # below this, the long tail: links only a few readers agreed with (5-9 are mostly sound)


def osis_range(s):
    """"Gen.1.1" or "1Tim.1.15-1Tim.1.16" as e-Sword's reference ("1Ti 1:15-16"), or None if it's no KJV verse."""
    a, _, b = s.partition("-")
    pa = osis_part(a, None, None)
    pb = osis_part(b, None, pa[0]) if b and pa else None
    if pb and pb[0] != pa[0]:  # into the next book (2Ch 36:22-Ezr 1:3): its first verse, as references don't span books
        pb = None
    return esword_ref(pa, pb) if pa and real(pa, pb) else None


def write_openbible_xref():
    z = zipfile.ZipFile(io.BytesIO(fetch(OPENBIBLE_XREF)))
    text = z.read(next(n for n in z.namelist() if n.endswith(".txt"))).decode("utf-8")
    by_verse, bad = defaultdict(list), 0
    for line in text.split("\n")[1:]:
        f = line.split("\t")
        if len(f) < 3 or not f[2].lstrip("-").isdigit() or int(f[2]) < XREF_VOTES:
            continue
        frm, to = osis_part(f[0], None, None), osis_range(f[1])
        if not frm or not real(frm) or not to:
            bad += 1
            continue
        by_verse[frm].append((int(f[2]), to))
    rows = [(b, c, v, c, v, "<p>" + "; ".join(f"<ref>{r}</ref>" for _, r in sorted(refs, key=lambda x: -x[0])) + "</p>")
            for (b, c, v), refs in sorted(by_verse.items())]
    info = (f"<p>Cross-references for {len(rows):,} verses, most agreed first: the links that OpenBible.info's readers voted "
            f"helpful at least {XREF_VOTES} times, from some 340,000 drawn mainly from the Treasury of Scripture Knowledge.</p>"
            "<p>© OpenBible.info, CC BY 4.0 (https://www.openbible.info/labs/cross-references/). "
            "Built by Two-edged Sword's tools/core.</p>")
    write_commentary("openbible_xref.cmti", "OpenBible.info Cross-References", "OpenBible", info, ([], [], rows))
    if bad:
        print(f"  {bad} cross-references to no KJV verse left out")


def write_places():
    """places.dcti: OpenBible.info's Bible places, each with where it is thought to be (the likeliest first, with
    OpenBible's confidence out of 1000 and its coordinates) and the verses that name it. Coordinates taken from
    OpenStreetMap (ODbL, not CC BY) are left out; so are the shapes and pictures."""
    ancient = [json.loads(x) for x in fetch(GEO.format("ancient")).decode("utf-8").splitlines() if x.strip()]
    modern = {m["id"]: m for m in (json.loads(x) for x in fetch(GEO.format("modern")).decode("utf-8").splitlines() if x.strip())}

    def where(m):
        if not m or (m.get("coordinates_source") or {}).get("type") == "osm" or not m.get("lonlat"):
            return ""
        lon, lat = map(float, m["lonlat"].split(","))
        return f" ({abs(lat):.4f}° {'N' if lat >= 0 else 'S'}, {abs(lon):.4f}° {'E' if lon >= 0 else 'W'})"
    rows = []
    for p in ancient:
        out = []
        types = ", ".join(t.replace("_", " ") for t in p.get("types", []))
        if types:
            out.append(f"<p><i>{html.escape(types)}</i></p>")
        score = lambda i: (i.get("score") or {}).get("time_total", 0)
        ids = sorted((i for i in p.get("identifications", []) if score(i) > 0), key=lambda i: -score(i))  # 0 or less: one OpenBible rejects
        if ids:
            lines = []
            for i in ids[:5]:
                name = html.escape(re.sub(r"<[^>]+>", "", i.get("description", "")).strip())
                name = re.sub(r"^(another name for (.+))$", r"\1 (see \2)", name)  # which the app links
                lines.append(f"{name}{where(modern.get(i.get('id')))}, confidence {score(i)}")
            out.append("<p><b>Identified as:</b> " + "; ".join(lines) + ".</p>")
        refs = [r for r in (osis_range(v["osis"]) for v in p.get("verses", [])) if r]
        if refs:
            out.append(f"<p><b>{len(refs)} verse{'s' if len(refs) != 1 else ''}:</b> " + "; ".join(f"<ref>{r}</ref>" for r in refs) + "</p>")
        rows.append((p["friendly_id"], "".join(out)))
    info = ("<p>The places of the Bible: what each is (a settlement, a mountain, a region…), the sites it is identified with, "
            "likeliest first, each with OpenBible.info's confidence (out of 1000) and coordinates, and the verses that name it.</p>"
            "<p>© OpenBible.info, CC BY 4.0 (https://github.com/openbibleinfo/Bible-Geocoding-Data). Coordinates OpenBible took "
            "from OpenStreetMap are left out (their licence is the ODbL), and so are the maps and pictures. "
            "Built by Two-edged Sword's tools/core.</p>")
    with module("places.dcti", "Bible Places (OpenBible.info)", "Places", info, into=BUNDLED) as db:
        db.executemany("INSERT INTO Dictionary VALUES (?,?)", sorted(rows, key=lambda r: r[0].lower()))
    print(f"places.dcti: {len(rows)} places")


def write_maps():
    import maps.build as maps
    maps.build(into=BUNDLED)


MORE |= {"maps": ("maps.refi", write_maps)}
MORE |= {"wesley": ("wesley.cmti", write_wesley), "torrey": ("torrey.dcti", write_torrey),
         "hitchcock": ("hitchcock.dcti", write_hitchcock), "abbott": ("abbott.lexi", write_abbott),
         "sme": ("sme.devi", write_spurgeon), "daily": ("daily.devi", write_daily_light),
         "byz": ("byz.bbli", write_byz), "byz+": ("byz+.bbli", write_byz_plus), "brenton": ("brenton.bbli", write_brenton),
         "weymouth": ("weymouth.bbli", write_weymouth), "wlc+": ("wlc+.bbli", write_wlc_plus),
         "openbible": ("openbible_xref.cmti", write_openbible_xref), "places": ("places.dcti", write_places)}


def main():
    if "--if-missing" in sys.argv and all((BUNDLED / f).exists() for f in CORE):
        for file, build in MORE.values():  # only the ones not built yet
            if not (BUNDLED / file).exists():
                build()
        for bid in BIBLES:
            if not (BUNDLED / f"{bid}.bbli").exists():
                write_bible(bid)
        return
    if "--only" in sys.argv:  # --only henry easton asv: just those
        names = sys.argv[sys.argv.index("--only") + 1:]
        known = {"henry", "easton", *MORE} | set(BIBLES)
        if not names or set(names) - known:
            sys.exit(f"--only takes {', '.join(sorted(known))}, not {' '.join(sorted(set(names) - known)) or 'nothing'}")
        if not (BUNDLED / "kjv.bbli").is_file():
            write_kjv(kjv()[0])  # what's built is checked against its verses
        if "henry" in names:
            write_henry()
        if "easton" in names:
            write_easton()
        for name in names:
            if name in MORE:
                MORE[name][1]()
        for bid in BIBLES:
            if bid in names:
                write_bible(bid)
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
    for _, build in MORE.values():
        build()
    for bid in BIBLES:
        write_bible(bid)


if __name__ == "__main__":
    main()
