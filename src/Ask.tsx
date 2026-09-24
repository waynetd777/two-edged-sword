import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ModuleInfo, Verse } from "./api";
import { fmtRef, Ref } from "./bible";
import { plainText } from "./esword";
import { Icon } from "./icons";
import { mdToHtml } from "./md";
import { Chat, MODELS, Model, nowLocal, uid, useApp } from "./state";
import { orderModules, useRefPreview } from "./StudyPane";
import { Popover } from "./ui";

/** A module whose description carries a copyright notice is licensed, not public domain. */
const PUBLIC_DOMAIN = /^(KJV\+?|KJVA|ASV|YLT|WEB|DRB|DRA|Darby|BBE|RV|ERV|Webster|Geneva|GNV|Bishops|Tyndale|Wycliffe|LXX|TR|WH|Byz)$/i;
export const isLicensed = (m: ModuleInfo | undefined) =>
  !!m && !PUBLIC_DOMAIN.test(m.abbrev) && !/public domain/i.test(m.info) && /copyright|&copy;|&#169;|©|all rights reserved|used by permission/i.test(m.info);

// One listener for the whole app; panels subscribe by chat id.
type Sub = { chunk: (t: string) => void; done: (d: { sessionId: string | null; text: string; error: string | null }) => void };
const subs = new Map<string, Sub>();
let listening = false;
function ensureListening() {
  if (listening) return;
  listening = true;
  listen<{ chatId: string; text: string }>("ask-chunk", (e) => subs.get(e.payload.chatId)?.chunk(e.payload.text));
  listen<{ chatId: string; sessionId: string | null; text: string; error: string | null }>("ask-done", (e) => subs.get(e.payload.chatId)?.done(e.payload));
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
  /** The passage it is about, when there is one; its text goes to Claude. */
  passage?: Ref | null;
  verses?: Verse[];
  /** Short label for Recent when there is no passage: "G25 agapaō". */
  about?: string;
  /** More context for Claude: other translations, a lexicon entry, search results, a journal entry. */
  context?: () => Promise<string> | string;
  /** A reference book's exported folder, which Claude may search and read (see books.rs). */
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

export function AskPanel(p: AskProps) {
  const app = useApp();
  const [chatId, setChatId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"passage" | "chapter">("passage");
  const [recent, setRecent] = useState<DOMRect | null>(null);
  const [modelMenu, setModelMenu] = useState<DOMRect | null>(null);
  const [withCommentary, setWithCommentary] = useState(app.settings.includeCommentaries);
  const endRef = useRef<HTMLDivElement>(null);
  const chat = app.chats.find((c) => c.id === chatId) ?? null;
  const model: Model = chat?.model ?? app.settings.model;
  const passage = p.passage ? (scope === "chapter" ? { book: p.passage.book, chapter: p.passage.chapter } : p.passage) : null;
  const about = passage ? fmtRef(passage) : p.about ?? p.source;

  useEffect(() => { ensureListening(); }, []);
  useEffect(() => { if (p.seed) { setChatId(null); setQ(p.seed); p.clearSeed?.(); } }, [p.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [chat?.messages.length, chat?.messages[chat.messages.length - 1]?.text.length]);

  const update = (id: string, f: (c: Chat) => Chat) => app.setChats((cs) => cs.map((c) => (c.id === id ? f(c) : c)));

  const buildContext = async (): Promise<string> => {
    const parts: string[] = [];
    if (passage) {
      let bible = app.settings.bible;
      if (!app.settings.allowLicensed && isLicensed(app.mod("bible", bible))) bible = app.bibles.find((b) => !isLicensed(b))?.id ?? bible;
      const bm = app.mod("bible", bible);
      let vs: Verse[];
      if (passage.verse) {
        const [ps] = await api.passages(bible, [{ book: passage.book, chapter: passage.chapter, from: passage.verse, to: passage.to ?? passage.verse }]);
        vs = ps.verses;
      } else vs = await api.chapter(bible, passage.book, passage.chapter);
      parts.push(`The passage (${fmtRef(passage)}, ${bm?.title ?? bible}):\n${vs.map((v) => `${v.v} ${plainText(v.text)}`).join("\n")}`);
      if (withCommentary && passage.verse) {
        const cov = orderModules((await api.coverage(passage.book, passage.chapter, passage.verse)).filter((c) => c.range && c.id !== app.tsk), app.settings.commentaryOrder).slice(0, 2);
        for (const c of cov) {
          const cm = await api.commentary(c.id, passage.book, passage.chapter, passage.verse);
          const t = plainText(cm.verse.map((e) => e.html).join(" "));
          if (t) parts.push(`From ${c.title}:\n${t.length > 3500 ? t.slice(0, 3500) + " …" : t}`);
        }
      }
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
    if (!chat) {
      if (p.bookDir) { try { bookDir = await p.bookDir(); } catch (e) { console.error(e); } }
      id = uid();
      const c: Chat = { id, title: question.length > 80 ? question.slice(0, 77) + "…" : question, about, source: p.source, created: new Date().toISOString(), updated: new Date().toISOString(), model, bookDir, messages: [] };
      app.setChats((cs) => [c, ...cs]);
      setChatId(id);
      try { const ctx = await buildContext(); if (ctx) prompt = `${ctx}\n\nQuestion: ${question}`; } catch (e) { console.error(e); }
    }
    const cid = id!;
    update(cid, (c) => ({ ...c, updated: new Date().toISOString(), messages: [...c.messages, { role: "user", text: question }, { role: "assistant", text: "" }] }));
    subs.set(cid, {
      chunk: (t) => update(cid, (c) => { const m = [...c.messages]; m[m.length - 1] = { ...m[m.length - 1], text: m[m.length - 1].text + t }; return { ...c, messages: m }; }),
      done: (d) => {
        update(cid, (c) => {
          const m = [...c.messages];
          const last = m[m.length - 1];
          m[m.length - 1] = d.error ? { role: "assistant", text: d.error, error: true } : { ...last, text: last.text || d.text };
          return { ...c, session: d.sessionId ?? c.session, messages: m, updated: new Date().toISOString() };
        });
        subs.delete(cid);
        setBusy(false);
      },
    });
    try { await api.ask(cid, prompt, model, chat?.session ?? null, bookDir ?? null); }
    catch (e) { subs.get(cid)?.done({ sessionId: null, text: "", error: String(e) }); }
  };

  const addToJournal = async (c: Chat, i: number) => {
    const qm = c.messages[i - 1]?.text ?? c.title;
    const a = c.messages[i].text;
    const refs = passage ? [fmtRef(passage)] : [];
    await app.saveEntry({ id: uid(), title: qm.length > 70 ? qm.slice(0, 67) + "…" : qm, created: nowLocal(), updated: nowLocal(), verses: refs, tags: ["ask"], body: `**Asked:** ${qm}\n\n${a}\n\n*Answer from Claude (${MODELS.find((m) => m.id === c.model)?.name ?? c.model}).*` });
    update(c.id, (x) => ({ ...x, journaled: true }));
    app.toast("Added to your journal");
  };

  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  const openRef = (r: Ref) => { hide(); openRefNow(r); };
  const openRefNow = (r: Ref) => app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read");
  const modelName = MODELS.find((m) => m.id === model)?.name ?? model;
  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {!p.full && <><span style={{ color: "var(--accent)", display: "inline-flex" }}><Icon name="chat" /></span><b style={{ whiteSpace: "nowrap" }}>Ask Claude</b><span className="n" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>about {about}</span></>}
      <button className={`btn small ${recent ? "on" : ""}`} type="button" title="Recent chats" aria-label="Recent chats" style={{ marginLeft: "auto" }} onClick={(e) => setRecent(e.currentTarget.getBoundingClientRect())}><Icon name="clock" size={13} />{p.full && "Recent"}</button>
      <button className="btn small" type="button" onClick={() => { setChatId(null); setQ(""); }}><Icon name="plus" size={13} />New chat</button>
    </div>
  );

  const suggestions = p.suggestions ?? [];
  const messages = chat?.messages ?? [];
  const convo = (
    <>
      {messages.map((m, i) => m.role === "user" ? (
        <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "8px 12px", borderRadius: "12px 12px 4px 12px", background: "var(--accentsoft)", fontSize: 13.5, lineHeight: 1.5 }} className="selectable">{m.text}</div>
      ) : (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="label">Claude</span><span className="n">{MODELS.find((x) => x.id === chat!.model)?.name}</span></div>
          {m.error ? <div className="err" style={{ fontSize: 13 }}>{m.text}</div> : m.text ? <Answer text={m.text} onRef={openRef} onRefHover={onRefHover} /> : <span className="n">Thinking…</span>}
          {!m.error && m.text && !(busy && i === messages.length - 1) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn primary small" type="button" onClick={() => addToJournal(chat!, i)}><Icon name="journal" size={13} />Add to journal</button>
              <button className="ibtn" type="button" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(m.text); app.toast("Copied"); }}><Icon name="copy" /></button>
              {i === messages.length - 1 && <button className="ibtn" type="button" aria-label="Ask again" title="Ask again" onClick={() => { const qm = messages[i - 1]?.text; update(chat!.id, (c) => ({ ...c, messages: c.messages.slice(0, -2) })); if (qm) send(qm); }}><Icon name="refresh" /></button>}
            </div>
          )}
        </div>
      ))}
      {busy && <button className="btn small" type="button" style={{ alignSelf: "flex-start" }} onClick={() => chat && api.askCancel(chat.id)}><Icon name="stop" size={12} />Stop</button>}
      <div ref={endRef} />
    </>
  );

  const input = (
    <label style={{ display: "flex", flexDirection: p.full ? "column" : "row", alignItems: p.full ? "stretch" : "center", gap: 8, padding: p.full ? "10px 12px" : "4px 4px 4px 12px", borderRadius: 10, border: "1px solid var(--ring)", background: "var(--panel2)" }}>
      <textarea rows={p.full ? 2 : 1} value={q} placeholder={`Ask about ${about}…`} aria-label="Question" onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) { e.preventDefault(); send(q); } }}
        style={{ border: 0, outline: 0, resize: "none", background: "transparent", font: "400 13.5px/1.5 var(--ui)", color: "var(--text)", flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="btn small" type="button" onClick={(e) => setModelMenu(e.currentTarget.getBoundingClientRect())} disabled={!!chat}>{modelName}<Icon name="down" className="sm" /></button>
        {p.full && passage?.verse && <button type="button" className={`chip ${withCommentary ? "on" : ""}`} aria-pressed={withCommentary} disabled={!!chat} onClick={() => setWithCommentary(!withCommentary)}>+ commentaries</button>}
        <button type="button" aria-label="Send" disabled={busy || !q.trim()} onClick={() => send(q)} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, border: 0, background: "var(--accent)", color: "var(--onaccent)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: busy || !q.trim() ? 0.5 : 1 }}><Icon name="send" /></button>
      </div>
    </label>
  );

  const popovers = (
    <>
      {preview}
      {recent && <RecentChats anchor={recent} about={about} onClose={() => setRecent(null)} onPick={(id) => { setChatId(id); setRecent(null); }} current={chatId} />}
      {modelMenu && (
        <Popover anchor={modelMenu} onClose={() => setModelMenu(null)} width={200}>
          <div style={{ padding: 6 }}>{MODELS.map((m) => <button key={m.id} type="button" className="bm" onClick={() => { app.set({ model: m.id }); setModelMenu(null); }}>{m.name}{m.id === model && <span className="r"><Icon name="check" /></span>}</button>)}</div>
        </Popover>
      )}
    </>
  );

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
              <div className="hint">{p.hint ?? `Ask anything about ${about}. The passage${withCommentary ? " and what your commentaries say about it" : ""} goes with the question.`}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(suggestions.length ? suggestions : ["What is the main point here?", "What background helps me understand this?", "Where else does the Bible say something like this?"]).map((s) => <button key={s} type="button" className="chip wrap" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {convo}
        </div>
        <div style={{ flexShrink: 0, padding: "12px 16px 14px", borderTop: "1px solid var(--border)", background: "var(--panel)", display: "flex", flexDirection: "column", gap: 8 }}>
          {input}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--muted)" }}><Icon name="check" size={13} style={{ color: "var(--good)" }} />Runs Claude Code on this Mac<span style={{ marginLeft: "auto" }}><span className="kbd">⏎</span> send · <span className="kbd">⇧⏎</span> new line</span></div>
        </div>
        {popovers}
      </div>
    );
  }
  return (
    <section aria-label="Ask Claude" className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, ...p.style }}>
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
      <button type="button" className="bm" style={{ flexDirection: "column", alignItems: "flex-start", gap: 1, padding: "7px 10px", background: c.id === current ? "var(--accentsoft)" : undefined }} onClick={() => onPick(c.id)}>
        <b style={{ fontSize: 12.5 }} className="t">{c.title}</b>
        <span className="n">{c.source} · {c.about} · {when(c.updated)}{c.journaled ? " · added to journal" : ""}</span>
      </button>
      <button className="ibtn" type="button" aria-label="Delete chat" title="Delete chat" onClick={() => app.setChats((cs) => cs.filter((x) => x.id !== c.id))}><Icon name="trash" size={13} /></button>
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
