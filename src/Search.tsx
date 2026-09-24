import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api, Article, Commentary, SearchMode, SearchResults, Verse } from "./api";
import { AskPanel, Working } from "./Ask";
import { book, fmtRef, Ref, SECTIONS } from "./bible";
import { plainText, renderHtml } from "./esword";
import { Icon } from "./icons";
import { mdPlain } from "./md";
import { BibleSelect, Topbar } from "./Shell";
import { useApp } from "./state";
import { short, useRefPreview, useTopics } from "./StudyPane";
import { TrailButtons, useTrail } from "./ui";

type Scope = "all" | "bible" | "commentary" | "dictionary" | "journal";

/** The search as last left, for the rest of the session. */
let saved: {
  q: string; ran: string; mode: SearchMode; whole: boolean; range: (typeof RANGES)[number]; bible: string;
  res: SearchResults | null; scope: Scope; cmod: string | null; pick: Pick | null; scroll: number; searchFor: string | null;
} | null = null;
type Pick =
  | { kind: "verse"; ref: Ref }
  | { kind: "comment"; module: string; ref: Ref }
  | { kind: "dict"; module: string; topic: string }
  | { kind: "journal"; id: string };

const RANGES: { name: string; from: number; to: number }[] = [{ name: "Whole Bible", from: 1, to: 66 }, { name: "OT", from: 1, to: 39 }, { name: "NT", from: 40, to: 66 }, ...SECTIONS.filter((s) => ["Gospels", "Letters", "Prophets", "Wisdom"].includes(s.name))];

/** Text with every search term marked. */
export function mark(text: string, terms: string[]): ReactNode {
  const ts = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ts.length) return text;
  const re = new RegExp(`(${ts.join("|")})`, "gi");
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

