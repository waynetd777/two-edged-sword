# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds beza1598+.bbli ("Greek NT: Beza (1598) w/ glosses"): Beza's 1598 Greek New Testament word
by word, each word with English under it, its Strong's number and its grammar.

    python3 tools/beza/plus.py

Reads beza1598.bbli (tools/beza/build.py makes it) and writes beza1598+.bbli beside it; the app
finds it after Library → Rescan.

Sources:
  Strong's numbers and grammar (Robinson's codes, spelled out: V-AAI-3S "verb · aorist active
    indicative · 3rd sing."): STEPBible's TAGNT (Translators Amalgamated Greek NT, Tyndale House,
    CC BY 4.0; tools/stepbible.py), every word of the major editions with its number, code and
    editions. Scrivener's 1894 TR follows Beza but for some 190 places, so each verse's words are
    lined up first with the TR's words, then with the Byzantine text's, then with any edition's,
    accents, case and movable ν ignored; a word misspelt in the transcription takes the number of
    the word in its place when it is like it; and a word none of them has in that verse (a reading
    of Beza's alone) takes the number and code the same form has most often elsewhere in TAGNT.
  English: STEPBible's TBESG (Translators Brief lexicon of Extended Strongs for Greek, Tyndale
    House, CC BY 4.0, https://github.com/STEPBible/STEPBible-Data), the short gloss for each
    Strong's number, as WLC+ has TBESH's. It is the dictionary sense: where TBESG gives choices
    ("the/this/who", "in/on/among") the first is taken, but αὐτός is given as he, his, him, her,
    their… by its case, gender and number, and a plural noun's gloss is made plural where English
    does that simply.

The Greek shown is Beza's, accented, with its punctuation. The markup is INT+'s (see tokenize in
src/esword.tsx): each word a <div><grk>word</grk><num>G…</num><tvm>grammar</tvm><gra>gloss</gra></div>.

Downloads are cached in ~/Library/Caches/Two-edged Sword/beza.
"""
import html, os, re, sqlite3, sys, unicodedata, urllib.parse, urllib.request
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import LIBRARY, find  # noqa: E402
from stepbible import has, tagnt  # noqa: E402
CACHE = HOME / "Library/Caches/Two-edged Sword/beza"
TBESG = ("https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
         + urllib.parse.quote("TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt"))
BOOKS = ["Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
         "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
         "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"]


def key(w):
    """A word for comparing editions: Greek letters only, no accents, no case, σ for ς, and no
    movable ν (Beza's ἐγέννησε is TR+'s εγεννησεν)."""
    t = unicodedata.normalize("NFD", w.lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).replace("ς", "σ")
    return re.sub(r"(ε|ι)ν$", r"\1", "".join(re.findall(r"[α-ω]", t)))


def rows(name):
    db = sqlite3.connect(f"file:{find(name)}?mode=ro", uri=True)
    out = {(b, c, v): t or "" for b, c, v, t in db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Book BETWEEN 40 AND 66")}
    db.close()
    return out


# ---------- TAGNT: words with their numbers and codes ----------

def words(ws, edition=None):
    """[(key, number, code)] for TAGNT's words, or those of one edition."""
    return [(key(w.greek), w.num, w.code) for w in ws if key(w.greek) and (edition is None or has(w, edition))]


# ---------- English ----------

def get(url, file):
    p = CACHE / file
    if not p.exists() or not p.stat().st_size:
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as r:
            p.write_bytes(r.read())
    return p


def glosses():
    """{"G0025": "love", …}: TBESG's gloss for each Strong's number, from its first entry."""
    out = {}
    for line in get(TBESG, "TBESG.txt").read_text(encoding="utf-8-sig").split("\n"):
        f = line.split("\t")
        if len(f) > 6 and re.match(r"G\d{4}[a-zA-Z]?$", f[0]) and f[0] not in out:
            g = f[6].split(":")[0].strip()  # "lord: God" is the word lord in its sense God
            g = re.sub(r"\(-\w+\)", "", re.sub(r"^to\s+", "", g)).strip()  # "thus(-ly)"
            out[f[0]] = g
    return out


PLURAL = {"man": "men", "woman": "women", "child": "children", "foot": "feet", "tooth": "teeth", "mouse": "mice", "person": "people",
          "sheep": "sheep", "fish": "fish", "ox": "oxen", "brother": "brothers", "wife": "wives", "life": "lives", "knife": "knives",
          "leaf": "leaves", "loaf": "loaves", "thief": "thieves", "wolf": "wolves", "calf": "calves", "half": "halves"}


def plural(g):
    """A simple English plural of a one-word gloss; anything else as it is."""
    if not re.fullmatch(r"[a-z]+", g):
        return g
    if g in PLURAL:
        return PLURAL[g]
    if re.search(r"(s|x|z|ch|sh)$", g):
        return g + "es"
    if re.search(r"[^aeiou]y$", g):
        return g[:-1] + "ies"
    return g + "s"


# The personal pronouns of the 1st and 2nd person by case and number (P-1GP: "our").
PERSONAL = {"1NS": "I", "1GS": "my", "1DS": "to me", "1AS": "me", "1NP": "we", "1GP": "our", "1DP": "to us", "1AP": "us",
            "2NS": "you", "2GS": "your", "2DS": "to you", "2AS": "you", "2NP": "you", "2GP": "your", "2DP": "to you", "2AP": "you"}

# αὐτός by case, gender and number (P-GSM: "his").
AUTOS = {("N", "S", "M"): "he", ("N", "S", "F"): "she", ("N", "S", "N"): "it", ("G", "S", "M"): "his", ("G", "S", "F"): "her",
         ("G", "S", "N"): "its", ("D", "S", "M"): "to him", ("D", "S", "F"): "to her", ("D", "S", "N"): "to it", ("A", "S", "M"): "him",
         ("A", "S", "F"): "her", ("A", "S", "N"): "it"}
AUTOS_P = {"N": "they", "G": "their", "D": "to them", "A": "them"}


def gloss_for(num, code, G):
    if not num:
        return ""
    n = int(num[1:])
    k = f"G{n:04d}"
    g = G.get(k) or G.get(k + "a") or G.get(k + "G") or ""
    if not g:
        return ""
    if n == 846:  # αὐτός
        m = re.match(r"P-([NGDA])([SP])([MFN])", code)
        if m:
            return AUTOS_P[m.group(1)] if m.group(2) == "P" else AUTOS.get((m.group(1), m.group(2), m.group(3)), "he")
    if n == 3588:
        return "the"
    m = re.match(r"P-([12][NGDAV][SP])", code)
    if m and m.group(1)[1] != "V":
        return PERSONAL.get(m.group(1), g)
    g = g.split("/")[0].strip() if "/" in g and " " not in g.split("/")[0] else g
    if re.match(r"N-[NGDAV]P", code):
        g = plural(g)
    return g


# ---------- grammar ----------

POS = {"N": "noun", "A": "adjective", "T": "article", "V": "verb", "P": "personal pronoun", "R": "relative pronoun",
       "C": "reciprocal pronoun", "D": "demonstrative pronoun", "K": "correlative pronoun", "I": "interrogative pronoun",
       "X": "indefinite pronoun", "Q": "correlative or interrogative pronoun", "F": "reflexive pronoun", "S": "possessive pronoun",
       "ADV": "adverb", "CONJ": "conjunction", "COND": "conditional", "PRT": "particle", "PREP": "preposition", "INJ": "interjection",
       "ARAM": "Aramaic word", "HEB": "Hebrew word"}
CASE = {"N": "nom.", "G": "gen.", "D": "dat.", "A": "acc.", "V": "voc."}
NUMB = {"S": "sing.", "P": "plur."}
GEND = {"M": "masc.", "F": "fem.", "N": "neut."}
TENSE = {"P": "present", "I": "imperfect", "F": "future", "A": "aorist", "R": "perfect", "L": "pluperfect", "X": ""}
VOICE = {"A": "active", "M": "middle", "P": "passive", "E": "middle or passive", "D": "middle deponent", "O": "passive deponent",
         "N": "middle or passive deponent", "Q": "impersonal active", "X": ""}
MOOD = {"I": "indicative", "S": "subjunctive", "O": "optative", "M": "imperative", "N": "infinitive", "P": "participle", "R": "imperative participle"}
SUFFIX = {"C": "comparative", "S": "superlative", "N": "negative", "I": "interrogative", "K": "with crasis", "ATT": "Attic", "ABB": "abbreviated"}
PERSON = {"1": "1st", "2": "2nd", "3": "3rd"}


def cng(s):
    return " ".join(x for x in (CASE.get(s[:1]), NUMB.get(s[1:2]), GEND.get(s[2:3])) if x)


def grammar(code):
    """A Robinson code spelled out: V-2AAI-3S "verb · 2nd aorist active indicative · 3rd sing."."""
    if not code:
        return ""
    parts = code.split("-")
    head, rest = parts[0], parts[1:]
    out = [POS.get(head, head.lower())]
    suffix = []
    if head == "V" and rest:
        t = rest[0]
        second = t.startswith("2")
        t = t.lstrip("2")
        if len(t) >= 3:
            out.append(" ".join(x for x in (("2nd " if second else "") + TENSE.get(t[0], ""), VOICE.get(t[1], ""), MOOD.get(t[2], "")) if x.strip()))
        for r in rest[1:]:
            if re.fullmatch(r"[123][SP]", r):
                out.append(f"{PERSON[r[0]]} {NUMB[r[1]]}")
            elif re.fullmatch(r"[NGDAV][SP][MFN]", r):
                out.append(cng(r))
            elif r in SUFFIX:
                suffix.append(SUFFIX[r])
    elif head in ("N", "A", "T", "R", "C", "D", "K", "I", "X", "Q", "F", "S", "P") and rest:
        for r in rest:
            m = re.fullmatch(r"([123])?([NGDAV][SP][MFN]?)", r)
            if m:
                out.append(" ".join(x for x in ((PERSON[m.group(1)] + " person") if m.group(1) else "", cng(m.group(2))) if x))
            elif r == "PRI":
                out.append("proper name, indeclinable")
            elif r in ("NUI", "LI", "OI"):
                out.append("indeclinable")
            elif re.fullmatch(r"[123][SP][NGDAV][SP][MFN]", r):  # possessive: owner, then the word
                out.append(f"{PERSON[r[0]]} {NUMB[r[1]]} · {cng(r[2:])}")
            elif r in SUFFIX:
                suffix.append(SUFFIX[r])
    else:
        for r in rest:
            if r in SUFFIX:
                suffix.append(SUFFIX[r])
    if suffix:
        out[0] += " (" + ", ".join(suffix) + ")"
    return " · ".join(x for x in out if x)


# ---------- lining up ----------

def line_up(bk, cand, got):
    """Fills got[i] = (number, code) for Beza's words bk that cand's words match, in order."""
    todo = [i for i in range(len(bk)) if got[i] is None]
    if not todo or not cand:
        return
    ck = [c[0] for c in cand]
    sub = [bk[i] for i in todo]
    for m in SequenceMatcher(None, sub, ck, autojunk=False).get_matching_blocks():
        for k in range(m.size):
            num, code = cand[m.b + k][1], cand[m.b + k][2]
            if num:
                got[todo[m.a + k]] = (num, code)


def main():
    if not find("beza1598.bbli").exists():
        sys.exit("no beza1598.bbli in the library; build it: python3 tools/beza/build.py")
    beza, nt = rows("beza1598.bbli"), tagnt()
    G = glosses()
    # Each form's commonest number and code anywhere, for a word no edition has in the verse.
    forms = {}
    for ws in nt.values():
        for w in words(ws):
            if w[1]:
                forms.setdefault(w[0], Counter())[(w[1], w[2])] += 1
    common = {k: c.most_common(1)[0][0] for k, c in forms.items()}

    out = []
    stats = {"words": 0, "verse": 0, "elsewhere": 0, "none": 0, "glossed": 0}
    by_book, worst = {}, []
    for (b, c, v), text in sorted(beza.items()):
        toks = re.findall(r"\S+", text)
        idx = [i for i, t in enumerate(toks) if key(t)]
        bk = [key(toks[i]) for i in idx]
        got = [None] * len(bk)
        ws = nt.get((b, c, v), [])
        scr, ste = words(ws, "TR"), words(ws, "Byz")
        line_up(bk, scr, got)
        line_up(bk, ste, got)
        line_up(bk, words(ws), got)
        # A word left over where the edition has one word left over too, in the same place (a typo
        # in the transcription: σονετέλεσεν for συνετέλεσεν): that word's number and code.
        for cand in (scr, ste):
            ck = [x[0] for x in cand]
            for op, i1, i2, j1, j2 in SequenceMatcher(None, bk, ck, autojunk=False).get_opcodes():
                if op == "replace" and i2 - i1 == j2 - j1:
                    for k in range(i2 - i1):
                        if got[i1 + k] is None and cand[j1 + k][1] and SequenceMatcher(None, bk[i1 + k], ck[j1 + k]).ratio() >= 0.6:
                            got[i1 + k] = (cand[j1 + k][1], cand[j1 + k][2])
        in_verse = sum(x is not None for x in got)
        for i, x in enumerate(got):
            if x is None and bk[i] in common:
                got[i] = common[bk[i]]
                stats["elsewhere"] += 1
        stats["words"] += len(bk)
        stats["verse"] += in_verse
        stats["none"] += sum(x is None for x in got)
        bb = by_book.setdefault(b, [0, 0])
        bb[0] += sum(x is not None for x in got)
        bb[1] += len(bk)
        if bk:
            worst.append((in_verse / len(bk), (b, c, v)))
        s, pos = [], {i: n for n, i in enumerate(idx)}
        for i, t in enumerate(toks):
            if i not in pos:
                s.append(html.escape(t))
                continue
            x = got[pos[i]]
            num, code = x if x else (None, "")
            g = gloss_for(num, code, G)
            # The English capitalised as the Greek is (Κυρίῳ: Lord; τρεῖς: three), but a verse's
            # first word, capitalised for being first, keeps the dictionary's case (names).
            word = re.sub(r"^[^\w]+", "", t)
            if g and pos[i] > 0 and word[:1].isupper() and g[:1].islower():
                g = g[:1].upper() + g[1:]
            elif g and word[:1].islower() and g[:1].isupper() and g != "God" and "PRI" not in code:
                g = g[:1].lower() + g[1:]
            stats["glossed"] += bool(g)
            s.append(f"<div><grk>{html.escape(t)}</grk>" + (f"<num>{num}</num>" if num else "")
                     + f"<tvm>{html.escape(grammar(code))}</tvm><gra>{html.escape(g) or '—'}</gra></div>")
        out.append((b, c, v, "".join(s)))

    w = stats["words"]
    print(f"{len(out)} verses, {w} words: numbered from the verse's own TAGNT words {stats['verse'] / w:.1%}, "
          f"from the same form elsewhere {stats['elsewhere'] / w:.1%}, none {stats['none'] / w:.2%}; glossed {stats['glossed'] / w:.1%}")
    print("  by book: " + ", ".join(f"{BOOKS[b - 40]} {n / max(t, 1):.1%}" for b, (n, t) in sorted(by_book.items())))
    worst.sort()
    print("  least matched in the verse: " + ", ".join(f"{BOOKS[b - 40]} {c}:{v} {s:.0%}" for s, (b, c, v) in worst[:10]))

    info = ("<p>Theodore Beza's Greek New Testament of 1598 word by word: each word with its Strong's number and grammar (Robinson's "
            "codes, from STEPBible's TAGNT, Tyndale House, CC BY 4.0, lining Beza's words up with Scrivener's TR, the Byzantine text and the other editions) and the English of "
            "STEPBible's TBESG (Tyndale House, CC BY 4.0, https://github.com/STEPBible/STEPBible-Data). The English is the "
            "dictionary sense, not a translation of the verse. The Greek is tools/beza's text of the textus-receptus.com "
            "transcription. Built by Two-edged Sword's tools/beza/plus.py.</p>")
    p = LIBRARY / "beza1598+.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,0,1,0,1,0)", ("Greek NT: Beza (1598) w/ glosses", "Beza 1598+", info))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(out)} verses")


if __name__ == "__main__":
    main()
