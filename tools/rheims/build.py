# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds rheims1582.bbli ("Rheims New Testament (1582)"): the Catholic English New Testament of 1582,
in the modernised spelling of Bagster's 1872 parallel edition, from a machine reading (OCR) of it.

    python3 tools/rheims/build.py

The source is "The Vulgate New Testament, with the Douay version of 1582. In parallel columns"
(Bagster, 1872; public domain) in the Internet Archive's scan of the University of Toronto's copy
(archive.org/details/vulgatenewtestam00lond, 384 colour pages at 300 ppi, pinned by sha256; Google's
black-and-white scan, vulgatenewtesta00jerogoog, reads worse). Its OCR runs the Latin and English
columns together, so the pages are read here: with macOS's Vision (ocr.swift, compiled once into the
cache), or on Windows with Windows' own OCR (ocr.ps1, one kept running in each worker, as PowerShell
is slow to start). Each page's English column (the outer one, found by reading a strip of each and
kept in columns/) is cut into strips at the gaps between lines, as Vision shrinks a large image and
loses the small type, and Windows' OCR refuses one. It is read three times, with different settings
(READINGS, READINGS_WINDOWS), as each drops or garbles lines the others read. Vision reads these
scans better: 85% of Challoner's words matched, against 82% on Windows. Earlier builds read Bible
Support's copy of Google Books' reading (file 11077), which can no longer be downloaded.

The reading has no reliable verse numbers (they come out as °, *, " or run into words), so the
verses are found by lining the text up with Challoner's revision of the same translation, drc.bbli
(tools/crosswire builds it), which keeps most of the 1582 wording: the two word streams are matched
in order (letters only, case ignored), and each verse runs from its first word to the next verse's.
Each verse is taken from the reading that matches Challoner better.

The reading is then cleaned: specks read as symbols or stray letters, misread verse numbers and
quotation marks (the 1582 text has none) are dropped; a misread word that is no English word is
put right from Challoner's word in its place (hearen: heaven), or by the letters the reading
confuses (tliat: that, yas: was), but never into a word the KJV or Challoner has (Saul, Heli) nor
from a real word (passible, the 1582 wording at Acts 26:23); a first word cut down to its last
letters becomes Challoner's first word ("d wisdom": And wisdom); and up to three words the
reading lost, where it left a speck or a scrap in their place, are Challoner's words there
("David the Ę And David": the King; "Blessed are the Fo in spirit": poor).

What can't be mended is left: real words misread, and words lost at the edge of a column (a verse
starting with a small letter has usually lost its first word). A verse neither reading has, like the first verses of Matthew, is left out. The Details
record how many verses there are and how closely they follow Challoner's.

