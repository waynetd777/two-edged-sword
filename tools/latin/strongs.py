# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Strong's numbers for the Clementine's words, borrowed from the original-language modules the app
ships by lining the verses up word by word: WLC+ (Hebrew, H numbers) for the Old Testament, Byz+
(Greek, G numbers) for the New, and the Greek Septuagint's LXX+ for the deuterocanon and the Greek
parts of Esther (10:4–16:24) and Daniel (3:23 with the Song of the Three, 13–14). All are numbered
as the KJV's, as clementine.bbli is.

How (the alignment is tools/syriac's, copied here so the tools stay apart):
  1. Each Latin word is its lemma (Stanza's, tools/latin/build.py), each original word its Strong's
     number.
  2. A word-alignment model (IBM model 2 with fast_align's diagonal prior) is trained both ways by
     expectation-maximisation, one for the Hebrew and one for the Greek (the Greek one also reads the
     Clementine's Old Testament beside the Septuagint's, so it knows the Septuagint's words); the two
     alignments are intersected and grown by the links that touch an unaligned Latin word.
  3. Those links are counted over the whole Bible, lemma by Strong's number. In each verse a Latin
     word then takes the original word it is most often linked with, near its place in the verse;
     two words wanting one original word: the weaker takes its next choice if that is near as good,
     or none. A word may take only an original word of a part of speech it can render (a pronoun not a
     verb, a preposition not the noun a Hebrew prefix is joined to, a name only a name), and a link
     the alignment found both ways stands even for a word too rare to count (virgo, עַלְמָה). In the deuterocanon, whose verses the Vulgate divides (and in Tobit and Judith words)
     unlike the Greek, the verses either side are looked in as well, and only surer links are taken.
  4. A word left without one takes its lemma's usual number if that number is in the verse (or the
     verses either side) and the lemma has it nearly always; a name left without one, the name in the
     verse whose English is spelt most like it (Emmanuel, Immanuel).
A Latin word with no counterpart (the Hebrew has no number for its prefixes, Latin no article), or too
weak a link, has no number: none rather than a poor guess. The article (G3588) and the Hebrew object
marker (H853) are never given.

The alignment is cached in ~/Library/Caches/Two-edged Sword/latin/strongs, keyed on the texts and ALGORITHM.
"""
import hashlib, html, json, math, re, sqlite3, sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import CACHES, find, write_whole  # noqa: E402

CACHE = CACHES / "latin" / "strongs"
ALGORITHM = "ibm2-both-ways/5/4.0 lemmas-v2"  # change to throw the cached alignment away
NEVER = {"G3588", "H853"}
DIV = re.compile(r"<div>(.*?)</div>", re.S)
NUM = re.compile(r"<num>([HG]\d+[a-z]?)</num>")
TVM = re.compile(r"<tvm>(.*?)</tvm>")
GRA = re.compile(r"<gra>(.*?)</gra>")

# The kinds of original word each of Stanza's parts of speech may render.
RENDERS = {
    "NOUN": {"noun", "adj", "verb"}, "PROPN": {"name", "adj"}, "VERB": {"verb", "adj", "noun"}, "AUX": {"verb"},
    "ADJ": {"adj", "noun", "pron", "verb"}, "NUM": {"adj", "noun"}, "DET": {"pron", "adj"}, "PRON": {"pron", "prep", "adj"},
    "ADP": {"prep", "adv"}, "ADV": {"adv", "conj", "prep", "pron", "adj"}, "PART": {"adv", "conj", "prep", "pron"},
    "CCONJ": {"conj", "adv", "pron"}, "SCONJ": {"conj", "adv", "pron"}, "INTJ": {"adv", "conj"},
}
KIND = [("proper noun", "name"), ("name", "name"), ("hebrew word", "name"), ("aramaic word", "name"), ("pronoun", "pron"),
        ("relative", "pron"), ("interrogative", "pron"), ("adverb", "adv"), ("adjective", "adj"), ("numeral", "adj"),
        ("noun", "noun"), ("verb", "verb"), ("article", "art"), ("preposition", "prep"), ("conjunction", "conj"),
        ("negative", "adv"), ("particle", "adv"), ("interjection", "adv"), ("object marker", "marker"), ("letter", "name")]


def kind(tvm, gloss):
    """An original word's kind, from its grammar: its last part for a Hebrew word with prefixes ("conjunction + verb"
    is a verb; "preposition + pronominal suffix" a preposition with a pronoun)."""
    parts = [x.strip().lower() for x in tvm.split("·")[0].split("+")]
    head = parts[-1]
    if head == "pronominal suffix" and len(parts) > 1:
        head = parts[-2]
    for k, v in KIND:
        if k in head:
            if v == "noun" and gloss[:1].isupper() and gloss.lower() not in ("god", "lord"):
                return "name"
            return v
    return "other"


def numbers(name):
    """{(book, chapter, verse): [(Strong's number, kind, English) of each numbered word]} of a bundled "+" module."""
    p = find(name)
    if not p.is_file():
        sys.exit(f"no {p}")
    db = sqlite3.connect(f"file:{p}?immutable=1", uri=True)
    out = {}
    for b, c, v, s in db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible"):
        ns = []
        for d in DIV.findall(s or ""):
            m = NUM.search(d)
            if m:
                t, g = TVM.search(d), GRA.search(d)
                gl = html.unescape(g.group(1)) if g else ""
                ns.append((m.group(1), kind(html.unescape(t.group(1)) if t else "", gl), gl))
        out[(b, c, v)] = ns
    db.close()
    return out


def name_key(s):
    s = s.lower().replace("j", "i").replace("y", "i").replace("v", "u").replace("ph", "f").replace("k", "c").replace("z", "s")
    return re.sub(r"[^a-z]", "", s).replace("h", "")


def greek_part(b, c, v):
    """Whether the Clementine's verse is one of the Greek parts of a Hebrew book."""
    return (b == 17 and (c > 10 or c == 10 and v >= 4)) or (b == 27 and (c >= 13 or (c, v) == (3, 23)))


def prior(n, m, j, lam):
    """fast_align's diagonal: how near each of n source places is to target place j of m; NULL takes 0.08."""
    p = [math.exp(-lam * abs(i / n - j / m)) for i in range(n)]
    z = sum(p)
    return [x / z * 0.92 for x in p]


def train(src, tgt, keys, iters=5, lam=4.0):
    """t[(s, g)]: the chance that target token g is generated by source token s (s None: by NULL)."""
    t = defaultdict(lambda: 1.0)
    for it in range(iters):
        counts, total = defaultdict(float), defaultdict(float)
        for k in keys:
            s, g = src[k], tgt[k]
            n, m = len(s), len(g)
            if not n or not m:
                continue
            for j, gj in enumerate(g):
                pr = prior(n, m, j, lam)
                ps = [t[(si, gj)] * pr[i] for i, si in enumerate(s)] + [t[(None, gj)] * 0.08]
                z = sum(ps)
                for si, p in zip(s + [None], ps):
                    counts[(si, gj)] += p / z
                    total[si] += p / z
        t = defaultdict(lambda: 1e-6, {(a, b): c / total[a] for (a, b), c in counts.items()})
        print(f"    round {it + 1}", end="\r", flush=True)
    return t


def viterbi(t, s, g, lam=4.0):
    """For each target token, its likeliest source token (an index), or None for NULL."""
    n, m, out = len(s), len(g), []
    for j, gj in enumerate(g):
        pr = prior(n, m, j, lam)
        ps = [t[(si, gj)] * pr[i] for i, si in enumerate(s)]
        best = max(range(n), key=lambda i: (ps[i], -i))
        out.append(best if ps[best] > 0.08 * t[(None, gj)] else None)
    return out


def links(L, O, keys):
    """{verse key: [(latin index, original index)]}: the symmetrised alignment."""
    keys = [k for k in keys if L[k] and O[k]]
    t_lo = train(L, O, keys)
    t_ol = train(O, L, keys)
    out = {}
    for k in keys:
        s, g = L[k], O[k]
        a1, a2 = viterbi(t_lo, s, g), viterbi(t_ol, g, s)
        inter = {(i, j) for j, i in enumerate(a1) if i is not None and a2[i] == j}
        union = {(i, j) for j, i in enumerate(a1) if i is not None} | {(i, j) for i, j in enumerate(a2) if j is not None}
        got = set(inter)
        for i, j in sorted(union - inter):
            if not any(x == i for x, _ in got):
                got.add((i, j))
        out[k] = sorted((i, j, int((i, j) in inter)) for i, j in got)
    return out


def cached_links(name, L, O, keys):
    h = hashlib.sha256((ALGORITHM + name).encode())
    for k in keys:
        h.update(f"{k}\t{' '.join(L[k])}\t{' '.join(O[k])}\n".encode())
    p = CACHE / f"{name}-{h.hexdigest()[:16]}.json"
    if p.is_file():
        return {tuple(int(x) if x.isdigit() else x for x in k.split(".")): [tuple(x) for x in v] for k, v in json.loads(p.read_text()).items()}
    print(f"  aligning the Latin with the {name} (both ways; once, then cached)")
    out = links(L, O, keys)
    print()
    for old in CACHE.glob(f"{name}-*.json"):
        old.unlink()
    write_whole(p, json.dumps({".".join(map(str, k)): v for k, v in out.items()}, separators=(",", ":")))
    return out


def assign(latin, upos):
    """{(book, chapter, verse): {word index: Strong's number}} for the Clementine's verses, given
    `latin`, {(book, chapter, verse): [lemma of each word]}, and `upos`, the same with each word's part
    of speech."""
    wlc, byz, lxx = numbers("wlc+.bbli"), numbers("byz+.bbli"), numbers("lxx_brenton+.bbli")
    src = {}  # verse → (corpus, original words) it is given its numbers from
    for k in latin:
        b, c, v = k
        if 40 <= b <= 66:
            if k in byz:
                src[k] = ("greek", byz[k])
        elif b <= 39 and not greek_part(*k) and k in wlc:
            src[k] = ("hebrew", wlc[k])
        elif k in lxx:
            src[k] = ("greek", lxx[k])
    # what each model learns from: the verses given numbers, and (for the Greek) the Old Testament's Septuagint too
    corpora = {"hebrew": {}, "greek": {}}
    for k, (corpus, ns) in src.items():
        corpora[corpus][k] = [x for x, _, _ in ns]
    extra = {("lxx",) + k: [x for x, _, _ in lxx[k]] for k in latin if k[0] <= 39 and src.get(k, ("",))[0] == "hebrew" and k in lxx}
    D, tot, best, both = {}, {}, {}, {}
    for name, O in (("hebrew", corpora["hebrew"]), ("greek", {**corpora["greek"], **extra})):
        L = {k: latin[k[1:] if k[0] == "lxx" else k] for k in O}
        keys = sorted(O, key=lambda k: tuple(x if isinstance(x, int) else -1 for x in k))
        got = cached_links(name, L, O, keys)
        d, t = Counter(), Counter()
        for k, ls in got.items():
            for i, j, sure in ls:
                d[(L[k][i], O[k][j])] += 1
                t[L[k][i]] += 1
                if sure and k[0] != "lxx":
                    both.setdefault(k, set()).add((i, j))
        D[name], tot[name] = d, t
        # lemma → (its commonest number, that number's share of the lemma's links, how many)
        by_lemma = defaultdict(Counter)
        for (l, x), c in d.items():
            by_lemma[l][x] += c
        best[name] = {l: (cs.most_common(1)[0][0], cs.most_common(1)[0][1] / t[l], cs.most_common(1)[0][1]) for l, cs in by_lemma.items()}

    out = {}
    for k, (corpus, ns) in src.items():
        Dc, tc, bc = D[corpus], tot[corpus], best[corpus]
        s, pos = latin[k], upos[k]
        n = len(s)
        b, c, v = k
        sure = both.get(k, set())
        # the verse's own words, and in the deuterocanon those of the verses either side (further off, weaker)
        cands = [(j, x, kd, g, 0) for j, (x, kd, g) in enumerate(ns)]
        if b >= 67 or greek_part(*k):
            for d in (-2, -1, 1, 2):
                for j, (x, kd, g) in enumerate(lxx.get((b, c, v + d), [])):
                    cands.append((j, x, kd, g, d))
        m = max(len(ns), 1)
        deut = b >= 67 or greek_part(*k)  # the Vulgate's deuterocanon is often another text than the Greek: surer links only

        def fits(i, kd, x):
            ok = RENDERS.get(pos[i])
            return x not in NEVER and (ok is None or kd in ok or kd == "other") and not (kd == "name" and pos[i] not in ("PROPN", "ADJ", "X"))

        pick, scored = {}, {}
        for i, li in enumerate(s):
            if not li:
                continue
            sc = []
            for j, x, kd, g, d in cands:
                if not fits(i, kd, x):
                    continue
                if kd == "name" and pos[i] == "PROPN" and SequenceMatcher(None, name_key(li), name_key(g)).ratio() < 0.4:
                    continue  # a name for a name spelt somewhat like it (Theodotius is not Mattathias)
                share = (Dc[(li, x)] + 0.01) / (tc[li] + 1)
                rare = d == 0 and (i, j) in sure and pos[i] in ("NOUN", "PROPN", "VERB", "ADJ")
                if (Dc[(li, x)] < (3 if not deut else 5) or share < (0.06 if not deut else 0.12)) and not rare:
                    continue
                place = math.exp(-2 * abs(i / n - j / m)) if d == 0 else 0.35 * math.exp(-0.5 * abs(d))
                sc.append((max(share, 0.2 if rare else 0) * place, -abs(d), -j, (d, j), x))
            if sc:
                scored[i] = sorted(sc, reverse=True)
                pick[i] = scored[i][0]
        # two Latin words on one original word: the weaker takes its next choice if near as good, or none
        by_word = defaultdict(list)
        for i, p in pick.items():
            by_word[p[3]].append((p[0], -i, i))
        for _, users in sorted(by_word.items()):
            if len(users) < 2:
                continue
            users.sort(reverse=True)
            taken = {p[3] for p in pick.values()}
            for score, _, i in users[1:]:
                for alt in scored[i][1:]:
                    if alt[3] not in taken and alt[0] >= 0.3 * score:
                        pick[i] = alt
                        taken.add(alt[3])
                        break
                else:
                    # side by side (factum est, ἐγένετο), both strong, they may share it
                    if abs(i - users[0][2]) > 1 or score < 0.3 * users[0][0] or score < 0.1:
                        del pick[i]
        nums = {i: p[4] for i, p in pick.items() if p[0] >= (0.03 if not deut else 0.06)}
        # a word left over: its lemma's usual number, when it nearly always has it and the verse has it
        here = {x: kd for _, x, kd, _, _ in cands}
        for i, li in enumerate(s):
            if i in nums or not li or li not in bc:
                continue
            x, share, cnt = bc[li]
            if share >= 0.8 and cnt >= 10 and x in here and fits(i, here[x], x):
                nums[i] = x
        # a name left over: the name in the verse spelt most like it
        used = set(nums.values())
        for i, li in enumerate(s):
            if i in nums or pos[i] != "PROPN":
                continue
            best_name = max(((SequenceMatcher(None, name_key(li), name_key(g)).ratio(), x) for _, x, kd, g, d in cands
                             if kd == "name" and d == 0 and x not in used and g), default=None)
            if best_name and best_name[0] >= 0.6:
                nums[i] = best_name[1]
                used.add(best_name[1])
        out[k] = nums
    return out