export function SearchScreen() {
  const app = useApp();
  // Coming back to Search (say after opening a result) finds it as it was left.
  const was = saved;
  const [q, setQ] = useState(was?.q ?? app.searchFor ?? "");
  const [ran, setRan] = useState<string>(was?.ran ?? "");
  const [mode, setMode] = useState<SearchMode>(was?.mode ?? "phrase");
  const [whole, setWhole] = useState(was?.whole ?? true);
  const [range, setRange] = useState(was?.range ?? RANGES[0]);
  const [bible, setBible] = useState(was?.bible ?? app.settings.bible);
  const [res, setRes] = useState<SearchResults | null>(was?.res ?? null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(""); // the text being searched for, while busy
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>(was?.scope ?? "all");
  const [cmod, setCmod] = useState<string | null>(was?.cmod ?? null);
  const [pick, setPick] = useState<Pick | null>(was?.pick ?? null);
  const [ix, setIx] = useState<{ building: boolean; done: number; total: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(was?.scroll ?? 0);
  useEffect(() => { saved = { q, ran, mode, whole, range, bible, res, scope, cmod, pick, scroll: scrollTop.current, searchFor: app.searchFor }; });
  useEffect(() => { if (list.current) list.current.scrollTop = scrollTop.current; }, []);

  useEffect(() => {
    if (app.searchFor && app.searchFor !== was?.searchFor) { setQ(app.searchFor); run(app.searchFor); }
  }, [app.searchFor]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new search is a new place, so back returns to the one before; the effect above runs it.
  const submit = () => { const t = q.trim(); if (!t) return; if (t === app.searchFor) run(t); else app.searchText(t); };
  const clear = () => { setQ(""); setRan(""); setRes(null); setErr(null); setPick(null); scrollTop.current = 0; };
  useEffect(() => {
    const t = window.setInterval(() => api.indexProgress().then(setIx), 1500);
    api.indexProgress().then(setIx);
    return () => window.clearInterval(t);
  }, []);

  const runId = useRef(0);
  const run = async (text = q) => {
    if (!text.trim()) return;
    const id = ++runId.current; // only the latest search may show its results
    setBusy(true); setErr(null); setSearching(text.trim());
    try {
      const r = await api.search({ text, mode, wholeWords: whole, bible, bookFrom: range.from, bookTo: range.to, strongsBible: app.strongsBible });
      if (id !== runId.current) return;
      setRes(r); setRan(text); setCmod(r.commentaries[0]?.module ?? null);
      const first = r.bible.hits[0];
      setPick(first ? { kind: "verse", ref: { book: first.book, chapter: first.chapter, verse: first.verse } } : null);
    } catch (e) { if (id !== runId.current) return; setErr(String(e)); setRes(null); }
    setBusy(false);
  };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; } // restored results are already for these options
    if (ran) run(ran);
  }, [mode, whole, range, bible]); // eslint-disable-line react-hooks/exhaustive-deps

  const terms = useMemo(() => (mode === "phrase" ? [ran.trim()] : ran.trim().split(/\s+/)), [ran, mode]);
  const journalHits = useMemo(() => {
    if (!ran.trim() || res?.strongs) return [];
    const t = terms.map((x) => x.toLowerCase());
    return app.journal.filter((e) => {
      const hay = (e.title + " " + mdPlain(e.body)).toLowerCase();
      return mode === "any" ? t.some((x) => hay.includes(x)) : t.every((x) => hay.includes(x));
    });
  }, [app.journal, ran, terms, mode, res?.strongs]);
  const cTotal = res?.commentaries.reduce((n, m) => n + m.count, 0) ?? 0;
  const dTotal = res?.dictionaries.reduce((n, m) => n + m.count, 0) ?? 0;
  const total = (res?.bible.count ?? 0) + cTotal + dTotal + journalHits.length;
  const cur = res?.commentaries.find((m) => m.module === cmod) ?? res?.commentaries[0];
  const show = (s: Scope) => scope === "all" || scope === s;

  return (
    <div className="main">
      <Topbar>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ marginLeft: 16, flexGrow: 1, maxWidth: 520 }}>
          <label className="field"><Icon name="search" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && (q || res)) { e.preventDefault(); e.stopPropagation(); clear(); } }} placeholder="Words, a phrase, or a Strong's number like G509" aria-label="Search" />{busy && <span className="spinner" role="status" aria-label="Searching" />}
            {(q || res) && !busy && <button type="button" className="ibtn" aria-label="Clear search" title="Clear (esc)" onClick={clear} style={{ width: 20, height: 20, flexShrink: 0 }}><Icon name="x" size={12} /></button>}</label>
        </form>
      </Topbar>
      <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: "236px minmax(0,1fr) 440px" }}>
        <div className="scroll" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 18, borderRight: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="label" style={{ padding: "0 10px 6px" }}>Look in</div>
            {([["all", "Everything", total], ["bible", "Bible", res?.bible.count ?? 0], ["commentary", "Commentaries", cTotal], ["dictionary", "Dictionaries", dTotal], ["journal", "Journal", journalHits.length]] as [Scope, string, number][]).map(([s, l, n]) => (
              <button key={s} type="button" className="bm" style={{ height: 30, background: scope === s ? "var(--accentsoft)" : undefined, color: scope === s ? "var(--accent)" : undefined, fontWeight: scope === s ? 600 : undefined }} onClick={() => setScope(s)}>{l}<span className="r">{res ? n : ""}</span></button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px" }}>
            <div className="label">Bible</div>
            <BibleSelect value={bible} onChange={setBible} style={{ justifyContent: "space-between" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px" }}>
            <div className="label">Range</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{RANGES.map((r) => <button key={r.name} type="button" className={`chip ${range.name === r.name ? "on" : ""}`} onClick={() => setRange(r)}>{r.name}</button>)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 10px" }}>
            <div className="label" style={{ paddingBottom: 6 }}>Match</div>
            {([["phrase", "Exact phrase"], ["all", "All of the words"], ["any", "Any of the words"]] as [SearchMode, string][]).map(([m, l]) => <label key={m} className="opt"><input type="radio" name="m" checked={mode === m} onChange={() => setMode(m)} />{l}</label>)}
            <label className="opt"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} />Whole words only</label>
          </div>
          <div className="card" style={{ margin: "0 4px", padding: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, lineHeight: 1.5 }}>
            <b>Search the original words</b>
            <div>Type a Strong's number such as <span className="kbd" style={{ fontSize: 12 }}>G509</span> to find every verse that uses the word, however it is translated.</div>
          </div>
          {ix?.building && <div className="hint" style={{ padding: "0 10px" }}>Indexing your library for faster search: {ix.done} of {ix.total} books. Searches still work meanwhile.</div>}
        </div>

        <div ref={list} className="scroll" style={{ padding: "8px 16px 40px", position: "relative" }} onScroll={(e) => { scrollTop.current = e.currentTarget.scrollTop; }}>
          {/* While searching: a bar sweeping along the top, the old results dimmed, and on a first
              search a line saying what is being looked for. */}
          {busy && <div className="searchbar-progress" aria-hidden="true"><i /></div>}
          {busy && !res && <div className="empty"><Working text={`Searching your library for “${searching}”`} /></div>}
          {err && <div className="err" style={{ padding: 12 }}>{err}</div>}
          {!res && !err && !busy && <div className="empty">Search the Bible, every commentary and dictionary in your library, and your journal.</div>}
          {res && (
            <div style={{ opacity: busy ? 0.45 : 1, transition: "opacity .15s", pointerEvents: busy ? "none" : undefined }}>
              <h1 style={{ margin: 0, padding: "8px 12px 0", font: "500 26px/1.2 var(--display)" }}>{total.toLocaleString()} result{total === 1 ? "" : "s"} for “{ran}”</h1>
              {show("bible") && <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 12px 6px" }}><span className="label">Bible · {res.bible.abbrev}</span><span className="n">{res.bible.count} verse{res.bible.count === 1 ? "" : "s"}{res.bible.count > res.bible.hits.length ? `, first ${res.bible.hits.length} shown` : ""}</span></div>
                {res.bible.hits.map((h) => {
                  const r = { book: h.book, chapter: h.chapter, verse: h.verse };
                  const on = pick?.kind === "verse" && pick.ref.book === h.book && pick.ref.chapter === h.chapter && pick.ref.verse === h.verse;
                  return (
                    <button key={`${h.book}.${h.chapter}.${h.verse}`} type="button" className="bm" onClick={() => setPick({ kind: "verse", ref: r })} onDoubleClick={() => app.open(r, "read")} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 12, padding: "10px 12px", background: on ? "var(--accentsoft)" : undefined }}>
                      <b style={{ fontSize: 12.5 }}>{fmtRef(r, "short")}</b>
                      <span style={{ font: "400 15.5px/1.55 var(--serif)" }}>{res.strongs ? plainText(h.text) : mark(plainText(h.text), terms)}</span>
                    </button>
                  );
                })}
              </>}
              {show("commentary") && res.commentaries.length > 0 && <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 12px 6px" }}><span className="label">Commentaries</span><span className="n">{cTotal} passages</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 6px" }}>{res.commentaries.map((m) => <button key={m.module} type="button" className={`chip ${cur?.module === m.module ? "on" : ""}`} title={m.title} onClick={() => setCmod(m.module)}>{short(m)}<span className="n">{m.count}</span></button>)}</div>
                {cur?.hits.map((h, k) => {
                  const r = { book: h.book, chapter: h.chapterBegin, verse: h.verseBegin, to: h.chapterEnd === h.chapterBegin && h.verseEnd !== h.verseBegin ? h.verseEnd : undefined };
                  const on = pick?.kind === "comment" && pick.module === cur.module && pick.ref.book === r.book && pick.ref.chapter === r.chapter && pick.ref.verse === r.verse;
                  return (
                    <button key={k} type="button" className="bm" onClick={() => setPick({ kind: "comment", module: cur.module, ref: r })} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 12, padding: "10px 12px", background: on ? "var(--accentsoft)" : undefined }}>
                      <b style={{ fontSize: 12.5 }}>{fmtRef(r, "short")}</b>
                      <span style={{ font: "400 14.5px/1.55 var(--serif)" }}>{mark(h.snippet, terms)}</span>
                    </button>
                  );
                })}
                {cur && cur.count > cur.hits.length && <div className="n" style={{ padding: "4px 12px" }}>First {cur.hits.length} of {cur.count} shown. Narrow the range to see others.</div>}
              </>}
              {show("dictionary") && res.dictionaries.length > 0 && <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 12px 6px" }}><span className="label">Dictionaries</span><span className="n">{dTotal} articles</span></div>
                {res.dictionaries.map((m) => (
                  <div key={m.module} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 12, padding: "6px 12px" }}>
                    <b style={{ fontSize: 12.5, lineHeight: "24px" }} title={m.title}>{m.abbrev}</b>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{m.hits.map((t) => <button key={t} type="button" className="rchip" style={pick?.kind === "dict" && pick.topic === t && pick.module === m.module ? { borderColor: "var(--accent)" } : undefined} onClick={() => setPick({ kind: "dict", module: m.module, topic: t })}>{t}</button>)}{m.count > m.hits.length && <span className="n" style={{ alignSelf: "center" }}>+{m.count - m.hits.length} more</span>}</div>
                  </div>
                ))}
              </>}
              {show("journal") && journalHits.length > 0 && <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 12px 6px" }}><span className="label">Journal</span><span className="n">{journalHits.length} entr{journalHits.length === 1 ? "y" : "ies"}</span></div>
                {journalHits.map((e) => (
                  <button key={e.id} type="button" className="bm" onClick={() => setPick({ kind: "journal", id: e.id })} onDoubleClick={() => app.startEntry({ openId: e.id })} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 12, padding: "10px 12px", background: pick?.kind === "journal" && pick.id === e.id ? "var(--accentsoft)" : undefined }}>
                    <b style={{ fontSize: 12.5 }}>{new Date(e.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</b>
                    <span style={{ font: "400 14.5px/1.55 var(--serif)" }}><b>{e.title}.</b> {mark(mdPlain(e.body).slice(0, 200), terms)}…</span>
                  </button>
                ))}
              </>}
            </div>
          )}
        </div>

        <aside aria-label="Preview" style={{ borderLeft: "1px solid var(--border)", background: "var(--panel)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Preview pick={pick} bible={bible} terms={terms} />
          {res && (
            <div style={{ padding: "12px 14px 14px", borderTop: "1px solid var(--border)" }}>
              <AskPanel source="Search" about={`“${ran}” (${total} results)`} style={{ border: 0, padding: 0, background: "transparent" }}
                context={() => `The user searched their library for “${ran}”. Bible verses found (${res.bible.abbrev}, ${res.bible.count} in all):\n` + res.bible.hits.slice(0, 40).map((h) => `${fmtRef({ book: h.book, chapter: h.chapter, verse: h.verse }, "short")} ${plainText(h.text)}`).join("\n") + (res.commentaries.length ? `\n\nCommentaries with matches: ${res.commentaries.map((m) => `${m.title} (${m.count})`).join(", ")}` : "")}
                suggestions={res.strongs ? [`How is ${ran} used across these verses?`] : [`Summarise what these verses say about “${ran}”`, "Which of these passages is most important, and why?"]} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Preview({ pick, bible, terms }: { pick: Pick | null; bible: string; terms: string[] }) {
  const app = useApp();
  const [verses, setVerses] = useState<Verse[]>([]);
  const [comm, setComm] = useState<Commentary | null>(null);
  const [art, setArt] = useState<Article | null>(null);
  const { onRefHover, preview, hide } = useRefPreview(bible);
  const topic = useTopics(pick?.kind === "dict" ? pick.module : undefined, art?.topic);
  const trail = useTrail<string>((a, b) => a === b);
  useEffect(() => { trail.reset(pick?.kind === "dict" ? [pick.topic] : []); }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const topicSeq = useRef(0);
  const openTopic = (t: string, d?: number) => {
    if (pick?.kind !== "dict") return;
    hide();
    const to = d ? trail.go(d) : t;
    if (!to) return;
    if (!d) trail.visit(to);
    const n = ++topicSeq.current;
    api.article("dictionary", pick.module, to).then((a) => { if (n === topicSeq.current) setArt(a); }).catch(console.error);
  };
  useEffect(() => {
    setVerses([]); setComm(null); setArt(null);
    topicSeq.current++;
    if (!pick) return;
    let dead = false;
    if (pick.kind === "verse") api.passages(bible, [{ book: pick.ref.book, chapter: pick.ref.chapter, from: Math.max(1, pick.ref.verse! - 3), to: pick.ref.verse! + 3 }]).then(([p]) => { if (!dead) setVerses(p.verses); }).catch(() => {});
    if (pick.kind === "comment") api.commentary(pick.module, pick.ref.book, pick.ref.chapter, pick.ref.verse!).then((c) => { if (!dead) setComm(c); }).catch(() => {});
    if (pick.kind === "dict") api.article("dictionary", pick.module, pick.topic).then((a) => { if (!dead) setArt(a); }).catch(() => {});
    return () => { dead = true; };
  }, [pick, bible]);
  if (!pick) return <div className="empty" style={{ flexGrow: 1 }}>Choose a result to see it here.</div>;
  const openRef = (r: Ref) => { hide(); app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read"); };
  if (pick.kind === "journal") {
    const e = app.journal.find((x) => x.id === pick.id);
    return (
      <div className="scroll" style={{ flexGrow: 1, padding: "16px 22px" }}>
        <div className="label">Journal</div>
        <h2 style={{ margin: "4px 0 10px", font: "500 24px var(--display)" }}>{e?.title}</h2>
        <div style={{ font: "400 15.5px/1.6 var(--serif)" }}>{mark(mdPlain(e?.body ?? ""), terms)}</div>
        <button className="btn primary" type="button" style={{ marginTop: 14 }} onClick={() => app.startEntry({ openId: pick.id })}>Open entry</button>
      </div>
    );
  }
  const title = pick.kind === "dict" ? art?.topic ?? pick.topic : pick.kind === "verse" ? `${book(pick.ref.book).name} ${pick.ref.chapter}:${Math.max(1, pick.ref.verse! - 3)}–${pick.ref.verse! + 3}` : fmtRef(pick.ref);
  const where = pick.kind === "verse" ? "In context" : pick.kind === "comment" ? app.mod("commentary", pick.module)?.title : app.mod("dictionary", pick.module)?.title;
  const target = pick.kind === "dict" ? null : pick.ref;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
        {(trail.canBack || trail.canForward) && <TrailButtons trail={trail} onGo={(d) => openTopic("", d)} />}
        <div style={{ minWidth: 0 }}><div className="label" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{where}</div><div style={{ font: "500 22px/1.3 var(--display)" }}>{title}</div></div>
        {target && <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}><button className="btn" type="button" onClick={() => app.open(target, "compare")}>Compare</button><button className="btn primary" type="button" onClick={() => app.open(target, "read")}>Open<span style={{ opacity: 0.75 }}>⏎</span></button></div>}
      </div>
      <div className="scroll" style={{ flexGrow: 1, padding: "16px 22px" }}>
        {pick.kind === "verse" && verses.map((v) => (
          <p key={v.v} style={{ margin: "0 0 10px", font: "400 16px/1.65 var(--serif)", color: v.v === pick.ref.verse ? "var(--text)" : "var(--muted)" }}>
            <span className="vn" style={{ marginRight: 6, lineHeight: 1 }}>{v.v}</span>{v.v === pick.ref.verse ? mark(plainText(v.text), terms) : plainText(v.text)}
          </p>
        ))}
        {comm && <div className="es prose selectable">{renderHtml(comm.verse.map((e) => e.html).join(""), { onRef: openRef, onRefHover, onStrongs: app.studyWord })}</div>}
        {art && pick.kind === "dict" && <div className="es prose selectable">{renderHtml(art.html, { onRef: openRef, onRefHover, onStrongs: app.studyWord, topic, onTopic: (t) => openTopic(t) })}</div>}
      </div>
      {preview}
    </>
  );
}
