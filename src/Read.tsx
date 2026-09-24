import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Verse, Voice } from "./api";
import { book, fmtRef, nextChapter, parseRef, prevChapter, Ref, sectionOf, testament } from "./bible";
import { alignStrongs, plainText, Token, tokenize } from "./esword";
import { Icon, Pause, Play } from "./icons";
import { BibleSelect, RefButton, SearchField, Topbar } from "./Shell";
import { usePlayer } from "./speech";
import { HlColor, hlName, useApp, vkey } from "./state";
import { StudyPane, StudyTab } from "./StudyPane";
import { Popover, RefPicker, Seg } from "./ui";
import { WordLookup } from "./WordLookup";
import { BooksButton } from "./DocReader";
import { useAssistant } from "./assistant";

export interface WordPick { token: Token; verse: number; rect: DOMRect }

const HL: HlColor[] = ["red", "orange", "yellow", "green", "blue", "purple"];
const HL_DOT: Record<HlColor, string> = { red: "#e59a92", orange: "#efb97e", yellow: "#e9d271", green: "#a9cf9f", blue: "#9fc0e6", purple: "#c1a9e3" };

/** Journal entries that mention a verse, by "b.c.v". */
export function useNotesByVerse() {
  const { journal } = useApp();
  return useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of journal) for (const v of e.verses) {
      const r = parseRef(v);
      if (!r) continue;
      const from = r.verse ?? 1, to = r.to ?? r.verse ?? 200;
      for (let i = from; i <= Math.min(to, 200); i++) { const k = vkey(r.book, r.chapter, i); m.set(k, [...(m.get(k) ?? []), e.id]); }
    }
    return m;
  }, [journal]);
}

export function VerseText({ tokens, red, speakingChar, onWord, activeWi, showNums }: { tokens: Token[]; red: boolean; speakingChar?: number; onWord?: (t: Token, el: HTMLElement) => void; activeWi?: number; showNums: boolean }) {
  return (
    <>
      {tokens.map((t, i) => {
        const cls = [t.red && red ? "red" : ""].join(" ");
        const inner = t.italic ? <i>{t.text}</i> : t.text;
        if (!t.word) return <span key={i} className={cls || undefined}>{inner}</span>;
        const speaking = speakingChar !== undefined && speakingChar >= t.at && speakingChar < t.at + t.text.length;
        return (
          <Fragment key={i}>
            <span className={`w ${cls} ${activeWi === t.wi ? "on" : ""} ${speaking ? "speaking" : ""}`} onClick={(e) => { e.stopPropagation(); onWord?.(t, e.currentTarget); }}>{inner}</span>
            {showNums && t.showNums?.map((n) => <span key={n} className="strongs" data-num={n} style={{ font: "500 10px var(--ui)", color: "var(--accent)", verticalAlign: "super", marginLeft: 1 }}>{n}</span>)}
          </Fragment>
        );
      })}
    </>
  );
}

