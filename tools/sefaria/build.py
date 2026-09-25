"""Builds e-Sword modules of the Targums and the Babylonian Talmud from Sefaria's public export.

    python3 tools/sefaria/build.py            # everything
    python3 tools/sefaria/build.py targums    # or: talmud

Targums become Bibles (verse by verse, so they read and compare beside any other Bible):
  targum_aramaic / targum_english          Onkelos (Torah), Jonathan (Prophets), the Writings' Targums
  pseudojonathan_aramaic / _english        Targum Pseudo-Jonathan (Torah)
The Talmud becomes one reference book per tractate (talmud_<tractate>.refi), a chapter per daf,
each passage in English (the William Davidson translation) with its Aramaic beneath.

Downloads are cached in ~/Library/Caches/Two-edged Sword/sefaria. Modules are written to the
e-Sword library, where the app (after Library → Rescan) and e-Sword both find them. English is
Sefaria's merged text: its best version for each verse, whose sources and licences are listed
in each module's information. Several are CC-BY-NC: fine for personal study, not for resale.
"""
import html, json, os, re, sqlite3, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support"
CACHE = HOME / "Library/Caches/Two-edged Sword/sefaria"
EXPORT = "https://storage.googleapis.com/sefaria-export/json/"

BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "I Samuel", "II Samuel", "I Kings", "II Kings",
         "I Chronicles", "II Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs", "Isaiah",
         "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
         "Haggai", "Zechariah", "Malachi"]


def get(url, name):
    p = CACHE / name
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as r:
            p.write_bytes(r.read())
    return p.read_bytes()


def toc():
    """Sefaria's table of contents: every text's title and its category path."""
    out = {}
    def walk(n, path):
        for c in n.get("contents", []):
            if "contents" in c:
                walk(c, path + [c["category"]])
            elif "title" in c:
                out[c["title"]] = path
    for n in json.loads(get("https://www.sefaria.org/api/index", "index.json")):
        walk(n, [n["category"]])
    return out


