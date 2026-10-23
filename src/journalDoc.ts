// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The journal's printed document (JournalPrint.tsx prints it to a PDF): a cover, the assistant's
// overview when asked for, "In your words" (what recurs across the entries, worked out here from
// their text) and the entries, each with a date rail beside it. Laid out by the #print-root rules
// in styles.css.

import { JournalEntry } from "./api";
import { book, BOOKS, fmtRef, parseRef, Ref } from "./bible";
import { escHtml } from "./dom";
import { mdPlain, mdToHtml } from "./md";

export type Quote = { ref: string; verses: { v: number; text: string }[] };
export type Overview = { overview: string; themes: { name: string; note: string; passages: string }[] };
export type Group = "none" | "tag" | "book";

export interface PrintDoc {
  title: string;
  /** Under the title on the cover: what the entries are. */
  about: string;
  /** In the order to print them. */
  entries: JournalEntry[];
  group: Group;
  /** The text of each verse written on the entries (by the reference as written); empty for none. */
  quotes: Map<string, Quote>;
  bibleAbbrev: string;
  insights: boolean;
  perPage: boolean;
  overview: Overview | null;
}

/** The fewest entries that get a cover and "In your words". */
export const COVER_FROM = 3;
/** The most entries printed at once. */
export const PRINT_MAX = 50;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
export const entryRefs = (e: JournalEntry) => e.verses.map((v) => parseRef(v)).filter((r): r is Ref => !!r);
/** "Psalms 75:3" → "75:3". */
const inBook = (r: Ref) => fmtRef(r).slice(book(r.book).name.length + 1);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ---- In your words ----

// Names and titles of God, longest first: each is counted, then taken out, so "Lord God Almighty"
// isn't counted again as "Lord".
const TITLES = [
  "Sovereign Lord God Almighty",
  "Sovereign Lord Almighty",
  "Lord God Almighty",
  "Lord Jesus Christ",
  "Lord Jesus",
  "Jesus Christ",
  "Almighty God",
  "God Almighty",
  "Abba Father",
  "Heavenly Father",
  "My Father in Heaven",
  "Our Father",
  "Father God",
  "Holy Spirit",
  "Alpha and Omega",
  "Creator of the universe",
  "King of kings",
  "Lord of lords",
  "Prince of Peace",
  "Good Shepherd",
  "Lamb of God",
  "my Saviour",
  "my Savior",
  "my Redeemer",
  "my Rock",
  "my Lord",
  "my God",
  "Father",
  "Lord",
  "Jesus",
];
const STOP = new Set(
  (
    "a about above after again against all also am an and any are around as at be because been before being below between both but by " +
    "can can't come could did do does doing done down during each even every everything few for from further get got had has have having " +
    "he her here hers him his how i i'm i've if in into is it it's its just let like made make many may me more most much must my myself " +
    "no nor not now of off on once one only or other our ours out over own please really same say she should so some still such than " +
    "that the their them then there these they thing things this those through to too under until up upon us very was way we well were " +
    "what when where which while who whom why will with would yet you you're your yours thank thanks amen today back day"
  ).split(" "),
);

/** An entry's own words: without the Ask exchanges quoted into it (lines starting ">"). */
const ownText = (e: JournalEntry) =>
  mdPlain(
    e.body
      .split("\n")
      .filter((l) => !l.startsWith(">"))
      .join("\n"),
  );
const tokens = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}' -]+/gu, " ")
    .split(/[\s-]+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);

export interface Insights {
  words: number;
  names: [string, number][];
  top: [string, number][];
  phrases: { text: string; entries: JournalEntry[] }[];
  highlights: { colour: string; text: string }[];
}

