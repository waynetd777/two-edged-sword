"""Builds peshitta+.bbli ("Syriac Peshitta w/ glosses"): the Peshitta New Testament word by word,
each word with its English meaning, dictionary form, root and grammar, as the Greek interlinears are.

    python3 tools/syriac/build.py

Reads peshitta.bbli (tools/crosswire builds it) from the e-Sword library and writes peshitta+.bbli
beside it; the app finds it after Library → Rescan.

Sources:
  ETCBC's syrnt, https://github.com/ETCBC/syrnt (MIT): the Syriac NT in Text-Fabric, from the SEDRA 3
    database of George A. Kiraz and James W. Bennett: every word with its lexeme, root, prefix,
    suffix and grammar.
  SEDRA IV's API, https://sedra.bethmardutho.org/about/openapi (Beth Mardutho): each lexeme's English
    glosses, gathered from the Syriac lexicons.
SEDRA calls itself non-commercial open source, so the module is built here, on the user's machine,
and never committed.

syrnt's text is SEDRA's, not the Bible Society's 1905 text the Peshitta module has; they differ in a
few places, and in how some verses are divided. So the two are lined up word by word over each
chapter (consonants only, marks and punctuation ignored), and a word of the Peshitta that has no
counterpart in syrnt is left as it is, without a gloss.

The markup is INT+'s (see tokenize in src/esword.tsx): each word a
<div><grk>word</grk><tvm>grammar</tvm><grk>lexeme</grk><gra>meaning</gra></div>.

Downloads are cached in ~/Library/Caches/Two-edged Sword/syriac (SEDRA's answers in sedra/).
"""
import html, json, os, re, sqlite3, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = Path(os.environ.get("ESWORD_LIBRARY") or HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
CACHE = HOME / "Library/Caches/Two-edged Sword/syriac"
TF = "https://raw.githubusercontent.com/ETCBC/syrnt/master/tf/0.1/{}.tf"
SEDRA = "https://sedra.bethmardutho.org/api/word/{}.json"
FEATURES = ["otype", "oslots", "book", "chapter", "verse", "word", "lexeme", "root", "prefix", "suffix", "sp", "st", "gn", "nu", "ps", "vs", "vt", "sfps", "sfgn", "sfnu"]


def get(url, path):
    if not path.exists() or not path.stat().st_size:
        path.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Two-edged Sword (tools/syriac)"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        path.write_bytes(data)
    return path.read_bytes()


def tf(name):
    """A Text-Fabric feature: {node: value}. A line is `value`, `node<TAB>value` or `a-b<TAB>value`;
    without a node it is the one after the last. An empty line is an empty value."""
    out, n = {}, 0
    lines = get(TF.format(name), CACHE / f"{name}.tf").decode().split("\n")
    body = lines[lines.index("") + 1:]
    if body and body[-1] == "":
        body.pop()
    for line in body:
        parts = line.split("\t")
        if len(parts) == 1:
            n += 1
            out[n] = parts[0]
            continue
        nodes, value = parts[0], parts[1]
        for rng in nodes.split(","):
            a, _, b = rng.partition("-")
            for k in range(int(a), int(b or a) + 1):
                out[k] = value
            n = int(b or a)
    return out


def ranges(s):
    out = []
    for rng in s.split(","):
        a, _, b = rng.partition("-")
        out += range(int(a), int(b or a) + 1)
    return out


BOOKS = ["Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess",
         "1Tim", "2Tim", "Titus", "Phlm", "Heb", "James", "1Peter", "2Peter", "1John", "2John", "3John", "Jude", "Rev"]

# Proclitics, each a letter of the prefix, in English.
PREFIX = {"ܘ": "and", "ܕ": "of", "ܠ": "to", "ܒ": "in", "ܟ": "as"}
# A noun's pronoun suffix, by person, gender and number (syrnt writes NA for common gender and
# for the singular).
POSSESSIVE = {("1", "NA"): "my", ("1", "p"): "our", ("2", "m", "NA"): "your", ("2", "f", "NA"): "your", ("2", "m", "p"): "your",
              ("2", "f", "p"): "your", ("3", "m", "NA"): "his", ("3", "f", "NA"): "her", ("3", "m", "p"): "their", ("3", "f", "p"): "their"}
OBJECT = {"my": "me", "our": "us", "your": "you", "his": "him", "her": "her", "their": "them"}
GENDER = {"m": "masc.", "f": "fem.", "c": "common"}
NUMBER = {"s": "sing.", "p": "plur."}


def words():
    """syrnt's words in order, each {b, c, v, word, lexeme, …}."""
    f = {k: tf(k) for k in FEATURES}
    otype, slots = f["otype"], f["oslots"]
    chapters = {}  # first slot -> (book, chapter)
    books = {}
    for node, t in otype.items():
        if t == "book":
            for s in ranges(slots[node]):
                books[s] = BOOKS.index(f["book"][node]) + 40
    for node, t in otype.items():
        if t == "chapter":
            for s in ranges(slots[node]):
                chapters[s] = int(f["chapter"][node])
    out = []
    for node, t in otype.items():
        if t != "verse":
            continue
        for s in ranges(slots[node]):
            w = {k: f[k].get(s, "") for k in FEATURES[5:]}
            w.update(b=books[s], c=chapters[s], v=int(f["verse"][node]))
            out.append(w)
    return out


def consonants(w):
    return "".join(ch for ch in unicodedata.normalize("NFD", w) if unicodedata.category(ch).startswith("L"))


def clean(g):
    """A gloss without markup, Syriac, lexicon sense codes (Ia, IIIp), notes in brackets or a
    trailing full stop; its first sense only. Empty for a cross-reference or a note."""
    g = re.sub(r"<[^>]+>", "", g)
    if re.match(r"\s*(\+|see\b|cf\.|numerical value|.*letter of the alphabet)", g, re.I):
        return ""
    g = re.sub(r"[\u0700-\u074F\u200d]+", "", g)
    g = re.sub(r"\s*\(.*?\)\s*", " ", g)
    g = re.sub(r"^\s*(?:[IVX]+[ap]?\.?|\d+)(?=\s|$)", "", g.strip())
    g = re.split(r"[;,]", g)[0].strip().rstrip(".:").strip()
    g = re.sub(r"^to\s+", "", g)
    return g if re.search(r"[a-z]", g, re.I) and len(g) <= 30 else ""


def pick(glosses):
    """The plainest English gloss: the one the lexicons give most often, then the shortest."""
    good = [c for c in map(clean, glosses) if c]
    if not good:
        return ""
    return min(good, key=lambda g: (-sum(x.lower() == g.lower() for x in good), len(g.split()), len(g), g))


def sedra(lexeme):
    """SEDRA's entries for a lexeme, cached."""
    p = CACHE / "sedra" / f"{consonants(lexeme)}.json"
    for attempt in range(4):
        try:
            return json.loads(get(SEDRA.format(urllib.parse.quote(lexeme)), p))
        except json.JSONDecodeError:
            p.write_text("[]")
            return []
        except Exception as e:
            if getattr(e, "code", None) == 404:
                p.write_text("[]")
                return []
            time.sleep(2 * (attempt + 1))
    print(f"  SEDRA: no answer for {lexeme}")
    return []


CATEGORY = {"noun": "noun", "verb": "verb", "adjective": "adjective", "particle": "particle", "pronoun": "pronoun",
            "numeral": "numeral", "adverb": "adverb", "idiom": "idiom"}


# syrnt's parts of speech, and the SEDRA IV categories each may be (None: SEDRA doesn't say).
FITS = {"particle": {"particle", "preposition", "conjunction", "adverb", "interjection"}, "noun": {"noun", "adjective", None},
        "adjective": {"adjective", "noun", None}, "numeral": {"numeral", "noun", "adjective", None}}
# The commonest little words, whose lexicon glosses are long lists of senses.
COMMON = {"ܒ": "in", "ܠ": "to", "ܕ": "of", "ܘ": "and", "ܡܢ": "from", "ܥܠ": "on", "ܥܡ": "with", "ܠܘܬ": "to", "ܐܝܟ": "as",
          "ܠܐ": "not", "ܐܠܐ": "but", "ܓܝܪ": "for", "ܕܝܢ": "but", "ܐܦ": "also", "ܐܢ": "if", "ܗܘܐ": "be", "ܐܝܬ": "there is",
          "ܠܝܬ": "there is not", "ܟܠ": "all", "ܗܕܐ": "this", "ܗܢܐ": "this", "ܗܘ": "he", "ܗܝ": "she", "ܗܢܘܢ": "they",
          "ܐܢܐ": "I", "ܐܢܬ": "you", "ܚܢܢ": "we", "ܐܢܬܘܢ": "you", "ܡܢܘ": "who", "ܡܢܐ": "what", "ܡܛܠ": "because",
          "ܗܟܢܐ": "thus", "ܗܫܐ": "now", "ܬܘܒ": "again", "ܟܕ": "when", "ܥܕܡܐ": "until", "ܩܕܡ": "before", "ܒܬܪ": "after",
          "ܫܘܒܚܐ": "glory"}


def meaning(entries, sp, lexeme=""):
    """English for a lexeme of part of speech `sp`: the glosses of its commonest matching lexeme in SEDRA."""
    if lexeme in COMMON and sp != "verb" or lexeme == "ܗܘܐ":
        return COMMON[lexeme]
    fits = FITS.get(sp, {sp})
    fit = [e for e in entries if e.get("category") in fits and e.get("glosses", {}).get("eng")]
    fit = fit or [e for e in entries if e.get("glosses", {}).get("eng")]
    if not fit:
        return ""
    # Homographs: the lexeme with the most forms is the common one; one with only cross-references loses.
    def score(lex):
        es = [e for e in fit if e["lexeme"]["id"] == lex]
        return (bool(pick([g for e in es for g in e["glosses"]["eng"]])), len(es))
    lex = max({e["lexeme"]["id"] for e in fit}, key=score)
    return pick([g for e in fit if e["lexeme"]["id"] == lex for g in e["glosses"]["eng"]])


def grammar(w):
    na = lambda k: w[k] if w[k] not in ("", "NA") else None
    parts = [w["sp"]]
    if w["sp"] == "verb":
        parts.append(" ".join(x for x in (na("vs"), na("vt")) if x))
        pgn = " ".join(x for x in (na("ps"), GENDER.get(w["gn"]), NUMBER.get(w["nu"])) if x)
        if pgn:
            parts.append(pgn)
    else:
        if na("st"):
            parts.append(w["st"])
        gn = " ".join(x for x in (GENDER.get(w["gn"]), NUMBER.get(w["nu"])) if x)
        if gn:
            parts.append(gn)
    if w["root"]:
        parts.append(f"root {w['root']}")
    return " · ".join(p for p in parts if p)


def gloss(w, base):
    if not base:
        return ""
    pre = [PREFIX[ch] for ch in w["prefix"] if ch in PREFIX]
    out = " ".join(pre + [base])
    # ܐܝܬܘܗܝ "he is": the suffix is the subject, which the English "is" already has.
    if w["suffix"] and na_ps(w) and w["lexeme"] not in ("ܐܝܬ", "ܠܝܬ"):
        key = (w["sfps"], w["sfgn"], w["sfnu"]) if w["sfps"] != "1" else (w["sfps"], w["sfnu"])
        pos = POSSESSIVE.get(key)
        if pos:
            out = f"{out} {OBJECT[pos]}" if w["sp"] in ("verb", "particle") else " ".join(pre + [pos, base])
    return out


def na_ps(w):
    return w["sfps"] not in ("", "NA")


WORD = re.compile(r"[ܐ-ݏ܀-܏ܰ-݊]+")
SYRIAC_LETTERS = re.compile(r"[ܐ-ܯݍ-ݏ]")


def split(text):
    """A verse as [(is_word, text)]."""
    out, last = [], 0
    for m in WORD.finditer(text):
        if not SYRIAC_LETTERS.search(m.group()):
            continue
        if m.start() > last:
            out.append((False, text[last:m.start()]))
        out.append((True, m.group()))
        last = m.end()
    if last < len(text):
        out.append((False, text[last:]))
    return out


def main():
    src = LIBRARY / "peshitta.bbli"
    if not src.exists():
        sys.exit(f"no {src}; build it first: python3 tools/crosswire/build.py Peshitta")
    print("syrnt")
    ws = words()
    lexemes = sorted({(w["lexeme"], w["sp"]) for w in ws if w["lexeme"]})
    print(f"  {len(ws)} words, {len({l for l, _ in lexemes})} lexemes; SEDRA glosses")
    with ThreadPoolExecutor(6) as pool:
        entries = dict(zip({l for l, _ in lexemes}, pool.map(sedra, {l for l, _ in lexemes})))
    means = {(l, sp): meaning(entries[l], sp, l) for l, sp in lexemes}
    print(f"  {sum(bool(m) for m in means.values())} of {len(means)} lexeme/part-of-speech pairs have English")

    db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible ORDER BY Book, Chapter, Verse").fetchall()
    info = db.execute("SELECT Information FROM Details").fetchone()[0]
    db.close()

    by_ch = {}
    for w in ws:
        by_ch.setdefault((w["b"], w["c"]), []).append(w)
    verses_by_ch = {}
    for b, c, v, t in rows:
        verses_by_ch.setdefault((b, c), []).append((v, split(t or "")))

    out, tagged, total = [], 0, 0
    for (b, c), vs in verses_by_ch.items():
        mine = [(i, j, consonants(t)) for i, (v, parts) in enumerate(vs) for j, (isw, t) in enumerate(parts) if isw]
        theirs = by_ch.get((b, c), [])
        sm = SequenceMatcher(None, [x[2] for x in mine], [consonants(w["word"]) for w in theirs], autojunk=False)
        hit = {}
        for a, bb, n in sm.get_matching_blocks():
            for k in range(n):
                hit[mine[a + k][:2]] = theirs[bb + k]
        total += len(mine)
        tagged += len(hit)
        for i, (v, parts) in enumerate(vs):
            s, prev_div = [], False
            for j, (isw, t) in enumerate(parts):
                w = hit.get((i, j)) if isw else None
                if w:
                    g = gloss(w, means.get((w["lexeme"], w["sp"]), ""))
                    s.append(f"<div><grk>{t}</grk><tvm>{html.escape(grammar(w))}</tvm><grk>{w['lexeme']}</grk><gra>{html.escape(g) or '—'}</gra></div>")
                    prev_div = True
                elif not isw and prev_div and not t.strip() and j + 1 < len(parts) and hit.get((i, j + 1)):
                    continue  # a div is followed by its own space
                else:
                    s.append(html.escape(t, quote=False))
                    prev_div = False
            out.append((b, c, v, "".join(s).strip()))
        if len(hit) < len(mine) * 0.9:
            print(f"  {BOOKS[b - 40]} {c}: {len(hit)} of {len(mine)} words matched")
    print(f"  {tagged} of {total} words matched ({tagged / total:.1%})")

    about = (info + "<p>This edition shows each word with its English meaning, dictionary form, root and grammar, from "
             "ETCBC's syrnt (the SEDRA 3 database of George A. Kiraz and James W. Bennett, MIT licence) and the glosses of "
             "SEDRA IV (Beth Mardutho, the Syriac Institute). Meanings are of the dictionary word, not translations in context. "
             f"{tagged / total:.0%} of the words are matched; the rest, where SEDRA's text differs, are left as they are. "
             "Built by Two-edged Sword's tools/syriac.</p>")
    p = LIBRARY / "peshitta+.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,0,1,0,0,1)", ("Syriac Peshitta w/ glosses", "Peshitta+", about))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(out)} verses")


if __name__ == "__main__":
    main()
