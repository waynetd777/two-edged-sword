# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
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

Writes to the app's modules folder, where the app finds it after Library → Rescan.
"""
import html, os, re, sqlite3, subprocess, sys, zipfile
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import HOME, find, module, similar  # noqa: E402
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
    """Words that are real: the system dictionary, and every word of the library's English Bibles
    (for the archaic ones: loveth, sayest, whither); and how often each occurs in lower case in the
    KJV and Challoner, the modern spellings the 1872 edition shares."""
    known, counts = set(), {}
    words = Path("/usr/share/dict/words")
    if words.exists():
        known |= {w.strip().lower() for w in words.read_text().splitlines()}
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
    zp = Path(sys.argv[1]) if len(sys.argv) > 1 else ZIP
    rp = Path(sys.argv[2]) if len(sys.argv) > 2 else RTF
    for p in (zp, rp, find("drc.bbli")):
        if not p.exists():
            sys.exit(f"no {p}")
    ref = challoner()
    known, counts = vocabulary()
    print(f"Challoner: {len(ref)} verses; {len(known)} known words")
    a = verses(ref, tokens(pages(zp)), known, counts)
    print(f"pages: {len(a)} verses, {sum(s for _, s in a.values()) / max(len(a), 1):.0%} of Challoner's words matched on average")
    b = verses(ref, tokens(rtf_text(rp)), known, counts)
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
    print(f"  {sum(FILLED.values())} lost words put back from Challoner")
    if os.environ.get("RHEIMS_REPORT"):
        Path(os.environ["RHEIMS_REPORT"] + ".filled").write_text("\n".join(f"{n}\t{w}" for w, n in sorted(FILLED.items(), key=lambda x: -x[1])))
        Path(os.environ["RHEIMS_REPORT"]).write_text("\n".join(f"{n}\t{a}\t{b}" for (a, b), n in sorted(FIXED.items(), key=lambda x: -x[1])))
    missing = [k for k, _ in ref if k not in best]
    if missing:
        print(f"  none for {len(missing)} verses: {', '.join(f'{b}:{c}:{v}' for b, c, v in missing[:12])}{'…' if len(missing) > 12 else ''}")

    info = ("<p>The Rheims New Testament of 1582, the English College's Catholic translation from the Vulgate, which the KJV's "
            "translators consulted. The text is Bagster's 1872 parallel edition (The Vulgate New Testament, with the Douay "
            "version of 1582), whose spelling is modernised, as Google Books' machine reading has it; verses are divided by lining "
            f"it up with Challoner's revision. {len(rows)} verses; on average {sum(shares) / len(shares):.0%} of each verse's words "
            "are Challoner's too, so much of the rest is the 1582 wording, but some is misreading, and words lost at the edge of "
            "a column are missing. Built by Two-edged Sword's tools/rheims.</p>")
    with module("rheims1582.bbli", "Rheims New Testament (1582)", "Rheims 1582", info, ot=False) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", rows)
    print(f"rheims1582.bbli: {len(rows)} verses")


if __name__ == "__main__":
    main()
