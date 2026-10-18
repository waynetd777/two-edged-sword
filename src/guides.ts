// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The help's text: the user guides in docs/ (all but development.md), built in, so the help and
// the guides are one copy. Each guide is a topic and each `##` a section. Their screenshots and
// breadcrumbs are left out, and their links become links within the help.

import { escHtml as esc } from "./dom";
import { isMac, shortcut } from "./keys";
import type { Screen } from "./state";

export interface HelpSection {
  title: string;
  /** The `##` heading's anchor and those of the `###`s under it, as GitHub makes them. */
  anchors: string[];
  body: string;
}

interface HelpTopic {
  /** The file name without `.md`. */
  id: string;
  title: string;
  intro: string;
  sections: HelpSection[];
}

/** The guides in the order the help lists them; Features first, as the front page. */
const PAGES = ["features", "getting-started", "reading", "study", "manuscripts", "journal", "quiet-time", "ask", "library"];

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

// Screenshots (and the HTML tables that lay them out), breadcrumbs, and a guide's row of links to its own sections (a line of it, if it wraps).
const dropped = (l: string) =>
  l.includes("images/") ||
  /^\s*<\/?(sub|table|tr|td)\b/.test(l) ||
  /^\[[^\]]+\]\(#[\w-]+\)( · \[[^\]]+\]\(#[\w-]+\))*( ·)?$/.test(l.trim());

function parseGuide(id: string, md: string): HelpTopic {
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

/** Mac-only and Windows-only parts of a guide, between `<!-- mac -->` and `<!-- /mac -->` or
 *  `<!-- windows -->` and `<!-- /windows -->`: the help shows only this computer's. Words that join
 *  the two for GitHub, which shows both ("app menu<!-- github --> or the <!-- /github -->notification-area
 *  menu"), go between `<!-- github -->` and `<!-- /github -->`, which the help never shows. */
export const forPlatform = (md: string) =>
  md
    .replace(/<!-- github -->[\s\S]*?<!-- \/github -->/g, "")
    .replace(isMac ? /<!-- windows -->[\s\S]*?<!-- \/windows -->/g : /<!-- mac -->[\s\S]*?<!-- \/mac -->/g, "")
    .replace(/<!-- \/?(?:mac|windows) -->/g, "")
    .replace(/\n{3,}/g, "\n\n");

// The guides are written with macOS's keys; Windows reads its own.
export const TOPICS: HelpTopic[] = PAGES.map((p) => parseGuide(p, shortcut(forPlatform(FILES[`../docs/${p}.md`] ?? ""))));

export interface GuideStep {
  title: string;
  body: string;
}

/** A Getting started walk-through: a `##` of getting-started.md, each `###` under it a step. */
export interface Walkthrough {
  id: string;
  title: string;
  /** What it covers: the text before its first step. */
  summary: string;
  steps: GuideStep[];
}

export const WALKTHROUGHS: Walkthrough[] = (TOPICS.find((t) => t.id === "getting-started")?.sections ?? []).map((s) => {
  const [summary, ...steps] = s.body.split(/^### /m);
  return {
    id: s.anchors[0],
    title: s.title,
    summary: summary.trim(),
    steps: steps.map((x) => {
      const nl = x.indexOf("\n");
      return { title: (nl < 0 ? x : x.slice(0, nl)).trim(), body: nl < 0 ? "" : x.slice(nl + 1).trim() };
    }),
  };
});

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

interface HelpHit {
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

// The places the guides name, made links to them: a Settings section ("Settings › Appearance", but
// not macOS's System Settings or Windows Settings), Settings, and the screens with names no button
// shares. Read, Search and Compare are also buttons' names, so the guides link those by hand.
const PLACES =
  /(?<!System |Windows )\bSettings › (Appearance|Bibles|Highlights|Listening|Journal|Quiet time|AI assistant)\b|(?<!System |Windows )\bSettings\b(?! ›)|\bKJV History\b|\bWord Study\b|\b(?<=the )Library\b(?! guide)|\bLibrary screen\b|\bQuiet time\b|\bJournal\b/g;
const SCREEN_OF: Record<string, string> = {
  "KJV History": "history",
  "Word Study": "word",
  Library: "library",
  "Library screen": "library",
  "Quiet time": "plans",
  Journal: "journal",
  Settings: "settings",
};

/** A link to more help's tooltip: the guide and section it opens in the help. */
function helpTip(href: string): string {
  const m = /^(?:([\w-]+)\.md)?(?:#([\w-]+))?$/.exec(href);
  const topic = m?.[1] ? TOPICS.find((t) => t.id === m[1]) : undefined;
  const section = m?.[2] && m[1] ? sectionAt(m[1], m[2])?.title : undefined;
  const where = [topic?.title, section].filter(Boolean).join(" › ");
  return where ? `Read “${esc(where)}” in the help` : "Read about this in the help";
}

/** An app: link labelled with just a screen's name has "Open <name>" for its tooltip; others say what they do. */
const PLACE_NAMES = new Set(["Read", "Compare", "Search", "Word Study", "Journal", "Quiet time", "Library", "KJV History", "Settings"]);

/** Links the places a passage of help names (PLACES), outside its links, buttons, code and bold
 *  (which names a button or setting more often than a screen). */
function autoLink(html: string): string {
  return html
    .split(/(<a [^>]*>.*?<\/a>|<button [^>]*>.*?<\/button>|<strong>.*?<\/strong>|<[^>]+>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(PLACES, (m: string, section?: string) => {
            const href = section ? `app:settings#${slug(section)}` : `app:${SCREEN_OF[m]}`;
            return `<a href="#" class="help-place" data-href="${href}" title="Open ${m}">${m}</a>`;
          }),
    )
    .join("");
}

/** A guide button's tooltip: what it will do, as the rest of the app's buttons say. */
function actionTip(action: string, label: string): string {
  const [what] = action.split(/[/#]/);
  if (what === "palette") return shortcut("Open the ⌘K box: go to a passage, a word or a command");
  if (what === "modules") return "Show your modules folder";
  if (what === "rescan") return "Look for modules added to the folders since the app started";
  if (what === "open") return `${label} in Read`;
  return action.includes("#") ? `${label}: show it on the screen` : `${label} (the help stays open)`;
}

/** Bold, italic, `code` and links. A link keeps its target in data-href, for the drawer to follow;
 *  an `app:` one (app:library, app:open/john-3) does it in the app (Help.tsx runAction) and has a ↗. */
function inline(text: string, auto = true): string {
  const codes: string[] = [];
  let t = text.replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  t = esc(t)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
      href.startsWith("images/")
        ? label
        : href.startsWith("app:")
          ? `<a href="#" class="help-place" data-href="${href}" title="${PLACE_NAMES.has(label) ? `Open ${label}` : actionTip(href.slice(4), label)}">${label}</a>`
          : /^https?:/.test(href)
            ? `<a href="#" class="help-out" data-href="${href}" title="Open ${esc(href)} in your browser">${label}</a>`
            : `<a href="#" data-href="${href}" title="${helpTip(href)}">${label}</a>`,
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?![\w*])/g, "$1<em>$2</em>");
  if (auto) t = autoLink(t);
  // eslint-disable-next-line no-control-regex
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${esc(codes[Number(i)])}</code>`);
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||(?<!\\)\|$/g, "")
    // An escaped pipe (`irm … \| iex`) is part of the cell, as on GitHub.
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

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
      out.push(`<h4>${inline(l.slice(4), false)}</h4>`);
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
