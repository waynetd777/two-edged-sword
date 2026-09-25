import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, JournalEntry, ModuleInfo, Verse } from "./api";
import { fmtRef, parseRef, Ref } from "./bible";
import { plainText } from "./esword";
import { Icon } from "./icons";
import { mdToHtml } from "./md";
import { modelName, pickModel, providerOf, PROVIDER_NAME, useAssistant } from "./assistant";
import { Chat, Model, nowLocal, uid, useApp } from "./state";
import { useRefPreview } from "./StudyPane";
import { confirmDelete, Popover } from "./ui";

/** A module whose description carries a copyright notice is licensed, not public domain. */
const PUBLIC_DOMAIN = /^(KJV\+?|KJVA|ASV|YLT|WEB|DRB|DRA|Darby|BBE|RV|ERV|Webster|Geneva|GNV|Bishops|Tyndale|Wycliffe|LXX|TR|WH|Byz)$/i;
export const isLicensed = (m: ModuleInfo | undefined) =>
  !!m && !PUBLIC_DOMAIN.test(m.abbrev) && !/public domain/i.test(m.info) && /copyright|&copy;|&#169;|©|all rights reserved|used by permission/i.test(m.info);
/** A module whose text Ask mustn't send: licensed, with Settings › Licensed text off. */
export const withheld = (allowLicensed: boolean, m: ModuleInfo | undefined) => !allowLicensed && isLicensed(m);

// One listener for the whole app; panels subscribe by chat id. Kept on globalThis so a hot
// reload of this file shares them instead of stranding answers in a fresh, empty map.
type Sub = { chunk: (t: string) => void; status: (t: string) => void; done: (d: { sessionId: string | null; text: string; error: string | null }) => void };
const g = globalThis as { __askSubs?: Map<string, Sub>; __askListening?: boolean };
const subs = (g.__askSubs ??= new Map<string, Sub>());
function ensureListening() {
  if (g.__askListening) return;
  g.__askListening = true;
  listen<{ chatId: string; text: string }>("ask-chunk", (e) => subs.get(e.payload.chatId)?.chunk(e.payload.text));
  listen<{ chatId: string; text: string }>("ask-status", (e) => subs.get(e.payload.chatId)?.status(e.payload.text));
  listen<{ chatId: string; sessionId: string | null; text: string; error: string | null }>("ask-done", (e) => subs.get(e.payload.chatId)?.done(e.payload));
}

/** One question with no chat around it (worship.ts's song choosing): the answer's text. */
export function askOnce(prompt: string, model: string): Promise<string> {
  ensureListening();
  const id = "once-" + uid();
  let text = "";
  return new Promise((resolve, reject) => {
    subs.set(id, {
      chunk: (t) => { text += t; }, status: () => {},
      done: (d) => { subs.delete(id); if (d.error) reject(new Error(d.error)); else resolve(d.text || text); },
    });
    api.ask(id, prompt, model, null).catch((e) => { subs.delete(id); reject(e); });
  });
}

/** Screenshot mode: the chat the next Ask panel opens on (scene.ts). */
let sceneChat: string | null = null;
export const setSceneChat = (id: string) => { sceneChat = id; };
const takeSceneChat = () => { const id = sceneChat; sceneChat = null; return id; };

/** A progress line ("Thinking", "Reading Matthew Henry's Commentary"): a light sweeps across
 *  it and the dots count up. Keyed by the text so each new step starts its sweep afresh. */
export function Working({ text }: { text: string }) {
  return <span key={text} className="n working" role="status">{text}<span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>;
}

