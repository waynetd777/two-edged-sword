# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""A Latin word's possible dictionary forms and grammar, from Collatinus's lexicon (Yves Ouvrard and
Philippe Verkerk, github.com/biblissima/collatinus, GPL): every lemma, inflection model and
irregular form it lists, read the way Collatinus reads them.

    lex = Lexicon(folder)          # the data files, as data() downloads them
    lex.analyse("principio")       # [Analysis(lemma="principium", pos="n", feats={...}), …]

A word is split every way into a stem and an ending; a pair is an analysis when the stem is one of a
lemma's stems and the ending is one its model gives that stem. Quantity marks are dropped and words
are compared in one spelling (i for j, u for v, ae for æ); lemmas keep Collatinus's spelling for
showing (verbum, justitia). Assimilated prefixes (adf-/aff-) and contracted perfects (-arunt) are
tried as Collatinus tries them. The enclitics -que, -ve and -ne are split off only when the whole
word has no analysis (so neque and itaque stay whole).

The data files are taken at a fixed commit and checked against their sha256. lem_ext.la, Collatinus's
larger lexicon gathered from other dictionaries (it has most of the Bible's names), is read after
lemmes.la, and its lemmas are used only for words lemmes.la has no analysis for.
"""
import re, sys, unicodedata
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import fetch  # noqa: E402

COMMIT = "e1fef78818b5c5f8e7f9754cf58f50062b30abff"
BASE = f"https://raw.githubusercontent.com/biblissima/collatinus/{COMMIT}/bin/data/"
FILES = {
    "lemmes.la": "0b926602f943f80d3ab04819532f5400e1a37c896c523177f7ca589fa52fe135",
    "lem_ext.la": "565c731af4d90731b539a3a9aa4beeeed6ef9396a75264f41ee9c8dacbd8c21e",
    "modeles.la": "6f462eed98fe6e16389c52222700ae4de354de759d04b4987ef0cabae39a1697",
    "irregs.la": "957e1ba45af28c50cc4f3d4d5f49c5ab7e6dc8bcd4a505f9309af6145a7f7791",
    "morphos.en": "62604c3b486f3dd5e1514863f6bf6c1a076923e129673bf2f4708fe7adf3514c",
    "assimilations.la": "500283855c79b37e0b8c905b6b7882094f6d5fb133e83bc011a60ebba593861e",
    "contractions.la": "600ee1862876d85c74423a20c22ffb5da9df71b80b3ea33d301534a60ed23421",
    "lemmes.en": "66cab61aa8dcf754a8e61ec65820314e10c156882d0bb8ad22c3fe6b7072ab9e",
    "lem_ext.en": "b4391b901eeb8883f9e5eb74c2f03d01b8b0d1986c83c9c52ed9e814630cc1fe",
}


def data(folder: Path) -> Path:
    """Downloads the Collatinus files into `folder` (once) and returns it."""
    for name, sha in FILES.items():
        fetch(BASE + name, folder / name, sha256=sha)
    return folder


CYRILLIC = str.maketrans({"у": "y", "У": "Y", "ў": "y", "Ў": "Y"})  # Collatinus writes some short y's with these


def plain(s: str) -> str:
    """Without quantity marks or other accents (vīta → vita), keeping v, j and case."""
    s = unicodedata.normalize("NFD", s.translate(CYRILLIC))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return unicodedata.normalize("NFC", s.translate(CYRILLIC))


def key(s: str) -> str:
    """The spelling words are compared in: plain, lower case, i for j, u for v, ae for æ."""
    s = plain(s).lower().replace("æ", "ae").replace("œ", "oe").replace("ë", "e").replace("j", "i").replace("v", "u")
    return s


def lines(p: Path):
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("!"):
            yield line


def numbers(spec: str) -> list[int]:
    """"1-3,7" → [1, 2, 3, 7]."""
    out = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-")
            out += range(int(a), int(b) + 1)
        else:
            out.append(int(part))
    return out


# ---- grammar: Collatinus's numbered morphologies, as Universal Dependencies features ----

CASES = {"nominative": "Nom", "vocative": "Voc", "accusative": "Acc", "genitive": "Gen", "dative": "Dat", "ablative": "Abl", "locative": "Loc"}


def morpho_feats(label: str) -> dict:
    """"participle perfect passive masculine nominative singular" → UD-style features. TA is the
    tense as one word (pres, impf, fut, perf, plupf, futpf)."""
    w = label.lower().split()
    f = {}
    for x in w:
        if x in CASES:
            f["Case"] = CASES[x]
    if "singular" in w: f["Number"] = "Sing"
    if "plural" in w: f["Number"] = "Plur"
    for g, v in (("masculine", "Masc"), ("feminine", "Fem"), ("neuter", "Neut")):
        if g in w: f["Gender"] = v
    for p, v in (("1st", "1"), ("2nd", "2"), ("3rd", "3")):
        if p in w: f["Person"] = v
    for m, v in (("indicative", "Ind"), ("subjunctive", "Sub"), ("imperative", "Imp")):
        if m in w:
            f["Mood"], f["VerbForm"] = v, "Fin"
    for m, v in (("infinitive", "Inf"), ("participle", "Part"), ("gerund", "Ger"), ("gerundive", "Gdv"), ("supine", "Sup")):
        if m in w:
            f["VerbForm"] = v
    s = " ".join(w)
    if "pluperfect" in w: f["TA"] = "plupf"
    elif "future perfect" in s: f["TA"] = "futpf"
    elif "imperfect" in w: f["TA"] = "impf"
    elif "perfect" in w: f["TA"] = "perf"
    elif "future" in w or "fut." in w: f["TA"] = "fut"
    elif "present" in w or "pres." in w: f["TA"] = "pres"
    if f.get("VerbForm") in ("Ger", "Gdv", "Sup"):
        f.pop("TA", None)
    if "passive" in w: f["Voice"] = "Pass"
    elif "active" in w: f["Voice"] = "Act"
    if "comparative" in w: f["Degree"] = "Cmp"
    if "superlative" in w: f["Degree"] = "Sup"
    return f


# ---- the lexicon ----

@dataclass
class Lemma:
    key: str            # Collatinus's key, with its homonym number: "caro", "caro2"
    form: str           # the dictionary form as shown: "caro", "verbum", "justitia"
    model: str
    pos: str            # Collatinus's letters: n noun, a adjective, v verb, p pronoun, r preposition, d adverb, c conjunction, i interjection, m numeral
    gender: str = ""    # Masc, Fem, Neut (nouns), from the dictionary entry
    proper: bool = False
    count: int = 0
    ext: bool = False   # from lem_ext.la
    stems: dict = field(default_factory=dict)  # radical number → [stem keys]
    excl: set = field(default_factory=set)     # morphologies only its irregular forms have


@dataclass
class Analysis:
    lemma: Lemma
    feats: dict
    morpho: int
    enclitic: str = ""   # "que", "ve" or "ne" split off the word


class Model:
    def __init__(self, name):
        self.name, self.parent, self.pos = name, None, ""
        self.endings = {}   # morpho → [(ending key, radical number)]
        self.radicals = {}  # radical number → rule
        self.absent = []


class Lexicon:
    def __init__(self, folder: Path):
        self.folder = Path(folder)
        self.morphos = {}
        for line in lines(self.folder / "morphos.en"):
            n, _, label = line.partition(":")
            if n.isdigit():
                self.morphos[int(n)] = morpho_feats(label)
        self.models = {}
        self._read_models()
        # ending key → {(model, radical number): [morpho]}
        self.endings = {}
        for m in self.models.values():
            for mo, ends in m.endings.items():
                for e, nr in ends:
                    self.endings.setdefault(e, {}).setdefault((m.name, nr), []).append(mo)
        self.lemmas = {}
        self.stems = {}     # stem key → [(Lemma, radical number)]
        self._read_lemmas(self.folder / "lemmes.la", ext=False)
        self._read_lemmas(self.folder / "lem_ext.la", ext=True)
        self.irregs = {}    # form key → [(Lemma, [morpho])]
        for line in lines(self.folder / "irregs.la"):
            parts = line.split(":")
            if len(parts) < 3:
                continue
            form, lem, mos = parts[0], parts[1], numbers(parts[2])
            exclusive = form.endswith("*")
            lemma = self.lemmas.get(key(lem))
            if not lemma:
                continue
            self.irregs.setdefault(key(form.rstrip("*")), []).append((lemma, mos))
            if exclusive:
                lemma.excl |= set(mos)
        self.assims = [tuple(key(x) for x in line.split(":")) for line in lines(self.folder / "assimilations.la") if ":" in line]
        self.contractions = [tuple(key(x) for x in line.split(":")) for line in lines(self.folder / "contractions.la") if ":" in line]
        self._cache = {}

    # modeles.la: see its header for the format.
    def _read_models(self):
        variables = {}
        block = []
        for line in lines(self.folder / "modeles.la"):
            if line.startswith("$"):
                name, _, value = line.partition("=")
                variables[name] = value
                continue
            if line.startswith("modele:") and block:
                self._model(block, variables)
                block = []
            block.append(line)
        if block:
            self._model(block, variables)

    def _model(self, block, variables):
        m = Model(block[0].split(":", 1)[1].strip())
        own = set()
        sufs = []
        for line in block[1:]:
            # a $variable stands for its list; text just before it goes before each of its items
            def expand(mt):
                pre, var = mt.group(1), mt.group(2)
                return pre + variables.get(var, "").replace(";", ";" + pre)
            line = re.sub(r"([^\s:;$]*)\+?(\$\w+)", expand, line)
            parts = line.split(":")
            k = parts[0]
            if k == "pere":
                m.parent = self.models.get(parts[1])
            elif k in ("des", "des+"):
                mos, nr, ends = numbers(parts[1]), int(parts[2]), parts[3].split(";") if len(parts) > 3 else [""]
                for i, mo in enumerate(mos):
                    for e in (ends[i] if i < len(ends) else ends[-1]).split(","):
                        e = re.sub(r"\d$", "", e.strip())
                        e = "" if e == "-" else e
                        m.endings.setdefault(mo, []).append((key(e), nr))
                    own.add(mo)
                    if k == "des+" and m.parent:
                        m.endings[mo] += m.parent.endings.get(mo, [])
            elif k == "R":
                m.radicals[int(parts[1])] = parts[2]
            elif k == "abs":
                m.absent = numbers(parts[1])
            elif k == "abs+":
                m.absent += numbers(parts[1])
            elif k == "suf":
                sufs.append((numbers(parts[1]), key(parts[2])))
            elif k == "sufd":
                if m.parent:
                    s = key(parts[1])
                    for mo, ends in m.parent.endings.items():
                        if mo not in m.absent:
                            m.endings.setdefault(mo, []).extend((e + s, nr) for e, nr in ends)
                            own.add(mo)
            elif k == "pos":
                m.pos = parts[1]
        p = m.parent
        if p:
            m.pos = m.pos or p.pos
            for mo, ends in p.endings.items():
                if mo in own or mo in m.absent:
                    continue
                m.endings[mo] = list(ends)
            for nr in {nr for ends in m.endings.values() for _, nr in ends}:
                if nr not in m.radicals and nr in p.radicals:
                    m.radicals[nr] = p.radicals[nr]
            m.absent = list(p.absent)
        for mos, s in sufs:
            for mo in mos:
                m.endings[mo] = m.endings.get(mo, []) + [(e + s, nr) for e, nr in m.endings.get(mo, [])]
        self.models[m.name] = m

    # lemmes.la: key=forms|model|stem 1|stem 2|dictionary entry|count
    def _read_lemmas(self, path, ext):
        for line in lines(path):
            f = line.split("|")
            if len(f) < 5:
                continue
            head, _, forms = f[0].partition("=")
            k = key(head)
            if k in self.lemmas:
                continue
            model = self.models.get(f[1])
            if not model:
                continue
            canon = forms or re.sub(r"\d+$", "", head)
            entry = f[4]
            pos = ""
            for marker, letter in (("adj.", "a"), ("conj", "c"), ("interj", "i"), ("excl.", "i"), ("num.", "m"), ("pron.", "p"),
                                   ("prép", "r"), ("adv", "d"), (" nom ", "n"), ("npr.", "n")):
                if marker in entry and letter not in pos:
                    pos += letter
            pos = pos or model.pos or ""
            if not pos and plain(canon)[:1].isupper():
                pos = "n"
            g = re.search(r"\b([mfn])\.", entry)
            gender = {"m": "Masc", "f": "Fem", "n": "Neut"}[g.group(1)] if g and "n" in pos else ""
            show = plain(canon.split(",")[0])
            lemma = Lemma(k, show, model.name, pos, gender, proper=show[:1].isupper() or "npr." in entry,
                          count=int(f[5]) if len(f) > 5 and f[5].strip().isdigit() else 0, ext=ext)
            stems = {}
            for i in (2, 3):
                if i < len(f) and f[i]:
                    stems[i - 1] = [key(s) for s in f[i].split(",") if s]
            for nr, rule in model.radicals.items():
                if nr in stems or rule == "-":
                    continue
                out = []
                for c in canon.split(","):
                    c = plain(c)
                    if rule != "K":
                        cut, _, add = rule.partition(",")
                        cut = int(cut)
                        c = c[:-cut] if cut else c
                        if add and add != "0":
                            c += plain(add)
                    out.append(key(c))
                stems[nr] = out
            lemma.stems = stems
            self.lemmas[k] = lemma
            for nr, ss in stems.items():
                for s in ss:
                    self.stems.setdefault(s, []).append((lemma, nr))

    def key(self, word: str) -> str:
        return key(word)

    # ---- analysing a word ----

    def _split(self, w):
        out = []
        for i in range(len(w) + 1):
            stem, end = w[:i], w[i:]
            ends = self.endings.get(end)
            if not ends:
                continue
            cands = list(self.stems.get(stem, ()))
            # conubium, conubis: an ending in i- may follow a stem without its own i
            if end.startswith("i") and not end.startswith("ii") and not stem.endswith("i"):
                cands += self.stems.get(stem + "i", [])
            for lemma, nr in cands:
                for mo in ends.get((lemma.model, nr), ()):
                    if mo not in lemma.excl:
                        out.append(Analysis(lemma, self.morphos.get(mo, {}), mo))
        for lemma, mos in self.irregs.get(w, ()):
            out += [Analysis(lemma, self.morphos.get(mo, {}), mo) for mo in mos]
        return out

    def _forms(self, w):
        out = self._split(w)
        if not out:
            for a, b in self.assims:
                for x, y in ((a, b), (b, a)):
                    if w.startswith(x):
                        out += self._split(y + w[len(x):])
        if not out:
            for short, full in self.contractions:
                if w.endswith(short):
                    out += self._split(w[: -len(short)] + full)
        return out

    def analyse(self, word: str) -> list[Analysis]:
        w = key(word)
        w = re.sub(r"[^a-z]", "", w)
        if w in self._cache:
            return self._cache[w]
        out = self._forms(w)
        if not out:
            for enc in ("que", "ue", "ne"):
                if w.endswith(enc) and len(w) > len(enc) + 1:
                    out = [Analysis(a.lemma, a.feats, a.morpho, "ve" if enc == "ue" else enc) for a in self._forms(w[: -len(enc)])]
                    if out:
                        break
        main = [a for a in out if not a.lemma.ext]
        if main:  # lem_ext's names stay: the Bible's names are mostly there (Maria, beside mare's plural)
            out = main + [a for a in out if a.lemma.ext and a.lemma.proper]
        seen, uniq = set(), []
        for a in out:
            k = (a.lemma.key, a.morpho, a.enclitic)
            if k not in seen:
                seen.add(k)
                uniq.append(a)
        self._cache[w] = uniq
        return uniq

    def english(self) -> dict:
        """{lemma key: its English, as lemmes.en and lem_ext.en give it}."""
        out = {}
        for name in ("lemmes.en", "lem_ext.en"):
            for line in lines(self.folder / name):
                k, sep, v = line.partition(":")
                if sep and key(k) not in out:
                    out[key(k)] = v
        return out
