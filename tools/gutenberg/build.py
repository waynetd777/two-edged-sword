# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds reference books from Project Gutenberg's HTML editions of public-domain works:

  foxe.refi   Fox's Book of Martyrs, edited by William Byron Forbush (1926; Gutenberg #22400)

    python3 tools/gutenberg/build.py [foxe]

The book is cut from Gutenberg's page between its header and footer, which aren't part of the work. Each
<h2> chapter heading starts a chapter in the app, titled with the <h3> under it ("Chapter 1: History of
Christian Martyrs to the First General Persecution Under Nero"); chapters are numbered in order, as the
printed headings repeat one ("CHAPTER XII." twice). The front matter before the first chapter and the
contents are left out, as are the printed page numbers. The text marks no Bible references, so none are
linked.

The file is taken as it was when this was written, checked against its sha256: Gutenberg's files have no
versions, so a changed one stops the build until it's looked at. Downloads are cached in
~/Library/Caches/Two-edged Sword/gutenberg. Writes to the app's modules folder, or to `into`.
"""
import re, sys
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import CACHES, fetch, module  # noqa: E402
from ccel.build import short, title_case  # noqa: E402

CACHE = CACHES / "gutenberg"
BOOKS = {
    "foxe": dict(
        url="https://www.gutenberg.org/cache/epub/22400/pg22400-images.html",
        sha256="2d6d9403042e3c9db9a9fc89d505e0e551190c1e8f2b376a8fadbf98b74ff5a4",
        title="Fox's Book of Martyrs", abbrev="Foxe",
        about="John Foxe's history of the Christian martyrs, from Stephen to the persecutions of the Protestants, "
              "in William Byron Forbush's edition (1926), which carries the story on to the Quakers, John Bunyan and "
              "the missions of the nineteenth century."),
}
KEEP = {"i": "i", "em": "i", "b": "b", "strong": "b", "sup": "sup", "sub": "sub"}


class Text(HTMLParser):
    """A chapter's paragraphs as the app's HTML: <p>, with italics, bold and line breaks; the page numbers
    (span.pagenum), links' targets and everything else's tags dropped, their words kept."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.cur, self.skip = [], None, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.skip or (tag == "span" and "pagenum" in (a.get("class") or "")):
            self.skip += tag == "span"
            return
        if tag in ("p", "blockquote", "h4", "h5", "h6", "div") and self.cur is None:
            self.cur = []
        if self.cur is not None:
            if tag in KEEP:
                self.cur.append(f"<{KEEP[tag]}>")
            elif tag == "br":
                self.cur.append("<br>")

    def handle_endtag(self, tag):
        if self.skip:
            self.skip -= tag == "span"
            return
        if self.cur is None:
            return
        if tag in KEEP:
            self.cur.append(f"</{KEEP[tag]}>")
        elif tag in ("p", "blockquote", "h4", "h5", "h6", "div"):
            s = re.sub(r"\s+", " ", "".join(self.cur)).strip()
            s = re.sub(r"^(<br>\s*)+|(\s*<br>)+$", "", s)
            if re.sub(r"<[^>]+>", "", s).strip():
                self.out.append(f"<p><b>{s}</b></p>" if tag.startswith("h") else f"<p>{s}</p>")
            self.cur = None

    def handle_data(self, data):
        if not self.skip and self.cur is not None:
            self.cur.append(escape(data))


def plain(h):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def chapters(html):
    """(title, html) for each chapter: an <h2> "CHAPTER …" with the <h3> under it naming it."""
    start = html.find('id="pg-header"')
    end = html.find('id="pg-footer"')
    head_end = html.find("</header>", start) if start >= 0 else -1
    body = html[head_end if head_end >= 0 else 0:end if end >= 0 else None]
    parts = re.split(r"(<h2[^>]*>.*?</h2>)", body, flags=re.S)
    n = 0
    for head, text in zip(parts[1::2], parts[2::2]):
        if not re.match(r"CHAPTER\b", plain(head), re.I):
            continue  # the title page, the preface's and the contents' headings
        n += 1
        m = re.search(r"<h3[^>]*>(.*?)</h3>", text, re.S)
        name = short(title_case(plain(m[1]))) if m else ""
        if m:
            text = text[:m.start()] + text[m.end():]
        p = Text()
        p.feed(text)
        p.close()
        heading = f"<p><b>CHAPTER {n}. {escape(plain(m[1]) if m else '')}</b></p>"
        yield (f"Chapter {n}: {name}" if name else f"Chapter {n}"), heading + "".join(p.out)


def build(name, into=None):
    b = BOOKS[name]
    src = fetch(b["url"], CACHE / f"{name}.html", sha256=b["sha256"])
    rows = list(chapters(src.read_text(encoding="utf-8")))
    info = (f"<p>{escape(b['about'])}</p><p>From Project Gutenberg's edition (gutenberg.org), public domain. "
            f"{len(rows)} chapters. Built by Two-edged Sword's tools/gutenberg.</p>")
    with module(f"{name}.refi", b["title"], b["abbrev"], info, into=into) as db:
        db.executemany("INSERT INTO Reference VALUES (?,?)", rows)
    print(f"{name}.refi: {len(rows)} chapters")


def main(into=None, names=None):
    """Writes the books named (all, by default) to the app's modules folder, or to `into`."""
    names = names or sys.argv[1:] or list(BOOKS)
    for n in names:
        if n not in BOOKS:
            sys.exit(f"unknown book {n}; one of {', '.join(BOOKS)}")
        build(n, into)


if __name__ == "__main__":
    main()
