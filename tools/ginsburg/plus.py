# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds ginsburg+.bbli ("Hebrew Bible (Ginsburg 1894, Ben Chayyim) w/ glosses", Ginsburg+):
Ginsburg's Hebrew word by word, each word with its English, Strong's number and grammar.

    python3 tools/ginsburg/plus.py

Reads ginsburg.bbli (tools/ginsburg/build.py) and wlc+.bbli (tools/wlc) from the library (tools/modules.py finds them)
and writes ginsburg+.bbli beside them; the app finds it after Library → Rescan.

Sources and licences: the text is Ginsburg's 1894 Hebrew Bible (github.com/ahembd/Ginsburg_Hebrew_Bible,
Apache-2.0; a few gaps from its GPL-3.0 sister repo, see build.py). The English, Strong's numbers
and grammar are WLC+'s: the Open Scriptures Hebrew Bible's lemmas and morphology (morphhb, CC BY
4.0) and STEPBible's TBESH glosses (Tyndale House, CC BY 4.0).

Method: both modules are in the KJV's numbering, and Ginsburg follows Ben Chayyim's text, which
differs from the Leningrad Codex's in few words. So in each verse Ginsburg's words are lined up
with WLC+'s by their consonants (vowels, accents and maqaf ignored, final letters as the others),
and a word takes the matching WLC+ word's Strong's number, grammar and English, keeping Ginsburg's
own spelling and pointing. A word spelt a little differently (full or defective spelling, a ketiv
the WLC reads otherwise) is paired when its consonants are close enough and the words around it
match. A word with no counterpart stays as it is, without English.

