# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds reference books from the Christian Classics Ethereal Library's ThML editions (ccel.org), each
marked there "Public Domain":

  josephus.refi   The Works of Flavius Josephus, William Whiston's translation (1737): his Life, the
                  Antiquities of the Jews, the Wars of the Jews, Against Apion and the Discourse on Hades
  edersheim.refi  Alfred Edersheim, The Life and Times of Jesus the Messiah (1883)
  pilgrim.refi    John Bunyan, The Pilgrim's Progress (1678 and 1684), both parts
  lawrence.refi   Brother Lawrence, The Practice of the Presence of God: his conversations and letters
  bounds.refi     E. M. Bounds on prayer: seven of his books (1907–1931) in one
  sheldon.refi    Charles M. Sheldon, In His Steps (1896)

    python3 tools/ccel/build.py [josephus edersheim pilgrim lawrence bounds sheldon]

A chapter of the book is a chapter in the app, titled from the book's own headings ("Antiquities 1.1: The
Constitution of the World…"). CCEL marks each Bible reference with the passage it means (scripRef's
parsed="|John|16|13|0|0"), so each becomes a <ref> the app opens, its v giving the passage in e-Sword's
abbreviations while the text stays as printed ("John xvi. 13"); a reference to the Apocrypha stays text.
Footnotes are numbered in the text and listed under the chapter. Greek is marked as Greek. Edersheim's
figures (a synagogue's plan, the Last Supper's table, the family trees of the Maccabees and Herod) are fetched,
turned level (the scans are a degree or two askew) and kept in the chapter. The indexes, which give
the printed edition's page numbers, are left out.