export function insights(entries: JournalEntry[]): Insights {
  const texts = entries.map(ownText);
  // How God is addressed.
  const names = new Map<string, number>();
  for (let t of texts) {
    t = t.replace(/\bthe Alpha and the Omega\b/gi, "Alpha and Omega");
    for (const n of TITLES) {
      const re = new RegExp(`\\b${n}\\b`, "gi");
      const k = (t.match(re) ?? []).length;
      if (!k) continue;
      names.set(n, (names.get(n) ?? 0) + k);
      t = t.replace(re, " ");
    }
  }
  // The words used most, leaving out the small ones.
  const toks = texts.map(tokens);
  const freq = new Map<string, number>();
  for (const t of toks) for (const w of t) if (w.length > 2 && !STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const top = [...freq]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12);
  // Phrases found in more than one entry: runs of four or more words, each as long as it goes.
  const shared = new Map<string, Set<number>>();
  toks.forEach((t, i) => {
    for (let k = 0; k + 4 <= t.length; k++) {
      const g = t.slice(k, k + 4).join(" ");
      let s = shared.get(g);
      if (!s) shared.set(g, (s = new Set()));
      s.add(i);
    }
  });
  const runs = new Set<string>();
  toks.forEach((t) => {
    let k = 0;
    while (k + 4 <= t.length) {
      if ((shared.get(t.slice(k, k + 4).join(" "))?.size ?? 0) < 2) {
        k++;
        continue;
      }
      let end = k + 4;
      while (end < t.length && (shared.get(t.slice(end - 3, end + 1).join(" "))?.size ?? 0) > 1) end++;
      runs.add(t.slice(k, end).join(" "));
      k = end;
    }
  });
  const padded = toks.map((t) => ` ${t.join(" ")} `);
  let phrases = [...runs]
    .filter((p) => p.split(" ").length >= 7 || p.split(" ").filter((w) => !STOP.has(w)).length >= 2)
    .map((p) => ({ p, in: padded.flatMap((t, i) => (t.includes(` ${p} `) ? [i] : [])) }))
    .filter((x) => x.in.length > 1);
  phrases = phrases.filter((x) => !phrases.some((y) => y.p !== x.p && y.p.includes(x.p) && y.in.length >= x.in.length));
  phrases.sort((a, b) => b.in.length - a.in.length || b.p.length - a.p.length);
  // What was highlighted.
  const highlights: { colour: string; text: string }[] = [];
  for (const e of entries)
    for (const m of e.body.matchAll(/<mark class="hl-(\w+)">(.+?)<\/mark>|(?<!\\)==(?=\S)(.+?)==/g))
      highlights.push({ colour: m[1] ?? "yellow", text: mdPlain(m[2] ?? m[3]) });
  return {
    words: texts.reduce((n, t) => n + (t ? t.split(/\s+/).length : 0), 0),
    names: [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    top,
    phrases: phrases.slice(0, 5).map((x) => ({ text: x.p, entries: x.in.map((i) => entries[i]) })),
    highlights: highlights.slice(0, 10),
  };
}

/** A 24-hour clock with a dot for each entry at the time it was started, night shaded. */
function clockSvg(entries: JournalEntry[]): string {
  const c = 100,
    r = 78;
  const pt = (h: number, rr: number) => {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    return [c + rr * Math.cos(a), c + rr * Math.sin(a)].map((n) => n.toFixed(1));
  };
  const out = [`<circle cx="${c}" cy="${c}" r="${r}" fill="#eef5fd" stroke="#d6dee7"/>`];
  const [x1, y1] = pt(21, r),
    [x2, y2] = pt(3, r);
  out.push(`<path d="M${c},${c} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z" fill="#0b2a4a"/>`);
  for (let h = 0; h < 24; h++) {
    const [a, b] = pt(h, r - (h % 6 ? 4 : 8)),
      [x, y] = pt(h, r);
    out.push(
      `<line x1="${a}" y1="${b}" x2="${x}" y2="${y}" stroke="${h >= 21 || h < 3 ? "#5c7896" : "#a9b6c4"}" stroke-width="${h % 6 ? 1 : 1.5}"/>`,
    );
  }
  for (const [h, l] of [
    [0, "midnight"],
    [6, "6"],
    [12, "noon"],
    [18, "18"],
  ] as const) {
    const [x, y] = pt(h, r + 13);
    out.push(`<text x="${x}" y="${+y + 3}" text-anchor="middle" font-size="9" font-weight="600" fill="#7d8794">${l}</text>`);
  }
  for (const e of entries) {
    const [hh, mm] = e.created.slice(11, 16).split(":").map(Number);
    const [x, y] = pt(hh + mm / 60, r - 22);
    out.push(`<circle cx="${x}" cy="${y}" r="5" fill="#2f81f7" stroke="#ffffff" stroke-width="1.5"/>`);
  }
  return `<svg class="clock" viewBox="0 0 200 200" font-family="-apple-system, 'Segoe UI', sans-serif">${out.join("")}</svg>`;
}

function clockText(entries: JournalEntry[]): string {
  const h = entries.map((e) => +e.created.slice(11, 13));
  const n = entries.length;
  const night = h.filter((x) => x >= 21 || x < 3).length,
    morning = h.filter((x) => x >= 4 && x < 10).length;
  if (night === n) return `All ${n} were started between 9 at night and 3 in the morning: prayers at the end of the day.`;
  if (morning === n) return `All ${n} were started between 4 and 10 in the morning: the first thing in the day.`;
  if (night > n / 2) return `${night} of ${n} were started between 9 at night and 3 in the morning.`;
  if (morning > n / 2) return `${morning} of ${n} were started between 4 and 10 in the morning.`;
  return `They were started at all times of the day.`;
}

// ---- The document ----

function quoteHtml(q: Quote, abbrev: string): string {
  const many = q.verses.length > 1;
  return `<blockquote class="vq">${q.verses.map((x) => (many ? `<sup>${x.v}</sup>` : "") + escHtml(x.text)).join(" ")}<cite>${escHtml(q.ref)}${abbrev ? ` · ${escHtml(abbrev)}` : ""}</cite></blockquote>`;
}

function entryHtml(e: JournalEntry, d: PrintDoc): string {
  const t = new Date(e.created);
  const quotes = e.verses
    .map((v) => d.quotes.get(v))
    .filter((q): q is Quote => !!q)
    .map((q) => quoteHtml(q, d.bibleAbbrev))
    .join("");
  const refs = d.quotes.size ? "" : e.verses.map((v) => `<span>${escHtml(v)}</span>`).join("");
  return `<article class="ent${d.perPage ? " pp" : ""}"><div class="rail"><div class="day">${t.getDate()}</div><div class="mon">${MONTHS[t.getMonth()]} ${t.getFullYear()}</div><div class="tm">${DAYS[t.getDay()]} · ${e.created.slice(11, 16)}</div><div class="tags">${refs}${e.tags.map((g) => `<span>#${escHtml(g)}</span>`).join("")}</div></div><div class="main"><h3>${escHtml(e.title || "Untitled")}</h3>${quotes}<div class="text">${mdToHtml(e.body, false)}</div></div></article>`;
}

/** The entries in their groups: by first tag (alphabetically) or by the book of the first verse
 *  (in Bible order), each entry once, those without one last. */
function groups(d: PrintDoc): { head: string | null; sub: string; entries: JournalEntry[] }[] {
  if (d.group === "none") return [{ head: null, sub: "", entries: d.entries }];
  const m = new Map<string, { sort: string | number; entries: JournalEntry[] }>();
  for (const e of d.entries) {
    const r = entryRefs(e)[0];
    const [k, sort]: [string, string | number] =
      d.group === "tag"
        ? e.tags[0]
          ? ["#" + e.tags[0], e.tags[0].toLowerCase()]
          : ["Untagged", "￿"]
        : r
          ? [book(r.book).name, r.book]
          : ["No verse", Infinity];
    if (!m.has(k)) m.set(k, { sort, entries: [] });
    m.get(k)!.entries.push(e);
  }
  return [...m]
    .sort(([, a], [, b]) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
    .map(([head, g]) => {
      const rs = g.entries.map((e) => entryRefs(e)[0]).filter((r): r is Ref => !!r);
      const sub =
        d.group === "book" && rs.length
          ? `${plural(g.entries.length, "entry", "entries")} on ${[...new Set(rs.map(inBook))].map((x) => `<b>${escHtml(x)}</b>`).join(", ")}`
          : plural(g.entries.length, "entry", "entries");
      return { head, sub, entries: g.entries };
    });
}

export function printHtml(d: PrintDoc): string {
  const es = d.entries;
  if (es.length < COVER_FROM) return es.map((e) => entryHtml(e, d)).join("");
  const out: string[] = [];
  const by = [...es].sort((a, b) => a.created.localeCompare(b.created));
  const first = by[0].created,
    last = by[by.length - 1].created;
  const span = first.slice(0, 10) === last.slice(0, 10) ? dayDate(first) : `${dayDate(first)} – ${dayDate(last)}`;
  const ins = insights(es);
  const allRefs = es.flatMap(entryRefs);
  const books = [...new Set(allRefs.map((r) => r.book))].sort((a, b) => a - b);
  const days = Math.round((new Date(last.slice(0, 10)).getTime() - new Date(first.slice(0, 10)).getTime()) / 864e5) + 1;
  // A verse for the cover: the shortest one quoted, so it fits.
  const coverQuote = [...d.quotes.values()]
    .filter((q) => q.verses.length === 1)
    .sort((a, b) => a.verses[0].text.length - b.verses[0].text.length)
    .find((q) => q.verses[0].text.length > 40);
  // The sheets, numbered as the contents lists them.
  const sheets: [string, string][] = [];
  if (d.overview) sheets.push(["Overview", "How the entries fit together"]);
  if (d.insights) sheets.push(["In your words", "What you say, and when"]);
  sheets.push([
    "The entries",
    d.group === "book" && books.length
      ? books.map((b) => book(b).name).join(" · ")
      : d.group === "tag"
        ? "By tag"
        : `${d.entries[0].created < d.entries[d.entries.length - 1].created ? "Oldest" : "Newest"} first`,
  ]);
  const roman = ["I", "II", "III"];
  const label = (name: string) => `${roman[sheets.findIndex(([n]) => n === name)]} · ${name}`;

  // Cover.
  const facts: [string | number, string][] = [
    [es.length, "entries"],
    [ins.words.toLocaleString("en-GB"), "words written"],
  ];
  if (books.length) facts.push([books.length, books.length === 1 ? "book of the Bible" : "books of the Bible"]);
  facts.push([days, days === 1 ? "day" : "days, first to last"]);
  let canon = "";
  if (books.length) {
    const touched = new Map<number, Set<number>>();
    for (const r of allRefs) {
      if (!touched.has(r.book)) touched.set(r.book, new Set());
      touched.get(r.book)!.add(r.chapter);
    }
    const canonBooks = BOOKS.slice(0, 66);
    const strip = canonBooks
      .map((b) => {
        const t = touched.get(b.n);
        const marks = t
          ? [...t].map((c) => `<span class="ch" style="left:${(((c - 0.5) / b.chapters) * 100).toFixed(2)}%"></span>`).join("")
          : "";
        return `<div class="bk${b.n > 39 ? " nt" : ""}${t ? " on" : ""}" style="flex:${b.chapters} 1 0">${marks}</div>`;
      })
      .join("");
    const ot = canonBooks.slice(0, 39).reduce((n, b) => n + b.chapters, 0),
      all = canonBooks.reduce((n, b) => n + b.chapters, 0);
    const keys = books
      .map((b) => {
        const rs = [...new Set(allRefs.filter((r) => r.book === b).map(inBook))];
        return `<div><b>${escHtml(book(b).name)}</b>${escHtml(rs.slice(0, 6).join(" · "))}${rs.length > 6 ? ` · ${rs.length - 6} more` : ""}</div>`;
      })
      .join("");
    canon = `<div class="canon-head"><span class="label">Where in the Bible</span><small>Each book drawn to its number of chapters</small></div><div class="canon">${strip}</div><div class="testaments"><span style="width:${((ot / all) * 100).toFixed(1)}%">Old Testament</span><span>New Testament</span></div><div class="canon-keys">${keys}</div>`;
  }
  out.push(
    `<section class="cover"><div class="band"><div class="label">Journal · ${escHtml(span)}</div><h1>${escHtml(d.title)}</h1><p class="lede">${escHtml(d.about)}</p>${
      coverQuote
        ? `<div class="cv">${escHtml(coverQuote.verses[0].text)}<cite>${escHtml(coverQuote.ref)}${d.bibleAbbrev ? ` · ${escHtml(d.bibleAbbrev)}` : ""}</cite></div>`
        : ""
    }</div><div class="facts">${facts.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("")}</div>${canon}<div class="contents">${sheets
      .map(([n, s], i) => `<div><span class="label">${roman[i]}</span><b>${n}</b>${escHtml(s)}</div>`)
      .join("")}</div></section>`,
  );

  // The assistant's overview.
  if (d.overview) {
    const [lead, ...rest] = d.overview.overview.split(/\n\s*\n/).filter((p) => p.trim());
    out.push(
      `<section class="sheet ov"><div class="label">${label("Overview")}</div><div class="lead">${mdToHtml(lead ?? "", false)}</div>${rest.length ? mdToHtml(rest.join("\n\n"), false) : ""}${
        d.overview.themes.length
          ? `<div class="themes">${d.overview.themes
              .map(
                (t) =>
                  `<div class="theme"><h4>${escHtml(t.name)}</h4><p>${escHtml(t.note)}</p>${t.passages ? `<div class="in">${escHtml(t.passages)}</div>` : ""}</div>`,
              )
              .join("")}</div>`
          : ""
      }<div class="by">Written by the AI assistant from the entries and their verses.</div></section>`,
    );
  }

  // In your words.
  if (d.insights) {
    let names = "",
      words = "",
      phrases = "",
      marks = "";
    if (ins.names.length) {
      const most = ins.names[0][1];
      names = `<div class="iw"><h2>How you address God</h2><p class="note">The names and titles you pray to, by how often you use them.</p><div class="names">${ins.names
        .slice(0, 14)
        .map(
          ([n, c]) =>
            `<span style="font-size:${(11 + ((c - 1) / Math.max(1, most - 1)) * 14).toFixed(1)}pt">${escHtml(n.charAt(0).toUpperCase() + n.slice(1))}<i>${c}×</i></span>`,
        )
        .join("")}</div></div>`;
    }
    if (ins.top.length) {
      const most = ins.top[0][1];
      words = `<div class="iw"><h2>Words you return to</h2><p class="note">The words used most, leaving out the small ones.</p><div class="bars">${ins.top
        .map(
          ([w, n]) =>
            `<span class="w">${escHtml(w)}</span><span class="b"><i style="width:${((n / most) * 100).toFixed(1)}%"></i></span><span class="n">${n}</span>`,
        )
        .join("")}</div></div>`;
    }
    if (ins.phrases.length)
      phrases = `<div class="iw wide"><h2>Phrases you repeat</h2><p class="note">Wording that comes back in more than one entry.</p><div class="phr">${ins.phrases
        .map(
          (p) =>
            `<div>“${escHtml(p.text)}”<small>${p.entries
              .slice(0, 4)
              .map((e) => escHtml(e.title || "Untitled"))
              .join(" · ")}${p.entries.length > 4 ? ` · ${p.entries.length - 4} more` : ""}</small></div>`,
        )
        .join("")}</div></div>`;
    const clock = `<div class="iw"><h2>When you write</h2><p class="note">Each entry by the time it was started.</p><div class="clockrow">${clockSvg(es)}<p>${escHtml(clockText(es))}</p></div></div>`;
    if (ins.highlights.length)
      marks = `<div class="iw"><h2>What you highlighted</h2><p class="note">Lines you marked, in their colours.</p><div class="marks">${ins.highlights
        .map((h) => `<div><mark class="hl-${escHtml(h.colour)}">${escHtml(h.text)}</mark></div>`)
        .join("")}</div></div>`;
    // Panels in pairs, each pair kept together; the phrases between them can run on to the next page.
    const row = (a: string, b: string) => (a || b ? `<div class="iwrow">${a}${b}</div>` : "");
    out.push(
      `<section class="sheet"><div class="label">${label("In your words")}</div>${row(names, words)}${phrases}${row(clock, marks)}</section>`,
    );
  }

  // The entries.
  const gs = groups(d);
  gs.forEach((g, i) => {
    const head = g.head
      ? `<div class="part">${i === 0 ? `<div class="label">${label("The entries")}</div>` : ""}<div class="pname${d.group === "tag" ? " tag" : ""}">${escHtml(g.head)}</div><div class="refs">${g.sub}</div></div>`
      : `<div class="part"><div class="label">${label("The entries")}</div><div class="pname">Entries</div><div class="refs">${plural(g.entries.length, "entry", "entries")}, ${escHtml(span)}</div></div>`;
    out.push(`<section class="grp${i === 0 ? " sheet" : ""}">${head}${g.entries.map((e) => entryHtml(e, d)).join("")}</section>`);
  });
  return out.join("");
}

/** The question for the overview: each entry in full (cut short past a share of the room), with its verses. */
export function overviewPrompt(about: string, entries: JournalEntry[], quotes: Map<string, Quote>): string {
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "…" : t);
  const each = Math.max(800, Math.floor(60000 / entries.length));
  const text = entries
    .map((e) => {
      const vs = e.verses
        .map((v) => quotes.get(v))
        .filter((q): q is Quote => !!q)
        .map((q) => `${q.ref}: ${q.verses.map((x) => x.text).join(" ")}`)
        .join("\n");
      return `### ${e.title || "Untitled"} (${dayDate(e.created)})${e.tags.length ? " " + e.tags.map((t) => "#" + t).join(" ") : ""}${
        e.verses.length ? "\nVerses: " + e.verses.join(", ") : ""
      }\n${vs ? vs + "\n\n" : ""}${cut(e.body, each)}`;
    })
    .join("\n\n");
  return `Below are ${entries.length} entries from the user's Bible-reading journal (${about}), with the verses each was written on. They are being printed together, and you write the opening overview.
Write a brief overview of three short paragraphs, 150 to 250 words in all, on how these entries relate to one another and to their verses: the thread that runs through them, how the thinking develops over time, and where the passages shed light on each other. The first paragraph is the lead: two or three sentences that sum it up.
Then name the three to five key themes that come through, each with one sentence and the passages it comes from.
Write warmly and plainly, to the writer as "you". Name entries and passages where it helps; quote the entries sparingly and briefly. Don't preach or add new teaching; draw out what is there. Don't open any files.
Reply with only JSON, and nothing else, in this form:
{"overview": "the paragraphs, in Markdown, separated by blank lines", "themes": [{"name": "a short name", "note": "one sentence", "passages": "Job 13 · Psalm 75"}]}

${text}`;
}

export function readOverview(reply: string): Overview {
  const j = reply.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(j ? j[0] : reply);
    if (typeof o.overview === "string")
      return {
        overview: o.overview,
        themes: (Array.isArray(o.themes) ? o.themes : [])
          .filter((t: { name?: unknown }) => typeof t?.name === "string")
          .map((t: { name: string; note?: unknown; passages?: unknown }) => ({
            name: t.name,
            note: String(t.note ?? ""),
            passages: String(t.passages ?? ""),
          })),
      };
  } catch {
    /* not JSON: the reply as it is */
  }
  return { overview: reply.trim(), themes: [] };
}

