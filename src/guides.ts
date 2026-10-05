// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The help's text: the user guides in docs/ (all but development.md), built in, so the help and
// the guides are one copy. Each guide is a topic and each `##` a section. Their screenshots and
// breadcrumbs are left out, and their links become links within the help.

import type { Screen } from "./state";

export interface HelpSection {
  title: string;
  /** The `##` heading's anchor and those of the `###`s under it, as GitHub makes them. */
  anchors: string[];
  body: string;
}

export interface HelpTopic {
  /** The file name without `.md`. */
  id: string;
  title: string;
  intro: string;
  sections: HelpSection[];
}

/** The guides in the order the help lists them; Features first, as the front page. */
const PAGES = ["features", "reading", "study", "manuscripts", "journal", "quiet-time", "ask", "library"];

/** Each screen's section, as `guide#anchor`. tools/helpcheck.py checks they exist. */
const SCREEN_HELP: Record<Screen, string> = {
  read: "reading#read",
  compare: "study#compare",
  search: "study#search",
  word: "study#word-study",
  journal: "journal#write",
  plans: "quiet-time#plans",
  library: "library#the-library-screen",
  history: "manuscripts#kjv-history",
  settings: "features#settings",
};

/** GitHub's anchor for a heading, which the guides' links use. */
export const slug = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");

// Screenshots (and the HTML tables that lay them out), breadcrumbs, and a guide's row of links to its own sections.
const dropped = (l: string) =>
  l.includes("images/") || /^\s*<\/?(sub|table|tr|td)\b/.test(l) || /^\[[^\]]+\]\(#[\w-]+\)( · \[[^\]]+\]\(#[\w-]+\))*$/.test(l.trim());

export function parseGuide(id: string, md: string): HelpTopic {
  let title = id;
  let intro = "";
  const sections: HelpSection[] = [];
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    if (dropped(line)) continue;
    const h1 = /^# (.+)$/.exec(line);
    const h2 = /^## (.+)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);
    if (h1) title = h1[1].trim();
    else if (h2) sections.push({ title: h2[1].trim(), anchors: [slug(h2[1])], body: "" });
    else if (sections.length) {
      const s = sections[sections.length - 1];
      if (h3) s.anchors.push(slug(h3[1]));
      s.body += `${line}\n`;
    } else intro += `${line}\n`;
  }
  for (const s of sections) s.body = s.body.trim();
  return { id, title, intro: intro.trim(), sections };
}

const FILES = import.meta.glob<string>("../docs/*.md", { query: "?raw", import: "default", eager: true });

export const TOPICS: HelpTopic[] = PAGES.map((p) => parseGuide(p, FILES[`../docs/${p}.md`] ?? ""));

/** Where a screen's help is: its topic and the section to open. Read shows a book's or a song's when one is open. */
export function helpFor(screen: Screen, doc?: { view?: string } | null): { topic: string; section: string } {
  const at =
    screen === "read" && doc ? (doc.view === "lyrics" ? "quiet-time#worship-music" : "reading#books-and-devotionals") : SCREEN_HELP[screen];
  const [topic, anchor] = at.split("#");
  return { topic, section: sectionAt(topic, anchor)?.title ?? "" };
}

/** The section of a topic an anchor points into: a `##` or a `###` under it. */
export function sectionAt(topic: string, anchor: string): HelpSection | undefined {
  return TOPICS.find((t) => t.id === topic)?.sections.find((s) => s.anchors.includes(anchor));
}

export interface HelpHit {
  topic: HelpTopic;
  section: HelpSection;
}

/** Sections with every word of the query, those with words in their heading first. */
export function searchHelp(q: string): HelpHit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: (HelpHit & { score: number })[] = [];
  for (const topic of TOPICS)
    for (const section of topic.sections) {
      const head = `${topic.title} ${section.title}`.toLowerCase();
      const hay = `${head} ${section.body.toLowerCase()}`;
      if (!words.every((w) => hay.includes(w))) continue;
      hits.push({ topic, section, score: words.filter((w) => head.includes(w)).length });
    }
  return hits.sort((a, b) => b.score - a.score);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Bold, italic, `code` and links. A link keeps its target in data-href, for the drawer to follow. */
function inline(text: string): string {
  const codes: string[] = [];
  let t = text.replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  t = esc(t)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
      href.startsWith("images/") ? label : `<a href="#" data-href="${href}">${label}</a>`,
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?![\w*])/g, "$1<em>$2</em>");
  // eslint-disable-next-line no-control-regex
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${esc(codes[Number(i)])}</code>`);
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** The guides' Markdown as HTML: paragraphs, `###` headings, lists, tables and quotes. */
export function helpHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split("\n");
  let i = 0;
  const isList = (l: string) => /^\s*([-*]|\d+\.)\s/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
    } else if (/^### /.test(l)) {
      out.push(`<h4>${inline(l.slice(4))}</h4>`);
      i++;
    } else if (l.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const body = rows.slice(1).filter((r) => !/^\|[\s|:-]+\|?$/.test(r));
      out.push(
        `<table><thead><tr>${cells(rows[0])
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${body
          .map(
            (r) =>
              `<tr>${cells(r)
                .map((c) => `<td>${inline(c)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table>`,
      );
    } else if (isList(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && lines[i].trim() && (isList(lines[i]) || /^\s+\S/.test(lines[i]))) {
        if (isList(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${tag}>`);
    } else if (l.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
    } else {
      const p: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(### |\||>)/.test(lines[i]) && !isList(lines[i])) p.push(lines[i++].trim());
      // Raw HTML left in a guide (a stray tag) shows as text rather than being run.
      out.push(`<p>${inline(p.join(" "))}</p>`);
    }
  }
  return out.join("");
}
