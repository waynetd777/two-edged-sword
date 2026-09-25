// Books of the Bible in e-Sword's numbering (1–66), with the abbreviations e-Sword uses in
// <ref> tags, and parsing/formatting of references like "rom 8 28", "Joh 3:16-18", "1 John 4".

export interface Book {
  n: number;
  name: string;
  /** e-Sword's three-character form: "Joh", "1Jn", "Son". */
  abbr: string;
  chapters: number;
}

const DATA: [string, string, number][] = [
  ["Genesis", "Gen", 50], ["Exodus", "Exo", 40], ["Leviticus", "Lev", 27], ["Numbers", "Num", 36], ["Deuteronomy", "Deu", 34],
  ["Joshua", "Jos", 24], ["Judges", "Jdg", 21], ["Ruth", "Rut", 4], ["1 Samuel", "1Sa", 31], ["2 Samuel", "2Sa", 24],
  ["1 Kings", "1Ki", 22], ["2 Kings", "2Ki", 25], ["1 Chronicles", "1Ch", 29], ["2 Chronicles", "2Ch", 36], ["Ezra", "Ezr", 10],
  ["Nehemiah", "Neh", 13], ["Esther", "Est", 10], ["Job", "Job", 42], ["Psalms", "Psa", 150], ["Proverbs", "Pro", 31],
  ["Ecclesiastes", "Ecc", 12], ["Song of Solomon", "Son", 8], ["Isaiah", "Isa", 66], ["Jeremiah", "Jer", 52], ["Lamentations", "Lam", 5],
  ["Ezekiel", "Eze", 48], ["Daniel", "Dan", 12], ["Hosea", "Hos", 14], ["Joel", "Joe", 3], ["Amos", "Amo", 9],
  ["Obadiah", "Oba", 1], ["Jonah", "Jon", 4], ["Micah", "Mic", 7], ["Nahum", "Nah", 3], ["Habakkuk", "Hab", 3],
  ["Zephaniah", "Zep", 3], ["Haggai", "Hag", 2], ["Zechariah", "Zec", 14], ["Malachi", "Mal", 4],
  ["Matthew", "Mat", 28], ["Mark", "Mar", 16], ["Luke", "Luk", 24], ["John", "Joh", 21], ["Acts", "Act", 28],
  ["Romans", "Rom", 16], ["1 Corinthians", "1Co", 16], ["2 Corinthians", "2Co", 13], ["Galatians", "Gal", 6], ["Ephesians", "Eph", 6],
  ["Philippians", "Php", 4], ["Colossians", "Col", 4], ["1 Thessalonians", "1Th", 5], ["2 Thessalonians", "2Th", 3], ["1 Timothy", "1Ti", 6],
  ["2 Timothy", "2Ti", 4], ["Titus", "Tit", 3], ["Philemon", "Phm", 1], ["Hebrews", "Heb", 13], ["James", "Jas", 5],
  ["1 Peter", "1Pe", 5], ["2 Peter", "2Pe", 3], ["1 John", "1Jn", 5], ["2 John", "2Jn", 1], ["3 John", "3Jn", 1],
  ["Jude", "Jud", 1], ["Revelation", "Rev", 22],
];

export const BOOKS: Book[] = DATA.map(([name, abbr, chapters], i) => ({ n: i + 1, name, abbr, chapters }));

export const book = (n: number): Book => BOOKS[Math.min(Math.max(n, 1), 66) - 1];

/** Short form for UI: "Jn", "1Jn", "Ps". */
export const SHORT: string[] = ["Gn", "Ex", "Lv", "Nu", "Dt", "Jos", "Jdg", "Ru", "1Sa", "2Sa", "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Ne", "Es", "Jb", "Ps", "Pr", "Ec", "Sg", "Is", "Je", "La", "Ez", "Da", "Ho", "Jl", "Am", "Ob", "Jon", "Mi", "Na", "Hb", "Zp", "Hg", "Zc", "Ml", "Mt", "Mk", "Lk", "Jn", "Ac", "Ro", "1Co", "2Co", "Ga", "Ep", "Php", "Col", "1Th", "2Th", "1Ti", "2Ti", "Tit", "Phm", "He", "Jas", "1Pe", "2Pe", "1Jn", "2Jn", "3Jn", "Jud", "Re"];