def text(tocmap, title, lang):
    """A text's merged version in "English" or "Hebrew" (Sefaria files Aramaic under Hebrew)."""
    path = "/".join(tocmap[title] + [title, lang, "merged.json"])
    try:
        return json.loads(get(EXPORT + urllib.parse.quote(path), path))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def clean(s):
    """Plain text for a verse: footnotes out, tags out, entities decoded."""
    s = re.sub(r'<sup class="footnote-marker">.*?</sup>\s*<i class="footnote">.*?</i>', "", s, flags=re.S)
    s = re.sub(r"<i class=\"footnote\">.*?</i>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def sources(docs):
    seen = []
    for d in docs:
        for v in (d or {}).get("versions", []):
            if v[0] not in seen:
                seen.append(v[0])
    return seen


def write_bible(file, title, abbrev, info, rtl, verses):
    p = LIBRARY / f"{file}.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    c = sqlite3.connect(tmp)
    c.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    c.execute("INSERT INTO Details VALUES (?,?,?,1,1,0,0,0,?)", (title, abbrev, info, int(rtl)))
    c.executemany("INSERT INTO Bible VALUES (?,?,?,?)", verses)
    c.commit()
    c.close()
    tmp.replace(p)
    print(f"{p.name}: {len(verses)} verses")


# Where the Hebrew Bible's chapter and verse numbers differ from the KJV's (Psalm titles apart):
# (book, Hebrew chapter, first verse, last verse, KJV chapter, KJV verse of the first). A range whose
# KJV verse is the same for every verse (a half verse) is joined onto that verse.
HEB_TO_KJV = [
    (1, 32, 1, 1, 31, 55), (1, 32, 2, 33, 32, 1),
    # The Ten Commandments: Sefaria's texts keep "not murder … not bear false witness" as one verse.
    (2, 20, 14, 23, 20, 17), (5, 5, 18, 30, 5, 21),
    (2, 7, 26, 29, 8, 1), (2, 8, 1, 28, 8, 5), (2, 21, 37, 37, 22, 1), (2, 22, 1, 30, 22, 2),
    (3, 5, 20, 26, 6, 1), (3, 6, 1, 23, 6, 8),
    (4, 17, 1, 15, 16, 36), (4, 17, 16, 28, 17, 1), (4, 25, 19, 19, 26, 1), (4, 30, 1, 1, 29, 40), (4, 30, 2, 17, 30, 1),
    (5, 13, 1, 1, 12, 32), (5, 13, 2, 19, 13, 1), (5, 23, 1, 1, 22, 30), (5, 23, 2, 26, 23, 1), (5, 28, 69, 69, 29, 1), (5, 29, 1, 28, 29, 2),
    (9, 21, 1, 1, 20, 42), (9, 21, 2, 16, 21, 1), (9, 24, 1, 1, 23, 29), (9, 24, 2, 23, 24, 1),
    (10, 19, 1, 1, 18, 33), (10, 19, 2, 44, 19, 1),
    (11, 5, 1, 14, 4, 21), (11, 5, 15, 32, 5, 1), (11, 22, 44, 44, 22, 43), (11, 22, 45, 54, 22, 44),
    (12, 12, 1, 1, 11, 21), (12, 12, 2, 22, 12, 1),
    (13, 5, 27, 41, 6, 1), (13, 6, 1, 66, 6, 16), (13, 12, 5, 41, 12, 4),
    (14, 1, 18, 18, 2, 1), (14, 2, 1, 17, 2, 2), (14, 13, 23, 23, 14, 1), (14, 14, 1, 14, 14, 2),
    (18, 40, 25, 32, 41, 1), (18, 41, 1, 26, 41, 9),
    (21, 4, 17, 17, 5, 1), (21, 5, 1, 19, 5, 2),
    (22, 7, 1, 1, 6, 13), (22, 7, 2, 14, 7, 1),
    (23, 8, 23, 23, 9, 1), (23, 9, 1, 20, 9, 2), (23, 64, 1, 11, 64, 2),
    (24, 8, 23, 23, 9, 1), (24, 9, 1, 25, 9, 2),
    (26, 21, 1, 5, 20, 45), (26, 21, 6, 37, 21, 1),
    (28, 2, 1, 2, 1, 10), (28, 2, 3, 25, 2, 1), (28, 12, 1, 1, 11, 12), (28, 12, 2, 15, 12, 1), (28, 14, 1, 1, 13, 16), (28, 14, 2, 10, 14, 1),
    (29, 3, 1, 5, 2, 28), (29, 4, 1, 21, 3, 1),
    (32, 2, 1, 1, 1, 17), (32, 2, 2, 11, 2, 1),
    (33, 4, 14, 14, 5, 1), (33, 5, 1, 14, 5, 2),
    (34, 2, 1, 1, 1, 15), (34, 2, 2, 14, 2, 1),
    (38, 2, 1, 4, 1, 18), (38, 2, 5, 17, 2, 1),
    (39, 3, 19, 24, 4, 1),
]


def kjv_counts():
    c = sqlite3.connect(f"file:{LIBRARY / 'kjv.bbli'}?immutable=1", uri=True)
    return {(b, ch): n for b, ch, n in c.execute("SELECT Book, Chapter, MAX(Verse) FROM Bible GROUP BY Book, Chapter")}


def to_kjv(verses, counts):
    """Hebrew-numbered (book, chapter, verse, text) to the KJV's numbering. Psalms whose title is
    its own verse (or two) in Hebrew have it joined to verse 1, as the KJV has it."""
    heb = {}
    for b, c, v, t in verses:
        heb.setdefault((b, c), {})[v] = t
    out = {}
    def put(k, t):
        out[k] = out[k] + " " + t if k in out else t
    for (b, c), vs in heb.items():
        top = max(vs)
        extra = top - counts.get((b, c), top) if b == 19 else 0
        for v in sorted(vs):
            t = vs[v]
            if b == 19 and extra in (1, 2):
                put((b, c, max(1, v - extra)), t)
                continue
            for bk, hc, lo, hi, kc, kv in HEB_TO_KJV:
                if bk == b and hc == c and lo <= v <= hi:
                    put((b, kc, kv + (v - lo)), t)
                    break
            else:
                put((b, c, v), t)
    return [(b, c, v, t) for (b, c, v), t in sorted(out.items())]


def targum_bible(tocmap, file, title, abbrev, parts, lang, blurb):
    """parts: (Sefaria title, e-Sword book number)."""
    docs = {t: text(tocmap, t, lang) for t, _ in parts}
    verses = []
    for t, book in parts:
        d = docs[t]
        for ci, ch in enumerate((d or {}).get("text", []), 1):
            for vi, v in enumerate(ch if isinstance(ch, list) else [], 1):
                s = clean(v if isinstance(v, str) else " ".join(x for x in v if isinstance(x, str)))
                if s:
                    verses.append((book, ci, vi, s))
    counts = kjv_counts()
    verses = to_kjv(verses, counts)
    off = [f"{b}.{c}" for b, c in sorted({(v[0], v[1]) for v in verses}) if max(x[2] for x in verses if x[0] == b and x[1] == c) > counts.get((b, c), 0)]
    if off:
        print(f"  {file}: chapters longer than the KJV's: {' '.join(off)}")
    books = sorted({v[0] for v in verses})
    src = "".join(f"<li>{html.escape(s)}</li>" for s in sources(docs.values()))
    info = (f"<p>{blurb}</p><p>{'Aramaic' if lang == 'Hebrew' else 'English'} text from Sefaria (sefaria.org), built by Two-edged Sword's tools/sefaria. "
            f"{len(books)} books, {len(verses)} verses.</p><p>Sources:</p><ul>{src}</ul>"
            "<p>Licences vary by source (public domain, CC0, CC-BY, CC-BY-NC); see each on Sefaria. For personal study.</p>")
    write_bible(file, title, abbrev, info, lang == "Hebrew", verses)


def targums(tocmap):
    torah = [(f"Onkelos {b}", i + 1) for i, b in enumerate(BOOKS[:5])]
    writings = {"Psalms": 19, "Proverbs": 20, "Job": 18, "Song of Songs": 22, "Ruth": 8, "Lamentations": 25, "Ecclesiastes": 21, "Esther": 17}
    prophets = [(f"Targum Jonathan on {b}", BOOKS.index(b) + 1) for b in BOOKS if f"Targum Jonathan on {b}" in tocmap and BOOKS.index(b) >= 5]
    main = torah + prophets + [(f"Aramaic Targum to {b}", n) for b, n in writings.items()] + [("Targum of I Chronicles", 13), ("Targum of II Chronicles", 14)]
    main.sort(key=lambda x: x[1])
    blurb = ("The Targum: the Aramaic paraphrase read in the synagogue beside the Hebrew. Torah: Targum Onkelos; Prophets: Targum Jonathan; "
             "Writings: the Targums to Psalms, Proverbs, Job, the five scrolls and Chronicles. Ezra, Nehemiah and Daniel have no Targum.")
    targum_bible(tocmap, "targum_aramaic", "Targum (Aramaic)", "Targum", main, "Hebrew", blurb)
    targum_bible(tocmap, "targum_english", "Targum (English)", "Targum-E", main, "English", blurb + " English is missing where Sefaria has no translation.")
    pj = [(f"Targum Jonathan on {b}", i + 1) for i, b in enumerate(BOOKS[:5])]
    blurb = "Targum Pseudo-Jonathan (also called Targum Yerushalmi I): an expansive Aramaic paraphrase of the Torah, rich in tradition and interpretation."
    targum_bible(tocmap, "pseudojonathan_aramaic", "Targum Pseudo-Jonathan (Aramaic)", "Ps-Jon", pj, "Hebrew", blurb)
    targum_bible(tocmap, "pseudojonathan_english", "Targum Pseudo-Jonathan (English)", "Ps-Jon-E", pj, "English", blurb)


def amud(i):
    """The text's index as a daf and side: 0 → 1a, 1 → 1b, 2 → 2a."""
    return i // 2 + 1, "ab"[i % 2]


def tractate(tocmap, title):
    en, he = text(tocmap, title, "English"), text(tocmap, title, "Hebrew")
    if not en and not he:
        return None
    ent, het = (en or {}).get("text", []), (he or {}).get("text", [])
    chapters = {}
    for i in range(max(len(ent), len(het))):
        e = ent[i] if i < len(ent) else []
        h = het[i] if i < len(het) else []
        if not any(e) and not any(h):
            continue
        daf, side = amud(i)
        body = [f"<h3>{daf}{side}</h3>"]
        for j in range(max(len(e), len(h))):
            if j < len(e) and e[j]:
                body.append(f"<p>{e[j]}</p>")
            if j < len(h) and h[j]:
                body.append(f'<p class="heb" dir="rtl" lang="arc" style="color: var(--muted)">{h[j]}</p>')
        chapters.setdefault(daf, []).extend(body)
    order = tocmap[title][2] if len(tocmap[title]) > 2 else ""
    src = "".join(f"<li>{html.escape(s)}</li>" for s in sources([en, he]))
    info = (f"<p>Babylonian Talmud, tractate {html.escape(title)} ({html.escape(order)}): each daf in English with the Aramaic beneath each passage.</p>"
            f"<p>From Sefaria (sefaria.org), built by Two-edged Sword's tools/sefaria.</p><p>Sources:</p><ul>{src}</ul>"
            "<p>The William Davidson Talmud (Koren, Rabbi Adin Even-Israel Steinsaltz) is CC-BY-NC: for personal study.</p>")
    p = LIBRARY / f"talmud_{re.sub(r'[^a-z0-9]+', '_', title.lower()).strip('_')}.refi"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    c = sqlite3.connect(tmp)
    c.executescript("""CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(50), Information TEXT, Version INT, Graphics BOOL);
        CREATE TABLE Reference (Chapter NVARCHAR(100), Content TEXT);
        CREATE INDEX ChapterIndex ON Reference (Chapter);""")
    c.execute("INSERT INTO Details VALUES (?,?,?,1,0)", (f"Talmud: {title}", title, info))
    c.executemany("INSERT INTO Reference VALUES (?,?)", [(f"{title} {d}", "\n".join(b)) for d, b in sorted(chapters.items())])
    c.commit()
    c.close()
    tmp.replace(p)
    return f"{p.name}: {len(chapters)} dafs"


def talmud(tocmap):
    titles = [t for t, path in tocmap.items() if path[:2] == ["Talmud", "Bavli"] and len(path) > 2 and path[2].startswith("Seder")]
    with ThreadPoolExecutor(8) as pool:
        for line in pool.map(lambda t: tractate(tocmap, t), titles):
            if line:
                print(line)


def main():
    if not LIBRARY.is_dir():
        sys.exit(f"no e-Sword library at {LIBRARY}")
    what = sys.argv[1:] or ["targums", "talmud"]
    tocmap = toc()
    if "targums" in what:
        targums(tocmap)
    if "talmud" in what:
        talmud(tocmap)


if __name__ == "__main__":
    main()
