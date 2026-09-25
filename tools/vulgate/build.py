"""Builds an e-Sword Bible of the Clementine Vulgate (Vulgata Clementina, 1592) from the
Clementine Vulgate Project's text.

    python3 tools/vulgate/build.py

Writes clementine.bbli ("Latin Vulgate (Clementine)", Vulg-C) to the e-Sword library, where the
app (after Library → Rescan) and e-Sword both find it. Unlike latin.bbli (the modern critical
Stuttgart/Weber text) the Clementine has the Comma Johanneum (1 John 5:7), Acts 8:37, and the
Vulgate's spelling of the Sixto-Clementine edition (cælum, ejus, Jesus).

Source: the Clementine Vulgate Project's source files (one .lat file per book, "chapter:verse
text" per line, codepage 1252), https://bitbucket.org/clementinetextproject/text, entered
2002–2005 by the project (vulsearch.sourceforge.net) from a later printing of the Clementine and
checked against older ones. The text is public domain. Its markup — \\ paragraphs, [ ] and /
for poetry, <Name> for speakers and headings — becomes plain verse text here; the Psalms' titles
are bold, as in the KJV.

The app lines Bibles up by the KJV's numbering, so the text is moved to it: the Psalms by the
Hebrew numbering (Vulgate 9 = KJV 9–10, 113 = 114–115, 114–115 = 116, 146–147 = 147) with their
titles joined to verse 1, and elsewhere the verses in RULES, checked against the KJV's chapter
lengths. Where the Vulgate joins two of the KJV's verses the Latin is divided at the phrase
given; where it has a verse the KJV lacks (Daniel 3:24–90, the Song of the Three Children) the
Latin is joined to the verse before it. The Vulgate's additions to Esther (10:4–16:24) and
Daniel 13–14 keep their own numbers, as do Tobit, Judith, Wisdom, Sirach, Baruch (6 = the
Letter of Jeremiah) and 1–2 Maccabees, numbered 67–73 as in latin.bbli. Chapters that still
differ from the KJV are printed.

Downloads are cached in ~/Library/Caches/Two-edged Sword/vulgate.
"""
import io, os, re, sqlite3, sys, urllib.request, zipfile
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support"
CACHE = HOME / "Library/Caches/Two-edged Sword/vulgate"
SOURCE = "https://bitbucket.org/clementinetextproject/text/get/master.zip"

# The project's file names, in e-Sword's book order: 1–66, then the deuterocanon as latin.bbli numbers it.
BOOKS = ["Gn", "Ex", "Lv", "Nm", "Dt", "Jos", "Jdc", "Rt", "1Rg", "2Rg", "3Rg", "4Rg", "1Par", "2Par", "Esr", "Neh", "Est", "Job", "Ps",
         "Pr", "Ecl", "Ct", "Is", "Jr", "Lam", "Ez", "Dn", "Os", "Joel", "Am", "Abd", "Jon", "Mch", "Nah", "Hab", "Soph", "Agg", "Zach",
         "Mal", "Mt", "Mc", "Lc", "Jo", "Act", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phlp", "Col", "1Thes", "2Thes", "1Tim", "2Tim",
         "Tit", "Phlm", "Hbr", "Jac", "1Ptr", "2Ptr", "1Jo", "2Jo", "3Jo", "Jud", "Apc",
         "Tob", "Jdt", "Sap", "Sir", "Bar", "1Mcc", "2Mcc"]

