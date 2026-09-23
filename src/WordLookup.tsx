import { useEffect, useState } from "react";
import { api, Coverage, TopicHit } from "./api";
import { fmtRef, Ref } from "./bible";
import { concordanceRenderings, headwords, lexiconParts, renderHtml } from "./esword";
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
            <div className="es" style={{ font: "400 14.5px/1.5 var(--serif)" }}>{renderHtml(l.rest, { onStrongs: (n) => { app.studyWord(n); onClose(); } })}</div>
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
