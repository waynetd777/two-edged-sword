"""Builds e-Sword Bibles from CrossWire's SWORD modules: the Syriac Peshitta, the two English
translations of it (Murdock, Etheridge), Tyndale, the Geneva Bible of 1599 and the Douay-Rheims.

    python3 tools/crosswire/build.py [Peshitta Murdock Etheridge Tyndale Geneva1599 DRC]

Writes peshitta.bbli ("Syriac Peshitta", right to left), murdock.bbli ("Murdock's Peshitta
(English)"), etheridge.bbli ("Etheridge's Peshitta (English)"), tyndale.bbli ("Tyndale Bible
(1525/1530)"), geneva1599.bbli ("Geneva Bible (1599)") and drc.bbli ("Douay-Rheims (Challoner)")
to the app's modules folder, where the app finds them after Library → Rescan. With
module names, builds only those.

Sources: CrossWire's raw module zips, https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/
<Name>.zip, each a mods.d/<name>.conf and a zText module; and the SWORD library's versification
tables (canon.h, canon_nrsv.h, canon_vulg.h, https://crosswire.org/svn/sword/trunk/include/), which
say which verse each slot of a module's index holds. All six texts are public domain:
  Peshitta    the British and Foreign Bible Society's Syriac New Testament of 1905 (no Old Testament)
  Murdock     James Murdock's translation of the Peshitta New Testament, 1852 (peshito.com)
  Etheridge   J. W. Etheridge's translation of the Peshitta New Testament, 1846–1849 (peshito.com)
  Tyndale     William Tyndale's New Testament (1526/1534), Pentateuch (1530) and Jonah (Wikisource)
  Geneva1599  the 1599 Geneva Bible, Mark Langley's electronic edition (no Apocrypha)
  DRC         the Douay-Rheims Bible in Bishop Challoner's revision (1749–1752), sacredbible.org

A zText module is three files per testament: .bzs, a list of (offset, size, uncompressed size)
of zlib blocks in .bzz, and .bzv, (block, offset, size) for every slot in versification order —
the module's and testament's headings, then for each book its heading, and for each chapter its
heading and then its verses. Headings, notes and Strong's numbers are dropped; words the
translator supplied become <i>, subscriptions of the epistles <blu> and the words of Christ
<red>, as in the KJV (none of these modules marks the words of Christ).

The app lines Bibles up by the KJV's numbering, so each text is moved to it where it differs,
with the rules of tools/vulgate (see RULES there): the Geneva Bible's own numbering follows the
Hebrew in places, and SWORD squeezes it into the NRSV's, putting the verses left over at the end
of a chapter into its last verse (the Geneva marks each verse's end, so they are divided again);
the Douay-Rheims is numbered as the Vulgate, so it is moved as tools/vulgate moves the
Clementine (the Psalms by the Hebrew numbering, their titles joined to verse 1), and its
deuterocanonical books are numbered 67–73 as in latin.bbli. Where a module joins two verses, a
verse number left in the text divides them, or a rule here gives the phrase to divide at.
Chapters that still differ from the KJV are printed.

Downloads are cached in ~/Library/Caches/Two-edged Sword/crosswire. The Douay-Rheims also reads
the Clementine Vulgate through tools/vulgate, for which verses of the Psalms are titles.
"""
import html, importlib.util, io, os, re, sqlite3, struct, sys, urllib.request, zipfile, zlib
from pathlib import Path

# tools/vulgate/build.py, for its rules and the Clementine's text.
_spec = importlib.util.spec_from_file_location("vulgate", Path(__file__).resolve().parent.parent / "vulgate" / "build.py")
vulgate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vulgate)

HOME = Path(os.environ.get("HOME", ""))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import LIBRARY, find  # noqa: E402
CACHE = HOME / "Library/Caches/Two-edged Sword/crosswire"
RAWZIP = "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/{}.zip"
CANON = "https://crosswire.org/svn/sword/trunk/include/{}"

# SWORD's book names in e-Sword's order: 1–66, then the deuterocanon as latin.bbli numbers it.
OSIS = ["Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh",
        "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic",
        "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil",
        "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
        "Tob", "Jdt", "Wis", "Sir", "Bar", "1Macc", "2Macc"]

