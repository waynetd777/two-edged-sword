// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, JournalEntry } from "./api";
import { AskPanel, useAskOpener } from "./Ask";
import { fmtRef, parseRef, Ref } from "./bible";
import { plainText, wordRangeAt } from "./esword";
import { Icon } from "./icons";
import { HL_PAINT, htmlToMd, mdPlain, mdToHtml } from "./md";
import { HighlightsButton, HL, HL_DOT, hlLabel } from "./Read";
import { SearchField, Topbar } from "./Shell";
import { HlColor, HlTheme, nowLocal, onFlush, themesOf, uid, useApp } from "./state";
import { ClearButton, confirmDelete, Dialog, Popover, Seg } from "./ui";
import { useAssistant } from "./assistant";
import { docModule, parseDocLabel } from "./docref";
import { useRefPreview } from "./StudyPane";
import { useSpelling } from "./spelling";
import { useFind } from "./find";
import { journalParas, speechBlocks, useListenKey, usePlayer } from "./speech";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (s: string) => {
  const d = new Date(s);
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

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
  focus = false,
  setFocus = () => {},
}: {
  openPalette: () => void;
  focus?: boolean;
  setFocus?: (f: boolean) => void;
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

  // Once the journal (reloaded after a save, or after a change in the vault) has this entry and no
  // save is waiting, show the file's copy, so a change made elsewhere appears.
  useEffect(() => {
    if (draft && !pendingSave.current && app.journal.some((e) => e.id === draft.id)) setDraft(null);
  }, [app.journal]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => {
    const all = draft && !app.journal.some((e) => e.id === draft.id) ? [draft, ...app.journal] : app.journal;
    const f = filter.toLowerCase();
    return all.filter((e) => (!tag || e.tags.includes(tag)) && (!f || hay(e).includes(f)));
  }, [app.journal, draft, filter, tag]);
  // The filter's tags, most used first; past the first five they wait behind "more" (the chosen one always shows).
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of app.journal) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.keys()].sort((a, b) => m.get(b)! - m.get(a)! || a.localeCompare(b));
  }, [app.journal]);
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
      try {
        await app.saveEntry({ ...e, title: e.title.trim() || "Untitled" });
        setSaved(
          `Saved to Me. Journal - ${e.created.slice(0, 7)}.md · ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
        );
        setErr(null);
      } catch (x) {
        setErr(String(x));
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
    if (app.journal.some((e) => e.id === cur.id)) await app.deleteEntry(cur.id);
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
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus && !e.defaultPrevented) setFocus(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [focus, setFocus]);

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
              const m = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
}: {
  entry: JournalEntry;
  onChange: (p: Partial<JournalEntry>) => void;
  saved: string;
  err: string | null;
  onDelete: () => void;
  onExport: () => void;
  listed: JournalEntry[];
  listedLabel: string;
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
  // An Ask about the entry gets its first Bible reference as its passage (with the library's
  // material on it) and the rest of the journal to search.
  const passage = useMemo(() => entry.verses.map((v) => parseRef(v)).find((r): r is Ref => !!r) ?? null, [entry.verses]);
  const others = useMemo(() => app.journal.filter((e) => e.id !== entry.id), [app.journal, entry.id]);
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
  // Typing # in the entry offers tags; the one picked joins the entry's tags and the #text goes.
  const [hash, setHash] = useState<{ rect: DOMRect; node: Text; start: number; q: string } | null>(null);
  const dismissed = useRef<{ node: Node; start: number } | null>(null);
  const themes = useMemo(() => themesOf(app.settings.hlNames), [app.settings.hlNames]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of app.journal) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [app.journal]);
  const hashOptions = useMemo(() => (hash ? tagOptions(hash.q, themes, tagCounts, entry.tags) : []), [hash, themes, tagCounts, entry.tags]);
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
  const named = HL.some((c) => names?.[c]?.trim());
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
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = `<blockquote class="verse" dir="auto">${esc(txt)}<cite>${esc(fmtRef(r))} ${esc(app.mod("bible", bible)?.abbrev ?? "")}</cite></blockquote><p><br></p>`;
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
    if (hash && hashOptions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setTagIdx((tagIdx + (e.key === "ArrowDown" ? 1 : -1) + hashOptions.length) % hashOptions.length);
      return;
    }
    if (hash && (e.key === "Enter" || e.key === "Tab") && hashOptions[tagIdx]) {
      e.preventDefault();
      pickHash(hashOptions[tagIdx].tag);
      return;
    }
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
  /** After typing: a # at the start of a word, with the caret still in that word, opens the tag list. */
  const checkHash = () => {
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
    if (!hash || hash.node !== n || hash.start !== start) setTagIdx(0);
    setHash({ rect: r.getBoundingClientRect(), node: n as Text, start, q: m[1] });
  };
  const pickHash = (t: string) => {
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
    const body = ed.current ? htmlToMd(ed.current) : entry.body;
    shown.current = body;
    onChange({ body, tags: entry.tags.includes(t) ? entry.tags : [...entry.tags, t] });
  };
  const words = mdPlain(entry.body).split(/\s+/).filter(Boolean).length;

  // While the entry is being read aloud (or paused), it can't be edited, and the word being read
  // is highlighted as in the readers: boxes drawn behind it, so the editor's markup is left alone.
  const player = usePlayer();
  const ps = player.state;
  const reading = ps.on && ps.doc?.module === "journal" && ps.doc.id === entry.id;
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
  }, [reading, ps.verse, ps.char, app.settings.highlightWords]);
  // Keep the paragraph being read in view.
  useEffect(() => {
    if (reading && !ps.paused && ed.current)
      speechBlocks(ed.current)[ps.verse - 1]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [reading, ps.verse, ps.paused]);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "var(--panel)", position: "relative" }}>
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
        <button
          className="btn small"
          type="button"
          style={{ border: 0 }}
          onClick={(e) => setLinkAt(e.currentTarget.getBoundingClientRect())}
        >
          <Icon name="link" />
          Link verse
        </button>
        <button
          className="btn small"
          type="button"
          style={{ border: 0 }}
          onClick={(e) => {
            setTagIdx(0);
            setTagAt(e.currentTarget.getBoundingClientRect());
          }}
        >
          <Icon name="plus" />
          Tag
        </button>
        <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
        <button
          className="ibtn"
          type="button"
          aria-label="Find and replace"
          title="Find ⌘F · Replace ⌥⌘F"
          onClick={() => find.start("find")}
        >
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
            {boxes.map((b, j) => (
              <span key={j} className={b.cls} style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />
            ))}
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
                checkHash();
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
              style={{ font: "400 17px/1.7 var(--serif)", outline: "none", minHeight: 300 }}
            />
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
        {spell.menu && (
          <Popover anchor={spell.menu.rect} onClose={spell.closeMenu} width={spell.menu.grammar !== undefined ? 280 : 220}>
            <div style={{ padding: 6, display: "flex", flexDirection: "column" }}>
              {spell.menu.grammar !== undefined && (
                <span className="n" style={{ padding: "6px 10px", lineHeight: 1.4 }}>
                  {spell.menu.grammar || "Possible grammar problem"}
                </span>
              )}
              {spell.menu.was && (
                <button className="opt" type="button" onClick={() => spell.choose(spell.menu!.was!)}>
                  Change back to “{spell.menu.was}”
                </button>
              )}
              {spell.menu.guesses.map((g) => (
                <button key={g} className="opt" type="button" style={{ fontWeight: 600 }} onClick={() => spell.choose(g)}>
                  {g}
                </button>
              ))}
              {!spell.menu.was && !spell.menu.guesses.length && spell.menu.grammar === undefined && (
                <span className="n" style={{ padding: "6px 10px" }}>
                  No suggestions
                </span>
              )}
              {!spell.menu.was && (
                <>
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                  {spell.menu.grammar === undefined && (
                    <button className="opt" type="button" onClick={spell.learn}>
                      Add “{spell.menu.word}” to dictionary
                    </button>
                  )}
                  <button className="opt" type="button" onClick={spell.ignore}>
                    Ignore
                  </button>
                </>
              )}
            </div>
          </Popover>
        )}
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
        <div
          className="card"
          style={{
            position: "absolute",
            right: 20,
            bottom: 60,
            width: 380,
            zIndex: 20,
            boxShadow: "0 14px 40px var(--shadow)",
            borderRadius: 12,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 0", flexWrap: "wrap" }}>
            <Seg
              value={scope}
              options={[
                ["entry", "This entry"],
                ["journal", "Whole journal"],
              ]}
              onChange={setScope}
            />
            <button
              className="ibtn"
              type="button"
              aria-label="Close"
              title="Close"
              style={{ marginLeft: "auto" }}
              onClick={() => setAsk(false)}
            >
              <Icon name="x" />
            </button>
            {scope === "entry" && picked && (
              <span className="chip" style={{ maxWidth: "100%", cursor: "default" }} title={picked}>
                <span className="t" style={{ minWidth: 0 }}>
                  On “{picked}”
                </span>
                <button
                  className="ibtn"
                  type="button"
                  aria-label="Ask about the whole entry"
                  title="Ask about the whole entry"
                  style={{ width: 16, height: 16 }}
                  onClick={() => setPicked("")}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            )}
            {scope === "journal" && (
              <span className="n" style={{ flexBasis: "100%" }}>
                Searches {listedLabel} ({listed.length} {listed.length === 1 ? "entry" : "entries"}).
              </span>
            )}
          </div>
          {scope === "entry" ? (
            <AskPanel
              key={`entry|${entry.id}`}
              source="Journal"
              opened={{ entry: entry.id }}
              label={entry.title || "this entry"}
              style={{ border: 0, background: "transparent", boxShadow: "none" }}
              passage={passage}
              journal={others}
              journalDir={(id) =>
                api.journalExport(
                  id,
                  "the whole journal",
                  app.journal.map((e) => (e.id === entry.id ? entry : e)),
                )
              }
              context={() =>
                [
                  `The user's journal entry, “${entry.title}”${entry.verses.length ? ` (on ${entry.verses.join(", ")})` : ""}${entry.tags.length ? ` #${entry.tags.join(" #")}` : ""}:\n${entry.body || "(nothing written yet)"}`,
                  picked && `They have selected this part of it and are asking about it:\n“${picked}”`,
                ]
                  .filter(Boolean)
                  .join("\n\n")
              }
              suggestions={
                picked
                  ? ["Explain this", "Suggest verses that speak to this", "Help me say this more clearly"]
                  : !entry.body.trim()
                    ? [
                        `Give me a few prompts to start writing${entry.verses.length ? ` on ${entry.verses.join(", ")}` : ""}`,
                        ...(entry.verses.length ? [] : ["Suggest a verse to reflect on today"]),
                        "Give me questions to reflect on",
                      ]
                    : [
                        "Suggest cross-references I haven't linked",
                        "Give me questions to reflect on",
                        ...(others.length ? ["What else in my journal connects with this?"] : []),
                      ]
              }
              onInsert={insertAnswer}
            />
          ) : (
            <AskPanel
              key={`journal|${listedLabel}`}
              source="Journal"
              label={listedLabel}
              style={{ border: 0, background: "transparent", boxShadow: "none" }}
              journalDir={(id) =>
                api.journalExport(
                  id,
                  listedLabel,
                  listed.map((e) => (e.id === entry.id ? entry : e)),
                )
              }
              context={() => `The entry they have open is “${entry.title || "Untitled"}” (${entry.created.slice(0, 10)}).`}
              suggestions={[
                "What themes keep coming back in my journal?",
                "Which verses do I return to most, and what have I said about them?",
                "How has my thinking changed over time?",
                "What have I been praying about lately?",
              ]}
              onInsert={insertAnswer}
            />
          )}
        </div>
      )}
      {verseAt && (
        <RefPrompt
          anchor={verseAt}
          label="Insert a verse"
          onClose={() => setVerseAt(null)}
          onSubmit={async (t) => {
            const ok = await insertVerse(t);
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
        <Popover anchor={hlAt} onClose={() => setHlAt(null)} width={named ? 260 : 290}>
          {/* With names for the colours (Settings › Highlights), a list; without, a row of dots. */}
          <div
            className="hlpick"
            style={{
              padding: 8,
              display: "flex",
              flexDirection: named ? "column" : "row",
              alignItems: named ? "stretch" : "center",
              gap: named ? 2 : 8,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {HL.map((c) => {
              const pick = () => {
                setHlAt(null);
                app.set({ journalHighlight: c });
                highlight(c, true);
              };
              const dot = (
                <span
                  className="dot"
                  style={{ background: HL_DOT[c], outline: c === hlLast ? "2px solid var(--text)" : undefined, flexShrink: 0 }}
                />
              );
              return named ? (
                <button
                  key={c}
                  type="button"
                  className="opt"
                  aria-label={`Highlight: ${hlLabel(c, names)}`}
                  title={hlLabel(c, names)}
                  style={{ background: "none", border: 0, color: "var(--text)", padding: "2px 4px", textAlign: "left" }}
                  onClick={pick}
                >
                  {dot}
                  {hlLabel(c, names)}
                </button>
              ) : (
                <button
                  key={c}
                  type="button"
                  className="dot"
                  aria-label={`Highlight ${c}`}
                  title={hlLabel(c, names)}
                  style={{ background: HL_DOT[c], outline: c === hlLast ? "2px solid var(--text)" : undefined }}
                  onClick={pick}
                />
              );
            })}
            <button
              className="btn small"
              type="button"
              style={named ? { marginTop: 4, alignSelf: "flex-start" } : { marginLeft: "auto" }}
              title="Take highlighting off the selection"
              onClick={() => {
                setHlAt(null);
                highlight(null);
              }}
            >
              None
            </button>
          </div>
        </Popover>
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
      {hash && (
        <TagPicker
          anchor={hash.rect}
          options={hashOptions}
          index={tagIdx}
          onIndex={setTagIdx}
          onClose={() => {
            dismissed.current = { node: hash.node, start: hash.start };
            setHash(null);
          }}
          onPick={pickHash}
        />
      )}
    </div>
  );
}

type TagOption = { tag: string; name?: string; colour?: HlColor; add?: boolean };
/** Tags to offer for what has been typed: the highlight themes first, then the journal's own tags,
 *  most used first, leaving out those the entry has; and a new tag when nothing matches exactly. */
function tagOptions(q: string, themes: HlTheme[], counts: Map<string, number>, has: string[]): TagOption[] {
  const x = q.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
  const fits = (t: string, name = "") => !x || t.includes(x) || name.toLowerCase().includes(x.replace(/-/g, " "));
  const themed = themes
    .filter((t) => !has.includes(t.tag) && fits(t.tag, t.name))
    .map((t) => ({ tag: t.tag, name: t.name, colour: t.colour }));
  const own = [...counts.entries()]
    .filter(([t]) => !has.includes(t) && !themes.some((h) => h.tag === t) && fits(t))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => ({ tag }));
  const all: TagOption[] = [...themed, ...own].slice(0, 12);
  if (x && !all.some((o) => o.tag === x) && !has.includes(x)) all.push({ tag: x, add: true });
  return all;
}

/** The list of tags to pick from: under the caret after # in the entry, or with its own box (the Tag button). */
function TagPicker({
  anchor,
  options,
  index,
  onIndex,
  onPick,
  onClose,
  query,
  onQuery,
}: {
  anchor: DOMRect;
  options: TagOption[];
  index: number;
  onIndex: (i: number) => void;
  onPick: (tag: string) => void;
  onClose: () => void;
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const box = onQuery !== undefined;
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      onIndex((index + (e.key === "ArrowDown" ? 1 : -1) + options.length) % Math.max(1, options.length));
    } else if (e.key === "Enter" && options[index]) {
      e.preventDefault();
      onPick(options[index].tag);
    }
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div
        style={{ padding: 6, display: "flex", flexDirection: "column", gap: 1 }}
        onMouseDown={(e) => {
          if (!box) e.preventDefault();
        }}
      >
        {box && (
          <label className="field" style={{ margin: "2px 2px 6px" }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                onQuery!(e.target.value);
                onIndex(0);
              }}
              onKeyDown={keys}
              placeholder="Tag, e.g. new-birth"
              aria-label="Add a tag"
            />
          </label>
        )}
        {options.length === 0 && (
          <span className="hint" style={{ padding: "4px 6px" }}>
            Type a tag
          </span>
        )}
        {options.map((o, i) => (
          <button
            key={o.tag}
            type="button"
            className="opt"
            title={o.name ? `#${o.tag}` : undefined}
            aria-selected={i === index}
            onMouseEnter={() => onIndex(i)}
            onClick={() => onPick(o.tag)}
            style={{
              background: i === index ? "var(--accentsoft)" : "none",
              border: 0,
              borderRadius: 6,
              color: "var(--text)",
              padding: "3px 6px",
              textAlign: "left",
            }}
          >
            {o.colour ? (
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: HL_DOT[o.colour], flexShrink: 0 }} />
            ) : (
              <span style={{ width: 10, flexShrink: 0, color: "var(--muted)", textAlign: "center" }}>#</span>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {o.add ? (
                <>
                  Add <b>#{o.tag}</b>
                </>
              ) : (
                (o.name ?? o.tag)
              )}
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

function RefPrompt({
  anchor,
  label,
  placeholder = "e.g. jn 3 8 or Rom 8:28-30",
  onClose,
  onSubmit,
}: {
  anchor: DOMRect;
  label: string;
  placeholder?: string;
  onClose: () => void;
  onSubmit: (t: string) => Promise<boolean>;
}) {
  const [t, setT] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <form
        style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBad(!(await onSubmit(t)));
        }}
      >
        <span className="label">{label}</span>
        <label className="field">
          <input
            autoFocus
            value={t}
            onChange={(e) => {
              setT(e.target.value);
              setBad(false);
            }}
            placeholder={placeholder}
            aria-label={label}
          />
        </label>
        {bad && (
          <span className="err" style={{ fontSize: 12 }}>
            That isn't a reference I recognise.
          </span>
        )}
      </form>
    </Popover>
  );
}

function ExportDialog({ current, onClose }: { current: JournalEntry | null; onClose: () => void }) {
  const app = useApp();
  const [what, setWhat] = useState<"one" | "month" | "tag" | "all">(current ? "one" : "all");
  const [fmt, setFmt] = useState<"pdf" | "md">("pdf");
  const [withVerses, setWithVerses] = useState(true);
  const [perPage, setPerPage] = useState(false);
  const [tag, setTag] = useState(current?.tags[0] ?? "");
  const month = current?.created.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
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
  const go = async () => {
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
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    root.innerHTML = parts
      .map(
        ({ e, verses }) =>
          `<section class="${perPage ? "pp" : ""}"><div class="pd">${esc(longDate(e.created))}${e.verses.length ? " · " + esc(e.verses.join(", ")) : ""}</div><h1>${esc(e.title)}</h1>${verses ? mdToHtml(verses, false) : ""}${mdToHtml(e.body, false)}</section>`,
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
            Entries from {MONTHS[+month.slice(5, 7) - 1]} {month.slice(0, 4)}
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
