// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// ☰ › Help: the phone's guide (mobile/docs/guide.md), built in, a folding section per `##`. Parts
// marked <!-- ios --> … <!-- /ios --> or <!-- android --> … <!-- /android --> show on that platform only.

import { useEffect, useState } from "react";
import { scene } from "./api";
import { escHtml as esc } from "../../src/dom";
import GUIDE from "../docs/guide.md?raw";

const android = !!(window as unknown as { TesInsets?: unknown }).TesInsets;

/** The guide for this platform: the other platform's parts taken out. */
const forPlatform = (md: string) =>
  md
    .replace(android ? /<!-- ios -->[\s\S]*?<!-- \/ios -->\n?/g : /<!-- android -->[\s\S]*?<!-- \/android -->\n?/g, "")
    .replace(/<!-- \/?(ios|android) -->\n?/g, "");

/** Bold and `code`. */
const inline = (t: string) =>
  esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** Paragraphs, lists and tables, as the guide uses them. */
function toHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) i++;
    else if (l.startsWith("|")) {
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
    } else if (/^\s*[-*]\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
    } else {
      const p: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(\||\s*[-*]\s)/.test(lines[i])) p.push(lines[i++].trim());
      out.push(`<p>${inline(p.join(" "))}</p>`);
    }
  }
  return out.join("");
}

const md = forPlatform(GUIDE);
const parts = md.split(/^## /m);
const INTRO = toHtml(parts[0].replace(/^# .*\n/, ""));
const SECTIONS = parts.slice(1).map((p) => {
  const nl = p.indexOf("\n");
  return { title: p.slice(0, nl).trim(), html: toHtml(p.slice(nl + 1)) };
});

export function Help() {
  const [open, setOpen] = useState<string | null>(null);
  // Debug: help=<section title> opens that section.
  useEffect(() => {
    scene.then((sc) => {
      const h = sc.find((x) => x.startsWith("help="));
      if (h) setOpen(decodeURIComponent(h.slice(5)));
    });
  }, []);
  return (
    <div className="help">
      <div className="prose" dangerouslySetInnerHTML={{ __html: INTRO }} />
      <div className="card flush">
        {SECTIONS.map((s) => (
          <details
            key={s.title}
            open={open === s.title}
            onToggle={(e) => (e.currentTarget.open ? setOpen(s.title) : open === s.title && setOpen(null))}
          >
            <summary className="row">
              <span className="grow">{s.title}</span>
            </summary>
            <div className="prose" dangerouslySetInnerHTML={{ __html: s.html }} />
          </details>
        ))}
      </div>
    </div>
  );
}