// ---- Pages ----
// WebKit's print cuts the page every page-height, through lines and pictures, and ignores what's
// asked to be kept together (CSS columns don't help: they lay out differently when printing). So
// the pages are made here: the document is laid out once at the page's width, cut where each page
// is full (between lines, never through a picture or a heading's link to what follows), and each
// page printed as a block with a forced break after it, which WebKit keeps.

/** Never split across pages. */
const WHOLE = ".cover, .iwrow, .rail, .theme, .phr > div, .marks > div, .part, h1, h2, h3, h4, cite, .label, .note, svg";
/** Never the last thing on a page: what they head goes with them. */
const WITH_NEXT = "h1, h2, h3, h4, .part, .label, .note, .rail";
/** Room, in points, these need left on a page to start on it. */
const NEED: [string, number][] = [
  [".sheet", 140],
  [".ent", 90],
  [".iw.wide", 110],
];
/** The fewest lines of a paragraph left at the foot of a page, or carried to the next. */
const MIN_LINES = 2;

type Pos = { node: Node; offset: number };
const indexIn = (n: Node) => Array.prototype.indexOf.call(n.parentNode!.childNodes, n) as number;
const before = (n: Node): Pos => ({ node: n.parentNode!, offset: indexIn(n) });
const after = (n: Node): Pos => ({ node: n.parentNode!, offset: indexIn(n) + 1 });

