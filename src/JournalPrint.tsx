// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Printing the journal: the entry open, the entries on its passage, the entries the list shows or
// those from a stretch of dates, saved as a PDF laid out by journalDoc.ts (printed straight to
// the file, as Brainstead does), or as one Markdown file. With an assistant set up, it can begin
// with an overview of how the entries relate.

import { useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { api, JournalEntry } from "./api";
import { askOnce } from "./Ask";
import { assistantModels, assistantReady, pickModel, useAssistant } from "./assistant";
import { book, parseRef, Ref, refOverlaps } from "./bible";
import { plainText } from "./esword";
import { COVER_FROM, entryRefs, Group, Overview, overviewPrompt, paginate, PRINT_MAX, printHtml, Quote, readOverview } from "./journalDoc";
import { nowLocal, useApp } from "./state";
import { Dialog, Seg } from "./ui";

/** "Monday 6 October 2026 · 07:30". */
export const longDate = (s: string) => {
  const d = new Date(s);
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

type Which = "one" | "verse" | "chapter" | "listed" | "dates";
type Dates = "month" | "3m" | "year" | "custom";

const overlap = (a: Ref, b: Ref) => refOverlaps(a, b) || refOverlaps(b, a);
/** "2026-07-24": `months` before today's date. */
const monthsAgo = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
};

/** `listed` are the entries the list shows; `listedLabel` says which ("entries tagged #prayer"). */
export function PrintDialog({
  current,
  listed,
  listedLabel,
  onClose,
}: {
  current: JournalEntry | null;
  listed: JournalEntry[];
  listedLabel: string;
  onClose: () => void;
}) {
  const app = useApp();
  const canAsk = useAssistant().available;
  const curRefs = current ? entryRefs(current) : [];
  const onVerse = curRefs.length ? app.journal.filter((e) => entryRefs(e).some((r) => curRefs.some((c) => overlap(r, c)))) : [];
  const onChapter = curRefs.length
    ? app.journal.filter((e) => entryRefs(e).some((r) => curRefs.some((c) => c.book === r.book && c.chapter === r.chapter)))
    : [];
  const chapterLabel = curRefs.length ? `${book(curRefs[0].book).name} ${curRefs[0].chapter}` : "";
  const [which, setWhich] = useState<Which>(current ? "one" : "listed");
  const [dates, setDates] = useState<Dates>("month");
  const [from, setFrom] = useState(monthsAgo(1));
  const [to, setTo] = useState(nowLocal().slice(0, 10));
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [group, setGroup] = useState<Group>("none");
  const [withVerses, setWithVerses] = useState(true);
  const [withInsights, setWithInsights] = useState(true);
  const [perPage, setPerPage] = useState(false);
  const [overview, setOverview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Closed while the overview was being written: what comes back is dropped.
  const gone = useRef(false);
  const close = () => {
    gone.current = true;
    onClose();
  };

  const today = nowLocal().slice(0, 10);
  const [start, end] =
    dates === "month"
      ? [today.slice(0, 7) + "-01", today]
      : dates === "3m"
        ? [monthsAgo(3), today]
        : dates === "year"
          ? [today.slice(0, 4) + "-01-01", today]
          : [from, to];
  const inDates = app.journal.filter((e) => e.created.slice(0, 10) >= start && e.created.slice(0, 10) <= end);
  const chosen =
    which === "one" && current
      ? [current]
      : which === "verse"
        ? onVerse
        : which === "chapter"
          ? onChapter
          : which === "dates"
            ? inDates
            : listed;
  const list = chosen.slice().sort((a, b) => (order === "asc" ? a.created.localeCompare(b.created) : b.created.localeCompare(a.created)));
  const tooMany = list.length > PRINT_MAX;
  const several = list.length >= COVER_FROM;
  const verseLabel = current?.verses.join(", ") ?? "";
  const datesLabel = { month: "this month", "3m": "the last 3 months", year: "this year", custom: "those dates" }[dates];
  const title =
    which === "one" && current
      ? current.title || "Untitled"
      : which === "verse"
        ? `On ${verseLabel}`
        : which === "chapter"
          ? `On ${chapterLabel}`
          : which === "dates"
            ? "Journal"
            : listedLabel === "your whole journal"
              ? "Journal"
              : listedLabel.charAt(0).toUpperCase() + listedLabel.slice(1);
  const about =
    which === "verse"
      ? `Every entry written on ${verseLabel}.`
      : which === "chapter"
        ? `Every entry written on ${chapterLabel}.`
        : which === "dates"
          ? `The entries from ${datesLabel}.`
          : listedLabel === "your whole journal"
            ? "Entries from your journal."
            : `The ${listedLabel}.`;
  const bibleAbbrev = app.mod("bible", app.settings.bible)?.abbrev ?? "";

  /** "Journal - Aug-Oct 2026", "Journal #prayer - Oct 2026", "Journal on Psalms 75.3 - Sep 2025-Oct 2026";
   *  one entry by its title and day: "Morning prayer - 3 Aug 2026". */
  const fileName = () => {
    const mon = (s: string) => new Date(s).toLocaleDateString("en-GB", { month: "short" });
    const dates = list.map((e) => e.created).sort();
    const [a, b] = [dates[0], dates[dates.length - 1]];
    const when =
      list.length === 1
        ? new Date(a).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : a.slice(0, 7) === b.slice(0, 7)
          ? `${mon(a)} ${a.slice(0, 4)}`
          : a.slice(0, 4) === b.slice(0, 4)
            ? `${mon(a)}-${mon(b)} ${a.slice(0, 4)}`
            : `${mon(a)} ${a.slice(0, 4)}-${mon(b)} ${b.slice(0, 4)}`;
    const what =
      which === "one" && current
        ? current.title || "Untitled"
        : which === "verse"
          ? `Journal on ${verseLabel}`
          : which === "chapter"
            ? `Journal on ${chapterLabel}`
            : which === "listed" && listedLabel.startsWith("entries tagged ")
              ? `Journal ${listedLabel.slice(15)}`
              : "Journal";
    return `${what} - ${when}`.replace(/:/g, ".").replace(/[/\\*?"<>|]/g, "-");
  };

  /** Each verse written on the entries, read once from the Bible chosen. */
  const readQuotes = async (entries: JournalEntry[]) => {
    const out = new Map<string, Quote>();
    for (const v of new Set(entries.flatMap((e) => e.verses))) {
      const r = parseRef(v);
      if (!r) continue;
      try {
        const [p] = await api.passages(app.settings.bible, [
          { book: r.book, chapter: r.chapter, from: r.verse ?? 1, to: r.toChapter ? 999 : (r.to ?? r.verse ?? 999) },
        ]);
        if (p?.verses.length) out.set(v, { ref: v, verses: p.verses.map((x) => ({ v: x.v, text: plainText(x.text) })) });
      } catch {
        /* a verse this Bible hasn't: left out */
      }
    }
    return out;
  };

  const go = (fmt: "pdf" | "md") =>
    write(fmt).catch((e) => {
      setBusy(null);
      app.toast(`Couldn't save it: ${e}`);
    });
  const write = async (fmt: "pdf" | "md") => {
    const dest = await saveDialog({
      defaultPath: `${fileName()}.${fmt}`,
      filters: [fmt === "pdf" ? { name: "PDF", extensions: ["pdf"] } : { name: "Markdown", extensions: ["md"] }],
    });
    if (!dest) return;
    const useAi = overview && several && canAsk;
    setBusy("Reading the verses…");
    const quotes = withVerses || useAi ? await readQuotes(list) : new Map<string, Quote>();
    let ov: Overview | null = null;
    if (useAi) {
      setBusy("The assistant is writing the overview…");
      await assistantReady();
      const reply = await askOnce(overviewPrompt(about, list, quotes), pickModel(app.settings.model, assistantModels()));
      if (gone.current) return;
      ov = readOverview(reply);
    }
    const shown = withVerses ? quotes : new Map<string, Quote>();

    if (fmt === "md") {
      const quoteMd = (q: Quote) => `> ${q.verses.map((x) => x.text).join(" ")}\n> — ${q.ref} ${bibleAbbrev}`;
      const out: string[] = [];
      if (several) out.push(`# ${title}\n*${about}*`);
      if (ov)
        out.push(
          `## Overview\n\n${ov.overview}${ov.themes.length ? "\n\n### Key themes\n\n" + ov.themes.map((t) => `- **${t.name}** — ${t.note}${t.passages ? ` (${t.passages})` : ""}`).join("\n") : ""}`,
        );
      for (const e of list)
        out.push(
          `${several ? "##" : "#"} ${e.title || "Untitled"}\n*${longDate(e.created)}*${e.tags.length ? " · " + e.tags.map((t) => "#" + t).join(" ") : ""}\n\n${e.verses
            .map((v) => shown.get(v))
            .filter((q): q is Quote => !!q)
            .map((q) => quoteMd(q) + "\n\n")
            .join("")}${e.body}`,
        );
      await api.writeTextFile(dest, out.join("\n\n---\n\n") + "\n");
      app.toast("Saved as Markdown");
      close();
      return;
    }

    // PDF: the document laid out in a print-only container, printed straight to the file.
    setBusy("Laying out the pages…");
    const paper = await api.pdfPaperSize();
    const html = printHtml({
      title,
      about,
      entries: list,
      group: several ? group : "none",
      quotes: shown,
      bibleAbbrev,
      insights: several && withInsights,
      perPage: list.length > 1 && perPage,
      overview: ov,
    });
    // Half an inch all round.
    const root = await paginate(html, paper, 36, title);
    document.body.appendChild(root);
    setBusy("Making the PDF…");
    try {
      await new Promise((r) => setTimeout(r, 60));
      await api.exportPdf(dest);
      app.toast("Saved as PDF");
      close();
    } finally {
      root.remove();
    }
  };

  const count = (n: number) => (
    <span className="hint" style={{ marginLeft: 6 }}>
      {n}
    </span>
  );
  const opt = (v: Which, label: string, n: number) => (
    <label className="opt">
      <input type="radio" name="which" checked={which === v} onChange={() => setWhich(v)} />
      {label}
      {count(n)}
    </label>
  );
  return (
    <Dialog onClose={close} width={580} label="Print journal" dismiss={!busy}>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ font: "500 26px/1.15 var(--display)" }}>Print journal</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="label" style={{ paddingBottom: 4 }}>
            Entries
          </span>
          {current && opt("one", `This entry · ${current.title || "Untitled"}`, 1)}
          {curRefs.length > 0 && opt("verse", `On ${verseLabel}`, onVerse.length)}
          {curRefs.length > 0 && onChapter.length > onVerse.length && opt("chapter", `On ${chapterLabel}`, onChapter.length)}
          {opt(
            "listed",
            listedLabel === "your whole journal" ? "Every entry in the list" : `The ${listedLabel} in the list`,
            listed.length,
          )}
          <label className="opt">
            <input type="radio" name="which" checked={which === "dates"} onChange={() => setWhich("dates")} />
            From
            <select
              className="btn small"
              value={dates}
              onChange={(e) => {
                setDates(e.target.value as Dates);
                setWhich("dates");
              }}
            >
              <option value="month">this month</option>
              <option value="3m">the last 3 months</option>
              <option value="year">this year</option>
              <option value="custom">these dates…</option>
            </select>
            {which === "dates" && dates === "custom" && (
              <>
                <input
                  type="date"
                  className="btn small"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From"
                />
                to
                <input type="date" className="btn small" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              </>
            )}
            {count(inDates.length)}
          </label>
          {tooMany && (
            <span className="hint" style={{ color: "var(--bad)", paddingTop: 4 }}>
              That's {list.length} entries. Print up to {PRINT_MAX} at a time: narrow it by tag, filter or dates.
            </span>
          )}
        </div>
        {several && !tooMany && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Order</span>
              <Seg
                value={order}
                options={[
                  ["asc", "Oldest first"],
                  ["desc", "Newest first"],
                ]}
                onChange={setOrder}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Group</span>
              <Seg
                value={group}
                options={[
                  ["none", "None"],
                  ["tag", "By tag"],
                  ["book", "By book"],
                ]}
                onChange={setGroup}
              />
            </div>
          </div>
        )}
        {!tooMany && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="label" style={{ paddingBottom: 4 }}>
              Include
            </span>
            <label className="opt">
              <input type="checkbox" checked={withVerses} onChange={(e) => setWithVerses(e.target.checked)} />
              The text of each entry's verses
            </label>
            {several && (
              <label className="opt">
                <input type="checkbox" checked={withInsights} onChange={(e) => setWithInsights(e.target.checked)} />
                In your words: the names, words and phrases you use, and when you write
              </label>
            )}
            {list.length > 1 && (
              <label className="opt">
                <input type="checkbox" checked={perPage} onChange={(e) => setPerPage(e.target.checked)} />
                Each entry on a new page
              </label>
            )}
            {several && canAsk && (
              <label className="opt">
                <input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} />
                An overview by the AI assistant: how the entries relate, and their key themes
              </label>
            )}
          </div>
        )}
      </div>
      <div className="foot">
        <span className="hint">{busy ?? (list.length === 1 ? "1 entry" : `${list.length} entries`)}</span>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={close}>
          Cancel
        </button>
        <button className="btn" type="button" disabled={!list.length || tooMany || !!busy} onClick={() => go("md")}>
          Save Markdown…
        </button>
        <button className="btn primary" type="button" disabled={!list.length || tooMany || !!busy} onClick={() => go("pdf")}>
          Save PDF…
        </button>
      </div>
    </Dialog>
  );
}
