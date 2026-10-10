// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, JournalEntry } from "./api";
import { useAskOpener } from "./Ask";
import { fmtRef, parseRef, Ref } from "./bible";
import { plainText, wordRangeAt } from "./esword";
import { escHtml } from "./dom";
import { Icon } from "./icons";
import { HL_PAINT, htmlToMd, mdPlain, mdToHtml } from "./md";
import { HighlightsButton, HL_DOT, hlLabel } from "./Read";
import { SearchField, Topbar } from "./Shell";
import { HlColor, HlTheme, nowLocal, onFlush, themesOf, uid, useApp } from "./state";
import { ClearButton, confirmDelete, scrollToThird } from "./ui";
import { useAssistant } from "./assistant";
import { docModule, parseDocLabel } from "./docref";
import { useRefPreview } from "./StudyPane";
import { useSpelling } from "./spelling";
import { useFind } from "./find";
import { journalParas, speechBlocks, useListenKey, usePlayer } from "./speech";
import { MONTH_NAMES } from "./plans";
import { ExportDialog, longDate } from "./JournalExport";
import { JournalAsk } from "./JournalAsk";
import { HighlightPicker, RefPrompt, SpellMenu, tagOptions, TagPicker } from "./JournalPickers";
import { useEscExitsFocus } from "./ReadingColumn";

// Worked out once per entry (the objects are kept until an entry changes): with thousands of
// entries, doing it on every keystroke made typing slow.
const plainOf = new WeakMap<JournalEntry, string>();
const plain = (e: JournalEntry) => {
  let t = plainOf.get(e);
  if (t === undefined) {
    t = mdPlain(e.body);
    plainOf.set(e, t);
  }
  return t;
};
const hayOf = new WeakMap<JournalEntry, string>();
const hay = (e: JournalEntry) => {
  let t = hayOf.get(e);
  if (t === undefined) {
    t = (e.title + " " + e.tags.map((t) => "#" + t).join(" ") + " " + e.verses.join(" ") + " " + plain(e)).toLowerCase();
    hayOf.set(e, t);
  }
  return t;
};

