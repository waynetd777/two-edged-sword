# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds clementine+.bbli ("Latin Vulgate (Clementine) w/ glosses", Vulg-C+) from clementine.bbli:
each word with its English meaning, Strong's number, dictionary form and grammar, as the Greek
interlinears are.

    python3 tools/latin/clementine.py

Reads the bundled clementine.bbli (tools/vulgate builds it) and writes clementine+.bbli to the
library, or into `into` (tools/core builds it into the app). It runs inside modules.shipping(), so it
reads only the built-in modules: clementine.bbli, and WLC+, Byz+ and LXX+ for the Strong's numbers.

- The dictionary form and grammar: Stanza (Stanford NLP, Apache 2.0) with its Latin model trained on
  the PROIEL treebank (CC BY-NC-SA), read a verse at a time, as tools/latin/build.py tags Latin+.
  Because of that model the module is shared under CC BY-NC-SA 4.0, for non-commercial use only,
  unlike the rest of the app: whoever sells the app must leave it out.
- The English: the first sense in William Whitaker's WORDS, with build.py's table of the Bible's senses.
- Strong's numbers: borrowed from WLC+, Byz+ and LXX+ by aligning the verses word by word, lemma by
  Strong's number (tools/latin/strongs.py).

Needs Stanza 1.14.0 (pip install stanza==1.14.0, which brings PyTorch; about 800 MB) in the Python
that runs it; run on its own, it makes a virtual environment with it in ~/Library/Caches/Two-edged
Sword/latin/venv (as build.py does). Stanza's Latin PROIEL model (about 200 MB) is downloaded once
into ~/Library/Caches/Two-edged Sword/latin/stanza, Whitaker's dictionary beside it.
"""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import modules  # noqa: E402
from modules import fetch, module  # noqa: E402
from latin import build as plus, strongs  # noqa: E402

TITLE, ABBREV = "Latin Vulgate (Clementine) w/ glosses", "Vulg-C+"
STANZA = plus.STANZA
DICTLINE_SHA = "8f6c0fc84d12859abc863eac84ddd49b7e039503855ca34c1d44a6e78abf7569"

ABOUT = ("<p>This edition shows each word of the Clementine Vulgate with its English meaning, Strong's number, dictionary form "
         "and grammar. They are the work of a program, so some words will be wrong. Built by Two-edged Sword's tools/latin.</p>"
         "<p><b>Licence: non-commercial use only.</b> Each word's dictionary form and grammar come from a Stanza model trained "
         "on the PROIEL treebank, which is licensed CC BY-NC-SA, so this module is shared under the Creative Commons "
         "Attribution-NonCommercial-ShareAlike 4.0 licence, unlike the rest of Two-edged Sword (GPL). Anyone who sells or "
         "otherwise distributes the app commercially must remove this module.</p><ul>"
         "<li>The text: the Clementine Vulgate Project's (public domain).</li>"
         "<li>The dictionary forms and grammar: Stanza, Stanford NLP's tagger (Apache 2.0), with its Latin model trained on "
         "the PROIEL treebank (Dag Haug and others, University of Oslo; CC BY-NC-SA), which reads each word in its sentence.</li>"
         "<li>The English: the first sense in William Whitaker's WORDS dictionary (\"freely available to anyone who wishes to "
         "use them, for whatever purpose\"), with a short table of the Bible's senses.</li>"
         "<li>The Strong's numbers: borrowed by lining each verse up word by word with the Hebrew of WLC+ (the Open Scriptures "
         "Hebrew Bible, CC BY 4.0, with STEPBible's data, Tyndale House, CC BY 4.0) for the Old Testament; the Greek of Byz+ "
         "(the Robinson–Pierpont Byzantine text, public domain, numbered after STEPBible's TAGNT, CC BY 4.0) for the New; and "
         "for the deuterocanon and the Greek parts of Esther and Daniel the Greek of LXX+ (Brenton's Septuagint, public "
         "domain, its words' lemmas from GLAUx, CC BY-SA 4.0, their Strong's numbers from STEPBible's TBESG and TAGNT, CC BY "
         "4.0). A word with no clear counterpart in them has none.</li></ul>")

PARTS = ("Old Testament", "New Testament", "deuterocanon")


def part_of(b, c, v):
    return "New Testament" if 40 <= b <= 66 else "deuterocanon" if b >= 67 or strongs.greek_part(b, c, v) else "Old Testament"


def main(into=None):
    """Writes clementine+.bbli to the app's modules folder, or to `into`."""
    try:
        import stanza
    except ImportError:
        sys.exit(f"clementine+.bbli needs Stanza: pip install stanza=={STANZA} (it brings PyTorch, about 800 MB), "
                 "or run python3 tools/latin/clementine.py, which makes a virtual environment with it")
    if stanza.__version__ != STANZA:
        print(f"  note: Stanza {stanza.__version__}, not {STANZA}; its Latin model may tag some words otherwise")
    with modules.shipping():
        build(into)


def build(into):
    rows, info = plus.read("clementine")
    if rows is None:
        sys.exit(f"no {modules.find('clementine.bbli')}; tools/vulgate/build.py makes it")
    fetch(plus.DICTLINE, plus.CACHE / "DICTLINE.GEN", sha256=DICTLINE_SHA)
    nlp, dic = plus.pipeline(), plus.whitaker()
    verses, tagged = plus.tag(rows, nlp)

    nums = plus.numbers(rows, tagged)
    refs = [(b, c, v) for b, c, v, _ in rows]

    stats = {p: Counter() for p in PARTS}
    for (vi, pi), t in tagged.items():
        st = stats[part_of(*refs[vi])]
        st["words"] += 1
        st["strongs"] += (vi, pi) in nums
    for p, st in stats.items():
        if st["words"]:
            print(f"  {p}: {st['words']} words, {st['strongs'] / st['words']:.1%} with a Strong's number")

    out = plus.render(rows, verses, tagged, dic, nums)
    ot, nt, apoc = (any(lo <= r[0] <= hi for r in rows) for lo, hi in ((1, 39), (40, 66), (67, 99)))
    with module("clementine+.bbli", TITLE, ABBREV, info + ABOUT, ot=ot, nt=nt, apocrypha=apoc, strongs=True, into=into) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    print(f"clementine+.bbli: {len(out)} verses")


if __name__ == "__main__":
    plus.venv()
    main()
