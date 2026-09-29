# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds beza1598.bbli ("Greek NT: Beza (1598)"): Theodore Beza's fourth folio Greek New Testament
of 1598, the edition the KJV's translators had most in hand.

    python3 tools/beza/build.py

Writes to the app's modules folder, where the app finds it after Library → Rescan.

Source: the textus-receptus.com wiki, a page per chapter ("Luke 2 Greek NT: Beza's Textus Receptus
(1598)"; a one-chapter book is "3 John Greek NT: …" or "Jude 1 Greek NT: …"), read through its
MediaWiki API (textus-receptus.com/api.php). Accented Greek, a verse to a line, numbered as the KJV.
The wiki states no licence for its transcription; the 1598 text itself is public domain. It is a
transcription, and readings in it that are not Beza's may remain (see the check below).

A chapter the wiki lacks, or whose page holds another chapter's text (Matthew 22 and Titus 2 do),
is taken from Scrivener's 1894 text, which follows Beza except in some 190 places: the wiki's own
accented Scrivener page, or failing that Maurice Robinson's (public domain,
github.com/byztxt/greektext-scrivener: unaccented, in a Latin transliteration, converted here).
The Details say which chapters.

Where the wiki runs two verses together (Matt 17:20–21) or divides a chapter otherwise than the KJV
(John 1:38–39), the chapter is divided again at the KJV's verses by lining its words up with Greek
NT TR+'s (whose base is Stephanus 1550), or without TR+ in the library, STEPBible's TR (tools/stepbible.py). The wiki's editorial notes, which are in English ("(*omits
σου)", "(Checked)", "Beza does not have this verse", a caption), are dropped.

The pages' wikitext is reduced to the verses: templates ({{…}}), references, links, tags and
headings are dropped, and the text is split at the verse numbers, which must run 1, 2, 3… The
build checks every chapter's verse count against the KJV, compares the text word for word with
Greek NT TR+ (Stephanus 1550, whose base text Beza revised lightly), and prints the chapters that
differ most, so a bad page shows.

Downloads are cached in ~/Library/Caches/Two-edged Sword/beza.

The wiki's transcription isn't Beza's throughout, and is corrected with TR+ (Stephanus 1550, with
Scrivener 1894's readings marked) and the wiki's own Scrivener pages, since Scrivener follows Beza
but for some 190 places: where Stephanus and Scrivener differ and the wiki has Stephanus' reading
(Luke 2:22 αὐτῶν for Beza's αὐτῆς), Scrivener's, accented; modern spellings (-λημψ-, ἦλθαν) as Beza
printed them (-ληψ-, ἦλθον); words typed without accents (βιβλου) with their accented form; and
verses typed without punctuation get Scrivener's, with capitals on the names Beza capitalises; a
word misspelt in the typing (σονετέλεσεν) or in a later edition's form (Μαθθαῖος), found nowhere else
in Beza, becomes the word Stephanus and Scrivener both have in its place, when it's a letter or two
from it.
Enclitics (μου, τις) and elided words (δι᾽) are left unaccented. These corrections need TR+ (e-Sword's,
for personal use); without it the transcription is kept as it is.
"""
import html, json, os, re, sqlite3, sys, time, unicodedata, urllib.parse, urllib.request
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import LIBRARY, find  # noqa: E402
CACHE = HOME / "Library/Caches/Two-edged Sword/beza"
API = "https://textus-receptus.com/api.php"
SCRIVENER = "https://raw.githubusercontent.com/byztxt/greektext-scrivener/master/textonly/{}.SCV"
UA = "Two-edged Sword (tools/beza; personal Bible study app)"
SUFFIX = "Greek NT: Beza's Textus Receptus (1598)"

BOOKS = ["Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
         "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter",
         "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"]
SCV = ["MT", "MR", "LU", "JOH", "AC", "RO", "1CO", "2CO", "GA", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
       "1PE", "2PE", "1JO", "2JO", "3JO", "JUDE", "RE"]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def pages(titles):
    """{asked title: wikitext or None}, from the cache or the API, 50 at a time."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out, todo = {}, []
    for t in titles:
        p = CACHE / (re.sub(r"[^\w]+", "_", t) + ".wiki")
        if p.exists():
            out[t] = p.read_text() or None
        else:
            todo.append(t)
    for k in range(0, len(todo), 50):
        batch = todo[k:k + 50]
        q = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "redirects": 1,
                                    "titles": "|".join(batch), "format": "json"})
        d = json.loads(fetch(f"{API}?{q}"))["query"]
        # Asked title -> the page it resolves to (normalised, then redirected).
        where = {t: t for t in batch}
        for n in d.get("normalized", []):
            where = {a: (n["to"] if b == n["from"] else b) for a, b in where.items()}
        for r in d.get("redirects", []):
            where = {a: (r["to"] if b == r["from"] else b) for a, b in where.items()}
        text = {p["title"]: (None if "missing" in p else p["revisions"][0]["slots"]["main"]["*"]) for p in d["pages"].values()}
        for t in batch:
            w = text.get(where[t])
            out[t] = w
            (CACHE / (re.sub(r"[^\w]+", "_", t) + ".wiki")).write_text(w or "")
        print(f"  fetched {min(k + 50, len(todo))} of {len(todo)} pages", end="\r", flush=True)
        time.sleep(1.5)
    if todo:
        print()
    return out