const textNodes = (el: Node): Text[] => {
  const out: Text[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue) out.push(n as Text);
  return out;
};

/** The line boxes of a block's text: [top, bottom] each, in order. */
function lines(el: Element): [number, number][] {
  const r = document.createRange();
  const out: [number, number][] = [];
  for (const t of textNodes(el)) {
    r.selectNodeContents(t);
    for (const b of r.getClientRects()) {
      if (!b.height) continue;
      const l = out.find(([top]) => Math.abs(top - b.top) < 2);
      if (l) l[1] = Math.max(l[1], b.bottom);
      else out.push([b.top, b.bottom]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Where in a block the line at `top` starts: its first character. */
function lineStart(el: Element, top: number): Pos | null {
  const r = document.createRange();
  // A character's top, or the next one's for one with no box (a collapsed space).
  const charTop = (t: Text, i: number) => {
    for (let j = i; j < t.length; j++) {
      r.setStart(t, j);
      r.setEnd(t, j + 1);
      const b = r.getBoundingClientRect();
      if (b.height) return b.top;
    }
    return Infinity;
  };
  for (const t of textNodes(el)) {
    if (charTop(t, 0) >= top - 1) return { node: t, offset: 0 };
    if (charTop(t, t.length - 1) < top - 1) continue;
    let lo = 0,
      hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (charTop(t, mid) >= top - 1) hi = mid;
      else lo = mid + 1;
    }
    return { node: t, offset: lo };
  }
  return null;
}

/** Where to end the page that starts at the top of `root`, `limit` px down; null if it all fits. */
function findBreak(root: Element, limit: number, px: number): Pos | null {
  const top = root.getBoundingClientRect().top;
  const hasText = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.nodeValue!.trim());
  const find = (el: Element): Pos | null => {
    for (const c of Array.from(el.children)) {
      const r = c.getBoundingClientRect();
      const t = r.top - top,
        b = r.bottom - top;
      if (b <= limit) {
        // Each entry on a page of its own.
        if (c.matches(".ent.pp") && c.nextElementSibling) return after(c);
        continue;
      }
      if (t >= limit) return before(c);
      const need = NEED.find(([sel]) => c.matches(sel));
      if (need && t > 1 && limit - t < need[1] * px) return before(c);
      if (c.matches(WHOLE)) return t > 1 ? before(c) : after(c);
      if (hasText(c)) {
        const ls = lines(c).map(([lt, lb]) => [lt - top, lb - top]);
        let k = ls.findIndex(([, lb]) => lb > limit);
        if (k < 0) continue;
        if (ls.length - k < MIN_LINES) k = ls.length - MIN_LINES;
        if (k < MIN_LINES) {
          if (t > 1) return before(c);
          k = Math.max(k, 1);
        }
        return lineStart(c, ls[k][0] + top) ?? before(c);
      }
      // Everything in it fits but its own padding or border: end the page at the end of its content.
      return find(c) ?? { node: c, offset: c.childNodes.length };
    }
    return null;
  };
  return find(root);
}

/** Moves a break that would leave a heading (or a date) at the foot of a page, or an empty
 *  element at it, to before them. */
function settle(p: Pos, root: Node): Pos {
  for (;;) {
    if (p.node === root && p.offset === 0) return p;
    if (p.offset === 0 && p.node !== root) {
      p = before(p.node);
      continue;
    }
    if (p.node.nodeType === Node.TEXT_NODE) return p;
    let prev = p.node.childNodes[p.offset - 1];
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.nodeValue!.trim()) prev = prev.previousSibling!;
    if (prev instanceof Element && prev.matches(WITH_NEXT)) {
      p = before(prev);
      continue;
    }
    return p;
  }
}

/** The document as pages of `paper` (width and height in points), with `margin` all round and
 *  `title` in each page's footer, in a #print-root ready to print. */
export async function paginate(html: string, paper: [number, number], margin: number, title: string): Promise<HTMLElement> {
  // The text area: the paper less the margins, and a few points spare at the foot, as printed lines
  // can sit a point or two lower than on screen.
  const w = paper[0] - 2 * margin,
    h = paper[1] - 2 * margin - 8;
  const probe = document.createElement("div");
  probe.className = "jdoc";
  probe.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;width:${w}pt`;
  const first = document.createElement("div");
  first.className = "jcut";
  first.innerHTML = html;
  probe.append(first);
  document.body.append(probe);
  await Promise.all(
    [
      '500 20pt "EB Garamond"',
      'italic 400 12pt "EB Garamond"',
      '400 10pt "Source Serif 4 Variable"',
      'italic 400 10pt "Source Serif 4 Variable"',
    ].map((x) => document.fonts.load(x).catch(() => [])),
  );
  await document.fonts.ready;
  const px = probe.getBoundingClientRect().width / w;
  const root = document.createElement("div");
  root.id = "print-root";
  root.className = "jdoc";
  let rest: HTMLElement = first;
  while (rest.firstChild) {
    // Cut a page from a copy of what's left, then measure the page as cut (its cut-off parts lose
    // their bottom spacing, a verse box keeps its padding): one that comes out taller than the
    // page is cut again, a little shorter.
    let page: HTMLElement | null = null;
    for (let limit = h * px, tries = 0; !page && tries < 6; tries++) {
      const work = rest.cloneNode(true) as HTMLElement;
      rest.replaceWith(work);
      const made = cutPage(work, limit, px, w);
      probe.append(made);
      const over = made.getBoundingClientRect().height - h * px;
      made.remove();
      if (over <= 0.5 || tries === 5 || !work.firstChild) {
        page = made;
        rest = work;
      } else {
        work.replaceWith(rest);
        limit -= over + 2 * px;
      }
    }
    root.append(page!);
  }
  probe.remove();
  // Each page: the paper, its margins inside it (so the cover's band can run to the edges), and
  // a footer with the title and the page's number.
  const bodies = Array.from(root.children);
  bodies.forEach((body, i) => {
    const page = document.createElement("div");
    page.className = "jpage";
    page.style.cssText = `width:${paper[0]}pt;height:${paper[1] - 2}pt;padding:${margin}pt`;
    const foot = document.createElement("div");
    foot.className = "jfoot";
    foot.style.cssText = `left:${margin}pt;right:${margin}pt;bottom:${margin / 2 - 4}pt`;
    foot.innerHTML = `<span>${escHtml(title)}</span><span>Page ${i + 1} of ${bodies.length}</span>`;
    body.replaceWith(page);
    page.append(body, foot);
  });
  root.style.setProperty("--pm", `${margin}pt`);
  return root;
}

/** The page cut from the top of `rest` (which keeps what's left): at most `limit` px tall as measured. */
function cutPage(rest: HTMLElement, limit: number, px: number, w: number): HTMLElement {
  const page = document.createElement("div");
  page.className = "jbody";
  page.style.width = `${w}pt`;
  const raw = rest.getBoundingClientRect().height > limit ? findBreak(rest, limit, px) : null;
  if (!raw) {
    page.append(...Array.from(rest.childNodes));
    return page;
  }
  let p = settle(raw, rest);
  // Nothing fits before it (a part taller than a page): break where it fell, or after the first part.
  if (p.node === rest && p.offset === 0) p = raw.node === rest && raw.offset === 0 ? after(rest.firstChild!) : raw;
  // The elements cut through: their first part goes on this page, the rest stays for the next.
  const cut: Element[] = [];
  for (let n: Node | null = p.node; n && n !== rest; n = n.parentNode) if (n instanceof Element) cut.push(n);
  const range = document.createRange();
  range.setStart(rest, 0);
  range.setEnd(p.node, p.offset);
  page.append(range.extractContents());
  // What's left of each element cut through carries on on the next page; one left empty goes.
  for (const e of cut) {
    if (!e.textContent!.trim() && !e.querySelector("svg")) e.remove();
    else e.classList.add("cont");
  }
  let e = page.lastElementChild;
  for (let i = 0; i < cut.length && e; i++, e = e.lastElementChild) e.classList.add("cut");
  // Nothing hangs below the last line: a margin there would be measured in, and print past the page.
  for (let l = page.lastElementChild as HTMLElement | null; l; l = l.lastElementChild as HTMLElement | null) l.style.marginBottom = "0";
  return page;
}
