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
STEPBible asks that the data itself is passed on only from their repository: build from it, don't
redistribute the downloaded files. Downloads are cached in ~/Library/Caches/Two-edged Sword/stepbible.
"""
import re, urllib.parse, urllib.request
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

CACHE = Path.home() / "Library/Caches/Two-edged Sword/stepbible"
BASE = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/"
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
    p = CACHE / file
    if not p.exists() or not p.stat().st_size:
        p.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {file}")
        with urllib.request.urlopen(BASE + urllib.parse.quote(file), timeout=300) as r:
            p.write_bytes(r.read())
    return p.read_text(encoding="utf-8-sig")


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