def strip(w):
    """Wikitext to plain text: templates, references, comments, tags, links and headings out."""
    w = re.split(r"^==", w, maxsplit=1, flags=re.M)[0]  # "==See Also==" and the rest: links to other chapters
    w = re.sub(r"<!--.*?-->", " ", w, flags=re.S)
    w = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", " ", w, flags=re.S)
    while re.search(r"\{\{[^{}]*\}\}", w):
        w = re.sub(r"\{\{[^{}]*\}\}", " ", w)
    w = re.sub(r"\{\|.*?\|\}", " ", w, flags=re.S)  # tables
    w = re.sub(r"^=+.*?=+\s*$", " ", w, flags=re.M)  # headings
    w = re.sub(r"\[\[\d+\]\]", " ", w)  # a bare Strong's link
    w = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", w)
    w = re.sub(r"^\s*\*\s*", "", w, flags=re.M)  # "* 1 Ἰδὼν…": a verse as a list item
    w = re.sub(r"\[https?://[^\s\]]+\s*([^\]]*)\]", r"\1", w)
    w = re.sub(r"'''?", "", w)
    w = re.sub(r"<[^>]+>", " ", w)
    w = html.unescape(w)
    # Latin letters typed for their Greek look-alikes ("ἸΗΣΟΥN").
    return re.sub(r"[ABEHIKMNOPTXYZov](?=[\u0370-\u03ff\u1f00-\u1fff])|(?<=[\u0370-\u03ff\u1f00-\u1fff])[ABEHIKMNOPTXYZov]", lambda m: LOOKALIKE[m.group()], w)


LOOKALIKE = dict(zip("ABEHIKMNOPTXYZov", "ΑΒΕΗΙΚΜΝΟΡΤΧΥΖον"))


def verses(w):
    """{verse: text} from a chapter's wikitext, split at its verse numbers (which may skip one,
    when the wiki runs two verses together)."""
    t = strip(w)
    marks = [m for m in re.finditer(r"(?<![\d])(\d{1,3})(?=\s*[^\d\s])", t)]
    out, last = {}, 0
    for n, m in enumerate(marks):
        v = int(m.group(1))
        if not last < v <= last + 3:
            raise ValueError(f"verse {v} after {last}")
        end = marks[n + 1].start() if n + 1 < len(marks) else len(t)
        out[v] = tidy(t[m.end():end])
        last = v
    return out


def tidy(t):
    """A verse without the wiki's editorial notes, which are in English: "(*omits σου)", "(Checked)",
    "Beza does not have this verse", a caption; and without its marks for them (*, |)."""
    t = re.sub(r"\([^()]*[A-Za-z][^()]*\)", " ", t)
    t = re.sub(r"[A-Za-z][A-Za-z0-9 ,.;:'’()\-]*", " ", t)
    t = re.sub(r"[*|]", " ", t)
    t = re.sub(r"[ʹ`]", "", t)  # stray marks typed inside words: "ΠΑʹΤΕΡ", "`Λέγουσιν"
    return re.sub(r"\s+([,.;·])", r"\1", re.sub(r"\s+", " ", t)).strip()