/** Answer text with verse references as links. */
export function Answer({ text, onRef, onRefHover }: { text: string; onRef: (r: Ref) => void; onRefHover?: (r: Ref | null, el: HTMLElement | null) => void }) {
  const html = useMemo(() => mdToHtml(text), [text]);
  const refAt = (t: EventTarget) => (t as HTMLElement).closest("a.ref") as HTMLElement | null;
  return (
    <div className="prose md selectable" onClick={(e) => {
      const a = refAt(e.target);
      if (a?.dataset.ref) { e.preventDefault(); onRefHover?.(null, null); onRef(JSON.parse(a.dataset.ref)); }
    }} onMouseOver={(e) => {
      const a = refAt(e.target);
      if (a?.dataset.ref && !a.contains(e.relatedTarget as Node)) onRefHover?.(JSON.parse(a.dataset.ref), a);
    }} onMouseOut={(e) => {
      const a = refAt(e.target);
      if (a && !a.contains(e.relatedTarget as Node)) onRefHover?.(null, null);
    }} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export interface AskProps {
  /** Where it is asked from, shown in Recent: "Read", "Compare"… */
  source: string;
  /** The passage it is about, when there is one; its text goes to the model. */
  passage?: Ref | null;
  verses?: Verse[];
  /** Short label for Recent when there is no passage: "G25 agapaō". */
  about?: string;
  /** Shown and kept in Recent instead of the passage's reference: a journal entry's title. */
  label?: string;
  /** Journal entries for a passage chat's folder, instead of the ones linked to the passage. */
  journal?: JournalEntry[];
  /** For a chat with no passage folder: journal entries written out to search (api.journalExport). */
  journalDir?: (chatId: string) => Promise<string>;
  /** Offers to put an answer into what is being written (the journal entry open). */
  onInsert?: (markdown: string) => void;
  /** More context for the model: other translations, a lexicon entry, search results, a journal entry. */
  context?: () => Promise<string> | string;
  /** A reference book's exported folder, which the model may search and read (see books.rs). */
  bookDir?: () => Promise<string>;
  /** What goes with the question, for the empty state; defaults to the passage. */
  hint?: string;
  suggestions?: string[];
  seed?: string | null;
  clearSeed?: () => void;
  /** The study pane's full-height version; otherwise a compact card. */
  full?: boolean;
  style?: React.CSSProperties;
}

/** Journal entries linked to any verse of the passage (or, for a chapter, to anything in it). */
function journalOn(journal: JournalEntry[], r: Ref): JournalEntry[] {
  const from = r.verse ?? 1, to = r.verse ? r.to ?? r.verse : 999;
  return journal.filter((e) => e.verses.some((v) => {
    const x = parseRef(v);
    if (!x || x.book !== r.book) return false;
    const last = x.toChapter ?? x.chapter;
    if (r.chapter < x.chapter || r.chapter > last) return false;
    // Only the part of the entry's range that falls in this chapter.
    const a = r.chapter === x.chapter ? x.verse ?? 1 : 1;
    const b = r.chapter === last ? (x.toChapter ? x.to ?? 999 : x.to ?? x.verse ?? 999) : 999;
    return a <= to && b >= from;
  }));
}

export function AskPanel(p: AskProps) {
  const app = useApp();
  const [chatId, setChatId] = useState<string | null>(() => takeSceneChat());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  /** What it is doing while it searches the library: "Reading Matthew Henry's Commentary". */
  const [status, setStatus] = useState<string | null>(null);
  const [scope, setScope] = useState<"passage" | "chapter">("passage");
  const [recent, setRecent] = useState<DOMRect | null>(null);
  const [modelMenu, setModelMenu] = useState<DOMRect | null>(null);
  // Every passage chat gets the library to search; the model decides whether a question needs it.
  const withLibrary = app.settings.includeCommentaries;
  const endRef = useRef<HTMLDivElement>(null);
  /** The chat being answered, which Stop cancels even once another chat is on screen. */
  const running = useRef<string | null>(null);
  const chat = app.chats.find((c) => c.id === chatId) ?? null;
  const asst = useAssistant();
  const model: Model = chat?.model ?? pickModel(app.settings.model, asst.models);
  const passage = p.passage ? (scope === "chapter" ? { book: p.passage.book, chapter: p.passage.chapter } : p.passage) : null;
  const about = p.label ?? (passage ? fmtRef(passage) : p.about ?? p.source);

  useEffect(() => { ensureListening(); }, []);
  useEffect(() => { if (p.seed) { setChatId(null); setQ(p.seed); p.clearSeed?.(); } }, [p.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [chat?.messages.length, chat?.messages[chat.messages.length - 1]?.text.length]);

  const update = (id: string, f: (c: Chat) => Chat) => app.setChats((cs) => cs.map((c) => (c.id === id ? f(c) : c)));

  const buildContext = async (): Promise<string> => {
    const parts: string[] = [];
    let bible: string | undefined = app.settings.bible;
    if (withheld(app.settings.allowLicensed, app.mod("bible", bible))) bible = app.bibles.find((b) => !isLicensed(b))?.id;
    if (passage && !bible) parts.push(`The passage is ${fmtRef(passage)}. Its text isn't included: the user's Bibles are licensed and they have chosen not to send licensed text.`);
    if (passage && bible) {
      const bm = app.mod("bible", bible);
      let vs: Verse[];
      if (passage.verse) {
        const [ps] = await api.passages(bible, [{ book: passage.book, chapter: passage.chapter, from: passage.verse, to: passage.to ?? passage.verse }]);
        vs = ps.verses;
      } else vs = await api.chapter(bible, passage.book, passage.chapter);
      parts.push(`The passage (${fmtRef(passage)}, ${bm?.title ?? bible}):\n${vs.map((v) => `${v.v} ${plainText(v.text)}`).join("\n")}`);
    }
    if (p.context) { const c = await p.context(); if (c) parts.push(c); }
    return parts.join("\n\n");
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setQ("");
    setBusy(true);
    let id = chat?.id;
    let prompt = question;
    let bookDir = chat?.bookDir;
    let studyDir = chat?.studyDir;
    if (!chat) {
      id = uid();
      if (p.bookDir) { try { bookDir = await p.bookDir(); } catch (e) { console.error(e); } }
      // A passage chat gets the library's material on it to search: the commentaries, the other
      // Bibles (public-domain ones only, unless licensed text may be sent) and the lexicons.
      else if (passage && withLibrary) {
        const bibles = app.bibles.filter((b) => !withheld(app.settings.allowLicensed, b)).map((b) => b.id);
        const exclude = (app.lib?.modules ?? []).filter((m) => withheld(app.settings.allowLicensed, m)).map((m) => m.id);
        const journal = p.journal ?? (app.settings.askJournal ? journalOn(app.journal, passage) : []);
        try { studyDir = await api.studyExport(id, { book: passage.book, chapter: passage.chapter, from: passage.verse ?? null, to: passage.verse ? passage.to ?? passage.verse : null, bibles, strongsBible: app.strongsBible, label: fmtRef(passage), journal, exclude }); } catch (e) { console.error(e); }
      }
      else if (p.journalDir) { try { studyDir = await p.journalDir(id); } catch (e) { console.error(e); } }
      const c: Chat = { id, title: question.length > 80 ? question.slice(0, 77) + "…" : question, about, source: p.source, created: new Date().toISOString(), updated: new Date().toISOString(), model, bookDir, studyDir, verses: passage ? [fmtRef(passage)] : [], messages: [] };
      app.setChats((cs) => [c, ...cs]);
      setChatId(id);
      try { const ctx = await buildContext(); if (ctx) prompt = `${ctx}\n\nQuestion: ${question}`; } catch (e) { console.error(e); }
    }
    const cid = id!;
    running.current = cid;
    update(cid, (c) => ({ ...c, updated: new Date().toISOString(), messages: [...c.messages, { role: "user", text: question }, { role: "assistant", text: "" }] }));
    setStatus(null);
    subs.set(cid, {
      status: (t) => setStatus(t),
      chunk: (t) => update(cid, (c) => { const m = [...c.messages]; m[m.length - 1] = { ...m[m.length - 1], text: m[m.length - 1].text + t }; return { ...c, messages: m }; }),
      done: (d) => {
        update(cid, (c) => {
          const m = [...c.messages];
          const last = m[m.length - 1];
          m[m.length - 1] = d.error ? { role: "assistant", text: d.error, error: true } : { ...last, text: last.text || d.text };
          return { ...c, session: d.sessionId ?? c.session, messages: m, updated: new Date().toISOString() };
        });
        subs.delete(cid);
        running.current = null;
        setBusy(false);
        setStatus(null);
      },
    });
    try { await api.ask(cid, prompt, model, chat?.session ?? null, bookDir ?? null, studyDir ?? null); }
    catch (e) { subs.get(cid)?.done({ sessionId: null, text: "", error: String(e) }); }
  };

  const addToJournal = async (c: Chat, i: number) => {
    const qm = c.messages[i - 1]?.text ?? c.title;
    const a = c.messages[i].text;
    // Chats from before they kept their passage: the one on screen, only if it's what they were about.
    const refs = c.verses ?? (passage && fmtRef(passage) === c.about ? [fmtRef(passage)] : []);
    await app.saveEntry({ id: uid(), title: qm.length > 70 ? qm.slice(0, 67) + "…" : qm, created: nowLocal(), updated: nowLocal(), verses: refs, tags: ["ask"], body: `**Asked:** ${qm}\n\n${a}\n\n*Answer from ${modelName(c.model)}.*` });
    update(c.id, (x) => ({ ...x, journaled: true }));
    app.toast("Added to your journal");
  };

  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  const openRef = (r: Ref) => { hide(); openRefNow(r); };
  const openRefNow = (r: Ref) => app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read");
  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {!p.full && <><span style={{ color: "var(--accent)", display: "inline-flex" }}><Icon name="chat" /></span><b style={{ whiteSpace: "nowrap" }}>Ask</b><span className="n" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>about {about}</span></>}
      <button className={`btn small ${recent ? "on" : ""}`} type="button" title="Recent chats" aria-label="Recent chats" style={{ marginLeft: "auto" }} onClick={(e) => setRecent(e.currentTarget.getBoundingClientRect())}><Icon name="clock" size={13} />{p.full && "Recent"}</button>
      <button className="btn small" type="button" onClick={() => { setChatId(null); setQ(""); }}><Icon name="plus" size={13} />New chat</button>
    </div>
  );

  const suggestions = p.suggestions ?? [];
  // The full panel always offers something to ask; the compact card only what it was given.
  const offered = suggestions.length || !p.full ? suggestions : ["What is the main point here?", "What background helps me understand this?", "Where else does the Bible say something like this?"];
  const messages = chat?.messages ?? [];
  // With the box empty, the go button asks the first suggestion, which the box shows as its hint,
  // so what you see is what gets asked. Not in a chat already under way.
  const defaultQ = messages.length === 0 ? offered[0] : undefined;
  const toSend = q.trim() ? q : defaultQ ?? "";
  const convo = (
    <>
      {messages.map((m, i) => m.role === "user" ? (
        <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "8px 12px", borderRadius: "12px 12px 4px 12px", background: "var(--accentsoft)", fontSize: 13.5, lineHeight: 1.5 }} className="selectable">{m.text}</div>
      ) : (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="label">{modelName(chat!.model)}</span></div>
          {m.error ? <div className="err" style={{ fontSize: 13 }}>{m.text}</div> : m.text ? <Answer text={m.text} onRef={openRef} onRefHover={onRefHover} /> : <Working text={busy && status && i === messages.length - 1 ? status : "Thinking"} />}
          {busy && status && m.text && i === messages.length - 1 && <Working text={status} />}
          {!m.error && m.text && !(busy && i === messages.length - 1) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {p.onInsert && <button className="btn primary small" type="button" onClick={() => p.onInsert!(m.text)}><Icon name="plus" size={13} />Insert into entry</button>}
              <button className={`btn small ${p.onInsert ? "" : "primary"}`} type="button" onClick={() => addToJournal(chat!, i)}><Icon name="journal" size={13} />{p.onInsert ? "New entry" : "Add to journal"}</button>
              <button className="ibtn" type="button" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(m.text); app.toast("Copied"); }}><Icon name="copy" /></button>
              {i === messages.length - 1 && <button className="ibtn" type="button" aria-label="Ask again" title="Ask again" onClick={() => { const qm = messages[i - 1]?.text; update(chat!.id, (c) => ({ ...c, messages: c.messages.slice(0, -2) })); if (qm) send(qm); }}><Icon name="refresh" /></button>}
            </div>
          )}
        </div>
      ))}
      {busy && <button className="btn small" type="button" style={{ alignSelf: "flex-start" }} onClick={() => { if (running.current) api.askCancel(running.current); }}><Icon name="stop" size={12} />Stop</button>}
      <div ref={endRef} />
    </>
  );

  const input = (
    <label style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: p.full ? 8 : 4, padding: p.full ? "10px 12px" : "8px 6px 6px 12px", borderRadius: 10, border: "1px solid var(--ring)", background: "var(--panel2)" }}>
      <textarea rows={2} value={q} placeholder={defaultQ ?? (messages.length ? "Ask a follow-up…" : `Ask about ${about}…`)} aria-label="Question" onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) { e.preventDefault(); send(toSend); } }}
        style={{ border: 0, outline: 0, resize: "none", background: "transparent", font: "400 13.5px/1.5 var(--ui)", color: "var(--text)", flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="btn small" type="button" onClick={(e) => setModelMenu(e.currentTarget.getBoundingClientRect())} disabled={!!chat}>{modelName(model)}<Icon name="down" className="sm" /></button>
        <button type="button" aria-label="Send" title={q.trim() || !defaultQ ? "Send" : `Ask “${defaultQ}”`} disabled={busy || !toSend.trim()} onClick={() => send(toSend)} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, border: 0, background: busy || !toSend.trim() ? "var(--border)" : "var(--accent)", color: busy || !toSend.trim() ? "var(--muted)" : "var(--onaccent)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="send" /></button>
      </div>
    </label>
  );

  const popovers = (
    <>
      {preview}
      {recent && <RecentChats anchor={recent} about={about} onClose={() => setRecent(null)} onPick={(id) => { setChatId(id); setRecent(null); }} current={chatId} />}
      {modelMenu && (
        <Popover anchor={modelMenu} onClose={() => setModelMenu(null)} width={230}>
          <div style={{ padding: 6 }}>{asst.models.map((m) => <button key={m.id} type="button" className="bm" onClick={() => { app.set({ model: m.id }); setModelMenu(null); }}>{m.name}{m.id === model && <span className="r"><Icon name="check" /></span>}</button>)}</div>
        </Popover>
      )}
    </>
  );

  if (!asst.available) return null;
  if (p.full) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderBottom: "1px solid var(--border)" }}>
          <span className="n">About</span>
          {p.passage?.verse ? (
            <div className="seg">
              <button type="button" className={scope === "passage" ? "on" : ""} disabled={!!chat} onClick={() => setScope("passage")}>{fmtRef(p.passage)}</button>
              <button type="button" className={scope === "chapter" ? "on" : ""} disabled={!!chat} onClick={() => setScope("chapter")}>Whole chapter</button>
            </div>
          ) : <b>{about}</b>}
          <div style={{ marginLeft: "auto" }}>{header}</div>
        </div>
        <div className="scroll" style={{ flexGrow: 1, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="hint">{p.hint ?? `Ask anything about ${about}. The passage goes with the question${withLibrary ? ", and it can search your commentaries, lexicons and dictionaries when the question needs them" : ""}.`}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {offered.map((s) => <button key={s} type="button" className="chip wrap" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {convo}
        </div>
        <div style={{ flexShrink: 0, padding: "12px 16px 14px", borderTop: "1px solid var(--border)", background: "var(--panel)", display: "flex", flexDirection: "column", gap: 8 }}>
          {input}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--muted)" }}><Icon name="check" size={13} style={{ color: "var(--good)" }} />Runs {PROVIDER_NAME[providerOf(model)]} on this Mac<span style={{ marginLeft: "auto" }}><span className="kbd">⏎</span> send · <span className="kbd">⇧⏎</span> new line</span></div>
        </div>
        {popovers}
      </div>
    );
  }
  return (
    <section aria-label="Ask" className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, ...p.style }}>
      {header}
      {messages.length > 0 ? <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360 }}>{convo}</div> : suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{suggestions.map((s) => <button key={s} type="button" className="chip wrap" onClick={() => send(s)}>{s}</button>)}</div>
      )}
      {input}
      {popovers}
    </section>
  );
}

