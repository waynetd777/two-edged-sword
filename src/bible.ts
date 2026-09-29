// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Books of the Bible in e-Sword's numbering (1–66, and the Apocrypha as 67–78), with the
// abbreviations e-Sword uses in <ref> tags, and parsing/formatting of references like "rom 8 28",
// "Joh 3:16-18", "1 John 4".

export interface Book {
  n: number;
  name: string;
  /** e-Sword's three-character form: "Joh", "1Jn", "Son". */
  abbr: string;
  chapters: number;
}

const DATA: [string, string, number][] = [
  ["Genesis", "Gen", 50],
  ["Exodus", "Exo", 40],
  ["Leviticus", "Lev", 27],
  ["Numbers", "Num", 36],
  ["Deuteronomy", "Deu", 34],
  ["Joshua", "Jos", 24],
  ["Judges", "Jdg", 21],
  ["Ruth", "Rut", 4],
  ["1 Samuel", "1Sa", 31],
  ["2 Samuel", "2Sa", 24],
  ["1 Kings", "1Ki", 22],
  ["2 Kings", "2Ki", 25],
  ["1 Chronicles", "1Ch", 29],
  ["2 Chronicles", "2Ch", 36],
  ["Ezra", "Ezr", 10],
  ["Nehemiah", "Neh", 13],
  ["Esther", "Est", 10],
  ["Job", "Job", 42],
  ["Psalms", "Psa", 150],
  ["Proverbs", "Pro", 31],
  ["Ecclesiastes", "Ecc", 12],
  ["Song of Solomon", "Son", 8],
  ["Isaiah", "Isa", 66],
  ["Jeremiah", "Jer", 52],
  ["Lamentations", "Lam", 5],
  ["Ezekiel", "Eze", 48],
  ["Daniel", "Dan", 12],
  ["Hosea", "Hos", 14],
  ["Joel", "Joe", 3],
  ["Amos", "Amo", 9],
  ["Obadiah", "Oba", 1],
  ["Jonah", "Jon", 4],
  ["Micah", "Mic", 7],
  ["Nahum", "Nah", 3],
  ["Habakkuk", "Hab", 3],
  ["Zephaniah", "Zep", 3],
  ["Haggai", "Hag", 2],
  ["Zechariah", "Zec", 14],
  ["Malachi", "Mal", 4],
  ["Matthew", "Mat", 28],
  ["Mark", "Mar", 16],
  ["Luke", "Luk", 24],
  ["John", "Joh", 21],
  ["Acts", "Act", 28],
  ["Romans", "Rom", 16],
  ["1 Corinthians", "1Co", 16],
  ["2 Corinthians", "2Co", 13],
  ["Galatians", "Gal", 6],
  ["Ephesians", "Eph", 6],
  ["Philippians", "Php", 4],
  ["Colossians", "Col", 4],
  ["1 Thessalonians", "1Th", 5],
  ["2 Thessalonians", "2Th", 3],
  ["1 Timothy", "1Ti", 6],
  ["2 Timothy", "2Ti", 4],
  ["Titus", "Tit", 3],
  ["Philemon", "Phm", 1],
  ["Hebrews", "Heb", 13],
  ["James", "Jas", 5],
  ["1 Peter", "1Pe", 5],
  ["2 Peter", "2Pe", 3],
  ["1 John", "1Jn", 5],
  ["2 John", "2Jn", 1],
  ["3 John", "3Jn", 1],
  ["Jude", "Jud", 1],
  ["Revelation", "Rev", 22],
];

/** The 66 books of the Protestant canon (what plans, Word Study and the KJV cover). */
export const BOOKS: Book[] = DATA.map(([name, abbr, chapters], i) => ({ n: i + 1, name, abbr, chapters }));

