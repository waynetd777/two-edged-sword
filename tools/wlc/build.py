"""Builds wlc+.bbli ("Westminster Leningrad Codex w/ Strong's"): the Hebrew Old Testament word by
word, each word with its English, Strong's number and grammar, as the Greek interlinears are.

    python3 tools/wlc/build.py

Writes to the app's modules folder, where the app finds it after Library → Rescan.

Source: the Open Scriptures Hebrew Bible, https://github.com/openscriptures/morphhb (CC BY 4.0):
the WLC in OSIS, one file per book, every word with its lemma (a Strong's number, with the prefixes
written as letters: b/7225 is "in" + H7225) and its morphology; and VerseMap.xml, which moves the
WLC's verses to the KJV's numbering where they differ. A verse it doesn't list keeps its number, so
a psalm's title, the WLC's verse 1, is joined to the KJV's verse 1 with what follows it.

English: STEPBible's TBESH (Translators Brief lexicon of Extended Strongs for Hebrew, Tyndale House,
CC BY 4.0, https://github.com/STEPBible/STEPBible-Data): a short gloss for each Strong's number. A
word's English is that gloss with its prefixes (and, the, in, to, …) before it and its pronoun
suffix as English ("his", "him"); it is the dictionary sense, not a translation in context. The
grammar is morphhb's morphology code spelled out (HVqp3ms: verb · qal perfect · 3 masc. sing.).

The markup is INT+'s (see tokenize in src/esword.tsx): each word a
<div><grk>word</grk><num>H7225</num><tvm>grammar</tvm><gra>English</gra></div>. A maqaf, sof pasuq
or paseq goes in the word before it.

Where the margin corrects the written text (ketiv and qere), the reading (qere) is given. Notes,
and the paragraph markers pe and samekh, are left out.

Downloads are cached in ~/Library/Caches/Two-edged Sword/wlc.
"""
import os, re, sqlite3, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import LIBRARY, find  # noqa: E402
CACHE = HOME / "Library/Caches/Two-edged Sword/wlc"
SRC = "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/{}.xml"
NS = "{http://www.bibletechnologies.net/2003/OSIS/namespace}"
BOOKS = ["Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh",
         "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic",
         "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal"]
SEGS = {"x-maqqef", "x-sof-pasuq", "x-paseq"}
TBESH = ("https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
         + urllib.parse.quote("TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt"))


def get(name, url=None, file=None):
    p = CACHE / (file or f"{name}.xml")
    if not p.exists() or not p.stat().st_size:
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url or SRC.format(name), timeout=120) as r:
            p.write_bytes(r.read())
    return p


def glosses():
    """{"H1254a": "create", "H0430": "God", …}: TBESH's gloss for each Strong's number, from its first
    entry (the others are the word as part of a name, or its other senses)."""
    out = {}
    for line in get("TBESH", TBESH, "TBESH.txt").read_text(encoding="utf-8-sig").split("\n"):
        f = line.split("\t")
        if len(f) > 6 and re.match(r"H\d{4}[a-z]?$", f[0]) and f[0] not in out:
            g = f[6].split(":")[-1].strip()  # "first: beginning" is the sense "beginning" of "first"
            g = re.sub(r"^to\s+", "", g).replace("[Obj.]", "[obj.]")
            out[f[0]] = g
    return out


GLOSS = {}


def gloss_for(lemma):
    """TBESH's gloss for a morphhb lemma number ("1254 a", "430", "1008+")."""
    m = re.match(r"(\d+)\s*([a-z])?", lemma.strip())
    if not m:
        return ""
    key = f"H{int(m.group(1)):04d}"
    return GLOSS.get(key + (m.group(2) or ""), "") or GLOSS.get(key, "") or GLOSS.get(key + "a", "")


# morphhb's lemma prefixes, in English.
PREFIX = {"b": "in", "c": "and", "d": "the", "i": "?", "k": "like", "l": "to", "m": "from", "s": "which"}
POSSESSIVE = {"1s": "my", "1p": "our", "2s": "your", "2p": "your", "3ms": "his", "3fs": "her", "3mp": "their", "3fp": "their", "3cp": "their", "3bs": "its"}
OBJECT = {"my": "me", "our": "us", "your": "you", "his": "him", "her": "her", "their": "them", "its": "it"}