The files are taken as they were when this was written, checked against their sha256: CCEL has no
versions, so a changed file stops the build until it's looked at. Downloads are cached in
~/Library/Caches/Two-edged Sword/ccel. Writes to the app's modules folder, or to `into`.
"""
import base64, re, sys, urllib.parse
import xml.etree.ElementTree as ET
from html import escape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from books import ABBR, OSIS  # noqa: E402
from modules import CACHES, fetch, module  # noqa: E402
import covers  # noqa: E402

CACHE = CACHES / "ccel"
BOOKS = {
    "josephus": dict(
        url="https://www.ccel.org/ccel/josephus/complete.xml",
        sha256="b7cff7c4a88f7a9b0daf293696f38a66964d81d0e87802a18be0f3a50f1548a3",
        cover=dict(title=[("THE WORKS OF", 40), ("FLAVIUS", 78), ("JOSEPHUS", 78)], author=[("TRANSLATED BY", 22), ("WILLIAM WHISTON", 34)],
                   rgb=(28, 42, 78), ornament="star"),
        title="The Works of Flavius Josephus", abbrev="Josephus",
        about="The works of Flavius Josephus (37–c. 100), the Jewish historian, in William Whiston's translation (1737): "
              "his Life, the Antiquities of the Jews, the Wars of the Jews, Against Apion and the Discourse to the Greeks "
              "concerning Hades, with Whiston's notes."),
    "edersheim": dict(
        url="https://www.ccel.org/ccel/edersheim/lifetimes.xml",
        sha256="aa20f33d57f0f1d780886840c2d1ac523bb7004e9ff7f7f23a536c5c56150334",
        cover=dict(title=[("THE LIFE AND TIMES", 40), ("OF", 30), ("JESUS", 78), ("THE MESSIAH", 56)], author=[("ALFRED EDERSHEIM", 36)],
                   rgb=(32, 72, 52), ornament="cross"),
        title="The Life and Times of Jesus the Messiah", abbrev="Edersheim",
        about="Alfred Edersheim's The Life and Times of Jesus the Messiah (1883; third edition, 1886): the Gospel story "
              "told against the Jewish life, worship and teaching of its time, with the author's notes and appendices."),
    "pilgrim": dict(
        url="https://www.ccel.org/ccel/bunyan/pilgrim.xml",
        sha256="1ebdfd4db68990f3cb26cb81305f0a32f2eb9ec0faedf33e2ee54414f9414353",
        cover=dict(title=[("THE", 36), ("PILGRIM’S", 78), ("PROGRESS", 78)], author=[("JOHN BUNYAN", 40)], rgb=(186, 160, 118),
                   stamp=(58, 34, 22), ornament="diamonds"),
        title="The Pilgrim's Progress", abbrev="Pilgrim",
        about="John Bunyan's The Pilgrim's Progress from This World to That Which Is to Come (Part I, 1678; Part II, "
              "1684): Christian's journey, and then Christiana's, told as a dream, with the Bible verses Bunyan set in "
              "its margins."),
    "lawrence": dict(
        url="https://www.ccel.org/ccel/lawrence/practice.xml",
        sha256="05149b19c169d3f148add4a75f90a84fce96a75ba776b919f8c4fc59d78b3c6d",
        skip=("The Practice of the Presence of God: The Best Rule of Holy Life", "Appendix to electronic edition"),
        cover=dict(title=[("THE PRACTICE", 54), ("OF THE", 34), ("PRESENCE", 70), ("OF GOD", 54)], author=[("BROTHER LAWRENCE", 36)],
                   rgb=(64, 86, 112), ornament="lamp"),
        title="The Practice of the Presence of God", abbrev="Br Lawrence",
        about="The conversations and letters of Brother Lawrence (Nicolas Herman, c. 1614–1691), a lay brother of the "
              "Carmelites in Paris, on living every moment in the presence of God."),
    "bounds": dict(
        parts=[  # (CCEL's name, its sha256, the book's title in chapter names)
            ("power", "3db594d5db6ed1051807e9135a9cc186db79bb0e29320b80d6e1a08ab747d130", "Power Through Prayer"),
            ("purpose", "ca459b635fbf8503985fada4e4e477966d68035a4a526d20f8e77800ae958158", "Purpose in Prayer"),
            ("prayingmen", "cb76e71624d98570f49ec2d98db7e559f66826b81474227eb69cda088b171996", "Prayer and Praying Men"),
            ("reality", "4105d0e12a05c8217a966ca372b16f5451ab0c0f4dd2ad8dc749f987fe6c91c1", "The Reality of Prayer"),
            ("essentials", "9a23ce9261e2cc5606ff6e14b01eb9dbc830128097539d57d123f7997bebf218", "The Essentials of Prayer"),
            ("necessity", "ce64dd0f86d175fc470e955c69c6fdf3ef0a2d1ec8f2741a42ea1ba9ba780f93", "The Necessity of Prayer"),
            ("weapon", "f67928a78e0a6d773e7a45fecb66adf918ca2a11de20175bb083d0e13f6f5bc5", "The Weapon of Prayer"),
        ],
        skip=("Title Page",),
        cover=dict(title=[("E. M. BOUNDS", 50), ("ON", 34), ("PRAYER", 86)], author=[("SEVEN BOOKS", 30)], rgb=(84, 40, 72),
                   picture="hands-bitmap"),  # Dürer's Praying Hands, as the music player shows them
        title="E. M. Bounds on Prayer", abbrev="Bounds",
        about="Seven books on prayer by Edward McKendree Bounds (1835–1913), a Methodist minister: Power Through Prayer, "
              "Purpose in Prayer, Prayer and Praying Men, The Reality of Prayer, The Essentials of Prayer, The Necessity "
              "of Prayer and The Weapon of Prayer, most of them edited from his papers by Homer W. Hodge after his death."),
    "sheldon": dict(
        url="https://www.ccel.org/ccel/sheldon/ihsteps.xml",
        sha256="f3202342cc40e304659f9e0ccb4b712c9d557efcae2dda636b2ab606bf95fcfb",
        skip=("Title Page",),
        cover=dict(title=[("IN", 40), ("HIS", 78), ("STEPS", 78)], author=[("CHARLES M. SHELDON", 34)],
                   rgb=(96, 62, 34), ornament="cross"),
        title="In His Steps", abbrev="In His Steps",
        about="Charles M. Sheldon's In His Steps (1896), the novel behind the question “What would Jesus do?”: the members "
              "of First Church in the town of Raymond pledge for a year to ask it before everything they do, and act on the answer."),
}
# Josephus's works by their CCEL titles, as the chapters are named.
WORKS = {"Life Of Flavius Josephus": "Life", "Antiquities of the Jews": "Antiquities", "The Wars of the Jews": "Wars",
         "Flavius Josephus Against Apion": "Against Apion",
         "An Extract Out Of Josephus's Discourse To The Greeks Concerning Hades": "Discourse on Hades"}
SMALL = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "upon"}
ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}


def roman(s):
    """An Arabic number for a Roman one ("xiv"), or the number itself ("14")."""
    s = s.strip().lower().rstrip(".")
    if s.isdigit():
        return int(s)
    n = 0
    for a, b in zip(s, s[1:] + " "):
        n += -ROMAN[a] if ROMAN.get(b, 0) > ROMAN[a] else ROMAN[a]
    return n


def title_case(s):
    """THE JEWISH WORLD IN THE DAYS OF CHRIST → The Jewish World in the Days of Christ (a heading in capitals)."""
    s = re.sub(r"\s+", " ", s).strip().rstrip(".").replace(" - ", " – ")
    letters = [c for c in re.sub(r"\([^)]*\)", "", s) if c.isalpha()]  # "(Continued)" aside
    if not letters or sum(c.isupper() for c in letters) < 0.8 * len(letters):
        return s  # not in capitals
    out, start = [], True
    for w in s.lower().split(" "):
        bare = w.strip("[('‘\"")
        if w.startswith("(continued"):
            out.append("(Continued" + w[10:])
        else:
            out.append(w if (not start and bare in SMALL) else re.sub(r"[a-z]", lambda m: m[0].upper(), w, count=1))
        start = w.endswith((".", ":", "–"))  # a new sentence starts with a capital
    return " ".join(out).replace("'S ", "'s ")


def ref_of(parsed):
    """e-Sword's form of a CCEL passage ("|John|16|13|0|0" → "Joh 16:13"), or None (the Apocrypha, a bad one)."""
    p = parsed.split(";")[0].strip("|").split("|")  # of several passages, the first
    if len(p) < 5 or p[0] not in OSIS or not all(x.isdigit() for x in p[1:5]):
        return None
    b = ABBR[OSIS.index(p[0])]
    c1, v1, c2, v2 = (int(x) for x in p[1:5])
    if not c1:
        return None
    if not v1:
        return f"{b} {c1}" + (f"-{c2}" if c2 and c2 != c1 else "")
    if not c2 or (c2 == c1 and not v2):
        return f"{b} {c1}:{v1}"
    return f"{b} {c1}:{v1}-{v2}" if c2 == c1 else f"{b} {c1}:{v1}-{c2}:{v2}"


