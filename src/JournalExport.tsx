// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Exporting the journal: one entry, a month, a tag or all of it, as a PDF (through the print
// dialog) or as one Markdown file.

import { useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { api, JournalEntry } from "./api";
import { parseRef } from "./bible";
import { escHtml } from "./dom";
import { plainText } from "./esword";
import { mdToHtml } from "./md";
import { MONTH_NAMES } from "./plans";
import { nowLocal, useApp } from "./state";
import { Dialog, Seg } from "./ui";

/** "Monday 6 October 2026 · 07:30". */
export const longDate = (s: string) => {
  const d = new Date(s);
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

export function ExportDialog({ current, onClose }: { current: JournalEntry | null; onClose: () => void }) {
  const app = useApp();
  const [what, setWhat] = useState<"one" | "month" | "tag" | "all">(current ? "one" : "all");
  const [fmt, setFmt] = useState<"pdf" | "md">("pdf");
  const [withVerses, setWithVerses] = useState(true);
  const [perPage, setPerPage] = useState(false);
  const [tag, setTag] = useState(current?.tags[0] ?? "");
  const month = current?.created.slice(0, 7) ?? nowLocal().slice(0, 7);
  const list = (
    what === "one" && current
      ? [current]
      : what === "month"
        ? app.journal.filter((e) => e.created.startsWith(month))
        : what === "tag"
          ? app.journal.filter((e) => e.tags.includes(tag))
          : app.journal
  )
    .slice()
    .sort((a, b) => a.created.localeCompare(b.created));
  const tags = Array.from(new Set(app.journal.flatMap((e) => e.tags)));

  const verseTexts = async (e: JournalEntry) => {
    if (!withVerses) return "";
    const out: string[] = [];
    for (const v of e.verses) {
      const r = parseRef(v);
      if (!r) continue;
      const [p] = await api.passages(app.settings.bible, [
        { book: r.book, chapter: r.chapter, from: r.verse ?? 1, to: r.to ?? r.verse ?? 999 },
      ]);
      out.push(`> ${p.verses.map((x) => plainText(x.text)).join(" ")}\n> — ${v} ${app.mod("bible", app.settings.bible)?.abbrev ?? ""}`);
    }
    return out.join("\n\n");
  };
  const go = () => write().catch((e) => app.toast(`Couldn't export: ${e}`));
  const write = async () => {
    const parts: { e: JournalEntry; verses: string }[] = [];
    for (const e of list) parts.push({ e, verses: await verseTexts(e) });
    if (fmt === "md") {
      const text = parts
        .map(
          ({ e, verses }) =>
            `## ${e.title}\n*${longDate(e.created)}*${e.tags.length ? " · " + e.tags.map((t) => "#" + t).join(" ") : ""}\n\n${verses ? verses + "\n\n" : ""}${e.body}`,
        )
        .join("\n\n---\n\n");
      const path = await saveDialog({
        defaultPath: `Journal ${what === "one" ? (current?.title ?? "") : what === "month" ? month : what === "tag" ? "#" + tag : "export"}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!path) return;
      await api.writeTextFile(path, text + "\n");
      app.toast("Exported");
      onClose();
      return;
    }
    // PDF: lay the entries out in a print-only container and open the print dialog, which saves PDFs.
    const root = document.createElement("div");
    root.id = "print-root";
    root.innerHTML = parts
      .map(
        ({ e, verses }) =>
          `<section class="${perPage ? "pp" : ""}"><div class="pd">${escHtml(longDate(e.created))}${e.verses.length ? " · " + escHtml(e.verses.join(", ")) : ""}</div><h1>${escHtml(e.title)}</h1>${verses ? mdToHtml(verses, false) : ""}${mdToHtml(e.body, false)}</section>`,
      )
      .join("");
    document.body.appendChild(root);
    onClose();
    await new Promise((r) => setTimeout(r, 60));
    try {
      await api.print();
    } finally {
      setTimeout(() => root.remove(), 1500);
    }
  };
  return (
    <Dialog onClose={onClose} width={560} label="Export journal">
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ font: "500 26px/1.15 var(--display)" }}>Export journal</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="label" style={{ paddingBottom: 4 }}>
            What
          </span>
          {current && (
            <label className="opt">
              <input type="radio" name="w" checked={what === "one"} onChange={() => setWhat("one")} />
              This entry · {current.title || "Untitled"}
            </label>
          )}
          <label className="opt">
            <input type="radio" name="w" checked={what === "month"} onChange={() => setWhat("month")} />
            Entries from {MONTH_NAMES[+month.slice(5, 7) - 1]} {month.slice(0, 4)}
          </label>
          {tags.length > 0 && (
            <label className="opt">
              <input type="radio" name="w" checked={what === "tag"} onChange={() => setWhat("tag")} />
              Entries tagged{" "}
              <select
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value);
                  setWhat("tag");
                }}
                className="btn small"
              >
                {tags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="opt">
            <input type="radio" name="w" checked={what === "all"} onChange={() => setWhat("all")} />
            Everything
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Format</span>
          <Seg
            value={fmt}
            options={[
              ["pdf", "PDF"],
              ["md", "Markdown"],
            ]}
            onChange={setFmt}
          />
          <span className="hint">
            {fmt === "pdf"
              ? "Opens the print dialog: choose Save as PDF. It uses the app's reading fonts."
              : "One Markdown file. Your journal is already Markdown in its folder, so Obsidian sees it without exporting."}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="label" style={{ paddingBottom: 4 }}>
            Include
          </span>
          <label className="opt">
            <input type="checkbox" checked={withVerses} onChange={(e) => setWithVerses(e.target.checked)} />
            Verse text for linked verses
          </label>
          {fmt === "pdf" && (
            <label className="opt">
              <input type="checkbox" checked={perPage} onChange={(e) => setPerPage(e.target.checked)} />
              One entry per page
            </label>
          )}
        </div>
      </div>
      <div className="foot">
        <span className="hint">
          {list.length} entr{list.length === 1 ? "y" : "ies"}
        </span>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" type="button" disabled={!list.length} onClick={go}>
          Export…
        </button>
      </div>
    </Dialog>
  );
}
