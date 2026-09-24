import { useEffect, useRef, useState } from "react";
import { api, Coverage, TopicHit } from "./api";
import { fmtRef, Ref } from "./bible";
import { concordanceRenderings, headwords, lexiconParts, plainText, renderHtml } from "./esword";
import { Icon } from "./icons";
import { WordPick } from "./Read";
import { useApp } from "./state";
import { orderModules, short } from "./StudyPane";
import { Popover } from "./ui";

interface Lex { num: string; word: string; translit: string; pron: string; rest: string; renderings: [string, number][] }

export function useLexicon(nums: string[]) {
  const app = useApp();
  const [lex, setLex] = useState<Lex[]>([]);
  const key = nums.join(",");
  useEffect(() => {
    let dead = false;
    if (!app.lexicon || !nums.length) { setLex([]); return; }
    Promise.all(nums.map(async (num) => {
      const a = await api.article("lexicon", app.lexicon!, num);
      const c = app.concordance ? await api.article("lexicon", app.concordance, num).catch(() => null) : null;
      const parts = a ? lexiconParts(a.html) : { word: "", translit: "", pron: "", rest: "" };
      return { num, ...parts, renderings: c ? concordanceRenderings(c.html) : [] };
    })).then((x) => !dead && setLex(x));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, app.lexicon, app.concordance]);
  return lex;
}

export function WordLookup({ pick, vref, bible, onClose, onDictionary, onCommentary, onAsk }: {
  pick: WordPick; vref: Ref; bible: string; onClose: () => void;
  onDictionary: (module: string, topic: string) => void; onCommentary: (module: string) => void; onAsk: (q: string) => void;
}) {
  const app = useApp();
  const word = pick.token.text;
  const lex = useLexicon(pick.token.strongs);
  const [topics, setTopics] = useState<TopicHit[]>([]);
  const [cov, setCov] = useState<Coverage[]>([]);
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const h of headwords(word)) {
        const t = await api.findTopics(h);
        if (t.length) { if (!dead) setTopics(orderModules(t.map((x) => ({ ...x, id: x.module })), app.settings.dictionaryOrder).slice(0, 6)); return; }
      }
      if (!dead) setTopics([]);
    })();
    api.coverage(vref.book, vref.chapter, vref.verse!).then((c) => !dead && setCov(orderModules(c.filter((x) => x.range && x.id !== app.tsk), app.settings.commentaryOrder)));
    return () => { dead = true; };
  }, [word, vref.book, vref.chapter, vref.verse, app.tsk, app.settings.dictionaryOrder, app.settings.commentaryOrder]);

  const range = (c: Coverage) => (c.range && (c.range[1] !== c.range[3] || c.range[0] !== c.range[2]) ? ` ${c.range[0]}:${c.range[1]}–${c.range[2] !== c.range[0] ? c.range[2] + ":" : ""}${c.range[3]}` : "");
  const lang = (n: string) => (n.startsWith("H") ? "Hebrew" : "Greek");
  return (
    <Popover anchor={pick.rect} onClose={onClose} width={420}>
      <div role="dialog" aria-label={`Look up: ${word}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 10px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ font: "600 19px/1 var(--serif)" }}>{word}</span><span className="n">{fmtRef(vref)} · {app.mod("bible", bible)?.abbrev}</span>
          <button className="ibtn" type="button" aria-label="Close" style={{ marginLeft: "auto" }} onClick={onClose}><Icon name="x" /></button>
        </div>
        {lex.map((l) => (
          <div key={l.num} style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="label">{lang(l.num)}</span>
              <span style={{ font: "400 26px/1 var(--display)" }} lang={l.num.startsWith("H") ? "he" : "grc"}>{l.word}</span>
              <i style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{l.translit}</i>
              <a style={{ marginLeft: "auto", fontSize: 12 }} onClick={() => { app.studyWord(l.num); onClose(); }}>{l.num}</a>
            </div>
            {l.pron && <div className="n">{l.pron}</div>}
            <div className="es" style={{ font: "400 14.5px/1.5 var(--serif)" }}>{renderHtml(l.rest, { onStrongs: (n) => { app.studyWord(n); onClose(); }, inlineNums: true })}</div>
            {l.renderings.length > 0 && <div className="n" style={{ fontWeight: 400 }}>KJV translates it {l.renderings.slice(0, 7).map(([w, n], i) => <span key={w}>{i > 0 && " · "}<b style={{ color: w.toLowerCase() === word.toLowerCase() ? "var(--text)" : undefined }}>{w}</b> {n}</span>)}</div>}
          </div>
        ))}
        {!lex.length && pick.token.strongs.length === 0 && <div className="hint" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>This Bible has no Strong's numbers, so the Greek or Hebrew isn't shown. The KJV+ shows it.</div>}
        {topics.length > 0 && (
          <div style={{ padding: "10px 8px 6px", borderBottom: "1px solid var(--border)" }}>
            <div className="label" style={{ padding: "0 8px 4px" }}>Dictionaries</div>
            {topics.map((t) => <button key={t.module + t.topic} type="button" className="bm" style={{ minHeight: 30 }} onClick={() => onDictionary(t.module, t.topic)}><span className="t">{t.topic}</span><span className="r">{t.title}</span></button>)}
          </div>
        )}
        {cov.length > 0 && (
          <div style={{ padding: "10px 16px 12px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--border)" }}>
            <div className="label">Commentary on this verse</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{cov.map((c) => <button key={c.id} type="button" className="rchip" onClick={() => onCommentary(c.id)}>{short(c)}{range(c)}</button>)}</div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${lex.length ? 3 : 2}, minmax(0,1fr))` }}>
          {lex.length > 0 && <button type="button" style={{ height: 40, border: 0, background: "transparent", cursor: "pointer", color: "var(--accent)", borderRight: "1px solid var(--border)" }} onClick={() => { app.studyWord(lex[0].num); onClose(); }}>Word study</button>}
          <button type="button" style={{ height: 40, border: 0, background: "transparent", cursor: "pointer", color: "var(--accent)", borderRight: "1px solid var(--border)" }} onClick={() => { app.searchText(word); onClose(); }}>Search “{word}”</button>
          <button type="button" style={{ height: 40, border: 0, background: "transparent", cursor: "pointer", color: "var(--accent)" }} onClick={() => onAsk(`What does “${word}” mean in ${fmtRef(vref)}?`)}>Ask Claude</button>
        </div>
      </div>
    </Popover>
  );
}