Writes to the app's modules folder, where the app finds it after Library → Rescan. The scans and
each page's readings are cached in ~/Library/Caches/Two-edged Sword/rheims.
"""
import html, os, re, sqlite3, subprocess, sys, zipfile
from concurrent.futures import ProcessPoolExecutor
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import CACHES, WINDOWS, english_words, fetch, find, module, similar  # noqa: E402
CACHE = CACHES / "rheims"
ITEM = "vulgatenewtestam00lond"
SCANS = f"https://archive.org/download/{ITEM}/{ITEM}_jp2.zip"
SCANS_SHA256 = "42957c16015fe24d9dec4b4fc288119405c2964c73766ebc4dcbb230600b8375"
# The readings: (name, strip height, blur, scale, overlap), in pixels of the 2556-wide scans. Each drops or garbles
# lines the others read (most often a line at a strip's edge, so their strips are cut in different places), and each
# verse is taken from the one that reads it best.
READINGS = [("a", 220, 0.0, 2.0, 4), ("b", 380, 0.5, 1.5, 0), ("c", 300, 0.3, 2.0, 10)]
# Windows' OCR reads these scans best at their own size, Vision enlarged.
READINGS_WINDOWS = [("a", 220, 0.0, 1.0, 4), ("b", 380, 0.0, 1.0, 0), ("c", 600, 0.0, 1.5, 0)]
OCR = Path(__file__).resolve().parent / "ocr.swift"  # macOS's Vision
OCR_WINDOWS = Path(__file__).resolve().parent / "ocr.ps1"  # Windows' own OCR (Windows.Media.Ocr)

TOKEN = re.compile(r"[A-Za-z][A-Za-z'’]*|\d+|[^\sA-Za-z\d]+")
def norm(t):
    return re.sub(r"[^a-z]", "", t.lower())


def ocr_tool():
    """The command that reads images' text, given their paths: on Windows ocr.ps1, with Windows' own OCR; on a Mac
    ocr.swift, compiled into the cache (again when the source is newer)."""
    if WINDOWS:
        return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(OCR_WINDOWS)]
    exe = CACHE / "ocr"
    if not exe.exists() or exe.stat().st_mtime < OCR.stat().st_mtime:
        print("compiling ocr.swift (once)")
        subprocess.run(["swiftc", "-O", str(OCR), "-o", str(exe)], check=True)
    return [str(exe)]


# Common words of each language, to tell the page's English column from its Latin one.
LATIN = {"et", "est", "qui", "non", "ad", "cum", "ut", "quod", "enim", "autem", "eius", "ejus", "eum", "vos", "nos", "sunt",
         "quia", "sed", "de", "ab", "ex", "super", "nobis", "vobis", "erat", "ego", "dixit", "illi"}
ENGLISH = {"the", "and", "of", "to", "that", "he", "is", "not", "for", "him", "his", "them", "they", "which", "with", "you",
           "unto", "be", "shall", "was", "it", "said", "have", "all", "as", "but", "we", "this", "from", "our", "your"}


_server = None  # this worker's ocr.ps1, on Windows


def ocr(exe, files):
    """The text of images, each one's lines top to bottom: on Windows through one ocr.ps1 kept running in this worker
    (each start of PowerShell costs a second), on a Mac by running the tool once for them all."""
    global _server
    if not WINDOWS:
        return subprocess.run([*exe, *map(str, files)], capture_output=True, text=True, encoding="utf-8", check=True).stdout
    if _server is None or _server.poll() is not None:
        _server = subprocess.Popen(exe, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
    _server.stdin.write("\t".join(map(str, files)) + "\n")
    _server.stdin.flush()
    lines = []
    for line in _server.stdout:
        if line.rstrip("\n") == "\x1e":
            return "".join(lines)
        lines.append(line)
    raise RuntimeError("ocr.ps1 stopped")


def english_column(im, exe, work, known):
    """(left, right) of the page's English column: the side of the gutter (the emptiest upright strip near the middle)
    where a strip read from the middle has more English words than Latin. It is the outer column, so it alternates;
    neither line count nor line height tells the two apart reliably. Found once for all the readings: kept in the
    file `known`."""
    if known.is_file():
        x0, x1 = known.read_text().split()
        return int(x0), int(x1)
    import numpy as np
    a = np.asarray(im) < 128
    h, w = a.shape
    ink = a[int(h * .1):int(h * .95)].sum(0)
    lo, hi = int(w * .35), int(w * .65)
    g = lo + int(np.argmin(np.convolve(ink[lo:hi], np.ones(15), "same")))
    score = []
    for k, (x0, x1) in enumerate(((0, g), (g, w))):
        f = work / f"side-{k}-{os.getpid()}.png"
        im.crop((x0, int(h * .4), x1, int(h * .5))).save(f)
        words = re.findall(r"[a-z]+", ocr(exe, [f]).lower())
        f.unlink()
        score.append(sum(x in ENGLISH for x in words) - sum(x in LATIN for x in words))
    x0, x1 = (0, g) if score[0] >= score[1] else (g, w)
    known.parent.mkdir(exist_ok=True)
    known.write_text(f"{x0} {x1}")
    return x0, x1


def read_page(args):
    """One scanned page's English column as text, by one reading's settings: the column cut into strips at the gaps
    between lines (Vision shrinks a large image and loses the small type), each read in turn."""
    from PIL import Image, ImageFilter
    import numpy as np
    page, name, strip, blur, scale, pad, exe, work = args
    im = Image.open(page).convert("L")
    x0, x1 = english_column(im, exe, work, CACHE / ("columns-windows" if WINDOWS else "columns") / f"{Path(page).stem}.txt")
    col = im.crop((x0, 0, x1, im.height))
    ink = (np.asarray(col) < 128).sum(1)
    cuts, y = [0], 0
    while y + strip < col.height:
        y += strip
        stop = y + strip  # a page with no gaps (the cover) is still cut, as no OCR takes a page-long strip
        while y < min(col.height, stop) and ink[y]:
            y += 1
        cuts.append(y)
    cuts.append(col.height)
    files = []
    for k, (a, b) in enumerate(zip(cuts, cuts[1:])):
        if b <= a:  # a cut at the foot of the page
            continue
        s = col.crop((0, max(0, a - pad), col.width, min(col.height, b + pad)))
        if blur:
            s = s.filter(ImageFilter.GaussianBlur(blur))
        if scale != 1:
            s = s.resize((int(s.width * scale), int(s.height * scale)), Image.LANCZOS)
        files.append(work / f"{Path(page).stem}-{name}-{k:02d}.png")
        s.save(files[-1])
    text = ocr(exe, files)
    for f in files:
        f.unlink()
    return text


def scanned(reading):
    """The book's English column, page by page, as one text: the Internet Archive's colour scans (pinned by sha256),
    read by macOS's Vision with one of READINGS' settings. Each page's reading is cached."""
    name, *settings = reading
    pages = CACHE / ITEM
    if not pages.exists():
        with zipfile.ZipFile(fetch(SCANS, CACHE / f"{ITEM}_jp2.zip", sha256=SCANS_SHA256, log=True)) as z:
            z.extractall(CACHE)
        (CACHE / f"{ITEM}_jp2").rename(pages)
    out_dir = CACHE / (f"ocr-windows-{name}" if WINDOWS else f"ocr-{name}")  # each OCR's readings apart
    out_dir.mkdir(exist_ok=True)
    exe, todo = ocr_tool(), []
    scans = sorted(pages.glob("*.jp2"))
    for page in scans:
        if not (out_dir / f"{page.stem}.txt").exists():
            todo.append((str(page), name, *settings, exe, out_dir))
    if todo:
        print(f"reading {len(todo)} pages ({name})")
        with ProcessPoolExecutor() as pool:
            for args, text in zip(todo, pool.map(read_page, todo)):
                (out_dir / f"{Path(args[0]).stem}.txt").write_text(text, encoding="utf-8")
    return "\n".join(body((out_dir / f"{p.stem}.txt").read_text(encoding="utf-8")) for p in scans)


