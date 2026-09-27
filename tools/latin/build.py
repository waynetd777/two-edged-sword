"""Builds the Latin Bibles word by word: latin+.bbli ("Latin Vulgate w/ glosses") from latin.bbli
and clementine+.bbli ("Latin Vulgate (Clementine) w/ glosses") from clementine.bbli, each word with
its English meaning, dictionary form and grammar, as the Greek interlinears are.

    python3 tools/latin/build.py [latin clementine]

Reads the plain modules from the library (tools/modules.py finds them) (tools/vulgate builds the Clementine) and writes
the new ones beside them; the app finds them after Library → Rescan. With module names, builds only
those.

Each word's dictionary form and grammar come from Stanza (Stanford NLP, Apache 2.0) with its Latin
model trained on the PROIEL treebank, which has the Vulgate New Testament in it: it reads a verse at
a time, so it picks the lemma a word has in its sentence. Stanza runs in a virtual environment of
its own, made the first time in ~/Library/Caches/Two-edged Sword/latin/venv (about 1 GB, mostly
PyTorch).

The English is from William Whitaker's WORDS dictionary (DICTLINE.GEN, "freely available to anyone
who wishes to use them, for whatever purpose"): for the lemma and part of speech, the entry marked
most frequent, and its first sense. A short table (MEANINGS) gives the plain Biblical sense of words
whose first sense in Whitaker is some other (caro: meat), and English for the pronouns and little
words Whitaker lists apart. A word Whitaker doesn't have (most names) shows its lemma.

Words are tagged in a normalised spelling (æ → ae, œ → oe, j → i, as PROIEL spells them; the dictionary is
looked up with u for v as well) and shown as
the module has them. -que ("and") is split off for the tagger and put before the word's meaning.
Words in <i> (the Hebrew letters heading Psalm 119's stanzas) are left as they are, as are the tags.

Downloads are cached in ~/Library/Caches/Two-edged Sword/latin.
"""
import html, os, re, sqlite3, subprocess, sys, urllib.request
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import LIBRARY, find  # noqa: E402
CACHE = HOME / "Library/Caches/Two-edged Sword/latin"
VENV = CACHE / "venv"
DICTLINE = "https://raw.githubusercontent.com/mk270/whitakers-words/master/DICTLINE.GEN"
MODULES = {
    "latin": dict(title="Latin Vulgate w/ glosses", abbrev="Latin+"),
    "clementine": dict(title="Latin Vulgate (Clementine) w/ glosses", abbrev="Vulg-C+"),
}


def venv():
    """Re-runs this script in the virtual environment that has Stanza, making it if need be."""
    try:
        import stanza  # noqa: F401
        return
    except ImportError:
        pass
    py = VENV / "bin" / "python"
    if not py.exists():
        print("making a virtual environment for Stanza (once)")
        subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
        subprocess.run([str(py), "-m", "pip", "install", "-q", "stanza"], check=True)
    os.execv(str(py), [str(py), *sys.argv])


# Stanza's parts of speech and the Whitaker ones each may be.
POS = {"NOUN": {"N"}, "PROPN": {"N"}, "VERB": {"V"}, "AUX": {"V"}, "ADJ": {"ADJ", "NUM", "PRON"}, "ADV": {"ADV"}, "ADP": {"PREP"},
       "CCONJ": {"CONJ"}, "SCONJ": {"CONJ", "ADV"}, "PRON": {"PRON", "ADJ"}, "DET": {"ADJ", "PRON"}, "NUM": {"NUM", "ADJ"},
       "INTJ": {"INTERJ"}, "PART": {"ADV", "CONJ"}, "X": set()}
FREQ = {c: i for i, c in enumerate("ABCDEF")}