# OSHB morphology codes, https://hb.openscriptures.org/parsing/HebrewMorphologyCodes.html
POS = {"A": "adjective", "C": "conjunction", "D": "adverb", "N": "noun", "P": "pronoun", "R": "preposition", "S": "suffix", "T": "particle", "V": "verb"}
STEM_H = {"q": "qal", "N": "niphal", "p": "piel", "P": "pual", "h": "hiphil", "H": "hophal", "t": "hithpael", "o": "polel", "O": "polal",
          "r": "hithpolel", "m": "poel", "M": "poal", "k": "palel", "K": "pulal", "Q": "qal passive", "l": "pilpel", "L": "polpal",
          "f": "hithpalpel", "D": "nithpael", "j": "pealal", "i": "pilel", "u": "hothpaal", "c": "tiphil", "v": "hishtaphel",
          "w": "nithpalel", "y": "nithpoel", "z": "hithpoel"}
STEM_A = {"q": "peal", "Q": "peil", "u": "hithpeel", "p": "pael", "P": "ithpaal", "M": "hithpaal", "a": "aphel", "h": "haphel",
          "s": "saphel", "e": "shaphel", "H": "hophal", "i": "ithpeel", "t": "hishtaphel", "v": "ishtaphel", "w": "hithaphel",
          "o": "polel", "z": "ithpoel", "r": "hithpolel", "f": "hithpalpel", "b": "hephal", "c": "tiphel", "m": "poel",
          "l": "palpel", "L": "ithpalpel", "O": "ithpolel", "G": "ittaphal"}
CONJ = {"p": "perfect", "q": "sequential perfect", "i": "imperfect", "w": "sequential imperfect", "h": "cohortative",
        "j": "jussive", "v": "imperative", "r": "participle", "s": "passive participle", "a": "infinitive absolute", "c": "infinitive construct"}
PERSON = {"1": "1", "2": "2", "3": "3"}
GENDER = {"m": "masc.", "f": "fem.", "b": "masc./fem.", "c": "common"}
NUMBER = {"s": "sing.", "p": "plur.", "d": "dual"}
STATE = {"a": "absolute", "c": "construct", "d": "determined"}
TYPES = {"N": {"c": "", "g": "gentilic", "p": "proper"}, "A": {"a": "", "c": "cardinal", "g": "gentilic", "o": "ordinal"},
         "P": {"d": "demonstrative", "f": "indefinite", "i": "interrogative", "p": "personal", "r": "relative"},
         "T": {"a": "affirmation", "d": "article", "e": "exhortation", "i": "interrogative", "j": "interjection", "m": "demonstrative",
               "n": "negative", "o": "object marker", "r": "relative"},
         "S": {"d": "directional", "h": "paragogic he", "n": "paragogic nun", "p": "pronominal"}, "R": {"d": "with article"}}


def pgn(code, person=True):
    """Person, gender, number (and state) from the rest of a code: "3ms" -> "3 masc. sing."."""
    out, i = [], 0
    if person and i < len(code) and code[i] in PERSON:
        out.append(code[i]); i += 1
    for table in (GENDER, NUMBER, STATE):
        if i < len(code) and code[i] in table:
            out.append(table[code[i]]); i += 1
    return " ".join(out)


def grammar_segment(seg, aramaic):
    pos = POS.get(seg[:1])
    if not pos:
        return ""
    rest = seg[1:]
    if seg[0] == "V":
        stem = (STEM_A if aramaic else STEM_H).get(rest[:1], "")
        conj = CONJ.get(rest[1:2], "")
        return " · ".join(x for x in (pos, f"{stem} {conj}".strip(), pgn(rest[2:], conj not in ("participle", "passive participle"))) if x)
    kind = TYPES.get(seg[0], {}).get(rest[:1], None) if rest else None
    if kind is not None:
        rest = rest[1:]
    if seg[0] == "T":
        return kind or pos
    name = (f"{pos} {kind}" if seg[0] == "R" else f"{kind} {pos}").strip() if kind else pos
    return " · ".join(x for x in (name, pgn(rest, seg[0] in "PS")) if x)


def grammar(morph):
    """morphhb's code spelled out, a part per prefix or suffix: HR/Ncfsa -> "preposition + noun · fem. sing. absolute"."""
    if not morph:
        return ""
    aramaic = morph[0] == "A"
    return " + ".join(g for g in (grammar_segment(s, aramaic) for s in morph[1:].split("/")) if g)


def english(lemma, morph):
    """The word's English: its prefixes, the gloss, and its pronoun suffix."""
    parts = [p.strip() for p in (lemma or "").split("/")]
    segs = (morph or " ")[1:].split("/")
    prefixes = [p for p in parts if p in PREFIX]
    words = []
    for letter, seg in zip(prefixes, segs):
        words.append(PREFIX[letter] + (" the" if seg == "Rd" else ""))
    base = " ".join(g for g in (gloss_for(p) for p in parts if re.match(r"\d", p)) if g)
    main = segs[len(prefixes)] if len(segs) > len(prefixes) else ""
    # A noun, adjective or participle owns its suffix ("my shepherd"); a verb or preposition takes it as object.
    owns = main[:1] in ("N", "A") or (main[:1] == "V" and main[2:3] in ("r", "s"))
    after = []
    for seg in segs[len(prefixes) + 1:]:
        if seg.startswith("Sp"):
            code = seg[2:]
            pos = POSSESSIVE.get(code) or POSSESSIVE.get(code[:1] + code[-1:])
            if pos and owns:
                words.append(pos)
            elif pos:
                after.append(OBJECT[pos])
        elif seg == "Sd":
            words.append("toward")
    return " ".join(words + ([base] if base else []) + after)