class Chapter:
    """One chapter's HTML, its notes collected for the end."""

    def __init__(self, book):
        self.book, self.notes, self.out = book, [], []

    def text(self, t):
        return escape(re.sub(r"\s+", " ", t or ""))

    def inline(self, el):
        """el's content as inline HTML (its tail not included)."""
        s = self.text(el.text)
        for k in el:
            s += self.node(k) + self.text(k.tail)
        return s

    def node(self, el):
        tag = el.tag
        if tag == "scripRef":
            text = self.inline(el)
            v = ref_of(el.get("parsed", ""))
            return f'<ref v="{escape(v)}">{text}</ref>' if v else text
        if tag == "note":
            self.notes.append(self.inline(el).strip())
            return f"<sup>{len(self.notes)}</sup>"
        if tag in ("i", "b", "sup", "sub"):
            return f"<{tag}>{self.inline(el)}</{tag}>"
        if tag == "br":
            return " "
        if tag == "l":  # a line of verse
            return f"{self.inline(el).strip()}<br>"
        if tag == "span":
            if el.get("class") == "Greek" or el.get("lang") == "EL":
                return f"<grk>{self.inline(el)}</grk>"
            if el.get("lang") in ("HE", "he"):
                return f"<heb>{self.inline(el)}</heb>"
            return self.inline(el)
        if tag == "img":
            return self.image(el.get("src", ""))
        if tag in ("pb", "insertIndex"):
            return ""
        if tag == "p":  # a paragraph inside a note
            return f" {self.inline(el).strip()} "
        return self.inline(el)  # a, and anything else: its words

    def image(self, src):
        url = urllib.parse.urljoin("https://www.ccel.org/", src)
        p = fetch(url, CACHE / self.book / Path(src).name)
        return f'<img src="data:image/png;base64,{base64.b64encode(straightened(p)).decode()}">'

    def block(self, el):
        """A block element's paragraphs, into out."""
        tag = el.tag
        if tag == "p":
            s = self.inline(el).strip()
            if s:
                self.out.append(f"<p>{s}</p>")
        elif re.fullmatch(r"h[1-6]", tag):
            s = self.inline(el).strip()
            if s:
                self.out.append(f"<p><b>{s}</b></p>")
        elif tag == "verse":
            s = self.inline(el).strip()
            if s.endswith("<br>"):
                s = s[:-4]
            if s:
                self.out.append(f"<p>{s}</p>")
        elif tag == "li":
            s = self.inline(el).strip()
            if s:
                self.out.append(f"<p>• {s}</p>")
        elif tag in ("pb", "insertIndex"):
            pass
        elif re.fullmatch(r"div\d", tag):
            return  # a sub-chapter is its own chapter
        else:
            for k in el:
                self.block(k)

    def html(self, el):
        for k in el:
            self.block(k)
        if self.notes:
            self.out.append("<p><b>Notes</b></p>")
            self.out += [f"<p><sup>{n}</sup> {t}</p>" for n, t in enumerate(self.notes, 1)]
        return "".join(self.out)