# Lemma: English, where Whitaker's first sense isn't the Biblical one or Whitaker hasn't the word.
MEANINGS = {
    "ego": "I", "tu": "you", "nos": "we", "uos": "you", "is": "he", "ille": "that", "hic": "this", "iste": "that", "ipse": "himself",
    "idem": "the same", "qui": "who", "quis": "who", "quid": "what", "aliquis": "someone", "quisque": "each", "nemo": "no one",
    "nihil": "nothing", "sui": "himself", "se": "himself", "meus": "my", "tuus": "your", "suus": "his", "noster": "our",
    "uester": "your", "omnis": "all", "sum": "be", "possum": "be able", "eo": "go", "fero": "bear", "uolo": "want", "nolo": "be unwilling",
    "fio": "become", "et": "and", "in": "in", "ab": "from", "ad": "to", "de": "from", "ex": "out of", "cum": "with", "non": "not",
    "ut": "that", "quia": "because", "sed": "but", "enim": "for", "autem": "but", "uero": "truly", "ergo": "therefore", "si": "if",
    "nec": "nor", "neque": "nor", "aut": "or", "uel": "or", "atque": "and", "ac": "and", "etiam": "also", "quoque": "also",
    "super": "over", "per": "through", "pro": "for", "sine": "without", "sub": "under", "ante": "before", "post": "after",
    "inter": "among", "apud": "with", "propter": "because of", "usque": "as far as", "coram": "before", "contra": "against",
    "caro": "flesh", "spiritus": "spirit", "gratia": "grace", "uerbum": "word", "dominus": "Lord", "deus": "God", "caelum": "heaven",
    "caelus": "heaven", "anima": "soul", "gloria": "glory", "peccatum": "sin", "fides": "faith", "salus": "salvation", "gens": "nation",
    "saeculum": "age", "uirtus": "power", "iustitia": "righteousness", "misericordia": "mercy", "sanctus": "holy", "benedico": "bless",
    "unigenitus": "only-begotten", "ecclesia": "church", "euangelium": "gospel", "apostolus": "apostle", "propheta": "prophet",
    "angelus": "angel", "baptizo": "baptize", "sacerdos": "priest", "templum": "temple", "populus": "people", "rex": "king",
    "filius": "son", "pater": "father", "mater": "mother", "frater": "brother", "uir": "man", "mulier": "woman", "homo": "man",
    "dico": "say", "facio": "make", "uideo": "see", "uenio": "come", "do": "give", "habeo": "have", "audio": "hear", "loquor": "speak",
    "terra": "earth", "dies": "day", "facies": "face", "orbis": "world", "desum": "be lacking", "tenebrae": "darkness",
    "saluator": "saviour", "crux": "cross", "regnum": "kingdom", "mundus": "world", "lux": "light", "uita": "life",
    "mors": "death", "cor": "heart", "oculus": "eye", "manus": "hand", "lex": "law", "uox": "voice", "nomen": "name", "ecce": "behold", "amen": "amen", "alleluia": "alleluia", "iesus": "Jesus", "christus": "Christ",
}
QUE = {"que"}
NOT_QUE = {"quoque", "atque", "itaque", "neque", "quisque", "usque", "ubique", "denique", "utique", "undique", "quique", "quaeque",
           "quodque", "quemque", "quamque", "cuiusque", "cuique", "quoque", "plerique", "uterque", "utraque", "utrumque", "absque",
           "quacumque", "quicumque", "quaecumque", "quodcumque", "undecumque", "namque", "peraeque", "quinque", "utrobique"}


def spell(w):
    """A word as the tagger knows it: PROIEL's spelling, with v kept."""
    return w.replace("æ", "ae").replace("Æ", "Ae").replace("œ", "oe").replace("Œ", "Oe").replace("ë", "e").replace("j", "i").replace("J", "I")


def norm(w):
    """A dictionary key: lower case, u for v and i for j, letters only."""
    w = w.lower().replace("æ", "ae").replace("œ", "oe").replace("ë", "e").replace("j", "i").replace("v", "u")
    return re.sub(r"[^a-z]", "", w)