def redivide(vs, ref):
    """The chapter's text divided again at the KJV's verses, by lining its words up with TR+'s
    (ref: {verse: words}), for a chapter the wiki divides otherwise or runs verses together in."""
    toks = re.findall(r"\S+", " ".join(vs[v] for v in sorted(vs)))
    ws = [(k, "".join(plain_greek(t))) for k, t in enumerate(toks)]
    ws = [(k, w) for k, w in ws if w]
    flat, owner = [], []
    for v in sorted(ref):
        flat += ref[v]
        owner += [v] * len(ref[v])
    first, last, lead = {}, {}, {}
    at = {}
    for n, v in enumerate(owner):
        at.setdefault(v, n)
    for m in SequenceMatcher(None, [w for _, w in ws], flat, autojunk=False).get_matching_blocks():
        for k in range(m.size):
            v = owner[m.b + k]
            if v not in first:
                first[v], lead[v] = m.a + k, m.b + k - at[v]
            last[v] = m.a + k
    # A verse starts at its first matched word, or as many words before it as TR+ has before that
    # word ("Εἶπε δὲ ὁ Φίλιππος", where TR+ spells it εἶπεν), but not back into the verse before.
    cuts = []
    order = sorted(first, key=lambda v: first[v])
    for n, v in enumerate(order):
        k = first[v]
        floor = last[order[n - 1]] + 1 if n else 0
        k = max(floor, k - lead[v])
        cuts.append((ws[k][0] if k < len(ws) else len(toks), v))
    out = {}
    for n, (k, v) in enumerate(cuts):
        start = 0 if n == 0 else k
        end = cuts[n + 1][0] if n + 1 < len(cuts) else len(toks)
        out[v] = " ".join(toks[start:end])
    return out


def accented(words, ref_tokens):
    """Scrivener's unaccented words given Stephanus's accents where the two have the same word."""
    plain = ["".join(plain_greek(t)) for t in ref_tokens]
    out = list(words)
    sm = SequenceMatcher(None, ["".join(plain_greek(w)) for w in words], plain, autojunk=False)
    for m in sm.get_matching_blocks():
        for k in range(m.size):
            out[m.a + k] = re.sub(r"[^\u0370-\u03ff\u1f00-\u1fff]", "", ref_tokens[m.b + k]) + re.sub(r"[\u0370-\u03ff\u1f00-\u1fff]", "", words[m.a + k])
    return out


# Scrivener's transliteration (Robinson's plain text): unaccented, v for final sigma.
TRANS = dict(zip("abgdezhyiklmnxoprstufcqw", "αβγδεζηθικλμνξοπρστυφχψω"))


def greek(word):
    g = "".join(TRANS.get(ch, ch) for ch in word)
    return re.sub(r"σ\b", "ς", g.replace("v", "ς"))


def scrivener(book):
    """{(chapter, verse): text} for a book, from Scrivener 1894."""
    p = CACHE / f"{SCV[book]}.SCV"
    if not p.exists():
        p.write_bytes(fetch(SCRIVENER.format(SCV[book])))
    out, cur = {}, None
    for line in p.read_text(encoding="latin-1").splitlines():
        m = re.match(r"\s*(\d+):(\d+)\s*(.*)", line)
        if m:
            cur = (int(m.group(1)), int(m.group(2)))
            line = m.group(3)
        line = re.sub(r"\[.*?\]", "", line)
        if cur:
            out[cur] = (out.get(cur, "") + " " + " ".join(greek(w) for w in line.split())).strip()
    return out


def tr_reference():
    """The Textus Receptus to line the wiki's text up with: Greek NT TR+ from the library when it's
    there (Stephanus 1550 with Scrivener 1894's readings marked | Stephanus | Scrivener |), else
    STEPBible's TAGNT's TR (Scrivener 1894 alone, CC BY 4.0), as plain words. Returns the verses
    and which it is."""
    if find("greeknttr+.bbli").exists():
        return {(b, c, v): t for b, c, v, t in library_chapters("greeknttr+.bbli")}, "TR+"
    from stepbible import has, tagnt
    return {k: " ".join(w.greek for w in ws if has(w, "TR")) for k, ws in tagnt().items()}, "STEPBible's TR (Scrivener 1894)"