// The Apocrypha, as e-Sword numbers it (the Vulgates, Douay-Rheims and Bishops' have 67–73, the
// Septuagints 67–78 but 75). Only a Bible that has a book shows it.
const APO_DATA: [number, string, string, string, number][] = [
  [67, "Tobit", "Tob", "Tb", 14],
  [68, "Judith", "Jdt", "Jdt", 16],
  [69, "Wisdom", "Wis", "Ws", 19],
  [70, "Sirach", "Sir", "Sir", 51],
  [71, "Baruch", "Bar", "Bar", 6],
  [72, "1 Maccabees", "1Ma", "1Mc", 16],
  [73, "2 Maccabees", "2Ma", "2Mc", 15],
  [74, "1 Esdras", "1Es", "1Es", 9],
  [75, "2 Esdras", "2Es", "2Es", 16],
  [76, "3 Maccabees", "3Ma", "3Mc", 7],
  [77, "4 Maccabees", "4Ma", "4Mc", 18],
  [78, "Prayer of Manasseh", "Man", "PrM", 1],
];
export const APOCRYPHA: Book[] = APO_DATA.map(([n, name, abbr, , chapters]) => ({ n, name, abbr, chapters }));
const BY_N = new Map<number, Book>([...BOOKS, ...APOCRYPHA].map((b) => [b.n, b]));

export const book = (n: number): Book => BY_N.get(n) ?? BOOKS[Math.min(Math.max(n, 1), 66) - 1];

/**
 * Apocryphal: a book of the Apocrypha, or a chapter past the Protestant canon's end of one (the
 * Greek additions to Esther, 11–16, and to Daniel, 13 Susanna and 14 Bel and the Dragon, in the
 * Vulgates, Douay-Rheims and Septuagints; the Septuagint's Psalm 151).
 */
export const isApocrypha = (b: number, c?: number) => b > 66 || (c !== undefined && b <= 66 && c > book(b).chapters);
/** What an apocryphal chapter of a canonical book is: "Susanna", "Additions to Esther". */
export function apocryphaName(b: number, c: number): string | undefined {
  if (b > 66 || c <= book(b).chapters) return undefined;
  if (b === 27) return c === 13 ? "Susanna" : c === 14 ? "Bel and the Dragon" : "Additions to Daniel";
  if (b === 17) return "Additions to Esther";
  if (b === 19) return "Psalm 151";
  return undefined;
}

/**
 * Reading order: the Old Testament, the Apocrypha between the Testaments (where the KJV of 1611
 * and the Bishops' Bible put them), then the New Testament.
 */
const ORDER = [...BOOKS.slice(0, 39), ...APOCRYPHA, ...BOOKS.slice(39)].map((b) => b.n);

/** Short form for UI: "Jn", "1Jn", "Ps". */
export const SHORT: string[] = [
  "Gn",
  "Ex",
  "Lv",
  "Nu",
  "Dt",
  "Jos",
  "Jdg",
  "Ru",
  "1Sa",
  "2Sa",
  "1Ki",
  "2Ki",
  "1Ch",
  "2Ch",
  "Ezr",
  "Ne",
  "Es",
  "Jb",
  "Ps",
  "Pr",
  "Ec",
  "Sg",
  "Is",
  "Je",
  "La",
  "Ez",
  "Da",
  "Ho",
  "Jl",
  "Am",
  "Ob",
  "Jon",
  "Mi",
  "Na",
  "Hb",
  "Zp",
  "Hg",
  "Zc",
  "Ml",
  "Mt",
  "Mk",
  "Lk",
  "Jn",
  "Ac",
  "Ro",
  "1Co",
  "2Co",
  "Ga",
  "Ep",
  "Php",
  "Col",
  "1Th",
  "2Th",
  "1Ti",
  "2Ti",
  "Tit",
  "Phm",
  "He",
  "Jas",
  "1Pe",
  "2Pe",
  "1Jn",
  "2Jn",
  "3Jn",
  "Jud",
  "Re",
];

