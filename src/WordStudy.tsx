import { useEffect, useMemo, useRef, useState } from "react";
import { api, TopicHit, VerseHit } from "./api";
import { AskPanel } from "./Ask";
import { BOOKS, fmtRef, SHORT } from "./bible";
import { concordanceRenderings, headwords, lexiconParts, plainText, renderHtml, tokenize } from "./esword";
import { Icon } from "./icons";
import { Topbar } from "./Shell";
import { useApp } from "./state";
import { orderModules } from "./StudyPane";

interface Entry { num: string; word: string; translit: string; pron: string; rest: string; total?: number; html: string }

/** An English word (or a transliteration) mapped to the Strong's numbers behind it. */
interface Lookup {
  q: string;
  words: { num: string; count: number; forms: [string, number][]; word?: string; translit?: string }[];
  translit: { num: string; word: string; translit: string }[];
}
/** The box and the last lookup, kept for the session so leaving the screen loses nothing. */
let saved: { q: string; lookup: Lookup | null; showing: boolean; num: string } | null = null;

export function WordStudyScreen() {
  const app = useApp();
  const num = app.wordStudy ?? "G25";
  const was = saved;
  const [q, setQ] = useState(was?.q ?? num);
  const [lookup, setLookup] = useState<Lookup | null>(was?.lookup ?? null);
  const [showing, setShowing] = useState(was?.showing ?? false);
  const [finding, setFinding] = useState(false);
  const lastNum = useRef(was?.num ?? num);
  useEffect(() => { saved = { q, lookup, showing, num }; });
  const [e, setE] = useState<Entry | null>(null);
  const [renderings, setRenderings] = useState<[string, number][]>([]);
  const [dist, setDist] = useState<[number, number][]>([]);
  const [onlyBook, setOnlyBook] = useState<number | null>(null);
  const [verses, setVerses] = useState<VerseHit[]>([]);
  const [related, setRelated] = useState<Entry[]>([]);
  const [topics, setTopics] = useState<TopicHit[]>([]);
  const greek = num.startsWith("G");
  const sb = app.strongsBible;

  // A new number from elsewhere (a word clicked in the text) shows that number, not the old lookup.
  useEffect(() => {
    if (num === lastNum.current) return;
    lastNum.current = num;
    setQ(num); setOnlyBook(null); setShowing(false);
  }, [num]);
  const find = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const n = t.toUpperCase();
    if (/^[GH]\d+$/.test(n)) { setShowing(false); app.studyWord(n); return; }
    setFinding(true);
    try {
      const [words, translit] = await Promise.all([
        sb ? api.strongsForWord(sb, t) : Promise.resolve([]),
        app.lexicon ? api.translitSearch(app.lexicon, t) : Promise.resolve([]),
      ]);
      // Name each number by its Greek or Hebrew word.
      const named = await Promise.all(words.slice(0, 24).map(async (w) => {
        const a = app.lexicon ? await api.article("lexicon", app.lexicon, w.num).catch(() => null) : null;
        const p = a ? lexiconParts(a.html) : null;
        return { ...w, word: p?.word, translit: p?.translit };
      }));
      setLookup({ q: t, words: named, translit: translit.filter((x) => !named.some((w) => w.num === x.num)) });
      setShowing(true);
    } finally { setFinding(false); }
  };
  const clear = () => { setQ(""); setLookup(null); setShowing(false); };
  const choose = (n: string) => { setShowing(false); lastNum.current = n; app.studyWord(n); };
  useEffect(() => {
    let dead = false;
    if (!app.lexicon) return;
    api.article("lexicon", app.lexicon, num).then(async (a) => {
      if (dead || !a) { setE(null); return; }
      const parts = lexiconParts(a.html);
      setE({ num, html: a.html, ...parts });
      // Related: the numbers the entry itself points to, plus words derived from this one are not indexed, so only those.
      const nums = Array.from(new Set(Array.from(a.html.matchAll(/<num>([GH]\d+)<\/num>/g)).map((m) => m[1]).filter((n) => n !== num))).slice(0, 5);
      const rel = await Promise.all(nums.map(async (n) => { const r = await api.article("lexicon", app.lexicon!, n); return r ? { num: n, html: r.html, ...lexiconParts(r.html) } : null; }));
      if (!dead) setRelated(rel.filter(Boolean) as Entry[]);
    });
    if (app.concordance) api.article("lexicon", app.concordance, num).then((c) => !dead && setRenderings(c ? concordanceRenderings(c.html) : []));
    if (sb) api.strongsByBook(sb, num).then((d) => !dead && setDist(d));
    return () => { dead = true; };
  }, [num, app.lexicon, app.concordance, sb]);
  useEffect(() => {
    if (!sb) return;
    api.strongsVerses(sb, num, onlyBook, 300).then(setVerses);
  }, [num, onlyBook, sb]);
  // Dictionary articles for the English words the KJV uses for it.
  useEffect(() => {
    let dead = false;
    (async () => {
      const words = Array.from(new Set(renderings.slice(0, 3).flatMap(([w]) => headwords(w.split(/[\s(]/)[0]).slice(-1))));
      const found: TopicHit[] = [];
      for (const w of words) for (const t of await api.findTopics(w)) if (!found.some((f) => f.module === t.module && f.topic === t.topic)) found.push(t);
      if (!dead) setTopics(orderModules(found.map((f) => ({ ...f, id: f.module })), app.settings.dictionaryOrder).slice(0, 8));
    })();
    return () => { dead = true; };
  }, [renderings, app.settings.dictionaryOrder]);

  const books = BOOKS.filter((b) => (greek ? b.n >= 40 : b.n <= 39));
  const counts = new Map(dist);
  const max = Math.max(1, ...dist.map((d) => d[1]));
  const verseTotal = dist.reduce((n, d) => n + d[1], 0);
  const kjvTotal = renderings.reduce((n, r) => n + r[1], 0) || e?.total;

  // Bold the words that carry this number.
  const marked = (h: VerseHit) => tokenize(h.text).map((t, i) => (t.word && t.showNums?.includes(num) ? <b key={i} style={{ background: "var(--hl-gold)", borderRadius: 3, padding: "0 2px" }}>{t.text}</b> : <span key={i}>{t.text}</span>));

  const context = useMemo(() => () => `Strong's ${num}: ${e?.word ?? ""} (${e?.translit ?? ""}). Strong's definition: ${plainText(e?.rest ?? "")}\nKJV renderings: ${renderings.map(([w, n]) => `${w} ${n}`).join(", ")}\nSome verses that use it (KJV):\n${verses.slice(0, 25).map((v) => `${fmtRef({ book: v.book, chapter: v.chapter, verse: v.verse }, "short")} ${plainText(v.text)}`).join("\n")}`, [num, e, renderings, verses]);

  return (
    <div className="main">
      <Topbar>
        <form onSubmit={(ev) => { ev.preventDefault(); find(q); }} style={{ marginLeft: 16, width: 340 }}>
          <label className="field"><Icon name="word" /><input value={q} onChange={(ev) => setQ(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Escape" && q) { ev.preventDefault(); clear(); } }} placeholder="A word like love, agape, or a number like G25" aria-label="Word or Strong's number" />
            {finding ? <span className="n">Finding…</span> : q && <button type="button" className="ibtn" aria-label="Clear" title="Clear (esc)" onClick={clear} style={{ width: 20, height: 20, flexShrink: 0 }}><Icon name="x" size={12} /></button>}</label>
        </form>
        {lookup && !showing && <button className="btn small" type="button" onClick={() => setShowing(true)}><Icon name="back" size={13} />Words for “{lookup.q}”</button>}
      </Topbar>
      {showing && lookup ? <LookupList lookup={lookup} onChoose={choose} /> : !app.lexicon ? <div className="empty">Word study needs a Strong's lexicon in your library.</div> : !e ? <div className="empty">No entry for {num}.</div> : (
        <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 20, padding: "22px 28px" }}>
          <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0, paddingRight: 4 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
              <div style={{ font: "400 72px/0.95 var(--display)", letterSpacing: "-0.01em" }} lang={greek ? "grc" : "he"}>{e.word}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 6 }}>
                <div style={{ font: "italic 400 22px/1.2 var(--serif)" }}>{e.translit}</div>
                <div style={{ color: "var(--muted)" }}>{e.pron}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, paddingBottom: 8 }}><span className="chip">{greek ? "Greek" : "Hebrew"}</span><span className="chip">Strong's {num}</span></div>
            </div>
            <div className="card" style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 200px", gap: 24 }}>
              <div className="es selectable" style={{ font: "400 17px/1.6 var(--serif)" }}>{renderHtml(e.rest, { onStrongs: app.studyWord, inlineNums: true })}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderLeft: "1px solid var(--border)", paddingLeft: 20 }}>
                <div className="label">In the KJV</div>
                {kjvTotal ? <div><b style={{ fontSize: 20 }}>{kjvTotal}</b> <span style={{ color: "var(--muted)" }}>times</span></div> : null}
                {sb && <div><b style={{ fontSize: 20 }}>{verseTotal}</b> <span style={{ color: "var(--muted)" }}>verses</span></div>}
                {renderings.length > 0 && <div className="n" style={{ fontWeight: 400, lineHeight: 1.5 }}>{renderings.slice(0, 8).map(([w, n]) => `${w} ${n}`).join(" · ")}</div>}
              </div>
            </div>
            {sb && (
              <div className="card" style={{ padding: "16px 20px 12px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div className="label">Verses with {num}, by book</div>
                  <div className="n">{greek ? "New" : "Old"} Testament · click a bar to list its verses</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${books.length}, minmax(0,1fr))`, gap: greek ? 4 : 2, alignItems: "end", height: 150, marginTop: 14 }}>
                  {books.map((b) => {
                    const n = counts.get(b.n) ?? 0;
                    const on = onlyBook === b.n;
                    return (
                      <button key={b.n} type="button" title={`${b.name}: ${n}`} disabled={!n} onClick={() => setOnlyBook(on ? null : b.n)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, height: 150, border: 0, background: "transparent", padding: 0, cursor: n ? "pointer" : "default" }}>
                        {greek && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{n || ""}</span>}
                        <span style={{ width: "100%", borderRadius: "3px 3px 0 0", height: n ? Math.max(4, Math.round((n / max) * 118)) : 2, background: on ? "var(--accent)" : n ? "var(--barsoft)" : "var(--border)" }} />
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${books.length}, minmax(0,1fr))`, gap: greek ? 4 : 2, marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 5 }}>
                  {books.map((b) => <span key={b.n} style={{ fontSize: greek ? 10 : 8, color: "var(--muted)", textAlign: "center", overflow: "hidden", whiteSpace: "nowrap" }}>{greek || b.n % 3 === 1 ? SHORT[b.n - 1] : ""}</span>)}
                </div>
              </div>
            )}
            {sb && (
              <div className="card" style={{ padding: "6px 20px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 4px" }}>
                  <div className="label">In context</div>
                  {onlyBook && <button type="button" className="chip on" onClick={() => setOnlyBook(null)}>{BOOKS[onlyBook - 1].name}<Icon name="x" size={12} /></button>}
                  <span className="n" style={{ marginLeft: "auto" }}>{verses.length}{verses.length >= 300 ? "+" : ""} verses · {app.mod("bible", sb)?.abbrev}</span>
                </div>
                {verses.map((v) => {
                  const r = { book: v.book, chapter: v.chapter, verse: v.verse };
                  return (
                    <button key={`${v.book}.${v.chapter}.${v.verse}`} type="button" className="bm" onClick={() => app.open(r, "read")} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border)", borderRadius: 0 }}>
                      <b style={{ fontSize: 12.5 }}>{fmtRef(r, "short")}</b>
                      <span style={{ font: "400 15.5px/1.55 var(--serif)" }}>{marked(v)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {related.length > 0 && (
              <div className="card" style={{ padding: "6px 18px" }}>
                <div className="label" style={{ padding: "10px 0 2px" }}>Related words</div>
                {related.map((r) => (
                  <button key={r.num} type="button" className="bm" onClick={() => app.studyWord(r.num)} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "2px 10px", padding: "10px 0", borderBottom: "1px solid var(--border)", borderRadius: 0 }}>
                    <span><span style={{ font: "500 20px var(--display)" }}>{r.word}</span> <i>{r.translit}</i></span><span className="n">{r.num}</span>
                    <span style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "var(--muted)" }}>{plainText(r.rest.replace(/<num>(.*?)<\/num>/g, "$1")).slice(0, 110)}</span>
                  </button>
                ))}
              </div>
            )}
            {topics.length > 0 && (
              <div className="card" style={{ padding: "6px 18px 14px" }}>
                <div className="label" style={{ padding: "10px 0 8px" }}>In your library</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {topics.map((t) => <button key={t.module + t.topic} type="button" className="rchip" style={{ justifyContent: "space-between", gap: 10, minHeight: 30, whiteSpace: "normal", textAlign: "left" }} onClick={() => app.setPending({ article: { module: t.module, topic: t.topic } })}><span style={{ flexShrink: 0 }}>{t.topic}</span><span className="n" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.mod("dictionary", t.module)?.abbrev ?? t.title}</span></button>)}
                </div>
              </div>
            )}
            <AskPanel source="Word study" about={`${num} ${e.translit}`} context={context}
              suggestions={[`What does ${e.translit} mean, and how is it used?`, ...(related.find((r) => r.num[0] === num[0]) ? [`How is ${e.translit} different from ${related.find((r) => r.num[0] === num[0])!.translit}?`] : []), `Where is ${e.translit} most significant in Scripture?`]} />
          </div>
        </div>
      )}
    </div>
  );
}

