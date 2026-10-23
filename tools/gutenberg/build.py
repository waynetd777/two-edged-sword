# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds reference books from Project Gutenberg's HTML editions of public-domain works:

  foxe.refi             Fox's Book of Martyrs, edited by William Byron Forbush (1926; Gutenberg #22400)
  strong_theology.refi  Augustus H. Strong, Systematic Theology (revised edition, 1907–1909), its three volumes
                        in one (Gutenberg #44035, #44555, #45283)

    python3 tools/gutenberg/build.py [foxe strong_theology]

A book is cut from Gutenberg's page between its header and footer, which aren't part of the work. In Foxe
each <h2> chapter heading starts a chapter in the app, titled with the <h3> under it ("Chapter 1: History of
Christian Martyrs to the First General Persecution Under Nero"); chapters are numbered in order, as the
printed headings repeat one ("CHAPTER XII." twice). The front matter before the first chapter and the
contents are left out, as are the printed page numbers. Foxe's text marks no Bible references, so none are
linked.

Strong's pages are made from TEI. A chapter in the app is a division of one of his chapters ("Prolegomena
1.3: Possibility of Theology", Part I, chapter I, its third division) or of a chapter's section ("Soteriology
2.2.4: Justification"), or the opening of a part, chapter or section where it has text of its own. His small
print, the notes and quotations under each statement, is indented. His Bible references ("Rom. 5:12, 18;
6:23") are linked where each is a real verse in the KJV, and Greek and Hebrew are marked as such. The
contents, the indexes and the transcribers' notes are left out.

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
import covers  # noqa: E402
from ccel.build import SMALL, roman, short, title_case  # noqa: E402

CACHE = CACHES / "gutenberg"
BOOKS = {
    "foxe": dict(
        url="https://www.gutenberg.org/cache/epub/22400/pg22400-images.html",
        sha256="2d6d9403042e3c9db9a9fc89d505e0e551190c1e8f2b376a8fadbf98b74ff5a4",
        cover=dict(title=[("FOX’S", 60), ("BOOK OF", 60), ("MARTYRS", 78)], author=[("EDITED BY", 22), ("WILLIAM BYRON FORBUSH", 27)],
                   rgb=(34, 32, 36), ornament="cross"),
        title="Fox's Book of Martyrs", abbrev="Foxe",
        about="John Foxe's history of the Christian martyrs, from Stephen to the persecutions of the Protestants, "
              "in William Byron Forbush's edition (1926), which carries the story on to the Quakers, John Bunyan and "
              "the missions of the nineteenth century."),
    "strong_theology": dict(
        parts=[  # the three volumes: (url, sha256)
            ("https://www.gutenberg.org/cache/epub/44035/pg44035-images.html", "23342053eed80c91f35582f1576c0496af1792a7cc9ef7ced514005b007e465c"),
            ("https://www.gutenberg.org/cache/epub/44555/pg44555-images.html", "248f5027938c64e1c6a5a73abd187a0a824b2ebb2928231741a3fa83cdd33011"),
            ("https://www.gutenberg.org/cache/epub/45283/pg45283-images.html", "4a512d54af499e298164758f38aee976901bbe97844453ccb024fa30e56d419e"),
        ],
        chapters="strong",
        cover=dict(title=[("SYSTEMATIC", 62), ("THEOLOGY", 78)], author=[("AUGUSTUS HOPKINS", 30), ("STRONG", 44)],
                   rgb=(74, 50, 34), ornament="cross"),
        title="Systematic Theology", abbrev="Strong",
        about="Augustus Hopkins Strong's Systematic Theology (revised and enlarged edition, 1907–1909), its three "
              "volumes in one: The Doctrine of God, The Doctrine of Man and The Doctrine of Salvation. Strong "
              "(1836–1921), a Baptist, was president of the Rochester Theological Seminary; each doctrine is stated, "
              "proved from Scripture and defended, with his notes and quotations from the theologians in small print."),
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


# ---- Strong's Systematic Theology: Gutenberg's pages made from TEI --------------------------------------------

class Tei(HTMLParser):
    """A page made from TEI as a list of blocks: ("h", level, html) for a heading, ("p", html, indent) for a
    paragraph (indent 1 in a quotation block: Strong's small print), ("table", html). Italic and bold come
    from the spans' styles; the page numbers (span.tei-pb) are dropped; the lines of a group (div.tei-lg)
    are one paragraph, a line to each; Greek and Hebrew are marked <grk> and <heb>."""
    VOID = {"br", "img", "hr", "meta", "link", "col", "input"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.stack, self.cur, self.kind, self.skip, self.quote = [], [], None, None, 0, 0
        self.table, self.gap, self.level = None, False, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        c, style = a.get("class") or "", a.get("style") or ""
        if tag in self.VOID:
            if tag == "br" and self.cur is not None:
                self.cur.append("<br>" if self.kind == "lg" else " ")
            return
        if self.skip:
            self.skip += 1
            self.stack.append((tag, "", None))
            return
        if tag == "span" and "tei-pb" in c:
            self.skip = 1
            self.stack.append((tag, "", None))
            return
        close, block = "", None
        if re.fullmatch(r"h[1-6]", tag) and "tei-head" in c and self.cur is None:
            block = ("h", int(tag[1]))
        elif tag == "div" and "tei-lg" in c and self.cur is None:
            block = ("lg", None)
        elif tag == "div" and "tei-l" in c.split() and self.kind == "lg":
            if self.cur and self.cur[-1] != "<br>":
                self.cur.append("<br>")
        elif tag in ("p", "li") and self.cur is None and self.table is None:
            block = ("p", "• " if tag == "li" else "")
        elif tag == "div" and "tei-quote" in c:
            self.quote += 1
            close = "quote"
        elif tag == "table":
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.table.append([])
        elif tag in ("td", "th") and self.table is not None:
            self.cur, self.kind = [], "td"
            block = ("td", None)
        if block:
            if block[0] != "td":
                self.cur, self.kind = [block[1]] if block[0] == "p" and block[1] else [], block[0]
                self.level = block[1]
            self.stack.append((tag, "", "block"))
            return
        if self.cur is not None:
            if "italic" in style or tag in ("i", "cite"):
                self.cur.append("<i>")
                close += "</i>"
            if "font-weight: bold" in style or tag in ("b", "strong"):
                self.cur.append("<b>")
                close = "</b>" + close
            if tag in ("sup", "sub"):
                self.cur.append(f"<{tag}>")
                close = f"</{tag}>"
        # a quotation or an emphasis with a word run on to it: the space after it is lost in Gutenberg's page
        self.stack.append((tag, close, "gap" if re.search(r"\btei-(q|hi|emph)\b", c) else None))

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        while self.stack:
            t, close, mark = self.stack.pop()
            if self.skip:
                self.skip -= 1
            elif mark == "block":
                self.end_block()
            elif close == "quote":
                self.quote -= 1
            elif close and self.cur is not None:
                self.cur.append(close)
            self.gap = self.gap or mark == "gap"
            if t == "table" and self.table is not None:
                rows = "".join("<tr>" + "".join(f"<td>{x}</td>" for x in r) + "</tr>" for r in self.table if any(r))
                if rows:
                    self.blocks.append(("table", f"<table>{rows}</table>"))
                self.table = None
            if t == tag:
                break

    def end_block(self):
        s = re.sub(r"\s+", " ", "".join(self.cur)).strip()
        s = re.sub(r"^(<br>\s*)+|(\s*<br>)+$", "", s)
        s = re.sub(r"<(i|b)>(\s*)</\1>", r"\2", s)
        s = re.sub(r"<(i|b)>\s+", r" <\1>", s)
        s = re.sub(r"\s+</(i|b)>", r"</\1> ", s)
        s = re.sub(r"</(i|b)>(\s*)<\1>", r"\2", s)
        s = re.sub(r"\s*<br>\s*", "<br>", re.sub(r"\s+", " ", s).strip())
        kind, self.cur, self.kind = self.kind, None, None
        if not re.sub(r"<[^>]+>", "", s).strip():
            if kind == "td" and self.table:
                self.table[-1].append("")
            return
        if kind == "h":
            self.blocks.append(("h", self.level, s))
        elif kind == "td":
            if self.table:
                self.table[-1].append(s)
        else:
            self.blocks.append(("p", s, 1 if self.quote else 0))

    def handle_data(self, data):
        if not self.skip and self.cur is not None:
            if self.gap and re.match(r"[\w“(]", data):
                data = " " + data
            self.gap = False
            self.cur.append(scripts(escape(data, quote=False)))


def scripts(s):
    """Greek and Hebrew in `s` marked <grk> and <heb>: each run of words in the script, with the spaces between."""
    g, h = "\u0370-\u03ff\u1f00-\u1fff", "\u0590-\u05ff"
    s = re.sub(f"[{g}](?:[{g}\u0300-\u036f\\s,]*[{g}\u0300-\u036f])?", lambda m: f"<grk>{m[0]}</grk>", s)
    return re.sub(f"[{h}](?:[{h}\\s]*[{h}])?", lambda m: f"<heb>{m[0]}</heb>", s)


# The parts of Strong's work as the chapters are named.
STRONG_PARTS = {1: "Prolegomena", 2: "Existence of God", 3: "Scriptures", 4: "God", 5: "Anthropology", 6: "Soteriology",
                7: "Ecclesiology", 8: "Eschatology"}


def heading_case(s):
    """Gutenberg's headings, every word capitalised ("The Works Of God; Or The Execution Of The Decrees."), with
    the small words in lower case and the stop at the end dropped."""
    s = re.sub(r"\s+", " ", s.replace("(Continued)", "")).strip().rstrip(".")
    w = s.split(" ")
    return " ".join(x.lower() if i and x.lower() in SMALL and not w[i - 1].endswith((":", "—", ".")) else x for i, x in enumerate(w))


def chapters_strong(pages):
    """(title, html) for each chapter of Strong's three volumes (`pages`, each page's HTML): a chapter for each
    division of his chapters (the headings under "Chapter IV."), or of their sections ("Section II.—…") where
    they have them, or in Part VIII, which has no chapters, for each of its divisions. The opening of a part,
    chapter or section is a chapter where it has text of its own; its headings otherwise go before the chapter
    that follows them."""
    rows = []
    part = chapter = section = None
    title, out = None, []

    def flush():
        nonlocal out
        if title and any(not x.startswith("<p><b>") for x in out):
            rows.append((title, "".join(out)))
            out = []
    for html in pages:
        p = Tei()
        p.feed(html[html.find("</header>"):html.find('id="pg-footer"')])
        p.close()
        blocks = p.blocks
        start = next(i for i, b in enumerate(blocks) if b[0] == "h" and b[1] == 1 and plain(b[2]) == "Contents")
        start = next(i for i, b in enumerate(blocks) if i > start and b[0] == "h" and b[1] == 1)
        for b in blocks[start:]:
            if b[0] == "h":
                level, text = b[1], plain(b[2])
                if level == 1 and text.startswith("Indexes"):
                    break
                m = re.match(r"(?:Part ([IVX]+)|Chapter ([IVX]+)|Section ([IVX]+)|([IVX]+))\.(?:—)?\s*(.*)", text)
                name = heading_case(m[5]) if m else heading_case(text)
                split = None
                if level == 1:
                    part, chapter, section = (roman(m[1]) if m and m[1] else None), None, None
                    split = STRONG_PARTS[part] if part else name
                elif level == 2 and m and m[2]:
                    chapter, section = roman(m[2]), None
                    split = f"{STRONG_PARTS[part]} {chapter}: {name}"
                elif level == 2 and m and m[4] and part == 8:
                    split = f"{STRONG_PARTS[part]} {roman(m[4])}: {name}"
                elif level == 3 and chapter and m and (m[3] or m[4]):
                    section = roman(m[3]) if m[3] else None
                    split = f"{STRONG_PARTS[part]} {chapter}.{roman(m[3] or m[4])}: {name}"
                elif level == 4 and section and m and m[4]:  # a division of one of his sections
                    split = f"{STRONG_PARTS[part]} {chapter}.{section}.{roman(m[4])}: {name}"
                if split:
                    flush()
                    title = short(split)
                out.append(f"<p><b>{linked(b[2] if '<' in b[2] else heading_case(b[2]))}</b></p>")
            elif b[0] == "p":
                if plain(b[1]).startswith("[Transcriber"):
                    continue
                out.append(f'<p class="indent1">{linked(b[1])}</p>' if b[2] else f"<p>{linked(b[1])}</p>")
            else:
                out.append(linked(b[1]))
        flush()
        if out:  # headings with nothing under them, at a volume's end
            rows[-1] = (rows[-1][0], rows[-1][1] + "".join(out))
            out = []
    return rows


# Bible references as Strong writes them: "Gen. 1:1", "1 Cor. 15:22-28", "Rom. 5:12, 18; 6:23", "Is. 53:5". The book
# is a book's name, or the start of one (not a month's, "Jan. 1885:48", nor a journal's), checked against the KJV.
REF = re.compile(r"\b((?:[1-3] ?)?[A-Z][a-z]{1,13})(\.?) ?(\d{1,3}):(\d{1,3})(?:([-–])(\d{1,3})(?::(\d{1,3}))?)?(?![\d:])")
MORE = re.compile(r"([,;] ?)(?:(\d{1,3}):)?(\d{1,3})(?:[-–](\d{1,3}))?(?![\d:]| ?[A-Z])")
BARE = re.compile(r"(?:(\d{1,3}):)?(\d{1,3})(?:[-–](\d{1,3}))?—")
ALIASES = {"cant": 22, "zach": 38, "canticles": 22, "jas": 59, "phil": 50, "ez": 26, "psalm": 19, "matt": 40, "apoc": 66}


def book_of(name):
    """The book (1–66) a name or abbreviation is ("Is" Isaiah, "1 Cor" 1 Corinthians), or None."""
    from books import NAMES
    k = re.sub(r"\s", "", name).lower()
    if k in ALIASES:
        return ALIASES[k]
    found = [i + 1 for i, n in enumerate(NAMES) if re.sub(r"\s", "", n).lower().startswith(k)]
    return found[0] if len(k) >= 2 and len(found) == 1 else None


def linked(s):
    """Strong's references in `s` (outside tags) as <ref>s, the text kept as printed and v giving the passage. A
    chapter and verse alone in italics, as he cites a further passage of the book cited before it ("<i>John 1:14—</i>
    …; <i>18—</i> …; <i>3:16—</i>"), is in that book (and chapter)."""
    from books import ABBR
    from core.build import real
    last = [None, None]

    def ref(b, c, v, end=None):
        last[:] = b, c
        return f"{ABBR[b - 1]} {c}:{v}" + ((f"-{end[2]}" if end[1] == c else f"-{end[1]}:{end[2]}") if end else "")

    def one(m):
        b = book_of(m[1])
        if not b:
            return m[0]
        c, v = int(m[3]), int(m[4])
        end = (b, int(m[6]), int(m[7])) if m[7] else (b, c, int(m[6])) if m[6] else None
        if not real((b, c, v), end):
            return m[0]
        out, rest = f'<ref v="{ref(b, c, v, end)}">{m[0]}</ref>', m.string[m.end():]
        # the verses and chapters after it in the same book: ", 18", "; 6:23", ", 7:1-4"
        while (n := MORE.match(rest)) and (n[2] or n[1][0] == ","):  # after a semicolon, only a chapter and verse
            c2, v2, e2 = int(n[2]) if n[2] else c, int(n[3]), int(n[4]) if n[4] else None
            if not real((b, c2, v2), (b, c2, e2) if e2 else None):
                break
            c = c2
            out += f'{n[1]}<ref v="{ref(b, c, v2, (b, c, e2) if e2 else None)}">{n[0][len(n[1]):]}</ref>'
            rest = rest[n.end():]
        return out, len(m.string) - len(rest)

    def text(t):
        out, i = [], 0
        while (m := REF.search(t, i)):
            r = one(m)
            if isinstance(r, str):
                out.append(t[i:m.end()])
                i = m.end()
            else:
                out.append(t[i:m.start()] + r[0])
                i = r[1]
        return "".join(out) + t[i:]

    def bare(t):
        m = BARE.fullmatch(t)
        if not m or not last[0] or not (m[1] or last[1]):
            return None
        b, c, v = last[0], int(m[1]) if m[1] else last[1], int(m[2])
        end = (b, c, int(m[3])) if m[3] else None
        return f'<ref v="{ref(b, c, v, end)}">{m[0].rstrip("—")}</ref>' + "—" * m[0].endswith("—") if real((b, c, v), end) else None
    parts = re.split(r"(<[^>]+>)", s)
    for k, x in enumerate(parts):
        if not x.startswith("<"):
            parts[k] = (k and parts[k - 1] == "<i>" and bare(x)) or text(x)
    return "".join(parts)


CHAPTERS = {"strong": chapters_strong}


def build(name, into=None):
    b = BOOKS[name]
    if "parts" in b:
        pages = [fetch(url, CACHE / f"{name}_{i}.html", sha256=sha).read_text(encoding="utf-8") for i, (url, sha) in enumerate(b["parts"], 1)]
        rows = CHAPTERS[b["chapters"]](pages)
    else:
        src = fetch(b["url"], CACHE / f"{name}.html", sha256=b["sha256"])
        rows = list(chapters(src.read_text(encoding="utf-8")))
    seen = {}
    for i, (t, h) in enumerate(rows):  # the app finds a chapter by its title, so each must be unique
        seen[t] = seen.get(t, 0) + 1
        if seen[t] > 1:
            rows[i] = (f"{t} ({seen[t]})", h)
    refs = sum(h.count("<ref ") for _, h in rows)
    front, thumb = covers.html(covers.design(**b["cover"]))  # a cover drawn for it (tools/covers)
    rows[0] = (rows[0][0], front + rows[0][1])
    info = (f"{thumb}<p>{escape(b['about'])}</p><p>From Project Gutenberg's edition (gutenberg.org), public domain. "
            f"{len(rows)} chapters" + (f"; {refs} Bible references, each linked" if refs else "") +
            ". Built by Two-edged Sword's tools/gutenberg.</p>")
    with module(f"{name}.refi", b["title"], b["abbrev"], info, into=into) as db:
        db.executemany("INSERT INTO Reference VALUES (?,?)", rows)
    print(f"{name}.refi: {len(rows)} chapters" + (f", {refs} references linked" if refs else ""))


def main(into=None, names=None):
    """Writes the books named (all, by default) to the app's modules folder, or to `into`."""
    names = names or sys.argv[1:] or list(BOOKS)
    for n in names:
        if n not in BOOKS:
            sys.exit(f"unknown book {n}; one of {', '.join(BOOKS)}")
        build(n, into)


if __name__ == "__main__":
    main()
