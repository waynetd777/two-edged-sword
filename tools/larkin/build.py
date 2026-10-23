# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds Clarence Larkin's books, with their charts, from the Internet Archive's scans of the printed books:

  larkin_dispensational_truth.refi   Dispensational Truth, or God's Plan and Purpose in the Ages (revised, 1920)
  larkin_revelation.refi             The Book of Revelation (1919), its charts printed sideways turned to read

    python3 tools/larkin/build.py [dispensational_truth revelation]

Larkin (1850–1924) published his books himself, from 1918; they are public domain (published in the United States
before 1930, and their author dead more than 70 years). The charts are the heart of them, so each page that has a
chart or picture is kept as a picture at its place in the text, and a chart printed across two facing pages is
joined back into one; the app's picture viewer enlarges them. The pages were found by eye from the scans (CHARTS,
SPREADS below), as the OCR doesn't mark where the pictures are.

The text is the Archive's OCR (its hOCR: every line with its place and size on the page), in its reading order:
running heads and page numbers are dropped, and on a page with a chart, so are the chart's own labels (short lines,
or lone ones, that aren't the page's text). A line in larger type at a chapter's start is its heading. Words broken
at a line's end are joined. Bible references written in the text ("Matt. 12:40") are linked where each is a real
verse (tools/core's link_plain_refs). The OCR's misreadings are left as they are, and a chart's text is in the
picture only, so it can't be searched.

Sources: the Archive's item (archive.org/details/<id>), its hOCR and its page images (<id>_jp2.zip), each checked
against its sha256, as the Archive's files have no versions. Downloads are cached in
~/Library/Caches/Two-edged Sword/larkin, and so are the pictures once drawn (pictures/): one is drawn again only when
what it's drawn from changes (its scans, leaves, turning or other copies, or the code that draws pictures). Writes to
the app's modules folder, or to `into`.
"""
import base64, io, re, statistics, sys, zipfile
import xml.etree.ElementTree as ET
from html import escape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import CACHES, fetch, module  # noqa: E402

CACHE = CACHES / "larkin"
NS = "{http://www.w3.org/1999/xhtml}"
ARCHIVE = "https://archive.org/download/{id}/{id}{suffix}"


def pages(*spans):
    """Leaf numbers from (first, last) pairs and single leaves."""
    out = []
    for s in spans:
        out += list(range(s[0], s[1] + 1)) if isinstance(s, tuple) else [s]
    return out


BOOKS = {
    "dispensational_truth": dict(
        id="dispensationaltr0000lark",
        hocr="f9743a4645a97217e96040866e42fe6967ed49a59a34d2c70066fcf7778a41f5",
        jp2="1207c47210912f92a25bcb27c9a4737e242fd19640a8c5c855f8e94c92537877",
        title="Dispensational Truth", abbrev="Larkin DT",
        about="Clarence Larkin's Dispensational Truth, or God's Plan and Purpose in the Ages (revised and enlarged "
              "edition, 1920), with its charts: the ages and dispensations of Scripture set out in large drawings, "
              "from the Creation to the New Heavens and the New Earth.",
        # Leaves (the Archive's page images, numbered from 0) the book runs over: from the Foreword to the last
        # chapter's end, before the publisher's list of the author's other books.
        first=11, last=270,
        # Other scans of the same edition (other copies of the book), whose two-page charts may show more of what
        # the binding hides: each with its hOCR-less page images and, for each two-page chart's left leaf here, its
        # left leaf there (found by matching the pages' thumbnails).
        copies=[
            dict(id="dispensationaltr0000clar", jp2="8d1a452915af1d2f98f1e6deb4a08d4260d27813fdcd0705dccc2e30cb1ea2ff",
                 leaves={14: 16, 18: 22, 22: 28, 34: 42, 38: 48, 42: 54, 46: 60, 56: 72, 60: 78, 72: 92, 74: 96, 92: 116,
                         94: 120, 104: 132, 110: 140, 114: 146, 116: 150, 122: 158, 128: 166, 130: 170, 134: 176, 138: 182,
                         140: 186, 144: 192, 152: 202, 156: 208, 158: 212, 172: 228, 178: 236, 184: 244, 198: 260, 200: 264,
                         208: 274, 216: 284, 228: 298, 232: 304, 236: 310, 244: 320, 246: 324, 250: 330, 260: 342, 264: 348}),
            dict(id="dispensationaltr0000clar_o0h0", jp2="8f6867fdc25e6e75a3afa7f10938aa484751d7dc17b978a373e6243121ed0615",
                 leaves={14: 16, 18: 20, 22: 24, **{n: n for n in (34, 38, 42, 46, 56, 60, 72, 74, 92, 94, 104, 110, 114,
                         116, 122, 128, 130, 134, 138, 140, 144, 152, 156, 158, 172, 178, 184, 198, 200, 208, 216, 228,
                         232, 236, 244, 246, 250, 260, 264)}}),
        ],
        # A chart across two facing pages: its left leaf, the right one being the next.
        spreads=[14, 18, 22, 34, 38, 42, 46, 56, 60, 72, 74, 92, 94, 104, 110, 114, 116, 122, 128, 130, 134, 138, 140,
                 144, 152, 156, 158, 172, 178, 184, 198, 200, 208, 216, 228, 232, 236, 244, 246, 250, 260, 264],
        # Charts printed on the pages before the chapter they belong to (their titles name it): each is put after
        # that chapter's heading instead. By the left leaf of a two-page chart.
        ahead={14, 18, 34, 116, 130, 158, 198, 200},
        # A leaf with a chart or a picture on it, among its text.
        charts=pages(24, 28, 30, 32, 40, 45, 49, 50, 51, 52, 54, 58, 63, 65, 66, 67, 68, 69, 70, 71, 78, 83, 90, 102,
                     112, 113, 118, 127, 137, 163, 164, 166, 169, 170, 176, 182, 183, 186, 187, 189, 190, 191, 192, 193,
                     195, 196, 197, 203, 207, 222, 223, 226, 227, 235, 238, 239, 240, 241, 255, 256, 268),
        # Each chapter: the leaf its heading is on, and its heading's words as the OCR read them (the start of the
        # line in larger type), and its title.
        chapters=[
            (11, "FOREWORD", "Foreword"),
            (12, "THE PROPHETIC WORD", "1. The Prophetic Word"),
            (16, "PRE", "2. Pre-Millennialism"),
            (20, "MOUNTAIN PEAKS OF PROPHECY", "3. Mountain Peaks of Prophecy"),
            (24, "THE SECOND COMING OF CHRIST", "4. The Second Coming of Christ"),
            (37, "RIGHTLY DIVIDING THE WORD", "5. Rightly Dividing the Word"),
            (76, "THE PRESENT EVIL WORLD", "6. The Present Evil World"),
            (78, "THE DISPENSATIONAL WORK", "7. The Dispensational Work of the Lord Jesus Christ"),
            (85, "THE DISPENSATIONAL WORK", "8. The Dispensational Work of the Holy Spirit"),
            (91, "THE JEWS", "9. The Jews"),
            (103, "THE GENTILES", "10. The Gentiles"),
            (118, "THE CHURCH", "11. The Church"),
            (132, "THE KING", "12. The King"),
            (137, "THE KINGDOM", "13. The Kingdom"),
            (160, "THE SPIRIT WORLD", "14. The Spirit World"),
            (164, "SPIRITISM", "15. Spiritism"),
            (167, "THE RESURRECTION", "16. The Resurrection"),
            (171, "THE JUDGMENTS", "17. The Judgments"),
            (177, "SATAN", "18. Satan"),
            (183, "ANTICHRIST", "19. The Antichrist"),  # "THE" is read as a line of its own
            (193, "THE SATANIC TRINITY", "20. The Satanic Trinity"),
            (196, "THE FOUR GOSPELS", "21. The Four Gospels"),
            (202, "THE SEVEN CHURCHES", "22. The Seven Churches"),
            (207, "THE TRIBULATION", "23. The Tribulation"),
            (218, "BABYLON THE GREAT", "24. Babylon the Great"),
            (222, "RENOVATION OF THE EARTH", "25. Renovation of the Earth"),
            (227, "THE COVENANTS", "26. The Covenants"),
            (231, "THE MYSTERIES", "27. The Mysteries"),
            (235, "TYPES AND ANTI", "28. Types and Anti-Types"),
            (239, "THE THREE TREES", "29. The Three Trees to Which Israel Is Compared in the Scriptures"),
            (243, "THE FEASTS OF THE LORD", "30. The Feasts of the Lord"),
            (249, "THE OFFERINGS", "31. The Offerings"),
            (254, "DISPENSATIONAL TEACHING", "32. The Dispensational Teaching of the Great Pyramid"),
            (263, "SCRIPTURE NUMERICS", "33. Scripture Numerics"),
            (267, "THE SIGNS OF THE TIMES", "34. The Signs of the Times"),
        ],
    ),
    "revelation": dict(
        id="bookofrevelation00lark",
        hocr="6c1170959c81c89892aa4f487bb3ca233d7fc259ba39b82c208e0755c9c01e0b",
        jp2="2c6d39444038487d460e6b9b4d036a879f2271fdb88eb79fb8cae1713744bf28",
        title="The Book of Revelation", abbrev="Larkin Rev",
        about="Clarence Larkin's The Book of Revelation: A Study of the Last Prophetic Book of Holy Scripture (1919), "
              "with its charts: the book read as a whole, from \"the things which thou hast seen\" to the New Heaven "
              "and the New Earth.",
        first=15, last=240,
        # A later scan of another copy, for what its two-page charts show at the binding (its pages are numbered alike).
        copies=[dict(id="bookofrevelation0000clar_c9f4", jp2="de8abe0b253272af86ae1b3d1b1d8fece8cb003975c6142cb7e61c43ae9f691d",
                     leaves={20: 20, 72: 72})],
        spreads=[20, 72],
        # Two-page charts printed between paragraphs of text, which is kept (other two-page charts fill their pages).
        spread_text={72},
        charts=[18, 27, 32, 41, 52, 58, 59, 61, 64, 66, 68, 69, 77, 79, 81, 82, 83, 84, 88, 89, 90, 95, 96, 99, 101, 104, 106, 115, 121, 129, 132, 134, 135, 136, 138, 141, 145, 147, 149, 151, 153, 154, 158, 160, 161, 162, 164, 167, 171, 174, 175, 186, 188, 189, 207, 208, 211, 215, 226, 234, 240],
        # The picture facing the title page and the two-page chart after it: the Introduction's, not the Foreword's.
        ahead={18, 20},
        # Charts printed sideways on the page, turned to read (a quarter turn clockwise).
        sideways=[18, 27, 32, 41, 52, 59, 61, 69, 77, 101, 132, 149, 153, 167, 174, 186, 207, 208, 211, 215, 226, 234],
        chapters=[
            (15, "FOREWORD", "Foreword"),
            (23, "THE BOOK OF REVELATION", "Introduction: The Title, the Blessing, the Salutation"),
            (30, "THE THINGS WHICH THOU HAST SEEN", "1. The Things Which Thou Hast Seen"),
            (40, "THE THINGS WHICH ARE", "2. The Things Which Are: the Seven Churches"),
            (54, "THE THINGS WHICH SHA", "3. The Things Which Shall Be Hereafter"),
            (79, "THE SEVEN SEALS", "4. The Seven Seals"),
            (91, "THE INTERVAL BETWEEN THE SIXTH", "5. The Interval Between the Sixth and Seventh Seals"),
            (96, "THE SEVEN TRUMPETS", "6. The Seven Trumpets"),
            (106, "THE INTERVAL BETWEEN THE SIXTH", "7. The Interval Between the Sixth and Seventh Trumpets"),
            (115, "THE MIDDLE OF THE WEEK", "8. The Middle of the Week: the Seven Personages"),
            (164, "THE SEVEN LAST PLAGUES", "9. The Seven Last Plagues, or Vial Judgments"),
            (175, "THE SEVEN DOOMS", "10. The Seven Dooms"),
            (225, "THE SEVEN NEW THINGS", "11. The Seven New Things"),
            (239, "THE AGES OF THE AGES", "12. The Ages of the Ages"),
        ],
    ),
}


def box(title):
    return tuple(int(x) for x in re.search(r"bbox (\d+) (\d+) (\d+) (\d+)", title).groups())


def read_hocr(path):
    """[(width, height, [paragraph: [line: (box, x_size, text)]])] for each leaf, in the OCR's reading order."""
    out = []
    for pg in ET.parse(path).getroot().iter(NS + "div"):
        if pg.get("class") != "ocr_page":
            continue
        pars = []
        for p in pg.iter(NS + "p"):
            lines = []
            for line in p:
                if not (line.get("class") or "").startswith("ocr_"):
                    continue
                size = re.search(r"x_size ([\d.]+)", line.get("title"))
                words = ["".join(w.itertext()).strip() for w in line if w.get("class") == "ocrx_word"]
                text = " ".join(w for w in words if w)
                if text:
                    lines.append((box(line.get("title")), float(size[1]) if size else 0.0, text))
            if lines:
                pars.append(lines)
        out.append((*box(pg.get("title"))[2:], pars))
    return out


def joined(lines):
    """A paragraph's lines as one text: a word broken at a line's end ("disper-" "sion") joined."""
    s = ""
    for _, _, t in lines:
        if s.endswith("-") and t[:1].islower():
            s = s[:-1] + t
        else:
            s = f"{s} {t}" if s else t
    return re.sub(r"\s+", " ", s).strip()


def junk(text):
    """Whether a paragraph is the OCR's reading of a drawing, not words: mostly symbols, or, short, with no word in it
    ("lilllliil", "sl'i^lflf'^", "■iijX")."""
    chars = re.sub(r"\s", "", text)
    if not chars:
        return True
    letters = sum(c.isalnum() for c in chars)
    odd = len(re.findall(r"[^\w.,;:!?'\"“”‘’()\[\]\-—–&*/]", chars))
    if letters / len(chars) < 0.5 or odd / len(chars) > 0.08:
        return True
    words = re.findall(r"\b(?:[A-Z]?[a-z]{2,}|[A-Z]{3,})\b", text)
    real = [w for w in words if re.search(r"[aeouyAEOUY]|[^ilI]i|i[^ilI]", w)]  # not a run of strokes ("lilllliil")
    return len(text) < 40 and not real


def vocabulary(hocr, leaves):
    """The words the book uses: those read on its pages of text (`leaves`, not its charts), lower case."""
    from collections import Counter
    n = Counter(w.lower() for leaf in leaves for p in hocr[leaf][2] for _, _, line in p for w in re.findall(r"[A-Za-z]{2,}", line))
    return set(n)


def wordy(text, vocab):
    """The share of a paragraph's words that the book uses elsewhere (1 for one with no words to judge): words of
    three letters or more count for it, a stray letter (not "a" or "I") against it, two-letter words not at all."""
    tokens = re.findall(r"[A-Za-z]+", text)
    good = sum(len(w) >= 3 and w.lower() in vocab for w in tokens)
    bad = sum(len(w) >= 3 and w.lower() not in vocab for w in tokens) + sum(len(w) == 1 and w not in "aAI" for w in tokens)
    return good / (good + bad) if good + bad else 1.0


def paragraphs(W, H, pars, chart, start=None, vocab=None):
    """A leaf's paragraphs as (is a heading, text): no running head or page number, nothing the OCR made of a
    drawing (junk), and on a chart's leaf only its text, not the chart's labels; there a line in large type is a
    heading only if it's the chapter's that starts on the leaf (`start`, its first words)."""
    sizes = [size for p in pars for _, size, _ in p if size]
    body = statistics.median(sizes) if sizes else 0
    out = []
    for p in pars:
        top, bottom = p[0][0][1], p[-1][0][3]
        text = joined(p)
        if not re.search(r"[A-Za-z]{2}", text):
            continue  # a page number, a speck
        heading = body and statistics.median(size for _, size, _ in p) >= 1.4 * body and len(text) < 90
        if bottom < H * 0.07 and len(text) < 80 and not heading:
            continue  # the running head (a part's heading at the very top of a page isn't one)
        if top > H * 0.93 and len(text) < 12:
            continue  # the page number
        bare = re.sub(r"^[IVXLlNn1|]{1,6}\.?(\s*\|)?\s+", "", text.upper()).replace(" ", "")
        opens = bool(start) and bare.startswith(start.replace(" ", ""))  # the heading of the chapter starting here
        if not opens and (junk(text) or (vocab and wordy(text, vocab) < (0.6 if chart else 0.3))):
            continue  # the OCR's reading of a drawing, or of a chart's lettering
        if chart and heading:
            heading = opens
        widths = [b[2] - b[0] for b, _, _ in p]
        if chart and not heading and (len(p) < 2 or statistics.median(widths) < W * 0.3):
            continue  # a chart's label
        out.append((bool(heading), text))
    return out


def linked(s, link_plain_refs, passage_refs):
    """Bible references in Larkin's text as links. He writes them "Gen. 1: 26-28" (a space after the colon), "I Cor.
    2:11-14" (the book's number in Roman), and runs on to another chapter of the same book after a semicolon ("Rev.
    19:11-21; 20:1-3"): each is put in the form tools/core's link_plain_refs reads, and a further chapter is linked
    in the book before it, where it is a real verse."""
    s = re.sub(r"\b([A-Z][a-z]{1,12})\.(?=\d)", r"\1. ", s)  # "Rev.12:7-9"
    s = re.sub(r"(?<=\d)\s*:\s*(?=\d)", ":", s)  # "Gen. 1 : 26-28", "19: 11"
    s = re.sub(r"\b(III|II|I) (?=(?:Sam|Kings|Kgs|Chron|Cor|Thess|Tim|Pet|John)[a-z]*\.? \d)", lambda m: f"{len(m[1])} ", s)
    s = link_plain_refs(s)
    def more(m):
        r = passage_refs(f"{m[2]} {m[4]}")
        return f"{m[1]}{m[3]}{r[0]}" if r else m[0]
    for _ in range(6):  # a run of chapters, one at a time
        s2 = re.sub(r"(<ref>(\w+) [^<]*</ref>)([;,] ?)(\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?)(?![\d:])", more, s)
        if s2 == s:
            break
        s = s2
    return s


def paper(im):
    """The part of a scan that is the page: the dark board round it cut away (rows and columns mostly dark)."""
    import numpy as np
    ink = np.asarray(im) < 160
    h, w = ink.shape
    cols, rows = ink.mean(0), ink.mean(1)
    left = next((x for x in range(w // 4) if cols[x] < 0.5), 0)
    right = w - next((x for x in range(w // 4) if cols[w - 1 - x] < 0.5), 0)
    top = next((y for y in range(h // 4) if rows[y] < 0.5), 0)
    bottom = h - next((y for y in range(h // 4) if rows[h - 1 - y] < 0.5), 0)
    return im.crop((left, top, right, bottom))


def printed(im, pad=40):
    """A page cut to what's printed on it, with a margin of `pad`: its blank margins gone (specks aside)."""
    import numpy as np
    ink = np.asarray(im) < 160
    used_c = np.where(ink.mean(0) > 0.003)[0]
    used_r = np.where(ink.mean(1) > 0.003)[0]
    if not len(used_c) or not len(used_r):
        return im
    return im.crop((max(0, used_c[0] - pad), max(0, used_r[0] - pad),
                    min(im.width, used_c[-1] + pad), min(im.height, used_r[-1] + pad)))


def seam_offset(left, right, strip=240, most=120, near=0):
    """How far down to move the right half of a chart across two pages so its lines meet the left half's: the
    shift, within `most` pixels of `near`, at which the rows of ink at the two edges of the binding agree best."""
    import numpy as np
    a = (np.asarray(left)[:, -strip:] < 160).mean(1)
    b = (np.asarray(right)[:, :strip] < 160).mean(1)
    a, b = a - a.mean(), b - b.mean()
    def agree(dy):
        if dy >= 0:
            n = min(len(a) - dy, len(b))
            return float((a[dy:dy + n] * b[:n]).sum())
        n = min(len(a), len(b) + dy)
        return float((a[:n] * b[-dy:-dy + n]).sum())
    return max(range(near - most, near + most + 1), key=agree)


def level(im):
    """A scan turned level: by the angle, within 2°, at which its rows of ink are most sharply divided (found on a
    quarter-size copy, in steps of 0.05°)."""
    import numpy as np
    from PIL import Image
    small = im.resize((im.width // 4, im.height // 4))
    ink = Image.fromarray(((np.asarray(small) < 160) * 255).astype(np.uint8))
    def sharpness(d):
        rows = np.asarray(ink.rotate(d, resample=Image.BILINEAR, fillcolor=0), dtype=np.float32).sum(1)
        return float(((rows[1:] - rows[:-1]) ** 2).sum())
    d = max(np.arange(-2, 2.001, 0.05), key=sharpness)
    return im.rotate(float(d), resample=Image.BICUBIC, fillcolor=255) if abs(d) > 0.02 else im


def rules(im, side, strip=120):
    """Where ruled lines meet a half's inner edge: the middle row of each run of rows that are mostly ink across
    the `strip` of columns at that `side`."""
    import numpy as np
    a = np.asarray(im)
    band = a[:, -strip:] if side == "right" else a[:, :strip]
    on = (band < 128).mean(1) > 0.6
    out, start = [], None
    for y, v in enumerate(on):
        if v and start is None:
            start = y
        elif not v and start is not None:
            if y - start < 25:  # a rule, not a solid block
                out.append((start + y - 1) / 2)
            start = None
    return np.array(out)


def nudged(left_rules, right_rules, dy, most=30):
    """`dy`, or a shift within `most` pixels of it at which at least three more of the ruled lines at the binding
    meet (within 3 pixels); the border fixes the place, the rules only refine it."""
    import numpy as np
    if not len(left_rules) or not len(right_rules):
        return dy
    def meet(d):
        return int((np.abs(left_rules[:, None] - (right_rules[None, :] + d)).min(0) <= 3).sum())
    best = max(range(dy - most, dy + most + 1), key=lambda d: (meet(d), -abs(d - dy)))
    return best if meet(best) >= meet(dy) + 3 else dy


def fitted(base, other):
    """Where `other` (the same page in another copy, scanned at its own size and place) lies on `base`: the scale and
    offset (s, dx, dy) at which its ink best covers base's, searched over scales within 8% on quarter-size copies
    by cross-correlation, then refined at half size."""
    import numpy as np
    from PIL import Image
    def ink(im, f):
        return (np.asarray(im.resize((im.width // f, im.height // f))) < 128).astype(np.float32)
    def best_at(f, scales):
        a = ink(base, f)
        A = np.fft.rfft2(a - a.mean(), s=(a.shape[0] * 2, a.shape[1] * 2))
        top = (-np.inf, 1.0, 0, 0)
        for sc in scales:
            o = other.resize((max(1, round(other.width * sc)), max(1, round(other.height * sc))))
            b = ink(o, f)
            B = np.fft.rfft2(b - b.mean(), s=A.shape[:1] + (a.shape[1] * 2,))
            c = np.fft.irfft2(A * np.conj(B), s=(a.shape[0] * 2, a.shape[1] * 2))
            y, x = np.unravel_index(np.argmax(c), c.shape)
            v = c[y, x] / (np.sqrt((b * b).sum()) + 1e-6)
            if v > top[0]:
                h2, w2 = c.shape
                top = (v, sc, (x if x < w2 // 2 else x - w2) * f, (y if y < h2 // 2 else y - h2) * f)
        return top
    _, sc, _, _ = best_at(4, np.arange(0.92, 1.0801, 0.004))
    _, sc, dx, dy = best_at(2, np.arange(sc - 0.004, sc + 0.0041, 0.001))
    return sc, dx, dy


def extended(base, others, side):
    """A half of a two-page chart from whichever copy reaches furthest towards the binding (`side` is where the
    binding is): another copy's is fitted onto this one's (fitted) and used instead, in the same place, so it
    still meets the other half as this one's would."""
    from PIL import Image
    def bbox(im):  # what's printed on a page: (left, top, right, bottom)
        import numpy as np
        ink = np.asarray(im) < 128
        c, r = np.where(ink.mean(0) > 0.003)[0], np.where(ink.mean(1) > 0.003)[0]
        return (c[0], r[0], c[-1], r[-1]) if len(c) and len(r) else (0, 0, im.width, im.height)
    have = bbox(base)
    best = None
    for other in others:
        sc, dx, dy = fitted(base, other)
        o = other.resize((round(other.width * sc), round(other.height * sc)), Image.LANCZOS)
        gain = (dx + o.width - base.width) if side == "right" else -dx
        # Only a copy that has all this one's print (its top, bottom and outer edge) as well as more at the binding.
        x0, y0, x1, y1 = bbox(o)
        x0, y0, x1, y1 = x0 + dx, y0 + dy, x1 + dx, y1 + dy
        covers = y0 <= have[1] + 15 and y1 >= have[3] - 15 and (x0 <= have[0] + 15 if side == "right" else x1 >= have[2] - 15)
        if gain > 15 and covers and (best is None or gain > best[0]):
            best = (gain, o, dx, dy)
    if best is None:
        return base, 0
    gain, o, dx, dy = best
    x0 = min(0, dx)
    out = Image.new("L", (max(base.width, dx + o.width) - x0, base.height), 255)
    # The other copy's half on its own (laid over this one's, the two never quite agree near the binding, where
    # the pages curve, and the print doubles), placed where this one's would be.
    out.paste(o, (dx - x0, dy))
    return out, gain


def frame(im):
    """The rows of a chart's border, top and bottom (ruled lines across most of the page's width), each None where
    there's none; the scan's own edge (its outermost 1%) isn't taken for one."""
    import numpy as np
    ink = (np.asarray(im) < 128).mean(1)
    h = im.height
    rows = np.where(ink > 0.4)[0]
    top = rows[(rows > h * 0.01) & (rows < h * 0.25)]
    bottom = rows[(rows > h * 0.75) & (rows < h * 0.99)]
    return (int(top[0]) if len(top) else None), (int(bottom[-1]) if len(bottom) else None)


def picture(z, names, leaves, width, others=(), turn=False):
    """A page's image, or a chart across two pages joined back into one, as a WebP picture `width` wide: grey, the
    paper made white, cut to what's printed. The two pages of a chart weren't always scanned alike (a little larger,
    or turned), so each half is levelled and the right one fitted to the left by the chart's border; what the
    binding hid is lost."""
    from PIL import Image, ImageOps
    # The paper white, so the print showing through from the page's other side goes; the ink black.
    levels = [0 if v < 50 else 255 if v > 200 else round((v - 50) * 255 / 150) for v in range(256)]
    def page(zf, ns, leaf):
        im = paper(ImageOps.autocontrast(Image.open(io.BytesIO(zf.read(ns[leaf]))).convert("L"), cutoff=(1, 2)).point(levels))
        return im.rotate(-90, expand=True) if turn else im  # a chart printed sideways, turned to read
    ims = [page(z, names, leaf) for leaf in leaves]
    if len(ims) == 2:
        left, right = level(ims[0]), level(ims[1])
        # Where another copy shows more of a half at the binding, that part is added from it.
        left, _ = extended(left, [level(page(zf, ns, leaf)) for zf, ns, leaf in others], "right")
        right, _ = extended(right, [level(page(zf, ns, leaf + 1)) for zf, ns, leaf in others], "left")
        (lt, lb), (rt, rb) = frame(left), frame(right)
        if lt is not None and rt is not None:
            # By the border: scaled only where both bottoms are found too and the borders' heights nearly agree,
            # then moved a little further (within 30 pixels) where that makes clearly more ruled lines meet.
            k = 1.0
            if lb is not None and rb is not None and abs((rb - rt) / (lb - lt) - 1) < 0.03:
                k = (lb - lt) / (rb - rt)
                right = right.resize((round(right.width * k), round(right.height * k)), Image.LANCZOS)
            dy = lt - round(rt * k)
            dy = nudged(rules(left, "right"), rules(right, "left"), dy)
        else:
            dy = seam_offset(left, right)
        top = min(0, dy)
        out = Image.new("L", (left.width + right.width, max(left.height, dy + right.height) - top), 255)
        out.paste(left, (0, -top))
        out.paste(right, (left.width, dy - top))
    else:
        out = level(ims[0])  # some pages were scanned a little turned
    out = printed(out)
    out = out.resize((width, round(out.height * width / out.width)), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "WEBP", quality=70, method=6)
    return f'<p><img src="data:image/webp;base64,{base64.b64encode(buf.getvalue()).decode()}"></p>'


_zips = {}


def _zip(item_id, sha):
    """An item's page images, opened once per process."""
    if item_id not in _zips:
        zf = zipfile.ZipFile(fetch(ARCHIVE.format(id=item_id, suffix="_jp2.zip"), CACHE / f"{item_id}_jp2.zip", sha256=sha))
        _zips[item_id] = (zf, sorted(n for n in zf.namelist() if n.endswith(".jp2")))
    return _zips[item_id]


# What a picture is made by: when any of it changes, every picture is drawn again.
DRAWING = (paper, printed, seam_offset, level, rules, nudged, fitted, extended, frame, picture)


def _key(name, leaf):
    """What one picture depends on: the code that draws pictures, the scans (by their hashes) and the leaves, width,
    turning and other copies it's drawn from."""
    import hashlib, inspect
    b = BOOKS[name]
    spread = leaf in b["spreads"]
    parts = ["".join(inspect.getsource(f) for f in DRAWING), b["jp2"], str(leaf), str(spread),
             str(leaf in b.get("sideways", ()))]
    if spread:
        parts += [f"{c['jp2']}:{c['leaves'][leaf]}" for c in b.get("copies", []) if leaf in c["leaves"]]
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:16]


def _render(job):
    """One picture of a book, in a worker process: drawn (picture), or the one drawn before with the same _key,
    kept in ~/Library/Caches/Two-edged Sword/larkin/pictures."""
    name, leaf = job
    b = BOOKS[name]
    kept = CACHE / "pictures" / f"{name}-{leaf}-{_key(name, leaf)}.html"
    if kept.is_file():
        return leaf, kept.read_text()
    z, names = _zip(b["id"], b["jp2"])
    if leaf in b["spreads"]:
        others = [(*_zip(c["id"], c["jp2"]), c["leaves"][leaf]) for c in b.get("copies", []) if leaf in c["leaves"]]
        html = picture(z, names, [leaf, leaf + 1], 2800, others)
    else:
        html = picture(z, names, [leaf], 1600, turn=leaf in b.get("sideways", ()))
    kept.parent.mkdir(parents=True, exist_ok=True)
    for old in kept.parent.glob(f"{name}-{leaf}-*.html"):  # an older drawing of it
        old.unlink()
    tmp = kept.with_suffix(".part")
    tmp.write_text(html)
    tmp.replace(kept)
    return leaf, html


def build(name, into=None):
    from core.build import link_plain_refs, passage_refs
    b = BOOKS[name]
    hocr = read_hocr(fetch(ARCHIVE.format(id=b["id"], suffix="_hocr.html"), CACHE / f"{b['id']}_hocr.html", sha256=b["hocr"]))
    # The pictures first, on every core: fitting the other copies' halves of the two-page charts is slow.
    import os
    from concurrent.futures import ProcessPoolExecutor
    _zip(b["id"], b["jp2"])
    for c in b.get("copies", []):
        _zip(c["id"], c["jp2"])  # downloaded here, once, not by each worker
    jobs = [(name, leaf) for leaf in range(b["first"], b["last"] + 1) if leaf in b["spreads"] or leaf in b["charts"]]
    todo = [j for j in jobs if not (CACHE / "pictures" / f"{name}-{j[1]}-{_key(*j)}.html").is_file()]
    print(f"  {len(jobs) - len(todo)} pictures as drawn before, {len(todo)} to draw")
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 2) - 1)) as pool:
        drawn = dict(pool.map(_render, jobs))
    spreads = set(b["spreads"]) | {n + 1 for n in b["spreads"]}
    starts = {leaf: (words, title) for leaf, words, title in b["chapters"]}
    vocab = vocabulary(hocr, [n for n in range(b["first"], b["last"] + 1) if n not in b["charts"] and n not in spreads])
    rows, cur, title, pictures, ahead = [], [], None, 0, []
    for leaf in range(b["first"], b["last"] + 1):
        # A picture on the page a chapter starts on goes after that chapter's heading (held till it's read).
        held = []
        dest = ahead if leaf in b.get("ahead", ()) else held if leaf in starts else cur
        if leaf in drawn:
            dest.append(drawn[leaf])
            pictures += 1
        texted = leaf in b.get("spread_text", ()) or leaf - 1 in b.get("spread_text", ())
        if leaf in spreads and not texted:
            cur += held
            continue  # a two-page chart's text is in the picture
        W, H, pars = hocr[leaf]
        on = starts.get(leaf)
        for k, (heading, text) in enumerate(paragraphs(W, H, pars, leaf in b["charts"] or leaf in spreads, on and on[0], vocab)):
            start = starts.get(leaf)
            # "IX THE JEWS", "Il PRE - …", "n. The Things Which Are": the chapter's number as the OCR read it set aside.
            bare = re.sub(r"^[IVXLlNn1|]{1,6}\.?(\s*\|)?\s+", "", text.upper()).replace(" ", "")
            # A chapter's heading, or a page's first paragraphs where its heading is in the text's own type (a Foreword).
            if (heading or k < 3) and start and bare.startswith(start[0].replace(" ", "")):
                if title:
                    rows.append((title, "".join(cur)))
                title, cur = start[1], [f"<p><b>{escape(start[1])}</b></p>", *ahead, *held]
                ahead, held = [], []
                starts.pop(leaf)
                continue
            if heading and len(text) < 4:
                continue  # a word of a heading read on its own ("THE")
            if heading:
                cur.append(f"<p><b>{escape(text)}</b></p>")
            elif text[:1].islower() and cur and cur[-1].startswith("<p>") and not cur[-1].startswith(("<p><b>", "<p><img")):
                # A sentence carried over a column or a page ("ce," "and so…"): joined to its paragraph.
                prev = cur[-1][3:-4]
                joint = prev[:-1] if prev.endswith("-") else prev + " "
                cur[-1] = f"<p>{joint}{linked(escape(text), link_plain_refs, passage_refs)}</p>"
            else:
                cur.append(f"<p>{linked(escape(text), link_plain_refs, passage_refs)}</p>")
        cur += held  # a chapter's page whose heading wasn't found keeps its picture where it is
    rows.append((title, "".join(cur)))
    missed = [t for _, t in starts.values()]
    if missed:
        sys.exit(f"{name}: chapter headings not found: {', '.join(missed)}")
    refs = sum(h.count("<ref") for _, h in rows)
    info = (f"<p>{escape(b['about'])}</p><p>From the Internet Archive's scan (archive.org/details/{b['id']}), public "
            f"domain. The text is the scan's OCR, so some words are misread; each page with a chart is kept as a "
            f"picture. {len(rows)} chapters, {pictures} pictures, {refs} Bible references linked. "
            "Built by Two-edged Sword's tools/larkin.</p>"
            "<p>About the charts: they are photographs of the printed book, so the paper's texture and some print "
            "showing through from the other side remain. "
            + ("Charts printed sideways on the page are turned to read. " if b.get("sideways") else "")
            + "The largest charts were printed across two facing pages; each is joined back into one picture, but a "
            "narrow strip down the middle was hidden in the binding when the book was scanned, so letters and lines "
            "there are cut or missing. Where another scanned copy of the book shows more of that strip, its half of "
            "the chart is used instead. Click a chart to enlarge it.</p>")
    with module(f"larkin_{name}.refi", b["title"], b["abbrev"], info, into=into) as db:
        db.executemany("INSERT INTO Reference VALUES (?,?)", rows)
    print(f"larkin_{name}.refi: {len(rows)} chapters, {pictures} pictures, {refs} references linked")


def main(into=None, names=None):
    """Writes the books named (all, by default) to the app's modules folder, or to `into`."""
    names = names or sys.argv[1:] or list(BOOKS)
    for n in names:
        if n not in BOOKS:
            sys.exit(f"unknown book {n}; one of {', '.join(BOOKS)}")
        build(n, into)


if __name__ == "__main__":
    main()
