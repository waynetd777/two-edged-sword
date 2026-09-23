import { useEffect, useMemo, useRef, useState } from "react";
import { api, Article, Commentary, Coverage, ModuleInfo, Verse } from "./api";
import { book, fmtRef, parseRef, Ref } from "./bible";
import { AskPanel } from "./Ask";
import { plainText, renderHtml } from "./esword";
import { Icon } from "./icons";
import { useApp } from "./state";
import { Popover } from "./ui";

export type StudyTab = "commentary" | "dictionary" | "notes" | "maps" | "ask";

interface Props {
  tab: StudyTab;
  setTab: (t: StudyTab) => void;
  book: number;
  chapter: number;
  verse: number;
  selRef: Ref | null;
  verses: Verse[];
  follow: boolean;
  setFollow: (f: boolean) => void;
  dict: { module: string; topic: string } | null;
  setDict: (d: { module: string; topic: string } | null) => void;
  askSeed: string | null;
  clearAskSeed: () => void;
  commentary: string | null;
  setCommentary: (m: string | null) => void;
}

/** Hovering a reference shows the verse; clicking opens it. */
export function useRefPreview(bible: string) {
  const [prev, setPrev] = useState<{ r: Ref; rect: DOMRect; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const onRefHover = (r: Ref | null, el: HTMLElement | null) => {
    window.clearTimeout(timer.current);
    if (!r || !el) { timer.current = window.setTimeout(() => setPrev(null), 150); return; }
    const rect = el.getBoundingClientRect();
    timer.current = window.setTimeout(async () => {
      const to = r.toChapter ? 200 : r.to ?? r.verse ?? 200;
      try {
        const [p] = await api.passages(bible, [{ book: r.book, chapter: r.chapter, from: r.verse ?? 1, to: r.verse ? to : 6 }]);
        setPrev({ r, rect, text: p.verses.map((v) => (p.verses.length > 1 ? `${v.v} ` : "") + plainText(v.text)).join(" ") });
      } catch { /* not in this Bible */ }
    }, 350);
  };
  const node = prev && (
    <div className="popover" style={{ left: Math.max(12, Math.min(prev.rect.left - 40, window.innerWidth - 340)), top: prev.rect.top > 260 ? prev.rect.top - 8 : prev.rect.bottom + 8, transform: prev.rect.top > 260 ? "translateY(-100%)" : undefined, width: 320, padding: "12px 14px", pointerEvents: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><b style={{ fontSize: 12 }}>{fmtRef(prev.r)}</b><span className="n">click to open</span></div>
      <div style={{ font: "400 15px/1.55 var(--serif)", maxHeight: 220, overflow: "hidden" }}>{prev.text}</div>
    </div>
  );
  return { onRefHover, preview: node, hide: () => setPrev(null) };
}

/** A commentary's name, short enough for a chip: "Barnes", "JFB", "Pulpit". */
export function short(c: { abbrev: string; title: string }): string {
  const a = c.abbrev.replace(/^(Albert|Adam|John|Matthew|Joseph|C\. ?I\.|F\. ?B\.) /, "");
  if (a === "Jamieson-Fausset-Brown") return "JFB";
  return a.length > 18 ? a.split(/[\s-]/)[0] : a;
}

function rangeLabel(r: [number, number, number, number], ch: number) {
  const [cb, vb, ce, ve] = r;
  if (cb === ce && vb === ve) return "";
  if (cb === ce) return `${cb === ch ? "" : cb + ":"}${vb}–${ve}`;
  return `${cb}:${vb}–${ce}:${ve}`;
}

export function orderModules<T extends { id: string }>(ms: T[], order: string[]): T[] {
  const pos = (id: string) => { const i = order.indexOf(id); return i < 0 ? 999 : i; };
  return [...ms].sort((a, b) => pos(a.id) - pos(b.id));
}

export function StudyPane(p: Props) {
  const app = useApp();
  const tabs: [StudyTab, string][] = [["commentary", "Commentary"], ["dictionary", "Dictionary"], ["notes", "Notes"], ["maps", "Maps"], ["ask", "Ask"]];
  const vref: Ref = { book: p.book, chapter: p.chapter, verse: p.verse };
  const noteCount = app.journal.filter((e) => e.verses.some((v) => { const r = parseRef(v); return r && r.book === p.book && r.chapter === p.chapter && (!r.verse || (r.verse <= p.verse && p.verse <= (r.to ?? r.verse))); })).length;
  return (
    <aside className="study" aria-label="Study pane">
      <div className="tabs">
        {tabs.map(([t, l]) => (
          <button key={t} type="button" className={`tab ${p.tab === t ? "on" : ""}`} onClick={() => p.setTab(t)}>
            {t === "ask" && <Icon name="chat" />}{l}{t === "notes" && noteCount > 0 && <span className="n">{noteCount}</span>}
          </button>
        ))}
        <button type="button" className={`chip ${p.follow ? "on" : ""}`} style={{ marginLeft: "auto" }} aria-pressed={p.follow} title="Follow the selected verse" onClick={() => p.setFollow(!p.follow)}>
          <Icon name="link" size={13} />{p.chapter}:{p.verse}
        </button>
      </div>
      {p.tab === "commentary" && <CommentaryTab {...p} vref={vref} />}
      {p.tab === "dictionary" && <DictionaryTab dict={p.dict} setDict={p.setDict} />}
      {p.tab === "notes" && <NotesTab vref={vref} selRef={p.selRef} />}
      {p.tab === "maps" && <MapsTab bookN={p.book} />}
      {p.tab === "ask" && <AskPanel source="Read" seed={p.askSeed} clearSeed={p.clearAskSeed} passage={p.selRef ?? { book: p.book, chapter: p.chapter }} verses={p.verses} full />}
    </aside>
  );
}

function CommentaryTab(p: Props & { vref: Ref }) {
  const app = useApp();
  const [cov, setCov] = useState<Coverage[]>([]);
  const [data, setData] = useState<Commentary | null>(null);
  const [intro, setIntro] = useState<"verse" | "chapter" | "book">("verse");
  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  useEffect(() => { api.coverage(p.book, p.chapter, p.verse).then(setCov); }, [p.book, p.chapter, p.verse]);
  const list = useMemo(() => orderModules(cov.filter((c) => c.id !== app.tsk && c.range), app.settings.commentaryOrder), [cov, app.tsk, app.settings.commentaryOrder]);
  const current = (p.commentary && list.find((c) => c.id === p.commentary)) || list[0];
  useEffect(() => {
    if (!current) { setData(null); return; }
    api.commentary(current.id, p.book, p.chapter, p.verse).then(setData);
  }, [current?.id, p.book, p.chapter, p.verse]);
  const open = (r: Ref) => { hide(); app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }); };
  const html = intro === "chapter" ? data?.chapter : intro === "book" ? data?.book : data?.verse.map((e) => e.html).join("");
  const others = cov.filter((c) => c.id !== app.tsk && !c.range);
  const shown = list;
  return (
    <>
      <div style={{ display: "flex", gap: 6, padding: "10px 18px 0", flexWrap: "wrap" }}>
        {shown.map((c) => (
          <button key={c.id} type="button" className={`chip ${current?.id === c.id ? "on" : ""}`} title={c.title} onClick={() => { p.setCommentary(c.id); setIntro("verse"); }}>
            {c.abbrev.replace(/^(Albert|Adam|John|Matthew) /, "")}{c.range && rangeLabel(c.range, p.chapter) && <span className="n">{rangeLabel(c.range, p.chapter)}</span>}
          </button>
        ))}
        {others.length > 0 && <span className="n" style={{ alignSelf: "center" }} title={others.map((o) => o.title).join(", ")}>{others.length} with nothing here</span>}
      </div>
      <div className="scroll" style={{ flexGrow: 1, padding: "12px 22px 20px" }}>
        {current ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="label">{current.title} · {intro === "verse" ? fmtRef({ book: p.book, chapter: p.chapter, verse: current.range?.[1], to: current.range?.[3] }) : intro === "chapter" ? `${book(p.book).name} ${p.chapter}` : book(p.book).name}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {data?.chapter && <button type="button" className={`chip ${intro === "chapter" ? "on" : ""}`} onClick={() => setIntro(intro === "chapter" ? "verse" : "chapter")}>Chapter intro</button>}
                {data?.book && <button type="button" className={`chip ${intro === "book" ? "on" : ""}`} onClick={() => setIntro(intro === "book" ? "verse" : "book")}>Book intro</button>}
              </span>
            </div>
            <div className="es prose selectable">{html ? renderHtml(html, { onRef: open, onRefHover, onStrongs: app.studyWord }) : <span className="n">Nothing here.</span>}</div>
          </>
        ) : <div className="empty">No commentary in your library covers {fmtRef(p.vref)}.</div>}
      </div>
      <CrossRefs vref={p.vref} onOpen={open} onRefHover={onRefHover} />
      {preview}
    </>
  );
}