/** One entry in the list; drawn again only when it or its selection changes. */
const EntryRow = memo(function EntryRow({ e, selected, onSelect }: { e: JournalEntry; selected: boolean; onSelect: (id: string) => void }) {
  const d = new Date(e.created);
  return (
    <button
      type="button"
      className="bm"
      onClick={() => onSelect(e.id)}
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 3,
        padding: "10px 12px",
        background: selected ? "var(--accentsoft)" : undefined,
        boxShadow: selected ? "inset 0 0 0 1px var(--ring)" : undefined,
      }}
    >
      <b style={{ fontSize: 13.5 }}>{e.title || "Untitled"}</b>
      <span className="n">
        {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        {e.verses.length ? ` · ${e.verses.join(", ")}` : ""}
      </span>
      <span
        style={{
          font: "400 13.5px/1.45 var(--serif)",
          color: "var(--muted)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {plain(e).slice(0, 180)}
      </span>
    </button>
  );
});

export function JournalScreen({
  openPalette,
  focus,
  setFocus,
}: {
  openPalette: () => void;
  focus: boolean;
  setFocus: (f: boolean) => void;
}) {
  const player = usePlayer();
  const app = useApp();
  const [selId, setSelId] = useState<string | null>(app.journal[0]?.id ?? null);
  const [draft, setDraft] = useState<JournalEntry | null>(null);
  const [filter, setFilter] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<{ id: string; run: () => void } | null>(null);
  // The save being written now, which a delete waits for (or the save would bring the entry back).
  const saving = useRef<Promise<void> | null>(null);
  // The copy last saved from here: the journal holding it is this screen's own save coming back,
  // not a change made elsewhere, so the copy being typed stays (its title as typed, not trimmed).
  const lastSaved = useRef<JournalEntry | null>(null);
  // An unsaved edit is written on leaving the screen, and on hiding or quitting like the store's saves.
  useEffect(() => {
    const off = onFlush(() => pendingSave.current?.run());
    return () => {
      off();
      pendingSave.current?.run();
    };
  }, []);

  // A seed from elsewhere: open an entry, or start one on the given verses.
  useEffect(() => {
    const s = app.journalSeed;
    if (!s) return;
    app.clearSeed();
    if (s.openId) {
      setSelId(s.openId);
      return;
    }
    const e: JournalEntry = {
      id: uid(),
      title: s.title ?? "",
      created: nowLocal(),
      updated: nowLocal(),
      verses: s.verses ?? [],
      tags: s.tags ?? [],
      body: s.body ?? "",
    };
    setDraft(e);
    setSelId(e.id);
  }, [app.journalSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the journal has a copy of this entry that wasn't saved from here (a change in the vault)
  // and no save is waiting, show the file's copy, so a change made elsewhere appears.
  useEffect(() => {
    const j = draft && app.journal.find((e) => e.id === draft.id);
    if (j && !pendingSave.current && j !== lastSaved.current) setDraft(null);
  }, [app.journal]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => {
    const all = draft && !app.journal.some((e) => e.id === draft.id) ? [draft, ...app.journal] : app.journal;
    const f = filter.toLowerCase();
    return all.filter((e) => (!tag || e.tags.includes(tag)) && (!f || hay(e).includes(f)));
  }, [app.journal, draft, filter, tag]);
  // How often each tag is used: the filter's tags, most used first (past the first five they wait
  // behind "more"; the chosen one always shows), and the editor's tag suggestions.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of app.journal) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [app.journal]);
  const tags = useMemo(
    () => [...tagCounts.keys()].sort((a, b) => tagCounts.get(b)! - tagCounts.get(a)! || a.localeCompare(b)),
    [tagCounts],
  );
  const [allTags, setAllTags] = useState(false);
  const shownTags = allTags ? tags : tags.slice(0, 5).concat(tag && tags.indexOf(tag) >= 5 ? [tag] : []);
  const cur = (draft && draft.id === selId ? draft : app.journal.find((e) => e.id === selId)) ?? null;

  const persist = (e: JournalEntry) => {
    setDraft(e);
    // One timer for all entries: an edit to another entry flushes this one's save rather than cancelling it.
    if (pendingSave.current && pendingSave.current.id !== e.id) pendingSave.current.run();
    window.clearTimeout(saveTimer.current);
    const run = async () => {
      window.clearTimeout(saveTimer.current);
      pendingSave.current = null;
      if (!e.title.trim() && !e.body.trim()) return; // nothing to keep yet
      const copy = { ...e, title: e.title.trim() || "Untitled" };
      lastSaved.current = copy;
      const p = app.saveEntry(copy);
      saving.current = p;
      try {
        await p;
        setSaved(
          `Saved to Me. Journal - ${e.created.slice(0, 7)}.md · ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
        );
        setErr(null);
      } catch (x) {
        setErr(String(x));
        // Still waiting to be saved: kept, so a reload doesn't replace it with the file's copy, and
        // tried again on the next flush or edit.
        pendingSave.current ??= { id: e.id, run };
      } finally {
        if (saving.current === p) saving.current = null;
      }
    };
    pendingSave.current = { id: e.id, run };
    saveTimer.current = window.setTimeout(run, 600);
  };
  const edit = (patch: Partial<JournalEntry>) => {
    if (cur) persist({ ...cur, ...patch, updated: nowLocal() });
  };
  const create = () => {
    const e: JournalEntry = { id: uid(), title: "", created: nowLocal(), updated: nowLocal(), verses: [], tags: [], body: "" };
    setDraft(e);
    setSelId(e.id);
  };
  const remove = async () => {
    if (!cur) return;
    if (!(await confirmDelete(`“${cur.title || "Untitled"}”`))) return;
    if (pendingSave.current?.id === cur.id) {
      window.clearTimeout(saveTimer.current);
      pendingSave.current = null;
    }
    await saving.current?.catch(() => {});
    try {
      if (app.journal.some((e) => e.id === cur.id) || lastSaved.current?.id === cur.id) await app.deleteEntry(cur.id);
    } catch (x) {
      setErr(String(x));
      return;
    }
    setDraft(null);
    setSelId(app.journal.find((e) => e.id !== cur.id)?.id ?? null);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "n") {
        create();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // Esc leaves focus mode (after anything open in the editor has had it).
  useEscExitsFocus(focus, setFocus);

  // Listen: the entry read aloud, its title and then each paragraph, in the reading voice.
  const listening = player.state.on && player.state.doc?.module === "journal" && player.state.doc.id === cur?.id;
  const listen = () => {
    if (!cur) return;
    if (listening) {
      player.toggle();
      return;
    }
    pendingSave.current?.run();
    const paras = journalParas(cur.body);
    if (paras.length) player.playDoc("journal", cur.title || "Untitled entry", paras, 0, "reference", { id: cur.id });
  };
  useListenKey(listen);
  // When the reading moves on to another entry (F9, F7), show that one, if the one it left was showing.
  const readingId = player.state.on && player.state.doc?.module === "journal" ? player.state.doc.id : undefined;
  const lastRead = useRef(readingId);
  useEffect(() => {
    const prev = lastRead.current;
    lastRead.current = readingId;
    if (readingId && prev && prev !== readingId && prev === selId) setSelId(readingId);
  }, [readingId]); // eslint-disable-line react-hooks/exhaustive-deps

  let lastMonth = "";
  return (
    <div className="main">
      <Topbar
        right={
          <div style={{ display: "flex", gap: 2 }}>
            <button
              className={`ibtn ${listening && !player.state.paused ? "on" : ""}`}
              type="button"
              aria-label="Listen"
              title={listening ? `${player.state.paused ? "Play" : "Pause"} (Space · ⌘P)` : "Listen to this entry (⌘P)"}
              disabled={!cur?.body.trim()}
              onClick={listen}
            >
              <Icon name="speaker" />
            </button>
            <button
              className={`ibtn ${focus ? "on" : ""}`}
              type="button"
              aria-label="Focus mode"
              title={focus ? "Leave focus mode (Esc)" : "Focus mode (⌘.)"}
              onClick={() => setFocus(!focus)}
            >
              <Icon name="focus" />
            </button>
          </div>
        }
      >
        <SearchField onOpen={openPalette} />
      </Topbar>
      <div
        style={{
          flexGrow: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: focus ? "minmax(0,80%)" : "320px minmax(0,1fr)",
          justifyContent: focus ? "center" : undefined,
        }}
      >
        <div
          style={{
            display: focus ? "none" : "flex",
            borderRight: "1px solid var(--border)",
            padding: "14px 12px 0",
            flexDirection: "column",
            gap: 10,
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
            <h1 style={{ margin: 0, font: "500 26px/1.2 var(--display)" }}>Journal</h1>
            <button className="btn primary" type="button" style={{ marginLeft: "auto" }} onClick={create}>
              <Icon name="plus" />
              New entry<span style={{ opacity: 0.75 }}>⌘N</span>
            </button>
          </div>
          <label className="field" style={{ margin: "0 4px" }}>
            <Icon name="search" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && filter) {
                  e.preventDefault();
                  e.stopPropagation();
                  setFilter("");
                }
              }}
              placeholder="Filter entries, tags or verses"
              aria-label="Filter entries"
            />
            <ClearButton show={!!filter} onClear={() => setFilter("")} />
          </label>
          {tags.length > 0 && (
            <div style={{ display: "flex", gap: 5, padding: "0 4px", flexWrap: "wrap" }}>
              <button type="button" className={`chip ${!tag ? "on" : ""}`} onClick={() => setTag(null)}>
                All
              </button>
              {shownTags.map((t) => (
                <button key={t} type="button" className={`chip ${tag === t ? "on" : ""}`} onClick={() => setTag(tag === t ? null : t)}>
                  #{t}
                </button>
              ))}
              {tags.length > 5 && (
                <button type="button" className="chip" onClick={() => setAllTags(!allTags)}>
                  {allTags ? "Fewer" : `+${tags.length - 5} more`}
                </button>
              )}
            </div>
          )}
          <div className="scroll" style={{ flexGrow: 1, paddingBottom: 20 }}>
            {!entries.length && (
              <div className="empty">
                {app.journal.length ? "Nothing matches." : "No entries yet. Start one with New entry, or press N on a verse."}
              </div>
            )}
            {entries.map((e) => {
              const d = new Date(e.created);
              const m = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
              const head =
                m !== lastMonth ? (
                  <div className="label" style={{ padding: "10px 12px 4px" }}>
                    {m}
                  </div>
                ) : null;
              lastMonth = m;
              return (
                <div key={e.id}>
                  {head}
                  <EntryRow e={e} selected={e.id === selId} onSelect={setSelId} />
                </div>
              );
            })}
          </div>
        </div>
        {cur ? (
          <Editor
            key={cur.id}
            entry={cur}
            onChange={edit}
            saved={saved}
            err={err}
            onDelete={remove}
            onExport={() => setExporting(true)}
            listed={entries}
            tagCounts={tagCounts}
            listedLabel={tag ? `entries tagged #${tag}` : filter.trim() ? `entries matching “${filter.trim()}”` : "your whole journal"}
          />
        ) : (
          <div className="empty">Choose an entry, or start a new one.</div>
        )}
      </div>
      {exporting && <ExportDialog current={cur} onClose={() => setExporting(false)} />}
    </div>
  );
}

/** `listed` are the entries the list shows (filtered), which a whole-journal Ask is about; `listedLabel` says which. */
function Editor({
  entry,
  onChange,
  saved,
  err,
  onDelete,
  onExport,
  listed,
  listedLabel,
  tagCounts,
}: {
  entry: JournalEntry;
  onChange: (p: Partial<JournalEntry>) => void;
  saved: string;
  err: string | null;
  onDelete: () => void;
  onExport: () => void;
  listed: JournalEntry[];
  listedLabel: string;
  /** How often each tag is used in the journal, for the tags offered. */
  tagCounts: Map<string, number>;
}) {
  const app = useApp();
  const canAsk = useAssistant().available;
  const [ask, setAsk] = useState(false);
  const [scope, setScope] = useState<"entry" | "journal">("entry");
  useAskOpener(() => {
    setScope("entry");
    setAsk(true);
  });
  // Text selected in the entry, which an Ask about the entry is then about. Kept while the
  // selection moves to the Ask panel's box; cleared by a caret in the entry or its ×.
  const [picked, setPicked] = useState("");
  const ed = useRef<HTMLDivElement>(null);
  // What the editor holds. A body arriving that isn't it was changed elsewhere (in the vault):
  // show it. While typing, the entry shown is the unsaved copy, so this never replaces an edit.
  const shown = useRef(entry.body);
  const [verseAt, setVerseAt] = useState<DOMRect | null>(null);
  const [linkAt, setLinkAt] = useState<DOMRect | null>(null);
  const [tagAt, setTagAt] = useState<DOMRect | null>(null);
  const [hlAt, setHlAt] = useState<DOMRect | null>(null);
  const [tagQ, setTagQ] = useState("");
  const [tagIdx, setTagIdx] = useState(0);
  const themes = useMemo(() => themesOf(app.settings.hlNames), [app.settings.hlNames]);
  const addTag = (t: string) => {
    if (!entry.tags.includes(t)) onChange({ tags: [...entry.tags, t] });
  };
  const saved_range = useRef<Range | null>(null);
  useEffect(() => {
    // Every line is a <p>, so Enter, lists and quotes act on one line at a time.
    document.execCommand("defaultParagraphSeparator", false, "p");
    // References are links (htmlToMd reads them back as their text); ones typed now link next time.
    if (ed.current) ed.current.innerHTML = mdToHtml(entry.body) || "<p><br></p>";
    shown.current = entry.body;
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only a real change is saved: clicking in and out must not write back a copy made before the
  // file changed elsewhere (in Obsidian, say).
  const sync = () => {
    if (!ed.current) return;
    const body = htmlToMd(ed.current);
    if (body !== entry.body) {
      shown.current = body;
      onChange({ body });
    }
  };
  useEffect(() => {
    if (entry.body === shown.current || !ed.current) return;
    shown.current = entry.body;
    ed.current.innerHTML = mdToHtml(entry.body) || "<p><br></p>";
    spell.recheck(50);
  }, [entry.body]); // eslint-disable-line react-hooks/exhaustive-deps
  const spell = useSpelling(ed, entry.id, () => sync(), app.settings.journalGrammar ?? true);
  const find = useFind(ed, () => {
    sync();
    spell.recheck();
  });
  useEffect(() => {
    const f = () => {
      const s = window.getSelection();
      if (s?.rangeCount && ed.current?.contains(s.anchorNode)) setPicked(s.isCollapsed ? "" : s.toString().trim());
    };
    document.addEventListener("selectionchange", f);
    return () => document.removeEventListener("selectionchange", f);
  }, []);
  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  const refAt = (t: EventTarget) => (t as HTMLElement).closest("a.ref") as HTMLElement | null;
  const cmd = (c: string, v?: string) => {
    ed.current?.focus();
    document.execCommand(c, false, v);
    sync();
  };
  /** Highlights the selection in a reader colour (null takes highlighting off); ⌘Z undoes it. */
  const hlLast = app.settings.journalHighlight ?? "yellow";
  const names = app.settings.hlNames;
  const highlight = (c: HlColor | null, picking = false) => {
    const s = window.getSelection();
    ed.current?.focus();
    if (s && !(s.rangeCount && ed.current?.contains(s.anchorNode)) && saved_range.current) {
      s.removeAllRanges();
      s.addRange(saved_range.current);
    }
    if (!s || s.isCollapsed || !ed.current?.contains(s.anchorNode)) {
      if (!picking) app.toast("Select the text to highlight");
      return;
    }
    document.execCommand("hiliteColor", false, HL_PAINT[c ?? "none"]);
    if (c && app.settings.showHighlights === false) app.set({ showHighlights: true });
    sync();
  };
  const remember = () => {
    const s = window.getSelection();
    if (s && s.rangeCount && ed.current?.contains(s.anchorNode)) saved_range.current = s.getRangeAt(0).cloneRange();
  };
  const insertVerse = async (text: string) => {
    const r = parseRef(text);
    if (!r) return false;
    const bible = app.settings.bible;
    const [p] = await api.passages(bible, [{ book: r.book, chapter: r.chapter, from: r.verse ?? 1, to: r.to ?? r.verse ?? 999 }]);
    if (!p.verses.length) return false;
    const txt = p.verses.map((v) => plainText(v.text)).join(" ");
    const html = `<blockquote class="verse" dir="auto">${escHtml(txt)}<cite>${escHtml(fmtRef(r))} ${escHtml(app.mod("bible", bible)?.abbrev ?? "")}</cite></blockquote><p><br></p>`;
    ed.current?.focus();
    if (saved_range.current) {
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(saved_range.current);
    }
    document.execCommand("insertHTML", false, html);
    if (!entry.verses.includes(fmtRef(r))) onChange({ verses: [...entry.verses, fmtRef(r)], body: htmlToMd(ed.current!) });
    else sync();
    return true;
  };
  /** An answer from Ask, put in after the paragraph the caret (or selection) was last in, or at the end. */
  const insertAnswer = (md: string, tags: string[] = []) => {
    const root = ed.current;
    if (!root) return;
    if (reading) {
      app.toast("Stop the reading to add this to the entry");
      return;
    }
    root.focus();
    const at = saved_range.current && root.contains(saved_range.current.endContainer) ? saved_range.current.endContainer : null;
    const block =
      ((at?.nodeType === Node.TEXT_NODE ? at.parentElement : (at as HTMLElement | null))?.closest(
        "p, li, h3, blockquote",
      ) as HTMLElement | null) ?? root;
    const r = document.createRange();
    r.selectNodeContents(block.closest("ul, ol") ?? block);
    r.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    document.execCommand("insertHTML", false, mdToHtml(md));
    // The themes Ask named for the answer join the entry's tags.
    const add = tags.filter((t) => !entry.tags.includes(t));
    if (add.length) onChange({ tags: [...entry.tags, ...add], body: htmlToMd(root) });
    else sync();
    spell.recheck();
  };
  // The webview has no Format menu, so ⌘B and ⌘I are handled here; and Markdown habits work:
  // "- ", "1. ", "> " and "### " at the start of a line become a list, quote or heading.
  const keys = (e: React.KeyboardEvent) => {
    if (hashTag.onKey(e)) return;
    if (e.metaKey && (e.key === "b" || e.key === "i")) {
      e.preventDefault();
      cmd(e.key === "b" ? "bold" : "italic");
      return;
    }
    const sel = window.getSelection();
    const node = sel?.anchorNode ?? null;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
    const block = el?.closest("p, div, li, h3, blockquote") as HTMLElement | null;
    if (e.key === "Enter" && !e.shiftKey && block && block !== ed.current) {
      // Enter on an empty line in a quote leaves the quote; after a heading comes a paragraph.
      const quote = el?.closest("blockquote");
      if (quote && !(block.textContent || "").trim()) {
        e.preventDefault();
        cmd("formatBlock", "p");
        return;
      }
      if (el?.closest("h3")) {
        window.setTimeout(() => {
          const n = window.getSelection()?.anchorNode;
          const b = (n?.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement))?.closest("h3");
          if (b) cmd("formatBlock", "p");
        }, 0);
      }
      return;
    }
    if (e.key !== " " || !sel || !node || node.nodeType !== Node.TEXT_NODE || !block || block === ed.current) return;
    const before = (node.textContent || "").slice(0, sel.anchorOffset);
    if ((block.textContent || "").trim() !== before.trim()) return;
    const map: Record<string, [string, string?]> = {
      "-": ["insertUnorderedList"],
      "*": ["insertUnorderedList"],
      "1.": ["insertOrderedList"],
      ">": ["formatBlock", "blockquote"],
      "#": ["formatBlock", "h3"],
      "##": ["formatBlock", "h3"],
      "###": ["formatBlock", "h3"],
    };
    const m = map[before.trim()];
    if (!m) return;
    e.preventDefault();
    cmd(m[0], m[1]);
    for (let i = 0; i < before.length; i++) document.execCommand("delete");
    sync();
  };
  // Typing # in the entry offers tags; the one picked joins the entry's tags and the #text goes.
  const hashTag = useHashTag(ed, entry, themes, tagCounts, tagIdx, setTagIdx, (body, tags) => {
    shown.current = body;
    onChange({ body, tags });
  });
  const words = mdPlain(entry.body).split(/\s+/).filter(Boolean).length;

  const { reading, wrap, boxes } = useReadAloud(ed, entry.id, sync);

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "var(--panel)", position: "relative" }}>
      <Toolbar
        reading={reading}
        cmd={cmd}
        highlight={highlight}
        remember={remember}
        hlLast={hlLast}
        names={names}
        setHlAt={setHlAt}
        setVerseAt={setVerseAt}
        setLinkAt={setLinkAt}
        onTag={(r) => {
          setTagIdx(0);
          setTagAt(r);
        }}
        onFind={() => find.start("find")}
        saved={saved}
        err={err}
        canAsk={canAsk}
        ask={ask}
        setAsk={setAsk}
      />
      {!reading && find.bar}
      <div className="scroll" style={{ flexGrow: 1, padding: "28px 0 40px" }}>
        <article
          style={{ padding: "0 40px", display: "flex", flexDirection: "column", gap: 14, minHeight: "100%" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) ed.current?.focus();
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="label">{longDate(entry.created)}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
              {entry.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  title="Remove tag"
                  disabled={reading}
                  onClick={() => onChange({ tags: entry.tags.filter((x) => x !== t) })}
                >
                  #{t}
                  <Icon name="x" size={11} />
                </button>
              ))}
            </span>
          </div>
          <input
            value={entry.title}
            readOnly={reading}
            autoFocus={!entry.title}
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ed.current?.focus();
              }
            }}
            placeholder="Title"
            aria-label="Title"
            style={{
              border: 0,
              outline: 0,
              background: "transparent",
              font: "500 36px/1.15 var(--display)",
              color: "var(--text)",
              padding: 0,
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="n">{entry.verses.length ? "Linked to" : "No verses linked"}</span>
            {entry.verses.map((v) => {
              const r = parseRef(v);
              const d = r ? null : parseDocLabel(v);
              const dm = d && docModule(d, app.lib?.modules ?? []);
              return (
                <span key={v} className="rchip" style={{ gap: 6 }}>
                  <a
                    onClick={() => {
                      if (r) app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read");
                      else if (d && dm) app.openDoc(dm.id, d.chapter, dm.kind === "devotional" ? "devotional" : "reference", d.from);
                    }}
                  >
                    {v}
                  </a>
                  <button
                    className="ibtn"
                    type="button"
                    disabled={reading}
                    aria-label={`Unlink ${v}`}
                    style={{ width: 16, height: 16 }}
                    onClick={() => onChange({ verses: entry.verses.filter((x) => x !== v) })}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </span>
              );
            })}
          </div>
          <div ref={wrap} style={{ position: "relative", zIndex: 0 }}>
            <div
              ref={ed}
              className={`md editor selectable ${entry.body.trim() ? "" : "blank"}`}
              contentEditable={!reading}
              suppressContentEditableWarning
              spellCheck={false}
              onInput={() => {
                sync();
                spell.recheck();
                find.refresh();
                hashTag.check();
              }}
              onBlur={() => {
                remember();
                sync();
              }}
              onKeyUp={remember}
              onMouseUp={remember}
              onKeyDown={(e) => {
                spell.onKey(e);
                keys(e);
              }}
              onClick={(e) => {
                const a = refAt(e.target);
                if (a?.dataset.ref) {
                  e.preventDefault();
                  hide();
                  const r: Ref = JSON.parse(a.dataset.ref);
                  app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read");
                } else spell.onClick(e);
              }}
              onMouseOver={(e) => {
                const a = refAt(e.target);
                if (a?.dataset.ref && !a.contains(e.relatedTarget as Node)) onRefHover(JSON.parse(a.dataset.ref), a);
              }}
              onMouseOut={(e) => {
                const a = refAt(e.target);
                if (a && !a.contains(e.relatedTarget as Node)) onRefHover(null, null);
              }}
              onPaste={(e) => {
                e.preventDefault();
                document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
              }}
              data-placeholder="Write here…"
              style={{ font: "400 calc(var(--read-size) - 2px)/1.7 var(--serif)", outline: "none", minHeight: 300 }}
            />
            {/* After the editor: drawn over a quote's card, under the words (styles.css, .editor blockquote). */}
            {boxes.map((b, j) => (
              <span key={j} className={b.cls} style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />
            ))}
          </div>
          {canAsk && !entry.body.trim() && !ask && (
            <button
              className="btn small"
              type="button"
              style={{ alignSelf: "flex-start", border: 0, color: "var(--muted)" }}
              onClick={() => {
                setScope("entry");
                setAsk(true);
              }}
            >
              <Icon name="chat" />
              Stuck? Ask for a prompt to start
            </button>
          )}
        </article>
        {preview}
        {spell.menu && <SpellMenu spell={spell} />}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px",
          borderTop: "1px solid var(--border)",
          color: "var(--muted)",
          fontSize: 12,
        }}
      >
        <span>
          {words} word{words === 1 ? "" : "s"}
        </span>
        {entry.verses.length > 0 && (
          <>
            <span>·</span>
            <span>Shows beside {entry.verses.join(", ")} in Read</span>
          </>
        )}
        <button
          className="btn"
          type="button"
          style={{ marginLeft: "auto" }}
          onClick={() =>
            revealItemInDir(`${app.journalDir}/Me. Journal - ${entry.created.slice(0, 7)}.md`).catch(() =>
              app.toast("Save the entry first"),
            )
          }
        >
          <Icon name="finder" />
          Show in Finder
        </button>
        <button className="btn" type="button" onClick={onExport}>
          <Icon name="export" />
          Export…
        </button>
        <button className="ibtn" type="button" aria-label="Delete entry" title="Delete entry" disabled={reading} onClick={onDelete}>
          <Icon name="trash" />
        </button>
      </div>
      {ask && (
        <JournalAsk
          entry={entry}
          scope={scope}
          setScope={setScope}
          picked={picked}
          setPicked={setPicked}
          listed={listed}
          listedLabel={listedLabel}
          onInsert={insertAnswer}
          onClose={() => setAsk(false)}
        />
      )}
      {verseAt && (
        <RefPrompt
          anchor={verseAt}
          label="Insert a verse"
          onClose={() => setVerseAt(null)}
          onSubmit={async (t) => {
            const ok = await insertVerse(t).catch((e) => {
              app.toast(`Couldn't insert the verse: ${e}`);
              return null;
            });
            if (ok) setVerseAt(null);
            return ok;
          }}
        />
      )}
      {linkAt && (
        <RefPrompt
          anchor={linkAt}
          label="Link a verse to this entry"
          onClose={() => setLinkAt(null)}
          onSubmit={async (t) => {
            const r = parseRef(t);
            if (!r) return false;
            const s = fmtRef(r);
            if (!entry.verses.includes(s)) onChange({ verses: [...entry.verses, s] });
            setLinkAt(null);
            return true;
          }}
        />
      )}
      {hlAt && (
        <HighlightPicker
          anchor={hlAt}
          last={hlLast}
          names={names}
          onClose={() => setHlAt(null)}
          onPick={(c) => {
            setHlAt(null);
            if (c) app.set({ journalHighlight: c });
            highlight(c, !!c);
          }}
        />
      )}
      {tagAt && (
        <TagPicker
          anchor={tagAt}
          options={tagOptions(tagQ, themes, tagCounts, entry.tags)}
          index={tagIdx}
          onIndex={setTagIdx}
          query={tagQ}
          onQuery={setTagQ}
          onClose={() => {
            setTagAt(null);
            setTagQ("");
          }}
          onPick={(t) => {
            addTag(t);
            setTagAt(null);
            setTagQ("");
          }}
        />
      )}
      {hashTag.picker}
    </div>
  );
}