// Every way of naming a book the parser accepts, lower-case and without spaces or dots.
const ALIASES = new Map<string, number>();
function alias(n: number, ...names: string[]) {
  for (const a of names) ALIASES.set(a.toLowerCase().replace(/[\s.]/g, ""), n);
}
BOOKS.forEach((b) => alias(b.n, b.name, b.abbr, SHORT[b.n - 1]));
alias(8, "Rth");
alias(19, "Psalm", "Psa", "Pss", "Psm");
// Common misspellings, so a reference written with one still links.
alias(23, "Isiah"); alias(48, "Galations"); alias(49, "Ephesian"); alias(50, "Phillipians", "Philipians", "Pillipians"); alias(51, "Colosians");
alias(22, "Song", "Songs", "Song of Songs", "SOS", "Canticles");
alias(29, "Jl");
alias(40, "Matt", "Mt");
alias(41, "Mk", "Mrk");
alias(42, "Lk");
alias(43, "Jn", "Jhn");
alias(44, "Ac");
alias(46, "1Cor"); alias(47, "2Cor");
alias(50, "Phil"); alias(57, "Philem");
alias(62, "1Jo", "1Joh", "I John"); alias(63, "2Jo", "2Joh"); alias(64, "3Jo", "3Joh");
alias(65, "Jude", "Jde");
alias(66, "Rv", "Revelations", "Apocalypse");
["1", "2", "3"].forEach((d) => {
  // "I Kings", "II Kings" and "First Kings".
  const roman = d === "1" ? "i" : d === "2" ? "ii" : "iii";
  const word = d === "1" ? "first" : d === "2" ? "second" : "third";
  // Never over a name already taken: "1Sa" as "isa" would turn Isaiah into 1 Samuel.
  for (const [k, v] of Array.from(ALIASES)) if (k.startsWith(d)) for (const a of [roman + k.slice(1), word + k.slice(1)]) if (!ALIASES.has(a)) ALIASES.set(a, v);
});

export function findBook(text: string): number | undefined {
  const k = text.toLowerCase().replace(/[\s.]/g, "");
  if (!k) return undefined;
  const exact = ALIASES.get(k);
  if (exact) return exact;
  // A unique prefix of a full name: "gene", "philip" is ambiguous, "phile" is not.
  const hits = BOOKS.filter((b) => b.name.toLowerCase().replace(/\s/g, "").startsWith(k));
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
  const m = text.trim().match(/^((?:[123]|i{1,3}|first|second|third)?\s*[a-z][a-z .]*?)\s*(\d+)(?:\s*[:. ]\s*(\d+)(?:\s*[-–]\s*(\d+)(?:\s*:\s*(\d+))?)?)?\s*$/i);
  if (!m) return undefined;
  const n = findBook(m[1]);
  if (!n) return undefined;
  const chapter = parseInt(m[2], 10);
  if (chapter < 1 || chapter > book(n).chapters) {
    // One-chapter books: "jude 5" means verse 5.
    if (book(n).chapters === 1 && !m[3]) return { book: n, chapter: 1, verse: chapter };
    return undefined;
  }
  const r: Ref = { book: n, chapter };
  if (m[3]) r.verse = parseInt(m[3], 10);
  if (m[4] && m[5]) { r.toChapter = parseInt(m[4], 10); r.to = parseInt(m[5], 10); }
  else if (m[4]) r.to = parseInt(m[4], 10);
  return r;
}

export function fmtRef(r: Ref, style: "long" | "short" | "esword" = "long"): string {
  const b = book(r.book);
  const name = style === "long" ? b.name : style === "short" ? SHORT[b.n - 1] : b.abbr;
  if (!r.verse) return `${name} ${r.chapter}`;
  let s = `${name} ${r.chapter}:${r.verse}`;
  if (r.toChapter && r.toChapter !== r.chapter) s += `–${r.toChapter}:${r.to}`;
  else if (r.to && r.to !== r.verse) s += `–${r.to}`;
  return s;
}

export const nextChapter = (b: number, c: number): [number, number] | undefined =>
  c < book(b).chapters ? [b, c + 1] : b < 66 ? [b + 1, 1] : undefined;
export const prevChapter = (b: number, c: number): [number, number] | undefined =>
  c > 1 ? [b, c - 1] : b > 1 ? [b - 1, book(b - 1).chapters] : undefined;

/** The next (d = 1) or previous chapter in a Bible that has only `books` (null: all of them), skipping the books it lacks. */
export function stepChapter(b: number, c: number, d: 1 | -1, books: Set<number> | null): [number, number] | undefined {
  let n = d > 0 ? nextChapter(b, c) : prevChapter(b, c);
  while (n && books && !books.has(n[0])) n = d > 0 ? (n[0] < 66 ? [n[0] + 1, 1] : undefined) : (n[0] > 1 ? [n[0] - 1, book(n[0] - 1).chapters] : undefined);
  return n;
}

export const testament = (b: number) => (b <= 39 ? "Old Testament" : "New Testament");

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
export const sectionOf = (b: number) => SECTIONS.find((s) => b >= s.from && b <= s.to)?.name ?? "";