MODULES = {
    "Peshitta": dict(file="peshitta", title="Syriac Peshitta", abbrev="Peshitta", rtl=True,
                     about="The Peshitta, the standard Bible of the churches of the Syriac tradition: the New Testament in the text published by the British and Foreign Bible Society in 1905. All 27 books are here: 2 Peter, 2–3 John, Jude and Revelation, which the Peshitta itself lacks, from later Syriac versions. There is no Old Testament."),
    "Murdock": dict(file="murdock", title="Murdock's Peshitta (English)", abbrev="Murdock",
                    about="James Murdock's literal translation of the Syriac Peshitta New Testament (1852). Words he supplied are in italics; Acts 8:37 and 1 John 5:7, which the Peshitta lacks, are in italics too, as he printed them."),
    "Etheridge": dict(file="etheridge", title="Etheridge's Peshitta (English)", abbrev="Etheridge",
                      about="J. W. Etheridge's translation of the Syriac Peshitta New Testament: the Gospels (1846) and the Acts and Epistles (1849), with 2 Peter, 2–3 John, Jude and Revelation from a later Syriac text. It follows the Peshitta in leaving out John 7:53–8:11, Acts 8:37, 15:34 and 28:29, and the Comma Johanneum (1 John 5:7); Romans 7:24 and Revelation 20:9 are missing from the module."),
    "Tyndale": dict(file="tyndale", title="Tyndale Bible (1525/1530)", abbrev="Tyndale",
                    about="William Tyndale's translation from the Hebrew and Greek, never completed: the New Testament (1526, revised 1534), the Pentateuch (1530) and Jonah (1531), in his own spelling."),
    "Geneva1599": dict(file="geneva1599", title="Geneva Bible (1599)", abbrev="Geneva",
                       about="The Geneva Bible in its 1599 printing, the English Bible of Shakespeare, the Puritans and the Pilgrims, in its own spelling; the epistles' subscriptions are shown after their last verses. Mark Langley's electronic edition, without the notes and without the Apocrypha."),
    "DRC": dict(file="drc", title="Douay-Rheims (Challoner)", abbrev="DRC",
                about="The Douay-Rheims Bible, the English Catholic translation from the Latin Vulgate (New Testament Rheims 1582, Old Testament Douay 1609–1610), in Bishop Richard Challoner's revision of 1749–1752. With the deuterocanonical books (Tobit, Judith, Wisdom, Sirach, Baruch with the Letter of Jeremiah as chapter 6, 1–2 Maccabees) and the additions to Esther (10:4–16:24) and Daniel (3:24–90, 13–14)."),
}

