"""Builds ginsburg.bbli ("Hebrew Bible (Ginsburg 1894, Ben Chayyim)"): the Hebrew Old Testament as
Christian David Ginsburg edited it for the Trinitarian Bible Society in 1894, following Jacob ben
Chayyim's text of Daniel Bomberg's second Rabbinic Bible (Venice, 1524–25), the Hebrew the KJV's
translators used. It stands in for the Rabbinic Bible on the KJV History page.

    python3 tools/ginsburg/build.py

Writes to the e-Sword library, where the app finds it after Library → Rescan.

Source: github.com/ahembd/Ginsburg_Hebrew_Bible (Apache-2.0), one text file per book, with vowels
and accents (the edition without the rafe mark). Its files have lost some verses (Daniel 11:26 to
the end, Ezra 8–10, a verse at the end of a few books), which are taken from its sister,
github.com/ahembd/Ginsburg_Hebrew_Bible_w_rafe (GPL-3.0; the rafe taken off); built here and not
committed, so the two licences never meet in anything distributed. Four verses are in neither set
(the files stop short): 1 Kings 22:52-53, Job 42:17 and Micah 7:20 in the KJV's numbering; they are
left out rather than filled from another edition. Nehemiah 7:68 is not in the Masoretic text. A chapter starts with a line "פרק א"; a verse with
its number in Hebrew letters, "[א]" (two slips are mended: "98 פרקs" for Psalm 98's heading, and
"**40" for 1 Samuel 14:40); a line without a number carries on the verse before it. Left out: the
names of the weekly readings ("{פרשת בראשית}") and of their sections ("[שני]"), the paragraph marks after a verse (פ, ס), and the
directional and joining marks (RLM, LRM, ZWJ, ZWNJ). Letters written as presentation forms (שׁ as
one character) are written out as letter and points.

Where the margin corrects the written text, the file has "//כתיב// written //קרי// read" (or
כת׳/קר׳, or ס״א for another reading); the reading (qere) is given, as in WLC+.

Ginsburg numbers the verses as in the Hebrew, mostly as the WLC does, but divides a few otherwise
(see renumber), so his words are first lined up with the WLC's and put in its verses; then they are
moved to the KJV's numbering with the same map as WLC+ (morphhb's VerseMap.xml, through tools/wlc): a psalm's title joins verse 1, and a
verse the KJV divides is split at its main pause (the atnach). Downloads are cached in
~/Library/Caches/Two-edged Sword/ginsburg.
"""
import importlib.util, os, re, sqlite3, subprocess, sys, unicodedata
import xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = Path(os.environ.get("ESWORD_LIBRARY") or HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
CACHE = HOME / "Library/Caches/Two-edged Sword/ginsburg"
REPO = "https://github.com/ahembd/Ginsburg_Hebrew_Bible"
REPO_RAFE = "https://github.com/ahembd/Ginsburg_Hebrew_Bible_w_rafe"
# The names of the Sabbath readings' sections, before a verse's number: left out.
ALIYAH = re.compile(r"\[\u200f?(?:שני|שלישי|רביעי|חמישי|ששי|שביעי|מפטיר)\]\s*")

# tools/wlc/build.py, for the WLC -> KJV verse map.
_spec = importlib.util.spec_from_file_location("wlc", Path(__file__).resolve().parent.parent / "wlc" / "build.py")
wlc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wlc)

# The files' names, in e-Sword's book order.
FILES = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1Samuel", "2Samuel", "1Kings", "2Kings",
         "1Chronicles", "2Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song_of_Solomon",
         "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
         "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"]
LETTERS = {**{c: i + 1 for i, c in enumerate("אבגדהוזחט")}, **{c: (i + 1) * 10 for i, c in enumerate("יכלמנסעפצ")},
           **{c: (i + 1) * 100 for i, c in enumerate("קרשת")}, "ך": 20, "ם": 40, "ן": 50, "ף": 80, "ץ": 90}
MARKS = re.compile("[‌‍‎‏‪-‮]")


def number(s):
    """A number in Hebrew letters: "טו" 15, "קיט" 119."""
    return sum(LETTERS[c] for c in s if c in LETTERS)


def repo(url=REPO, name="repo"):
    d = CACHE / name
    if not d.exists():
        d.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--depth", "1", url, str(d)], check=True)
    return {re.sub(r"^\d+\)|\.txt$", "", p.name): p for p in d.glob("*.txt")}


