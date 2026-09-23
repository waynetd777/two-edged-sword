import { useEffect, useMemo, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, JournalEntry } from "./api";
import { AskPanel } from "./Ask";
import { fmtRef, parseRef } from "./bible";
import { plainText } from "./esword";
import { Icon } from "./icons";
import { htmlToMd, mdPlain, mdToHtml } from "./md";
import { Topbar } from "./Shell";
import { nowLocal, uid, useApp } from "./state";
import { Dialog, Popover, Seg } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (s: string) => {
  const d = new Date(s);
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

export function JournalScreen() {
  const app = useApp();
  const [selId, setSelId] = useState<string | null>(app.journal[0]?.id ?? null);
  const [draft, setDraft] = useState<JournalEntry | null>(null);
  const [filter, setFilter] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [ask, setAsk] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  // A seed from elsewhere: open an entry, or start one on the given verses.
  useEffect(() => {
    const s = app.journalSeed;
    if (!s) return;
    app.clearSeed();
    if (s.openId) { setSelId(s.openId); return; }
    const e: JournalEntry = { id: uid(), title: s.title ?? "", created: nowLocal(), updated: nowLocal(), verses: s.verses ?? [], tags: s.tags ?? [], body: s.body ?? "" };
    setDraft(e); setSelId(e.id);
  }, [app.journalSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => {
    const all = draft && !app.journal.some((e) => e.id === draft.id) ? [draft, ...app.journal] : app.journal;
    const f = filter.toLowerCase();
    return all.filter((e) => (!tag || e.tags.includes(tag)) && (!f || (e.title + " " + e.tags.join(" ") + " " + e.verses.join(" ") + " " + mdPlain(e.body)).toLowerCase().includes(f)));
  }, [app.journal, draft, filter, tag]);
  const tags = useMemo(() => Array.from(new Set(app.journal.flatMap((e) => e.tags))).sort(), [app.journal]);
  const cur = (draft && draft.id === selId ? draft : app.journal.find((e) => e.id === selId)) ?? null;

  const persist = (e: JournalEntry) => {
    setDraft(e);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!e.title.trim() && !e.body.trim()) return; // nothing to keep yet
      try {
        await app.saveEntry({ ...e, title: e.title.trim() || "Untitled" });
        setSaved(`Saved to ${e.created.slice(0, 7)}.md · ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`);
        setErr(null);
      } catch (x) { setErr(String(x)); }
    }, 600);
  };
  const edit = (patch: Partial<JournalEntry>) => { if (cur) persist({ ...cur, ...patch, updated: nowLocal() }); };
  const create = () => { const e: JournalEntry = { id: uid(), title: "", created: nowLocal(), updated: nowLocal(), verses: [], tags: [], body: "" }; setDraft(e); setSelId(e.id); };
  const remove = async () => {
    if (!cur) return;
    if (!window.confirm(`Delete “${cur.title || "Untitled"}”? This can't be undone.`)) return;
    if (app.journal.some((e) => e.id === cur.id)) await app.deleteEntry(cur.id);
    setDraft(null);
    setSelId(app.journal.find((e) => e.id !== cur.id)?.id ?? null);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.metaKey && e.key === "n") { create(); e.preventDefault(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  let lastMonth = "";
  return (
    <div className="main">
      <Topbar right={<button className={`btn ${ask ? "on" : ""}`} type="button" onClick={() => setAsk(!ask)}><Icon name="chat" />Ask Claude</button>} />
      <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: "320px minmax(0,1fr)" }}>
        <div style={{ borderRight: "1px solid var(--border)", padding: "14px 12px 0", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
            <h1 style={{ margin: 0, font: "500 26px/1.2 var(--display)" }}>Journal</h1>
            <button className="btn primary" type="button" style={{ marginLeft: "auto" }} onClick={create}><Icon name="plus" />New entry<span style={{ opacity: 0.75 }}>⌘N</span></button>
          </div>
          <label className="field" style={{ margin: "0 4px" }}><Icon name="search" /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter entries, tags or verses" aria-label="Filter entries" /></label>
          {tags.length > 0 && <div style={{ display: "flex", gap: 5, padding: "0 4px", flexWrap: "wrap" }}><button type="button" className={`chip ${!tag ? "on" : ""}`} onClick={() => setTag(null)}>All</button>{tags.slice(0, 8).map((t) => <button key={t} type="button" className={`chip ${tag === t ? "on" : ""}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}</div>}
          <div className="scroll" style={{ flexGrow: 1, paddingBottom: 20 }}>
            {!entries.length && <div className="empty">{app.journal.length ? "Nothing matches." : "No entries yet. Start one with New entry, or press N on a verse."}</div>}
            {entries.map((e) => {
              const d = new Date(e.created);
              const m = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
              const head = m !== lastMonth ? <div className="label" style={{ padding: "10px 12px 4px" }}>{m}</div> : null;
              lastMonth = m;
              return (
                <div key={e.id}>
                  {head}
                  <button type="button" className="bm" onClick={() => setSelId(e.id)} style={{ flexDirection: "column", alignItems: "flex-start", gap: 3, padding: "10px 12px", background: e.id === selId ? "var(--accentsoft)" : undefined, boxShadow: e.id === selId ? "inset 0 0 0 1px var(--ring)" : undefined }}>
                    <b style={{ fontSize: 13.5 }}>{e.title || "Untitled"}</b>
                    <span className="n">{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}{e.verses.length ? ` · ${e.verses.join(", ")}` : ""}</span>
                    <span style={{ font: "400 13.5px/1.45 var(--serif)", color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{mdPlain(e.body).slice(0, 180)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {cur ? <Editor key={cur.id} entry={cur} onChange={edit} saved={saved} err={err} onDelete={remove} onExport={() => setExporting(true)} ask={ask} /> : <div className="empty">Choose an entry, or start a new one.</div>}
      </div>
      {exporting && <ExportDialog current={cur} onClose={() => setExporting(false)} />}
    </div>
  );
}

function Editor({ entry, onChange, saved, err, onDelete, onExport, ask }: { entry: JournalEntry; onChange: (p: Partial<JournalEntry>) => void; saved: string; err: string | null; onDelete: () => void; onExport: () => void; ask: boolean }) {
  const app = useApp();
  const ed = useRef<HTMLDivElement>(null);
  const [verseAt, setVerseAt] = useState<DOMRect | null>(null);
  const [linkAt, setLinkAt] = useState<DOMRect | null>(null);
  const [tagAt, setTagAt] = useState<DOMRect | null>(null);
  const saved_range = useRef<Range | null>(null);
  useEffect(() => {
    // Every line is a <p>, so Enter, lists and quotes act on one line at a time.
    document.execCommand("defaultParagraphSeparator", false, "p");
    if (ed.current) ed.current.innerHTML = mdToHtml(entry.body, false) || "<p><br></p>";
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sync = () => { if (ed.current) onChange({ body: htmlToMd(ed.current) }); };
  const cmd = (c: string, v?: string) => { ed.current?.focus(); document.execCommand(c, false, v); sync(); };
  const remember = () => { const s = window.getSelection(); if (s && s.rangeCount && ed.current?.contains(s.anchorNode)) saved_range.current = s.getRangeAt(0).cloneRange(); };
  const insertVerse = async (text: string) => {
    const r = parseRef(text);
    if (!r) return false;
    const bible = app.settings.bible;
    const [p] = await api.passages(bible, [{ book: r.book, chapter: r.chapter, from: r.verse ?? 1, to: r.to ?? r.verse ?? 999 }]);
    if (!p.verses.length) return false;
    const txt = p.verses.map((v) => plainText(v.text)).join(" ");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = `<blockquote class="verse">${esc(txt)}<cite>${esc(fmtRef(r))} ${esc(app.mod("bible", bible)?.abbrev ?? "")}</cite></blockquote><p><br></p>`;
    ed.current?.focus();
    if (saved_range.current) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(saved_range.current); }
    document.execCommand("insertHTML", false, html);
    if (!entry.verses.includes(fmtRef(r))) onChange({ verses: [...entry.verses, fmtRef(r)], body: htmlToMd(ed.current!) }); else sync();
    return true;
  };
  // The webview has no Format menu, so ⌘B and ⌘I are handled here; and Markdown habits work:
  // "- ", "1. ", "> " and "### " at the start of a line become a list, quote or heading.
  const keys = (e: React.KeyboardEvent) => {
    if (e.metaKey && (e.key === "b" || e.key === "i")) { e.preventDefault(); cmd(e.key === "b" ? "bold" : "italic"); return; }
    const sel = window.getSelection();
    const node = sel?.anchorNode ?? null;
    const el = (node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null));
    const block = el?.closest("p, div, li, h3, blockquote") as HTMLElement | null;
    if (e.key === "Enter" && !e.shiftKey && block && block !== ed.current) {
      // Enter on an empty line in a quote leaves the quote; after a heading comes a paragraph.
      const quote = el?.closest("blockquote");
      if (quote && !(block.textContent || "").trim()) { e.preventDefault(); cmd("formatBlock", "p"); return; }
      if (el?.closest("h3")) { window.setTimeout(() => { const n = window.getSelection()?.anchorNode; const b = (n?.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement))?.closest("h3"); if (b) cmd("formatBlock", "p"); }, 0); }
      return;
    }
    if (e.key !== " " || !sel || !node || node.nodeType !== Node.TEXT_NODE || !block || block === ed.current) return;
    const before = (node.textContent || "").slice(0, sel.anchorOffset);
    if ((block.textContent || "").trim() !== before.trim()) return;
    const map: Record<string, [string, string?]> = { "-": ["insertUnorderedList"], "*": ["insertUnorderedList"], "1.": ["insertOrderedList"], ">": ["formatBlock", "blockquote"], "#": ["formatBlock", "h3"], "##": ["formatBlock", "h3"], "###": ["formatBlock", "h3"] };
    const m = map[before.trim()];
    if (!m) return;
    e.preventDefault();
    cmd(m[0], m[1]);
    for (let i = 0; i < before.length; i++) document.execCommand("delete");
    sync();
  };
  const words = mdPlain(entry.body).split(/\s+/).filter(Boolean).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "var(--panel)", position: "relative" }}>
      <div role="toolbar" aria-label="Formatting" style={{ display: "flex", alignItems: "center", gap: 2, padding: "8px 20px", borderBottom: "1px solid var(--border)" }} onMouseDown={(e) => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
        <button className="ibtn" type="button" aria-label="Heading" title="Heading" style={{ font: "600 14px var(--display)", color: "var(--text)" }} onClick={() => cmd("formatBlock", "h3")}>H</button>
        <button className="ibtn" type="button" aria-label="Bold" title="Bold ⌘B" style={{ fontWeight: 700, color: "var(--text)" }} onClick={() => cmd("bold")}>B</button>
        <button className="ibtn" type="button" aria-label="Italic" title="Italic ⌘I" style={{ fontStyle: "italic", fontFamily: "var(--serif)", color: "var(--text)" }} onClick={() => cmd("italic")}>I</button>
        <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
        <button className="ibtn" type="button" aria-label="Bulleted list" onClick={() => cmd("insertUnorderedList")}><Icon name="list" /></button>
        <button className="ibtn" type="button" aria-label="Numbered list" onClick={() => cmd("insertOrderedList")}><Icon name="olist" /></button>
        <button className="ibtn" type="button" aria-label="Quote" onClick={() => cmd("formatBlock", "blockquote")}><Icon name="quote" /></button>
        <button className="ibtn" type="button" aria-label="Plain paragraph" title="Plain paragraph" onClick={() => cmd("formatBlock", "p")} style={{ fontSize: 12, color: "var(--text)" }}>¶</button>
        <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
        <button className="btn small" type="button" style={{ border: 0 }} onClick={(e) => { remember(); setVerseAt(e.currentTarget.getBoundingClientRect()); }}><Icon name="read" />Insert verse</button>
        <button className="btn small" type="button" style={{ border: 0 }} onClick={(e) => setLinkAt(e.currentTarget.getBoundingClientRect())}><Icon name="link" />Link verse</button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: err ? "var(--bad)" : "var(--muted)", fontSize: 12 }}>
          {err ? err : saved && <><Icon name="check" style={{ color: "var(--good)" }} />{saved}</>}
        </div>
      </div>
      <div className="scroll" style={{ flexGrow: 1, padding: "28px 0 40px" }}>
        <article style={{ maxWidth: 700, margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 14, minHeight: "100%" }} onClick={(e) => { if (e.target === e.currentTarget) ed.current?.focus(); }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="label">{longDate(entry.created)}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
              {entry.tags.map((t) => <button key={t} type="button" className="chip" title="Remove tag" onClick={() => onChange({ tags: entry.tags.filter((x) => x !== t) })}>#{t}<Icon name="x" size={11} /></button>)}
              <button type="button" className="chip" aria-label="Add tag" onClick={(e) => setTagAt(e.currentTarget.getBoundingClientRect())}>+ tag</button>
            </span>
          </div>
          <input value={entry.title} autoFocus={!entry.title} onChange={(e) => onChange({ title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ed.current?.focus(); } }} placeholder="Title" aria-label="Title" style={{ border: 0, outline: 0, background: "transparent", font: "500 36px/1.15 var(--display)", color: "var(--text)", padding: 0 }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="n">{entry.verses.length ? "Linked to" : "No verses linked"}</span>
            {entry.verses.map((v) => {
              const r = parseRef(v);
              return (
                <span key={v} className="rchip" style={{ gap: 6 }}>
                  <a onClick={() => r && app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read")}>{v}</a>
                  <button className="ibtn" type="button" aria-label={`Unlink ${v}`} style={{ width: 16, height: 16 }} onClick={() => onChange({ verses: entry.verses.filter((x) => x !== v) })}><Icon name="x" size={11} /></button>
                </span>
              );
            })}
          </div>
          <div ref={ed} className={`md editor selectable ${entry.body.trim() ? "" : "blank"}`} contentEditable suppressContentEditableWarning onInput={sync} onBlur={() => { remember(); sync(); }} onKeyUp={remember} onMouseUp={remember} onKeyDown={keys}
            onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
            data-placeholder="Write here…" style={{ font: "400 17px/1.7 var(--serif)", outline: "none", minHeight: 300, textWrap: "pretty" }} />
        </article>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderTop: "1px solid var(--border)", color: "var(--muted)", fontSize: 12 }}>
        <span>{words} word{words === 1 ? "" : "s"}</span>
        {entry.verses.length > 0 && <><span>·</span><span>Shows beside {entry.verses.join(", ")} in Read</span></>}
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={() => revealItemInDir(`${app.journalDir}/${entry.created.slice(0, 7)}.md`).catch(() => app.toast("Save the entry first"))}><Icon name="finder" />Show in Finder</button>
        <button className="btn" type="button" onClick={onExport}><Icon name="export" />Export…</button>
        <button className="ibtn" type="button" aria-label="Delete entry" title="Delete entry" onClick={onDelete}><Icon name="trash" /></button>
      </div>
      {ask && (
        <div style={{ position: "absolute", right: 20, bottom: 60, width: 360, zIndex: 20, boxShadow: "0 14px 40px var(--shadow)", borderRadius: 12 }}>
          <AskPanel source="Journal" about={entry.title || "this entry"} context={() => `The user's journal entry, “${entry.title}”${entry.verses.length ? ` (on ${entry.verses.join(", ")})` : ""}:\n${entry.body}`}
            suggestions={["Suggest cross-references I haven't linked", "Give me questions to reflect on", ...(app.journal.length > 1 ? ["What else in my journal connects with this?"] : [])]} />
        </div>
      )}
      {verseAt && <RefPrompt anchor={verseAt} label="Insert a verse" onClose={() => setVerseAt(null)} onSubmit={async (t) => { const ok = await insertVerse(t); if (ok) setVerseAt(null); return ok; }} />}
      {linkAt && <RefPrompt anchor={linkAt} label="Link a verse to this entry" onClose={() => setLinkAt(null)} onSubmit={async (t) => { const r = parseRef(t); if (!r) return false; const s = fmtRef(r); if (!entry.verses.includes(s)) onChange({ verses: [...entry.verses, s] }); setLinkAt(null); return true; }} />}
      {tagAt && <RefPrompt anchor={tagAt} label="Add a tag" placeholder="e.g. new-birth" onClose={() => setTagAt(null)} onSubmit={async (t) => { const x = t.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase(); if (!x) return false; if (!entry.tags.includes(x)) onChange({ tags: [...entry.tags, x] }); setTagAt(null); return true; }} />}
    </div>
  );
}

function RefPrompt({ anchor, label, placeholder = "e.g. jn 3 8 or Rom 8:28-30", onClose, onSubmit }: { anchor: DOMRect; label: string; placeholder?: string; onClose: () => void; onSubmit: (t: string) => Promise<boolean> }) {
  const [t, setT] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <form style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }} onSubmit={async (e) => { e.preventDefault(); setBad(!(await onSubmit(t))); }}>
        <span className="label">{label}</span>
        <label className="field"><input autoFocus value={t} onChange={(e) => { setT(e.target.value); setBad(false); }} placeholder={placeholder} aria-label={label} /></label>
        {bad && <span className="err" style={{ fontSize: 12 }}>That isn't a reference I recognise.</span>}
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
  const list = (what === "one" && current ? [current] : what === "month" ? app.journal.filter((e) => e.created.startsWith(month)) : what === "tag" ? app.journal.filter((e) => e.tags.includes(tag)) : app.journal).slice().sort((a, b) => a.created.localeCompare(b.created));
  const tags = Array.from(new Set(app.journal.flatMap((e) => e.tags)));

  const verseTexts = async (e: JournalEntry) => {
    if (!withVerses) return "";
    const out: string[] = [];
    for (const v of e.verses) {
      const r = parseRef(v);
      if (!r) continue;
      const [p] = await api.passages(app.settings.bible, [{ book: r.book, chapter: r.chapter, from: r.verse ?? 1, to: r.to ?? r.verse ?? 999 }]);
      out.push(`> ${p.verses.map((x) => plainText(x.text)).join(" ")}\n> — ${v} ${app.mod("bible", app.settings.bible)?.abbrev ?? ""}`);
    }
    return out.join("\n\n");
  };
  const go = async () => {
    const parts: { e: JournalEntry; verses: string }[] = [];
    for (const e of list) parts.push({ e, verses: await verseTexts(e) });
    if (fmt === "md") {
      const text = parts.map(({ e, verses }) => `## ${e.title}\n*${longDate(e.created)}*${e.tags.length ? " · " + e.tags.map((t) => "#" + t).join(" ") : ""}\n\n${verses ? verses + "\n\n" : ""}${e.body}`).join("\n\n---\n\n");
      const path = await saveDialog({ defaultPath: `Journal ${what === "one" ? current?.title ?? "" : what === "month" ? month : what === "tag" ? "#" + tag : "export"}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!path) return;
      await api.writeTextFile(path, text + "\n");
      app.toast("Exported");
      onClose();
      return;
    }
    // PDF: lay the entries out in a print-only container and open the print dialog, which saves PDFs.
    const root = document.createElement("div");
    root.id = "print-root";
    root.innerHTML = parts.map(({ e, verses }) => `<section class="${perPage ? "pp" : ""}"><div class="pd">${longDate(e.created)}${e.verses.length ? " · " + e.verses.join(", ") : ""}</div><h1>${e.title.replace(/</g, "&lt;")}</h1>${verses ? mdToHtml(verses, false) : ""}${mdToHtml(e.body, false)}</section>`).join("");
    document.body.appendChild(root);
    onClose();
    await new Promise((r) => setTimeout(r, 60));
    try { await api.print(); } finally { setTimeout(() => root.remove(), 1500); }
  };
  return (
    <Dialog onClose={onClose} width={560} label="Export journal">
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ font: "500 26px/1.15 var(--display)" }}>Export journal</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="label" style={{ paddingBottom: 4 }}>What</span>
          {current && <label className="opt"><input type="radio" name="w" checked={what === "one"} onChange={() => setWhat("one")} />This entry · {current.title || "Untitled"}</label>}
          <label className="opt"><input type="radio" name="w" checked={what === "month"} onChange={() => setWhat("month")} />Entries from {MONTHS[+month.slice(5, 7) - 1]} {month.slice(0, 4)}</label>
          {tags.length > 0 && <label className="opt"><input type="radio" name="w" checked={what === "tag"} onChange={() => setWhat("tag")} />Entries tagged <select value={tag} onChange={(e) => { setTag(e.target.value); setWhat("tag"); }} className="btn small">{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</select></label>}
          <label className="opt"><input type="radio" name="w" checked={what === "all"} onChange={() => setWhat("all")} />Everything</label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Format</span>
          <Seg value={fmt} options={[["pdf", "PDF"], ["md", "Markdown"]]} onChange={setFmt} />
          <span className="hint">{fmt === "pdf" ? "Opens the print dialog: choose Save as PDF. It uses the app's reading fonts." : "One Markdown file. Your journal is already Markdown in its folder, so Obsidian sees it without exporting."}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="label" style={{ paddingBottom: 4 }}>Include</span>
          <label className="opt"><input type="checkbox" checked={withVerses} onChange={(e) => setWithVerses(e.target.checked)} />Verse text for linked verses</label>
          {fmt === "pdf" && <label className="opt"><input type="checkbox" checked={perPage} onChange={(e) => setPerPage(e.target.checked)} />One entry per page</label>}
        </div>
      </div>
      <div className="foot">
        <span className="hint">{list.length} entr{list.length === 1 ? "y" : "ies"}</span>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={!list.length} onClick={go}>Export…</button>
      </div>
    </Dialog>
  );
}
