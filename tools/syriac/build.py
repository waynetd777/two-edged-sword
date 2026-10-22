# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds peshitta+.bbli ("Syriac Peshitta w/ Greek glosses"): the Peshitta New Testament word by word,
each Syriac word with the Strong's number and English of the Greek word it translates.

    python3 tools/syriac/build.py

Reads peshitta.bbli (tools/crosswire) and byz+.bbli (tools/core) wherever tools/modules.py finds them
(inside modules.shipping(), the built-in ones only) and writes peshitta+.bbli to the modules folder,
or to `into` (tools/core bundles it with the app). tools/syriac/sedra.py builds a different edition,
from SEDRA, for the user's own library only.

Sources, and nothing else:
  The Peshitta: the British and Foreign Bible Society's 1905 text, public domain (peshitta.bbli).
  The Greek: Robinson and Pierpont's Byzantine text, public domain, word by word as Byz+ has it, with
    the Strong's numbers of STEPBible's TAGNT and the English of STEPBible's TBESG (Tyndale House,
    CC BY 4.0, https://github.com/STEPBible/STEPBible-Data).
There is no open Syriac lexicon or morphology, so the English comes from the Greek: the Peshitta is a
translation of a Greek text close to the Byzantine, and each of its words is lined up with the Greek
word it renders.

