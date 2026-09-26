import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ModuleInfo } from "./api";
import { AskPanel } from "./Ask";
import { Icon } from "./icons";
import { Topbar } from "./Shell";
import { useApp } from "./state";
import { bibleBooks } from "./ui";

/** Where the King James Version came from: the manuscript traditions, the printed editions the
 * translators worked from (1604–1611), the English Bibles before it, and which of them, or what
 * comes closest, is in the user's library. */

interface Source {
  id: string;
  name: string;
  date: string;
  note: string;
  /** What it drew on (ids of other sources). */
  from?: string[];
  /** Library Bibles that are this text, and ones that come closest, by title or abbreviation. */
  have?: RegExp;
  near?: RegExp;
  nearNote?: string;
}

const TIERS: { name: string; hint: string; items: Source[] }[] = [
  {
    name: "Manuscript traditions",
    hint: "The handwritten copies behind the printed texts",
    items: [
      { id: "mt", name: "Masoretic Hebrew", date: "copies c. 900–1500", note: "The Hebrew Old Testament as the Masoretes fixed its letters, vowels and accents. The KJV's Old Testament follows it.", have: /Westminster Leningrad|Hebrew Old Testament \(Tanach\)/i },
      { id: "byz", name: "Byzantine Greek", date: "copies c. 400–1500", note: "The Greek New Testament as most surviving manuscripts give it. The printed Greek editions of the 1500s were made from a handful of late Byzantine copies.", have: /Byzantine/i },
      { id: "vul", name: "Latin Vulgate", date: "Jerome, c. 382–405", note: "The Latin Bible of the Western church for a thousand years; the translators consulted it throughout.", have: /Clementine/i, near: /Latin Vulgate/i, nearNote: "A modern critical edition of Jerome's text, not the Clementine the translators knew (it lacks 1 John 5:7 and Acts 8:37)." },
      { id: "lxx", name: "Septuagint", date: "Greek, c. 250–100 BC", note: "The Greek Old Testament, quoted by the apostles. Consulted for hard Hebrew passages.", have: /Greek Old Testament \(Septuagint\)|Septuagint LXX Greek/i, near: /Brenton/i, nearNote: "Brenton's English translation (1844)." },
      { id: "tg", name: "Aramaic Targums", date: "c. 100–700", note: "Aramaic paraphrases of the Hebrew read in the synagogue; printed in the Rabbinic Bibles and polyglots the translators used.", have: /^Targum/i },
      { id: "syr", name: "Syriac Peshitta", date: "c. 150–450", note: "An early Syriac translation; its New Testament was printed in the Antwerp Polyglot and by Tremellius (1569).", have: /Peshitta|Syriac/i },
    ],
  },
  {
    name: "Printed editions the translators used",
    hint: "On the desks of the six companies at Westminster, Oxford and Cambridge",
    items: [
      { id: "bomberg", name: "Rabbinic Bible", date: "Bomberg, 1524–25", note: "Jacob ben Chayyim's edition of the Masoretic text with the Targums: the standard Hebrew Bible of the day.", from: ["mt", "tg"], have: /^Hebrew Bible \(Ginsburg/i, near: /Westminster Leningrad|Hebrew Old Testament \(Tanach\)/i, nearNote: "The same Masoretic text from the Leningrad Codex." },
      { id: "compl", name: "Complutensian Polyglot", date: "Alcalá, 1514–17", note: "Hebrew, Greek, Latin and Aramaic in parallel columns; the first printed Greek New Testament.", from: ["mt", "lxx", "vul", "tg", "byz"] },
      { id: "antwerp", name: "Antwerp Polyglot", date: "Plantin, 1569–72", note: "Hebrew, Greek, Latin, the Targums and the Syriac New Testament.", from: ["mt", "lxx", "vul", "tg", "syr"] },
      { id: "erasmus", name: "Erasmus' Greek NT", date: "1516–1535", note: "The first published Greek New Testament, from about seven late Byzantine manuscripts; the root of the Textus Receptus.", from: ["byz", "vul"], near: /Textus Receptus/i, nearNote: "Stephanus' 1550 text, built on Erasmus'." },
      { id: "stephanus", name: "Stephanus' Greek NT", date: "1550", note: "Robert Estienne's edition of Erasmus' text with readings from other manuscripts: the Textus Receptus.", from: ["byz"], have: /Textus Receptus/i },
      { id: "beza", name: "Beza's Greek NT", date: "1588–89, 1598", note: "Theodore Beza's revisions of the Textus Receptus, the translators' main Greek text.", from: ["byz"], have: /^Greek NT: Beza \(1598\)( w\/ glosses)?$/i, near: /Textus Receptus|\(Interlinear\)/i, nearNote: "Scrivener's 1894 reconstruction of the KJV's Greek (shown as variants in TR+, and σ in INT+) follows Beza where the KJV does." },
      { id: "tremellius", name: "Tremellius–Junius Latin", date: "1575–79", note: "A Protestant Latin translation from the Hebrew, with Tremellius' Latin of the Syriac New Testament.", from: ["mt", "syr"] },
      { id: "sixtine", name: "Sixtine Septuagint", date: "Rome, 1587", note: "The Septuagint printed from Codex Vaticanus.", from: ["lxx"], have: /^Septuagint \(Greek, Brenton/i, near: /Brenton|Greek Old Testament \(Septuagint\)/i, nearNote: "Brenton's English (1844) translates a text descended from the Sixtine; Rahlfs' Greek (1935) also rests mainly on Vaticanus." },
      { id: "clementine", name: "Clementine Vulgate", date: "1592", note: "The Vulgate as revised under Pope Clement VIII.", from: ["vul"], have: /Clementine/i, near: /Latin Vulgate/i, nearNote: "A modern critical edition of the Vulgate, not the Clementine." },
    ],
  },
  {
    name: "English Bibles before it",
    hint: "Rule 1: follow the Bishops' Bible, “as little altered as the truth of the original will permit”",
    items: [
      { id: "tyndale", name: "Tyndale", date: "NT 1526, Pentateuch 1530", note: "The first English New Testament from the Greek; much of the KJV's wording is his.", from: ["erasmus", "mt"], have: /Tyndale/i },
      { id: "coverdale", name: "Coverdale", date: "1535", note: "The first complete printed English Bible, largely from Tyndale, the Latin and Luther.", from: ["tyndale", "vul"], have: /Coverdale/i },
      { id: "matthew", name: "Matthew's Bible", date: "1537", note: "Tyndale's work completed with Coverdale's, by John Rogers.", from: ["tyndale", "coverdale"], have: /Matthew'?s Bible/i },
      { id: "great", name: "Great Bible", date: "1539", note: "The first English Bible authorised for the churches.", from: ["matthew"], have: /Great Bible/i },
      { id: "geneva", name: "Geneva Bible", date: "1560", note: "The Reformers' Bible, with notes; from the Hebrew and Beza's Greek. Shakespeare's and the Pilgrims' Bible.", from: ["great", "beza", "bomberg"], have: /Geneva/i },
      { id: "bishops", name: "Bishops' Bible", date: "1568; 1602 edition", note: "The official English Bible; the 1602 printing was the base text the translators revised.", from: ["great", "geneva"], have: /Bishops/i },
      { id: "rheims", name: "Rheims New Testament", date: "1582", note: "The Catholic English New Testament from the Vulgate; the translators borrowed some of its words.", from: ["vul"], have: /^Rheims New Testament \(1582\)$/i, near: /Douay|Rheims/i, nearNote: "Challoner's 1750 revision of the Douay-Rheims." },
    ],
  },
];

const ALL = TIERS.flatMap((t) => t.items);
const KJV: Source = { id: "kjv", name: "King James Version", date: "1611 (text of 1769)", note: "Made by about 47 scholars in six companies, 1604–1611, from the editions above.", have: /^King James Version$/i };

/** The library's Bibles that are this text, and the others that come closest or are related. */
function matches(s: Source, bibles: ModuleInfo[]) {
  const test = (re: RegExp | undefined) => (b: ModuleInfo) => !!re && (re.test(b.title) || re.test(b.abbrev));
  const have = bibles.filter(test(s.have));
  return { have, near: bibles.filter((b) => test(s.near)(b) && !have.includes(b)) };
}

/** Chips grouped into lines: a Bible with its + edition ("wlc" and "wlc+"), each other alone, in order. */
function pairs<T extends { m: ModuleInfo }>(xs: T[]): T[][] {
  const rows = new Map<string, T[]>();
  for (const x of xs) {
    const base = x.m.id.replace(/\+$/, "");
    rows.set(base, [...(rows.get(base) ?? []), x]);
  }
  return [...rows.values()].map((r) => r.sort((a, b) => Number(a.m.id.endsWith("+")) - Number(b.m.id.endsWith("+"))));
}

/** Whether a module has books of the Old Testament, of the New, or of both. */
interface Coverage { ot: boolean; nt: boolean }
const coverageOf = (books: Set<number>): Coverage => ({ ot: [...books].some((b) => b <= 39), nt: [...books].some((b) => b >= 40 && b <= 66) });

/** "OT", "NT" or "OT & NT", for a chip's tooltip. */
function coverageText(c: Coverage): string {
  return c.ot && c.nt ? "OT & NT" : c.ot ? "OT" : c.nt ? "NT" : "";
}

const names = (ms: ModuleInfo[]) => ms.map((m) => `${m.title} (${m.abbrev})`).join(", ");
const status = (s: Source, bibles: ModuleInfo[]) => {
  const { have, near } = matches(s, bibles);
  return have.length ? `in the library as ${names(have)}${near.length ? `; related there: ${names(near)}` : ""}` : near.length ? `not in the library; closest there: ${names(near)}` : "not in the library";
};

/** The history, summarised for Ask: every source, what it drew on, and whether the user has it. */
export function historySummary(bibles: ModuleInfo[]): string {
  const name = (id: string) => ALL.find((s) => s.id === id)?.name ?? id;
  const line = (s: Source) => `- ${s.name} (${s.date}): ${s.note}${s.from ? ` Drew on: ${s.from.map(name).join(", ")}.` : ""} ${status(s, bibles)[0].toUpperCase()}${status(s, bibles).slice(1)}.`;
  return "The user is looking at a diagram of where the King James Version came from, and which of its sources are in their library. " +
    "The translators (about 47 scholars in six companies, 1604–1611) worked from printed editions, each resting on manuscript traditions, and revised the English Bibles before them.\n\n" +
    TIERS.map((t) => `${t.name} (${t.hint}):\n${t.items.map(line).join("\n")}`).join("\n\n") +
    `\n\n${line(KJV)}\n\nWhen answering, the user's own library modules can be named as ones to read.`;
}

export function KjvHistoryScreen() {
  const app = useApp();
  const bibles = app.bibles;
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<{ a: string; b: string; d: string }[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const edges: [string, string][] = [...ALL.flatMap((s) => (s.from ?? []).map((f) => [f, s.id] as [string, string])), ...TIERS.slice(1).flatMap((t) => t.items.map((s) => [s.id, "kjv"] as [string, string]))];

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const o = el.getBoundingClientRect();
      setLines(edges.flatMap(([a, b]) => {
        const ea = cards.current.get(a), eb = cards.current.get(b);
        if (!ea || !eb) return [];
        const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
        const x1 = ra.left + ra.width / 2 - o.left, y1 = ra.bottom - o.top, x2 = rb.left + rb.width / 2 - o.left, y2 = rb.top - o.top;
        // Same tier (Tyndale → Coverdale): from its side, over the top.
        if (Math.abs(ra.top - rb.top) < 4) {
          const ya = ra.top - o.top;
          return [{ a, b, d: `M${x1},${ya} C${x1},${ya - 28} ${x2},${ya - 28} ${x2},${ya}` }];
        }
        const my = (y1 + y2) / 2;
        return [{ a, b, d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` }];
      }));
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The hovered card's ancestors and descendants.
  const lit = new Set<string>();
  if (hover) {
    const up = (id: string) => { if (lit.has(id + "^")) return; lit.add(id + "^"); lit.add(id); edges.filter(([, b]) => b === id).forEach(([a]) => up(a)); };
    const down = (id: string) => { if (lit.has(id + "v")) return; lit.add(id + "v"); lit.add(id); edges.filter(([a]) => a === id).forEach(([, b]) => down(b)); };
    up(hover); down(hover);
  }
  const on = (id: string) => !hover || lit.has(id);

  const open = (m: ModuleInfo) => { app.set({ bible: m.id }); app.go("read"); };
  // Which parts of the Bible each module covers, for the bars on the chips.
  const [cov, setCov] = useState<Record<string, Coverage>>({});
  useEffect(() => {
    let live = true;
    Promise.all(bibles.map((b) => bibleBooks(b.id).then((books) => [b.id, coverageOf(books)] as const))).then((r) => { if (live) setCov(Object.fromEntries(r)); });
    return () => { live = false; };
  }, [bibles]);
  // Not when the name already says: "Westminster Leningrad Codex (Hebrew OT)", "Rheims New Testament (1582)".
  const covTip = (m: ModuleInfo) => (cov[m.id] && coverageText(cov[m.id]) && !/\b(OT|NT|Old Testament|New Testament|Tanach)\b/i.test(m.title) ? ` (${coverageText(cov[m.id])})` : "");
  const haveCount = ALL.filter((s) => matches(s, bibles).have.length).length;
  const nearCount = ALL.filter((s) => { const m = matches(s, bibles); return !m.have.length && m.near.length; }).length;

  const card = (s: Source, wide = false) => {
    const { have, near } = matches(s, bibles);
    const status = have.length ? "have" : near.length ? "near" : "none";
    return (
      <div key={s.id} ref={(e) => { if (e) cards.current.set(s.id, e); else cards.current.delete(s.id); }} className={`ks-card ks-${status}`}
        style={{ minWidth: wide ? 300 : 168, width: "max-content", maxWidth: 340, opacity: on(s.id) ? 1 : 0.35 }} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}
        title={[s.note, near.length ? s.nearNote : ""].filter(Boolean).join("\n\n")}>
        <b style={{ font: "600 13px/1.25 var(--ui)" }}>{s.name}</b>
        <span className="n" style={{ fontSize: 11.5 }}>{s.date}</span>
        {/* One resource to a line, but a Bible and its + edition (WLC, WLC+) side by side. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {pairs([...have.map((m) => ({ m, kind: "have" as const })), ...near.map((m, i) => ({ m, kind: !have.length && i === 0 ? "closest" as const : "rel" as const }))]).map((row) => (
            <div key={row[0].m.id} style={{ display: "flex", gap: 3 }}>
              {row.map(({ m, kind }, i) => {
                // Beside its plain edition, a + edition is just "+" (its name is in the tooltip).
                const label = i > 0 ? "+" : m.abbrev;
                return kind === "have"
                  ? <button key={m.id} type="button" className="ks-chip ks-chip-have" title={`Read ${m.title}${covTip(m)}`} onClick={() => open(m)}>{i === 0 && <Icon name="check" size={11} />}{label}</button>
                  // The closest stands in for a text the library lacks; the rest are related.
                  : <button key={m.id} type="button" className={`ks-chip ${kind === "closest" ? "ks-chip-near" : "ks-chip-rel"}`} title={`${kind === "closest" ? "Closest" : "Related"}: ${m.title}${covTip(m)}`} onClick={() => open(m)}>{i === 0 ? (kind === "closest" ? "Closest: " : "Related: ") : ""}{label}</button>;
              })}
            </div>
          ))}
          {!have.length && !near.length && <span className="ks-chip">Not in library</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="main">
      <Topbar right={
        <button className={`btn ${asking ? "on" : ""}`} type="button" title="Ask about the KJV's history and sources" onClick={() => setAsking(!asking)}><Icon name="chat" />Ask</button>
      } />
      <div style={{ flexGrow: 1, minHeight: 0, display: "grid", gridTemplateColumns: asking ? "minmax(0,1fr) 440px" : "minmax(0,1fr)" }}>
        <div className="scroll" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "20px 28px 0", flexWrap: "wrap" }}>
            <div style={{ flexGrow: 1, minWidth: 320 }}>
              <h1 style={{ margin: 0, font: "500 30px/1.1 var(--display)" }}>Where the King James Version came from</h1>
              <div className="hint" style={{ fontSize: 12.5, marginTop: 6 }}>The translators worked from printed editions, each resting on manuscript traditions. {haveCount} of {ALL.length} are in your library, and the closest equivalent of {nearCount} more. Hover a card for its line of descent; click a chip to read it.</div>
            </div>
            <span className="ks-chip ks-chip-have" style={{ cursor: "default" }}>In library</span>
            <span className="ks-chip ks-chip-near" style={{ cursor: "default" }}>Closest</span>
            <span className="ks-chip ks-chip-rel" style={{ cursor: "default" }}>Related</span>
            <span className="ks-chip" style={{ cursor: "default" }}>Not in library</span>
          </div>
          <div ref={box} style={{ position: "relative", padding: "22px 24px 40px", display: "flex", flexDirection: "column", gap: 44 }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {lines.map((l, i) => {
                const hi = hover && lit.has(l.a) && lit.has(l.b);
                return <path key={i} d={l.d} fill="none" stroke={hi ? "var(--accent)" : "var(--border)"} strokeWidth={hi ? 2 : 1.2} opacity={hover && !hi ? 0.25 : 1} />;
              })}
            </svg>
            {TIERS.map((t) => (
              <section key={t.name} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "center", flexWrap: "wrap" }}><span className="label">{t.name}</span><span className="n" style={{ fontSize: 11.5 }}>{t.hint}</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>{t.items.map((s) => card(s))}</div>
              </section>
            ))}
            <div style={{ display: "flex", justifyContent: "center" }}>{card(KJV, true)}</div>
          </div>
        </div>
        {asking && (
          <aside aria-label="Ask" style={{ borderLeft: "1px solid var(--border)", background: "var(--panel)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <AskPanel full source="KJV history" about="Where the KJV came from" context={() => historySummary(bibles)}
              hint="The diagram's history and your library's sources go with the question."
              suggestions={["Summarise how the KJV came to be", "Why did the translators follow the Bishops' Bible?", "Which of these sources should I add to my library next, and why?", "How does the Textus Receptus differ from the Greek behind modern translations?"]} />
          </aside>
        )}
      </div>
    </div>
  );
}