def body(page):
    """A page's reading without its running head ("MATTHEW XIII. 39-XIV. 6.", read in many ways): its first line, where
    that has none of the commonest English words."""
    lines = page.split("\n")
    if lines and not ENGLISH & set(re.findall(r"[a-z]+", lines[0].lower())):
        lines = lines[1:]
    return "\n".join(lines)


def tokens(text, known=()):
    # A word broken at the end of a line: "for- give" -> "forgive", and "be-cause" where the reading joined the line's
    # end to the next and the whole is a word of the English Bibles.
    text = re.sub(r"([a-z])-\s+([a-z])", r"\1\2", text)
    text = re.sub(r"\b([a-z]+)-([a-z]+)\b", lambda m: m[1] + m[2] if norm(m[1] + m[2]) in known else m[0], text)
    return [m.group() for m in TOKEN.finditer(text)]


def challoner():
    db = sqlite3.connect(f"file:{find('drc.bbli')}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Book BETWEEN 40 AND 66 ORDER BY Book, Chapter, Verse").fetchall()
    db.close()
    out = []
    for b, c, v, t in rows:
        words = re.findall(r"[A-Za-z][A-Za-z'’]*", html.unescape(re.sub(r"<[^>]+>", " ", t or "")))
        if words:
            FIRST[(b, c, v)] = words[0]
        RAW[(b, c, v)] = [w for w in words if norm(w)]
        out.append(((b, c, v), [norm(w) for w in words if norm(w)]))
    return out