function CrossRefs({ vref, onOpen, onRefHover }: { vref: Ref; onOpen: (r: Ref) => void; onRefHover: (r: Ref | null, el: HTMLElement | null) => void }) {
  const app = useApp();
  const [html, setHtml] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!app.tsk) return;
    api.commentary(app.tsk, vref.book, vref.chapter, vref.verse!).then((c) => setHtml(c.verse.map((e) => e.html).join("") || null));
  }, [app.tsk, vref.book, vref.chapter, vref.verse]);
  if (!app.tsk || !html) return null;
  const count = (html.match(/<ref>/g) || []).length;
  return (
    <section aria-label="Cross-references" style={{ flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--panel)", padding: "12px 22px 16px", maxHeight: open ? "42%" : undefined, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
        <span className="label">Cross-references · Treasury of Scripture Knowledge</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="n">{count}</span><Icon name={open ? "down" : "up"} className="sm" /></span>
      </button>
      {open && <div className="scroll es tsk" style={{ fontSize: 13, lineHeight: 1.9 }}>{renderHtml(html, { onRef: onOpen, onRefHover })}</div>}
    </section>
  );
}

function DictionaryTab({ dict, setDict }: { dict: { module: string; topic: string } | null; setDict: (d: { module: string; topic: string } | null) => void }) {
  const app = useApp();
  const dicts = orderModules((app.lib?.modules ?? []).filter((m) => m.kind === "dictionary"), app.settings.dictionaryOrder);
  const [module, setModule] = useState<string>(dict?.module ?? dicts[0]?.id ?? "");
  const [q, setQ] = useState(dict?.topic ?? "");
  const [topics, setTopics] = useState<string[]>([]);
  const [art, setArt] = useState<Article | null>(null);
  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  useEffect(() => { if (dict) { setModule(dict.module); setQ(dict.topic); } }, [dict]);
  useEffect(() => {
    if (!module) return;
    if (dict && dict.module === module) api.article("dictionary", module, dict.topic).then(setArt);
  }, [dict, module]);
  useEffect(() => {
    if (!module || !q.trim()) { setTopics([]); return; }
    const t = window.setTimeout(() => api.topics("dictionary", module, q.trim(), 40).then(setTopics), 120);
    return () => window.clearTimeout(t);
  }, [q, module]);
  const pick = (topic: string) => { setDict({ module, topic }); api.article("dictionary", module, topic).then(setArt); setTopics([]); };
  // Switching dictionary keeps the same topic when it has one.
  const switchTo = (m: ModuleInfo) => {
    setModule(m.id);
    if (art) api.article("dictionary", m.id, art.topic).then((a) => { setArt(a); if (a) setDict({ module: m.id, topic: a.topic }); });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flexGrow: 1 }}>
      <div style={{ display: "flex", gap: 6, padding: "10px 18px 0", flexWrap: "wrap" }}>
        {dicts.map((d) => <button key={d.id} type="button" className={`chip ${module === d.id ? "on" : ""}`} title={d.title} onClick={() => switchTo(d)}>{d.abbrev}</button>)}
      </div>
      <div style={{ padding: "10px 18px 0", position: "relative" }}>
        <label className="field"><Icon name="search" /><input value={q} placeholder="Look up a word or name" aria-label="Look up" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && topics[0]) pick(topics[0]); }} /></label>
        {topics.length > 0 && q !== art?.topic && (
          <div className="card" style={{ position: "absolute", left: 18, right: 18, top: 44, zIndex: 10, maxHeight: 260, overflowY: "auto", padding: 4, boxShadow: "0 10px 30px var(--shadow)" }}>
            {topics.map((t) => <button key={t} type="button" className="bm" onClick={() => pick(t)}>{t}</button>)}
          </div>
        )}
      </div>
      <div className="scroll" style={{ flexGrow: 1, padding: "14px 22px 20px" }}>
        {art ? (
          <>
            <div className="label" style={{ marginBottom: 4 }}>{art.title}</div>
            <h2 style={{ margin: "0 0 10px", font: "500 26px/1.2 var(--display)" }}>{art.topic}</h2>
            <div className="es prose selectable">{renderHtml(art.html, { onRef: (r) => { hide(); app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }); }, onRefHover, onStrongs: app.studyWord })}</div>
          </>
        ) : <div className="empty">Click a word in the text, or type one above.</div>}
      </div>
      {preview}
    </div>
  );
}