# Where the Vulgate's verses go in the KJV's numbering. Verses are taken in order; each goes to
# the verse after the one before it (running on into the KJV's next chapter), and a new Vulgate
# chapter starts again at its own number, unless a rule says otherwise:
#   "c:v > c:v"         this verse goes to that KJV verse (and those after it follow on)
#   "c:v +"             this verse is joined to the KJV verse the one before it went to
#   "c:v / phrase"      this verse is divided where phrase starts; the rest goes to the next KJV verse
#   "c:v +/ phrase"     likewise, but the part before phrase is joined to the verse before
RULES = {
    "Gn": ["5:31 / Noë vero", "49:32 > 49:33", "50:22 / Et vidit Ephraim"],
    "Ex": ["40:14 > 40:16"],
    "Lv": ["26:45 / Hæc sunt judicia"],
    "Nm": ["11:34 / Egressi autem", "13:1 > 12:16", "20:29 +", "30:1 > 29:40"],
    "Jos": ["4:24 +", "5:15 +", "21:36 / et Jethson", "21:37 / et Hesebon", "21:40 > 21:42"],
    "Jdc": ["5:32 +", "21:24 / In diebus illis"],
    "1Rg": ["20:43 +", "24:1 > 23:29"],
    "3Rg": ["22:44 +"],
    "1Par": ["11:46 / Eliel, et Obed", "20:7 / Hi sunt filii"],
    "Neh": ["3:30 / Post eum ædificavit Melchias", "12:33 / Judas"],
    "Job": ["16:5 +", "39:31 > 40:1", "40:1 > 40:6", "40:20 > 41:1", "41:1 > 41:10", "42:16 / et mortuus est"],
    "Ecl": ["4:17 > 5:1", "5:1 > 5:2", "7:1 > 6:12"],
    "Ct": ["1:1 > 1:2", "5:17 > 6:1", "6:1 > 6:2", "7:1 +/ Quam pulchri"],
    "Jr": ["37:4 / Igitur exercitus"],
    "Ez": ["2:9 / et expandit"],
    "Dn": ["3:24 +"] + [f"3:{v} +" for v in range(25, 91)] + ["3:91 > 3:24", "4:1 > 4:4"],
    "Os": ["2:24 +", "14:1 > 13:16"],
    "Am": ["6:11 +"],
    "Jon": ["2:1 > 1:17"],
    "Mch": ["5:11 / et auferam maleficia"],
    "Agg": ["2:1 > 1:15"],
    "Mt": ["17:14 / Domine, miserere"],
    "Mc": ["4:40 / et timuerunt", "8:39 > 9:1", "9:1 > 9:2"],
    "Jo": ["6:52 +", "11:56 / Dederant autem"],
    "Act": ["7:55 / Et ait: Ecce video", "14:6 / et ibi evangelizantes", "19:40 / Et cum hæc dixisset"],
    "2Cor": ["1:23 / non quia dominamur", "13:12 / Salutant vos"],
    "Apc": ["12:18 > 13:1", "13:1 +"],
}
# The Psalms: where each run of Vulgate verses starts (psalm, verse) and the KJV verse it starts at.
PSALMS = ([(p, 1, p, 1) for p in range(1, 10)] + [(9, 22, 10, 1)]
          + [(p, 1, p + 1, 1) for p in range(10, 113)] + [(113, 1, 114, 1), (113, 9, 115, 1), (114, 1, 116, 1), (115, 1, 116, 10)]
          + [(p, 1, p + 1, 1) for p in range(116, 146)] + [(146, 1, 147, 1), (147, 1, 147, 12)]
          + [(p, 1, p, 1) for p in range(148, 151)])
# Further rules for the Psalms, after those made from PSALMS.
PSALM_RULES = ["2:13 +", "4:10 +", "15:10 / Notas mihi", "43:22 / Quoniam propter te", "52:2 +",
               "55:11 / In Deo speravi", "71:2 +/ judicare populum", "99:2 +/ servite Domino", "108:2 +/ quia os peccatoris",
               "145:2 +/ Laudabo Dominum", "12:3 +", "12:6 / Cantabo Domino"]


def get(url, name):
    p = CACHE / name
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as r:
            p.write_bytes(r.read())
    return p.read_bytes()


def source():
    """{file name: [(chapter, verse, raw text)]} from the project's archive."""
    books = {}
    with zipfile.ZipFile(io.BytesIO(get(SOURCE, "clementine-text.zip"))) as z:
        for n in z.namelist():
            if n.endswith(".lat"):
                rows = []
                for line in z.read(n).decode("cp1252").splitlines():
                    m = re.match(r"(\d+):(\d+) (.*)", line)
                    if m:
                        rows.append((int(m[1]), int(m[2]), m[3]))
                books[Path(n).stem] = rows
    return books


def titles(rows):
    """The Psalms' titles in bold: the words before the first [ of a psalm (a verse or two)."""
    out, seen = [], set()
    for c, v, t in rows:
        if c not in seen and not (c == 9 and v >= 22):
            if "[" in t:
                seen.add(c)
                head, rest = t.split("[", 1)
                t = f"<b>{head.strip()}</b> [{rest}" if head.strip() else t
            elif any(cc == c and "[" in tt for cc, _, tt in rows):
                t = f"<b>{t.strip()}</b>"
        out.append((c, v, t))
    return out