# Rules for moving each module to the KJV's numbering, as tools/vulgate's RULES: by SWORD book name.
RULES = {
    "Peshitta": {},
    "Murdock": {
        "Matt": ["26:29 / And they sang praises", "26:46 / Arise, let us go"],
        "Luke": ["18:34 / And as they came near"],
        "Acts": ["19:40 / And having said these things", "20:16 / And from Miletus"],
        "2Cor": ["13:12 / All the saints salute you"],
    },
    "Etheridge": {},
    "Tyndale": {
        "Gen": ["9:28 / So that all the dayes"], "Exod": ["40:14 > 40:15"], "Lev": ["27:17 / But and if he halowe"],
        "Num": ["7:22 > 7:23"], "Matt": ["5:48 / ye shall therfore be perfecte"], "Luke": ["17:36 > 17:37"],
        "Rom": ["1:23 / and turned the glory"], "1Cor": ["3:22 / whether it be Paul"], "Gal": ["5:20 / envyinge murther"],
        "Heb": ["11:39 / God provydinge"], "Rev": ["21:26 > 21:27"],
    },
    "Geneva1599": {
        "Num": ["13:1 > 12:16", "30:1 > 29:40"], "1Sam": ["20:43 +", "24:1 > 23:29"], "2Sam": ["1:26 / howe are the mightie"],
        "Esth": ["2:22 / and when inquisition was"], "Job": ["6:29 / Is there iniquitie", "39:1 > 38:39", "40:1 > 40:6", "41:1 > 41:10"],
        "Ps": ["13:5 / I will sing to", "72:19 / HERE END THE"], "Prov": ["8:33 / blessed is the man"],
        "Eccl": ["5:1 > 5:2", "7:1 > 6:11"], "Song": ["1:1 > 1:2", "6:1 > 6:2"], "Isa": ["52:14 / so shall hee sprinkle"],
        "Jer": ["49:38 / but in the latter"], "Ezek": ["1:29 +", "20:48 / Then saide I"], "Dan": ["4:1 > 4:4"],
        "Hos": ["14:1 > 13:16"], "Hag": ["2:1 > 1:15"], "Luke": ["15:31 / It was meete that"], "Rom": ["1:30 / without vnderstanding"],
        "2Cor": ["13:12 / All the Saintes salute"], "Gal": ["1:21 / for I was vnknowen"], "Heb": ["13:6 +", "13:8 / Iesus Christ yesterday"],
        "2John": ["1:11 / Although I had many"],
        # The NRSV's numbering, which SWORD gives the module: 3 John 1:15 and Revelation 12:18 are the KJV's 1:14 and 13:1.
        "3John": ["1:15 +"], "Rev": ["12:18 > 13:1", "13:1 +"],
    },
    "DRC": {},
}


def get(url, name):
    p = CACHE / name
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as r:
            p.write_bytes(r.read())
    return p.read_bytes()


def canon(system):
    """{"ot": [(book, [verses in each chapter])], "nt": …} for a SWORD versification, from its canon header."""
    kjv = get(CANON.format("canon.h"), "canon.h").decode()
    t = kjv if system == "KJV" else get(CANON.format(f"canon_{system.lower()}.h"), f"canon_{system.lower()}.h").decode()
    suffix = "" if system == "KJV" else "_" + system.lower()

    def books(src, name):
        m = re.search(rf"struct sbook {name}\[\] = \{{(.*?)\}};", src, re.S)
        return [(b, int(n)) for b, n in re.findall(r'\{"[^"]+", "([^"]+)", "[^"]*", (\d+)\}', m[1])] if m else None

    ot = books(t, f"otbooks{suffix}") or books(kjv, "otbooks")
    nt = books(t, f"ntbooks{suffix}") or books(kjv, "ntbooks")
    m = re.search(rf"int vm{suffix}\[\] = \{{(.*?)\}};", t, re.S)
    vm = [int(x) for x in re.findall(r"\d+", re.sub(r"//.*", "", m[1]))]
    out = {}
    for test, bs in (("ot", ot), ("nt", nt)):
        out[test] = []
        for b, n in bs:
            out[test].append((b, vm[:n]))
            del vm[:n]
    if vm:
        sys.exit(f"{system}: {len(vm)} chapters left over in the versification")
    return out


def conf(z):
    name = next(n for n in z.namelist() if n.startswith("mods.d/"))
    c = {}
    for line in z.read(name).decode("utf-8", "replace").splitlines():
        m = re.match(r"(\w+)=(.*)", line)
        if m and m[1] not in c:
            c[m[1]] = m[2].strip()
    return c