/**
 * Hovering a Strong's number anywhere (the superscripts in the KJV+ and in commentaries) shows its
 * lexicon entry. One listener for the whole window, so every screen gets it without wiring.
 */
export function StrongsHover() {
  const app = useApp();
  const [show, setShow] = useState<{ num: string; rect: DOMRect; lex: Lex | null } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const cache = useRef(new Map<string, Promise<Lex | null>>());
  useEffect(() => {
    const load = (num: string) => {
      let p = cache.current.get(num);
      if (!p) {
        p = (async () => {
          if (!app.lexicon) return null;
          const a = await api.article("lexicon", app.lexicon, num);
          if (!a) return null;
          const c = app.concordance ? await api.article("lexicon", app.concordance, num).catch(() => null) : null;
          return { num, ...lexiconParts(a.html), renderings: c ? concordanceRenderings(c.html) : [] };
        })().catch(() => null);
        cache.current.set(num, p);
      }
      return p;
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.(".strongs") as HTMLElement | null;
      if (!el || el.contains(e.relatedTarget as Node)) return;
      // The full number is in data-num where the text shows it shortened ("25" for G25 on Compare).
      const num = (el.dataset.num || el.textContent || "").trim();
      if (!/^[GH]\d+[a-z]?$/i.test(num)) return;
      window.clearTimeout(timer.current);
      const rect = el.getBoundingClientRect();
      timer.current = window.setTimeout(async () => {
        const n = num[0].toUpperCase() + num.slice(1);
        const lex = await load(n);
        setShow({ num: n, rect, lex });
      }, 300);
    };
    const out = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.(".strongs");
      if (!el || el.contains(e.relatedTarget as Node)) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setShow(null), 120);
    };
    const hide = () => { window.clearTimeout(timer.current); setShow(null); };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("mousedown", hide);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("mousedown", hide);
    };
  }, [app.lexicon, app.concordance]);
  if (!show) return null;
  const { rect, lex } = show;
  const above = rect.top > 280;
  const def = lex ? plainText(lex.rest) : "";
  return (
    <div className="popover" style={{ left: Math.max(12, Math.min(rect.left - 40, window.innerWidth - 340)), top: above ? rect.top - 8 : rect.bottom + 8, transform: above ? "translateY(-100%)" : undefined, width: 320, padding: "12px 14px", pointerEvents: "none", zIndex: 90 }}>
      {lex ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ font: "500 20px var(--display)" }} lang={show.num.startsWith("H") ? "he" : "grc"}>{lex.word}</span>
            <i style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{lex.translit}</i>
            <span className="n" style={{ marginLeft: "auto" }}>{show.num}</span>
          </div>
          <div style={{ font: "400 14px/1.5 var(--serif)", marginTop: 6, maxHeight: 150, overflow: "hidden" }}>{def.length > 320 ? def.slice(0, 317) + "…" : def}</div>
          {lex.renderings.length > 0 && <div className="n" style={{ marginTop: 8 }}>KJV: {lex.renderings.slice(0, 5).map(([w, n]) => `${w} (${n})`).join(", ")}</div>}
        </>
      ) : <div className="n">{show.num}: not in your lexicon.</div>}
    </div>
  );
}
