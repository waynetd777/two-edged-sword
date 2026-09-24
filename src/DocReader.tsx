import { useEffect, useMemo, useRef, useState } from "react";
import { api, Article } from "./api";
import { fmtRef } from "./bible";
import { docSegments, plainText, renderHtml, wordRangeAt } from "./esword";
import { Icon } from "./icons";
import { usePlayer } from "./speech";
import { AskPanel } from "./Ask";
import { HL, HL_DOT, TextSizeButton, textToken, WordPick } from "./Read";
import { docHlKey, docLabel, parseDocLabel } from "./docref";
import { WordLookup } from "./WordLookup";
import { Topbar } from "./Shell";
import { HlColor, hlName, useApp } from "./state";
import { DictionaryTab, useRefPreview } from "./StudyPane";
import { Popover, wordAt, wordHover } from "./ui";
import { dayTitle } from "./plans";
import { useAssistant } from "./assistant";

/**
 * A reference book or a devotional in the reading column: its chapters (a devotional's days) down
 * the side, the text in the reading font.
 */
export function DocReader({ focus, setFocus }: { focus: boolean; setFocus: (f: boolean) => void }) {
  const app = useApp();
  const canAsk = useAssistant().available;
  // The study pane: notes on the chapter, the dictionaries, and Ask (when an assistant is installed).
  const pane = app.settings.studyPane;
  const tab = app.settings.docTab === "ask" && !canAsk ? "notes" : app.settings.docTab;
  const setTab = (t: typeof tab) => { app.set({ docTab: t, ...(app.settings.studyPane ? {} : { studyPane: true }) }); };
  const doc = app.doc!;
  const kind = doc.kind ?? "reference";
  const devo = kind === "devotional";
  const unit = devo ? "reading" : "chapter";
  const books = (app.lib?.modules ?? []).filter((m) => m.kind === kind);
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
  const listen = (from = 0) => player.playDoc(doc.module, doc.title, segs, from, kind);

  // Ask: the chapter (or the part around the paragraph asked about) goes with the question; the
  // rest of the book is exported once so the model can search it rather than carry it.
  const [asking, setAsking] = useState<number | null>(null);
  // A word clicked in the text, looked up as a Bible word is; and a question it seeds for Ask.
  const [word, setWord] = useState<WordPick | null>(null);
  const [askSeed, setAskSeed] = useState<string | null>(null);
  useEffect(() => setAsking(null), [doc.module, doc.title]);
  const exported = useRef<{ module: string; p: Promise<{ dir: string; files: string[] }> } | null>(null);
  const exportBook = () => {
    if (exported.current?.module !== doc.module) {
      const p = api.docExport(doc.module, kind);
      p.catch(() => { exported.current = null; });
      exported.current = { module: doc.module, p };
    }
    return exported.current.p;
  };
  const askContext = async () => {
    const { files } = await exportBook().catch(() => ({ files: [] as string[] }));
    const file = files[i];
    // Charts named as in the exported files, so the model can open the one it is asked about.
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
    const part = from === 0 && to === paras.length - 1 ? `the whole ${unit}` : `paragraphs ${from + 1} to ${to + 1} of ${paras.length}; the rest is in the file`;
    const where = devo ? `the devotional "${mod?.title ?? doc.module}", the reading for ${doc.title}` : `"${mod?.title ?? doc.module}", chapter "${doc.title}"`;
    const lines = [`The reader has open ${where}${file ? ` (file "${file}")` : ""}. Here is ${part}, numbered by paragraph:`];
    for (let k = from; k <= to; k++) lines.push(`[${k + 1}] ${paras[k]}`);
    if (asking !== null) lines.push(`\nThe question is about paragraph ${asking + 1}:\n${paras[asking]}`);
    return lines.join("\n");
  };
  // Only offer what fits: a chart question when there is a chart, the wider book when there is one.
  const para = asking !== null ? segs[asking] ?? "" : "";
  const multi = titles.length > 1;
  const chapterRefs = segs.reduce((n, h) => n + (h.match(/<ref>/gi)?.length ?? 0), 0);
  const suggestions = (asking === null && devo
    ? [
        "Summarise today's reading",
        "What is the key verse here, and why?",
        "How can I put this into practice today?",
        "Give me a short prayer drawn from this",
        chapterRefs >= 2 ? "Read me the verses it quotes" : "",
      ]
    : asking === null
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
        multi ? (devo ? "Where else does this devotional touch on this?" : "Where else does the book discuss this?") : "",
        "What would someone who disagrees say?",
      ]
  ).filter(Boolean).slice(0, 5);
  const marked = (k: number) => app.bookmarks.some((b) => b.doc?.module === doc.module && b.doc.title === doc.title && b.doc.para === k + 1);
  const askAbout = (k: number) => { setAsking(k); setTab("ask"); };

  // Paragraphs select like verses: a click (not on a word, a link or an image) selects one,
  // ⇧-click a run; the toolbar above offers highlight, bookmark, note, listen, ask and copy.
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => setSel(null), [doc.module, doc.title]);
  const bookTitle = mod?.title ?? doc.module;
  const selLabel = sel ? docLabel(bookTitle, doc.title, sel.from, sel.to) : "";
  const selText = () => (sel ? segs.slice(sel.from - 1, sel.to).map((h) => plainText(h)).join("\n\n") : "");
  const clickPara = (n: number, shift: boolean) => {
    if (shift && sel) setSel({ from: Math.min(sel.from, n), to: Math.max(sel.to, n) });
    else if (sel && sel.from === n && sel.to === n) setSel(null);
    else setSel({ from: n, to: n });
  };
  const hlOf = (n: number) => app.highlights[docHlKey(doc.module, doc.title, n)];
  const setHl = (c: HlColor | null) => { if (sel) for (let n = sel.from; n <= sel.to; n++) app.setHighlight(docHlKey(doc.module, doc.title, n), c); };
  const curHl = sel && hlOf(sel.from) ? hlName(hlOf(sel.from)) : undefined;
  const copySel = () => {
    const t = selText();
    if (!t) return;
    navigator.clipboard.writeText(`${t}\n— ${selLabel}`);
    app.toast(`Copied ${sel!.from === sel!.to ? "paragraph" : "paragraphs"} ${sel!.from}${sel!.to !== sel!.from ? `–${sel!.to}` : ""}`);
  };
  // ⌘C copies the selected paragraphs, unless text is selected with the mouse or a field has focus.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (!sel || (document.activeElement as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
      const s = window.getSelection();
      if (s && !s.isCollapsed && s.toString().trim()) return;
      if (!e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", `${selText()}\n— ${selLabel}`);
      app.toast("Copied");
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  });
  const noteOnSel = () => {
    if (!sel) return;
    const quote = selText().split("\n\n").map((p) => `> ${p}`).join("\n>\n");
    app.startEntry({ verses: [selLabel], title: `${doc.title} ¶${sel.from}${sel.to !== sel.from ? `–${sel.to}` : ""}`, body: `${quote}\n\n` });
  };
  const selMarked = !!sel && marked(sel.from - 1);
  const toolbar = sel && (
    <div className="vtool fold-doc" role="toolbar" aria-label="Paragraph actions" style={{ top: -44, left: 44 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", gap: 6, padding: "0 6px 0 4px" }}>
        {HL.map((c) => <button key={c} type="button" className="dot" aria-label={`Highlight ${c}`} title={`Highlight ${c}`} aria-pressed={curHl === c} style={{ background: HL_DOT[c], outline: curHl === c ? "2px solid #fff" : undefined }} onClick={() => setHl(curHl === c ? null : c)} />)}
      </div>
      <span className="sep" />
      {/* Labels show when the column has room, and fold to icons when it doesn't (.lbl, styles.css). */}
      <button type="button" className="tb" title={selMarked ? "Remove the bookmark" : "Bookmark this paragraph"} onClick={() => app.toggleDocBookmark({ module: doc.module, title: doc.title, kind, para: sel.from })}><Icon name="bookmark" style={{ fill: selMarked ? "currentColor" : "none" }} /><span className="lbl">{selMarked ? "Bookmarked" : "Bookmark"}</span></button>
      <button type="button" className="tb" title="Note: a journal entry quoting this, linked to it" onClick={noteOnSel}><Icon name="note" /><span className="lbl">Note</span></button>
      <button type="button" className="tb" title="Listen from here" onClick={() => listen(sel.from - 1)}><Icon name="speaker" /><span className="lbl">Listen from here</span></button>
      {canAsk && <button type="button" className="tb" title="Ask about this" onClick={() => askAbout(sel.from - 1)}><Icon name="chat" /><span className="lbl">Ask</span></button>}
      <button type="button" className="tb" title="Copy, with where it's from (⌘C)" onClick={copySel}><Icon name="copy" /><span className="lbl">Copy<span style={{ opacity: 0.6 }}> ⌘C</span></span></button>
    </div>
  );

  // Journal entries linked to this chapter (any of its paragraphs), for the Notes tab.
  const notes = app.journal.filter((e) => e.verses.some((v) => { const l = parseDocLabel(v); return l && l.book === bookTitle && l.chapter === doc.title; }));

  // Opened from a bookmark: bring its paragraph into view and flash it, once the chapter is in.
  const [flash, setFlash] = useState<number | null>(null);
  useEffect(() => {
    const t = app.docPara;
    if (!t || !segs.length || t.module !== doc.module || t.title !== doc.title) return;
    app.clearDocPara();
    window.requestAnimationFrame(() => scroller.current?.querySelector(`[data-seg="${t.para}"]`)?.scrollIntoView({ block: "center" }));
    setFlash(t.para);
    const id = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(id);
  }, [app.docPara, segs, doc.module, doc.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // The word being read, highlighted as in the Bible reader: boxes in its style drawn behind the
  // word (where it wraps, one per line), so the book's own markup is left alone.
  const [wordBoxes, setWordBoxes] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  useEffect(() => {
    const place = () => {
      const seg = reading && app.settings.highlightWords && ps.char >= 0 ? scroller.current?.querySelector<HTMLElement>(`[data-seg="${ps.verse}"] .dsegtext`) : null;
      const r = seg ? wordRangeAt(seg, ps.char) : null;
      if (!seg || !r) { setWordBoxes((b) => (b.length ? [] : b)); return; }
      const o = seg.getBoundingClientRect();
      setWordBoxes([...r.getClientRects()].filter((x) => x.width > 0).map((x) => ({ left: x.left - o.left, top: x.top - o.top, width: x.width, height: x.height })));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [reading, ps.verse, ps.char, app.settings.highlightWords, segs]);

  // Keep the paragraph being read in view.
  useEffect(() => {
    if (reading && !ps.paused) scroller.current?.querySelector(`[data-seg="${ps.verse}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [reading, ps.verse, ps.paused]);

  useEffect(() => {
    setFilter("");
    const module = doc.module;
    let dead = false;
    (devo ? api.devotionTitles(module) : api.referenceTitles(module)).then((titles) => { if (!dead) setLoaded({ module, titles }); }).catch(() => { if (!dead) setLoaded({ module, titles: [] }); });
    return () => { dead = true; };
  }, [doc.module, devo]);

  // No chapter yet: a book starts at its first, a devotional at today's reading.
  useEffect(() => {
    if (doc.title || !titles.length) return;
    const today = dayTitle(new Date());
    app.openDoc(doc.module, devo ? (titles.includes(today) ? today : titles[0]) : titles[0], kind);
  }, [doc.title, doc.module, titles, app, devo, kind]);

  useEffect(() => {
    if (!doc.title) { setArt(null); return; }
    const module = doc.module, title = doc.title;
    let dead = false;
    (devo
      ? api.devotion(module, title).then((html) => (html ? { module, title: mod?.title ?? module, topic: title, html } : null))
      : api.article("reference", module, title)
    ).then((a) => { if (!dead) setArt(a); }).catch(() => { if (!dead) setArt(null); });
    scroller.current?.scrollTo({ top: 0 });
    list.current?.querySelector<HTMLElement>("[aria-current=true]")?.scrollIntoView({ block: "nearest" });
    return () => { dead = true; };
  }, [doc.module, doc.title]);

  // The list arrives after the first chapter is open: bring the current one into view.
  useEffect(() => { list.current?.querySelector<HTMLElement>("[aria-current=true]")?.scrollIntoView({ block: "nearest" }); }, [loaded]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? titles.filter((t) => t.toLowerCase().includes(q)) : titles;
  }, [titles, filter]);
  const go = (t: string | undefined) => { if (t) { hide(); app.openDoc(doc.module, t, kind); } };

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
          <button className="ibtn" type="button" aria-label="Previous chapter" title={`Previous ${unit} (←)`} disabled={i <= 0} onClick={() => go(titles[i - 1])}><Icon name="back" /></button>
          <div className="spacer" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", minWidth: 0 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title} · {mod?.title}</span></div>
          <button className={`ibtn ${reading ? "on" : ""}`} type="button" aria-label="Listen" title="Listen (space)" disabled={!segs.length} onClick={() => (reading ? player.toggle() : listen())}><Icon name="speaker" /></button>
          <TextSizeButton />
          <button className="btn" type="button" onClick={() => setFocus(false)}>Exit focus<span className="kbd">esc</span></button>
          <button className="ibtn" type="button" aria-label="Next chapter" title={`Next ${unit} (→)`} disabled={i < 0 || i >= titles.length - 1} onClick={() => go(titles[i + 1])}><Icon name="fwd" /></button>
        </header>
      ) : <Topbar right={
        <div style={{ display: "flex", gap: 2 }}>
          <button className={`ibtn ${reading ? "on" : ""}`} type="button" aria-label="Listen" title="Listen (space)" disabled={!segs.length} onClick={() => (reading ? player.toggle() : listen())}><Icon name="speaker" /></button>
          <TextSizeButton />
          <button className="ibtn" type="button" aria-label="Focus mode" title="Focus mode (⌘.)" onClick={() => setFocus(true)}><Icon name="focus" /></button>
          <button className={`ibtn ${app.settings.studyPane ? "on" : ""}`} type="button" aria-label="Study pane" title="Study pane: notes, dictionaries and Ask (⌘\)" onClick={() => app.set({ studyPane: !app.settings.studyPane })}><Icon name="pane" /></button>
        </div>
      }>
        <button className="btn" type="button" title="Back to the Bible" onClick={app.closeDoc}><Icon name="read" />{fmtRef(app.loc)}</button>
        <label className="btn" style={{ position: "relative", maxWidth: 320 }} title={mod?.title}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mod?.title ?? doc.module}</span>
          <Icon name="down" className="sm" style={{ color: "var(--muted)" }} />
          <select aria-label="Reference book" value={doc.module} onChange={(e) => app.openDoc(e.target.value, undefined, kind)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>
      </Topbar>}
      <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: focus ? "minmax(0,1fr)" : pane ? "260px minmax(0,1fr) 440px" : "260px minmax(0,1fr)" }}>
        {!focus && <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid var(--border)" }}>
          {titles.length > 12 && (
            <label className="field" style={{ margin: "10px 12px 4px" }}><Icon name="search" /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${titles.length} ${devo ? "days" : "chapters"}`} aria-label="Filter chapters" /></label>
          )}
          <div ref={list} className="scroll doclist" style={{ padding: "6px 8px 20px" }}>
            {shown.map((t) => <button key={t} type="button" aria-current={t === doc.title} className={t === doc.title ? "on" : ""} title={t} onClick={() => go(t)}>{t}</button>)}
            {!titles.length && <div className="n" style={{ padding: 10 }}>Loading…</div>}
          </div>
        </aside>}
        <main ref={scroller} className="scroll" style={{ padding: focus ? "0 40px 120px" : "0 40px 120px 36px" }} onClick={(e) => {
          // A click in the margin beside a paragraph selects it, as beside a verse; elsewhere clears.
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.margin !== undefined) {
            const seg = [...(scroller.current?.querySelectorAll<HTMLElement>("[data-seg]") ?? [])].find((el) => { const r = el.getBoundingClientRect(); return e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8; });
            if (seg) { clickPara(+seg.dataset.seg!, e.shiftKey); return; }
          }
          setSel(null);
        }}>
          <div data-margin style={focus ? { maxWidth: 1040, margin: "0 auto" } : undefined}>
            {focus ? (
              <div style={{ padding: "24px 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                <div className="label">{mod?.title}{titles.length ? ` · ${i + 1} of ${titles.length}` : ""}</div>
                <h1 data-quiet-anchor style={{ margin: 0, font: "400 40px/1.1 var(--display)", letterSpacing: "0.02em" }}>{doc.title}</h1>
              </div>
            ) : (
              <div style={{ padding: "18px 0 14px" }}>
                <div className="label">{mod?.title}{titles.length ? ` · ${i + 1} of ${titles.length}` : ""}</div>
                <h1 data-quiet-anchor style={{ margin: "6px 0 0", font: "500 30px/1.15 var(--display)" }}>{doc.title}</h1>
              </div>
            )}
            {art
              ? <div className="es prose selectable docbody clickwords" {...wordHover} onClick={(e) => {
                  e.stopPropagation();
                  const w = wordAt(e);
                  if (w) { setWord({ token: textToken(w.word), verse: 0, rect: w.rect }); return; }
                  const t = e.target as HTMLElement;
                  if (t.closest("a, button, img, .vtool") || window.getSelection()?.toString()) return;
                  const seg = t.closest<HTMLElement>("[data-seg]");
                  if (seg) clickPara(+seg.dataset.seg!, e.shiftKey);
                }} style={{ fontSize: focus ? "calc(var(--read-size) + 2px)" : "var(--read-size)", lineHeight: focus ? 1.85 : 1.7 }}>
                  {segs.map((h, k) => {
                    // Laid out as a verse row: number, text (highlighted line by line), and markers.
                    const n = k + 1;
                    const isSel = !!sel && n >= sel.from && n <= sel.to;
                    const hl = hlOf(n);
                    // A paragraph that is one <p> is shown inline, so its highlight follows the lines.
                    const onePara = /^\s*<p[\s>]/i.test(h) && (h.match(/<p[\s>]/gi)?.length ?? 0) === 1 && !/<(img|table|div|ul|ol)/i.test(h);
                    const noted = notes.some((e) => e.verses.some((v) => { const l = parseDocLabel(v); return !!l && l.book === bookTitle && l.chapter === doc.title && !!l.from && l.from <= n && n <= (l.to ?? l.from); }));
                    return (
                      <div key={k} data-seg={n} className={`v dseg ${isSel ? "sel" : ""} ${reading && ps.verse === n ? `speaking${app.settings.highlightWords ? "" : " tint"}` : ""} ${asking === k ? "asking" : ""} ${flash === n ? "flash" : ""}`} style={isSel && sel!.from === n ? { marginTop: 46 } : undefined}>
                        {isSel && sel!.from === n && toolbar}
                        <div className="vn dsegn"><span title="Click the paragraph (not a word) to select it · ⇧-click for a range">{n}</span></div>
                        <div className={`dsegtext ${onePara ? "inl" : ""}`}>
                          {reading && ps.verse === n && wordBoxes.map((b, j) => <span key={j} className="speakbox" style={b} />)}
                          <span className={hl ? `hl-${hlName(hl)}` : undefined}>
                          {renderHtml(h, { onRef: (r) => { hide(); app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read"); }, onRefHover, onStrongs: app.studyWord, onImage: setImage })}
                        </span></div>
                        <div className="gut">
                          {marked(k) && <Icon name="bookmark" style={{ fill: "var(--accent)" }} />}
                          {noted && <button className="ibtn" style={{ width: 16, height: 16 }} aria-label="Journal notes on this paragraph" title="Journal notes on this paragraph" onClick={(e) => { e.stopPropagation(); setTab("notes"); }}><Icon name="note" /></button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              : doc.title && <div className="n">Loading…</div>}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "28px 0 0" }}>
              {i > 0 ? <button className="btn" type="button" title={`Previous ${unit}: ${titles[i - 1]} (←)`} onClick={() => go(titles[i - 1])} style={{ maxWidth: "48%" }}><Icon name="back" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titles[i - 1]}</span></button> : <span />}
              {i >= 0 && i < titles.length - 1 ? <button className="btn" type="button" title={`Next ${unit}: ${titles[i + 1]} (→)`} onClick={() => go(titles[i + 1])} style={{ maxWidth: "48%" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titles[i + 1]}</span><Icon name="fwd" /></button> : <span />}
            </div>
          </div>
        </main>
        {!focus && pane && (
          <aside className="study" aria-label="Study pane" style={{ display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--border)", background: "var(--panel)" }}>
            <div className="tabs">
              {([["notes", "Notes", "Your journal entries on this " + unit], ["dictionary", "Dictionary", "Dictionary and encyclopedia articles"], ...(canAsk ? [["ask", "Ask", `Ask about this ${unit}, answered from the book`]] : [])] as [typeof tab, string, string][]).map(([t, l, tip]) => (
                <button key={t} type="button" className={`tab ${tab === t ? "on" : ""}`} title={tip} onClick={() => setTab(t)}>
                  {t === "ask" && <Icon name="chat" />}{l}{t === "notes" && notes.length > 0 && <span className="n">{notes.length}</span>}
                </button>
              ))}
            </div>
            {tab === "notes" && (
              <div className="scroll" style={{ flexGrow: 1, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="btn" type="button" style={{ alignSelf: "flex-start" }} onClick={() => (sel ? noteOnSel() : app.startEntry({ verses: [docLabel(bookTitle, doc.title)], title: doc.title }))}><Icon name="plus" size={13} />{sel ? `New note on ¶${sel.from}${sel.to !== sel.from ? `–${sel.to}` : ""}` : `New note on this ${unit}`}</button>
                {notes.length === 0 && <div className="hint">No journal entries on this {unit} yet. Select a paragraph and choose Note, or start one here.</div>}
                {notes.map((e) => {
                  const where = e.verses.map(parseDocLabel).filter((l) => l && l.book === bookTitle && l.chapter === doc.title).map((l) => (l!.from ? `¶${l!.from}${l!.to !== l!.from ? `–${l!.to}` : ""}` : `whole ${unit}`)).join(", ");
                  return (
                    <button key={e.id} type="button" className="card" style={{ textAlign: "left", padding: "10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }} title="Open in the journal" onClick={() => app.startEntry({ openId: e.id })}>
                      <b style={{ fontSize: 13 }}>{e.title || "Untitled"}</b>
                      <span className="n">{where} · {e.updated.slice(0, 10)}</span>
                      <span style={{ fontSize: 12.5, color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.body.replace(/^>\s?/gm, "").replace(/[#*_]/g, "").trim()}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {tab === "dictionary" && (
              <DictionaryTab dict={app.settings.studyDict} setDict={(d) => app.set({ studyDict: d })}
                onWord={(w, rect, where) => setWord({ token: textToken(w), verse: 0, rect, where })} />
            )}
            {tab === "ask" && canAsk && <>
            {asking !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                <Icon name="chat" size={13} style={{ color: "var(--accent)" }} /><span>Asking about paragraph {asking + 1}</span>
                <button className="btn small" type="button" style={{ marginLeft: "auto" }} onClick={() => setAsking(null)}>Whole chapter</button>
              </div>
            )}
            <AskPanel key={`${doc.module}|${doc.title}|${asking}`} full source="Reader" about={asking === null ? doc.title : `${doc.title} ¶${asking + 1}`}
              context={askContext} bookDir={() => exportBook().then((x) => x.dir)}
              hint={`Ask anything about ${asking === null ? `this ${unit}` : "this paragraph"}. The ${unit} goes with the question, and the model can search the rest of ${mod?.title ?? "the book"}${devo ? "" : " and look at its charts"} when it needs to.`}
              suggestions={suggestions} seed={askSeed} clearSeed={() => setAskSeed(null)} />
            </>}
          </aside>
        )}
      </div>
      {preview}
      {word && (
        <WordLookup pick={word} context={word.where ?? `${mod?.title ?? "This book"}, ${doc.title}`} bible={app.settings.bible} onClose={() => setWord(null)}
          onDictionary={(module, topic) => { setWord(null); app.set({ studyDict: { module, topic } }); setTab("dictionary"); }}
          onAsk={(q) => { setWord(null); setAskSeed(q); if (focus) setFocus(false); setTab("ask"); }} />
      )}
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

/** Opens a reference book or a devotional from the Bible reader; books read before come first. */
export function BooksButton() {
  const app = useApp();
  const [a, setA] = useState<DOMRect | null>(null);
  const books = (app.lib?.modules ?? []).filter((m) => m.kind === "reference");
  const devotionals = (app.lib?.modules ?? []).filter((m) => m.kind === "devotional");
  if (!books.length && !devotionals.length) return null;
  const last = Object.keys(app.docAt);
  const sorted = [...books].sort((x, y) => (last.includes(y.id) ? 1 : 0) - (last.includes(x.id) ? 1 : 0) || x.title.localeCompare(y.title));
  return (
    <>
      <button className="btn" type="button" title="Read a reference book" onClick={(e) => setA(e.currentTarget.getBoundingClientRect())}><Icon name="library" />Books<Icon name="down" className="sm" style={{ color: "var(--muted)" }} /></button>
      {a && (
        <Popover anchor={a} onClose={() => setA(null)} width={340}>
          <div className="doclist" style={{ padding: 6, maxHeight: 460, overflowY: "auto" }}>
            {devotionals.length > 0 && <div className="label" style={{ padding: "6px 10px 4px" }}>Devotionals · today</div>}
            {devotionals.map((m) => <button key={m.id} type="button" title={m.title} onClick={() => { setA(null); app.openDoc(m.id, dayTitle(new Date()), "devotional"); }}>{m.title}</button>)}
            {devotionals.length > 0 && books.length > 0 && <div className="label" style={{ padding: "10px 10px 4px" }}>Books</div>}
            {sorted.map((m) => <button key={m.id} type="button" title={m.title} onClick={() => { setA(null); app.openDoc(m.id); }}>{m.title}{app.docAt[m.id] && <span className="n" style={{ marginLeft: 8 }}>{app.docAt[m.id]}</span>}</button>)}
          </div>
        </Popover>
      )}
    </>
  );
}