def clean(t):
    """The project's markup as verse text: speakers and headings in italics, poetry run on."""
    t = re.sub(r"<([^>]+)>", lambda m: m[0] if m[1] in ("b", "/b") else f"<i>{m[1]}</i> ", t)
    t = re.sub(r"(?<!<)/", " ", re.sub(r"[\\\[\]]", " ", t))
    t = re.sub(r"\s+([:;?!,.])", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


def psalm_rules(rows):
    """RULES for the Psalms: each moved to the Hebrew number, a title that is a verse of its own joined to verse 1."""
    text = {(c, v): t for c, v, t in rows}
    rules = []
    for vp, vfirst, kp, kfirst in PSALMS:
        rules.append(f"{vp}:{vfirst} > {kp}:{kfirst}")
        v = vfirst
        while re.fullmatch(r"<b>[^<]*</b>", text.get((vp, v), "")):
            v += 1
            rules.append(f"{vp}:{v} +")
    return rules + PSALM_RULES


def move(rows, rules, kjv, b):
    """[(kjv chapter, kjv verse, text)] for one book's Vulgate verses."""
    parsed = {}
    for r in rules:
        m = re.match(r"(\d+):(\d+) (>|\+/|\+|/) ?(.*)", r)
        parsed[(int(m[1]), int(m[2]))] = (m[3], m[4].strip())

    def after(pos):
        c, v = pos
        n = kjv.get((b, c))
        return (c, v + 1) if n is None or v < n or (b, c + 1) not in kjv else (c + 1, 1)

    out, pos, chapter, follow = {}, None, None, False
    def put(p, text, join=False):
        if p in out and not join:
            print(f"  {BOOKS[b - 1]} {c}:{v} runs into KJV {p[0]}:{p[1]}, which already has a verse")
        out[p] = f"{out[p]} {text}".replace("</b> <b>", " ") if p in out else text
    for c, v, t in rows:
        if c != chapter:
            chapter, follow = c, False
        op, arg = parsed.get((c, v), (None, None))
        target = after(pos) if follow else (c, v)
        follow = True
        if op == ">":
            k = arg.split(":")
            target = (int(k[0]), int(k[1]))
        if op == "+":
            put(pos, t, True)
            continue
        if op in ("/", "+/"):
            i = t.find(arg)
            if i <= 0:
                sys.exit(f"{BOOKS[b - 1]} {c}:{v}: '{arg}' not found in: {t}")
            head, tail = t[:i].strip(), t[i:]
            m = re.search(r"\s*<i>[^<]*</i>$", head)  # a speaker's name goes with the words that follow it
            if m:
                head, tail = head[:m.start()], f"{m[0].strip()} {tail}"
            if op == "+/":
                put(pos, head, True)
                target = after(pos)
            else:
                put(target, head)
                target = after(target)
            put(target, tail)
            pos = target
            continue
        put(target, t)
        pos = target
    return [(c, v, t) for (c, v), t in sorted(out.items())]


def chapter_lengths(module):
    c = sqlite3.connect(f"file:{LIBRARY / module}.bbli?immutable=1", uri=True)
    return {(b, ch): n for b, ch, n in c.execute("SELECT Book, Chapter, MAX(Verse) FROM Bible GROUP BY Book, Chapter")}


def main():
    if not LIBRARY.is_dir():
        sys.exit(f"no e-Sword library at {LIBRARY}")
    kjv = chapter_lengths("kjv")
    src = source()
    verses = []
    for b, name in enumerate(BOOKS, 1):
        rows = [(c, v, t) for c, v, t in src[name]]
        if name == "Ps":
            rows = titles(rows)
        rows = [(c, v, clean(t)) for c, v, t in rows]
        if b <= 66:
            rules = psalm_rules(rows) if name == "Ps" else RULES.get(name, [])
            rows = move(rows, rules, kjv, b)
        verses += [(b, c, v, t) for c, v, t in rows]

    # Chapters that still differ from the KJV's (the deuterocanon has no KJV to differ from).
    mine = {}
    for b, c, v, _ in verses:
        mine.setdefault((b, c), set()).add(v)
    for (b, c) in sorted(set(mine) | set(kjv)):
        if b > 66:
            continue
        have, want = mine.get((b, c), set()), set(range(1, kjv.get((b, c), 0) + 1))
        if have != want:
            miss, extra = sorted(want - have), sorted(have - want)
            print(f"  {BOOKS[b - 1]} {c}: {len(have)} verses, KJV {len(want)}"
                  + (f"; none for KJV {miss[:12]}" if miss else "") + (f"; beyond the KJV {extra[:3]}{'…' if len(extra) > 3 else ''}" if extra else ""))

    info = ("<p>The Clementine Vulgate (Vulgata Clementina), the Latin Bible of Pope Clement VIII's edition of 1592, the Catholic Church's "
            "standard text until 1979. Unlike the modern critical Vulgate it has the Comma Johanneum (1 John 5:7), Acts 8:37 and the "
            "Clementine's spelling; the Psalms are the Gallican Psalter. With the deuterocanonical books (Tobit, Judith, Wisdom, Sirach, "
            "Baruch, 1–2 Maccabees) and the additions to Esther (10:4–16:24) and Daniel (3:24–90, 13–14).</p>"
            "<p>Text of the Clementine Vulgate Project (vulsearch.sourceforge.net; bitbucket.org/clementinetextproject/text), "
            "entered 2002–2005 from a later printing of the Clementine and checked against older ones. Verses are numbered as in the "
            "KJV: the Psalms by the Hebrew numbering, their titles part of verse 1. Built by Two-edged Sword's tools/vulgate.</p>"
            "<p>Public domain.</p>")
    p = LIBRARY / "clementine.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    c = sqlite3.connect(tmp)
    c.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    c.execute("INSERT INTO Details VALUES (?,?,?,1,1,1,1,0,0)", ("Latin Vulgate (Clementine)", "Vulg-C", info))
    c.executemany("INSERT INTO Bible VALUES (?,?,?,?)", verses)
    c.commit()
    c.close()
    tmp.replace(p)
    print(f"{p.name}: {len(verses)} verses")


if __name__ == "__main__":
    main()
