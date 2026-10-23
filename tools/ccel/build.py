# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds reference books from the Christian Classics Ethereal Library's ThML editions (ccel.org), each
marked there "Public Domain":

  josephus.refi   The Works of Flavius Josephus, William Whiston's translation (1737): his Life, the
                  Antiquities of the Jews, the Wars of the Jews, Against Apion and the Discourse on Hades
  edersheim.refi  Alfred Edersheim, The Life and Times of Jesus the Messiah (1883)

    python3 tools/ccel/build.py [josephus edersheim]

A chapter of the book is a chapter in the app, titled from the book's own headings ("Antiquities 1.1: The
Constitution of the World…"). CCEL marks each Bible reference with the passage it means (scripRef's
parsed="|John|16|13|0|0"), so each becomes a <ref> the app opens, its v giving the passage in e-Sword's
abbreviations while the text stays as printed ("John xvi. 13"); a reference to the Apocrypha stays text.
Footnotes are numbered in the text and listed under the chapter. Greek is marked as Greek. Edersheim's
figures (plans of the Temple and the like) are fetched and kept in the chapter. The indexes, which give
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

CACHE = CACHES / "ccel"
BOOKS = {
    "josephus": dict(
        url="https://www.ccel.org/ccel/josephus/complete.xml",
        sha256="b7cff7c4a88f7a9b0daf293696f38a66964d81d0e87802a18be0f3a50f1548a3",
        title="The Works of Flavius Josephus", abbrev="Josephus",
        about="The works of Flavius Josephus (37–c. 100), the Jewish historian, in William Whiston's translation (1737): "
              "his Life, the Antiquities of the Jews, the Wars of the Jews, Against Apion and the Discourse to the Greeks "
              "concerning Hades, with Whiston's notes."),
    "edersheim": dict(
        url="https://www.ccel.org/ccel/edersheim/lifetimes.xml",
        sha256="aa20f33d57f0f1d780886840c2d1ac523bb7004e9ff7f7f23a536c5c56150334",
        title="The Life and Times of Jesus the Messiah", abbrev="Edersheim",
        about="Alfred Edersheim's The Life and Times of Jesus the Messiah (1883; third edition, 1886): the Gospel story "
              "told against the Jewish life, worship and teaching of its time, with the author's notes and appendices."),
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
    letters = [c for c in s if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) < 0.8 * len(letters):
        return s  # not in capitals
    out, start = [], True
    for w in s.lower().split(" "):
        bare = w.strip("[('‘\"")
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
        kind = "jpeg" if p.suffix.lower() in (".jpg", ".jpeg") else p.suffix.lower().lstrip(".")
        return f'<img src="data:image/{kind};base64,{base64.b64encode(p.read_bytes()).decode()}">'

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


def short(s, most=70):
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


def build(name, into=None):
    b = BOOKS[name]
    src = fetch(b["url"], CACHE / f"{name}.xml", sha256=b["sha256"])
    body = ET.parse(src).getroot().find("ThML.body")
    rows, refs = [], 0
    for title, div in (chapters_josephus if name == "josephus" else chapters_edersheim)(body):
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
    info = (f"<p>{escape(b['about'])}</p><p>From the Christian Classics Ethereal Library's edition (ccel.org), "
            f"public domain. {len(rows)} chapters; {refs} Bible references, each linked. "
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