def ztext(z, test):
    """Every slot of one testament's index, as text ("" where empty)."""
    def f(ext):
        n = [x for x in z.namelist() if x.endswith(f"/{test}.{ext}")]
        return z.read(n[0]) if n else b""
    bzs, bzv, bzz = f("bzs"), f("bzv"), f("bzz")
    blocks, out = {}, []
    for i in range(len(bzv) // 10):
        block, offset, size = struct.unpack_from("<IIH", bzv, i * 10)
        if not size:
            out.append("")
            continue
        if block not in blocks:
            start, length, _ = struct.unpack_from("<III", bzs, block * 12)
            blocks[block] = zlib.decompress(bzz[start:start + length])
        raw = blocks[block][offset:offset + size]
        try:
            out.append(raw.decode("utf-8"))
        except UnicodeDecodeError:
            out.append(raw.decode("cp1252"))
    return out


def read(name):
    """(conf, {book: [(chapter, verse, raw text)]}, Sirach's prologue) for a module, in its own versification."""
    z = zipfile.ZipFile(io.BytesIO(get(RAWZIP.format(name), f"{name}.zip")))
    c = conf(z)
    if c.get("CipherKey") is not None:
        sys.exit(f"{name} is enciphered")
    if c.get("ModDrv", "").lower() != "ztext" or c.get("CompressType", "ZIP") != "ZIP":
        sys.exit(f"{name}: {c.get('ModDrv')} / {c.get('CompressType')}, not a zlib zText module")
    books, prologue = {}, ""
    for test, bs in canon(c.get("Versification", "KJV")).items():
        slots = ztext(z, test)
        if not slots:
            continue
        i = 2  # the module's heading, the testament's
        for b, chapters in bs:
            head = slots[i]
            if b == "Sir" and re.sub(r"<[^>]+>", "", head).strip():
                prologue = head
            i += 1
            rows = []
            for ch, n in enumerate(chapters, 1):
                i += 1  # the chapter's heading
                rows += [(ch, v, slots[i + v - 1]) for v in range(1, n + 1)]
                i += n
            if any(t for _, _, t in rows):
                books[b] = rows
        if i != len(slots):
            sys.exit(f"{name} {test}: {len(slots)} slots, the versification has {i}")
    return c, books, prologue


def text(t, source):
    """A slot's markup as e-Sword verse text."""
    if source == "GBF":
        t = re.sub(r"<RF>.*?<Rf>", "", t, flags=re.S)
        t = t.replace("<FI>", "<i>").replace("<Fi>", "</i>").replace("<FR>", "<red>").replace("<Fr>", "</red>")
        t = re.sub(r"<(?!/?(i|red)>)[^>]*>", "", t)
    else:
        t = re.sub(r"<note\b[^>]*/>|<note\b.*?</note>", "", t, flags=re.S)
        t = re.sub(r"<title\b[^>]*/>|<title\b.*?</title>", "", t, flags=re.S)
        t = re.sub(r"<closer\b[^>]*sID[^>]*/>(.*?)<closer\b[^>]*eID[^>]*/>", r"<blu>\1</blu>", t, flags=re.S)
        t = re.sub(r"<(transChange\b[^>]*added|hi\b[^>]*italic)[^>]*>(.*?)</(transChange|hi)>", r"<i>\2</i>", t, flags=re.S)
        t = re.sub(r'<q\b[^>]*who="Jesus"[^>]*>(.*?)</q>', r"<red>\1</red>", t, flags=re.S)
        t = re.sub(r"<(?!/?(i|red|blu)>)[^>]*>", " ", t)
    t = html.unescape(t)
    t = re.sub(r"\s+([,;:?!)]|\.(?!\w))", r"\1", re.sub(r"\s+", " ", t))  # not Tyndale's numbers: .iij.
    return re.sub(r"<(i|red|blu)>\s*</\1>", "", t).strip()


def units(rows):
    """The Geneva's verses, where SWORD ran several into one slot: each is ended by a line break."""
    out = []
    for c, v, t in rows:
        parts = [p for p in re.split(r'<lb type="x-unparagraphed"/>', t) if re.sub(r"<[^>]+>", "", p).strip()]
        if len(parts) > 1:
            # A closer after the last verse belongs to it.
            if re.fullmatch(r"\s*(<[^>]+>\s*)*<closer.*", parts[-1], re.S) and not re.sub(r"<closer.*?</?closer[^>]*>|<[^>]+>", "", parts[-1]).strip():
                parts[-2:] = [parts[-2] + parts[-1]]
        out += [(c, v + k, p) for k, p in enumerate(parts or [""])]
    return out


def numbered(rows):
    """Where a module ran the next verse into this one after its number ("50 …", "(19) …"), divide them."""
    text = {(c, v): t for c, v, t in rows}
    for c, v, t in rows:
        n = str(v + 1).replace("1", "[1lI]")  # Murdock's OCR reads 1 as l
        m = re.search(rf"\s\(?{n}\)? ", t) if text.get((c, v + 1)) == "" else None
        if m:
            text[(c, v)], text[(c, v + 1)] = t[:m.start()].strip(), t[m.end():]
    return [(c, v, text[(c, v)]) for c, v, _ in rows]


def trim(rows, rules, all_empty=False):
    """Without the empty slots, which hold no verse of this text: rules that keep the verse after
    one in its place (the text lacks that verse), unless a rule already moves it; at the ends of
    chapters, and in the Geneva everywhere, they are simply dropped."""
    out, anchors, gap = [], [], False
    ruled = {r.split(" ")[0] for r in rules}
    for i, (c, v, t) in enumerate(rows):
        if out and out[-1][0] != c:
            gap = False
        if not t:
            gap = gap or not (all_empty or all(not tt for cc, _, tt in rows[i:] if cc == c))
            continue
        if gap and f"{c}:{v}" not in ruled:
            anchors.append(f"{c}:{v} > {c}:{v}")
        gap = False
        out.append((c, v, t))
    return out, rules + anchors


def chapter_lengths(module):
    c = sqlite3.connect(f"file:{find(module + '.bbli')}?immutable=1", uri=True)
    return {(b, ch): n for b, ch, n in c.execute("SELECT Book, Chapter, MAX(Verse) FROM Bible GROUP BY Book, Chapter")}


def drc_rules():
    """tools/vulgate's rules, by SWORD book name, with the Douay-Rheims' words to divide verses at."""
    rules = {OSIS[i]: list(vulgate.RULES.get(n, [])) for i, n in enumerate(vulgate.BOOKS[:66])}
    ps = [(c, v, vulgate.clean(t)) for c, v, t in vulgate.titles(vulgate.source()["Ps"])]
    rules["Ps"] = vulgate.psalm_rules(ps)
    titles = {(c, v) for c, v, t in ps if re.fullmatch(r"<b>[^<]*</b>", t)}
    for b, rs in rules.items():
        for i, r in enumerate(rs):
            m = re.match(r"(\d+:\d+) (\+/|/) (.*)", r)
            if m:
                phrase = DRC_PHRASES.get(f"{b} {m[1]}")
                rs[i] = f"{m[1]} {m[2]} {phrase}" if phrase else None
        rules[b] = [r for r in rs if r] + DRC_RULES.get(b, [])
    for b in OSIS[66:]:
        rules[b] = DRC_RULES.get(b, [])
    return rules, titles


# Where tools/vulgate divides a Latin verse at a phrase, the Douay-Rheims' words for it; and further rules.
# (The Douay-Rheims has the Clementine's 15:10 as two verses, 10 and 11, so it is not divided.)
DRC_PHRASES = {
    "Gen 5:31": "And Noe, when", "Gen 50:22": "And he saw the children", "Lev 26:45": "These are the judgments",
    "Num 11:34": "And departing from", "Josh 21:36": "and Jethson", "Josh 21:37": "and Hesebon", "Judg 21:24": "In those days",
    "1Chr 11:46": "Eliel, and Obed", "1Chr 20:7": "These were the sons", "Neh 3:30": "After him Melcias", "Neh 12:33": "Judas",
    "Job 42:16": "and he died", "Song 7:1": "How beautiful are thy steps", "Jer 37:4": "And the army of Pharao",
    "Ezek 2:9": "and he spread it", "Mic 5:11": "and I will take away sorceries", "Matt 17:14": "Lord, have pity",
    "Mark 4:40": "And they feared exceedingly", "John 11:56": "And the chief priests", "Acts 7:55": "And he said: Behold",
    "Acts 14:6": "and were there preaching", "Acts 19:40": "And when he had said", "2Cor 1:23": "not because we exercise",
    "2Cor 13:12": "All the saints salute you",
    "Ps 43:22": "Because for thy sake", "Ps 55:11": "In God have I hoped", "Ps 71:2": "To judge thy people",
    "Ps 99:2": "serve ye the Lord", "Ps 108:2": "for the mouth of the wicked", "Ps 145:2": "in my life I will praise",
    "Ps 12:6": "I will sing to the Lord",
}
# Where the Douay-Rheims module divides verses otherwise than the Clementine (its 1 Kings 17:19,
# Proverbs 30:29 and Baruch 6:37 are empty: the verse is missing from the module).
DRC_RULES = {
    "2Sam": ["13:38 / And king David ceased"], "Ps": ["42:6 +", "125:7 +", "135:27 +", "150:5 / let every spirit praise"],
    "Isa": ["45:24 +", "46:11 / Hear me, O ye hardhearted"], "1Thess": ["4:11 / and that you walk honestly"],
    "2Thess": ["2:10 / Therefore God shall send"], "Sir": ["29:17 > 29:18"],
}


def build(name):
    m = MODULES[name]
    kjv = chapter_lengths("kjv")
    c, books, prologue = read(name)
    source = c.get("SourceType", "Plain")
    rules = dict(RULES[name])
    titles = set()
    if name == "DRC":
        rules, titles = drc_rules()
    verses = []
    for b, rows in books.items():
        n = OSIS.index(b) + 1 if b in OSIS else None
        if n is None:
            print(f"  {b}: not an e-Sword book, left out")
            continue
        if name == "Geneva1599":
            rows = units(rows)
        rows = [(ch, v, text(t, source)) for ch, v, t in rows]
        if b == "Ps" and titles:
            rows = [(ch, v, f"<b>{t}</b>" if (ch, v) in titles and t else t) for ch, v, t in rows]
        if b == "Sir" and prologue:
            rows[0] = (1, 1, f"<i>Prologue</i> {text(prologue, source)} {rows[0][2]}")
        rows, rs = trim(numbered(rows), rules.get(b, []), name == "Geneva1599")
        if n <= 66 or rs:
            rows = vulgate.move(rows, rs, kjv, n)
        verses += [(n, ch, v, t.strip()) for ch, v, t in rows if t.strip()]

    mine = {}
    for b, ch, v, _ in verses:
        mine.setdefault((b, ch), set()).add(v)
    ot = nt = False
    for (b, ch) in sorted(set(mine) | {k for k in kjv if any(k[0] == b for b, _ in mine)}):
        if b > 66 or (b, ch) not in kjv:
            continue
        have, want = mine.get((b, ch), set()), set(range(1, kjv.get((b, ch), 0) + 1))
        if have != want:
            miss, extra = sorted(want - have), sorted(have - want)
            print(f"  {OSIS[b - 1]} {ch}: {len(have)} verses, KJV {len(want)}"
                  + (f"; none for KJV {miss[:12]}{'…' if len(miss) > 12 else ''}" if miss else "")
                  + (f"; beyond the KJV {extra[:6]}{'…' if len(extra) > 6 else ''}" if extra else ""))
    ot = any(b <= 39 for b, *_ in verses)
    nt = any(40 <= b <= 66 for b, *_ in verses)
    apoc = any(b > 66 for b, *_ in verses)

    about = re.sub(r"\s*\\par\s*", "<br>", html.escape(c.get("About", ""), quote=False))
    info = (f"<p>{m['about']}</p>"
            f"<p>From CrossWire's SWORD module {name} ({c.get('Description', '')}), version {c.get('Version', '?')}"
            + (f"; text from {html.escape(c['TextSource'])}" if c.get("TextSource") else "")
            + f". Verses are numbered as in the KJV. Built by Two-edged Sword's tools/crosswire.</p>"
            f"<p>{about}</p><p>{html.escape(c.get('DistributionLicense', 'Public domain'))}.</p>")
    p = LIBRARY / f"{m['file']}.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,?,?,?,0,?)", (m["title"], m["abbrev"], info, ot, nt, apoc, int(m.get("rtl", False))))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", sorted(verses))
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(verses)} verses")


def main():
    LIBRARY.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[1:] or MODULES:
        if name not in MODULES:
            sys.exit(f"unknown module {name}; one of {', '.join(MODULES)}")
        print(name)
        build(name)


if __name__ == "__main__":
    main()
