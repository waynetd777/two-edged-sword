"""Builds rheims1582.bbli ("Rheims New Testament (1582)"): the Catholic English New Testament of 1582,
in the modernised spelling of Bagster's 1872 parallel edition, from a machine reading (OCR) of it.

    python3 tools/rheims/build.py [ocr.zip] [raw.rtf]

The source is "The Vulgate New Testament, with the Douay version of 1582. In parallel columns"
(Bagster, 1872; public domain), as Google Books read it: Bible Support's file 11077
(biblesupport.com/e-sword-downloads/file/11077) has that reading as DR_NT_2016_GoogleOCR_HTMLtext.zip
(the book's pages, Latin and English) and NT_Text_RAW.rtf (the English, with some passages
missing). Both are looked for in ~/Downloads unless given.

The reading has no reliable verse numbers (they come out as °, *, " or run into words), so the
verses are found by lining the text up with Challoner's revision of the same translation, drc.bbli
(tools/crosswire builds it), which keeps most of the 1582 wording: the two word streams are matched
in order (letters only, case ignored), and each verse runs from its first word to the next verse's.
The RTF fills in a verse the pages' reading lost or garbled, where its own reading of that verse
matches Challoner better.

What can't be mended is left: words misread (hearen for heaven), and words lost at the edge of a
column. A verse neither reading has, like the first verses of Matthew, is left out. The Details
record how many verses there are and how closely they follow Challoner's.

Writes to the e-Sword library, where the app finds it after Library → Rescan.
"""
import html, os, re, sqlite3, subprocess, sys, zipfile
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = Path(os.environ.get("ESWORD_LIBRARY") or HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
ZIP = HOME / "Downloads/DR_NT_2016_GoogleOCR_HTMLtext.zip"
RTF = HOME / "Downloads/NT_Text_RAW.rtf"

TOKEN = re.compile(r"[A-Za-z][A-Za-z'’]*|\d+|[^\sA-Za-z\d]+")
LATIN = {"et", "in", "est", "qui", "non", "ad", "cum", "ut", "quod", "enim", "autem", "eius", "eum", "vos", "nos", "sunt", "quia",
         "illi", "ille", "dixit", "suum", "sed", "de", "ab", "ex", "super", "nobis", "vobis", "erat", "ego", "tu", "dominus", "deus"}
ENGLISH = {"the", "and", "of", "to", "that", "he", "in", "is", "not", "for", "him", "his", "them", "they", "which", "with", "you",
           "unto", "be", "shall", "was", "a", "it", "said", "have", "all", "as", "but", "we", "this", "from", "our", "your"}


def norm(t):
    return re.sub(r"[^a-z]", "", t.lower())


def english(par):
    words = [w.lower() for w in re.findall(r"[A-Za-z]+", par)]
    return sum(w in ENGLISH for w in words) >= sum(w in LATIN for w in words)


def pages(zip_path):
    """The book's English paragraphs in page order, as one text."""
    out = []
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if re.search(r"(^|/)p(\d+)[-.]", n)]
        names.sort(key=lambda n: int(re.search(r"(?:^|/)p(\d+)", n).group(1)))
        for n in names:
            t = z.read(n).decode("utf-8", "replace")
            for p in re.findall(r"<p class='gtxt_column'[^>]*>(.*?)</p>", t, re.S):
                s = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<br\s*/?>", " ", p)))
                s = re.sub(r"\s+", " ", s).strip()
                if s and english(s):
                    out.append(s)
    return "\n".join(out)


def rtf_text(path):
    return subprocess.run(["textutil", "-convert", "txt", "-stdout", str(path)], capture_output=True, text=True, check=True).stdout


def tokens(text):
    # A word broken at the end of a line: "for- give" -> "forgive".
    text = re.sub(r"([a-z])- ([a-z])", r"\1\2", text)
    return [m.group() for m in TOKEN.finditer(text)]


def challoner():
    db = sqlite3.connect(f"file:{LIBRARY / 'drc.bbli'}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Book BETWEEN 40 AND 66 ORDER BY Book, Chapter, Verse").fetchall()
    db.close()
    return [((b, c, v), [norm(w) for w in re.findall(r"[A-Za-z][A-Za-z'’]*", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))) if norm(w)]) for b, c, v, t in rows]


