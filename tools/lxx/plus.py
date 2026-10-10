# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds lxx_brenton+.bbli ("Septuagint (Greek, Brenton 1844) w/ glosses"): the Greek Brenton
Septuagint word by word, each word with English under it, its Strong's number and its grammar, as
Greek NT INT+ has them.

    python3 tools/lxx/plus.py

Reads lxx_brenton.bbli (tools/lxx/build.py builds it), the library's Greek OT+ (greekot+.bbli) and
STEPBible's TAGNT (tools/stepbible.py), and writes lxx_brenton+.bbli beside them; the app finds it
after Library → Rescan. Greek OT+ is e-Sword's, so the module is for personal use: the tagged
Septuagints there are (CATSS's and those made from it) are licensed restrictively too.

Sources:
  Strong's numbers and grammar: Greek OT+ ("Greek Old Testament (Septuagint) w/ Strong's Numbers",
    e-Sword's), Rahlfs' Septuagint with each word's number and Robinson-style grammar code
    (<tvm>V-AAI-3S</tvm>). It has the 39 books of the canon only, in the Septuagint's numbering.
  English: STEPBible's TBESG (Translators Brief lexicon of Extended Strongs for Greek, Tyndale
    House, CC BY 4.0, https://github.com/STEPBible/STEPBible-Data): the gloss of each number's first
    entry, the word before any colon ("earth: planet": earth), without a leading "to" or "an".

Brenton's text is the Vatican (Sixtine) one and Rahlfs' is his own, and Greek OT+ numbers the
verses as the Septuagint does (its Psalm 22 is the KJV's 23; Jeremiah's chapters are in another
order), so the two are matched by their words, not their numbers: for each of Brenton's verses the
run of one to three Rahlfs verses of the same book that shares most words with it is found (from
the verse's rarer words and its own number), and the words are lined up in order, accents, case,
final sigma and a closing movable nu ignored; where the texts differ a word matches its like in the
same place (δαυιδ, Δαυίδ; one letter apart). A matched word takes the Rahlfs word's number and
grammar. A word matched to none, and every word of the Apocrypha (Greek OT+ hasn't them), takes the
number and grammar most often given to the same form in Greek OT+ and the Greek NT (TAGNT's
editions), if it occurs there. Greek OT+'s numbers are checked against the Greek NT's: where the NTs give a form one number
nearly always and practically never Greek OT+'s, the NTs' is taken (Greek OT+ has γῆ, earth, as
G1065, γε, throughout). The gloss is TBESG's for the number; a name with no number is transliterated.

STEPBible's files are cached in ~/Library/Caches/Two-edged Sword/stepbible (tools/stepbible.py).
"""
import html, re, sqlite3, sys, unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import find, greek_key, module, similar as ratio  # noqa: E402
from stepbible import lexicon, robinson, tagnt  # noqa: E402
BOOK_NAMES = {67: "Tobit", 68: "Judith", 69: "Wisdom", 70: "Sirach", 71: "Baruch", 72: "1 Maccabees", 73: "2 Maccabees",
              74: "1 Esdras", 76: "3 Maccabees", 77: "4 Maccabees", 78: "Prayer of Manasseh"}


HEADWORD = {}  # "G2400": "ιδου", TBESG's headword for each number, as key() has it


def glosses():
    """{"G0746": "beginning", …}: each number's first TBESG entry's gloss, its head word."""
    out = {}
    for line in lexicon("TBESG").split("\n"):
        f = line.split("\t")
        if len(f) > 6 and re.fullmatch(r"G\d{4}", f[0]) and f[0] not in out and f[6].strip():
            HEADWORD[f[0]] = key(f[3])
            g = f[6].split(":")[0].strip()
            g = re.sub(r"^(?:to|an?)\s+", "", g)
            out[f[0]] = g
    return out


def key(w):
    """A word for comparing editions: lower case, no accents or breathings, σ for ς, no closing
    movable nu (ἐστιν, ἐστι) in a word of four letters or more, letters only."""
    return greek_key(w, nu_from=4)


def num(n):
    """"G3588", "3588", "G03588" -> "G3588"; else None."""
    m = re.fullmatch(r"G?0*(\d+)", (n or "").strip())
    return f"G{int(m.group(1))}" if m else None


TAGGED = re.compile(r"([^\s<]+)((?:<num>[^<]*</num>)*)\s*(?:<tvm>([^<]*)</tvm>)?")


def tagged(html_text):
    """A tagged verse (Greek OT+, NT+) as [(key, number or None, grammar code or None)]."""
    s = re.sub(r"</?grk>", " ", html_text or "")
    out = []
    for m in TAGGED.finditer(s):
        k = key(m.group(1))
        if not k:
            continue
        ns = [num(x) for x in re.findall(r"<num>([^<]*)</num>", m.group(2) or "")]
        ns = [x for x in ns if x]
        out.append((k, ns[0] if ns else None, (m.group(3) or "").strip() or None))
    return out


def nt_words():
    """STEPBible's TAGNT (every edition's words, CC BY 4.0), verse by verse, as tagged() gives them."""
    return [[(key(w.greek), w.num, w.code or None) for w in ws if key(w.greek)] for ws in tagnt().values()]


def library(name, where=""):
    db = sqlite3.connect(f"file:{find(name)}?mode=ro", uri=True)
    rows = db.execute(f"SELECT Book, Chapter, Verse, Scripture FROM Bible {where} ORDER BY Book, Chapter, Verse").fetchall()
    db.close()
    return rows


UNKNOWN = Counter()  # Robinson codes robinson() couldn't spell out, for the report
FIXED = Counter()


TRANSLIT = dict(zip("αβγδεζηθικλμνξοπρσςτυφχψω", ["a", "b", "g", "d", "e", "z", "ē", "th", "i", "k", "l", "m", "n", "x", "o", "p", "r", "s", "s", "t", "u", "ph", "ch", "ps", "ō"], strict=True))


def translit(w):
    k = unicodedata.normalize("NFD", w.lower())
    k = "".join(ch for ch in k if not unicodedata.combining(ch))
    t = "".join(TRANSLIT.get(ch, "") for ch in k)
    return t.capitalize()


def similar(a, b):
    return a == b or (min(len(a), len(b)) >= 3 and ratio(a, b) >= 0.75)


GREEK_WORD = re.compile(r"[Ͱ-Ͽἀ-῿᾽᾿᾽’']+")


def main():
    gl = glosses()
    brenton = library("lxx_brenton.bbli")
    if not find("greekot+.bbli").exists():
        sys.exit("no greekot+.bbli (e-Sword's Greek OT+, Rahlfs with Strong's numbers) in the library; there is no openly "
                 "licensed tagged Septuagint to use instead, so this module can be built only with e-Sword's")
    rahlfs = library("greekot+.bbli")
    print(f"Brenton: {len(brenton)} verses; Greek OT+: {len(rahlfs)}; TBESG: {len(gl)} numbers")

    # Greek OT+ by book: its verses in order, with an index of which verses each word is in.
    R = defaultdict(list)
    for b, c, v, t in rahlfs:
        R[b].append(((c, v), tagged(t)))
    where = {b: defaultdict(set) for b in R}
    freq = {b: Counter() for b in R}
    at = {b: {} for b in R}
    for b, vs in R.items():
        for i, (cv, ws) in enumerate(vs):
            at[b][cv] = i
            for k, _, _ in ws:
                where[b][k].add(i)
                freq[b][k] += 1

    # Every tagged form's commonest number and grammar, for words matched to none.
    forms = defaultdict(Counter)
    for _, _, _, t in rahlfs:
        for k, n, g in tagged(t):
            if n:
                forms[k][(n, g)] += 1
    for ws in nt_words():
        for k, n, g in ws:
            if n:
                forms[k][(n, g)] += 1
    common = {k: c.most_common(1)[0][0] for k, c in forms.items()}
    # Greek OT+'s numbers checked against the Greek NTs': where the NTs give a form one number
    # (90% of the time or more) and practically never Greek OT+'s, Greek OT+'s is a slip in its
    # tagging, however often it's made (it has γῆ as G1065, γε, throughout) and the NTs' is taken.
    # A form the NTs give several (η: the article, "which", "or") is left as Greek OT+ has it.
    nt = defaultdict(Counter)
    for ws in nt_words():
        for k, n, _ in ws:
            if n:
                nt[k][n] += 1
    def usual(k, n):
        c = nt.get(k)
        if not c or not n:
            return n
        top, m = c.most_common(1)[0]
        total = sum(c.values())
        if HEADWORD.get(f"G{int(n[1:]):04d}") == k:
            return n  # Greek OT+'s number is this very word's (ἰδού, G2400): kept
        if top != n and total >= 5 and m >= 0.9 * total and c.get(n, 0) <= 0.02 * total:
            FIXED[(k, n, top)] += 1
            return top
        return n
        top, m = c.most_common(1)[0]
        total = sum(c.values())
        if top != n and c.get(n, 0) <= 0.05 * total and m >= 0.7 * total and total >= 10:
            FIXED[(k, n, top)] += 1
            return top
        return n

    out = []
    stats = defaultdict(lambda: Counter())
    worst = []
    for b, c, v, text in brenton:
        toks = re.findall(r"\S+", text)
        words = [(i, key(t)) for i, t in enumerate(toks) if GREEK_WORD.search(t) and key(t)]
        ks = [k for _, k in words]
        tags = [None] * len(words)
        source = ["none"] * len(words)
        if b in R and ks:
            vs = R[b]
            cands = set()
            if (c, v) in at[b]:
                cands.add(at[b][(c, v)])
            rare = sorted(set(ks), key=lambda k: freq[b].get(k, 10 ** 9))[:4]
            for k in rare:
                if freq[b].get(k, 0) <= 40:
                    cands.update(where[b].get(k, ()))
            best = None
            for i in sorted(cands)[:80]:
                for lo in (i - 1, i):
                    for n in (1, 2, 3):
                        if lo < 0 or lo + n > len(vs):
                            continue
                        win = [w for _, ws in vs[lo:lo + n] for w in ws]
                        sm = SequenceMatcher(None, ks, [w[0] for w in win], autojunk=False)
                        score = sum(m.size for m in sm.get_matching_blocks()) - 0.02 * n
                        if not best or score > best[0]:
                            best = (score, win)
            if best and best[0] >= max(2, 0.3 * len(ks)):
                win = best[1]
                wk = [w[0] for w in win]
                for op, i1, i2, j1, j2 in SequenceMatcher(None, ks, wk, autojunk=False).get_opcodes():
                    if op == "equal":
                        for d in range(i2 - i1):
                            tags[i1 + d] = win[j1 + d]
                            source[i1 + d] = "rahlfs"
                    elif op == "replace":
                        # Like for like in the same place: the same word spelt another way.
                        used = set()
                        for d in range(i2 - i1):
                            for e in range(j1, j2):
                                if e not in used and similar(ks[i1 + d], wk[e]):
                                    tags[i1 + d] = win[e]
                                    source[i1 + d] = "rahlfs"
                                    used.add(e)
                                    break
        for d, (i, k) in enumerate(words):
            if tags[d] is None or not tags[d][1]:
                if k in common:
                    n, g = common[k]
                    tags[d] = (k, n, g if not (tags[d] and tags[d][2]) else tags[d][2])
                    source[d] = "forms" if source[d] == "none" else source[d]
        # The verse as INT+'s boxes.
        parts, wi = [], {i: d for d, (i, _) in enumerate(words)}
        glossed = 0
        for i, t in enumerate(toks):
            d = wi.get(i)
            if d is None:
                parts.append(html.escape(t, quote=False))
                continue
            _, n, g = tags[d] or (None, None, None)
            if source[d] == "rahlfs":
                n = usual(words[d][1], n)
            en = gl.get(f"G{int(n[1:]):04d}", "") if n else ""
            if not en and g and g.startswith("N-PRI"):
                en = translit(t)
            glossed += bool(en)
            box = f"<div><grk>{html.escape(t, quote=False)}</grk>"
            if n:
                box += f"<num>{n}</num>"
            if g:
                box += f"<tvm>{html.escape(robinson(g, UNKNOWN), quote=False)}</tvm>"
            box += f"<gra>{html.escape(en, quote=False) or '—'}</gra></div>"
            parts.append(box)
        out.append((b, c, v, "".join(parts)))
        s = stats[b]
        s["words"] += len(words)
        s["rahlfs"] += source.count("rahlfs")
        s["forms"] += source.count("forms")
        s["glossed"] += glossed
        if len(words) >= 6:
            worst.append((glossed / len(words), (b, c, v)))

    total = Counter()
    for s in stats.values():
        total.update(s)
    print(f"{total['words']} words: {total['rahlfs'] / total['words']:.1%} matched to Rahlfs, {total['forms'] / total['words']:.1%} by form, "
          f"{total['glossed'] / total['words']:.1%} glossed")
    canon = Counter()
    apoc = Counter()
    for b, s in stats.items():
        (canon if b <= 39 else apoc).update(s)
    for name, s in (("canon", canon), ("Apocrypha", apoc)):
        if s["words"]:
            print(f"  {name}: {s['words']} words, {s['rahlfs'] / s['words']:.1%} Rahlfs, {s['forms'] / s['words']:.1%} by form, {s['glossed'] / s['words']:.1%} glossed")
    books = sorted(stats.items(), key=lambda kv: kv[1]["glossed"] / max(kv[1]["words"], 1))
    print("  least glossed books: " + ", ".join(f"{BOOK_NAMES.get(b, b)} {s['glossed'] / max(s['words'], 1):.0%}" for b, s in books[:8]))
    print("  least glossed verses: " + ", ".join(f"{b}:{c}:{v} {r:.0%}" for r, (b, c, v) in sorted(worst)[:8]))
    print(f"  numbers put right where the tagging slipped: {sum(FIXED.values())}, e.g. " + ", ".join(f"{k} {a}→{b}" for (k, a, b), _ in FIXED.most_common(8)))
    if UNKNOWN:
        print(f"  grammar codes not spelled out: {UNKNOWN.most_common(12)}")

    info = ("<p>The Septuagint in Greek as Sir Lancelot Brenton printed it (1844), the Vatican text of the Sixtine edition (Rome, "
            "1587), word by word: each word with English under it, its Strong's number and its grammar. The numbers and grammar are "
            "those of the same word in Rahlfs' Septuagint as e-Sword's Greek OT+ tags it, matched word for word (the two texts differ "
            "in places); a word Rahlfs hasn't there, and the Apocrypha, which Greek OT+ lacks, take those most often given to the same "
            "form in Greek OT+ and the Greek New Testaments. The English is STEPBible's TBESG gloss for the number (Tyndale House, "
            f"CC BY 4.0). {total['glossed'] / total['words']:.0%} of the words have English. Built by Two-edged Sword's tools/lxx.</p>")
    with module("lxx_brenton+.bbli", "Septuagint (Greek, Brenton 1844) w/ glosses", "LXX-Brenton+", info, nt=False, apocrypha=True, strongs=True) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    print(f"lxx_brenton+.bbli: {len(out)} verses")


if __name__ == "__main__":
    main()