def whitaker():
    """{normalised lemma: [(pos, frequency rank, first sense)]}, from DICTLINE's stems."""
    p = CACHE / "DICTLINE.GEN"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(DICTLINE, timeout=120) as r:
            p.write_bytes(r.read())
    out = {}
    for line in p.read_text(encoding="latin-1").splitlines():
        stems = [line[i * 19:(i + 1) * 19].strip() for i in range(4)]
        m = re.match(r"(\S+)\s+(.*?)\s+([A-Z]) ([A-Z]) ([A-Z]) ([A-Z]) ([A-Z]) (.*)$", line[76:])
        if not m or not stems[0] or stems[0] == "zzz":
            continue
        pos, codes, freq, senses = m.group(1), m.group(2).split(), m.group(6), m.group(8)
        if senses.startswith("|"):
            continue  # more senses of the entry above
        sense = clean(senses)
        if not sense:
            continue
        s1 = norm(stems[0])
        forms = {s1}
        if pos == "N" and codes:
            d, v = codes[0], codes[1] if len(codes) > 1 else "0"
            forms |= {s1 + e for e in {"1": ["a", "ae"], "2": ["us", "um", "ius", "", "i", "a"], "4": ["us", "u"], "5": ["es"]}.get(d, ["", "es", "a"])}
        elif pos == "ADJ":
            forms |= {s1 + e for e in ("us", "is", "er", "")}
        elif pos == "V":
            forms |= {s1 + e for e in ("o", "or", "eo", "eor", "io", "ior")}
        for f in forms:
            out.setdefault(f, []).append((pos, FREQ.get(freq, 9), sense))
    return out


def clean(senses):
    """A dictionary sense as a gloss: the first of the first sense, without notes."""
    s = re.sub(r"\[.*?\]|\(.*?\)", "", senses.split(";")[0])
    s = re.split(r"[,/]", s)[0].strip().replace("_", " ")
    s = re.sub(r"^(?:to |a |an |the )", "", s)
    return s if re.search(r"[a-z]", s, re.I) and len(s) <= 28 else ""


# Personal pronouns by case (and, for is, gender and number).
PRONOUNS = {
    "ego": {"Nom": "I", "Gen": "of me", "Dat": "to me", "Acc": "me", "Abl": "me"},
    "tu": {"Nom": "you", "Gen": "of you", "Dat": "to you", "Acc": "you", "Abl": "you"},
    "nos": {"Nom": "we", "Gen": "of us", "Dat": "to us", "Acc": "us", "Abl": "us"},
    "uos": {"Nom": "you", "Gen": "of you", "Dat": "to you", "Acc": "you", "Abl": "you"},
    "sui": {"Gen": "of himself", "Dat": "to himself", "Acc": "himself", "Abl": "himself"},
}
IS = {("Nom", "Masc"): "he", ("Nom", "Fem"): "she", ("Nom", "Neut"): "it", ("Gen", "Masc"): "his", ("Gen", "Fem"): "her",
      ("Gen", "Neut"): "its", ("Dat", "Masc"): "to him", ("Dat", "Fem"): "to her", ("Dat", "Neut"): "to it", ("Acc", "Masc"): "him",
      ("Acc", "Fem"): "her", ("Acc", "Neut"): "it", ("Abl", "Masc"): "him", ("Abl", "Fem"): "her", ("Abl", "Neut"): "it"}
IS_PLUR = {"Nom": "they", "Gen": "their", "Dat": "to them", "Acc": "them", "Abl": "them"}


