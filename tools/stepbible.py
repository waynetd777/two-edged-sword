# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""STEPBible's Translators Amalgamated Greek NT (TAGNT, Tyndale House, CC BY 4.0,
https://github.com/STEPBible/STEPBible-Data): every word of the major Greek editions (NA27/28, SBL,
Tyndale House, Tregelles, Westcott-Hort, the Textus Receptus as Scrivener 1894, Byzantine), each
with its Strong's number, Robinson-style grammar code and the editions that have it.

    from stepbible import tagnt, has
    words = tagnt()[(43, 3, 16)]            # [Word(greek="οὕτως", num="G3779", code="ADV", editions={...}), …]
    tr = [w for w in words if has(w, "TR")]  # the Textus Receptus's words

Verses are numbered as the KJV does (TAGNT's own numbering is the NRSV's, with the KJV's in [ ] where
it differs).
A word the editions write as one but tag as two (κἀγώ, "and I") takes its first number and code.
TAGNT gives every form of ἐγώ, σύ and εἰμί their headword's number (μου G3165, ἐστιν G1510), where
Strong's and the KJV's concordance number the forms (μου G3450, ἐστιν G2076): those take the form's
number, from TAGNT's Alt Strongs column.
lexicon("TBESG") and lexicon("TBESH") are STEPBible's brief Greek and Hebrew lexicons, as text.

STEPBible asks that the data itself is passed on only from their repository: build from it, don't
redistribute the downloaded files. The files are the repository's at a fixed commit. Downloads are
cached in ~/Library/Caches/Two-edged Sword/stepbible.
"""
import re, urllib.parse
from dataclasses import dataclass
from functools import lru_cache

from modules import CACHES, fetch as fetch_to

CACHE = CACHES / "stepbible"
REPO = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/aca7d691414e00b0d669157d98bfd68195e64e1e/"
BASE = REPO + "Translators%20Amalgamated%20OT%2BNT/"
LEXICONS = {"TBESG": "Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt",
            "TBESH": "Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt"}
FILES = ["TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt",
         "TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"]
BOOKS = ["Mat", "Mrk", "Luk", "Jhn", "Act", "Rom", "1Co", "2Co", "Gal", "Eph", "Php", "Col", "1Th", "2Th", "1Ti", "2Ti",
         "Tit", "Phm", "Heb", "Jas", "1Pe", "2Pe", "1Jn", "2Jn", "3Jn", "Jud", "Rev"]
# "Jhn.3.16#01=NKO"; where the KJV numbers the verse otherwise, its number follows in [ ]
# ("Php.1.16[1.17]#01"); ( ) and { } give other editions' numbers.
# ἐγώ, με, σύ, εἰμί: the headwords whose forms Strong numbers separately.
BY_FORM = {"G1473", "G3165", "G4771", "G1510"}
LINE = re.compile(r"^([0-9A-Za-z]{3})\.(\d+)\.(\d+)((?:[\[({][\d.]+[\])}])*)#\d+=")


@dataclass(frozen=True)
class Word:
    greek: str       # as printed, with its punctuation: "κόσμον,"
    num: str | None  # "G2889"
    code: str        # "N-ASM"
    editions: frozenset


def has(w: Word, edition: str) -> bool:
    """Whether an edition ("TR", "Byz", "NA28", …) has the word; TR1, TR2… (word-order variants) count as TR."""
    return any(e == edition or (e.startswith(edition) and e[len(edition):].isdigit()) for e in w.editions)


def fetch(file):
    return fetch_to(BASE + urllib.parse.quote(file), CACHE / file, log=True, timeout=300).read_text(encoding="utf-8-sig")


@lru_cache(maxsize=2)
def lexicon(name) -> str:
    """STEPBible's TBESG or TBESH, as text."""
    return fetch_to(REPO + urllib.parse.quote(LEXICONS[name]), CACHE / f"{name}.txt", log=True, timeout=300).read_text(encoding="utf-8-sig")


@lru_cache(maxsize=1)
def tagnt() -> dict:
    """{(book, chapter, verse): [Word]}, books numbered 40–66, the words in the order printed."""
    out = {}
    for f in FILES:
        for line in fetch(f).split("\n"):
            m = LINE.match(line)
            if not m or m[1] not in BOOKS:
                continue
            col = line.split("\t")
            greek = re.sub(r"\s*\([^)]*\)\s*$", "", col[1]).strip()  # "κόσμον, (kosmon)"
            first = col[3].split("+")[0].strip()                     # "G1473=P-1NS + G2532=CONJ"
            num, _, code = first.partition("=")
            n = re.match(r"G0*(\d+)", num)
            eds = frozenset(e.strip() for e in col[5].split("+") if e.strip()) if len(col) > 5 else frozenset()
            kjv = re.search(r"\[(\d+)\.(\d+)\]", m[4])
            c, v = (int(kjv[1]), int(kjv[2])) if kjv else (int(m[2]), int(m[3]))
            key = (40 + BOOKS.index(m[1]), c, v)
            number = f"G{n[1]}" if n else None
            alt = re.findall(r"G0*(\d+)", col[12]) if len(col) > 12 else []
            if number in BY_FORM and alt:
                number = f"G{alt[-1]}"
            out.setdefault(key, []).append(Word(greek, number, code.strip(), eds))
    return out