The markup is INT+'s, as WLC+'s: <div><grk>word</grk><num>H…</num><tvm>grammar</tvm><gra>English</gra></div>;
maqaf and sof pasuq stay on the word before them, as in WLC+.
"""
import html, os, re, sqlite3, sys, unicodedata
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import LIBRARY, find  # noqa: E402
FINAL = str.maketrans("ךםןףץ", "כמנפצ")
DIV = re.compile(r"<div><grk>(.*?)</grk>((?:<num>.*?</num>)*)<tvm>(.*?)</tvm><gra>(.*?)</gra></div>")


def consonants(w):
    return "".join(ch for ch in unicodedata.normalize("NFD", w) if "א" <= ch <= "ת").translate(FINAL)


def words_of(text):
    """Ginsburg's verse as tokens: each word with a maqaf or sof pasuq after it kept on it (כָּל־,
    הָאָֽרֶץ׃), and anything without a Hebrew letter (a paseq ׀) a token of its own."""
    t = re.sub(r"<[^>]+>", " ", text or "")
    out = []
    for w in t.split():
        for part in re.findall(r"[^־]+־?|־", w):
            out.append(part)
    return out


def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()


def pair(g, w):
    """{index in g: index in w}, which pairings were exact, and the words Ginsburg splits with a
    maqaf that the WLC writes as one (כְּדָר־לָעֹמֶר), as {first: second}."""
    gk, wk = [consonants(x) for x in g], [consonants(x) for x in w]
    out, exact, joined = {}, set(), {}
    for op, a1, a2, b1, b2 in SequenceMatcher(None, gk, wk, autojunk=False).get_opcodes():
        if op == "equal":
            for k in range(a2 - a1):
                out[a1 + k] = b1 + k
                exact.add(a1 + k)
        elif op == "replace":
            # A name in two words, one in the WLC.
            i, j = a1, b1
            while i + 1 < a2 and j < b2:
                if gk[i] + gk[i + 1] == wk[j]:
                    out[i], joined[i] = j, i + 1
                    exact.add(i)
                    i, j = i + 2, j + 1
                else:
                    break
            a1, b1 = i, j
            if a1 >= a2 or b1 >= b2:
                continue
            # Near spellings: one for one when the counts agree, else each to its likest, in order.
            if a2 - a1 == b2 - b1:
                for k in range(a2 - a1):
                    if gk[a1 + k] and similar(gk[a1 + k], wk[b1 + k]) >= 0.6:
                        out[a1 + k] = b1 + k
            else:
                j = b1
                for i in range(a1, a2):
                    if not gk[i]:
                        continue
                    cands = [(similar(gk[i], wk[x]), x) for x in range(j, b2)]
                    if cands:
                        s, x = max(cands)
                        if s >= 0.75:
                            out[i] = x
                            j = x + 1
    return out, exact, joined


def main():
    for f in ("ginsburg.bbli", "wlc+.bbli"):
        if not find(f).exists():
            sys.exit(f"no {f}; build it first")
    db = sqlite3.connect(f"file:{find('wlc+.bbli')}?mode=ro", uri=True)
    wlc = {}
    for b, c, v, t in db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible"):
        wlc[(b, c, v)] = [(m.group(1), m.group(2), m.group(3), m.group(4)) for m in DIV.finditer(t or "")]
    db.close()
    db = sqlite3.connect(f"file:{find('ginsburg.bbli')}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible ORDER BY Book, Chapter, Verse").fetchall()
    db.close()

    out, n_exact, n_near, n_bare, per_book, worst = [], 0, 0, 0, {}, []
    for b, c, v, t in rows:
        g = words_of(t)
        w = wlc.get((b, c, v), [])
        m, exact, joined = pair(g, [x[0] for x in w])
        s, verse_words, verse_hits = [], 0, 0
        skip = set(joined.values())
        for i, tok in enumerate(g):
            if i in skip:
                continue
            if i in joined:
                tok += g[joined[i]]
            if not consonants(tok):
                s.append(" " + html.escape(tok, quote=False) + " ")  # a paseq, or other mark
                continue
            verse_words += 1
            if i in m:
                _, nums, tvm, gra = w[m[i]]
                s.append(f"<div><grk>{tok}</grk>{nums}<tvm>{tvm}</tvm><gra>{gra}</gra></div>")
                verse_hits += 1
                if i in exact:
                    n_exact += 1
                else:
                    n_near += 1
            else:
                s.append(" " + tok + " ")
                n_bare += 1
        text = re.sub(r"\s+", " ", "".join(s)).strip()
        out.append((b, c, v, f"<heb>{text}</heb>"))
        x = per_book.setdefault(b, [0, 0])
        x[0] += verse_hits
        x[1] += verse_words
        if verse_words:
            worst.append((verse_hits / verse_words, (b, c, v), verse_words))

    total = n_exact + n_near + n_bare
    print(f"{len(out)} verses, {total} words: {n_exact} ({n_exact / total:.1%}) matched exactly, {n_near} ({n_near / total:.1%}) "
          f"near-matched, {n_bare} ({n_bare / total:.1%}) left bare")
    low = sorted((h / max(n, 1), b) for b, (h, n) in per_book.items())[:5]
    print("  least glossed books: " + ", ".join(f"{b} {r:.1%}" for r, b in low))
    print("  worst verses: " + ", ".join(f"{b}:{c}:{v} {r:.0%}/{n}" for r, (b, c, v), n in sorted(worst)[:10]))

    info = ("<p>Ginsburg's Hebrew Bible (1894), which follows Jacob ben Chayyim's text of Bomberg's second Rabbinic Bible "
            "(1524–25), word by word: each word with its English, Strong's number and grammar, taken from WLC+ by lining the "
            "two texts up by their consonants (the Open Scriptures Hebrew Bible's lemmas and morphology, CC BY 4.0; STEPBible's "
            f"TBESH glosses, CC BY 4.0). {(n_exact + n_near) / total:.1%} of the words are glossed; a word where Ben Chayyim's "
            "text differs from the Leningrad Codex's is left without. Text: github.com/ahembd/Ginsburg_Hebrew_Bible (Apache-2.0). "
            "Verses are numbered as in the KJV. Built by Two-edged Sword's tools/ginsburg/plus.py.</p>")
    p = LIBRARY / "ginsburg+.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,1,0,0,1,1)", ("Hebrew Bible (Ginsburg 1894, Ben Chayyim) w/ glosses", "Ginsburg+", info))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(out)} verses")


if __name__ == "__main__":
    main()