How the words are lined up, verse by verse over the whole NT (the verses are numbered as the KJV's in
both):
  1. Each Syriac word is split into its proclitics (ܘ and, ܕ of/who, ܠ to, ܒ in) and a stem, when what
     is left is itself a word of the NT; the stem is cut short of its commonest endings (the emphatic
     -ܐ, the pronoun suffixes) so that the forms of a word count together.
  2. A word-alignment model (IBM model 2 with a diagonal prior, as fast_align) is trained both ways,
     Greek from Syriac and Syriac from Greek, by expectation-maximisation; the two alignments are
     intersected and grown by the links that touch an unaligned Syriac token.
  3. Those links are counted over the whole NT, stem by Strong's number; each Syriac stem then takes,
     in each verse, the Greek word it is most often linked with elsewhere, near its place in the verse.
     Two stems wanting the same Greek word: the weaker takes its next choice if that is near as good.
     Two stems that still share one are let go of unless they stand side by side (ܒܢܝ ܐܢܫܐ, ἀνθρώπων).
  4. Rules: only a small Syriac word (FIXED, PRONOUNS, or a preposition with a pronoun suffix, SUFFIXED)
     may render a Greek article, pronoun, καί, δέ, γάρ or οὖν; the small words take their own English
     rather than the Greek's, and its number only when the Greek is one they render (ܗܘܐ "was", never
     the article; ܡܢ "from", or "who" before a ܕ-clause or for τίς); a suffixed preposition is its
     preposition and pronoun ("to you", "before you", "your own"); a Greek genitive pronoun left over
     beside a word's Greek goes with it when the Syriac has the suffix (ܫܡܟ "your name"); the
     proclitics ܘ and ܒ read "and" and "in" before the English, unless it starts with a preposition.
  5. A word still without English: the Greek it is surely lined up with elsewhere in the NT (its form,
     at least 3 times, 60% of them the same Strong's number), when the verse's Greek hasn't that word
     and has no content word left over near its place that it might render, and the word is not a
     known homograph (HOMOGRAPHS); else Murdock's (1852) or Etheridge's (1846–49) English for it in
     the verse (public domain, bundled; their own alignment to the Syriac, both ways, one to one), when
     that is also its commonest English in them over the NT. Neither gives a Strong's number from the
     verse's Greek, and the word's tooltip says where its English is from.
  6. Pronoun suffixes the Greek lacks are added from the Syriac (ܥܝܢܝܟܘܢ "your eyes", ܒܪܝ "my son",
     ܩܒܠܘܗܝ "receive him"), and ܒ is not "in" before a verb (ܒܥܐ "seek" is a root, not a prefix).
A word with no clear counterpart is left as it is, without English.

The markup is INT+'s (see tokenize in src/esword.tsx): each word a
<div><grk>word</grk><num>G3686</num><tvm>grammar</tvm><grk>Greek</grk><gra>English</gra></div>; the
grammar and the Greek word are the Greek's and show in the word's tooltip, the Strong's number opens the
Greek entry. A small word with English of its own has no number, grammar or Greek.

All of it is deterministic. The alignments are the slow part (half a minute); it is cached in
~/Library/Caches/Two-edged Sword/syriac, keyed on the token streams aligned and ALGORITHM.
"""
import hashlib, html, json, math, re, sqlite3, sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import CACHES, find, module, write_whole  # noqa: E402
CACHE = CACHES / "syriac"
ALGORITHM = "ibm2-both-ways/6/4.0 stems-v5"  # change to throw the cached alignment away

WORD = re.compile(r"[܀-ݏ]+")  # U+0700–074F: Syriac punctuation, letters and points
LETTERS = re.compile(r"[ܐ-ܯݍ-ݏ]")
DIV = re.compile(r"<div><grk>(.*?)</grk><num>(.*?)</num><tvm>(.*?)</tvm><gra>(.*?)</gra></div>")

PROCLITICS = "ܘܕܠܒ"
PREFIX = {"ܘ": "and", "ܒ": "in"}  # the proclitics given as English before the word's own
ENDINGS = ("ܗܘܢ", "ܟܘܢ", "ܝܗܝ", "ܘܗܝ", "ܝܢ", "ܘܢ", "ܢ", "ܟ", "ܗ", "ܝ", "ܐ")
ARTICLE = "G3588"
# Greek words only a small Syriac word may render (any pronoun too): the article, and, but, for, therefore,
# that (ἵνα, ὅτι, which the proclitic ܕ renders).
SMALL_GREEK = {ARTICLE, "G2532", "G1161", "G1063", "G3767", "G2443", "G3754", "G302", "G1487", "G1437", "G3756", "G3361",
               "G3704", "G5613", "G5618", "G2531"}  # … ἄν, εἰ, ἐάν, οὐ, μή, ὅπως, ὡς, ὥσπερ, καθώς
# Pronouns and demonstratives, which may render the Greek article (ܗܘ ὁ, ܗܝ ἡ), and what they then mean.
PRONOUNS = {"ܗܘ": "that", "ܗܝ": "that", "ܗܢܘܢ": "those", "ܗܢܝܢ": "those", "ܗܢܐ": "this", "ܗܕܐ": "this", "ܐܝܠܝܢ": "those",
            "ܐܝܢܐ": "which", "ܐܝܕܐ": "which", "ܡܐ": "what"}
# A preposition with a pronoun suffix (ܠܟܘܢ to you, ܒܗ in him, ܡܢܗ from him, ܕܝܠܟ your own): a pronoun.
BASES = {"ܠ": "to", "ܒ": "in", "ܡܢ": "from", "ܥܠ": "on", "ܥܡ": "with", "ܠܘܬ": "to", "ܩܕܡ": "before", "ܕܝܠ": "own", "ܒܝܢܬ": "among",
         "ܒܬܪ": "after", "ܡܛܠܬ": "because of", "ܠܘܩܒܠ": "against", "ܚܠܦ": "for", "ܒܠܥܕ": "without"}
OBJECTS = {"ܝ": "me", "ܟ": "you", "ܗ": "him", "ܢ": "us", "ܟܝ": "you", "ܟܘܢ": "you", "ܟܝܢ": "you", "ܗܘܢ": "them",
           "ܗܝܢ": "them", "ܘܗܝ": "him", "ܝܗ": "her", "ܝܟ": "you", "ܝܟܝ": "you", "ܝܢ": "us", "ܝܢܢ": "us", "ܝܗܘܢ": "them",
           "ܝܗܝܢ": "them", "ܝܟܘܢ": "you", "ܝܟܝܢ": "you"}
SUFFIXED = re.compile(f"^({'|'.join(sorted(BASES, key=len, reverse=True))})({'|'.join(sorted(OBJECTS, key=len, reverse=True))})$")
# The pronoun suffixes a Syriac word ends with when it has a Greek genitive pronoun's sense in it.
SUFFIX = {"my": ("ܝ",), "your": ("ܟ", "ܟܝ", "ܟܘܢ", "ܟܝܢ"), "his": ("ܗ", "ܘܗܝ", "ܝܗܝ"), "her": ("ܗ",), "its": ("ܗ", "ܘܗܝ"),
          "our": ("ܢ",), "their": ("ܗܘܢ", "ܗܝܢ")}
# The commonest small words, in English, with the Strong's numbers of the Greek words they render (a
# word lined up with another Greek word keeps its English but has no number). A gloss of None: the
# Greek's English, when it is one of these numbers (ܡܢ is "from" or "who").
FIXED = {
    "ܕܝܢ": ("but", {"G1161", "G235"}), "ܓܝܪ": ("for", {"G1063"}), "ܠܐ": ("not", {"G3756", "G3361", "G3762", "G3367"}),
    "ܐܦ": ("also", {"G2532", "G1161"}), "ܐܢ": ("if", {"G1437", "G1487"}), "ܐܠܐ": ("but", {"G235", "G1508", "G4133"}),
    "ܐܝܟ": ("as", {"G5613", "G5618", "G2531", "G2509", "G2526", "G3704", "G3664", "G5616"}),
    "ܐܝܟܢܐ": ("as", {"G5613", "G5618", "G2531", "G4459", "G3704"}), "ܗܟܢܐ": ("thus", {"G3779", "G5615", "G3668", "G3634"}),
    "ܗܟܝܠ": ("therefore", {"G3767", "G686", "G5106"}), "ܡܛܠ": ("because", {"G1223", "G3754", "G1752", "G4012", "G1360"}),
    "ܟܕ": ("when", {"G3753", "G5613", "G2259"}), "ܥܕܡܐ": ("until", {"G2193", "G891", "G3360"}),
    "ܗܫܐ": ("now", {"G3568", "G737", "G3570"}), "ܬܘܒ": ("again", {"G3825"}), "ܐܝܬ": ("there is", set()),
    "ܠܝܬ": ("there is not", set()), "ܗܐ": ("behold", {"G2400", "G2396"}), "ܐܘ": ("or", {"G2228"}),
    "ܥܠ": ("on", {"G1909", "G4012", "G5228", "G2596"}), "ܥܡ": ("with", {"G3326", "G4862", "G3844", "G4314"}),
    "ܠܘܬ": ("to", {"G4314", "G1519", "G3844", "G1722"}), "ܩܕܡ": ("before", {"G1715", "G1799", "G4253", "G1726", "G1725", "G3936"}),
    "ܒܬܪ": ("after", {"G3326", "G3694", "G3693"}), "ܡܢ": (None, {"G575", "G1537", "G3844", "G5259", "G5101", "G3739"}),
    "ܗܘ": ("he", {"G846", "G3778", "G1565", "G3588"}), "ܗܝ": ("she", {"G846", "G3778", "G1565", "G3588"}),
    "ܗܢܘܢ": ("they", {"G846", "G3778", "G1565", "G3588"}), "ܗܢܝܢ": ("they", {"G846", "G3778", "G1565", "G3588"}),
    "ܗܢܐ": ("this", {"G3778", "G5124", "G3592"}), "ܗܕܐ": ("this", {"G3778", "G5124", "G3592"}),
    "ܐܢܐ": ("I", {"G1473", "G2504"}), "ܐܢܬ": ("you", {"G4771", "G4675"}), "ܐܢܬܘܢ": ("you", {"G5210", "G5216"}),
    "ܚܢܢ": ("we", {"G2249", "G2257"}), "ܐܝܠܝܢ": ("those", {"G3588", "G3739", "G3745", "G3778", "G1565"}),
    "ܡܢܘ": ("who?", {"G5101"}), "ܡܢܐ": ("what?", {"G5101", "G5100", "G3739"}), "ܐܡܬܝ": ("when", {"G3752", "G4219"}),
    "ܠܡܢܐ": ("why?", {"G5101", "G2444"}), "ܐܝܟܐ": ("where", {"G4226", "G3699", "G3757"}), "ܟܠ": ("all", {"G3956", "G3650", "G537"}),
    "ܗܘܐ": ("was", {"G1096", "G2258", "G1510", "G5225"}), "ܗܘܘ": ("were", {"G1096", "G2258", "G1510", "G5225"}),
    "ܗܪܟܐ": ("here", {"G5602", "G1759"}), "ܬܡܢ": ("there", {"G1563", "G1564"}), "ܐܡܝܢ": ("amen", {"G281"}),
    "ܚܕ": ("one", {"G1520", "G3391", "G5100", "G240"}),
}
# Words with a sense of their own unless lined up with one of these Greek words (ܒܝܬ ܡܝܬܐ "among the dead",
# but ܒܝܬ οἶκος "house").
OR_ELSE = {"ܒܝܬ": ("among", {"G3624", "G3614"}), "ܐܬܪܐ": ("place", {"G5117", "G5561", "G1093", "G4066", "G3968"})}
# Forms with two common senses, which never take their English from elsewhere in the NT (step 5): ܚܘܒܐ "love" and
# "debt", ܐܬܐ "came" and "sign", ܥܡ- "with" and "people", ܣܥܪܐ "hair" and "barley", ܒܪܟ "bless" and "kneel", ܕܡ-
# "blood" and "be low", ܕܡܝܐ "price" and ܡܝܐ "water", ܐܬܪܐ "place", ܥܢܐ "flock" and "answer", ܫܢܐ "year", "tooth"
# and "change", ܦܠܚܐ "farmer" and "serve", ܨܒܘܬ "thing" and "will".
HOMOGRAPHS = {"ܚܘܒܝܢ", "ܚܘܒܐ", "ܚܘܒܗ", "ܚܘܒܢ", "ܚܘܒܝܟ", "ܚܘܒܝܗܘܢ", "ܚܘܒܝܟܘܢ", "ܐܬܐ", "ܐܬܘܬܐ", "ܣܥܪܐ", "ܒܪܟܘ", "ܒܪܟ",
              "ܕܡܟ", "ܕܡܝܐ", "ܡܝܐ", "ܐܬܪܐ", "ܥܢܐ", "ܫܢܐ", "ܦܠܚܐ", "ܨܒܘܬ"}
# Nouns that end in ܝ "my" (ܒܢܝ "sons of" and many others don't).
MINE = {"ܒܪܝ": "son", "ܐܒܝ": "father", "ܐܡܝ": "mother", "ܠܒܝ": "heart", "ܢܦܫܝ": "soul", "ܐܠܗܝ": "God", "ܡܪܝ": "lord",
        "ܪܚܡܝ": "friend", "ܒܪܬܝ": "daughter", "ܐܚܬܝ": "sister", "ܪܘܚܝ": "spirit", "ܦܓܪܝ": "body", "ܫܡܝ": "name"}
# Noun suffixes that are a pronoun whatever the word: "your", "their", "his".
OWN_SUFFIX = (("ܝܟܘܢ", "your"), ("ܟܘܢ", "your"), ("ܝܗܘܢ", "their"), ("ܗܘܢ", "their"), ("ܝܗܝܢ", "their"), ("ܗܝܢ", "their"),
              ("ܝܟܝܢ", "your"), ("ܟܝܢ", "your"), ("ܘܗܝ", "his"), ("ܝܗܝ", "his"))
POSSESSIVE = {"my": "me", "our": "us", "your": "you", "his": "him", "her": "her", "its": "it", "their": "them"}
OWNER = {"me": "my", "us": "our", "you": "your", "him": "his", "her": "her", "them": "their"}


def verses(name):
    db = sqlite3.connect(f"file:{find(name)}?immutable=1", uri=True)
    try:
        return {(b, c, v): t or "" for b, c, v, t in db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible ORDER BY Book, Chapter, Verse")}
    finally:
        db.close()


def small(w):
    """A Syriac word that may render a Greek pronoun, article or conjunction."""
    return w in FIXED or w in PRONOUNS or bool(SUFFIXED.match(w))


def stem(w):
    for suf in ENDINGS:
        if len(w) - len(suf) >= 2 and w.endswith(suf):
            return w[: -len(suf)]
    return w


class Corpus:
    """The two texts as aligned token streams: Syriac (proclitics, then a stem, for each word) and
    Greek (one Strong's number for each word)."""

    def __init__(self, pesh, byz):
        self.syr = {k: [m.group() for m in WORD.finditer(t) if LETTERS.search(m.group())] for k, t in pesh.items()}
        self.grk = {k: [(g, n, tvm, html.unescape(gl)) for g, n, tvm, gl in DIV.findall(t)] for k, t in byz.items()}
        self.keys = [k for k in pesh if self.syr[k] and self.grk.get(k)]
        freq = Counter(w for k in self.keys for w in self.syr[k])

        def seg(w):
            pre = ""
            while len(w) > 2 and w[0] in PROCLITICS and freq.get(w[1:], 0) >= 2 and len(pre) < 3:
                pre, w = pre + w[0], w[1:]
            return pre, w
        self.seg = {w: seg(w) for w in freq}
        self.S, self.owner, self.G = {}, {}, {}
        for k in self.keys:
            toks, own = [], []
            for i, w in enumerate(self.syr[k]):
                pre, rest = self.seg[w]
                for ch in pre:
                    toks.append("+" + ch)
                    own.append(i)
                st = rest if small(rest) else stem(rest)
                toks.append(st + "~" if st != rest and small(st) else st)  # ܐܦܐ "face", not ܐܦ "also"
                own.append(i)
            self.S[k], self.owner[k] = toks, own
            self.G[k] = [n for _, n, _, _ in self.grk[k]]


def prior(n, m, j, lam):
    """fast_align's diagonal: how near each of n source places is to target place j of m; NULL takes 0.08."""
    p = [math.exp(-lam * abs(i / n - j / m)) for i in range(n)]
    z = sum(p)
    return [x / z * 0.92 for x in p]


def train(src, tgt, keys, iters=6, lam=4.0):
    """t[(s, g)]: the chance that target token g is generated by source token s (s None: by NULL)."""
    t = defaultdict(lambda: 1.0)
    for _ in range(iters):
        counts, total = defaultdict(float), defaultdict(float)
        for k in keys:
            s, g = src[k], tgt[k]
            n, m = len(s), len(g)
            for j, gj in enumerate(g):
                pr = prior(n, m, j, lam)
                ps = [t[(si, gj)] * pr[i] for i, si in enumerate(s)] + [t[(None, gj)] * 0.08]
                z = sum(ps)
                for si, p in zip(s + [None], ps, strict=True):
                    counts[(si, gj)] += p / z
                    total[si] += p / z
        t = defaultdict(lambda: 1e-6, {(a, b): c / total[a] for (a, b), c in counts.items()})
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


def links(c):
    """{verse key: [[syriac token, greek word], …]}: the symmetrised alignment (step 2)."""
    print("  aligning (both ways, 6 rounds each)")
    t_sg = train(c.S, c.G, c.keys)
    t_gs = train(c.G, c.S, c.keys)
    out = {}
    for k in c.keys:
        s, g = c.S[k], c.G[k]
        a1, a2 = viterbi(t_sg, s, g), viterbi(t_gs, g, s)
        inter = {(i, j) for j, i in enumerate(a1) if i is not None and a2[i] == j}
        union = {(i, j) for j, i in enumerate(a1) if i is not None} | {(i, j) for i, j in enumerate(a2) if j is not None}
        got = set(inter)
        for i, j in sorted(union - inter):
            if not any(x == i for x, _ in got):
                got.add((i, j))
        out[k] = sorted(got | {(i, j) for i, j in union if c.grk[k][j][2].startswith("pronoun")})
    return out


def cached_links(c):
    h = hashlib.sha256(ALGORITHM.encode())
    for k in c.keys:  # what is aligned: the token streams
        h.update(f"{k}\t{' '.join(c.S[k])}\t{' '.join(c.G[k])}\n".encode())
    p = CACHE / f"links-{h.hexdigest()[:16]}.json"
    if p.is_file():
        return {tuple(map(int, k.split("."))): v for k, v in json.loads(p.read_text()).items()}
    out = links(c)
    write_whole(p, json.dumps({".".join(map(str, k)): v for k, v in out.items()}, separators=(",", ":")))
    return {k: [list(x) for x in v] for k, v in out.items()}


def choose(c, L):
    """{verse key: {syriac token: greek word}}: each token's Greek, by the whole NT's counts (step 3)."""
    D, tot = Counter(), Counter()
    for k, ls in L.items():
        for i, j in ls:
            D[(c.S[k][i], c.G[k][j])] += 1
            tot[c.S[k][i]] += 1
    out = {}
    for k in c.keys:
        s, g = c.S[k], c.G[k]
        n, m = len(s), len(g)
        cand = {}
        for i, si in enumerate(s):
            if si.startswith("+"):
                continue
            sc = []
            for j, gj in enumerate(g):
                if gj == ARTICLE and si not in PRONOUNS and si != "ܡܢ":
                    continue
                if (gj in SMALL_GREEK or c.grk[k][j][2].startswith("pronoun")) and not small(si):
                    continue
                if D[(si, gj)] < 2:
                    continue
                sc.append(((D[(si, gj)] + 0.01) / (tot[si] + 1) * math.exp(-2 * abs(i / n - j / m)), -j, j))
            if sc:
                cand[i] = sorted(sc, reverse=True)
        pick = {i: sc[0] for i, sc in cand.items()}
        # Two stems on one Greek word: the weaker moves to its next choice if that is near as good, or
        # else lets it go, unless the two are side by side and the Greek a noun (ܒܢܝ ܐܢܫܐ "sons of man", ἀνθρώπων).
        by_j = defaultdict(list)
        for i, (score, _, j) in pick.items():
            by_j[j].append((score, -i, i))
        for _, users in sorted(by_j.items()):
            if len(users) < 2:
                continue
            users.sort(reverse=True)
            taken = {p[2] for p in pick.values()}
            first = c.owner[k][users[0][2]]
            for score, _, i in users[1:]:
                for alt in cand[i][1:]:
                    if alt[2] not in taken and alt[0] >= 0.3 * score:
                        pick[i] = alt
                        taken.add(alt[2])
                        break
                else:
                    if abs(c.owner[k][i] - first) > 1 or not c.grk[k][pick[i][2]][2].startswith(("noun", "adjective")):
                        del pick[i]
        out[k] = {i: p[2] for i, p in pick.items()}
    return out


PREPOSITIONS = {"in", "to", "into", "through", "from", "with", "on", "by", "at", "for", "of", "upon", "toward", "among", "before", "after"}


def english(c, k, wi, w, chosen, used):
    """(Strong's number or "", Greek word, Greek grammar, English) for Syriac word wi of verse k.
    `used`: the verse's Greek words already taken, by index (a genitive pronoun goes to one word only)."""
    toks = [ti for ti, o in enumerate(c.owner[k]) if o == wi]
    pre, rest = c.seg[w]
    j = chosen.get(toks[-1])
    gw = c.grk[k][j] if j is not None else None
    num, greek, tvm, gloss = (gw[1], re.sub(r"[^\w]", "", gw[0]), gw[2], gw[3]) if gw else ("", "", "", "")
    if rest in FIXED:
        fixed, renders = FIXED[rest]
        if num == ARTICLE and rest in PRONOUNS:
            gloss = PRONOUNS[rest]
            if rest in ("ܗܘ", "ܗܝ"):
                after = c.syr[k][wi + 1] if wi + 1 < len(c.syr[k]) else ""
                before = c.seg[c.syr[k][wi - 1]][1] if wi else ""
                if "ܕ" in pre:
                    gloss = "who"  # ܕܗܘ
                elif after.startswith("ܕ"):
                    gloss = "he who" if rest == "ܗܘ" else "she who"
                elif after in ("ܓܝܪ", "ܕܝܢ", "ܗܟܝܠ"):
                    gloss = "he" if rest == "ܗܘ" else "she"  # ܗܘ ܓܝܪ "for he": it begins a clause
                elif before and not small(before) and not c.syr[k][wi - 1].startswith("ܕ"):
                    gloss = "is"  # after its subject, ܦܘܡܢ ܦܬܝܚ ܗܘ "our mouth is open": the copula
        elif num not in renders:
            num = greek = tvm = ""
            gloss = fixed
        elif fixed:
            gloss = fixed
        if rest == "ܡܢ":  # "from", or "who": ܡܢ ܕ… "whoever", or lined up with τίς, ὅς
            after = c.syr[k][wi + 1] if wi + 1 < len(c.syr[k]) else ""
            gloss = "who" if num in ("G5101", "G3739") or (not num and after.startswith("ܕ")) else "from"
    elif num == ARTICLE and rest in PRONOUNS:
        gloss = PRONOUNS[rest]
    elif rest in OR_ELSE and num not in OR_ELSE[rest][1]:
        num, greek, tvm, gloss = "", "", "", OR_ELSE[rest][0]
    elif (m := SUFFIXED.match(rest)) and m.group(1) == "ܥܡ" and "G2992" in c.G[k]:  # ܥܡܝ "my people", λαός
        jj = c.G[k].index("G2992")
        g2 = c.grk[k][jj]
        used.add(jj)
        num, greek, tvm, gloss = g2[1], re.sub(r"[^\w]", "", g2[0]), g2[2], f"{OWNER[OBJECTS[m.group(2)]]} {bare(g2[3])}"
    elif m := SUFFIXED.match(rest):
        base, obj = BASES[m.group(1)], OBJECTS[m.group(2)]
        if not tvm.startswith(("pronoun", "preposition")):
            num = greek = tvm = ""  # lined up with a word it can't be: its own English
            gloss = f"{OWNER[obj]} own" if base == "own" else f"{base} {obj}"
        elif base == "own":
            gloss = f"{OWNER[obj]} own"  # ܕܝܠܟ σου "your own"
        elif tvm.startswith("pronoun") and " acc." in tvm and base == "to":
            gloss = obj  # ܠܗ αὐτόν "him": ܠ marks the object
        else:
            gloss = f"{base} {obj}"  # the Syriac's own pronoun: ܠܗܘܢ "to them", whatever the Greek's (αὐτῷ)
    if gloss in ("", "—"):
        return num, greek, tvm, ""
    # A Greek genitive pronoun near this word's Greek, when the Syriac has the suffix: "your name", "before you".
    if j is not None and not small(rest):
        for jj in (j + 1, j - 1, j + 2, j - 2, j + 3):
            if not 0 <= jj < len(c.grk[k]) or jj in used:
                continue
            g2 = c.grk[k][jj]
            if not (g2[2].startswith("pronoun") and " gen." in g2[2] and rest.endswith(SUFFIX.get(g2[3], ("-",)))):
                continue
            if tvm.startswith("verb") and g2[3] in ("my", "our"):
                continue  # ܢ and ܝ end verbs of the first person too
            gloss = f"{g2[3]} {bare(gloss)}" if tvm.startswith(("noun", "adjective")) else f"{gloss} {POSSESSIVE[g2[3]]}"
            used.add(jj)
            break
    return num, greek, tvm, suffixed(rest, pre, tvm, gloss)


def bare(gloss):
    """A gloss without its article, for a possessive before it: "a people", "my people"."""
    return re.sub(r"^(?:a|an|the) ", "", gloss)


def suffixed(rest, pre, tvm, gloss, prefix=True):
    """A gloss with the word's own pronoun suffix, where the Greek has none (ܥܝܢܝܟܘܢ "your eyes", ܒܪܝ "my son",
    ܩܒܠܘܗܝ "receive him"), and its proclitics ܘ "and" and ܒ "in" before it (not "in" before a verb, whose ܒ is its
    own: ܒܥܐ "seek"). `tvm`: the Greek's grammar, or "" when not known."""
    words = gloss.split()
    have = {w.lower() for w in words}
    if not small(rest) and not have & {"my", "your", "his", "her", "its", "our", "their", "me", "you", "him", "us", "them"}:
        if tvm.startswith("noun") and rest in MINE and MINE[rest] == words[-1].lower():
            words = ["my"] + bare(" ".join(words)).split()
        elif tvm.startswith("noun"):
            for suf, who in OWN_SUFFIX:
                if rest.endswith(suf) and len(rest) - len(suf) >= 2:
                    words = [who] + bare(" ".join(words)).split()
                    break
        elif tvm.startswith("verb") and rest.endswith(("ܘܗܝ", "ܝܗܝ")) and len(rest) >= 5 and not rest.startswith(("ܐܝܬ", "ܠܝܬ")):
            words.append("him")
    if prefix and not (tvm.startswith("preposition") or words[0].lower() in PREPOSITIONS):
        for ch in reversed(pre):
            e = PREFIX.get(ch)
            if e == "in" and (tvm.startswith("verb") or not (tvm or small(rest))):
                continue
            if e and words[0].lower() != e:
                words.insert(0, e)
    return " ".join(words)


# English words the translations' alignment leaves out: they render Syriac small words, prefixes and suffixes.
STOP = set("""a an the of to and in on at by for with from that this these those is are was were be been being am it its
he him his himself she her herself they them their themselves we us our ourselves you your yourselves ye thy thee thou thine
i me my mine myself not no nor as so but or if then there which who whom whose what when where why how shall will would
should may might can could must have has had hath having do does did doth done also unto upon into out up all any every
one ones own very even yet now than too say said saith let lo behold o oh because therefore though while whoever whatever""".split())
TRANSLATIONS = {"murdock.bbli": "Murdock", "etheridge.bbli": "Etheridge"}


def english_words(text):
    """A translation's verse as its words, without what it supplies (in italics) or its markup."""
    text = re.sub(r"<i>.*?</i>", " ", text, flags=re.S)
    return re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)*", re.sub(r"<[^>]+>", " ", html.unescape(text)))


def cached_english(c, name, text):
    """{verse key: {syriac word index: English word}}: Syriac stems and a translation's content words, aligned
    both ways and intersected (one to one, the surest links)."""
    h = hashlib.sha256(f"{ALGORITHM} english {name}".encode())
    for k in c.keys:
        h.update(f"{k}\t{' '.join(c.S[k])}\t{text.get(k, '')}\n".encode())
    p = CACHE / f"english-{h.hexdigest()[:16]}.json"
    if p.is_file():
        return {tuple(map(int, k.split("."))): {int(i): e for i, e in v.items()} for k, v in json.loads(p.read_text()).items()}
    print(f"  aligning {TRANSLATIONS[name]}'s English (both ways)")
    keys, S, E, own, surf = [], {}, {}, {}, {}
    for k in c.keys:
        ws = [w for w in english_words(text.get(k, "")) if w.lower() not in STOP]
        idx = [ti for ti, t in enumerate(c.S[k]) if not t.startswith("+")]
        if not ws or not idx:
            continue
        keys.append(k)
        S[k], own[k] = [c.S[k][ti] for ti in idx], [c.owner[k][ti] for ti in idx]
        E[k], surf[k] = [w.lower() for w in ws], ws
    t_se, t_es = train(S, E, keys), train(E, S, keys)
    out = {}
    for k in keys:
        a1, a2 = viterbi(t_se, S[k], E[k]), viterbi(t_es, E[k], S[k])
        out[k] = {own[k][i]: surf[k][j] for j, i in enumerate(a1) if i is not None and a2[i] == j}
    write_whole(p, json.dumps({".".join(map(str, k)): v for k, v in out.items()}, separators=(",", ":"), ensure_ascii=False))
    return out


def main(into=None):
    """Writes peshitta+.bbli to the modules folder, or to `into` (tools/core bundles it with the app)."""
    for name in ("peshitta.bbli", "byz+.bbli", *TRANSLATIONS):
        if not find(name).is_file():
            sys.exit(f"no {find(name)}; build it first (tools/core/build.py {name.split('.')[0]})")
    pesh, byz = verses("peshitta.bbli"), verses("byz+.bbli")
    c = Corpus(pesh, byz)
    print(f"  {len(c.keys)} verses, {sum(len(c.syr[k]) for k in c.keys)} Syriac words, {sum(len(c.G[k]) for k in c.keys)} Greek")
    L = cached_links(c)
    chosen = choose(c, L)

    # 1. The Greek each word is lined up with in its verse.
    res, used = {}, {}
    for k in c.keys:
        used[k] = set(chosen[k].values())
        for wi, w in enumerate(c.syr[k]):
            num, greek, tvm, gloss = english(c, k, wi, w, chosen[k], used[k])
            res[(k, wi)] = (num, greek, tvm, gloss, "greek" if gloss else None)

    # 2. A word left without English takes the Greek it is surely lined up with elsewhere in the NT, when the verse's
    #    Greek hasn't that word (where it has, another Syriac word renders it): its commonest English there, marked
    #    as from elsewhere. By its form, else (more strictly) by its stem.
    occurs, linked = Counter(), defaultdict(Counter)
    glosses = defaultdict(Counter)
    for (k, wi), r in res.items():
        rest = c.seg[c.syr[k][wi]][1]
        st = c.S[k][[ti for ti, o in enumerate(c.owner[k]) if o == wi][-1]]
        occurs[("form", rest)] += 1
        occurs[("stem", st)] += 1
        if r[4] == "greek" and r[0] and not small(rest):
            for key in (("form", rest), ("stem", st)):
                linked[key][r[0]] += 1
                tv = r[2].split(" · ")[0]
                glosses[(key, r[0])][(re.sub(r"^(and |in )+", "", r[3]), tv)] += 1

    def sure(key, at_least, share):
        if key not in linked:
            return None
        (num, n), = linked[key].most_common(1)
        total = sum(linked[key].values())
        return num if n >= at_least and n / total >= share and total / occurs[key] >= 0.4 else None

    stats = Counter()
    for k in c.keys:
        for wi, w in enumerate(c.syr[k]):
            if res[(k, wi)][4]:
                continue
            pre, rest = c.seg[w]
            if small(rest):
                continue
            key = ("form", rest)
            num = sure(key, 3, 0.6)
            if not num or rest in HOMOGRAPHS or num in c.G[k]:  # where the verse's Greek has it, another word renders it
                continue
            # A content word of the verse's Greek left over near this word's place: what it renders, most likely.
            g, n = c.G[k], len(c.syr[k])
            near = [j for j in range(len(g)) if j not in used[k] and abs(j / len(g) - wi / n) <= 0.15
                    and g[j] not in SMALL_GREEK and not c.grk[k][j][2].startswith(("pronoun", "preposition", "article"))]
            if near:
                stats["left: Greek left over near it"] += 1
                continue
            (gl, tv), _ = glosses[(key, num)].most_common(1)[0]
            res[(k, wi)] = (num, "", "not in this verse's Greek: as the word is elsewhere", suffixed(rest, pre, tv, gl), "elsewhere")
            stats["Greek elsewhere"] += 1

    # 3. Still without English: the English of Murdock's and Etheridge's translations of the Peshitta, where it is
    #    sure: it is the word's commonest English in them over the NT (twice at least, and 30% of the time), and both
    #    put it there, or one does and it is that word's English 3 times or more.
    tr = {name: cached_english(c, name, verses(name)) for name in TRANSLATIONS}
    types, cap = defaultdict(Counter), Counter()
    for al in tr.values():
        for k, m in al.items():
            for wi, e in m.items():
                types[c.seg[c.syr[k][wi]][1]][e.lower()] += 1
                cap[(e.lower(), e[0].isupper())] += 1
    for k in c.keys:
        for wi, w in enumerate(c.syr[k]):
            if res[(k, wi)][4]:
                continue
            pre, rest = c.seg[w]
            if small(rest):
                continue
            got = [(name, tr[name].get(k, {}).get(wi)) for name in TRANSLATIONS]
            got = [(n, e.lower()) for n, e in got if e]
            t = types[rest]
            if not got or not t:
                continue
            top, n = t.most_common(1)[0]
            both = len(got) == 2 and got[0][1] == got[1][1]
            pick = next((x for x in got if x[1] == top), None)
            if not pick or n < 2 or n / sum(t.values()) < 0.3 or not (both or n >= 3):
                continue
            e = top.capitalize() if cap[(top, True)] > 4 * cap[(top, False)] else top
            e = {"Jeshu": "Jesus"}.get(e, e)  # Etheridge's spelling
            who = "Murdock's and Etheridge's translations" if both else f"{TRANSLATIONS[pick[0]]}'s translation"
            res[(k, wi)] = ("", "", f"English from {who} of the Peshitta", suffixed(rest, pre, "", e), "translation")
            stats["translations"] += 1
    print("  added: " + ", ".join(f"{n} {v}" for v, n in sorted(stats.items())))

    out, words, glossed, numbered = [], 0, 0, 0
    for k, text in pesh.items():
        if k not in chosen:
            out.append((*k, html.escape(text, quote=False).strip()))
            continue
        parts, last, wi = [], 0, 0
        for m in WORD.finditer(text):
            w = m.group()
            if not LETTERS.search(w):
                continue
            parts.append(html.escape(text[last:m.start()], quote=False))
            num, greek, tvm, gloss, _ = res[(k, wi)]
            words += 1
            if gloss:
                glossed += 1
                numbered += bool(num)
                esc = lambda x: html.escape(x, quote=False)  # noqa: E731
                inner = "".join(f"<{tag}>{esc(x)}</{tag}>" for tag, x in (("num", num), ("tvm", tvm), ("grk", greek)) if x)
                if not (tvm or greek) and num:
                    inner = f"<num>{num}</num>"
                if not tvm and greek:  # the lemma's <grk> must follow the word's: a <tvm> between them, even empty
                    inner = inner.replace("<grk>", "<tvm></tvm><grk>", 1)
                parts.append(f"<div><grk>{w}</grk>{inner}<gra>{esc(gloss)}</gra></div>")
            else:
                parts.append(w)
            last = m.end()
            wi += 1
        parts.append(html.escape(text[last:], quote=False))
        # a div brings its own space: drop the single spaces between two of them
        s = re.sub(r"</div> (?=<div>)", "</div>", "".join(parts)).strip()
        if "<div>" in s and "<tvm>" not in s:  # the app reads a verse as interlinear by its <tvm>
            s = s.replace("<gra>", "<tvm></tvm><gra>", 1)
        out.append((*k, s))
    print(f"  {glossed} of {words} words with English ({glossed / words:.1%}), {numbered} with a Strong's number ({numbered / words:.1%})")

    info = verses_info().replace("<p>Public Domain.</p>", "")  # the module's About already says so
    about = (info + "<p>This edition shows each Syriac word with the Strong's number, grammar and English of the Greek word it "
             "translates, in Robinson and Pierpont's Byzantine text (public domain) as Byz+ has it: Strong's numbers from "
             "STEPBible's TAGNT and English from STEPBible's TBESG (Tyndale House, CC BY 4.0, "
             "https://github.com/STEPBible/STEPBible-Data). The words were lined up with the Greek by a statistical word "
             "alignment over the whole New Testament, so the English is the Greek's, not a Syriac dictionary's; the grammar "
             "shown is the Greek word's. A word the verse's Greek doesn't render takes the Greek it renders elsewhere in the "
             "New Testament, or else the English of James Murdock's (1852) or John Wesley Etheridge's (1846–49) translations of "
             "the Peshitta (public domain), lined up with it in the same way; its tooltip says so. Most words are right, some "
             "are not, and a word with no clear counterpart is left without English "
             f"({glossed / words:.0%} of the words have it). Built by Two-edged Sword's tools/syriac.</p>")
    with module("peshitta+.bbli", "Syriac Peshitta w/ Greek glosses", "Peshitta+", about, ot=False, strongs=True, rtl=True, into=into) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    print(f"peshitta+.bbli: {len(out)} verses")


def verses_info():
    db = sqlite3.connect(f"file:{find('peshitta.bbli')}?immutable=1", uri=True)
    try:
        return db.execute("SELECT Information FROM Details").fetchone()[0]
    finally:
        db.close()


if __name__ == "__main__":
    main()
