// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The small Markdown the journal is stored in, and the HTML the editor shows. Only what the
// journal toolbar can make round-trips: headings (###), bold, italic, quotes, bullet and
// numbered lists, and paragraphs. Verse references anywhere in the text become links.

import { findRefs } from "./refs";
import { escHtml as esc } from "./dom";
import { HL_COLOURS } from "./state";
export { findRefs } from "./refs";

/** Escaped text with verse references wrapped in links the page can catch. */
function linkRefs(text: string): string {
  let out = "",
    last = 0;
  for (const h of findRefs(text)) {
    out += esc(text.slice(last, h.index));
    out += `<a class="ref" data-ref="${esc(JSON.stringify(h.ref))}">${esc(text.slice(h.index, h.index + h.length))}</a>`;
    last = h.index + h.length;
  }
  return out + esc(text.slice(last));
}

// An escaped mark (\*), ***bold italic***, **bold**, *italic*, and _italic_ only at word edges, so
// my_notes_file stays as it is; and highlights: ==yellow== (the highlight syntax Markdown notes apps use) and
// <mark class="hl-green">the other colours</mark>; and <sup>superscript</sup> and <sub>subscript</sub>
// ("17<sup>th</sup>"), as Markdown notes apps show them.
const INLINE_RE = new RegExp(
  String.raw`\\[\\*_=]|<(sup|sub)>.+?<\/\1>|<mark class="hl-(?:${HL_COLOURS.join("|")})">.+?<\/mark>|==(?=\S)(?:\\.|[^\\])+?==|\*\*\*(?=\S)(?:\\.|[^\\])+?\*\*\*|\*\*(?=\S)(?:\\.|[^\\])+?\*\*|\*(?=[^\s*])(?:\\.|[^*\\])+\*|(?<![\p{L}\p{N}_\\])_(?=[^\s_])(?:\\.|[^_\\])+_(?![\p{L}\p{N}_])`,
  "gu",
);

function inline(s: string, links: boolean): string {
  // Split on the marks first, then escape and link the plain parts.
  const parts: string[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE_RE)) {
    parts.push(links ? linkRefs(s.slice(last, m.index)) : esc(s.slice(last, m.index)));
    const t = m[0];
    const n = t.startsWith("***") ? 3 : t.startsWith("**") ? 2 : 1;
    const mark = t.match(/^<mark class="hl-(\w+)">(.+)<\/mark>$/);
    const script = t.match(/^<(sup|sub)>(.+)<\/\1>$/);
    if (t[0] === "\\") parts.push(esc(t[1]));
    else if (script) parts.push(`<${script[1]}>${inline(script[2], links)}</${script[1]}>`);
    else if (mark) parts.push(`<mark class="hl-${mark[1]}">${inline(mark[2], links)}</mark>`);
    else if (t.startsWith("==")) parts.push(`<mark class="hl-yellow">${inline(t.slice(2, -2), links)}</mark>`);
    else {
      const body = inline(t.slice(n, -n), links);
      parts.push(n === 3 ? `<b><i>${body}</i></b>` : n === 2 ? `<b>${body}</b>` : `<i>${body}</i>`);
    }
    last = m.index! + t.length;
  }
  parts.push(links ? linkRefs(s.slice(last)) : esc(s.slice(last)));
  return parts.join("");
}

