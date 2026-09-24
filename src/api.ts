import { invoke } from "@tauri-apps/api/core";

export type Kind = "bible" | "commentary" | "dictionary" | "lexicon" | "reference";

export interface ModuleInfo {
  id: string;
  kind: Kind;
  title: string;
  abbrev: string;
  info: string;
  strongs: boolean;
}

export interface LibraryInfo {
  dir: string;
  found: boolean;
  modules: ModuleInfo[];
}

export interface Verse { v: number; text: string }
export interface Range { book: number; chapter: number; from: number; to: number }
export interface Passage { range: Range; verses: Verse[] }

export interface CommentEntry { chapterBegin: number; verseBegin: number; chapterEnd: number; verseEnd: number; html: string }
export interface Commentary { verse: CommentEntry[]; chapter: string | null; book: string | null }
export interface Coverage { id: string; title: string; abbrev: string; range: [number, number, number, number] | null }
export interface Article { module: string; title: string; topic: string; html: string }
export interface TopicHit { module: string; title: string; topic: string }
export interface VerseHit { book: number; chapter: number; verse: number; text: string }

export type SearchMode = "phrase" | "all" | "any";
export interface SearchQuery { text: string; mode: SearchMode; wholeWords: boolean; bible: string; bookFrom: number; bookTo: number; strongsBible?: string | null }
export interface CommentMatch { book: number; chapterBegin: number; verseBegin: number; chapterEnd: number; verseEnd: number; snippet: string }
export interface ModuleMatches<T> { module: string; title: string; abbrev: string; count: number; hits: T[] }
export interface SearchResults { bible: ModuleMatches<VerseHit>; commentaries: ModuleMatches<CommentMatch>[]; dictionaries: ModuleMatches<string>[]; strongs: boolean }

export interface JournalEntry { id: string; title: string; created: string; updated: string; verses: string[]; tags: string[]; body: string }

export const api = {
  library: () => invoke<LibraryInfo>("library_info"),
  rescan: () => invoke<LibraryInfo>("rescan_library"),
  chapter: (bible: string, book: number, chapter: number) => invoke<Verse[]>("get_chapter", { bible, book, chapter }),
  passages: (bible: string, ranges: Range[]) => invoke<Passage[]>("get_passages", { bible, ranges }),
  chapterSizes: (bible: string) => invoke<[number, number, number][]>("chapter_sizes", { bible }),
  commentaryRanges: (module: string) => invoke<[number, number, number, number, number][]>("commentary_ranges", { module }),
  commentary: (module: string, book: number, chapter: number, verse: number) => invoke<Commentary>("get_commentary", { module, book, chapter, verse }),
  coverage: (book: number, chapter: number, verse: number) => invoke<Coverage[]>("get_coverage", { book, chapter, verse }),
  article: (kind: Kind, module: string, topic: string) => invoke<Article | null>("get_article", { kind, module, topic }),
  findTopics: (word: string) => invoke<TopicHit[]>("find_topics", { word }),
  topics: (kind: Kind, module: string, prefix: string, limit = 200) => invoke<string[]>("list_topics", { kind, module, prefix, limit }),
  referenceTitles: (module: string) => invoke<string[]>("reference_titles", { module }),
  strongsByBook: (bible: string, number: string) => invoke<[number, number][]>("strongs_by_book", { bible, number }),
  /** The Strong's numbers an English word translates in a Strong's Bible, with the forms used. */
  strongsForWord: (bible: string, word: string) => invoke<{ num: string; count: number; forms: [string, number][] }[]>("strongs_for_word", { bible, word }),
  /** Lexicon entries whose transliteration matches, accents ignored ("agape" → agapē). */
  translitSearch: (lexicon: string, query: string, limit = 12) => invoke<{ num: string; word: string; translit: string }[]>("translit_search", { lexicon, query, limit }),
  strongsVerses: (bible: string, number: string, book: number | null, limit = 400) => invoke<VerseHit[]>("strongs_verses", { bible, number, book, limit }),
  search: (query: SearchQuery) => invoke<SearchResults>("search", { query }),
  indexProgress: () => invoke<{ building: boolean; done: number; total: number }>("index_progress"),
  storeRead: <T>(name: string) => invoke<T | null>("store_read", { name }),
  storeWrite: (name: string, value: unknown) => invoke<void>("store_write", { name, value }),
  journalDefaultDir: () => invoke<string>("journal_default_dir"),
  journalList: (dir: string) => invoke<JournalEntry[]>("journal_list", { dir }),
  journalSave: (dir: string, entry: JournalEntry) => invoke<void>("journal_save", { dir, entry }),
  journalDelete: (dir: string, id: string) => invoke<void>("journal_delete", { dir, id }),
  writeTextFile: (path: string, text: string) => invoke<void>("write_text_file", { path, text }),
  claudeStatus: () => invoke<{ path: string | null; version: string | null }>("claude_status"),
  ask: (chatId: string, prompt: string, model: string, session: string | null, bookDir: string | null = null) => invoke<void>("ask", { chatId, prompt, model, session, bookDir }),
  /** Writes a reference book out as text files and charts for Ask to search; returns its folder and chapter files. */
  docExport: (module: string) => invoke<{ dir: string; files: string[] }>("doc_export", { module }),
  askCancel: (chatId: string) => invoke<void>("ask_cancel", { chatId }),
  print: () => invoke<void>("print_page"),
};