LABEL = re.compile(r"^\s*(כתיב|כת׳|קרי׳?|קר׳|ס׳׳א)\s*")


def qere(text):
    """The reading where the margin corrects the text. The file marks it in several ways, split by
    "//": "//כתיב// K //קרי// Q", "//כתיב K // קרי // Q", "//כתיב// K // Q", or with the reading's
    label typed as כתיב again; the reading, as many words of it as the written form has, stands for
    both. A "//" anywhere else is dropped."""
    parts = text.split("//")
    out, k = [parts[0]], 1
    while k < len(parts):
        seg = parts[k]
        m = LABEL.match(seg)
        if m and m.group(1) in ("כתיב", "כת׳"):
            written = seg[m.end():].strip()
            k += 1
            if not written and k < len(parts):
                written, k = parts[k].strip(), k + 1
            # Then any empty piece or label before the reading.
            while k < len(parts) and (not parts[k].strip() or LABEL.fullmatch(parts[k].strip() + " ")):
                k += 1
            if k < len(parts):
                n = max(1, len(written.split()))
                words = parts[k].strip().split(" ")
                out.append(" " + " ".join(words[:n]).strip("()") + " " + " ".join(words[n:]))
                k += 1
            continue
        out.append(seg)
        k += 1
    return "".join(out)


def clean(text):
    text = MARKS.sub("", unicodedata.normalize("NFC", text)).replace("\u05bf", "")  # and the rafe
    text = re.sub(r"\{[^}]*\}", "", text)  # the weekly reading's name
    text = qere(text)
    # Paragraph marks, after a verse or within one (the Ten Commandments): "׃ס", or פ or ס alone.
    text = re.sub(r"׃\s*[פס](?=\s|$)", "׃", text.strip())
    text = re.sub(r"(?:(?<=\s)|^)[פס](?=\s|$)", "", text)
    text = text.replace("(", "").replace(")", "")
    return re.sub(r"\s+", " ", text).strip()


def book(path):
    """{(chapter, verse): text} in the Hebrew numbering."""
    verses, ch, v = {}, 0, 0
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = MARKS.sub("", line).strip()
        if not line:
            continue
        m = re.fullmatch(r"פרק ([א-ת]+)", line) or re.fullmatch(r"(\d+) פרקs?", line)
        if m:
            ch = int(m.group(1)) if m.group(1).isdigit() else number(m.group(1))
            v = 0
            continue
        if not ch:
            continue  # the book's name
        line = ALIYAH.sub("", re.sub(r"^\{[^}]*\}\s*", "", line))
        m = re.match(r"\[([א-ת]+)\]\s*|\*\*(\d+)\s+", line)
        if m:
            v = int(m.group(2)) if m.group(2) else number(m.group(1))
            line = line[m.end():]
            verses[(ch, v)] = line
        elif v:
            verses[(ch, v)] += " " + line  # a verse carried onto another line
    return {k: clean(t) for k, t in verses.items()}


def read(files, rafe, name):
    """A book from the files without the rafe, with any verse they lack from those with it: each
    set has lost some verses (Daniel 11:26 to the end, Ezra 8 to 10, in the first)."""
    out = book(files[name]) if name in files else {}
    if name in rafe:
        for k, t in book(rafe[name]).items():
            if k not in out and t:
                out[k] = t
                FILLED.append((FILES.index(name) + 1, *k))
    return out


FILLED = []


def consonants(w):
    return "".join(ch for ch in unicodedata.normalize("NFD", w) if "\u05d0" <= ch <= "\u05ea")


def leningrad(n):
    """The WLC's book `n` as [(verse, consonants of a word)], the reading where the margin corrects
    the text, words joined by maqaf apart."""
    out = []
    for v in ET.parse(wlc.get(wlc.BOOKS[n - 1])).getroot().iter(f"{wlc.NS}verse"):
        _, c, vv = v.get("osisID").split(".")
        for w in v.iter(f"{wlc.NS}w"):
            if w.get("type") != "x-ketiv":
                out.append(((int(c), int(vv)), consonants((w.text or "").replace("/", ""))))
    return out