function NotesTab({ vref, selRef }: { vref: Ref; selRef: Ref | null }) {
  const app = useApp();
  const hits = app.journal.filter((e) => e.verses.some((v) => { const r = parseRef(v); return r && r.book === vref.book && r.chapter === vref.chapter; }));
  const onVerse = hits.filter((e) => e.verses.some((v) => { const r = parseRef(v); return r && (!r.verse || (r.verse <= vref.verse! && vref.verse! <= (r.to ?? r.verse))); }));
  const rest = hits.filter((e) => !onVerse.includes(e));
  const target = selRef ?? vref;
  const item = (e: typeof hits[number]) => (
    <button key={e.id} type="button" className="bm" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "10px 12px" }} onClick={() => app.startEntry({ openId: e.id })}>
      <b style={{ fontSize: 13.5 }}>{e.title || "Untitled"}</b>
      <span className="n">{new Date(e.created).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {e.verses.join(", ")}</span>
      <span style={{ font: "400 13.5px/1.45 var(--serif)", color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.body.replace(/[#>*_\-[\]]/g, "").slice(0, 200)}</span>
    </button>
  );
  return (
    <div className="scroll" style={{ flexGrow: 1, padding: "14px 16px" }}>
      <button type="button" className="btn primary" onClick={() => app.startEntry({ verses: [fmtRef(target)] })}><Icon name="plus" />New note on {fmtRef(target, "short")}</button>
      <div className="label" style={{ padding: "16px 12px 4px" }}>On {fmtRef(vref)}</div>
      {onVerse.length ? onVerse.map(item) : <div className="n" style={{ padding: "4px 12px" }}>No notes on this verse yet.</div>}
      {rest.length > 0 && <><div className="label" style={{ padding: "16px 12px 4px" }}>Elsewhere in {book(vref.book).name} {vref.chapter}</div>{rest.map(item)}</>}
    </div>
  );
}

/** Which maps suit a book, by the words in their titles. */
function mapHint(b: number): RegExp {
  if (b === 1) return /patriarch|near east|ancient/i;
  if (b >= 2 && b <= 5) return /exodus|egypt|sinai/i;
  if (b >= 6 && b <= 8) return /canaan|tribal|division/i;
  if (b >= 9 && b <= 14) return /saul|david|solomon|united|kingdoms of israel|judah/i;
  if (b >= 15 && b <= 17) return /persian/i;
  if (b === 27) return /persian|greek|babylon/i;
  if (b >= 23 && b <= 39) return /assyrian|babylon|kingdoms of israel|judah/i;
  if (b >= 40 && b <= 43) return /jesus|herod|roman rule|jerusalem/i;
  if (b === 44) return /paul|apostles|early ministry|spread/i;
  if (b >= 45 && b <= 65) return /paul|roman empire|new testament|spread/i;
  return /world of the new testament|roman empire|spread/i;
}

function MapsTab({ bookN }: { bookN: number }) {
  const app = useApp();
  const refs = (app.lib?.modules ?? []).filter((m) => m.kind === "reference" && /map|chart/i.test(m.title));
  const [all, setAll] = useState<{ module: ModuleInfo; title: string }[]>([]);
  const [cur, setCur] = useState<{ module: string; title: string } | null>(null);
  const [art, setArt] = useState<Article | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showAll, setShowAll] = useState<DOMRect | null>(null);
  useEffect(() => {
    Promise.all(refs.map((m) => api.referenceTitles(m.id).then((ts) => ts.map((title) => ({ module: m, title }))).catch(() => []))).then((x) => setAll(x.flat()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.lib]);
  const hint = mapHint(bookN);
  const suggested = all.filter((x) => /map/i.test(x.module.title) && hint.test(x.title));
  const chosen = cur ?? (suggested[0] ? { module: suggested[0].module.id, title: suggested[0].title } : null);
  useEffect(() => {
    if (!chosen) { setArt(null); return; }
    setZoom(1);
    api.article("reference", chosen.module, chosen.title).then(setArt);
  }, [chosen?.module, chosen?.title]);
  if (!refs.length) return <div className="empty">No maps in your library.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flexGrow: 1 }}>
      <div style={{ padding: "12px 18px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="label">Maps for {book(bookN).name}</span>
          <a style={{ marginLeft: "auto", fontSize: 12 }} onClick={(e) => setShowAll(e.currentTarget.getBoundingClientRect())}>All {all.length} maps and charts</a>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {suggested.slice(0, 6).map((x) => <button key={x.module.id + x.title} type="button" className={`chip ${chosen?.title === x.title && chosen.module === x.module.id ? "on" : ""}`} onClick={() => setCur({ module: x.module.id, title: x.title })}>{x.title}<span className="n">{x.module.abbrev.replace(/ Maps?$/, "")}</span></button>)}
          {!suggested.length && <span className="n">No map is suggested for this book. Choose from all maps.</span>}
        </div>
      </div>
      <div style={{ margin: "12px 18px 16px", position: "relative", flexGrow: 1, minHeight: 0, borderRadius: 10, border: "1px solid var(--border)", overflow: "auto", background: "var(--panel)" }}>
        {art ? <div className="es" style={{ width: `${zoom * 100}%`, padding: 8 }}>{renderHtml(art.html)}</div> : <div className="empty">Choose a map.</div>}
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 18px 14px" }}>
        <button className="btn small" type="button" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}><Icon name="plus" size={13} />Zoom in</button>
        <button className="btn small" type="button" onClick={() => setZoom((z) => Math.max(1, z / 1.25))}><Icon name="minus" size={13} />Zoom out</button>
        <span className="n" style={{ alignSelf: "center", marginLeft: "auto" }}>{chosen?.title}</span>
      </div>
      {showAll && (
        <Popover anchor={showAll} onClose={() => setShowAll(null)} width={360}>
          <div style={{ padding: 6 }}>
            {refs.map((m) => (
              <div key={m.id}>
                <div className="label" style={{ padding: "8px 10px 2px" }}>{m.title}</div>
                {all.filter((x) => x.module.id === m.id).map((x) => <button key={x.title} type="button" className="bm" onClick={() => { setCur({ module: m.id, title: x.title }); setShowAll(null); }}>{x.title}</button>)}
              </div>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