FIRST = {}  # each of Challoner's verses' first word, as written
RAW = {}  # each of Challoner's verses' words, as written


def align(ref, ocr):
    """{index in ref: index in ocr} for matching words. Runs of three words or more are found a
    stretch at a time and kept as anchors (two, like "David the", are too often a chance match
    elsewhere); between two anchors, the words are matched one by one, which is safe in so
    narrow a gap."""
    words = [(k, norm(t)) for k, t in enumerate(ocr) if norm(t)]
    ow = [w for _, w in words]
    anchors, i, j = [], 0, 0
    CH = 2500
    while i < len(ref) and j < len(ow):
        a, b = ref[i:i + CH], ow[j:j + int(CH * 1.4)]
        blocks = [m for m in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks() if m.size >= 3]
        if not blocks:
            i += CH // 2
            continue
        # Keep the first two thirds of the stretch; the rest is matched again with what follows.
        keep = [m for m in blocks if m.a < CH * 2 // 3] or blocks[:1]
        for m in keep:
            anchors += [(i + m.a + k, j + m.b + k) for k in range(m.size)]
        last = keep[-1]
        i, j = i + last.a + last.size, j + last.b + last.size
    pairs = list(anchors)
    for (r1, o1), (r2, o2) in zip(anchors, anchors[1:]):
        if r2 - r1 > 1 and o2 - o1 > 1 and o2 - o1 < 4 * (r2 - r1) + 20:
            for m in SequenceMatcher(None, ref[r1 + 1:r2], ow[o1 + 1:o2], autojunk=False).get_matching_blocks():
                pairs += [(r1 + 1 + m.a + k, o1 + 1 + m.b + k) for k in range(m.size)]
    return {r: words[o][0] for r, o in pairs}


NOISE = re.compile(r"^(\d+|[°*\"“”'’.,:;!?()\[\]|=~_-]+|Il|l|I[lI]|[A-Z]{2,}\.?)$")


def verses(ref_verses, ocr, known, counts):
    """Each verse's text from `ocr`, and how many of Challoner's words it matched: {key: (text, share)}."""
    flat, owner = [], []
    for vi, (_, ws) in enumerate(ref_verses):
        flat += ws
        owner += [vi] * len(ws)
    m = align(flat, ocr)
    found, lead = {}, {}
    verse_at, n0 = [], 0
    for _, ws in ref_verses:
        verse_at.append(n0)
        n0 += len(ws)
    for ri, oi in m.items():
        found.setdefault(owner[ri], []).append(oi)
        vi = owner[ri]
        lead[vi] = min(lead.get(vi, 10 ** 9), ri - verse_at[vi])
    # A match far from the rest of its verse's is a common word matched by chance elsewhere.
    first, last, hits = {}, {}, {}
    for vi, ois in found.items():
        ois.sort()
        mid = ois[len(ois) // 2]
        near = [o for o in ois if abs(o - mid) <= 2 * len(ref_verses[vi][1]) + 20]
        if near:
            first[vi], last[vi], hits[vi] = near[0], near[-1], len(near)
    order = sorted(first)
    # Where each verse starts: at its first matched word, or as many words before it as Challoner
    # has before that word, and a few more ("Let thy kingdom come"), but not over a verse number.
    start = {}
    for n, vi in enumerate(order):
        s, floor = first[vi], (last[order[n - 1]] + 1 if n else 0)
        back, room = 0, lead.get(vi, 0) + 3
        while s > floor and back < room and not re.fullmatch(r"\d+", ocr[s - 1]):
            # Not back over the end of a sentence: "covered ?" and "besides ." end the verse before.
            if re.match(r"[.?!]", ocr[s - 1]):
                break
            s -= 1
            back += bool(norm(ocr[s]))
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
                out[key] = (clean(mend(ocr[a:z + 1], ws, known, counts, key)), got / len(ws))
    for n, vi in enumerate(order):
        key, ws = ref_verses[vi]
        nxt = start[order[n + 1]] if n + 1 < len(order) else len(ocr)
        # Up to the next verse: its number, or the specks a number was read as, or its first word,
        # but no more than 25 words on (past that it's a heading or a page of notes).
        end = last[vi] + 1
        while end < nxt and end < last[vi] + 26 and not re.fullmatch(r"\d+|[°*\"“”§#&|}{]+.*", ocr[end]):
            end += 1
        toks = mend(ocr[start[vi]:end], ws, known, counts, key)
        # A first word cut at the column's edge, leaving its last letters ("d wisdom is justified"),
        # is Challoner's first word when that ends with them ("And").
        words = [k for k, t in enumerate(toks) if norm(t)]
        fw = FIRST.get(key, "")
        if words and len(norm(toks[words[0]])) <= 2 and norm(toks[words[0]]) not in ("a", "i", "o") and len(fw) > 2 and fw.lower().endswith(norm(toks[words[0]])):
            toks = [fw] + toks[words[0] + 1:]
        out[key] = (clean(toks), hits[vi] / max(len(ws), 1))
    return out


# Letters the reading confuses: "tliat" for that, "yas" for was, "sor" for for, "rn" for m.
CONFUSIONS = [("li", "h"), ("y", "w"), ("s", "f"), ("f", "s"), ("rn", "m"), ("cl", "d"), ("ii", "u"), ("c", "e"), ("e", "c"),
              ("l", "i"), ("i", "l"), ("ri", "n"), ("vv", "w"), ("h", "b"), ("b", "h"), ("o", "e"), ("u", "n"), ("n", "u"), ("q", "o"), ("i", "ll"), ("ii", "ll"), ("y", "v")]
# Not a for o, nor m for n anywhere but a short word's first letter ("mot"): a word cut short at a
# column's edge (brin[g], cam[e], hat[h]) would be made into another word (brim, can, hot).


def confused(w, counts, known):
    """The common Bible word a misread word stands for, by one of CONFUSIONS, or None: only for a
    word the KJV and Challoner hardly have, and only to one they have often. A dictionary word of
    five letters or more (passible, the 1582 wording at Acts 26:23) only becomes a very common one
    (aster: after)."""
    lw = w.lower()
    if lw in BIBLE or len(lw) < 3:
        return None  # a word the KJV or Challoner has, even once or as a name (Saul, Heli, Gad)
    floor = 500 if lw in known and len(lw) >= 5 else 20
    best = None
    if len(lw) == 3 and lw[0] == "m" and counts.get("n" + lw[1:], 0) >= floor:
        best = "n" + lw[1:]
    for a, b in CONFUSIONS:
        k = lw.find(a)
        while k >= 0:
            c = lw[:k] + b + lw[k + len(a):]
            if counts.get(c, 0) >= floor and (not best or counts[c] > counts[best]):
                best = c
            k = lw.find(a, k + 1)
    if not best:
        return None
    return best.capitalize() if w[:1].isupper() else best


BIBLE = set()  # every word of the KJV and Challoner, any case
CAPS = {}  # how often each is written with a capital in them (God, Lord)
LATIN_WORDS = set()  # the Vulgate's words that no English Bible here has
FIXED = {}  # (misread, corrected): how often, for the build's report
FILLED = {}  # words put back from Challoner: how often

# Pieces of words the reading leaves, which the dictionary happens to list ("th" for thy).
FRAGMENTS = {"th", "tho", "wh", "ot"}


def lost(t):
    """A speck the reading made of a word: no English letter, and not punctuation or a number."""
    return not re.search(r"[A-Za-z0-9]", t) and not re.fullmatch(r"[.,;:!?()'\"“”’‘-]+", t)


def fill(toks, ref, raw):
    """Words the reading lost, put back from Challoner, only where it shows the loss: a speck in
    their place ("David the Ę And David": the King), or the scrap of a word too short to be one
    ("Blessed are the Fo in spirit": poor); up to three words, with Challoner's wording matching on
    both sides. Where Challoner simply has words the 1582 hasn't, nothing is added: his revision
    often added words."""
    idx = [k for k, t in enumerate(toks) if norm(t)]
    ws = [norm(toks[k]) for k in idx]
    ops = SequenceMatcher(None, ws, ref, autojunk=False).get_opcodes()
    edits = []
    for n, (op, a1, a2, b1, b2) in enumerate(ops):
        if not (0 < n < len(ops) - 1 and ops[n - 1][0] == "equal" and ops[n + 1][0] == "equal" and 1 <= b2 - b1 <= 3):
            continue
        words = " ".join(raw[b1:b2]) if raw and len(raw) >= b2 else " ".join(ref[b1:b2])
        if op == "insert":
            specks = [k for k in range(idx[a1 - 1] + 1, idx[a1]) if lost(toks[k])]
            if specks:
                edits.append((specks[0], words))
        elif op == "replace" and a2 - a1 == 1 and len(ws[a1]) <= 3 and ws[a1] not in BIBLE:
            edits.append((idx[a1], words))
    out = list(toks)
    # Spelt as the verse spells the word elsewhere ("King"), if it does.
    seen = {norm(t): re.sub(r"[^A-Za-z'’]", "", t) for t in toks if norm(t)}
    for k, w in edits:
        w = " ".join(seen.get(norm(x), x) if norm(x) not in ("and", "the", "of", "a") else x for x in w.split())
        FILLED[w] = FILLED.get(w, 0) + 1
        out[k] = w
    return out


def mend(toks, ref, known, counts=None, key=None):
    """Words misread as non-words, put right from the word Challoner has in the same place:
    hearen -> heaven, Jorgive -> forgive. A real word (the 1582 wording) is never changed."""
    toks = fill(toks, ref, RAW.get(key))
    idx = [k for k, t in enumerate(toks) if norm(t)]
    ws = [norm(toks[k]) for k in idx]
    out = list(toks)
    for op, a1, a2, b1, b2 in SequenceMatcher(None, ws, ref, autojunk=False).get_opcodes():
        if op != "replace":
            continue
        for k in range(a2 - a1):
            w = ws[a1 + k]
            # A short "word" is only trusted when a Bible has it: the dictionary lists "od", "rd".
            if (w in BIBLE or (len(w) > 4 and w in known)) and w not in FRAGMENTS:
                continue
            # Challoner's word in the same place, or where the stretches differ in length, the most
            # like it of theirs (a word cut at a column's edge: "esus", "hrist", "lieved").
            if a2 - a1 == b2 - b1:
                r = ref[b1 + k]
            else:
                r = max(ref[b1:b2], key=lambda x: similar(w, x))
            if len(r) < 2 or similar(w, r) < (0.7 if a2 - a1 == b2 - b1 else 0.75):
                continue
            t = toks[idx[a1 + k]]
            lead = re.match(r"[^A-Za-z]*", t).group()
            fixed = r.capitalize() if t[len(lead):][:1].isupper() or CAPS.get(r, 0) > (counts or {}).get(r, 0) else r
            out[idx[a1 + k]] = lead + fixed + t[len(lead) + len(re.match(r"[A-Za-z'’]*", t[len(lead):]).group()):]
    out = rejoin(out)
    for k, t in enumerate(out):
        m = re.fullmatch(r"([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)", t)
        # A speck read as a capital before a word: "FAnd" for And.
        if m and len(m.group(2)) >= 3 and m.group(2)[:2].isupper() and m.group(2)[2:].islower() and m.group(2)[1:].lower() in BIBLE:
            out[k] = t = m.group(1) + m.group(2)[1:] + m.group(3)
            m = re.fullmatch(r"([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)", t)
        if counts and m and norm(m.group(2)) == m.group(2).lower():
            c = confused(m.group(2), counts, known)
            if c:
                FIXED[(m.group(2), c)] = FIXED.get((m.group(2), c), 0) + 1
                out[k] = m.group(1) + c + m.group(3)
    # A line of the Latin column read into the English: two or more Vulgate words running, or one
    # that is no English word ("sua").
    latin = [bool(norm(t)) and norm(t) in LATIN_WORDS for t in out]
    drop = set()
    k = 0
    while k < len(out):
        if latin[k]:
            j = k
            while j < len(out) and (latin[j] or not norm(out[j])):
                j += 1
            if sum(latin[k:j]) >= 2 or norm(out[k]) not in known or len(norm(out[k])) <= 4:
                drop.update(range(k, j))
            k = j
        else:
            k += 1
    out = [t for n, t in enumerate(out) if n not in drop]
    # What is left of a word cut short, three letters or fewer and no word any Bible has ("jo",
    # "il", "ls"), goes.
    return [t for t in out if not (re.fullmatch(r"[A-Za-z]{1,3}", t) and norm(t) not in BIBLE and t not in ("I", "O", "a", "A"))]


def rejoin(toks):
    """Words the reading broke across a line: "seek: ing" and "judg ment" joined when together
    they make a Bible word; the start of a word read twice ("pro proceedeth", "con: conceive")
    dropped."""
    out, k = [], 0
    while k < len(toks):
        t = toks[k]
        nxt = next((j for j in range(k + 1, min(k + 3, len(toks))) if norm(toks[j])), None)
        if norm(t) and nxt is not None:
            a, b = norm(t), norm(toks[nxt])
            if a not in BIBLE and len(a) <= 6 and b.startswith(a) and len(b) > len(a):
                k += 1  # "pro proceedeth"
                continue
            joined = a + b
            if joined in BIBLE and (a not in BIBLE or b not in BIBLE):  # "seek: ing", "judg ment"
                lead = re.match(r"[^A-Za-z]*", t).group()
                word = re.match(r"[A-Za-z'’]*", t[len(lead):]).group() + re.match(r"[^A-Za-z]*([A-Za-z'’]*)", toks[nxt]).group(1)
                tail = toks[nxt][len(re.match(r"[^A-Za-z]*[A-Za-z'’]*", toks[nxt]).group()):]
                out.append(lead + word + tail)
                k = nxt + 1
                continue
        out.append(t)
        k += 1
    return out


def clean(toks):
    out = []
    for t in toks:
        if t == "Q":
            t = "O"  # "Q ye of little faith"
        if not re.search(r"[A-Za-z]", t):
            # The 1582 text has no quotation marks: outside a word they are misread verse numbers.
            t = re.sub(r"[\"“”‘’'`]", "", t)
            if not t or not re.fullmatch(r"[.,;:!?()-]+", t):
                continue  # no letter, and not plain punctuation: specks, a verse number, "}.}}", "łł"
            if not out:
                continue  # punctuation can't start a verse
        if re.fullmatch(r"(\d+|[°*\"“”|=~_{}\[\]<>#§&%/†$‘'’]+|Il|o|[B-HJ-NP-Zb-z]|[^\x00-\x7f])[.,:;]?", t):
            continue  # a misread verse number, specks read as symbols, a lone letter that isn't a, I or O
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
    s = re.sub(r"(?<=[A-RT-Za-rt-z])['’](?![A-Za-z])", "", s)  # "Christ'" (but "camels' hair")
    s = re.sub(r"(?<![A-Za-z'’])[B-HJ-NP-Zb-z](?![A-Za-z'’])[.,:;]?\s*", "", s)  # a lone letter left by any route
    s = re.sub(r"([.,:;!?])[.,:;!?_]+", r"\1", s).replace("_", "")  # "things.," "good.." "power??" "him,!"
    s = re.sub(r"\s+([.,:;!?])", r"\1", s)
    return s.lstrip(" ,;:").rstrip(" ,")


def vocabulary():
    """Words that are real: the system's word list (tools/modules'), and every word of the library's English Bibles
    (for the archaic ones: loveth, sayest, whither); and how often each occurs in lower case in the
    KJV and Challoner, the modern spellings the 1872 edition shares."""
    known, counts = english_words() | {""}, {}  # "": a token of marks only counts as known, as it always has
    for f in ("kjv.bbli", "drc.bbli", "geneva1599.bbli", "tyndale.bbli"):
        modern = f in ("kjv.bbli", "drc.bbli")
        p = find(f)
        if p.exists():
            db = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            for (t,) in db.execute("SELECT Scripture FROM Bible"):
                for w in re.findall(r"[A-Za-z]+", re.sub(r"<[^>]+>", " ", t or "")):
                    n = norm(w)
                    known.add(n)
                    if modern:
                        BIBLE.add(n)
                        if w[:1].isupper():
                            CAPS[n] = CAPS.get(n, 0) + 1
                    if modern and w.islower():  # the old spellings and names don't count
                        counts[n] = counts.get(n, 0) + 1
            db.close()
    for f in ("latin.bbli", "clementine.bbli"):
        p = find(f)
        if p.exists():
            db = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
            for (t,) in db.execute("SELECT Scripture FROM Bible WHERE Book BETWEEN 40 AND 66"):
                LATIN_WORDS.update(norm(w) for w in re.findall(r"[A-Za-zæœ]+", re.sub(r"<[^>]+>", " ", t or "")))
            db.close()
    LATIN_WORDS.difference_update(BIBLE)
    return known, counts


def main():
    if not find("drc.bbli").exists():
        sys.exit(f"no {find('drc.bbli')}; tools/crosswire/build.py DRC makes it")
    CACHE.mkdir(parents=True, exist_ok=True)
    ref = challoner()
    known, counts = vocabulary()
    print(f"Challoner: {len(ref)} verses; {len(known)} known words")
    readings = []
    for r in READINGS_WINDOWS if WINDOWS else READINGS:
        got = verses(ref, tokens(scanned(r), known), known, counts)
        print(f"reading {r[0]}: {len(got)} verses, {sum(s for _, s in got.values()) / max(len(got), 1):.0%} of Challoner's words matched on average")
        readings.append(got)
    best, taken = {}, [0] * len(readings)
    for key, _ in ref:
        got = [(r[key][1], -i, r[key]) for i, r in enumerate(readings) if key in r]
        if got:
            _, i, best[key] = max(got)
            taken[-i] += 1
    shares = [s for _, s in best.values()]
    weak = sum(s < 0.5 for s in shares)
    print(f"kept: {len(best)} verses (" + ", ".join(f"{n} from {r[0]}" for r, n in zip(READINGS_WINDOWS if WINDOWS else READINGS, taken)) + f"), "
          f"{sum(shares) / len(shares):.0%} matched on average, {weak} under half")
    rows = [(*k, t) for k, (t, _) in sorted(best.items()) if t]
    print(f"  {sum(FILLED.values())} lost words put back from Challoner")
    if os.environ.get("RHEIMS_REPORT"):
        Path(os.environ["RHEIMS_REPORT"] + ".filled").write_text("\n".join(f"{n}\t{w}" for w, n in sorted(FILLED.items(), key=lambda x: -x[1])), encoding="utf-8")
        Path(os.environ["RHEIMS_REPORT"]).write_text("\n".join(f"{n}\t{a}\t{b}" for (a, b), n in sorted(FIXED.items(), key=lambda x: -x[1])), encoding="utf-8")
    missing = [k for k, _ in ref if k not in best]
    if missing:
        print(f"  none for {len(missing)} verses: {', '.join(f'{b}:{c}:{v}' for b, c, v in missing[:12])}{'…' if len(missing) > 12 else ''}")

    info = ("<p>The Rheims New Testament of 1582, the English College's Catholic translation from the Vulgate, which the KJV's "
            "translators consulted. The text is Bagster's 1872 parallel edition (The Vulgate New Testament, with the Douay "
            "version of 1582), whose spelling is modernised, read by machine (OCR) from the Internet Archive's scan of the University of "
            "Toronto's copy (archive.org/details/vulgatenewtestam00lond), public domain; verses are divided by lining "
            f"it up with Challoner's revision. {len(rows)} verses; on average {sum(shares) / len(shares):.0%} of each verse's words "
            "are Challoner's too, so much of the rest is the 1582 wording, but some is misreading, and words lost at the edge of "
            "a column are missing. Built by Two-edged Sword's tools/rheims.</p>")
    with module("rheims1582.bbli", "Rheims New Testament (1582)", "Rheims 1582", info, ot=False) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    print(f"rheims1582.bbli: {len(rows)} verses")


if __name__ == "__main__":
    main()