def words(el):
    """el's text without its notes."""
    s = el.text or ""
    for k in el:
        if k.tag != "note":
            s += words(k)
        s += k.tail or ""
    return s


def straightened(path):
    """A scanned figure as a PNG, turned level and trimmed: the scans are a degree or two askew. The angle
    is the one, within 4°, at which the rows of ink are most sharply divided (the lines of text and the
    trees' rules lie flat), found in steps of 0.05°."""
    import io
    import numpy as np
    from PIL import Image, ImageOps
    im = Image.open(path).convert("L")
    ink = Image.fromarray(((np.asarray(im) < 128) * 255).astype(np.uint8))
    def sharpness(d):
        rows = np.asarray(ink.rotate(d, resample=Image.BILINEAR, expand=True, fillcolor=0), dtype=np.float32).sum(1)
        return float(((rows[1:] - rows[:-1]) ** 2).sum())
    d = max(np.arange(-4, 4.001, 0.05), key=sharpness)
    im = im.rotate(float(d), resample=Image.BICUBIC, expand=True, fillcolor=255)
    box = ImageOps.invert(im).point(lambda v: 255 if v > 60 else 0).getbbox()
    if box:
        im = im.crop((max(0, box[0] - 8), max(0, box[1] - 8), min(im.width, box[2] + 8), min(im.height, box[3] + 8)))
    out = io.BytesIO()
    im.save(out, "PNG", optimize=True)
    return out.getvalue()