export function ReadScreen({ focus, setFocus, openPalette }: { focus: boolean; setFocus: (f: boolean) => void; openPalette: () => void }) {
  const app = useApp();
  const canAsk = useAssistant().available;
  const { loc, settings } = app;
  const player = usePlayer();
  const bible = settings.bible;
  const bmod = app.mod("bible", bible);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [strongVerses, setStrongVerses] = useState<Map<number, string>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null);
  const [word, setWord] = useState<WordPick | null>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  // The study pane's choices are remembered between sessions.
  const tab = settings.studyTab, dict = settings.studyDict, commentary = settings.studyCommentary, follow = settings.studyFollow;
  const setTab = (t: StudyTab) => app.set({ studyTab: t });
  const setDict = (d: { module: string; topic: string } | null) => app.set({ studyDict: d });
  const setCommentary = (m: string | null) => app.set({ studyCommentary: m });
  const setFollow = (f: boolean) => app.set({ studyFollow: f });
  const [askSeed, setAskSeed] = useState<string | null>(null);
  const [studyVerse, setStudyVerse] = useState<number>(loc.verse ?? 1);
  const scroller = useRef<HTMLDivElement>(null);
  const notes = useNotesByVerse();

  // Another screen asked for a dictionary article, a commentary or a question here.
  useEffect(() => {
    const x = app.pending;
    if (!x) return;
    if (x.article) { setDict(x.article); setTab("dictionary"); }
    if (x.commentary) { setCommentary(x.commentary); setTab("commentary"); }
    if (x.ask !== undefined) { setAskSeed(x.ask || null); setTab("ask"); }
    if (!settings.studyPane) app.set({ studyPane: true });
    app.setPending(null);
  }, [app.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let dead = false;
    setErr(null);
    api.chapter(bible, loc.book, loc.chapter).then((v) => { if (!dead) setVerses(v); }).catch((e) => !dead && setErr(String(e)));
    // A Bible without Strong's numbers borrows them from its Strong's edition when the text is the same (KJV from KJV+).
    const sb = app.strongsBible;
    if (sb && bmod && !bmod.strongs && /^kjv/i.test(bmod.abbrev)) {
      api.chapter(sb, loc.book, loc.chapter).then((v) => !dead && setStrongVerses(new Map(v.map((x) => [x.v, x.text])))).catch(() => {});
    } else setStrongVerses(new Map());
    return () => { dead = true; };
  }, [bible, loc.book, loc.chapter, app.strongsBible, bmod]);

  useEffect(() => {
    if (loc.verse) { setSel({ from: loc.verse, to: loc.to ?? loc.verse }); setStudyVerse(loc.verse); } else { setSel(null); setStudyVerse(1); }
  }, [loc.book, loc.chapter, loc.verse, loc.to]);

  // Scroll the chosen verse into view once the chapter is on screen.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (loc.verse) el.querySelector(`[data-v="${loc.verse}"]`)?.scrollIntoView({ block: "center" });
    else el.scrollTop = 0;
  }, [verses, loc.verse]);

  // Follow the verse being read aloud.
  const reading = player.state.on && player.state.bible === bible && player.state.book === loc.book && player.state.chapter === loc.chapter;
  useEffect(() => {
    if (reading) scroller.current?.querySelector(`[data-v="${player.state.verse}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [reading, player.state.verse]);
  // When reading carries on into the next chapter, turn the page.
  useEffect(() => {
    if (player.state.on && player.state.bible === bible && (player.state.book !== loc.book || player.state.chapter !== loc.chapter) && player.state.verse === 1)
      app.open({ book: player.state.book, chapter: player.state.chapter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.state.book, player.state.chapter]);

  const tokens = useMemo(() => {
    const m = new Map<number, Token[]>();
    for (const v of verses) {
      let t = tokenize(v.text);
      const s = strongVerses.get(v.v);
      if (s) t = alignStrongs(t, tokenize(s));
      m.set(v.v, t);
    }
    return m;
  }, [verses, strongVerses]);

  const selRef: Ref | null = sel ? { book: loc.book, chapter: loc.chapter, verse: sel.from, to: sel.to !== sel.from ? sel.to : undefined } : null;

  const clickVerse = (v: number, e: React.MouseEvent) => {
    // The reading area behind clears the selection on click; this click must not reach it.
    e.stopPropagation();
    if (e.shiftKey && sel) setSel({ from: Math.min(sel.from, v), to: Math.max(sel.to, v) });
    else if (sel && sel.from === v && sel.to === v) { setSel(null); return; }
    else setSel({ from: v, to: v });
    if (follow) setStudyVerse(v);
  };

  const go = useCallback((d: 1 | -1) => {
    const n = d > 0 ? nextChapter(loc.book, loc.chapter) : prevChapter(loc.book, loc.chapter);
    if (n) app.open({ book: n[0], chapter: n[1] });
  }, [app, loc.book, loc.chapter]);

  // Arrow keys turn the page; N adds a note; Space plays or pauses.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable='true'], select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") { go(1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { go(-1); e.preventDefault(); }
      else if (e.key === "Escape" && focus) setFocus(false);
      else if (e.key.toLowerCase() === "n" && selRef) { app.startEntry({ verses: [fmtRef(selRef)] }); e.preventDefault(); }
      else if (e.key === " ") {
        e.preventDefault();
        if (player.state.on) player.toggle(); else player.play(bible, loc.book, loc.chapter, sel?.from);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go, focus, setFocus, selRef, app, player, bible, loc.book, loc.chapter, sel]);

  const copy = () => {
    const c = copyText();
    if (!c) return;
    navigator.clipboard.writeText(c.text);
    app.toast(c.label);
  };

  const copyText = useCallback(() => {
    if (!sel) return null;
    const vs = verses.filter((v) => v.v >= sel.from && v.v <= sel.to);
    const nums = settings.copyNumbers;
    const r = { book: loc.book, chapter: loc.chapter, verse: sel.from, to: sel.to !== sel.from ? sel.to : undefined };
    return { text: `${vs.map((v) => (nums ? `${v.v} ` : "") + plainText(v.text)).join(" ")}\n${fmtRef(r)} ${bmod?.abbrev ?? ""}`.trim(), label: `Copied ${fmtRef(r)}${nums ? " with verse numbers" : ""}` };
  }, [sel, verses, settings.copyNumbers, loc.book, loc.chapter, bmod]);

  // ⌘C (which the Edit menu turns into a copy event) copies the selected verses, unless some
  // text has been selected with the mouse or the focus is in a text field.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const t = document.activeElement as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      const s = window.getSelection();
      if (s && !s.isCollapsed && s.toString().trim()) return;
      const c = copyText();
      if (!c || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", c.text);
      app.toast(c.label);
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [copyText, app]);

  const isBookmarked = (v: number) => app.bookmarks.some((b) => b.ref.book === loc.book && b.ref.chapter === loc.chapter && (b.ref.verse ?? 0) <= v && v <= (b.ref.to ?? b.ref.verse ?? 0));
  const selBookmarked = !!sel && app.bookmarks.some((b) => b.ref.book === loc.book && b.ref.chapter === loc.chapter && b.ref.verse === sel.from && (b.ref.to ?? b.ref.verse) === sel.to);
  const setHl = (c: HlColor | null) => {
    if (!sel) return;
    for (let v = sel.from; v <= sel.to; v++) app.setHighlight(vkey(loc.book, loc.chapter, v), c);
  };
  const saved = sel ? app.highlights[vkey(loc.book, loc.chapter, sel.from)] : undefined;
  const curHl = saved ? hlName(saved) : undefined;

  const pickWord = (t: Token, v: number, el: HTMLElement) => {
    setWord({ token: t, verse: v, rect: el.getBoundingClientRect() });
    if (follow) setStudyVerse(v);
  };

  const toolbar = sel && (
    <div className="vtool" role="toolbar" aria-label="Verse actions" style={{ top: -44, left: 44 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", gap: 6, padding: "0 6px 0 4px" }}>
        {HL.map((c) => <button key={c} type="button" className="dot" aria-label={`Highlight ${c}`} aria-pressed={curHl === c} style={{ background: HL_DOT[c], outline: curHl === c ? "2px solid #fff" : undefined }} onClick={() => setHl(curHl === c ? null : c)} />)}
      </div>
      <span className="sep" />
      <button type="button" className="tb" onClick={() => app.toggleBookmark(selRef!, bible)}><Icon name="bookmark" style={{ fill: selBookmarked ? "currentColor" : "none" }} />{selBookmarked ? "Bookmarked" : "Bookmark"}</button>
      <button type="button" className="tb" onClick={() => app.startEntry({ verses: [fmtRef(selRef!)] })}><Icon name="note" />Note<span style={{ opacity: 0.6 }}>N</span></button>
      <button type="button" className="tb" onClick={() => app.open({ ...loc, verse: sel.from, to: sel.to }, "compare")}><Icon name="compare" />Compare</button>
      <button type="button" className="tb" onClick={() => player.play(bible, loc.book, loc.chapter, sel.from)}><Icon name="speaker" />Listen from here</button>
      {canAsk && <button type="button" className="tb" onClick={() => { setTab("ask"); setAskSeed(null); }}><Icon name="chat" />Ask</button>}
      <button type="button" className="tb" title={settings.copyNumbers ? "Copy with verse numbers (⌘C)" : "Copy without verse numbers (⌘C)"} onClick={copy}><Icon name="copy" />Copy<span style={{ opacity: 0.6 }}>⌘C</span></button>
      <button type="button" className="tb" aria-pressed={settings.copyNumbers} title="Include verse numbers when copying" onClick={() => app.set({ copyNumbers: !settings.copyNumbers })} style={{ padding: "0 7px", opacity: settings.copyNumbers ? 1 : 0.5, textDecoration: settings.copyNumbers ? undefined : "line-through" }}>#</button>
    </div>
  );

  const header = (
    <div style={{ minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: focus ? "24px 0 8px" : "4px 0" }}>
      {focus ? (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div className="label">{sectionOf(loc.book)} · {testament(loc.book)}</div>
          <h1 data-quiet-anchor style={{ margin: 0, font: "400 46px/1 var(--display)", letterSpacing: "0.02em" }}>{book(loc.book).name} <span style={{ color: "var(--muted)" }}>{loc.chapter}</span></h1>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 data-quiet-anchor style={{ margin: 0, font: "500 30px/1 var(--display)" }}>{book(loc.book).name} {loc.chapter}</h1>
            <span style={{ color: "var(--muted)" }}>{bmod?.title ?? bible} · {verses.length} verses</span>
          </div>
          <Seg value={settings.layout} options={[["paragraph", "Paragraph"], ["verse", "Verse"]]} onChange={(v) => app.set({ layout: v })} />
        </>
      )}
    </div>
  );

  const body = settings.layout === "verse" && !focus ? (
    <div className="verses">
      {verses.map((v) => {
        const k = vkey(loc.book, loc.chapter, v.v);
        const isSel = !!sel && v.v >= sel.from && v.v <= sel.to;
        const hl = app.highlights[k];
        const hasNote = settings.showNotes && notes.has(k);
        return (
          <div key={v.v} data-v={v.v} className={`v ${isSel ? "sel" : ""}`} style={isSel && sel!.from === v.v && toolbar ? { marginTop: 46 } : undefined} onClick={(e) => clickVerse(v.v, e)}>
            {isSel && sel!.from === v.v && toolbar}
            <div className="vn">{v.v}</div>
            <div className="vt selectable"><span className={hl ? `hl-${hlName(hl)}` : undefined}>
              <VerseText tokens={tokens.get(v.v) ?? []} red={settings.redLetters} speakingChar={reading && player.state.verse === v.v && settings.highlightWords ? player.state.char : undefined} onWord={(t, el) => pickWord(t, v.v, el)} activeWi={word?.verse === v.v ? word.token.wi : undefined} showNums={!!bmod?.strongs} />
            </span></div>
            <div className="gut">
              {isBookmarked(v.v) && <Icon name="bookmark" style={{ fill: "var(--accent)" }} />}
              {hasNote && <button className="ibtn" style={{ width: 16, height: 16 }} aria-label="Journal notes on this verse" title="Journal notes on this verse" onClick={(e) => { e.stopPropagation(); setStudyVerse(v.v); setTab("notes"); }}><Icon name="note" style={{ color: "var(--accent)" }} /></button>}
              {reading && player.state.verse === v.v && <Icon name="speaker" />}
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div style={{ position: "relative", maxWidth: focus ? 1040 : undefined, margin: focus ? "0 auto" : undefined, paddingTop: sel && !focus ? 46 : 0 }}>
      {!focus && sel && <div style={{ position: "sticky", top: 0, zIndex: 20, height: 0 }}><div style={{ position: "relative", top: -44 }}>{toolbar}</div></div>}
      <p className="para selectable" style={{ margin: 0, fontSize: focus ? 21 : undefined, lineHeight: focus ? 1.85 : undefined }}>
        {verses.map((v) => {
          const k = vkey(loc.book, loc.chapter, v.v);
          const isSel = !!sel && v.v >= sel.from && v.v <= sel.to;
          const hl = app.highlights[k];
          return (
            <span key={v.v} data-v={v.v} className={`pv ${isSel ? "sel" : ""}`} onClick={(e) => clickVerse(v.v, e)}>
              <span className="vnum">{v.v}</span>
              <span className={hl ? `hl-${hlName(hl)}` : undefined}><VerseText tokens={tokens.get(v.v) ?? []} red={settings.redLetters} speakingChar={reading && player.state.verse === v.v && settings.highlightWords ? player.state.char : undefined} onWord={(t, el) => pickWord(t, v.v, el)} activeWi={word?.verse === v.v ? word.token.wi : undefined} showNums={!!bmod?.strongs && !focus} /></span>{" "}
            </span>
          );
        })}
      </p>
    </div>
  );

  const wordRef: Ref | null = word ? { book: loc.book, chapter: loc.chapter, verse: word.verse } : null;

  return (
    <div className="main" style={{ minHeight: 0 }}>
      {focus ? (
        <header className="topbar drag" style={{ borderBottom: 0, paddingLeft: 84 }}>
          <button className="ibtn" type="button" aria-label="Previous chapter" onClick={() => go(-1)}><Icon name="back" /></button>
          <div className="spacer" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>{book(loc.book).name} {loc.chapter} · {bmod?.title}</div>
          <button className={`ibtn ${player.state.on ? "on" : ""}`} type="button" aria-label="Listen" onClick={() => (player.state.on ? player.toggle() : player.play(bible, loc.book, loc.chapter))}><Icon name="speaker" /></button>
          <TextSizeButton />
          <button className="btn" type="button" onClick={() => setFocus(false)}>Exit focus<span className="kbd">esc</span></button>
          <button className="ibtn" type="button" aria-label="Next chapter" onClick={() => go(1)}><Icon name="fwd" /></button>
        </header>
      ) : (
        <Topbar right={
          <div style={{ display: "flex", gap: 2 }}>
            <button className={`ibtn ${player.state.on ? "on" : ""}`} type="button" aria-label="Listen" title="Listen (space)" onClick={() => (player.state.on ? player.toggle() : player.play(bible, loc.book, loc.chapter, sel?.from))}><Icon name="speaker" /></button>
            <TextSizeButton />
            <button className="ibtn" type="button" aria-label="Focus mode" title="Focus mode (⌘.)" onClick={() => setFocus(true)}><Icon name="focus" /></button>
            <button className={`ibtn ${settings.studyPane ? "on" : ""}`} type="button" aria-label="Study pane" title="Study pane (⌘\\)" onClick={() => app.set({ studyPane: !settings.studyPane })}><Icon name="pane" /></button>
          </div>
        }>
          <RefButton onClick={() => setPicker(document.activeElement?.getBoundingClientRect() ?? new DOMRect(300, 40, 100, 20))} />
          <BibleSelect value={bible} onChange={(id) => app.set({ bible: id })} />
          <BooksButton />
          <SearchField onOpen={openPalette} />
        </Topbar>
      )}
      <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: !focus && settings.studyPane ? "minmax(0,1fr) 520px" : "minmax(0,1fr)" }}>
        <main ref={scroller} className="scroll" style={{ position: "relative", padding: focus ? "0 40px 120px" : "0 40px 120px 36px" }} onClick={() => setSel(null)}>
          {header}
          {err ? <div className="err" style={{ padding: 20 }}>{err}</div> : body}
          <ChapterNav onGo={go} />
        </main>
        {!focus && settings.studyPane && (
          <StudyPane tab={tab} setTab={setTab} book={loc.book} chapter={loc.chapter} verse={studyVerse} selRef={selRef} verses={verses}
            follow={follow} setFollow={setFollow} dict={dict} setDict={setDict} askSeed={askSeed} clearAskSeed={() => setAskSeed(null)}
            commentary={commentary} setCommentary={setCommentary} />
        )}
      </div>
      <PlayerBar focus={focus} />
      {word && wordRef && (
        <WordLookup pick={word} vref={wordRef} bible={bible} onClose={() => setWord(null)}
          onDictionary={(module, topic) => { setDict({ module, topic }); setTab("dictionary"); setWord(null); if (!settings.studyPane) app.set({ studyPane: true }); }}
          onCommentary={(m) => { setCommentary(m); setTab("commentary"); setStudyVerse(word.verse); setWord(null); if (!settings.studyPane) app.set({ studyPane: true }); }}
          onAsk={(q) => { setAskSeed(q); setTab("ask"); setWord(null); if (focus) setFocus(false); if (!settings.studyPane) app.set({ studyPane: true }); }} />
      )}
      {picker && <RefPicker anchor={picker} initialBook={loc.book} onClose={() => setPicker(null)} onPick={(b, c, v) => { setPicker(null); app.open({ book: b, chapter: c, verse: v }); }} />}
      {focus && <div style={{ position: "fixed", bottom: 18, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 18, color: "var(--muted)", fontSize: 12, pointerEvents: "none" }}>
        <span>Click any word to look it up</span><span>·</span><span><span className="kbd">space</span> listen</span><span>·</span><span><span className="kbd">←</span> <span className="kbd">→</span> chapters</span>
      </div>}
    </div>
  );
}

function ChapterNav({ onGo }: { onGo: (d: 1 | -1) => void }) {
  const { loc } = useApp();
  const p = prevChapter(loc.book, loc.chapter), n = nextChapter(loc.book, loc.chapter);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "28px 10px 0" }} onClick={(e) => e.stopPropagation()}>
      {p ? <button className="btn" type="button" onClick={() => onGo(-1)}><Icon name="back" />{book(p[0]).name} {p[1]}</button> : <span />}
      {n ? <button className="btn" type="button" onClick={() => onGo(1)}>{book(n[0]).name} {n[1]}<Icon name="fwd" /></button> : <span />}
    </div>
  );
}

export function TextSizeButton() {
  const app = useApp();
  const [a, setA] = useState<DOMRect | null>(null);
  return (
    <>
      <button className="ibtn" type="button" aria-label="Text size" onClick={(e) => setA(e.currentTarget.getBoundingClientRect())}><Icon name="textsize" /></button>
      {a && (
        <Popover anchor={a} onClose={() => setA(null)} width={260}>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="label">Text size · {app.settings.readSize}px</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12 }}>A</span>
              <input type="range" min={14} max={28} value={app.settings.readSize} onChange={(e) => app.set({ readSize: +e.target.value })} style={{ flexGrow: 1 }} aria-label="Text size" />
              <span style={{ fontSize: 18 }}>A</span>
            </div>
            <label className="opt"><input type="checkbox" checked={app.settings.redLetters} onChange={(e) => app.set({ redLetters: e.target.checked })} />Words of Jesus in red</label>
          </div>
        </Popover>
      )}
    </>
  );
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/** The player floats over the reading column: clear of the sidebar and the study pane. */
export function PlayerBar({ focus = false }: { focus?: boolean }) {
  const app = useApp();
  const p = usePlayer();
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [sleepMenu, setSleepMenu] = useState<DOMRect | null>(null);
  // Tick while a sleep timer runs, so the countdown stays current.
  const [, tick] = useState(0);
  // Esc closes the player, once nothing nearer has used it: a menu, the palette, a search box, focus mode.
  useEffect(() => {
    if (!p.state.on) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || focus || menu || sleepMenu) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      p.stop();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [p, focus, menu, sleepMenu]);
  useEffect(() => {
    if (!p.state.sleepAt) return;
    const t = window.setInterval(() => tick((x) => x + 1), 15000);
    return () => window.clearInterval(t);
  }, [p.state.sleepAt]);
  if (!p.state.on) return null;
  const s = p.state;
  const pct = s.count ? Math.round(((s.verse - 1) / s.count) * 100) : 0;
  const minsLeft = s.sleepAt ? Math.max(1, Math.ceil((s.sleepAt - Date.now()) / 60000)) : 0;
  const sleepLabel = s.sleepAt ? `${minsLeft} min` : s.sleepEndOfChapter ? "end of ch." : "";
  const SLEEP: [number | "chapter" | null, string][] = [[15, "In 15 minutes"], [30, "In 30 minutes"], [60, "In an hour"], ["chapter", "At the end of this chapter"], [null, "Off"]];
  return (
    <div role="region" aria-label="Listen" style={{ position: "fixed", left: focus ? 0 : 200, right: app.screen === "read" && !focus && app.settings.studyPane ? 520 : 0, bottom: 18, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 40 }}>
      <div style={{ pointerEvents: "auto", width: "min(600px, calc(100% - 48px))", height: 56, display: "flex", alignItems: "center", gap: 14, padding: "0 10px 0 8px", borderRadius: 28, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 10px 30px var(--shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button className="ibtn" type="button" aria-label={s.doc ? "Previous paragraph" : "Previous verse"} onClick={() => p.skip(-1)}><Icon name="prev" /></button>
          <button type="button" aria-label={s.paused ? "Play" : "Pause"} onClick={p.toggle} style={{ width: 40, height: 40, borderRadius: "50%", border: 0, background: "var(--accent)", color: "var(--onaccent)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{s.paused ? <Play /> : <Pause />}</button>
          <button className="ibtn" type="button" aria-label={s.doc ? "Next paragraph" : "Next verse"} onClick={() => p.skip(1)}><Icon name="next" /></button>
        </div>
        <button type="button" onClick={() => (s.doc ? app.openDoc(s.doc.module, s.doc.title, s.doc.kind) : app.open({ book: s.book, chapter: s.chapter, verse: s.verse }, "read"))} style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7, border: 0, background: "transparent", cursor: "pointer", textAlign: "left", padding: 0 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap", width: "100%" }}>{s.doc
            ? <><b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{s.doc.title}</b><span className="n" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{app.mod(s.doc.kind ?? "reference", s.doc.module)?.abbrev}</span></>
            : <><b style={{ fontSize: 13 }}>{book(s.book).name} {s.chapter}:{s.verse}</b><span className="n">{app.mod("bible", s.bible)?.abbrev}</span></>}<span className="n" style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{s.verse} of {s.count}</span></span>
          <span style={{ position: "relative", height: 3, borderRadius: 999, background: "var(--border)", width: "100%" }}><span style={{ position: "absolute", left: 0, top: 0, width: `${pct}%`, height: 3, borderRadius: 999, background: "var(--accent)" }} /><span style={{ position: "absolute", left: `${pct}%`, top: -3, width: 9, height: 9, marginLeft: -4, borderRadius: "50%", background: "var(--accent)" }} /></span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button type="button" aria-label="Speed and voice" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())} style={{ height: 28, padding: "0 10px", borderRadius: 999, border: 0, background: "var(--accentsoft)", color: "var(--accent)", fontWeight: 600, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{app.settings.rate}×</button>
          <button className={`ibtn ${sleepLabel ? "on" : ""}`} type="button" aria-label={sleepLabel ? `Sleep timer: ${sleepLabel}` : "Sleep timer"} title={sleepLabel ? `Stops ${s.sleepAt ? "in " + sleepLabel : "at the end of the chapter"}` : "Sleep timer"} onClick={(e) => setSleepMenu(e.currentTarget.getBoundingClientRect())} style={sleepLabel ? { width: "auto", padding: "0 8px", gap: 5, fontSize: 11.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" } : undefined}><Icon name="moon" />{sleepLabel}</button>
          <button className="ibtn" type="button" aria-label="Stop and close" onClick={p.stop}><Icon name="x" /></button>
        </div>
      </div>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} width={300} place="above" style={{ pointerEvents: "auto" }}>
          <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="label">Speed</span><b>{app.settings.rate}×</b></div>
              <div className="seg" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
                {SPEEDS.map((r) => <button key={r} type="button" className={app.settings.rate === r ? "on" : ""} onClick={() => app.set({ rate: r })}>{r}</button>)}
              </div>
              <input type="range" min={0.5} max={2} step={0.05} value={app.settings.rate} onChange={(e) => app.set({ rate: Math.round(+e.target.value * 100) / 100 })} aria-label="Fine speed" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Voice</span>
              <VoiceSelect />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <label className="opt"><input type="checkbox" checked={app.settings.continueChapter} onChange={(e) => app.set({ continueChapter: e.target.checked })} />Continue into the next chapter</label>
              <label className="opt"><input type="checkbox" checked={app.settings.readNumbers} onChange={(e) => app.set({ readNumbers: e.target.checked })} />Read verse numbers aloud</label>
            </div>
          </div>
        </Popover>
      )}
      {sleepMenu && (
        <Popover anchor={sleepMenu} onClose={() => setSleepMenu(null)} width={250} place="above" style={{ pointerEvents: "auto" }}>
          <div style={{ padding: 6, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 10px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="label">Sleep timer</span>
              <span className="hint">{s.sleepAt ? `Stops in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}, at the end of the verse it is reading.` : s.sleepEndOfChapter ? `Stops at the end of ${book(s.book).name} ${s.chapter}.` : "Off. Reading carries on until you stop it."}</span>
            </div>
            {SLEEP.map(([m, l]) => {
              const on = s.sleepChoice === m;
              return (
                <button key={String(m)} type="button" className="bm" aria-pressed={on} style={{ minHeight: 30, background: on ? "var(--accentsoft)" : undefined, color: on ? "var(--accent)" : undefined, fontWeight: on ? 600 : undefined }}
                  onClick={() => { p.sleep(m); setSleepMenu(null); app.toast(m === null ? "Sleep timer off" : m === "chapter" ? `Stops at the end of ${book(s.book).name} ${s.chapter}` : `Stops in ${m} minutes`); }}>
                  <span className="t">{l}</span>{on && <span className="r"><Icon name="check" /></span>}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </div>
  );
}

export function VoiceSelect() {
  const app = useApp();
  const { voices } = usePlayer();
  const cur = voices.find((v) => v.id === app.settings.voice) ?? voices.find((v) => v.name === app.settings.voice) ?? voices.find((v) => v.default) ?? voices[0];
  const label = (v: Voice) => `${v.name} · ${new Intl.DisplayNames(["en"], { type: "language" }).of(v.lang) ?? v.lang}`;
  return (
    <label className="btn" style={{ position: "relative", justifyContent: "space-between", width: "100%" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{cur ? label(cur) : "System voice"}</span>
      <Icon name="down" className="sm" style={{ color: "var(--muted)" }} />
      <select aria-label="Voice" value={cur?.id ?? ""} onChange={(e) => app.set({ voice: e.target.value })} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
        {voices.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
      </select>
    </label>
  );
}