// Every way of naming a book the parser accepts, lower-case and without spaces or dots.
const ALIASES = new Map<string, number>();
function alias(n: number, ...names: string[]) {
  for (const a of names) ALIASES.set(a.toLowerCase().replace(/[\s.]/g, ""), n);
}
BOOKS.forEach((b) => alias(b.n, b.name, b.abbr, SHORT[b.n - 1]));
// Not e-Sword's "Man" for the Prayer of Manasseh: "man 3" in prose would become a reference.
APO_DATA.forEach(([n, name, abbr, short]) => alias(n, name, ...[abbr, short].filter((a) => a !== "Man")));
// As commentaries write them: "Tob. 4:15", "Wisd. 3:1", "Ecclus. 24:1", "1 Macc. 2:7".
alias(67, "Tobias");
alias(68, "Jdth", "Jth");
alias(69, "Wisd", "Wisdom of Solomon", "Wisd of Sol");
alias(70, "Ecclus", "Ecclesiasticus", "Ben Sira");
alias(78, "Prayer of Manasses", "Manasses", "PrMan");
[72, 73, 76, 77].forEach((n, k) => {
  const d = [1, 2, 3, 4][k];
  alias(n, `${d}Macc`, `${d}Mac`, `${d}Mc`, `${d} Maccabees`);
});
alias(74, "1Esd", "3 Esdras");
alias(75, "2Esd", "4 Esdras");
alias(8, "Rth");
alias(19, "Psalm", "Psa", "Pss", "Psm");
// Common misspellings, so a reference written with one still links.
alias(23, "Isiah");
alias(48, "Galations");
alias(49, "Ephesian");
alias(50, "Phillipians", "Philipians", "Pillipians");
alias(51, "Colosians");
alias(22, "Song", "Songs", "Song of Songs", "SOS", "Canticles");
alias(29, "Jl");
alias(40, "Matt", "Mt");
alias(41, "Mk", "Mrk");
alias(42, "Lk");
alias(43, "Jn", "Jhn");
alias(44, "Ac");
alias(46, "1Cor");
alias(47, "2Cor");
alias(50, "Phil");
alias(57, "Philem");
alias(62, "1Jo", "1Joh", "I John");
alias(63, "2Jo", "2Joh");
alias(64, "3Jo", "3Joh");
alias(65, "Jude", "Jde");
alias(66, "Rv", "Revelations", "Apocalypse");
["1", "2", "3"].forEach((d) => {
  // "I Kings", "II Kings" and "First Kings".
  const roman = d === "1" ? "i" : d === "2" ? "ii" : "iii";
  const word = d === "1" ? "first" : d === "2" ? "second" : "third";
  // Never over a name already taken: "1Sa" as "isa" would turn Isaiah into 1 Samuel.
  for (const [k, v] of Array.from(ALIASES))
    if (k.startsWith(d)) for (const a of [roman + k.slice(1), word + k.slice(1)]) if (!ALIASES.has(a)) ALIASES.set(a, v);
});

export function findBook(text: string): number | undefined {
  const k = text.toLowerCase().replace(/[\s.]/g, "");
  if (!k) return undefined;
  const exact = ALIASES.get(k);
  if (exact) return exact;
  // A unique prefix of a full name: "gene", "philip" is ambiguous, "phile" is not.
  const hits = [...BOOKS, ...APOCRYPHA].filter((b) => b.name.toLowerCase().replace(/\s/g, "").startsWith(k));
  return hits.length === 1 ? hits[0].n : hits.length > 1 && k.length >= 3 ? hits[0].n : undefined;
}

export interface Ref {
  book: number;
  chapter: number;
  /** Absent for a whole chapter. */
  verse?: number;
  /** Last verse of a range in the same chapter. */
  to?: number;
  /** A range that crosses into a later chapter ("Mat 5:3-7:29"). */
  toChapter?: number;
}

/**
 * "rom 8 28", "Rom 8:28-30", "1 jn 4", "Joh 3:16" and "psalm 23". Returns undefined when the
 * text does not start with a book name followed by a chapter.
 */
