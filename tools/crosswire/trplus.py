# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds tr1550+.bbli ("Greek NT: Textus Receptus (Stephanus 1550) w/ glosses"): Stephanus' 1550
Greek New Testament word by word, each word with English under it, its Strong's number and its
grammar. For the modules folder only, as tr1550.bbli (CrossWire's TR is CC BY-NC-SA).

    python3 tools/crosswire/trplus.py

Sources:
  The words, their Strong's numbers and grammar: CrossWire's TR module (tools/crosswire), which
    tags every word of Stephanus' 1550 and Scrivener's 1894 with a number and Robinson's code; the
    1550's readings are kept where they differ, as in tr1550.bbli. The codes are spelled out as
    the other interlinears spell them (stepbible.robinson).
  Accents and punctuation: the TR module's Greek has neither, so each verse's words are lined up
    with STEPBible's TAGNT (Tyndale House, CC BY 4.0; tools/stepbible.py), first Scrivener's TR's
    words, then the Byzantine text's, then any edition's, and a word whose letters are the same
    (or differ by a movable ν) is shown as TAGNT prints it. A word no edition has in the verse
    takes the accents the same letters have most often anywhere in TAGNT (ειπον: εἶπον), without
    their punctuation; one TAGNT never spells so stays unaccented.
  English: STEPBible's TBESG, glossed as tools/beza/plus.py glosses Beza's words.

The markup is INT+'s: each word a <div><grk>word</grk><num>G…</num><tvm>grammar</tvm><gra>gloss</gra></div>.
"""
import html, re, sys, unicodedata
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import crosswire.build as cw  # noqa: E402
from beza.plus import gloss_for, glosses  # noqa: E402
from modules import greek_key, module  # noqa: E402
from stepbible import has, robinson, tagnt  # noqa: E402

# The TR's spellings that no edition in TAGNT has (it spells David Δαυίδ, Moses Μωϋσῆς), accented as Stephanus prints them.
SPELT = {"δαβιδ": "Δαβίδ", "μωσης": "Μωσῆς", "μωσεως": "Μωσέως", "μωση": "Μωσῇ", "μωσην": "Μωσῆν", "τεσσαρακοντα": "τεσσαράκοντα"}

W = re.compile(r'<w\b([^>]*)>(.*?)</w>', re.S)


def letters(w):
    """A word's Greek letters, lower case, without accents or breathings (ς as σ)."""
    t = unicodedata.normalize("NFD", w.lower())
    return "".join(ch for ch in t if "α" <= ch <= "ω" or ch == "ς").replace("ς", "σ")


def tr1550():
    """{(book, chapter, verse): [(word, number, code)]} for the 1550's words, books numbered 40–66."""
    _, books, _ = cw.read("TR")
    keep = cw.MODULES["TR"]["variant"]
    out = {}
    for b, rows in books.items():
        n = cw.OSIS.index(b) + 1
        for ch, v, t in rows:
            t = cw.variant(t, keep)
            ws = []
            for attrs, word in W.findall(t):
                if not word.strip():  # a second parsing of the word before (Matt 4:15 γη, N-NSF and N-VSF)
                    continue
                num = re.search(r'strong:(G\d+)', attrs)
                code = re.search(r'robinson:([^"\s]+)', attrs)
                ws.append((word.strip(), num and f"G{int(num[1][1:])}", code[1] if code else ""))
            if ws:
                out[(n, ch, v)] = ws
    return out


def accent(word, printed):
    """TAGNT's printed form for the 1550's unaccented word, where their letters agree but for a movable ν; else None.
    TAGNT's paragraph mark (¶) is left out."""
    printed = printed.replace("¶", "")
    a, p = letters(word), letters(printed)
    if a == p:
        return printed
    m = re.match(r"(.*?)([^\w]*)$", printed)
    if a == p + "ν":
        return m[1] + "ν" + m[2]
    if p == a + "ν" and m[1].endswith("ν"):
        return m[1][:-1] + m[2]
    return None


def main():
    words, nt, G = tr1550(), tagnt(), glosses()
    forms = {}
    for tag in nt.values():
        for w in tag:
            f = re.sub(r"[^\w᾽’]+$", "", w.greek)
            if letters(f):
                forms.setdefault(letters(f), Counter())[f[:1].lower() + f[1:]] += 1
    common = {k: c.most_common(1)[0][0] for k, c in forms.items()}
    out, stats = [], {"words": 0, "accented": 0, "glossed": 0}
    for (b, c, v), ws in sorted(words.items()):
        keys = [greek_key(w) for w, _, _ in ws]
        shown = [None] * len(ws)
        tag = nt.get((b, c, v), [])
        for ed in ("TR", "Byz", None):
            cand = [w.greek for w in tag if greek_key(w.greek) and (ed is None or has(w, ed))]
            todo = [i for i in range(len(ws)) if shown[i] is None]
            ck = [greek_key(x) for x in cand]
            for m in SequenceMatcher(None, [keys[i] for i in todo], ck, autojunk=False).get_matching_blocks():
                for k in range(m.size):
                    shown[todo[m.a + k]] = accent(ws[todo[m.a + k]][0], cand[m.b + k])
        for i, (w, _, _) in enumerate(ws):
            if shown[i] is None and letters(w) in common:
                shown[i] = common[letters(w)]
            elif shown[i] is None and letters(w) in SPELT:
                shown[i] = SPELT[letters(w)]
            if shown[i] is None and ws[i][2] == "N-PRI":  # a name, capitalised as TAGNT's are
                shown[i] = w[:1].upper() + w[1:]
        s = []
        for i, (w, num, code) in enumerate(ws):
            g = gloss_for(num, code, G)
            word = shown[i] or w
            if g and i > 0 and word[:1].isupper() and g[:1].islower():
                g = g[:1].upper() + g[1:]
            elif g and word[:1].islower() and g[:1].isupper() and g != "God" and "PRI" not in code:
                g = g[:1].lower() + g[1:]
            stats["words"] += 1
            stats["accented"] += any(unicodedata.combining(x) for x in unicodedata.normalize("NFD", word))
            stats["glossed"] += bool(g)
            s.append(f"<div><grk>{html.escape(word)}</grk>" + (f"<num>{num}</num>" if num else "")
                     + f"<tvm>{html.escape(robinson(code))}</tvm><gra>{html.escape(g) or '—'}</gra></div>")
        out.append((b, c, v, "".join(s)))
    w = stats["words"]
    print(f"{len(out)} verses, {w} words: accented {stats['accented'] / w:.1%}, glossed {stats['glossed'] / w:.1%}")

    info = ("<p>Robert Estienne's (Stephanus') Greek New Testament of 1550 word by word: each word with its Strong's number and "
            "grammar (Robinson's codes) from CrossWire's TR module (Maurice Robinson's electronic edition, CC BY-NC-SA 4.0), "
            "accented and punctuated as STEPBible's TAGNT prints the same words (Tyndale House, CC BY 4.0), with the English "
            "of STEPBible's TBESG (Tyndale House, CC BY 4.0, https://github.com/STEPBible/STEPBible-Data). The English is the "
            "dictionary sense, not a translation of the verse. Where Scrivener's 1894 text differs, this has the 1550's reading. "
            "Built by Two-edged Sword's tools/crosswire/trplus.py.</p>")
    with module("tr1550+.bbli", "Greek NT: Textus Receptus (Stephanus 1550) w/ glosses", "TR1550+", info, ot=False, strongs=True) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    print(f"tr1550+.bbli: {len(out)} verses")


if __name__ == "__main__":
    main()