def heading(div):
    """The words of a div's first heading, the chapter number dropped ("CHAPTER 1. THE CONSTITUTION…" → "THE CONSTITUTION…")."""
    h = next((e for e in div if re.fullmatch(r"h[1-6]", e.tag)), None)
    t = re.sub(r"\s+", " ", words(h)).strip() if h is not None else ""
    t = re.sub(r"^(CHAPTER|Chapter)\s+[\dIVXLCivxlc]+\.?\s*", "", t)
    # A heading in capitals with a note run into it, not marked as one (Antiquities 19.1, "HOW CAIUS In this
    # and the three next chapters … WAS SLAIN BY CHEREA."): the capitals before the note and after it.
    w = t.split(" ")
    cap = [bool(re.search(r"[A-Z]", x)) and not re.search(r"[a-z]", x) for x in w]
    if len(w) > 2 and cap[0] and cap[1] and not all(cap):
        first = cap.index(False)
        last = len(w) - next((i for i, c in enumerate(reversed(cap)) if not c), len(w))
        return " ".join(w[:first] + w[last:])
    return t


def short(s, most=80):
    """A chapter's title kept to a line: cut at a word, with an ellipsis."""
    s = s.rstrip(" ,;:")
    if len(s) <= most:
        return s
    return s[:most].rsplit(" ", 1)[0].rstrip(" ,;:–") + "…"


def chapters_josephus(body):
    for d1 in body.iter("div1"):
        work = WORKS.get(d1.get("title", "").strip())
        if not work:
            continue  # the indexes
        d2s = d1.findall("div2")
        if not d2s:
            yield work, d1
            continue
        for d2 in d2s:
            t = d2.get("title", "")
            m = re.search(r"Book\s+([IVXLC\d]+)\s*$", t, re.I) or re.search(r"\bBOOK\s+([IVXLC\d]+)\s*$", heading(d2))
            if not m:
                yield f"{work}, {title_case(t.split('-')[-1])}", d2  # the Preface
                continue
            n = roman(m[1])
            d3s = d2.findall("div3")
            if not d3s:
                yield f"{work} {n}", d2
            for d3 in d3s:
                c = roman(re.search(r"([\dIVXLC]+)\.?\s*$", d3.get("title", "").strip())[1])
                h = short(title_case(heading(d3)))
                yield (f"{work} {n}.{c}: {h}" if h else f"{work} {n}.{c}"), d3


def chapters_edersheim(body):
    book = 0
    for d1 in body.iter("div1"):
        t = d1.get("title", "").strip()
        if t.upper().startswith("INDEX") or t in ("Indexes", "Title Page"):
            continue
        d2s = d1.findall("div2")
        if not d2s:
            yield title_case(t), d1
            continue
        appendix = t.upper().startswith("APPENDI")
        if not appendix:
            book += 1
        for i, d2 in enumerate(d2s, 1):
            h = short(title_case(re.sub(r"^(CHAPTER|APPENDIX)\s+[\dIVXLC]+\.?\s*", "", d2.get("title", "").strip(), flags=re.I)))
            yield (f"Appendix {i}: {h}" if appendix else f"Book {book}, Chapter {i}: {h}"), d2


def chapters_pilgrim(body):
    for d1 in body.iter("div1"):
        t = d1.get("title", "").strip()
        if t in ("Title Page", "CONTENTS", "Indexes"):
            continue
        part = re.match(r"PART\s+([IV]+)$", t)
        if not part:
            yield title_case(t), d1
            continue
        for d2 in d1.findall("div2"):
            yield f"Part {roman(part[1])}: {title_case(d2.get('title', ''))}", d2


def own_text(div):
    """Whether a div has paragraphs of its own, besides its heading and its sub-chapters."""
    return any(k.tag in ("p", "verse") and "".join(k.itertext()).strip() for k in div)


def label(div):
    """A div's name: CCEL's title for it ("II. PRAYER AND FAITH (Continued)"), or its heading where the title
    is only a number ("Section i", "Chapter I")."""
    t = div.get("title", "").strip().replace("FOREWARD", "FOREWORD")
    if not t or re.fullmatch(r"(?:Chapter|Section|Book)\s+[\dIVXLC]+", t, re.I):
        return heading(div) or t
    return t