export function parseRef(text: string): Ref | undefined {
  const m = text
    .trim()
    .match(
      /^((?:[123]|i{1,3}|first|second|third)?\s*[a-z][a-z .]*?)\s*(\d+)(?:\s*[:. ]\s*(\d+)(?:\s*[-–]\s*(\d+)(?:\s*:\s*(\d+))?)?)?\s*$/i,
    );
  if (!m) return undefined;
  const n = findBook(m[1]);
  if (!n) return undefined;
  const chapter = parseInt(m[2], 10);
  // Past the canon's last chapter only where the Apocrypha add one: Esther 11–16, Daniel 13–14, Psalm 151.
  const most = n === 17 ? 16 : n === 27 ? 14 : n === 19 ? 151 : book(n).chapters;
  if (chapter < 1 || chapter > most) {
    // One-chapter books: "jude 5" means verse 5.
    if (book(n).chapters === 1 && !m[3]) return { book: n, chapter: 1, verse: chapter };
    return undefined;
  }
  const r: Ref = { book: n, chapter };
  if (m[3]) r.verse = parseInt(m[3], 10);
  if (m[4] && m[5]) {
    r.toChapter = parseInt(m[4], 10);
    r.to = parseInt(m[5], 10);
  } else if (m[4]) r.to = parseInt(m[4], 10);
  return r;
}

export function fmtRef(r: Ref, style: "long" | "short" | "esword" = "long"): string {
  const b = book(r.book);
  const name =
    style === "long" ? b.name : style === "short" ? (b.n > 66 ? APO_DATA.find((x) => x[0] === b.n)![3] : SHORT[b.n - 1]) : b.abbr;
  if (!r.verse) return `${name} ${r.chapter}`;
  let s = `${name} ${r.chapter}:${r.verse}`;
  if (r.toChapter && r.toChapter !== r.chapter) s += `–${r.toChapter}:${r.to}`;
  else if (r.to && r.to !== r.verse) s += `–${r.to}`;
  return s;
}

/** The next and previous chapter in the Protestant canon (Compare, and when a Bible's own chapters aren't known). */
export const nextChapter = (b: number, c: number): [number, number] | undefined =>
  b > 66 ? (c < book(b).chapters ? [b, c + 1] : undefined) : c < book(b).chapters ? [b, c + 1] : b < 66 ? [b + 1, 1] : undefined;
export const prevChapter = (b: number, c: number): [number, number] | undefined =>
  c > 1 ? [b, c - 1] : b > 1 && b <= 66 ? [b - 1, book(b - 1).chapters] : undefined;

/** A Bible's books and how many chapters each has, from its own text (bibleSizes in ui.tsx). */
export type BookSizes = Map<number, number>;

/**
 * The next (d = 1) or previous chapter in a Bible with these books and chapters (null: the 66
 * books as the KJV has them), in reading order: its Apocrypha, and extra chapters such as Daniel
 * 13–14, come where they belong.
 */
export function stepChapter(b: number, c: number, d: 1 | -1, sizes: BookSizes | null): [number, number] | undefined {
  if (!sizes) return d > 0 ? nextChapter(b, c) : prevChapter(b, c);
  const last = sizes.get(b) ?? book(b).chapters;
  if (d > 0 && c < last) return [b, c + 1];
  if (d < 0 && c > 1) return [b, c - 1];
  const order = ORDER.filter((n) => sizes.has(n));
  const at = order.indexOf(b);
  const nb = at < 0 ? undefined : order[at + d];
  return nb === undefined ? undefined : [nb, d > 0 ? 1 : sizes.get(nb)!];
}

export const testament = (b: number) => (b > 66 ? "Apocrypha" : b <= 39 ? "Old Testament" : "New Testament");

export const SECTIONS: { name: string; from: number; to: number }[] = [
  { name: "Law", from: 1, to: 5 },
  { name: "History", from: 6, to: 17 },
  { name: "Wisdom", from: 18, to: 22 },
  { name: "Prophets", from: 23, to: 39 },
  { name: "Gospels", from: 40, to: 43 },
  { name: "Acts", from: 44, to: 44 },
  { name: "Letters", from: 45, to: 65 },
  { name: "Revelation", from: 66, to: 66 },
];
export const sectionOf = (b: number) => (b > 66 ? "Apocrypha" : (SECTIONS.find((s) => b >= s.from && b <= s.to)?.name ?? ""));