function LookupList({ lookup, onChoose }: { lookup: Lookup; onChoose: (num: string) => void }) {
  const total = lookup.words.reduce((n, w) => n + w.count, 0);
  const row = (num: string, word: string | undefined, translit: string | undefined, right: React.ReactNode) => (
    <button key={num} type="button" className="bm" onClick={() => onChoose(num)} style={{ display: "grid", gridTemplateColumns: "64px 150px minmax(0,1fr)", alignItems: "baseline", gap: 14, padding: "10px 12px" }}>
      <b style={{ fontSize: 12.5, color: "var(--accent)" }}>{num}</b>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span style={{ font: "500 19px var(--display)" }} lang={num.startsWith("H") ? "he" : "grc"}>{word}</span>
        <i style={{ fontFamily: "var(--serif)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{translit}</i>
      </span>
      <span style={{ minWidth: 0 }}>{right}</span>
    </button>
  );
  return (
    <div className="scroll" style={{ flexGrow: 1, padding: "22px 28px 40px" }}>
      <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          <h1 style={{ margin: 0, font: "500 30px/1.15 var(--display)" }}>“{lookup.q}” in the original languages</h1>
          <div className="hint" style={{ marginTop: 6 }}>Choose a word to study it.</div>
        </div>
        {lookup.words.length > 0 && (
          <section className="card" style={{ padding: "10px 8px" }}>
            <div className="label" style={{ padding: "4px 12px 8px" }}>Translated “{lookup.q}” in the KJV · {total.toLocaleString()} times</div>
            {lookup.words.map((w) => row(w.num, w.word, w.translit, (
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flexGrow: 1, height: 4, borderRadius: 999, background: "var(--border)", maxWidth: 160 }}><span style={{ display: "block", height: 4, borderRadius: 999, background: "var(--accent)", width: `${Math.max(3, (w.count / lookup.words[0].count) * 100)}%` }} /></span>
                <b style={{ fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "right" }}>{w.count}</b>
                <span className="n" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.forms.slice(0, 4).map(([f, n]) => `${f} ${n}`).join(" · ")}</span>
              </span>
            )))}
          </section>
        )}
        {lookup.translit.length > 0 && (
          <section className="card" style={{ padding: "10px 8px" }}>
            <div className="label" style={{ padding: "4px 12px 8px" }}>Sounds like “{lookup.q}”</div>
            {lookup.translit.map((t) => row(t.num, t.word, t.translit, null))}
          </section>
        )}
        {!lookup.words.length && !lookup.translit.length && <div className="empty">Nothing in the KJV or the lexicon matches “{lookup.q}”.</div>}
      </div>
    </div>
  );
}
