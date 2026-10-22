# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds clementine+.bbli ("Latin Vulgate (Clementine) w/ glosses", Vulg-C+) from clementine.bbli:
each word with its English meaning, dictionary form and grammar, as the Greek interlinears are, from
openly licensed sources only, so the app can ship it.

    python3 tools/latin/clementine.py

Reads clementine.bbli (tools/vulgate builds it) and writes clementine+.bbli beside it in the library,
or into `into` (tools/core builds it into the app, inside modules.shipping()).

- What a word may be: Collatinus's lexicon (GPL; tools/latin/collatinus.py reads it).
- Which of those it is here: three small taggers trained on the openly licensed Latin treebanks of
  Universal Dependencies, LLCT and CIRCSE (CC BY-SA 4.0) (tools/latin/tagger.py), with how often each
  lemma comes in those treebanks and how often the Clementine itself has it where a word can be only
  that lemma.
- The English: the short table in tools/latin/build.py (MEANINGS and the pronouns, the Bible's sense
  where a dictionary's first is another), then the first sense in Collatinus's English lexicon, then
  William Whitaker's WORDS (free "for whatever purpose").
- Strong's numbers: borrowed from WLC+, Byz+ and LXX+ by aligning the verses word by word, lemma by
  Strong's number (tools/latin/strongs.py).
- Then a few rules: a participle is shown under its verb (locutus under loquor, factum under facio,
  not fio), -que/-ve are split off and put before the meaning ("and"/"or"), and a name the lexicon
  hasn't is shown under its nominative where the text has one (Jesum under Jesus).

Lemmas are shown in Collatinus's spelling without its quantity marks, which is the Clementine's
(verbum, justitia). Nothing reads an e-Sword module or a non-commercial source. Latin+ (from e-Sword's
latin.bbli) is built by tools/latin/build.py, for the user's own library only.

Downloads (taken at a fixed commit, checked against their sha256) and the trained taggers are kept
in ~/Library/Caches/Two-edged Sword/latin.
"""
import html, math, re, sqlite3, sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from modules import CACHES, fetch, find, module  # noqa: E402
from latin import build as plus  # noqa: E402  (the gloss tables, grammar wording and verse splitting Latin+ uses)
from latin import collatinus, strongs  # noqa: E402
from latin.tagger import COPULA, Taggers, nomi, read_conllu, upos_set, verbl  # noqa: E402

CACHE = CACHES / "latin"
TITLE, ABBREV = "Latin Vulgate (Clementine) w/ glosses", "Vulg-C+"
UD = "https://raw.githubusercontent.com/UniversalDependencies/UD_Latin-{0}/{1}/la_{2}-ud-{3}.conllu"
TREEBANKS = {
    ("LLCT", "173cd1133e70f1a95a8608091792f91ebe001157"): {
        "train": "8aabc8735c7a623a9e4820e13861a87459dd0fb5b2d238f0583854143526a643",
        "dev": "040457f2e47265a5676c83ce236e1d625af41eda8f779812841e8ba84e28480c",
        "test": "81d9f57de66d83303ad4df54a60cd445ac089b50070d369831a632b4cf948e64"},
    ("CIRCSE", "44b969c352534e7ee3beef0cabf2733d9d2af364"): {
        "train": "09c44e9453745d9123739c33d12dbcd4fd0f775434d36ab238a6e94179ecf1e8",
        "dev": "66ccb9cb359227474228cda4164bd99158452471051d91894afc3fdb53164bbc",
        "test": "51be34d895fcc372c04a44bba20fbec9463c76fc1e3297b0a7acd4262cbfe4b5"},
}
DICTLINE_SHA = "8f6c0fc84d12859abc863eac84ddd49b7e039503855ca34c1d44a6e78abf7569"

# Words whose lemma the rules below can't find: the word → its lemma (Collatinus's key).
LEMMA = {
    "ait": "ajo", "aiunt": "ajo", "aiebat": "ajo", "aiebant": "ajo", "inquit": "inquam", "inquiunt": "inquam",
    "vade": "vado", "vadit": "vado", "vadunt": "vado", "vadam": "vado", "vadens": "vado", "vado": "vado", "vadis": "vado",
    "vadite": "vado", "vadentes": "vado", "vadebat": "vado", "vadimus": "vado",
    "nonne": "nonne", "nam": "nam", "sive": "sive", "porro": "porro", "ecce": "ecce", "amen": "amen", "secundum": "secundum",
}
# Words that are a word and an enclitic though the lexicon has them whole: the word → the word without it.
SPLIT = {"cumque": ("cum", "que"), "mecum": ("me", "cum"), "tecum": ("te", "cum"), "secum": ("se", "cum"),
         "nobiscum": ("nobis", "cum"), "vobiscum": ("vobis", "cum")}
# Parts of speech the lexicon leaves out.
POS = {"secundum": "r", "inquam": "v", "nolite": "v"}
# Lemmas shown as another: a variant spelling or form, or an active verb whose deponent is the usual one.
SHOW = {
    "thronos": "thronus", "prophetes": "propheta", "parabole": "parabola", "saluos": "salvus", "agnos": "agnus", "uinus": "vinum",
    "nolite": "nolo", "reuerto": "revertor", "misereo": "misereor", "laeto": "laetor", "fornico": "fornicor", "sequo": "sequor",
    "opero": "operor", "altar": "altare", "multi": "multus", "oporteo": "oportet", "coepio": "coepi", "se": "sui", "senior": "senex",
    "fio": "facio", "hii": "hic",
}
# Lemmas the taggers pick for a Bible word only when nothing else fits (rare words that share a form).
UNLIKELY = {"edo", "carus2", "carus", "nes", "malum2", "uas", "mare2", "carna", "caro2", "porrum", "lego2", "chorda", "ios",
            "helius", "mius", "estus", "milium", "mas", "era", "manes", "dedo", "meio2", "meum", "secundus2", "marius2", "maria2"}
# Participles that are shown as adjectives of their own (holy, not hallowed).
ADJECTIVES = {"sanctus", "certus", "rectus", "altus", "falsus", "tacitus", "dilectus", "electus", "notus"}
# A name's other cases, as the Vulgate declines them (the ending, the nominative's ending).
NAME_ENDINGS = [("um", "us"), ("i", "us"), ("o", "us"), ("e", "us"), ("am", "a"), ("ae", "a"), ("am", "as"), ("ae", "as"),
                ("en", "es"), ("em", "es"), ("is", "es"), ("i", "es"), ("e", "es"), ("is", ""), ("i", ""), ("em", ""), ("um", "")]


LEMMA_KEYS = {collatinus.key(k): collatinus.key(v) for k, v in LEMMA.items()}
SPLIT_KEYS = {collatinus.key(k): v for k, v in SPLIT.items()}


def downloads():
    """The Collatinus folder, the treebanks and Whitaker's dictionary, fetched once into the cache."""
    folder = collatinus.data(CACHE / "collatinus")
    banks = []
    for (name, commit), files in TREEBANKS.items():
        for split, sha in files.items():
            banks.append(fetch(UD.format(name, commit, name.lower(), split), CACHE / "ud" / f"la_{name.lower()}-ud-{split}.conllu", sha256=sha))
    fetch(plus.DICTLINE, plus.CACHE / "DICTLINE.GEN", sha256=DICTLINE_SHA)
    return folder, banks


def first_sense(s):
    """A dictionary sense as a short gloss: the first of the first sense, without notes."""
    s = re.sub(r"\[.*?\]|\(.*?\)|\bw/\S+|\bcf\..*", "", s or "")
    s = s.strip(" -").split(";")[0]
    s = re.split(r"[,/:]", s)[0].strip(" -.").replace("_", " ")
    s = re.sub(r"^(?:to |a |an |the )", "", s, flags=re.I).strip()
    s = re.sub(r"\s+", " ", s)
    return s if re.search(r"[a-z]", s, re.I) and len(s) <= 28 else ""


class Glosser:
    def __init__(self, lex):
        self.en = {k: first_sense(v) for k, v in lex.english().items()}
        self.whitaker = plus.whitaker()

    def __call__(self, lemma_form, lemma_key, upos, feats):
        base = plus.norm(lemma_form)
        f = ud_feats(feats, upos)
        if base in plus.PRONOUNS or base == "is" or base in plus.MEANINGS:
            m = plus.meaning(base, upos, {}, f)
            if m:
                return m
        g = self.en.get(lemma_key) or self.en.get(re.sub(r"\d+$", "", lemma_key))
        if upos == "PROPN" or lemma_form[:1].isupper():
            # a name: its English name (Moses), else itself; Collatinus's other notes on names aren't glosses ("roi de Juda")
            return g if g and re.fullmatch(r"[A-Z][a-z]+", g) else lemma_form
        if g:
            return g
        return plus.meaning(base, upos, self.whitaker, f) or (lemma_form if lemma_form[:1].isupper() else "")


def ud_feats(f, upos):
    """Our features as the UD string plus.grammar() and plus.meaning() read."""
    out = {k: f[k] for k in ("Case", "Gender", "Number", "Person", "Mood", "VerbForm", "Voice") if f.get(k)}
    ta = f.get("TA")
    if ta:
        out.update({"pres": {"Tense": "Pres"}, "impf": {"Tense": "Past", "Aspect": "Imp"}, "fut": {"Tense": "Fut"},
                    "perf": {"Tense": "Past"}, "plupf": {"Tense": "Pqp"}, "futpf": {"Tense": "Fut", "Aspect": "Perf"}}[ta])
    return "|".join(f"{k}={v}" for k, v in sorted(out.items()))


def grammar(upos, f):
    g = plus.grammar(upos, ud_feats(f, upos))
    if f.get("TA") == "futpf":
        g = g.replace("future", "future perfect", 1)
    return g


class Chooser:
    """Picks each word's analysis from the taggers' probabilities, the lemma counts and the rules."""

    def __init__(self, lex, taggers, ud_counts, own_counts, names):
        self.lex, self.t, self.ud, self.own, self.names = lex, taggers, ud_counts, own_counts, names

    def spelled(self, form, word):
        """A lemma in the word's spelling of its prefix: afflictio, not adflictio, for afflictionem."""
        f = collatinus.key(form)
        for x, y in self.lex.assims:
            if f.startswith(x) and word.startswith(y) and not word.startswith(x):
                return y + form[len(x):]
        return form

    def prior(self, lemma):
        return self.ud.get(re.sub(r"\d+$", "", lemma.key), 0) + self.own.get(lemma.key, 0)

    def choose(self, words):
        """[(upos, feats, lemma form, lemma key, enclitic)] for the words of a verse."""
        probs = self.t.tag(words)
        keys = [collatinus.key(w) for w in words]
        # a verse whose only finite verbs are "be" or passive has no object: an ambiguous noun is its subject
        fin = [max(p["verbl"], key=p["verbl"].get) for p in probs]
        objectless = not any(v.startswith("Fin|") and "|Act|" in v and k not in COPULA for v, k in zip(fin, keys))
        out = []
        for i, w in enumerate(words):
            p = probs[i]
            k = collatinus.key(w)
            an = self.lex.analyse(w)
            if k in SPLIT_KEYS:
                word, enc = SPLIT_KEYS[k]
                an = [collatinus.Analysis(a.lemma, a.feats, a.morpho, enc) for a in self.lex.analyse(word)
                      if enc != "cum" or a.feats.get("Case") == "Abl"]
            if k in LEMMA_KEYS and LEMMA_KEYS[k] in self.lex.lemmas:
                forced = [a for a in an if a.lemma.key == LEMMA_KEYS[k]]
                if forced:
                    an = forced
                else:
                    lem = self.lex.lemmas[LEMMA_KEYS[k]]
                    an = [collatinus.Analysis(lem, {}, 416)]
            if not an:
                lemma = self.names.get(k, w if w[:1].isupper() else w.lower())
                upos = "PROPN" if w[:1].isupper() else max(p["upos"], key=p["upos"].get)
                out.append((upos, {}, lemma, collatinus.key(lemma), ""))
                continue
            part = any(a.feats.get("VerbForm") == "Part" for a in an if "v" in a.lemma.pos)
            cases = {a.feats.get("Case") for a in an}
            common = {a.lemma.form.lower() for a in an if not a.lemma.proper}
            beside_be = any(keys[j] in COPULA for j in range(max(0, i - 2), min(len(keys), i + 3)) if j != i)

            def score(a):
                ups = upos_set(a)
                if a.lemma.proper:
                    ups = ups | {"PROPN"}
                pu = sum(v for l, v in p["upos"].items() if l in ups)
                # an adjective used as a noun, or a noun as an adjective (veri adoratores, justorum), is still that word
                if ups & {"ADJ", "NOUN"}:
                    pu += 0.5 * sum(v for l, v in p["upos"].items() if l in {"ADJ", "NOUN"} - ups)
                s = math.log(pu + 1e-4) + math.log(p["nomi"].get(nomi(a.feats), 0) + 1e-3)
                if "v" in a.lemma.pos:
                    s += math.log(p["verbl"].get(verbl(a.feats), 0) + 1e-3)
                s += 0.5 * math.log(1 + self.prior(a.lemma))
                if a.lemma.key in UNLIKELY:
                    s -= 4
                if a.lemma.proper and not w[:1].isupper():
                    s -= 3
                # a name over a common word only where the name is its own word (Maria, not mare), not Deus or Terra
                if a.lemma.proper and w[:1].isupper() and i > 0 and a.lemma.form.lower() not in common:
                    s += 1.5
                if a.lemma.proper and a.lemma.form.lower() in common:
                    s -= 1
                # a participle is shown under its verb, not as a noun or adjective of its own (locutus, mortuus)
                if (part and "v" not in a.lemma.pos and a.lemma.pos[:1] in ("n", "a") and a.lemma.key.rstrip("0123456789").endswith("us")
                        and a.lemma.key not in ADJECTIVES):
                    s -= 3
                if a.enclitic:
                    s -= 0.5
                # a participle beside a form of "be" is a verb's (facta sunt, factum est), not a noun
                if part and beside_be:
                    s += 2 if a.feats.get("VerbForm") == "Part" and "v" in a.lemma.pos else -2
                if objectless and a.feats.get("Case") in ("Nom", "Acc") and {"Nom", "Acc"} <= cases:
                    s += 2 if a.feats["Case"] == "Nom" else -1
                return s

            a = max(an, key=lambda a: (score(a), -a.morpho))
            ups = upos_set(a) | ({"PROPN"} if a.lemma.proper else set())
            if not a.lemma.proper:
                ups.discard("PROPN")  # Deus and Dominus are nouns, though written with a capital
            upos = max(sorted(ups), key=lambda l: p["upos"].get(l, 0)) if ups else max(p["upos"], key=p["upos"].get)
            if a.lemma.proper and upos in ("NOUN", "ADJ", "X"):
                upos = "PROPN"
            if upos == "PART":
                upos = "ADV"  # non, autem, enim: shown as adverbs
            f = dict(a.feats)
            if "n" in a.lemma.pos and a.lemma.gender and "Gender" not in f:
                f["Gender"] = a.lemma.gender
            lemma_key, form = a.lemma.key, a.lemma.form
            if lemma_key in SHOW and not (lemma_key == "fio" and f.get("VerbForm") != "Part"):
                form = SHOW[lemma_key]
                lemma_key = collatinus.key(form) if collatinus.key(form) in self.lex.lemmas else lemma_key
            out.append((upos, f, self.spelled(form, k), lemma_key, a.enclitic))
        return out


def name_lemmas(lex, verses):
    """{key of a name the lexicon hasn't: its nominative} where the text has that nominative too."""
    caps = Counter()
    for ps in verses:
        for kind, text in ps:
            if kind == "word" and text[:1].isupper() and not lex.analyse(text):
                caps[text] += 1
    have = set(caps)
    out = {}
    for w in caps:
        for end, nom in NAME_ENDINGS:
            if w.endswith(end) and len(w) > len(end) + 2:
                cand = w[: -len(end)] + nom
                if cand != w and cand in have:
                    out[collatinus.key(w)] = cand
                    break
    return out


def own_counts(lex, verses):
    """{lemma key: how often a word of the text can be only that lemma}."""
    c = Counter()
    for ps in verses:
        for kind, text in ps:
            if kind == "word":
                ks = {a.lemma.key for a in lex.analyse(text)}
                if len(ks) == 1:
                    c[ks.pop()] += 1
    return c


def ud_counts(banks):
    c = Counter()
    for p in banks:
        for s in read_conllu(p):
            for form, lemma, upos, f in s:
                if upos != "PUNCT":
                    c[collatinus.key(lemma)] += 1
    return c


def setup(verses):
    """The lexicon, glosser and chooser, the taggers trained (or read from the cache)."""
    folder, banks = downloads()
    lex = collatinus.Lexicon(folder)
    inputs = [folder / n for n in collatinus.FILES] + [Path(collatinus.__file__)]
    taggers = Taggers.load_or_train(lex, banks, inputs, CACHE / "taggers")
    for k, p in POS.items():
        if k in lex.lemmas:
            lex.lemmas[collatinus.key(k)].pos = p
    chooser = Chooser(lex, taggers, ud_counts(banks), own_counts(lex, verses), name_lemmas(lex, verses))
    return lex, Glosser(lex), chooser


ABOUT = ("<p>This edition shows each word of the Clementine Vulgate with its English meaning, dictionary form and grammar. "
         "They are the work of a program, so some words will be wrong. Built by Two-edged Sword's tools/latin from openly "
         "licensed sources:</p><ul>"
         "<li>The text: the Clementine Vulgate Project's (public domain).</li>"
         "<li>Each word's possible dictionary forms and grammar: the lexicon of Collatinus, by Yves Ouvrard and Philippe Verkerk "
         "(github.com/biblissima/collatinus), free software under the GNU General Public License.</li>"
         "<li>Which of those a word has in its sentence: taggers trained on two Latin treebanks of Universal Dependencies, "
         "each under the Creative Commons Attribution-ShareAlike 4.0 licence: UD_Latin-LLCT, the Late Latin Charter Treebank "
         "(Timo Korkiakangas; converted by Flavio Massimiliano Cecchini and Marco Passarotti in the LiLa project), and "
         "UD_Latin-CIRCSE (the CIRCSE Research Centre, Università Cattolica del Sacro Cuore, Milan).</li>"
         "<li>The English: the first sense in Collatinus's English lexicon, or in William Whitaker's WORDS dictionary (\"freely "
         "available to anyone who wishes to use them, for whatever purpose\"), with a short table of the Bible's senses.</li>"
         "<li>The Strong's numbers: borrowed by lining each verse up word by word with the Hebrew of WLC+ (the Open "
         "Scriptures Hebrew Bible, CC BY 4.0) for the Old Testament, the Greek of Byz+ (the Robinson–Pierpont Byzantine text, "
         "public domain, numbered after STEPBible's TAGNT, CC BY 4.0) for the New, and the Greek of LXX+ (Brenton's Septuagint) "
         "for the deuterocanon and the Greek parts of Esther and Daniel. A word with no clear counterpart in them has none.</li>"
         "</ul><p>This module is shared under the GNU General Public License, version 3 or later, as Two-edged Sword is.</p>")


PARTS = ("Old Testament", "New Testament", "deuterocanon")


def part_of(b, c, v):
    return "New Testament" if 40 <= b <= 66 else "deuterocanon" if b >= 67 or strongs.greek_part(b, c, v) else "Old Testament"


def main(into=None):
    """Writes clementine+.bbli to the app's modules folder, or to `into`."""
    src = find("clementine.bbli")
    if not src.is_file():
        sys.exit(f"no {src}; tools/vulgate/build.py makes it")
    db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible ORDER BY Book, Chapter, Verse").fetchall()
    info = db.execute("SELECT Information FROM Details").fetchone()[0] or ""
    db.close()
    verses = [plus.pieces(t or "") for *_, t in rows]
    lex, gloss, chooser = setup(verses)
    print(f"  tagging {sum(k == 'word' for ps in verses for k, _ in ps)} words in {len(verses)} verses")
    tagged = []  # per verse: [(piece index, tags)]
    for n, ps in enumerate(verses):
        idx = [i for i, (k, _) in enumerate(ps) if k == "word"]
        tagged.append(list(zip(idx, chooser.choose([ps[i][1] for i in idx]))) if idx else [])
        if n % 2000 == 0:
            print(f"  {n} verses", end="\r", flush=True)
    print()
    nums = strongs.assign({(b, c, v): [t[3] for _, t in tv] for (b, c, v, _), tv in zip(rows, tagged)},
                          {(b, c, v): [t[0] in ("NOUN", "PROPN", "VERB", "AUX") for _, t in tv] for (b, c, v, _), tv in zip(rows, tagged)})
    out = []
    stats = {part: Counter() for part in PARTS}
    for (b, c, v, _), ps, tv in zip(rows, verses, tagged):
        tags = {pi: (wi, t) for wi, (pi, t) in enumerate(tv)}
        vn = nums.get((b, c, v), {})
        st = stats[part_of(b, c, v)]
        s = []
        for pi, (kind, text) in enumerate(ps):
            if pi not in tags:
                s.append(text if kind == "tag" else html.escape(text, quote=False))
                continue
            wi, (upos, f, lemma, lkey, enc) = tags[pi]
            g = gloss(lemma, lkey, upos, f)
            st["words"] += 1
            st["english"] += bool(g)
            if enc == "que":
                g = f"and {g}".strip()
            elif enc == "ve":
                g = f"or {g}".strip()
            elif enc == "cum":
                g = f"with {g}".strip()
            num = vn.get(wi)
            st["strongs"] += bool(num)
            s.append(f"<div><grk>{html.escape(text)}</grk>" + (f"<num>{num}</num>" if num else "") +
                     f"<tvm>{html.escape(grammar(upos, f))}</tvm><grk>{html.escape(lemma)}</grk><gra>{html.escape(g) or '—'}</gra></div>")
            nxt = ps[pi + 1] if pi + 1 < len(ps) else None
            if nxt and nxt[0] == "text" and not nxt[1].strip():
                ps[pi + 1] = ("text", "")  # a div brings its own space
        out.append((b, c, v, "".join(s).strip()))
    for part, st in stats.items():
        if st["words"]:
            print(f"  {part}: {st['words']} words, {st['english'] / st['words']:.1%} with English, {st['strongs'] / st['words']:.1%} with a Strong's number")
    ot, nt, apoc = (any(lo <= r[0] <= hi for r in rows) for lo, hi in ((1, 39), (40, 66), (67, 99)))
    with module("clementine+.bbli", TITLE, ABBREV, info + ABOUT, ot=ot, nt=nt, apocrypha=apoc, strongs=True, into=into) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    print(f"clementine+.bbli: {len(out)} verses")


if __name__ == "__main__":
    main()