def ref(osis):
    """(book, chapter, verse) and which part of the verse, "a" or "b", if the reference names one."""
    osis, _, part = osis.partition("!")
    b, c, v = osis.split(".")
    return (BOOKS.index(b) + 1, int(c), int(v)), part or None


def verse_map():
    """{WLC verse: {part: KJV verse}}, part None for the whole verse."""
    out = {}
    for v in ET.parse(get("VerseMap")).getroot().iter():
        if v.tag.endswith("verse"):
            (w, part), (k, _) = ref(v.get("wlc")), ref(v.get("kjv"))
            out.setdefault(w, {})[part] = k
    return out


def word(w):
    """<w lemma="c/d/776" morph="HC/Td/Ncbsa">וְ/הָ/אָרֶץ</w> -> {text: וְהָאָרֶץ, nums: [H776], …}."""
    lemma, morph = w.get("lemma") or "", w.get("morph") or ""
    nums = [f"H{m.group(1)}" for part in lemma.split("/") if (m := re.match(r"(\d+)", part.strip()))]
    return {"text": (w.text or "").replace("/", ""), "nums": nums, "grammar": grammar(morph), "english": english(lemma, morph)}


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;")


def render(w):
    nums = "".join(f"<num>{n}</num>" for n in w["nums"])
    return f"<div><grk>{w['text']}</grk>{nums}<tvm>{esc(w['grammar'])}</tvm><gra>{esc(w['english']) or '—'}</gra></div>"


def verse(v):
    """The verse's words, as its two halves: up to the word with the atnach (U+0591), the verse's
    main pause, and the rest ([] if it has none)."""
    out = []
    for el in v:
        tag = el.tag.replace(NS, "")
        if tag == "w" and el.get("type") != "x-ketiv":
            out.append(word(el))
        elif tag == "note" and el.get("type") == "variant":
            out += [word(w) for w in el.iter(f"{NS}w")]
        elif tag == "seg" and el.get("type") in SEGS and out:
            out[-1]["text"] += el.text or ""  # a maqaf, sof pasuq or paseq stays with the word before it
    cut = next((i + 1 for i, x in enumerate(out) if "\u0591" in x["text"]), len(out))
    return "".join(map(render, out[:cut])), "".join(map(render, out[cut:]))


def main():
    LIBRARY.mkdir(parents=True, exist_ok=True)
    GLOSS.update(glosses())
    moves = verse_map()
    verses = {}
    for n, b in enumerate(BOOKS, 1):
        root = ET.parse(get(b)).getroot()
        for v in root.iter(f"{NS}verse"):
            k, _ = ref(v.get("osisID"))
            m = moves.get(k, {})
            first, second = verse(v)
            # A verse the KJV divides differently is split at its main pause; a half the map doesn't
            # move keeps the verse's number.
            parts = [(m.get("a", k), first), (m.get("b", k), second)] if "a" in m or "b" in m else [(m.get(None, k), first + second)]
            for key, text in parts:
                if text:
                    verses[key] = f"{verses[key]}{text}" if key in verses else text
        print(f"  {b}", end="", flush=True)
    print()
    rows = [(b, c, v, f"<heb>{t}</heb>") for (b, c, v), t in sorted(verses.items())]
    info = ("<p>The Westminster Leningrad Codex, the Hebrew text of the Leningrad Codex (1008) as in BHS, word by word: each "
            "word with its English, Strong's number and grammar. Text, Strong's numbers and grammar from the Open Scriptures "
            "Hebrew Bible (morphhb), CC BY 4.0, https://github.com/openscriptures/morphhb; English from STEPBible's TBESH "
            "(Tyndale House), CC BY 4.0, https://github.com/STEPBible/STEPBible-Data. The English is the dictionary sense, "
            "not a translation in context. Verses are numbered as in the KJV (psalm titles are part of verse 1); "
            "where the margin corrects the text (ketiv/qere), the reading is given. Built by Two-edged Sword's tools/wlc.</p>")
    p = LIBRARY / "wlc+.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,1,0,0,1,1)", ("Westminster Leningrad Codex w/ Strong's", "WLC+", info))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(rows)} verses")


if __name__ == "__main__":
    main()
