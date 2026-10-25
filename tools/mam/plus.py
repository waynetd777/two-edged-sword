# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds mam+.bbli ("Miqra according to the Masorah (Aleppo Codex) w/ glosses", MAM+): MAM's Hebrew word by
word, each word with its English, Strong's number and grammar.

    python3 tools/mam/plus.py

Reads mam.bbli (tools/mam/build.py) and wlc+.bbli (tools/wlc) from the library (tools/modules.py finds them)
and writes mam+.bbli beside them; the app finds it after Library → Rescan. tools/core builds it into the app
(src-tauri/modules) from the built-in mam.bbli and wlc+.bbli.

Sources and licences: the text is MAM's (Hebrew Wikisource, CC BY-SA 4.0, see build.py), so MAM+ is shared under
CC BY-SA 4.0 too. The English, Strong's numbers and grammar are WLC+'s: the Open Scriptures Hebrew Bible's lemmas
and morphology (morphhb, CC BY 4.0) and STEPBible's TBESH glosses (Tyndale House, CC BY 4.0).

Method: Ginsburg+'s (tools/ginsburg/plus.py's gloss): in each verse MAM's words are lined up with WLC+'s by their
consonants and take the matching word's Strong's number, grammar and English, keeping MAM's own spelling and
pointing. The Aleppo Codex and the Leningrad Codex differ in few words; a word with no counterpart stays as it is,
without English.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ginsburg.plus import gloss  # noqa: E402
from mam.build import LINK  # noqa: E402
from modules import module  # noqa: E402


def main(into=None):
    """Writes mam+.bbli to the app's modules folder, or to `into`."""
    out, share = gloss("mam.bbli")
    info = ("<p>Miqra according to the Masorah (MAM), the Hebrew Old Testament of the Aleppo Codex, word by word: each word "
            "with its English, Strong's number and grammar, taken from WLC+ by lining the two texts up by their consonants "
            "(the Open Scriptures Hebrew Bible's lemmas and morphology, CC BY 4.0; STEPBible's TBESH glosses, CC BY 4.0). "
            f"{share:.1%} of the words are glossed; a word where the Aleppo Codex's text differs from the Leningrad Codex's "
            f'is left without. Text from <a href="{LINK}">Hebrew Wikisource</a>, through Ben Denckla\'s MAM-simple '
            "(github.com/bdenckla/MAM-basics), under the Creative Commons Attribution-ShareAlike 4.0 licence (CC BY-SA 4.0), "
            "https://creativecommons.org/licenses/by-sa/4.0/, as this module is. Verses are numbered as in the KJV. "
            "Built by Two-edged Sword's tools/mam/plus.py.</p>")
    with module("mam+.bbli", "Miqra according to the Masorah (Aleppo Codex) w/ glosses", "MAM+", info, nt=False, strongs=True, rtl=True, into=into) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    print(f"mam+.bbli: {len(out)} verses")


if __name__ == "__main__":
    main()