/** The editor's toolbar: formatting, highlighting, verses and tags, find, how the save went, and Ask.
 *  Its buttons keep the selection in the entry, so what they do acts on it. */
function Toolbar({
  reading,
  cmd,
  highlight,
  remember,
  hlLast,
  names,
  setHlAt,
  setVerseAt,
  setLinkAt,
  onTag,
  onFind,
  saved,
  err,
  canAsk,
  ask,
  setAsk,
}: {
  reading: boolean;
  cmd: (c: string, v?: string) => void;
  highlight: (c: HlColor) => void;
  /** Keeps the selection, for a popover that takes the focus. */
  remember: () => void;
  hlLast: HlColor;
  names: Partial<Record<HlColor, string>> | undefined;
  setHlAt: (r: DOMRect) => void;
  setVerseAt: (r: DOMRect) => void;
  setLinkAt: (r: DOMRect) => void;
  onTag: (r: DOMRect) => void;
  onFind: () => void;
  saved: string;
  err: string | null;
  canAsk: boolean;
  ask: boolean;
  setAsk: (a: boolean) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-disabled={reading}
      title={reading ? "Being read aloud: stop or close the player to edit" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "8px 20px",
        borderBottom: "1px solid var(--border)",
        ...(reading ? { opacity: 0.45, pointerEvents: "none" } : {}),
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      <button
        className="ibtn"
        type="button"
        aria-label="Heading"
        title="Heading"
        style={{ font: "600 14px var(--display)", color: "var(--text)" }}
        onClick={() => cmd("formatBlock", "h3")}
      >
        H
      </button>
      <button
        className="ibtn"
        type="button"
        aria-label="Bold"
        title="Bold ⌘B"
        style={{ fontWeight: 700, color: "var(--text)" }}
        onClick={() => cmd("bold")}
      >
        B
      </button>
      <button
        className="ibtn"
        type="button"
        aria-label="Italic"
        title="Italic ⌘I"
        style={{ fontStyle: "italic", fontFamily: "var(--serif)", color: "var(--text)" }}
        onClick={() => cmd("italic")}
      >
        I
      </button>
      <button
        className="ibtn"
        type="button"
        aria-label={`Highlight: ${hlLabel(hlLast, names)}`}
        title={`Highlight (${hlLabel(hlLast, names)})`}
        style={{ flexDirection: "column", gap: 1, color: "var(--text)" }}
        onClick={() => highlight(hlLast)}
      >
        <Icon name="highlight" />
        <span style={{ width: 14, height: 3, borderRadius: 2, background: HL_DOT[hlLast] }} />
      </button>
      <button
        className="ibtn"
        type="button"
        aria-label="Highlight colour"
        title="Highlight colour"
        style={{ width: 16, marginLeft: -2 }}
        onClick={(e) => {
          remember();
          setHlAt(e.currentTarget.getBoundingClientRect());
        }}
      >
        <Icon name="down" size={11} />
      </button>
      <HighlightsButton />
      <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
      <button className="ibtn" type="button" aria-label="Bulleted list" onClick={() => cmd("insertUnorderedList")}>
        <Icon name="list" />
      </button>
      <button className="ibtn" type="button" aria-label="Numbered list" onClick={() => cmd("insertOrderedList")}>
        <Icon name="olist" />
      </button>
      <button className="ibtn" type="button" aria-label="Quote" onClick={() => cmd("formatBlock", "blockquote")}>
        <Icon name="quote" />
      </button>
      <button
        className="ibtn"
        type="button"
        aria-label="Plain paragraph"
        title="Plain paragraph"
        onClick={() => cmd("formatBlock", "p")}
        style={{ fontSize: 12, color: "var(--text)" }}
      >
        ¶
      </button>
      <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
      <button
        className="btn small"
        type="button"
        style={{ border: 0 }}
        onClick={(e) => {
          remember();
          setVerseAt(e.currentTarget.getBoundingClientRect());
        }}
      >
        <Icon name="read" />
        Insert verse
      </button>
      <button className="btn small" type="button" style={{ border: 0 }} onClick={(e) => setLinkAt(e.currentTarget.getBoundingClientRect())}>
        <Icon name="link" />
        Link verse
      </button>
      <button className="btn small" type="button" style={{ border: 0 }} onClick={(e) => onTag(e.currentTarget.getBoundingClientRect())}>
        <Icon name="plus" />
        Tag
      </button>
      <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
      <button className="ibtn" type="button" aria-label="Find and replace" title="Find ⌘F · Replace ⌥⌘F" onClick={onFind}>
        <Icon name="search" />
      </button>
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: err ? "var(--bad)" : "var(--muted)",
          fontSize: 12,
          minWidth: 0,
        }}
      >
        {err
          ? err
          : saved && (
              <>
                <Icon name="check" style={{ color: "var(--good)" }} />
                {saved}
              </>
            )}
      </div>
      {canAsk && (
        <>
          <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px 0 10px" }} />
          <button className={`btn small ${ask ? "on" : ""}`} type="button" onClick={() => setAsk(!ask)}>
            <Icon name="chat" />
            Ask
          </button>
        </>
      )}
    </div>
  );
}