def chapters_plain(body, skip, book=""):
    """A chapter for each div1, or for each of its div2s (and the div1 itself if it has text of its own),
    titled from their headings: "Conversations: First Conversation", or with `book` first,
    "Power Through Prayer 1: Men of Prayer Needed"."""
    n = 0
    for d1 in body.iter("div1"):
        t = d1.get("title", "").strip()
        if t in skip or t.upper().startswith(("INDEX", "CONTENTS")):
            continue
        h1 = title_case(re.sub(r"^[\dIVXLC]+\.?\s+(?=\S)", "", label(d1)))
        d2s = [d for d in d1.findall("div2") if not d.get("title", "").startswith("Index")]
        chapter = re.match(r"(?:CHAPTER\s+)?([\dIVXLC]+)\b\.?", heading(d1) or t, re.I)
        if not d2s or own_text(d1):
            if book and chapter and not re.search(r"\b(foreword|forward|introduction)\b", h1, re.I):
                n += 1
                name = f"{book} {n}" if re.fullmatch(r"(?:Chapter )?[\dIVXLC]+", h1, re.I) else f"{book} {n}: {h1}"
            else:
                name = f"{book}: {h1}" if book else h1
            yield short(name), d1
        for d2 in d2s:
            yield short(f"{h1}: {title_case(label(d2))}"), d2


def build(name, into=None):
    b = BOOKS[name]
    if "parts" in b:
        bodies = [(fetch(f"https://www.ccel.org/ccel/{name}/{part}.xml", CACHE / f"{name}_{part}.xml", sha256=sha), book)
                  for part, sha, book in b["parts"]]
    else:
        bodies = [(fetch(b["url"], CACHE / f"{name}.xml" if name in ("josephus", "edersheim", "pilgrim") else CACHE / f"{name}_{b['url'].rsplit('/', 1)[1][:-4]}.xml", sha256=b["sha256"]), "")]
    rows, refs = [], 0
    chapters = []
    for src, book in bodies:
        body = ET.parse(src).getroot().find("ThML.body")
        if name in ("josephus", "edersheim", "pilgrim"):
            chapters += list({"josephus": chapters_josephus, "edersheim": chapters_edersheim, "pilgrim": chapters_pilgrim}[name](body))
        else:
            chapters += list(chapters_plain(body, b.get("skip", ()), book))
    for title, div in chapters:
        c = Chapter(name)
        html = c.html(div)
        if not html:
            continue
        refs += html.count("<ref ")
        rows.append((title, html))
    seen = {}
    for i, (t, h) in enumerate(rows):  # the app finds a chapter by its title, so each must be unique
        seen[t] = seen.get(t, 0) + 1
        if seen[t] > 1:
            rows[i] = (f"{t} ({seen[t]})", h)
    front, thumb = covers.html(covers.design(**b["cover"]))  # a cover drawn for it (tools/covers)
    rows[0] = (rows[0][0], front + rows[0][1])
    info = (f"{thumb}<p>{escape(b['about'])}</p><p>From the Christian Classics Ethereal Library's edition (ccel.org), "
            f"public domain. {len(rows)} chapters; {refs} Bible reference{'s' * (refs != 1)}, each linked. "
            "Built by Two-edged Sword's tools/ccel.</p>")
    with module(f"{name}.refi", b["title"], b["abbrev"], info, into=into) as db:
        db.executemany("INSERT INTO Reference VALUES (?,?)", rows)
    print(f"{name}.refi: {len(rows)} chapters, {refs} references linked")


def main(into=None, names=None):
    """Writes the books named (both, by default) to the app's modules folder, or to `into`."""
    names = names or sys.argv[1:] or list(BOOKS)
    for n in names:
        if n not in BOOKS:
            sys.exit(f"unknown book {n}; one of {', '.join(BOOKS)}")
        build(n, into)


if __name__ == "__main__":
    main()