def renumber(n, verses):
    """Ginsburg's verses in the WLC's numbering, word by word: the two texts are all but the same,
    but Ginsburg divides some verses otherwise (the Ten Commandments in Exodus 20 and Deuteronomy 5,
    Numbers 25:19 and 1 Samuel 24:1 in the chapter before, 1 Kings 22:53-54, Micah 7:20 and Job
    42:17 joined to the verse before, Job 32). So his words are lined up with the WLC's and each goes
    to the verse its counterpart is in; a word with none goes with the next word of its verse that
    has one, or else the one before."""
    toks = [(k, t) for k, text in sorted(verses.items()) for t in text.split(" ") if t]
    pieces, owner = [], []
    for i, (_, t) in enumerate(toks):
        for part in re.split("[\u05be]", t):
            c = consonants(part)
            if c:
                pieces.append(c)
                owner.append(i)
    ref = leningrad(n)
    where = [None] * len(pieces)
    sm = SequenceMatcher(None, pieces, [c for _, c in ref], autojunk=False)
    for m in sm.get_matching_blocks():
        for k in range(m.size):
            where[m.a + k] = ref[m.b + k][0]
    tok_key = [None] * len(toks)
    for pi, key in enumerate(where):
        if key and tok_key[owner[pi]] is None:
            tok_key[owner[pi]] = key
    # Words without a counterpart: the next placed word's verse if it's in the same verse of
    # Ginsburg's, else the last placed word's.
    last = None
    for i in range(len(toks)):
        if tok_key[i] is None:
            nxt = next((j for j in range(i + 1, len(toks)) if tok_key[j] is not None), None)
            tok_key[i] = tok_key[nxt] if nxt is not None and toks[nxt][0] == toks[i][0] else (last or (tok_key[nxt] if nxt is not None else toks[i][0]))
        last = tok_key[i]
    out = {}
    for (k, t), key in zip(toks, tok_key):
        out[key] = f"{out[key]} {t}" if key in out else t
    SHARE.append((n, sum(1 for w in where if w), len(pieces)))
    return out


SHARE = []  # (book, words matched to the WLC's, words): for the report


def halves(text):
    """The verse up to the word with the atnach (U+0591), its main pause, and the rest."""
    words = text.split(" ")
    cut = next((i + 1 for i, w in enumerate(words) if "֑" in w), len(words))
    return " ".join(words[:cut]), " ".join(words[cut:])


def main():
    if not LIBRARY.is_dir():
        sys.exit(f"no e-Sword library at {LIBRARY}")
    files, rafe = repo(), repo(REPO_RAFE, "rafe")
    moves = wlc.verse_map()
    verses = {}
    for n, name in enumerate(FILES, 1):
        for (c, v), text in sorted(renumber(n, read(files, rafe, name)).items()):
            k = (n, c, v)
            m = moves.get(k, {})
            first, second = halves(text)
            parts = [(m.get("a", k), first), (m.get("b", k), second)] if "a" in m or "b" in m else [(m.get(None, k), text)]
            for key, t in parts:
                if t:
                    verses[key] = f"{verses[key]} {t}" if key in verses else t
    rows = [(b, c, v, f"<heb>{t}</heb>") for (b, c, v), t in sorted(verses.items())]
    info = ("<p>The Hebrew Old Testament as Christian David Ginsburg edited it for the Trinitarian Bible Society (1894), "
            "following Jacob ben Chayyim's text of Daniel Bomberg's second Rabbinic Bible (Venice, 1524–25), the Hebrew the "
            "KJV's translators used. From github.com/ahembd/Ginsburg_Hebrew_Bible (Apache-2.0), with vowels and accents. "
            "Verses are numbered as in the KJV (psalm titles are part of verse 1); where the margin corrects the text "
            "(ketiv/qere), the reading is given. 1 Kings 22:52–53, Job 42:17 and Micah 7:20 are missing from the source files; "
            "Nehemiah 7:68 is not in the Masoretic text. Built by Two-edged Sword's tools/ginsburg.</p>")
    p = LIBRARY / "ginsburg.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,1,0,0,0,1)", ("Hebrew Bible (Ginsburg 1894, Ben Chayyim)", "Ginsburg", info))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    db.commit()
    db.close()
    tmp.replace(p)
    matched = sum(m for _, m, _ in SHARE) / max(sum(t for _, _, t in SHARE), 1)
    print(f"{len(FILLED)} verses from the edition with the rafe; {matched:.1%} of the words match the WLC's")
    print(f"{p.name}: {len(rows)} verses")


if __name__ == "__main__":
    main()