def meaning(lemma, upos, dic, feats=""):
    base = re.sub(r"\d+$", "", lemma)
    key = norm(base)
    f = dict(kv.split("=", 1) for kv in (feats or "").split("|") if "=" in kv)
    if key in PRONOUNS and f.get("Case") in PRONOUNS[key]:
        return PRONOUNS[key][f["Case"]]
    if key == "is" and upos in ("PRON", "DET") and f.get("Case"):
        if f.get("Number") == "Plur":
            return IS_PLUR.get(f["Case"], "they")
        return IS.get((f["Case"], f.get("Gender", "Masc")), IS.get((f["Case"], "Masc"), "he"))
    if key in MEANINGS:
        return MEANINGS[key]
    entries = dic.get(key, [])
    fit = [e for e in entries if e[0] in POS.get(upos, set())] or entries
    if fit:
        return min(fit, key=lambda e: e[1])[2]
    return base.capitalize() if upos == "PROPN" or base[:1].isupper() else ""


CASE = {"Nom": "nom.", "Gen": "gen.", "Dat": "dat.", "Acc": "acc.", "Abl": "abl.", "Voc": "voc.", "Loc": "loc."}
GEND = {"Masc": "masc.", "Fem": "fem.", "Neut": "neut."}
NUMB = {"Sing": "sing.", "Plur": "plur."}
TENSE = {"Pres": "present", "Past": "perfect", "Fut": "future", "Pqp": "pluperfect", "Imp": "imperfect"}
MOOD = {"Ind": "indicative", "Sub": "subjunctive", "Imp": "imperative"}
UPOS = {"NOUN": "noun", "PROPN": "name", "VERB": "verb", "AUX": "verb", "ADJ": "adjective", "ADV": "adverb", "ADP": "preposition",
        "CCONJ": "conjunction", "SCONJ": "conjunction", "PRON": "pronoun", "DET": "determiner", "NUM": "numeral", "INTJ": "interjection",
        "PART": "particle"}


def grammar(upos, feats):
    f = dict(kv.split("=", 1) for kv in (feats or "").split("|") if "=" in kv)
    parts = [UPOS.get(upos, upos.lower())]
    if upos in ("VERB", "AUX"):
        if f.get("VerbForm") == "Fin":
            tense = "imperfect" if f.get("Aspect") == "Imp" and f.get("Tense") == "Past" else TENSE.get(f.get("Tense"), "")
            parts.append(" ".join(x for x in (tense, "passive" if f.get("Voice") == "Pass" else "", MOOD.get(f.get("Mood"), "")) if x))
            parts.append(" ".join(x for x in (f.get("Person"), NUMB.get(f.get("Number"))) if x))
        else:
            form = {"Inf": "infinitive", "Part": "participle", "Ger": "gerund", "Gdv": "gerundive", "Sup": "supine"}.get(f.get("VerbForm"), "")
            tense = {"Pres": "present", "Past": "perfect", "Fut": "future"}.get(f.get("Tense"), "")
            parts.append(" ".join(x for x in (tense, "passive" if f.get("Voice") == "Pass" else "", form) if x))
            parts.append(" ".join(x for x in (CASE.get(f.get("Case")), GEND.get(f.get("Gender")), NUMB.get(f.get("Number"))) if x))
    else:
        parts.append(" ".join(x for x in (CASE.get(f.get("Case")), GEND.get(f.get("Gender")), NUMB.get(f.get("Number"))) if x))
    return " · ".join(p for p in parts if p)


WORD = re.compile(r"[A-Za-zÀ-ÿæœÆŒ]+")


def pieces(verse):
    """A verse as [(kind, text)]: "tag", "word", "i" (a word in <i>) or "text"."""
    out, italic = [], False
    for part in re.split(r"(<[^>]+>)", verse):
        if part.startswith("<"):
            out.append(("tag", part))
            if re.match(r"<i\b", part):
                italic = True
            elif part == "</i>":
                italic = False
            continue
        last = 0
        for m in WORD.finditer(part):
            if m.start() > last:
                out.append(("text", part[last:m.start()]))
            out.append(("i" if italic else "word", m.group()))
            last = m.end()
        if last < len(part):
            out.append(("text", part[last:]))
    return out


def split_que(w):
    n = norm(w)
    if n.endswith("que") and len(n) > 5 and n not in NOT_QUE:
        return w[:-3], True
    return w, False


