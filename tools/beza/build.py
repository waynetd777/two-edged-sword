"""Builds beza1598.bbli ("Greek NT: Beza (1598)"): Theodore Beza's fourth folio Greek New Testament
of 1598, the edition the KJV's translators had most in hand.

    python3 tools/beza/build.py

Writes to the e-Sword library, where the app finds it after Library → Rescan.

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
NT TR+'s (whose base is Stephanus 1550). The wiki's editorial notes, which are in English ("(*omits
σου)", "(Checked)", "Beza does not have this verse", a caption), are dropped.

The pages' wikitext is reduced to the verses: templates ({{…}}), references, links, tags and
headings are dropped, and the text is split at the verse numbers, which must run 1, 2, 3… The
build checks every chapter's verse count against the KJV, compares the text word for word with
Greek NT TR+ (Stephanus 1550, whose base text Beza revised lightly), and prints the chapters that
differ most, so a bad page shows.

Downloads are cached in ~/Library/Caches/Two-edged Sword/beza.
"""
import html, json, os, re, sqlite3, sys, time, unicodedata, urllib.parse, urllib.request
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = Path(os.environ.get("ESWORD_LIBRARY") or HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
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


def library_chapters(name):
    db = sqlite3.connect(f"file:{LIBRARY / name}?mode=ro", uri=True)
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
    trraw = {(b, c, v): t for b, c, v, t in library_chapters("greeknttr+.bbli")}
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
    print(f"{len(chapters)} chapters, {len(rows)} verses; divided again by TR+: {len(redivided)} ({', '.join(redivided)}); from Scrivener: {', '.join(from_scrivener) or 'none'}")
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
        print(f"agreement with Stephanus 1550 (TR+): {same / max(total, 1):.1%} of words")
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
