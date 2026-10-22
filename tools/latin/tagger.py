# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Which of a Latin word's analyses fits its sentence: three small taggers (part of speech; case and
number; a verb's form, mood, tense, voice and person), each an averaged perceptron in plain Python,
trained on the Universal Dependencies Latin treebanks that are openly licensed: LLCT (the Late Latin
Charter Treebank, early medieval charters from Lucca) and CIRCSE (prose and poetry annotated at
CIRCSE, Milan), both CC BY-SA 4.0. Each word's features include what Collatinus says it may be, and a tagger chooses only among
the labels those analyses allow, so it learns to tell apart the readings the dictionary gives.

    t = Taggers.load_or_train(lexicon, treebank_files, cache_folder)
    t.tag(words) → [{"upos": {label: p}, "nomi": {...}, "verbl": {...}}] per word

The trained weights are kept as gzipped JSON in the cache, named by a hash of the treebanks, the
Collatinus files and this file, so they are trained again only when one of those changes (about ten
minutes). Training is seeded, so the same inputs give the same weights.
"""
import gzip, hashlib, json, math, random, re
from collections import defaultdict
from pathlib import Path

VERSION = 1

POSMAP = {"n": {"NOUN", "PROPN"}, "a": {"ADJ", "DET", "NUM"}, "m": {"NUM", "ADJ"}, "v": {"VERB", "AUX"}, "p": {"PRON", "DET"},
          "r": {"ADP", "ADV"}, "d": {"ADV", "PART", "SCONJ", "CCONJ"}, "c": {"CCONJ", "SCONJ", "ADV", "PART"}, "i": {"INTJ"}}
UPOS = ["NOUN", "PROPN", "VERB", "AUX", "ADJ", "DET", "PRON", "NUM", "ADV", "PART", "ADP", "CCONJ", "SCONJ", "INTJ", "X", "PUNCT"]


def upos_set(a) -> set:
    s = set()
    for c in a.lemma.pos:
        s |= POSMAP.get(c, set())
    if a.feats.get("VerbForm") in ("Part", "Gdv"):
        s |= {"ADJ", "NOUN"}
    return s


def nomi(f) -> str:
    return f"{f['Case']}|{f.get('Number', '_')}" if f.get("Case") else "_"


def verbl(f) -> str:
    vf = f.get("VerbForm")
    if not vf:
        return "_"
    if vf == "Fin":
        return f"Fin|{f.get('Mood')}|{f.get('TA')}|{f.get('Voice')}|{f.get('Person')}{f.get('Number', '')[:1]}"
    return f"{vf}|{f.get('TA', '')}|{f.get('Voice', '')}"


def ud_ta(f) -> str:
    """UD's Tense and Aspect as one word, as Collatinus's morphologies give it."""
    t, a, vf = f.get("Tense"), f.get("Aspect"), f.get("VerbForm")
    if vf in ("Ger", "Gdv", "Sup"):
        return ""
    if vf == "Part":
        return {"Perf": "perf", "Prosp": "fut"}.get(a, "pres")
    return {("Pres", "Imp"): "pres", ("Past", "Imp"): "impf", ("Fut", "Imp"): "fut", ("Past", "Perf"): "perf",
            ("Pqp", "Perf"): "plupf", ("Pqp", None): "plupf", ("Fut", "Perf"): "futpf", ("Pres", None): "pres",
            ("Fut", None): "fut", ("Past", None): "perf", (None, "Perf"): "perf", (None, "Imp"): "pres", (None, "Prosp"): "fut"}.get((t, a), "")


def read_conllu(path):
    """[[(form, lemma, upos, feats)]], one list per sentence; multiword-token lines are skipped."""
    sents, cur = [], []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            if cur:
                sents.append(cur)
                cur = []
            continue
        if line.startswith("#"):
            continue
        c = line.split("\t")
        if len(c) < 6 or not c[0].isdigit():
            continue
        f = dict(kv.split("=", 1) for kv in c[5].split("|") if "=" in kv)
        f["TA"] = ud_ta(f)
        if f.get("VerbForm") == "Fin" and f.get("Mood") == "Imp":
            f["TA"] = "fut" if f.get("Tense") == "Fut" else "pres"
        cur.append((c[1], c[2], c[3], f))
    if cur:
        sents.append(cur)
    return sents


class Perceptron:
    def __init__(self):
        self.w = defaultdict(dict)   # feature → {label: weight}
        self._tot = defaultdict(float)
        self._ts = defaultdict(int)
        self.i = 0

    def scores(self, feats, labels):
        s = dict.fromkeys(labels, 0.0)
        for f in feats:
            ws = self.w.get(f)
            if ws:
                for l, v in ws.items():
                    if l in s:
                        s[l] += v
        return s

    def update(self, truth, guess, feats):
        self.i += 1
        if truth == guess:
            return
        for f in feats:
            ws = self.w[f]
            for l, d in ((truth, 1.0), (guess, -1.0)):
                k = (f, l)
                v = ws.get(l, 0.0)
                self._tot[k] += (self.i - self._ts[k]) * v
                self._ts[k] = self.i
                ws[l] = v + d

    def average(self):
        for f, ws in self.w.items():
            for l, v in list(ws.items()):
                k = (f, l)
                tot = self._tot[k] + (self.i - self._ts[k]) * v
                a = round(tot / max(self.i, 1), 4)
                if a:
                    ws[l] = a
                else:
                    del ws[l]
        self.w = {f: ws for f, ws in self.w.items() if ws}
        self._tot, self._ts = None, None


COPULA = {"est", "sunt", "erat", "erant", "esse", "fuit", "fuerunt", "es", "sum", "estis", "sumus", "eris", "erit", "erunt", "sit", "sint", "esset", "essent", "fiat", "factum", "factus", "facta"}


class Taggers:
    NAMES = ("upos", "nomi", "verbl")

    def __init__(self, lexicon):
        self.lex = lexicon
        self.p = {n: Perceptron() for n in self.NAMES}
        self.labels = {n: set() for n in self.NAMES}

    # ---- features ----

    def _prep(self, words):
        """Per word: its key, its analyses and what they allow."""
        out = []
        for w in words:
            k = re.sub(r"[^a-z]", "", self.lex.key(w) if hasattr(self.lex, "key") else w.lower())
            an = self.lex.analyse(w) if k else []
            ups = set()
            for a in an:
                ups |= upos_set(a)
            if w[:1].isupper():
                ups.add("PROPN")
            if not k:
                ups = {"PUNCT"} if not re.search(r"\w", w) else ups
            out.append(dict(w=w, k=k or w, an=an, ups=ups,
                            nomis={nomi(a.feats) for a in an} | {"_"},
                            verbls={verbl(a.feats) for a in an if "v" in a.lemma.pos} | {"_"},
                            preps=any("r" in a.lemma.pos for a in an)))
        return out

    def _feats(self, toks, i, name, prev, uposs):
        t = toks[i]
        k = t["k"]
        f = ["b", "w=" + k, "s1=" + k[-1:], "s2=" + k[-2:], "s3=" + k[-3:], "s4=" + k[-4:], "p3=" + k[:3],
             "cap=%d" % t["w"][:1].isupper(), "first=%d" % (i == 0), "n=%d" % min(len(t["an"]), 4),
             "A=" + "|".join(sorted(t["ups"])), "N=" + "|".join(sorted(t["nomis"])), "V=" + "|".join(sorted(t["verbls"]))]
        f += ["a=" + x for x in t["ups"]] + ["nn=" + x for x in t["nomis"]] + ["vv=" + x for x in t["verbls"]]
        for d in (-2, -1, 1, 2):
            j = i + d
            if 0 <= j < len(toks):
                u = toks[j]
                f += [f"{d}w=" + u["k"], f"{d}s3=" + u["k"][-3:]]
                if abs(d) == 1:
                    f += [f"{d}A=" + "|".join(sorted(u["ups"])), f"{d}N=" + "|".join(sorted(u["nomis"])), f"{d}s2=" + u["k"][-2:],
                          f"{d}w|w=" + u["k"] + "|" + k]
            else:
                f.append(f"{d}<>")
        f.append("t-1=" + (prev[-1] if prev else "<s>"))
        f.append("t-2=" + (prev[-2] if len(prev) > 1 else "<s>") + "|" + (prev[-1] if prev else "<s>"))
        if name != "upos":
            for d in (-1, 0, 1):
                j = i + d
                f.append(f"u{d}=" + (uposs[j] if 0 <= j < len(toks) else "<>"))
            f.append("u0|w=" + uposs[i] + "|" + k[-3:])
            # the nearest preposition before, within three words
            for j in range(i - 1, max(-1, i - 4), -1):
                if toks[j]["preps"] and uposs[j] == "ADP":
                    f.append("prep=" + toks[j]["k"])
                    break
            f.append("cop=%d" % any(u["k"] in COPULA for u in toks))
            # whether another word of the verse can only be a nominative, or only an accusative
            for case in ("Nom", "Acc", "Dat"):
                only = any(j != i and toks[j]["an"] and all(n.startswith(case) for n in toks[j]["nomis"] - {"_"}) and toks[j]["nomis"] - {"_"}
                           for j in range(len(toks)))
                f.append(f"only{case}=%d" % only + "|" + "|".join(sorted(t["nomis"]))[:40])
            # the nearest verb before and after
            for rng, tag in ((range(i - 1, -1, -1), "vb<"), (range(i + 1, len(toks)), "vb>")):
                for j in rng:
                    if uposs[j] in ("VERB", "AUX"):
                        f.append(tag + "=" + toks[j]["k"][-3:])
                        f.append(tag + "w=" + toks[j]["k"])
                        f.append(tag + "d=%d" % min(abs(j - i), 4))
                        break
                else:
                    f.append(tag + "=none")
        return f

    def _allowed(self, t, name):
        if name == "upos":
            return t["ups"] or self.labels["upos"]
        if name == "nomi":
            return t["nomis"] if t["an"] else self.labels["nomi"]
        return t["verbls"] if t["an"] else self.labels["verbl"]

    # ---- training ----

    def train(self, sents, iterations=6, log=print):
        gold = {"upos": lambda x: x[2], "nomi": lambda x: nomi(x[3]),
                "verbl": lambda x: verbl(x[3]) if x[2] in ("VERB", "AUX") else "_"}
        prepped = [(self._prep([x[0] for x in s]), s) for s in sents]
        for name in self.NAMES:
            self.labels[name] = {gold[name](x) for s in sents for x in s}
        rnd = random.Random(1)
        for name in self.NAMES:
            p = self.p[name]
            order = list(range(len(prepped)))
            for it in range(iterations):
                rnd.shuffle(order)
                right = total = 0
                for si in order:
                    toks, s = prepped[si]
                    uposs = [x[2] for x in s]
                    prev = []
                    for i, x in enumerate(s):
                        truth = gold[name](x)
                        labels = set(self._allowed(toks[i], name)) | {truth}
                        fs = self._feats(toks, i, name, prev, uposs)
                        sc = p.scores(fs, labels)
                        guess = max(sorted(sc), key=sc.get)
                        p.update(truth, guess, fs)
                        right += guess == truth
                        total += 1
                        prev.append(guess)
                log(f"  {name} pass {it + 1}: {right / max(total, 1):.1%} of {total}")
            p.average()

    # ---- use ----

    def tag(self, words):
        """Per word, {tagger: {label: probability}} among the labels its analyses allow."""
        toks = self._prep(words)
        out = [dict() for _ in toks]
        uposs = []
        for name in self.NAMES:
            prev = []
            for i in range(len(toks)):
                labels = self._allowed(toks[i], name)
                sc = self.p[name].scores(self._feats(toks, i, name, prev, uposs), labels)
                m = max(sc.values())
                ex = {l: math.exp(v - m) for l, v in sc.items()}
                z = sum(ex.values())
                out[i][name] = {l: v / z for l, v in ex.items()}
                prev.append(max(sorted(sc), key=sc.get))
            if name == "upos":
                uposs = prev
        return out

    # ---- keeping ----

    def save(self, path):
        data = {"version": VERSION, "labels": {n: sorted(v) for n, v in self.labels.items()}, "w": {n: self.p[n].w for n in self.NAMES}}
        tmp = Path(str(path) + ".part")
        with gzip.open(tmp, "wt", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"), sort_keys=True)
        tmp.replace(path)

    @classmethod
    def load(cls, lexicon, path):
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            data = json.load(fh)
        t = cls(lexicon)
        t.labels = {n: set(v) for n, v in data["labels"].items()}
        for n in cls.NAMES:
            t.p[n].w = data["w"][n]
        return t

    @classmethod
    def load_or_train(cls, lexicon, treebanks, inputs, folder, log=print):
        """The taggers trained on `treebanks` (CoNLL-U files), from the cache in `folder` when the
        same `inputs` (treebanks, Collatinus files, this file) trained them before."""
        h = hashlib.sha256(str(VERSION).encode())
        for p in [*treebanks, *inputs, Path(__file__)]:
            h.update(Path(p).read_bytes())
        path = Path(folder) / f"taggers-{h.hexdigest()[:16]}.json.gz"
        if path.is_file():
            return cls.load(lexicon, path)
        # punctuation is left out, as the verses are tagged without it
        sents = [[x for x in s if x[2] != "PUNCT"] for p in treebanks for s in read_conllu(p)]
        sents = [s for s in sents if s]
        log(f"  training the taggers on {sum(len(s) for s in sents)} words (once; kept in {path.name})")
        t = cls(lexicon)
        t.train(sents, log=log)
        path.parent.mkdir(parents=True, exist_ok=True)
        for old in path.parent.glob("taggers-*.json.gz"):
            old.unlink()
        t.save(path)
        return t