def library_chapters(name):
    db = sqlite3.connect(f"file:{find(name)}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Book BETWEEN 40 AND 66").fetchall()
    db.close()
    return rows


def plain_greek(t):
    """Greek words only, accents and case ignored, for comparing editions."""
    t = re.sub(r"<num>.*?</num>|<tvm>.*?</tvm>", " ", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    if t.count("|") and t.count("|") % 3 == 0:
        t = re.sub(r"\|([^|]*)\|[^|]*\|", r"\1", t)  # TR+'s "| base | other |": the base
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).replace("ς", "σ")
    return re.findall(r"[α-ω]+", t)


def alike(a, b):
    return sum(m.size for m in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()) / max(len(a), len(b), 1)


def tr_tokens(t, other=False):
    """TR+'s verse as accented words with their punctuation: its base (Stephanus 1550), or with
    other=True the readings it marks | base | other | (Scrivener 1894)."""
    t = re.sub(r"<num>.*?</num>|<tvm>.*?</tvm>", " ", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    if t.count("|") and t.count("|") % 3 == 0:
        t = re.sub(r"\|([^|]*)\|([^|]*)\|", (lambda m: m.group(2)) if other else (lambda m: m.group(1)), t)
    return [x for x in re.findall(r"\S+", t) if plain_greek(x)]


def key(tok):
    k = plain_greek(tok)
    return k[0] if k else ""


SLIPS = []  # the typing slips put right, for the build's report
PUNCT = re.compile(r"[.,;:·\u0387\u037e]+$")


def scrivener_pages(chapters):
    """{(book, chapter, verse): accented text} from the wiki's own Scrivener 1894 pages."""
    titles = {}
    for b, c in chapters:
        name = BOOKS[b - 40]
        titles[(b, c)] = [f"{name} {c} Greek NT: Scrivener's Textus Receptus (1894)", f"{name} Greek NT: Scrivener's Textus Receptus (1894)"]
    got = pages([t for ts in titles.values() for t in ts])
    out = {}
    for (b, c), ts in titles.items():
        w = next((got[t] for t in ts if got.get(t)), None)
        try:
            vs = verses(w) if w else {}
        except ValueError:
            vs = {}
        for v, t in vs.items():
            out[(b, c, v)] = t
    return out


def correct(rows, trraw, scriv):
    """What the wiki's transcription took from elsewhere, put back as Beza printed it, with TR+ as
    the guide (its base is Stephanus 1550, its marked readings Scrivener 1894, who follows Beza
    but for some 190 places):
    - Where Stephanus and Scrivener differ, Beza is almost always Scrivener's source; where the
      wiki has Stephanus' reading there instead (Luke 2:22 αὐτῶν for αὐτῆς), Scrivener's.
    - Modern spellings (συλλημφθῆναι, ἦλθαν) where TR+ has the forms Beza printed (συλληφθῆναι, ἦλθον).
    - A verse typed without punctuation or capitals gets Stephanus' where the words are the same.
    Returns the rows and counts of each."""
    counts = {"readings": 0, "spellings": 0, "punctuated": 0, "slips": 0}
    samples = []
    out = []
    # Each word's commonest accented form (TR+ has none), from the wiki's Beza and Scrivener.
    forms = {}
    accented = lambda w: any(unicodedata.combining(ch) for ch in unicodedata.normalize("NFD", w))
    for t in [r[3] for r in rows] + list(scriv.values()):
        for x in re.findall(r"\S+", t):
            w = PUNCT.sub("", x)
            if key(w) and accented(w):
                forms.setdefault(key(w), {}).setdefault(w, 0)
                forms[key(w)][w] += 1
    best = {k: max(v, key=v.get) for k, v in forms.items()}
    # Words rightly written without an accent (enclitics: μου, σου, τις; elided: δι᾽) as Scrivener
    # writes them; and the words Beza's own text writes with a capital (names), as it writes them.
    bare_ok = {PUNCT.sub("", x) for t in scriv.values() for x in re.findall(r"\S+", t) if not accented(PUNCT.sub("", x))}
    caps = {}
    for r in rows:
        for n, x in enumerate(re.findall(r"\S+", r[3])):
            if n and key(x):
                caps.setdefault(key(x), [0, 0])[x[:1].isupper()] += 1
    proper = {k for k, (lo, up) in caps.items() if up > lo}
    freq = {}
    for r in rows:
        for x in re.findall(r"\S+", r[3]):
            freq[key(x)] = freq.get(key(x), 0) + 1
    for b, c, v, t in rows:
        raw = trraw.get((b, c, v))
        if not raw:
            out.append((b, c, v, t))
            continue
        btok = re.findall(r"\S+", t)
        stok, ctok = tr_tokens(raw), tr_tokens(raw, other=True)
        bk, sk, ck = [key(x) for x in btok], [key(x) for x in stok], [key(x) for x in ctok]
        # Scrivener's words accented: from the wiki's Scrivener page when its words are TR+'s,
        # else each word's commonest accented form.
        wiki = [x for x in re.findall(r"\S+", scriv.get((b, c, v), "")) if key(x)]
        if [key(x) for x in wiki] == ck:
            ctok = wiki
        else:
            ctok = [best.get(key(x), x) for x in ctok]
        s2b = {}
        for m in SequenceMatcher(None, bk, sk, autojunk=False).get_matching_blocks():
            for k in range(m.size):
                s2b[m.b + k] = m.a + k
        edits = []  # (start, end, tokens) in btok
        if sk != ck:
            for op, i1, i2, j1, j2 in SequenceMatcher(None, sk, ck, autojunk=False).get_opcodes():
                if op == "equal":
                    continue
                lb = s2b[i1 - 1] + 1 if i1 > 0 and i1 - 1 in s2b else (0 if i1 == 0 else None)
                rb = s2b[i2] if i2 in s2b else (len(bk) if i2 == len(sk) else None)
                if lb is None or rb is None or lb > rb:
                    continue
                if "".join(sk[i1:i2]) == "".join(ck[j1:j2]):
                    continue  # only where the words are divided (διαπαντὸς, διὰ παντὸς)
                if bk[lb:rb] == sk[i1:i2]:  # the wiki follows Stephanus here, not Beza
                    new = [PUNCT.sub("", x) for x in ctok[j1:j2]]
                    tail = PUNCT.search(btok[rb - 1]) if rb > lb else None
                    if new and tail:
                        new[-1] += tail.group()
                    edits.append((lb, rb, new))
                    counts["readings"] += 1
                    if len(samples) < 12:
                        samples.append(f"{BOOKS[b - 40]} {c}:{v} {' '.join(btok[lb:rb]) or '—'} → {' '.join(ctok[j1:j2]) or '—'}")
        # Modern spellings, where Stephanus and Scrivener agree on the older form.
        for op, i1, i2, j1, j2 in SequenceMatcher(None, bk, sk, autojunk=False).get_opcodes():
            if op != "replace" or i2 - i1 != j2 - j1:
                continue
            for k in range(i2 - i1):
                a, o = bk[i1 + k], sk[j1 + k]
                if any(e[0] <= i1 + k < e[1] for e in edits):
                    continue
                if a.replace("λημψ", "ληψ").replace("λημφ", "ληφ") == o or (a.endswith("αν") and o.endswith("ον") and a[:-2] == o[:-2]):
                    tail = PUNCT.search(btok[i1 + k])
                    edits.append((i1 + k, i1 + k + 1, [best.get(o, PUNCT.sub("", stok[j1 + k])) + (tail.group() if tail else "")]))
                    counts["spellings"] += 1
                # A slip in the typing (σονετέλεσεν, ἀκωύειν, πάντεε) or a later edition's form (Μαθθαῖος,
                # Ἰσκαριώτου): found nowhere else in Beza, and in its place both Stephanus and Scrivener
                # (who follows Beza) have the same word, a letter or two from it.
                elif (a.rstrip("ν") != o.rstrip("ν") and freq.get(a, 0) <= 2 and a not in {key(x) for x in wiki}
                      and o in {key(x) for x in wiki} and o in best and not btok[i1 + k].isupper()
                      and SequenceMatcher(None, a, o).ratio() >= 0.75 and abs(len(a) - len(o)) <= 2):
                    tail = PUNCT.search(btok[i1 + k])
                    fixed = best[o]
                    if btok[i1 + k][:1].isupper():
                        fixed = fixed[:1].upper() + fixed[1:]
                    edits.append((i1 + k, i1 + k + 1, [fixed + (tail.group() if tail else "")]))
                    counts["slips"] += 1
                    SLIPS.append(f"{BOOKS[b - 40]} {c}:{v} {btok[i1 + k]} → {fixed}")
        for lb, rb, new in sorted(edits, key=lambda e: -e[0]):
            btok[lb:rb] = new
        # A verse typed without punctuation (and in small letters) gets Scrivener's punctuation (the
        # wiki's page) where the words are the same, and capitals on the names Beza writes with one.
        bare = btok and not any(PUNCT.search(x) for x in btok)
        bk = [key(x) for x in btok]
        wk = [key(x) for x in wiki]
        for m in SequenceMatcher(None, bk, wk, autojunk=False).get_matching_blocks():
            for k in range(m.size):
                x, y = btok[m.a + k], wiki[m.b + k]
                word = PUNCT.sub("", x) if bare else x
                if bare and m.a + k and key(x) in proper and word[:1].islower():
                    word = word[:1].upper() + word[1:]
                if bare:
                    tail = PUNCT.search(y)
                    word += tail.group() if tail else ""
                btok[m.a + k] = word
        counts["punctuated"] += bool(bare)
        # A word typed without any accent or breathing (βιβλου): its accented form elsewhere.
        for k, x in enumerate(btok):
            w = PUNCT.sub("", x)
            if re.search(r"[()]", w):
                continue  # "σου)": left as it is
            if (len(w) >= 3 and not accented(w) and not re.search(r"[᾽’'ʼ\u1fbd]", w) and w not in bare_ok and w.lower() not in bare_ok
                    and best.get(key(w), w) != w):
                btok[k] = best[key(w)] + x[len(w):]
                counts["spellings"] += 1
        text = " ".join(btok)
        # Beza didn't write -λημψ-/-λημφ- (παραλημφθήσεται, at Luke 17:36 where Stephanus has no verse).
        text, n = re.subn(r"(λ[ηή])μ([φψ])", r"\1\2", text)
        counts["spellings"] += n
        text = re.sub(r"([.,;:·\u0387])[.,;:·\u0387]+", r"\1", text)
        out.append((b, c, v, text))
    return out, counts, samples


def main():
    kjv = {}
    for b, c, v, _ in library_chapters("kjv.bbli"):
        kjv.setdefault((b, c), set()).add(v)
    chapters = sorted(k for k in kjv if 40 <= k[0] <= 66)
    titles = {}
    for b, c in chapters:
        name = BOOKS[b - 40]
        titles[(b, c)] = [f"{name} {c} {SUFFIX}"] + ([f"{name} {SUFFIX}"] if max(cc for bb, cc in chapters if bb == b) == 1 else [])
    got = pages([t for ts in titles.values() for t in ts])
    trraw, source = tr_reference()
    print(f"reference text: {source}")
    tr = {k: plain_greek(t) or plain_greek(re.sub(r"\|[^|]*\|([^|]*)\|", r"\1", t or "")) for k, t in trraw.items()}
    rows, from_scrivener, redivided, problems = [], [], [], []
    for b, c in chapters:
        name = f"{BOOKS[b - 40]} {c}"
        ref = {v: tr.get((b, c, v), []) for v in sorted(kjv[(b, c)])}
        w = next((got[t] for t in titles[(b, c)] if got.get(t)), None)
        vs = None
        if w:
            try:
                vs = verses(w)
            except ValueError as e:
                problems.append(f"{name}: {e}")
        if vs:
            words = [x for v in sorted(vs) for x in plain_greek(vs[v])]
            share = alike(words, [x for v in ref for x in ref[v]])
            if share < 0.6:
                problems.append(f"{name}: the page has another chapter's text ({share:.0%} like Stephanus)")
                vs = None
        if vs and (set(vs) != set(ref) or any(alike(plain_greek(vs.get(v, "")), ref[v]) < 0.6 for v in ref if ref[v])):
            vs = redivide(vs, ref)
            redivided.append(name)
        if not vs:
            # The wiki's own Scrivener 1894 page for the chapter: accented, as Beza's pages are.
            sw = pages([f"{BOOKS[b - 40]} {c} Greek NT: Scrivener's Textus Receptus (1894)"])
            try:
                vs = verses(next(iter(sw.values())) or "")
            except ValueError:
                vs = None
            if vs and set(vs) == set(ref):
                from_scrivener.append(name)
            else:
                vs = None
        if not vs:
            sc = scrivener(b - 40)
            vs = {}
            for (cc, v), t in sc.items():
                if cc == c:
                    toks = re.findall(r"\S+", re.sub(r"<[^>]+>|\|[^|]*\|[^|]*\||<num>.*?</num>|<tvm>.*?</tvm>", " ", trraw.get((b, c, v), "")))
                    vs[v] = " ".join(accented(t.split(), [x for x in toks if plain_greek(x)]))
            from_scrivener.append(name)
        have, want = set(vs), kjv[(b, c)]
        if have != want:
            problems.append(f"{name}: {len(have)} verses, KJV {len(want)}; none for {sorted(want - have)[:8]}, beyond {sorted(have - want)[:8]}")
        rows += [(b, c, v, t) for v, t in sorted(vs.items()) if t]
    if source == "TR+":
        rows, fixed, samples = correct(rows, trraw, scrivener_pages(chapters))
        print(f"typing slips and later editions' forms put right: {fixed['slips']}; e.g. " + "; ".join(SLIPS[:14]))
        print(f"put back as Beza printed it: {fixed['readings']} readings the wiki took from Stephanus, {fixed['spellings']} modern spellings; "
              f"{fixed['punctuated']} verses typed without punctuation given Scrivener's")
        for x in samples:
            print("  " + x)
    else:
        print("no Greek NT TR+ in the library: the transcription is not corrected (that needs Stephanus' readings)")
    print(f"{len(chapters)} chapters, {len(rows)} verses; divided again by {source}: {len(redivided)} ({', '.join(redivided)}); from Scrivener: {', '.join(from_scrivener) or 'none'}")
    for p in problems:
        print("  " + p)

    # Word-for-word agreement with Stephanus 1550 (TR+'s base text), chapter by chapter.
    if tr:
        same = total = 0
        by_ch = {}
        for b, c, v, t in rows:
            a, s = plain_greek(t), tr.get((b, c, v), [])
            m = sum(x.size for x in SequenceMatcher(None, a, s, autojunk=False).get_matching_blocks())
            same += m
            total += max(len(a), len(s))
            x = by_ch.setdefault((b, c), [0, 0])
            x[0] += m
            x[1] += max(len(a), len(s))
        print(f"agreement with {'Stephanus 1550 (TR+)' if source == 'TR+' else source}: {same / max(total, 1):.1%} of words")
        worst = sorted(by_ch.items(), key=lambda kv: kv[1][0] / max(kv[1][1], 1))[:6]
        print("  least alike: " + ", ".join(f"{BOOKS[b - 40]} {c} {m / max(n, 1):.0%}" for (b, c), (m, n) in worst))

    odd = [(b, c, v, t) for b, c, v, t in rows if re.search(r"[A-Za-z0-9{}\[\]<>|=]", t)]
    if odd:
        print(f"  {len(odd)} verses with Latin letters, digits or markup, e.g. {odd[0][:3]}: {odd[0][3][:80]}")

    info = ("<p>Theodore Beza's Greek New Testament of 1598 (his fourth folio edition), the Greek text the KJV's translators "
            "had most in hand, as transcribed on the textus-receptus.com wiki (the 1598 text is public domain; the wiki states no "
            "licence for its transcription). Accented; verses numbered as in the KJV."
            + (f" Where the wiki's page is missing or holds another chapter, the chapter is Scrivener's 1894 text, which follows Beza except in some 190 places: {', '.join(from_scrivener)}." if from_scrivener else "")
            + " Built by Two-edged Sword's tools/beza.</p>")
    p = LIBRARY / "beza1598.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,0,1,0,0,0)", ("Greek NT: Beza (1598)", "Beza 1598", info))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(rows)} verses")


if __name__ == "__main__":
    main()