def build(name, nlp, dic):
    src = find(f"{name}.bbli")
    if not src.exists():
        print(f"  no {src.name}; skipped")
        return
    db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible ORDER BY Book, Chapter, Verse").fetchall()
    info = db.execute("SELECT Information FROM Details").fetchone()[0] or ""
    db.close()

    verses = [pieces(t or "") for *_, t in rows]
    batch, where = [], []
    for vi, ps in enumerate(verses):
        toks = []
        for pi, (kind, text) in enumerate(ps):
            if kind == "word":
                stem, que = split_que(text)
                toks.append((pi, que, spell(stem)))
        if toks:
            batch.append([t[2] for t in toks])
            where.append((vi, toks))
    print(f"  tagging {sum(len(b) for b in batch)} words in {len(batch)} verses")
    tagged = {}
    step = 2000
    for k in range(0, len(batch), step):
        doc = nlp(batch[k:k + step])
        for (vi, toks), sent in zip(where[k:k + step], doc.sentences):
            for (pi, que, _), w in zip(toks, sent.words):
                tagged[(vi, pi)] = (w.lemma or w.text, w.upos, w.feats, que)
        print(f"  {min(k + step, len(batch))} verses", end="\r", flush=True)
    print()

    out, missing = [], 0
    for (b, c, v, _), (vi, ps) in zip(rows, enumerate(verses)):
        s = []
        for pi, (kind, text) in enumerate(ps):
            t = tagged.get((vi, pi))
            if not t:
                s.append(text if kind == "tag" else html.escape(text, quote=False))
                continue
            lemma, upos, feats, que = t
            g = meaning(lemma, upos, dic, feats)
            missing += not g
            if que:
                g = f"and {g}".strip()
            nxt = ps[pi + 1] if pi + 1 < len(ps) else None
            s.append(f"<div><grk>{html.escape(text)}</grk><tvm>{html.escape(grammar(upos, feats))}</tvm><grk>{html.escape(lemma)}</grk><gra>{html.escape(g) or '—'}</gra></div>")
            if nxt and nxt[0] == "text" and not nxt[1].strip():
                ps[pi + 1] = ("text", "")  # a div brings its own space
        out.append((b, c, v, "".join(s).strip()))
    total = len(tagged)
    print(f"  {total - missing} of {total} words have English ({(total - missing) / total:.1%})")

    m = MODULES[name]
    about = (info + "<p>This edition shows each word with its English meaning, dictionary form and grammar. The dictionary "
             "form and grammar are from Stanza's Latin tagger (Stanford NLP, trained on the PROIEL treebank), which reads each "
             "word in its sentence; the English is the first sense in William Whitaker's WORDS dictionary. Both are the "
             "work of a program, so some words will be wrong. Built by Two-edged Sword's tools/latin.</p>")
    p = LIBRARY / f"{name}+.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    ot, nt, apoc = (any(lo <= r[0] <= hi for r in rows) for lo, hi in ((1, 39), (40, 66), (67, 99)))
    db.execute("INSERT INTO Details VALUES (?,?,?,1,?,?,?,0,0)", (m["title"], m["abbrev"], about, ot, nt, apoc))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(out)} verses")


def main():
    venv()
    import stanza
    names = sys.argv[1:] or list(MODULES)
    for n in names:
        if n not in MODULES:
            sys.exit(f"unknown module {n}; one of {', '.join(MODULES)}")
    os.environ.setdefault("STANZA_RESOURCES_DIR", str(CACHE / "stanza"))
    stanza.download("la", package="proiel", processors="tokenize,pos,lemma", verbose=False)
    nlp = stanza.Pipeline("la", package="proiel", processors="tokenize,pos,lemma", tokenize_pretokenized=True, verbose=False)
    dic = whitaker()
    for n in names:
        print(n)
        build(n, nlp, dic)


if __name__ == "__main__":
    main()