# ---------- Robinson's grammar codes ----------

POS = {"N": "noun", "V": "verb", "A": "adjective", "T": "article", "P": "pronoun", "R": "relative pronoun", "C": "reciprocal pronoun",
       "D": "demonstrative pronoun", "K": "correlative pronoun", "I": "interrogative pronoun", "X": "indefinite pronoun",
       "Q": "correlative pronoun", "F": "reflexive pronoun", "S": "possessive pronoun", "RI": "relative pronoun", "M": "numeral"}
WORDS = {"PREP": "preposition", "CONJ": "conjunction", "ADV": "adverb", "PRT": "particle", "INJ": "interjection", "COND": "conjunction",
         "HEB": "Hebrew word", "ARAM": "Aramaic word", "PRT-N": "particle · negative", "CONJ-N": "conjunction · negative",
         "ADV-N": "adverb · negative", "ADV-I": "adverb · interrogative", "ADV-C": "adverb · comparative", "ADV-S": "adverb · superlative",
         "ADV-K": "adverb · correlative", "PRT-I": "particle · interrogative", "COND-K": "conjunction · correlative"}
CASE = {"N": "nom.", "G": "gen.", "D": "dat.", "A": "acc.", "V": "voc."}
NUMBER = {"S": "sing.", "P": "plur."}
GENDER = {"M": "masc.", "F": "fem.", "N": "neut."}
TENSE = {"P": "present", "I": "imperfect", "F": "future", "A": "aorist", "R": "perfect", "L": "pluperfect", "X": ""}
VOICE = {"A": "active", "M": "middle", "P": "passive", "E": "middle or passive", "D": "middle", "O": "passive", "N": "middle or passive",
         "Q": "active", "X": ""}
MOOD = {"I": "indicative", "S": "subjunctive", "O": "optative", "M": "imperative", "N": "infinitive", "P": "participle", "R": "imperative"}
# What a code's last part adds: "A-NSM-C", "ADV-ATT".
SUFFIX = {"C": "comparative", "S": "superlative", "N": "negative", "I": "interrogative", "K": "with crasis", "ATT": "Attic", "ABB": "abbreviated"}


def cng(s):
    """"NSM" -> "nom. masc. sing."; a person first for pronouns ("1GS" -> "1 gen. sing.")."""
    person = ""
    if s[:1] in "123":
        person, s = s[0], s[1:]
    parts = [CASE.get(s[:1], ""), GENDER.get(s[2:3], ""), NUMBER.get(s[1:2], "")]
    return " ".join(x for x in [person] + parts if x)


def robinson(code, unknown=None):
    """A Robinson code as words, in the order the other interlinears give them: "V-AAI-3S" -> "verb ·
    aorist active indicative · 3 sing.", "N-NSM" -> "noun · nom. masc. sing.". A code it can't
    read is given as it is, and counted in `unknown` (a Counter) if there is one."""
    if not code:
        return ""
    c = re.sub(r"[\]\s]+", "-", code.strip()).strip("-")  # "V] PAPGP", "VF FAI3P"
    c = re.sub(r"^(VF?-[A-Z2]{3})(\d[SP])$", r"\1-\2", c)  # "V-FAI3P"
    c = re.sub(r"^(V-[A-Z2]{3})([NGDAV][SP][MFN])$", r"\1-\2", c)  # "V-PAPGP…"
    if c in WORDS:
        return WORDS[c]
    head, *rest = c.split("-")
    if head in WORDS and rest and all(r in SUFFIX for r in rest):
        return " · ".join([WORDS[head], *(SUFFIX[r] for r in rest)])
    if head == "N" and rest and rest[0] in ("PRI", "LI", "OI"):
        return {"PRI": "name", "LI": "letter", "OI": "noun"}[rest[0]]
    if head == "A" and rest and rest[0] == "NUI":
        return "numeral"
    if head in ("V", "VF"):
        if not rest:
            return "verb"
        tvm = rest[0]
        second = tvm.startswith("2")
        tvm = tvm.lstrip("2")
        t, v, m = (tvm + "   ")[:3]
        desc = " ".join(x for x in [("second " if second else "") + TENSE.get(t, ""), VOICE.get(v, ""), MOOD.get(m, "")] if x.strip())
        out = ["verb", desc]
        if len(rest) > 1:
            out.append(cng(rest[1]) if m == "P" else " ".join(x for x in [rest[1][:1] if rest[1][:1] in "123" else "", NUMBER.get(rest[1][-1:], "")] if x))
        out += [SUFFIX[r] for r in rest[2:] if r in SUFFIX]
        return " · ".join(x for x in out if x)
    if head in POS:
        out = [POS[head]]
        if rest:
            r = rest[0]
            if re.fullmatch(r"[123][SP][NGDAV][SP][MFN]", r):  # a possessive: its owner, then the word ("S-1SNSM")
                out += [f"{r[0]} {NUMBER[r[1]]}", cng(r[2:])]
            else:
                out.append(cng(r))
        out += [SUFFIX[r] for r in rest[1:] if r in SUFFIX]
        return " · ".join(x for x in out if x)
    if unknown is not None:
        unknown[c] += 1
    return c
