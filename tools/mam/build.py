# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds mam.bbli ("Miqra according to the Masorah (Aleppo Codex)"): the Hebrew Old Testament as Seth (Avi)
Kadish edited it at Hebrew Wikisource, following the Aleppo Codex (about 930), older than the Leningrad
Codex the WLC follows, and, where Aleppo's leaves are lost (most of the Torah and some of the Writings),
the manuscripts closest to it. With the WLC (Leningrad) and Ginsburg (Ben Chayyim), it is the third of the
main forms of the Masoretic text.

    python3 tools/mam/build.py

Writes to the app's modules folder, where the app finds it after Library → Rescan; tools/core builds it
into the app (src-tauri/modules).

Source: MAM-simple, Ben Denckla's JSON of it (github.com/bdenckla/MAM-basics, at a fixed commit), CC BY-SA 4.0,
which asks that it be credited to Hebrew Wikisource with a link to the edition's page (INFO does). Its
json-vtrad-bhs files are in the BHS's numbering, the WLC's, for the six books where that differs from MAM's
own (json-vtrad-mam, for the rest). So each verse is moved to the KJV's numbering with the same map as WLC+
(morphhb's VerseMap.xml, through tools/wlc): a psalm's title joins verse 1, and a verse the KJV divides is
split at its main pause (the atnach), as for Ginsburg. Joshua 21:36-37, which the WLC has without vowels or
accents, are not in MAM (the Aleppo Codex's tradition hasn't them) and are left out.

The text is MAM's with vowels and accents, as running text, as the WLC's (tools/wlc's plain) is. Each element is
read by its type (text() stops on one it doesn't know), as MAM-simple's consumer notice asks:
  - where the margin corrects the written text (kq), the reading (qere) is given, as in WLC+ and Ginsburg;
    a word written and not read is left out, one read and not written put in;
  - the Ten Commandments' two sets of accents (cant-all-three) are given together (cant-combined), as the WLC has them;
  - a reading of other manuscripts (scrdfftar) gives the edition's text, not the note; the repeated
    last verse some books end with (good-ending) is left out;
  - large, small and hung letters are plain letters; the paseq and legarmeh are ׀ between words, the
    inverted nun ׆, a gray maqaf a maqaf; the paragraph marks (pe, samekh) and the song layout's spaces
    are spaces.
The marks are left in MAM's order (it isn't Unicode's normal order).
"""
import json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import wlc.build as wlc  # noqa: E402  (the WLC -> KJV verse map)
from modules import CACHES, LIBRARY, fetch, module  # noqa: E402
from ginsburg.build import halves  # noqa: E402
CACHE = CACHES / "mam"
SRC = "https://raw.githubusercontent.com/bdenckla/MAM-basics/926a6e785be4236673ac4a5c8c34afe63ed417f4/MAM-simple/{}/{}.json"
# The 24 books' files, and the six MAM-simple has in the BHS's numbering (the rest are the same in both).
GROUPS = ["Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "1Sam-2Sam", "1Kgs-2Kgs", "Isa", "Jer", "Ezek", "Hos-Mal",
          "Ps", "Prov", "Job", "Song", "Ruth", "Lam", "Eccl", "Esth", "Dan", "Ezra-Neh", "1Chr-2Chr"]
BHS = {"1Sam-2Sam", "Deut", "Exod", "Jer", "Josh", "Num"}
LINK = "https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#beginning"
PASEQ = " ׀ "


def group(name):
    folder = "json-vtrad-bhs" if name in BHS else "json-vtrad-mam"
    d = json.loads(fetch(SRC.format(folder, name), CACHE / folder / f"{name}.json").read_text(encoding="utf-8"))
    if "vtbhs" not in d["versification-tradition"].split(","):
        sys.exit(f"mam: {folder}/{name}.json isn't in the BHS's numbering ({d['versification-tradition']})")
    return d["contents"]


def kids(n):
    return "".join(text(c) for c in n.get("contents", []))


def text(n):
    """An element of a verse as running text."""
    t = n["type"]
    if t in ("text", "kq-trivial", "kq-q-velo-k", "silluq-before-meteg", "letter-large", "letter-small", "letter-hung", "cant-combined"):
        return n["text"] if "text" in n else kids(n)
    if t in ("slh-word", "kq-q", "sdt-target"):
        return n["text"] if "text" in n else kids(n)
    if t == "kq":
        return next(text(c) for c in n["contents"] if c["type"] == "kq-q")
    if t == "cant-all-three":
        return next(text(c) for c in n["contents"] if c["type"] == "cant-combined")
    if t == "scrdfftar":
        return next(text(c) for c in n["contents"] if c["type"] == "sdt-target")
    if t in ("kq-k-velo-q", "kq-k-velo-q-maq", "good-ending"):
        return ""
    if t in ("lp-legarmeih", "lp-paseq"):
        return PASEQ
    if t == "implicit-maqaf":
        return "־"
    if t == "spi-invnun":
        return " ׆ "
    if t in ("spi-pe2", "spi-pe3", "spi-samekh2", "spi-samekh3", "shirah-space"):
        return " "
    sys.exit(f"mam: an element of a type not known: {t}")


def verse(v):
    t = v["text"] if "text" in v else kids(v)
    return re.sub(r"\s+", " ", t).strip()


def read():
    """{(book, chapter, verse): text} in the WLC's numbering."""
    out = {}
    for name in GROUPS:
        for b in group(name):
            if b["type"] != "book39":
                continue  # a paragraph mark between books
            n = wlc.BOOKS.index(b["osisID"]) + 1
            for c in b["contents"]:
                if c["type"] != "chapter":
                    continue  # a paragraph mark between chapters
                for v in c["contents"]:
                    if v["type"] != "verse" or v.get("contents-corresponds-to") == "no verse in MAM":
                        continue  # Joshua 21:36-37, which the Aleppo Codex's tradition hasn't ("—")
                    if t := verse(v):
                        _, ch, vv = v["osisID"].split(".")
                        out[(n, int(ch), int(vv))] = t
    return out


INFO = ("<p>Miqra according to the Masorah (MAM): the Hebrew Old Testament as Seth (Avi) Kadish edited it at Hebrew "
        "Wikisource, following the Aleppo Codex (about 930) and, where its leaves are lost, the manuscripts closest to it. "
        f'From <a href="{LINK}">Hebrew Wikisource</a>, through Ben Denckla\'s MAM-simple (github.com/bdenckla/MAM-basics), '
        "under the Creative Commons Attribution-ShareAlike 4.0 licence (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/. "
        "With vowels and accents; verses are numbered as in the KJV (psalm titles are part of verse 1); where the margin "
        "corrects the text (ketiv/qere), the reading is given. Joshua 21:36–37 are not in this tradition. Built by Two-edged Sword's tools/mam.</p>")


def main(into=None):
    """Writes mam.bbli to the app's modules folder, or to `into`."""
    LIBRARY.mkdir(parents=True, exist_ok=True)
    moves = wlc.verse_map()
    verses = {}
    for k, t in sorted(read().items()):
        m = moves.get(k, {})
        first, second = halves(t)
        parts = [(m.get("a", k), first), (m.get("b", k), second)] if "a" in m or "b" in m else [(m.get(None, k), t)]
        for key, part in parts:
            if part:
                verses[key] = f"{verses[key]} {part}" if key in verses else part
    rows = [(b, c, v, f"<heb>{wlc.esc(t)}</heb>") for (b, c, v), t in sorted(verses.items())]
    with module("mam.bbli", "Miqra according to the Masorah (Aleppo Codex)", "MAM", INFO, nt=False, rtl=True, into=into) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    print(f"mam.bbli: {len(rows)} verses")


if __name__ == "__main__":
    main()
