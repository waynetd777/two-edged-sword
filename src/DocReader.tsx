import { useEffect, useMemo, useRef, useState } from "react";
import { api, Article } from "./api";
import { fmtRef } from "./bible";
import { docSegments, plainText, renderHtml } from "./esword";
import { Icon } from "./icons";
import { usePlayer } from "./speech";
import { AskPanel } from "./Ask";
import { TextSizeButton } from "./Read";
import { Topbar } from "./Shell";
import { useApp } from "./state";
import { useRefPreview } from "./StudyPane";
import { Popover } from "./ui";

/** A reference book in the reading column: its chapters down the side, the chapter's text in the reading font. */
export function DocReader({ focus, setFocus }: { focus: boolean; setFocus: (f: boolean) => void }) {
  const app = useApp();
  const doc = app.doc!;
  const books = (app.lib?.modules ?? []).filter((m) => m.kind === "reference");
  const mod = books.find((m) => m.id === doc.module);
  const [loaded, setLoaded] = useState<{ module: string; titles: string[] }>({ module: "", titles: [] });
  const titles = loaded.module === doc.module ? loaded.titles : [];
  const i = titles.indexOf(doc.title);
  const [art, setArt] = useState<Article | null>(null);
  const [filter, setFilter] = useState("");
  const scroller = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  const player = usePlayer();
  const [image, setImage] = useState<string | null>(null);
  const segs = useMemo(() => (art ? docSegments(art.html) : []), [art]);
  const images = useMemo(() => segs.flatMap((h) => Array.from(h.matchAll(/<img[^>]+src="(data:image\/[^"]+)"/gi), (m) => m[1])), [segs]);
  const ps = player.state;
  const reading = ps.on && ps.doc?.module === doc.module && ps.doc.title === doc.title;
  const listen = (from = 0) => player.playDoc(doc.module, doc.title, segs, from);

  // Ask: the chapter (or the part around the paragraph asked about) goes with the question; the
  // rest of the book is exported once so Claude can search it rather than carry it.
  const [asking, setAsking] = useState<number | null>(null);
  useEffect(() => setAsking(null), [doc.module, doc.title]);
  const exported = useRef<{ module: string; p: Promise<{ dir: string; files: string[] }> } | null>(null);
  const exportBook = () => {
    if (exported.current?.module !== doc.module) {
      const p = api.docExport(doc.module);
      p.catch(() => { exported.current = null; });
      exported.current = { module: doc.module, p };
    }
    return exported.current.p;
  };
  const askContext = async () => {
    const { files } = await exportBook().catch(() => ({ files: [] as string[] }));
    const file = files[i];
    // Charts named as in the exported files, so Claude can open the one it is asked about.
    let img = 0;
    const nn = String(i + 1).padStart(2, "0");
    const paras = segs.map((h) => plainText(h.replace(/<img[^>]*>/gi, () => ` [Chart: ${nn}-img${++img}.png] `)));
    const words = (k: number) => paras[k].split(/\s+/).length;
    // About 6,000 words of the chapter: all of it when it fits, else a window around the paragraph asked about.
    let from = 0, to = paras.length - 1;
    if (paras.reduce((n, _, k) => n + words(k), 0) > 6000) {
      const at = asking ?? 0;
      from = at; to = at;
      let n = words(at);
      while (n < 6000 && (from > 0 || to < paras.length - 1)) {
        if (to < paras.length - 1) n += words(++to);
        if (from > 0 && n < 6000) n += words(--from);
      }
    }
    const part = from === 0 && to === paras.length - 1 ? "the whole chapter" : `paragraphs ${from + 1} to ${to + 1} of ${paras.length}; the rest is in the file`;
    const lines = [`The reader has open "${mod?.title ?? doc.module}", chapter "${doc.title}"${file ? ` (file "${file}")` : ""}. Here is ${part}, numbered by paragraph:`];
    for (let k = from; k <= to; k++) lines.push(`[${k + 1}] ${paras[k]}`);
    if (asking !== null) lines.push(`\nThe question is about paragraph ${asking + 1}:\n${paras[asking]}`);
    return lines.join("\n");
  };
  // Only offer what fits: a chart question when there is a chart, the wider book when there is one.
  const para = asking !== null ? segs[asking] ?? "" : "";
  const multi = titles.length > 1;
  const chapterRefs = segs.reduce((n, h) => n + (h.match(/<ref>/gi)?.length ?? 0), 0);
  const suggestions = (asking === null
    ? [
        "Summarise this chapter",
        images.length === 1 ? "Explain the chart in this chapter" : images.length > 1 ? "Explain the main chart in this chapter" : "",
        chapterRefs >= 5 ? "Which Scriptures does this chapter lean on most?" : "",
        multi && i > 0 ? "How does this build on the previous chapter?" : "",
        multi ? "How does this chapter fit the book's overall scheme?" : "",
        "How do other interpretive traditions see this?",
      ]
    : [
        /<img/i.test(para) ? "Explain this chart" : "Explain this paragraph",
        plainText(para).split(/\s+/).length > 80 ? "Put this in simpler words" : "",
        /<ref>/i.test(para) ? "How do the verses cited here support this?" : "What Scriptures support this?",
        multi ? "Where else does the book discuss this?" : "",
        "What would someone who disagrees say?",
      ]
  ).filter(Boolean).slice(0, 5);
  const askAbout = (k: number) => { setAsking(k); if (!app.settings.studyPane) app.set({ studyPane: true }); };

  // Keep the paragraph being read in view.
  useEffect(() => {
    if (reading && !ps.paused) scroller.current?.querySelector(`[data-seg="${ps.verse}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [reading, ps.verse, ps.paused]);

  useEffect(() => {
    setFilter("");
    const module = doc.module;
    api.referenceTitles(module).then((titles) => setLoaded({ module, titles })).catch(() => setLoaded({ module, titles: [] }));
  }, [doc.module]);

  // No chapter yet (first time in this book): start at the first.
  useEffect(() => {
    if (!doc.title && titles.length) app.openDoc(doc.module, titles[0]);
  }, [doc.title, doc.module, titles, app]);

  useEffect(() => {
    if (!doc.title) { setArt(null); return; }
    api.article("reference", doc.module, doc.title).then(setArt).catch(() => setArt(null));
    scroller.current?.scrollTo({ top: 0 });
    list.current?.querySelector<HTMLElement>("[aria-current=true]")?.scrollIntoView({ block: "nearest" });
  }, [doc.module, doc.title]);

  // The list arrives after the first chapter is open: bring the current one into view.
  useEffect(() => { list.current?.querySelector<HTMLElement>("[aria-current=true]")?.scrollIntoView({ block: "nearest" }); }, [loaded]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? titles.filter((t) => t.toLowerCase().includes(q)) : titles;
  }, [titles, filter]);
  const go = (t: string | undefined) => { if (t) { hide(); app.openDoc(doc.module, t); } };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (image || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape" && focus) setFocus(false);
      else if (e.key === "ArrowLeft") { go(titles[i - 1]); e.preventDefault(); }
      else if (e.key === "ArrowRight") { go(titles[i + 1]); e.preventDefault(); }
      else if (e.key === " ") {
        e.preventDefault();
        if (player.state.on) player.toggle(); else if (segs.length) listen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="main" style={{ minHeight: 0 }}>
      {focus ? (
        <header className="topbar drag" style={{ borderBottom: 0, paddingLeft: 84 }}>
          <button className="ibtn" type="button" aria-label="Previous chapter" disabled={i <= 0} onClick={() => go(titles[i - 1])}><Icon name="back" /></button>
          <div className="spacer" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", minWidth: 0 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title} · {mod?.title}</span></div>
          <button className={`ibtn ${reading ? "on" : ""}`} type="button" aria-label="Listen" title="Listen (space)" disabled={!segs.length} onClick={() => (reading ? player.toggle() : listen())}><Icon name="speaker" /></button>
          <TextSizeButton />
          <button className="btn" type="button" onClick={() => setFocus(false)}>Exit focus<span className="kbd">esc</span></button>
          <button className="ibtn" type="button" aria-label="Next chapter" disabled={i < 0 || i >= titles.length - 1} onClick={() => go(titles[i + 1])}><Icon name="fwd" /></button>
        </header>
      ) : <Topbar right={
        <div style={{ display: "flex", gap: 2 }}>
          <button className={`ibtn ${reading ? "on" : ""}`} type="button" aria-label="Listen" title="Listen (space)" disabled={!segs.length} onClick={() => (reading ? player.toggle() : listen())}><Icon name="speaker" /></button>
          <TextSizeButton />
          <button className="ibtn" type="button" aria-label="Focus mode" title="Focus mode (⌘.)" onClick={() => setFocus(true)}><Icon name="focus" /></button>
          <button className={`ibtn ${app.settings.studyPane ? "on" : ""}`} type="button" aria-label="Ask Claude" title="Ask Claude (⌘\)" onClick={() => app.set({ studyPane: !app.settings.studyPane })}><Icon name="chat" /></button>
        </div>
      }>
        <button className="btn" type="button" title="Back to the Bible" onClick={app.closeDoc}><Icon name="read" />{fmtRef(app.loc)}</button>
        <label className="btn" style={{ position: "relative", maxWidth: 320 }} title={mod?.title}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mod?.title ?? doc.module}</span>
          <Icon name="down" className="sm" style={{ color: "var(--muted)" }} />
          <select aria-label="Reference book" value={doc.module} onChange={(e) => app.openDoc(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>
      </Topbar>}
      <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: focus ? "minmax(0,1fr)" : app.settings.studyPane ? "260px minmax(0,1fr) 520px" : "260px minmax(0,1fr)" }}>
        {!focus && <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid var(--border)" }}>
          {titles.length > 12 && (
            <label className="field" style={{ margin: "10px 12px 4px" }}><Icon name="search" /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${titles.length} chapters`} aria-label="Filter chapters" /></label>
          )}
          <div ref={list} className="scroll doclist" style={{ padding: "6px 8px 20px" }}>
            {shown.map((t) => <button key={t} type="button" aria-current={t === doc.title} className={t === doc.title ? "on" : ""} title={t} onClick={() => go(t)}>{t}</button>)}
            {!titles.length && <div className="n" style={{ padding: 10 }}>Loading…</div>}
          </div>
        </aside>}
        <main ref={scroller} className="scroll" style={{ padding: focus ? "0 40px 120px" : "0 40px 120px 36px" }}>
          <div style={focus ? { maxWidth: 1040, margin: "0 auto" } : undefined}>
            {focus ? (
              <div style={{ padding: "24px 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                <div className="label">{mod?.title}{titles.length ? ` · ${i + 1} of ${titles.length}` : ""}</div>
                <h1 style={{ margin: 0, font: "400 40px/1.1 var(--display)", letterSpacing: "0.02em" }}>{doc.title}</h1>
              </div>
            ) : (
              <div style={{ padding: "18px 0 14px" }}>
                <div className="label">{mod?.title}{titles.length ? ` · ${i + 1} of ${titles.length}` : ""}</div>
                <h1 style={{ margin: "6px 0 0", font: "500 30px/1.15 var(--display)" }}>{doc.title}</h1>
              </div>
            )}
            {art
              ? <div className="es prose selectable docbody" style={{ fontSize: focus ? "calc(var(--read-size) + 2px)" : "var(--read-size)", lineHeight: focus ? 1.85 : 1.7 }}>
                  {segs.map((h, k) => (
                    <div key={k} data-seg={k + 1} className={`dseg ${reading && ps.verse === k + 1 ? "speaking" : ""} ${asking === k ? "asking" : ""}`}>
                      <span className="dsegtools">
                        <button type="button" aria-label="Listen from here" title="Listen from here" onClick={() => listen(k)}><Icon name="speaker" size={13} /></button>
                        <button type="button" aria-label="Ask about this paragraph" title="Ask about this paragraph" onClick={() => askAbout(k)}><Icon name="chat" size={13} /></button>
                      </span>
                      {renderHtml(h, { onRef: (r) => { hide(); app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read"); }, onRefHover, onStrongs: app.studyWord, onImage: setImage })}
                    </div>
                  ))}
                </div>
              : doc.title && <div className="n">Loading…</div>}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "28px 0 0" }}>
              {i > 0 ? <button className="btn" type="button" onClick={() => go(titles[i - 1])} style={{ maxWidth: "48%" }}><Icon name="back" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titles[i - 1]}</span></button> : <span />}
              {i >= 0 && i < titles.length - 1 ? <button className="btn" type="button" onClick={() => go(titles[i + 1])} style={{ maxWidth: "48%" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titles[i + 1]}</span><Icon name="fwd" /></button> : <span />}
            </div>
          </div>
        </main>
        {!focus && app.settings.studyPane && (
          <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--border)", background: "var(--panel)" }}>
            {asking !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                <Icon name="chat" size={13} style={{ color: "var(--accent)" }} /><span>Asking about paragraph {asking + 1}</span>
                <button className="btn small" type="button" style={{ marginLeft: "auto" }} onClick={() => setAsking(null)}>Whole chapter</button>
              </div>
            )}
            <AskPanel key={`${doc.module}|${doc.title}|${asking}`} full source="Reader" about={asking === null ? doc.title : `${doc.title} ¶${asking + 1}`}
              context={askContext} bookDir={() => exportBook().then((x) => x.dir)}
              hint={`Ask anything about ${asking === null ? "this chapter" : "this paragraph"}. The chapter goes with the question, and Claude can search the rest of ${mod?.title ?? "the book"} and look at its charts when it needs to.`}
              suggestions={suggestions} />
          </aside>
        )}
      </div>
      {preview}
      {focus && <div style={{ position: "fixed", bottom: 18, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 18, color: "var(--muted)", fontSize: 12, pointerEvents: "none" }}>
        <span>Click an image to see it full screen</span><span>·</span><span><span className="kbd">space</span> listen</span><span>·</span><span><span className="kbd">←</span> <span className="kbd">→</span> chapters</span>
      </div>}
      {image && <ImageViewer images={images.length ? images : [image]} start={Math.max(0, images.indexOf(image))} onClose={() => setImage(null)} />}
    </div>
  );
}

/** An image over the whole window: fitted, or at full size when clicked. ← → step through the chapter's images. */
export function ImageViewer({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowLeft" && i > 0) { setI(i - 1); setFull(false); }
      if (e.key === "ArrowRight" && i < images.length - 1) { setI(i + 1); setFull(false); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [i, images.length, onClose]);
  return (
    <div className="viewer" role="dialog" aria-label="Image" onClick={onClose}>
      <div className="scroll" style={{ position: "absolute", inset: 0, display: "flex", alignItems: full ? "flex-start" : "center", justifyContent: full ? "flex-start" : "center", overflow: full ? "auto" : "hidden", padding: full ? 0 : "56px 40px 40px" }}>
        <img src={images[i]} alt="" draggable={false} onClick={(e) => { e.stopPropagation(); setFull(!full); }}
          style={full ? { maxWidth: "none", margin: "auto", cursor: "zoom-out" } : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in" }} />
      </div>
      <div style={{ position: "absolute", top: 14, right: 16, display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && <span style={{ color: "#ccc", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{i + 1} of {images.length}</span>}
        {images.length > 1 && <button className="ibtn" type="button" aria-label="Previous image" disabled={i === 0} onClick={() => { setI(i - 1); setFull(false); }}><Icon name="back" /></button>}
        {images.length > 1 && <button className="ibtn" type="button" aria-label="Next image" disabled={i === images.length - 1} onClick={() => { setI(i + 1); setFull(false); }}><Icon name="fwd" /></button>}
        <button className="ibtn" type="button" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
      </div>
    </div>
  );
}

/** Opens a reference book from the Bible reader; the last one read comes first. */
export function BooksButton() {
  const app = useApp();
  const [a, setA] = useState<DOMRect | null>(null);
  const books = (app.lib?.modules ?? []).filter((m) => m.kind === "reference");
  if (!books.length) return null;
  const last = Object.keys(app.docAt);
  const sorted = [...books].sort((x, y) => (last.includes(y.id) ? 1 : 0) - (last.includes(x.id) ? 1 : 0) || x.title.localeCompare(y.title));
  return (
    <>
      <button className="btn" type="button" title="Read a reference book" onClick={(e) => setA(e.currentTarget.getBoundingClientRect())}><Icon name="library" />Books<Icon name="down" className="sm" style={{ color: "var(--muted)" }} /></button>
      {a && (
        <Popover anchor={a} onClose={() => setA(null)} width={340}>
          <div className="doclist" style={{ padding: 6, maxHeight: 420, overflowY: "auto" }}>
            {sorted.map((m) => <button key={m.id} type="button" title={m.title} onClick={() => { setA(null); app.openDoc(m.id); }}>{m.title}{app.docAt[m.id] && <span className="n" style={{ marginLeft: 8 }}>{app.docAt[m.id]}</span>}</button>)}
          </div>
        </Popover>
      )}
    </>
  );
}