/** While the entry is being read aloud (or paused), it can't be edited, and the word being read
 *  is highlighted as in the readers: `boxes` drawn behind it (in `wrap`), so the editor's markup is
 *  left alone. `sync` saves what's typed as the reading starts. */
function useReadAloud(ed: React.RefObject<HTMLDivElement | null>, entryId: string, sync: () => void) {
  const app = useApp();
  const player = usePlayer();
  const ps = player.state;
  const reading = ps.on && ps.doc?.module === "journal" && ps.doc.id === entryId;
  const wrap = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<{ cls: string; left: number; top: number; width: number; height: number }[]>([]);
  useEffect(() => {
    const place = () => {
      const block = reading && ed.current ? speechBlocks(ed.current)[ps.verse - 1] : undefined;
      const o = wrap.current?.getBoundingClientRect();
      if (!block || !o) {
        setBoxes((b) => (b.length ? [] : b));
        return;
      }
      const rel = (x: DOMRect) => ({ left: x.left - o.left, top: x.top - o.top, width: x.width, height: x.height });
      if (!app.settings.highlightWords) {
        setBoxes([{ cls: "speaktint", ...rel(block.getBoundingClientRect()) }]);
        return;
      }
      const r = ps.char >= 0 ? wordRangeAt(block, ps.char) : null;
      setBoxes(r ? [...r.getClientRects()].filter((x) => x.width > 0).map((x) => ({ cls: "speakbox", ...rel(x) })) : []);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [reading, ps.verse, ps.char, app.settings.highlightWords, ed]);
  // Keep the paragraph being read in view.
  useEffect(() => {
    if (reading && !ps.paused && ed.current) scrollToThird(speechBlocks(ed.current)[ps.verse - 1]);
  }, [reading, ps.verse, ps.paused, ed]);
  // Reading starts: whatever is typed is saved, and the caret leaves the entry.
  useEffect(() => {
    if (reading) {
      sync();
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps
  // Nothing can be typed while it's read, so Space plays and pauses, as in the readers.
  useEffect(() => {
    if (!reading) return;
    const k = (e: KeyboardEvent) => {
      if (
        e.key !== " " ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target as HTMLElement).closest("input:not([readonly]), textarea, select, [contenteditable='true']")
      )
        return;
      e.preventDefault();
      player.toggle();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [reading, player]);
  return { reading, wrap, boxes };
}

/** Typing # in the entry: the tags to offer for what follows it, under the caret, and the keys that
 *  choose one there. The one picked replaces the #text and joins the entry's tags (`onPicked`). */
function useHashTag(
  ed: React.RefObject<HTMLDivElement | null>,
  entry: JournalEntry,
  themes: HlTheme[],
  tagCounts: Map<string, number>,
  index: number,
  setIndex: (i: number) => void,
  onPicked: (body: string, tags: string[]) => void,
) {
  const [hash, setHash] = useState<{ rect: DOMRect; node: Text; start: number; q: string } | null>(null);
  const dismissed = useRef<{ node: Node; start: number } | null>(null);
  const options = useMemo(() => (hash ? tagOptions(hash.q, themes, tagCounts, entry.tags) : []), [hash, themes, tagCounts, entry.tags]);
  /** After typing: a # at the start of a word, with the caret still in that word, opens the tag list. */
  const check = () => {
    const s = window.getSelection();
    const n = s?.anchorNode;
    if (!s || !s.isCollapsed || !n || n.nodeType !== Node.TEXT_NODE || !ed.current?.contains(n)) {
      if (hash) setHash(null);
      return;
    }
    const m = (n.textContent || "").slice(0, s.anchorOffset).match(/(?:^|\s)#([\p{L}\p{N}-]*)$/u);
    if (!m) {
      if (hash) setHash(null);
      dismissed.current = null;
      return;
    }
    const start = s.anchorOffset - m[1].length - 1;
    if (dismissed.current?.node === n && dismissed.current.start === start) return;
    const r = document.createRange();
    r.setStart(n, start);
    r.setEnd(n, start + 1);
    if (!hash || hash.node !== n || hash.start !== start) setIndex(0);
    setHash({ rect: r.getBoundingClientRect(), node: n as Text, start, q: m[1] });
  };
  const pick = (t: string) => {
    if (!hash) return;
    const s = window.getSelection();
    const end = s?.anchorNode === hash.node ? s.anchorOffset : hash.start + 1 + hash.q.length;
    const r = document.createRange();
    r.setStart(hash.node, hash.start);
    r.setEnd(hash.node, Math.min(end, hash.node.length));
    ed.current?.focus();
    s?.removeAllRanges();
    s?.addRange(r);
    document.execCommand("delete");
    setHash(null);
    onPicked(ed.current ? htmlToMd(ed.current) : entry.body, entry.tags.includes(t) ? entry.tags : [...entry.tags, t]);
  };
  /** The list's keys, while it's open: true when the key was its. */
  const onKey = (e: React.KeyboardEvent) => {
    if (hash && options.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setIndex((index + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      return true;
    }
    if (hash && (e.key === "Enter" || e.key === "Tab") && options[index]) {
      e.preventDefault();
      pick(options[index].tag);
      return true;
    }
    return false;
  };
  const picker = hash && (
    <TagPicker
      anchor={hash.rect}
      options={options}
      index={index}
      onIndex={setIndex}
      onClose={() => {
        dismissed.current = { node: hash.node, start: hash.start };
        setHash(null);
      }}
      onPick={pick}
    />
  );
  return { check, onKey, picker };
}
