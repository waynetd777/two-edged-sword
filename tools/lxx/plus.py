"""Builds lxx_brenton+.bbli ("Septuagint (Greek, Brenton 1844) w/ glosses"): the Greek Brenton
Septuagint word by word, each word with English under it, its Strong's number and its grammar, as
Greek NT INT+ has them.

    python3 tools/lxx/plus.py

Reads lxx_brenton.bbli (tools/lxx/build.py builds it) and the library's Greek OT+ (greekot+.bbli)
and Greek NTs with Strong's numbers, and writes lxx_brenton+.bbli beside them; the app finds it after
Library → Rescan.

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
number and grammar most often given to the same form in Greek OT+ and the Greek NTs, if it occurs
there. Greek OT+'s numbers are checked against the Greek NTs': where the NTs give a form one number
nearly always and practically never Greek OT+'s, the NTs' is taken (Greek OT+ has γῆ, earth, as
G1065, γε, throughout). The gloss is TBESG's for the number; a name with no number is transliterated.

Downloads are cached in ~/Library/Caches/Two-edged Sword/lxx.
"""
import html, os, re, sqlite3, sys, unicodedata, urllib.parse, urllib.request
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = Path(os.environ.get("ESWORD_LIBRARY") or HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
CACHE = HOME / "Library/Caches/Two-edged Sword/lxx"
TBESG = ("https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
         + urllib.parse.quote("TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt"))
TAGGED_NT = ["greeknttr+.bbli", "greekntbyz+.bbli", "greekntwh+.bbli"]
BOOK_NAMES = {67: "Tobit", 68: "Judith", 69: "Wisdom", 70: "Sirach", 71: "Baruch", 72: "1 Maccabees", 73: "2 Maccabees",
              74: "1 Esdras", 76: "3 Maccabees", 77: "4 Maccabees", 78: "Prayer of Manasseh"}


def get(url, name):
    p = CACHE / name
    if not p.exists() or not p.stat().st_size:
        p.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Two-edged Sword (tools/lxx)"})
        with urllib.request.urlopen(req, timeout=300) as r:
            p.write_bytes(r.read())
    return p


HEADWORD = {}  # "G2400": "ιδου", TBESG's headword for each number, as key() has it


def glosses():
    """{"G0746": "beginning", …}: each number's first TBESG entry's gloss, its head word."""
    out = {}
    for line in get(TBESG, "TBESG.txt").read_text(encoding="utf-8-sig").split("\n"):
        f = line.split("\t")
        if len(f) > 6 and re.fullmatch(r"G\d{4}", f[0]) and f[0] not in out and f[6].strip():
            HEADWORD[f[0]] = key(f[3])
            g = f[6].split(":")[0].strip()
            g = re.sub(r"^(?:to|an?)\s+", "", g)
            out[f[0]] = g
    return out


def key(w):
    """A word for comparing editions: lower case, no accents or breathings, σ for ς, no closing
    movable nu (ἐστιν, ἐστι), letters only."""
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(ch for ch in w if not unicodedata.combining(ch)).replace("ς", "σ")
    w = re.sub(r"[^α-ω]", "", w)
    if len(w) > 3 and w.endswith("ν") and w[-2] in "ιε":
        w = w[:-1]
    return w


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


def library(name, where=""):
    db = sqlite3.connect(f"file:{LIBRARY / name}?mode=ro", uri=True)
    rows = db.execute(f"SELECT Book, Chapter, Verse, Scripture FROM Bible {where} ORDER BY Book, Chapter, Verse").fetchall()
    db.close()
    return rows


# Robinson's grammar codes, spelled out.
POS = {"N": "noun", "V": "verb", "A": "adjective", "T": "article", "P": "pronoun", "R": "relative pronoun", "C": "reciprocal pronoun",
       "D": "demonstrative pronoun", "K": "correlative pronoun", "I": "interrogative pronoun", "X": "indefinite pronoun",
       "Q": "correlative pronoun", "F": "reflexive pronoun", "S": "possessive pronoun", "RI": "relative pronoun", "M": "numeral"}
WORDS = {"PREP": "preposition", "CONJ": "conjunction", "ADV": "adverb", "PRT": "particle", "INJ": "interjection", "COND": "conjunction",
         "HEB": "Hebrew word", "ARAM": "Aramaic word", "PRT-N": "particle · negative", "CONJ-N": "conjunction · negative",
         "ADV-N": "adverb · negative", "ADV-I": "adverb · interrogative", "ADV-C": "adverb · comparative", "ADV-S": "adverb · superlative",
         "ADV-K": "adverb · correlative", "PRT-I": "particle · interrogative", "COND-K": "conjunction · correlative"}
CASE = {"N": "nom.", "G": "gen.", "D": "dat.", "A": "acc.", "V": "voc."}
NUMBER = {"S": "sing.", "P": "plur."}
GENDER = {"M": "masc.", "F": "fem.", "N": "neut."}
TENSE = {"P": "present", "I": "imperfect", "F": "future", "A": "aorist", "R": "perfect", "L": "pluperfect", "X": ""}
VOICE = {"A": "active", "M": "middle", "P": "passive", "E": "middle or passive", "D": "middle", "O": "passive", "N": "middle or passive",
         "Q": "active", "X": ""}
MOOD = {"I": "indicative", "S": "subjunctive", "O": "optative", "M": "imperative", "N": "infinitive", "P": "participle", "R": "imperative"}
UNKNOWN = Counter()
FIXED = Counter()


def cng(s):
    """"NSM" -> "nom. masc. sing."; a person first for pronouns ("1GS")."""
    person = ""
    if s[:1] in "123":
        person, s = s[0], s[1:]
    parts = [CASE.get(s[:1], ""), GENDER.get(s[2:3], ""), NUMBER.get(s[1:2], "")]
    return " ".join(x for x in [person] + parts if x)


def grammar(code):
    """A Robinson code as words: "V-AAI-3S" -> "verb · aorist active indicative · 3 sing."."""
    if not code:
        return ""
    c = re.sub(r"[\]\s]+", "-", code.strip()).strip("-")  # "V] PAPGP", "VF FAI3P"
    c = re.sub(r"^(VF?-[A-Z2]{3})(\d[SP])$", r"\1-\2", c)  # "V-FAI3P"
    c = re.sub(r"^(V-[A-Z2]{3})([NGDAV][SP][MFN])$", r"\1-\2", c)  # "V-PAPGP…"
    if c in WORDS:
        return WORDS[c]
    head, *rest = c.split("-")
    if head == "N" and rest and rest[0] in ("PRI", "LI", "OI"):
        return {"PRI": "name", "LI": "letter", "OI": "noun"}[rest[0]]
    if head == "A" and rest and rest[0] == "NUI":
        return "numeral"
    if head in ("V", "VF"):
        if not rest:
            return "verb"
        tvm = rest[0]
        second = tvm.startswith("2")
        tvm = tvm.lstrip("2")
        t, v, m = (tvm + "   ")[:3]
        desc = " ".join(x for x in [("second " if second else "") + TENSE.get(t, ""), VOICE.get(v, ""), MOOD.get(m, "")] if x.strip())
        out = ["verb", desc]
        if len(rest) > 1:
            out.append(cng(rest[1]) if m == "P" else " ".join(x for x in [rest[1][:1] if rest[1][:1] in "123" else "", NUMBER.get(rest[1][-1:], "")] if x))
        return " · ".join(x for x in out if x)
    if head in POS:
        out = [POS[head]]
        if rest:
            out.append(cng(rest[0]))
        return " · ".join(x for x in out if x)
    UNKNOWN[c] += 1
    return c


TRANSLIT = dict(zip("αβγδεζηθικλμνξοπρστυφχψω", ["a", "b", "g", "d", "e", "z", "ē", "th", "i", "k", "l", "m", "n", "x", "o", "p", "r", "s", "s", "t", "u", "ph", "ch", "ps", "ō"]))


def translit(w):
    k = unicodedata.normalize("NFD", w.lower())
    k = "".join(ch for ch in k if not unicodedata.combining(ch))
    t = "".join(TRANSLIT.get(ch, "") for ch in k)
    return t.capitalize()


def similar(a, b):
    return a == b or (min(len(a), len(b)) >= 3 and SequenceMatcher(None, a, b).ratio() >= 0.75)


GREEK_WORD = re.compile(r"[Ͱ-Ͽἀ-῿᾽᾿᾽’']+")


def main():
    gl = glosses()
    brenton = library("lxx_brenton.bbli")
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
    for name in ["greekot+.bbli"] + TAGGED_NT:
        if (LIBRARY / name).exists():
            for _, _, _, t in library(name):
                for k, n, g in tagged(t):
                    if n:
                        forms[k][(n, g)] += 1
    common = {k: c.most_common(1)[0][0] for k, c in forms.items()}
    # Greek OT+'s numbers checked against the Greek NTs': where the NTs give a form one number
    # (90% of the time or more) and practically never Greek OT+'s, Greek OT+'s is a slip in its
    # tagging, however often it's made (it has γῆ as G1065, γε, throughout) and the NTs' is taken.
    # A form the NTs give several (η: the article, "which", "or") is left as Greek OT+ has it.
    nt = defaultdict(Counter)
    for name in TAGGED_NT:
        if (LIBRARY / name).exists():
            for _, _, _, t in library(name):
                for k, n, _ in tagged(t):
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
                box += f"<tvm>{html.escape(grammar(g), quote=False)}</tvm>"
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
    p = LIBRARY / "lxx_brenton+.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,1,0,1,1,0)", ("Septuagint (Greek, Brenton 1844) w/ glosses", "LXX-Brenton+", info))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(out)} verses")


if __name__ == "__main__":
    main()