export function mdToHtml(md: string, links = true): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push(`<h3>${inline(h[2], links)}</h3>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      // A quote whose last line is "— John 3:8 KJV" is a verse inserted from the Bible.
      const cite = q.length > 1 && /^[—–-]\s/.test(q[q.length - 1]) ? q.pop()!.replace(/^[—–-]\s/, "") : null;
      out.push(
        `<blockquote${cite ? ' class="verse"' : ""}>${q.map((x) => inline(x, links)).join("<br>")}${cite ? `<cite>${inline(cite, links)}</cite>` : ""}</blockquote>`,
      );
      continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ""));
      out.push(`<ul>${items.map((x) => `<li>${inline(x, links)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+[.)]\s+/, ""));
      out.push(`<ol>${items.map((x) => `<li>${inline(x, links)}</li>`).join("")}</ol>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|[-*]\s|\d+[.)]\s)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map((x) => inline(x, links)).join("<br>")}</p>`);
  }
  return out.join("");
}

/** The editor's DOM back to Markdown. One paragraph is one line: no hard wrapping. */
export function htmlToMd(root: HTMLElement): string {
  let skip: Node | null = null;
  const inl = (n: Node): string => {
    if (n === skip) return "";
    // Marks typed as text are escaped, so they read back as text; a _ inside a word needs none.
    if (n.nodeType === Node.TEXT_NODE)
      return highlighted(
        (n.textContent || "").replace(/\u00a0/g, " ").replace(/\\(?=[\\*_=])|\*|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|=(?==)/gu, "\\$&"),
        hlOf(n, root),
      );
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const el = n as HTMLElement;
    const kids = Array.from(el.childNodes).map(inl).join("");
    const tag = el.tagName.toLowerCase();
    const bold = tag === "b" || tag === "strong" || (tag === "span" && (el.style.fontWeight === "bold" || +el.style.fontWeight >= 600));
    const ital = tag === "i" || tag === "em" || (tag === "span" && el.style.fontStyle === "italic");
    if (tag === "br") return "\n";
    if ((tag === "sup" || tag === "sub") && kids) return `<${tag}>${kids}</${tag}>`;
    if (bold && kids.trim()) return `**${kids.trim()}**${kids.endsWith(" ") ? " " : ""}`;
    if (ital && kids.trim()) return `*${kids.trim()}*${kids.endsWith(" ") ? " " : ""}`;
    return kids;
  };
  const blocks: string[] = [];
  const block = (el: Node) => {
    if (el.nodeType === Node.TEXT_NODE) {
      const t = (el.textContent || "").trim();
      if (t) blocks.push(t);
      return;
    }
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    const e = el as HTMLElement;
    const tag = e.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) blocks.push(`### ${inl(e).trim()}`);
    else if (tag === "blockquote") {
      // The cite is left out of the quote's text, not taken out of the live editor (read on every keystroke).
      const cite = e.querySelector("cite");
      const citeText = cite ? inl(cite).trim() : "";
      skip = cite;
      const lines = inl(e)
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      skip = null;
      if (citeText) lines.push(`— ${citeText}`);
      blocks.push(lines.map((x) => `> ${x}`).join("\n"));
    } else if (tag === "ul" || tag === "ol") {
      const items = Array.from(e.children).filter((c) => c.tagName === "LI");
      blocks.push(items.map((li, k) => `${tag === "ol" ? `${k + 1}.` : "-"} ${inl(li).replace(/\n+/g, " ").trim()}`).join("\n"));
    } else if (tag === "p" || tag === "div") {
      // A div holding blocks (what WebKit makes on Enter) is walked, not flattened.
      if (Array.from(e.children).some((c) => /^(P|DIV|UL|OL|BLOCKQUOTE|H\d)$/.test(c.tagName))) {
        e.childNodes.forEach(block);
        return;
      }
      const t = inl(e).replace(/\n+$/, "").trim();
      if (t) blocks.push(t.split("\n").join("  \n"));
    } else {
      const t = inl(e).trim();
      if (t) blocks.push(t);
    }
  };
  root.childNodes.forEach(block);
  // A highlight split across text nodes is joined up again.
  return blocks.map(joinMarks).join("\n\n");
}

/** Sentinel colours the editor's highlighter paints with (execCommand hiliteColor, so ⌘Z undoes
 *  it); the stylesheet shows each as its theme's colour, and "none" as no highlight. */
export const HL_PAINT: Record<string, string> = {
  red: "rgb(250, 1, 1)",
  orange: "rgb(250, 1, 2)",
  yellow: "rgb(250, 1, 3)",
  green: "rgb(250, 1, 4)",
  blue: "rgb(250, 1, 5)",
  purple: "rgb(250, 1, 6)",
  none: "rgb(250, 1, 7)",
  teal: "rgb(250, 1, 8)",
  grey: "rgb(250, 1, 9)",
};
const PAINTED = new Map(Object.entries(HL_PAINT).map(([c, v]) => [v, c]));

/** The highlight a text node shows: the nearest mark, or span painted by the highlighter. */
function hlOf(n: Node, root: HTMLElement): string | null {
  for (let e = n.parentElement; e && e !== root; e = e.parentElement) {
    const painted = e.style?.backgroundColor ? PAINTED.get(e.style.backgroundColor) : undefined;
    if (painted) return painted === "none" ? null : painted;
    const m = e.tagName === "MARK" && e.className.match(/\bhl-(\w+)/);
    if (m && (HL_COLOURS as string[]).includes(m[1])) return m[1];
  }
  return null;
}

/** Text in its highlight's marks, with any spaces at its ends left outside them. */
function highlighted(t: string, c: string | null): string {
  const m = c ? t.match(/^(\s*)([^]*?)(\s*)$/) : null;
  if (!m || !m[2]) return t;
  return m[1] + (c === "yellow" ? `==${m[2]}==` : `<mark class="hl-${c}">${m[2]}</mark>`) + m[3];
}

function joinMarks(s: string): string {
  let t = s.replace(/(?<!\\)====/g, "");
  for (let was = ""; was !== t;) {
    was = t;
    t = t.replace(/(<mark class="hl-(\w+)">(?:(?!<\/?mark).)*)<\/mark><mark class="hl-\2">/g, "$1");
  }
  return t;
}

/** Plain text with the Markdown marks taken out, for excerpts. */
export const mdPlain = (md: string) =>
  md
    .replace(/<\/?(mark|sup|sub)\b[^>]*>/g, "")
    .replace(/(?<!\\)==(?=\S)(.+?)==/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\\([\\*_=])|\*+|(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, (_m, e) => e ?? "")
    .replace(/\s+/g, " ")
    .trim();