def align(ref, ocr):
    """{index in ref: index in ocr} for matching words, found a stretch at a time."""
    words = [(k, norm(t)) for k, t in enumerate(ocr) if norm(t)]
    ow = [w for _, w in words]
    out, i, j = {}, 0, 0
    CH = 2500
    while i < len(ref) and j < len(ow):
        a, b = ref[i:i + CH], ow[j:j + int(CH * 1.4)]
        blocks = [m for m in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks() if m.size >= 2 or (m.size and m.a < 5)]
        if not blocks:
            i += CH // 2
            continue
        # Keep the first two thirds of the stretch; the rest is matched again with what follows.
        keep = [m for m in blocks if m.a < CH * 2 // 3] or blocks[:1]
        for m in keep:
            for k in range(m.size):
                out[i + m.a + k] = words[j + m.b + k][0]
        last = keep[-1]
        i, j = i + last.a + last.size, j + last.b + last.size
    return out


NOISE = re.compile(r"^(\d+|[°*\"“”'’.,:;!?()\[\]|=~_-]+|Il|l|I[lI]|[A-Z]{2,}\.?)$")


def verses(ref_verses, ocr, known):
    """Each verse's text from `ocr`, and how many of Challoner's words it matched: {key: (text, share)}."""
    flat, owner = [], []
    for vi, (_, ws) in enumerate(ref_verses):
        flat += ws
        owner += [vi] * len(ws)
    m = align(flat, ocr)
    found = {}
    for ri, oi in m.items():
        found.setdefault(owner[ri], []).append(oi)
    # A match far from the rest of its verse's is a common word matched by chance elsewhere.
    first, last, hits = {}, {}, {}
    for vi, ois in found.items():
        ois.sort()
        mid = ois[len(ois) // 2]
        near = [o for o in ois if abs(o - mid) <= 2 * len(ref_verses[vi][1]) + 20]
        if near:
            first[vi], last[vi], hits[vi] = near[0], near[-1], len(near)
    order = sorted(first)
    # Where each verse starts: at its first matched word, or up to four words before it when
    # Challoner's verse starts with words the reading doesn't match ("Let thy kingdom come").
    start = {}
    for n, vi in enumerate(order):
        s, floor = first[vi], (last[order[n - 1]] + 1 if n else 0)
        back = 0
        while s > floor and back < 4 and not NOISE.match(ocr[s - 1]):
            s -= 1
            back += 1
        if n and s <= last[order[n - 1]]:
            s = first[vi]
        start[vi] = s
    out = {}
    # A verse the in-order pass missed may be a little out of order in the reading (a column read
    # in the wrong sequence): look for it near its neighbours, from its rarest words. Only near:
    # further off, the same words are a parallel passage in another Gospel.
    lost = [vi for vi in range(len(ref_verses)) if vi not in first and len(ref_verses[vi][1]) >= 4]
    if lost:
        where = {}
        on = [(k, norm(t)) for k, t in enumerate(ocr) if norm(t)]
        for n, (k, w) in enumerate(on):
            where.setdefault(w, []).append(n)
        pos = {k: n for n, (k, _) in enumerate(on)}
        for vi in lost:
            key, ws = ref_verses[vi]
            before = max((last[k] for k in order if k < vi), default=0)
            after = min((first[k] for k in order if k > vi), default=len(ocr))
            lo_ok, hi_ok = pos.get(before, 0) - 600, pos.get(after, len(on)) + 600
            rare = sorted(set(ws), key=lambda w: len(where.get(w, [])) or 10 ** 9)[:3]
            best = None
            for w in rare:
                for n in where.get(w, []):
                    if not lo_ok <= n <= hi_ok:
                        continue
                    lo, hi = max(0, n - 2 * len(ws)), n + 2 * len(ws)
                    window = [x for _, x in on[lo:hi]]
                    blocks = [b for b in SequenceMatcher(None, ws, window, autojunk=False).get_matching_blocks() if b.size]
                    got = sum(b.size for b in blocks)
                    if blocks and (not best or got > best[0]):
                        best = (got, on[lo + blocks[0].b][0], on[lo + blocks[-1].b + blocks[-1].size - 1][0])
            if best and best[0] >= 0.7 * len(ws):
                got, a, z = best
                out[key] = (clean(mend(ocr[a:z + 1], ws, known)), got / len(ws))
    for n, vi in enumerate(order):
        key, ws = ref_verses[vi]
        nxt = start[order[n + 1]] if n + 1 < len(order) else len(ocr)
        # Up to the next verse, but not over a long unmatched run (a heading, a page of notes).
        end = min(nxt, last[vi] + 1 + 12)
        if end < nxt:
            end = last[vi] + 1
        toks = mend(ocr[start[vi]:end], ws, known)
        out[key] = (clean(toks), hits[vi] / max(len(ws), 1))
    return out


def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()


# Pieces of words the reading leaves, which the dictionary happens to list ("th" for thy).
FRAGMENTS = {"th", "tho", "wh", "ot"}


def mend(toks, ref, known):
    """Words misread as non-words, put right from the word Challoner has in the same place:
    hearen -> heaven, Jorgive -> forgive. A real word (the 1582 wording) is never changed."""
    idx = [k for k, t in enumerate(toks) if norm(t)]
    ws = [norm(toks[k]) for k in idx]
    out = list(toks)
    for op, a1, a2, b1, b2 in SequenceMatcher(None, ws, ref, autojunk=False).get_opcodes():
        if op != "replace" or a2 - a1 != b2 - b1:
            continue
        for k in range(a2 - a1):
            w, r = ws[a1 + k], ref[b1 + k]
            if (w in known and w not in FRAGMENTS) or len(r) < 2 or similar(w, r) < 0.7:
                continue
            t = toks[idx[a1 + k]]
            lead = re.match(r"[^A-Za-z]*", t).group()
            fixed = r.capitalize() if t[len(lead):][:1].isupper() else r
            out[idx[a1 + k]] = lead + fixed + t[len(lead) + len(re.match(r"[A-Za-z'’]*", t[len(lead):]).group()):]
    return out


def clean(toks):
    out = []
    for t in toks:
        if re.fullmatch(r"\d+|[°*\"“”|=~_{}\[\]<>]+[.,]?|Il|o", t):
            continue  # a misread verse number, a speck read as a bracket, a lone "o" (O is always a capital)
        # Small capitals read as capitals ("IN THE beginning", "the WoRD").
        if len(t) > 1 and re.search(r"[A-Z]", t[1:]) and t.upper() not in ("II", "III", "IV"):
            t = t[0] + t[1:].lower()
            if not out:
                t = t.capitalize()
            elif t.isalpha() and t[0].isupper() and len(t) <= 3 and t.lower() in ("the", "in", "and", "of", "a"):
                t = t.lower()
        if out and re.fullmatch(r"[.,:;!?)]+", t):
            out[-1] += t
        elif out and t == "-" :
            out[-1] += "-"
        elif out and out[-1].endswith("-") and out[-1] != "-":
            out[-1] += t
        else:
            out.append(t)
    s = " ".join(out)
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"([.,:;!?])[.,_]+", r"\1", s).replace("_", "")  # "things.," "good.." "them ?_"
    s = re.sub(r"\s+([.,:;!?])", r"\1", s)
    return s.strip(" ,;:")


def vocabulary():
    """Words that are real: the system dictionary, and every word of the library's English Bibles
    (for the archaic ones: loveth, sayest, whither)."""
    known = set()
    words = Path("/usr/share/dict/words")
    if words.exists():
        known |= {w.strip().lower() for w in words.read_text().splitlines()}
    for f in ("kjv.bbli", "drc.bbli", "geneva1599.bbli", "tyndale.bbli"):
        p = LIBRARY / f
        if p.exists():
            db = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            for (t,) in db.execute("SELECT Scripture FROM Bible"):
                known |= {norm(w) for w in re.findall(r"[A-Za-z]+", re.sub(r"<[^>]+>", " ", t or ""))}
            db.close()
    return known


def main():
    zp = Path(sys.argv[1]) if len(sys.argv) > 1 else ZIP
    rp = Path(sys.argv[2]) if len(sys.argv) > 2 else RTF
    for p in (zp, rp, LIBRARY / "drc.bbli"):
        if not p.exists():
            sys.exit(f"no {p}")
    ref = challoner()
    known = vocabulary()
    print(f"Challoner: {len(ref)} verses; {len(known)} known words")
    a = verses(ref, tokens(pages(zp)), known)
    print(f"pages: {len(a)} verses, {sum(s for _, s in a.values()) / max(len(a), 1):.0%} of Challoner's words matched on average")
    b = verses(ref, tokens(rtf_text(rp)), known)
    print(f"RTF: {len(b)} verses, {sum(s for _, s in b.values()) / max(len(b), 1):.0%} on average")
    best, from_rtf = {}, 0
    for key, _ in ref:
        x, y = a.get(key), b.get(key)
        if x and (not y or x[1] >= y[1] - 0.1):
            best[key] = x
        elif y:
            best[key] = y
            from_rtf += 1
    shares = [s for _, s in best.values()]
    weak = sum(s < 0.5 for s in shares)
    print(f"kept: {len(best)} verses ({from_rtf} from the RTF), {sum(shares) / len(shares):.0%} matched on average, {weak} under half")
    rows = [(*k, t) for k, (t, _) in sorted(best.items()) if t]
    missing = [k for k, _ in ref if k not in best]
    if missing:
        print(f"  none for {len(missing)} verses: {', '.join(f'{b}:{c}:{v}' for b, c, v in missing[:12])}{'…' if len(missing) > 12 else ''}")

    info = ("<p>The Rheims New Testament of 1582, the English College's Catholic translation from the Vulgate, which the KJV's "
            "translators consulted. The text is Bagster's 1872 parallel edition (The Vulgate New Testament, with the Douay "
            "version of 1582), whose spelling is modernised, as Google Books' machine reading has it; verses are divided by lining "
            f"it up with Challoner's revision. {len(rows)} verses; on average {sum(shares) / len(shares):.0%} of each verse's words "
            "are Challoner's too, so much of the rest is the 1582 wording, but some is misreading, and words lost at the edge of "
            "a column are missing. Built by Two-edged Sword's tools/rheims.</p>")
    p = LIBRARY / "rheims1582.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,0,1,0,0,0)", ("Rheims New Testament (1582)", "Rheims 1582", info))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(rows)} verses")


if __name__ == "__main__":
    main()