function RecentChats({ anchor, about, onClose, onPick, current }: { anchor: DOMRect; about: string; onClose: () => void; onPick: (id: string) => void; current: string | null }) {
  const app = useApp();
  const [q, setQ] = useState("");
  const list = app.chats.filter((c) => !q || (c.title + " " + c.about + " " + c.messages.map((m) => m.text).join(" ")).toLowerCase().includes(q.toLowerCase()));
  const here = list.filter((c) => c.about === about);
  const rest = list.filter((c) => c.about !== about).slice(0, 30);
  const when = (iso: string) => {
    const d = new Date(iso);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return d >= t ? `today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };
  const item = (c: Chat) => (
    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {/* flex: 1 with minWidth 0, not the .bm default width: 100%, so long titles ellipsize and leave room for the delete button. */}
      <button type="button" className="bm" style={{ flex: 1, minWidth: 0, width: "auto", flexDirection: "column", alignItems: "flex-start", gap: 1, padding: "7px 10px", background: c.id === current ? "var(--accentsoft)" : undefined }} onClick={() => onPick(c.id)}>
        <b style={{ fontSize: 12.5, maxWidth: "100%" }} className="t">{c.title}</b>
        <span className="n t" style={{ maxWidth: "100%" }}>{c.source} · {c.about} · {when(c.updated)}{c.journaled ? " · added to journal" : ""}</span>
      </button>
      <button className="ibtn" type="button" style={{ flexShrink: 0 }} aria-label="Delete chat" title="Delete chat" onClick={async () => { if (await confirmDelete(`the chat “${c.title}”`)) app.setChats((cs) => cs.filter((x) => x.id !== c.id)); }}><Icon name="trash" size={13} /></button>
    </div>
  );
  return (
    <Popover anchor={anchor} onClose={onClose} width={380}>
      <div style={{ padding: 6, display: "flex", flexDirection: "column" }}>
        <label className="field" style={{ margin: "2px 4px 6px" }}><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" autoFocus /></label>
        {here.length > 0 && <><div className="label" style={{ padding: "4px 10px" }}>About {about}</div>{here.map(item)}</>}
        {rest.length > 0 && <><div className="label" style={{ padding: "8px 10px 4px" }}>Earlier</div>{rest.map(item)}</>}
        {!list.length && <div className="n" style={{ padding: 10 }}>No chats yet.</div>}
        <div className="hint" style={{ padding: "8px 10px 4px", borderTop: "1px solid var(--border)", marginTop: 4 }}>Kept on this Mac</div>
      </div>
    </Popover>
  );
}
