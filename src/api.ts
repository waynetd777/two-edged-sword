import { invoke } from "@tauri-apps/api/core";

/** Screenshot mode (scene.ts) sets this: nothing the page changes is saved. */
let readOnly = false;
export const setReadOnly = (on: boolean) => { readOnly = on; };
/** True in screenshot mode. */
export const isReadOnly = () => readOnly;
/** Screenshot mode: journal entries shown instead of the user's (their own stay private). */
let sceneJournal: JournalEntry[] | null = null;
export const setSceneJournal = (es: JournalEntry[]) => { sceneJournal = es; };

export type Kind = "bible" | "commentary" | "dictionary" | "lexicon" | "reference" | "devotional";

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
/** An AI CLI on this Mac; `path` is null when it isn't installed. `models` is filled for Codex only. */
export interface Cli { path: string | null; version: string | null; models: { id: string; name: string }[] }
export interface AssistantStatus { claude: Cli; codex: Cli }
/** A macOS voice. quality: 1 default, 2 enhanced, 3 premium. */
export interface Voice { id: string; name: string; lang: string; quality: number; default: boolean }
/** From the native synthesiser: a word about to be spoken (UTF-16 range) or the end of utterance `id`. */
export interface TtsEvent { id: number; kind: "word" | "end"; char: number; len: number }
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

export interface MusicTrack { id: string; name: string; artist: string; genre: string }
export interface MusicState { state: string; name: string; artist: string; ours: boolean }
export interface JournalEntry { id: string; title: string; created: string; updated: string; verses: string[]; tags: string[]; body: string }

/** today: today's reading ("Psalm 23 · John 3"), null without an active plan. */
export interface TrayState { today: string | null; done: boolean; reading: string; reminder: boolean; reminderTime: string }

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
  storeWrite: (name: string, value: unknown) => (readOnly ? Promise.resolve() : invoke<void>("store_write", { name, value })),
  journalDefaultDir: () => invoke<string>("journal_default_dir"),
  journalList: (dir: string) => (sceneJournal ? Promise.resolve(sceneJournal) : invoke<JournalEntry[]>("journal_list", { dir })),
  // With a scene's entries the stamp changes every time, so the journal is sure to reload onto them.
  journalStamp: (dir: string) => (sceneJournal ? Promise.resolve(`scene:${Date.now()}`) : invoke<string>("journal_stamp", { dir })),
  /** The songs in the Music app's library (music.rs). */
  musicTracks: () => invoke<MusicTrack[]>("music_tracks"),
  /** Queues these songs as the Quiet time playlist and plays it; returns how many were found. */
  musicPlay: (ids: string[]) => (readOnly ? Promise.resolve(0) : invoke<number>("music_play", { ids })),
  musicState: () => invoke<MusicState>("music_state"),
  /** Keeps the display awake (and so the screen unlocked) while reading aloud. */
  keepAwake: (on: boolean) => invoke<void>("keep_awake", { on }),
  /** Pauses, resumes or skips, but only while the Quiet time playlist is what's playing; "show" brings Music to the front. */
  musicControl: (cmd: "pause" | "play" | "next" | "show") => (readOnly ? Promise.resolve() : invoke<void>("music_control", { cmd })),
  journalSave: (dir: string, entry: JournalEntry) => (readOnly ? Promise.resolve() : invoke<void>("journal_save", { dir, entry })),
  journalDelete: (dir: string, id: string) => (readOnly ? Promise.resolve() : invoke<void>("journal_delete", { dir, id })),
  writeTextFile: (path: string, text: string) => invoke<void>("write_text_file", { path, text }),
  assistantStatus: () => invoke<AssistantStatus>("assistant_status"),
  ask: (chatId: string, prompt: string, model: string, session: string | null, bookDir: string | null = null, studyDir: string | null = null) => invoke<void>("ask", { chatId, prompt, model, session, bookDir, studyDir }),
  /** Writes out the library's material on a passage (every Bible allowed, all commentaries, lexicon entries) for chat `chatId`; returns its folder. */
  studyExport: (chatId: string, req: { book: number; chapter: number; from: number | null; to: number | null; bibles: string[]; strongsBible: string | null; label: string; journal?: { title: string; created: string; verses: string[]; body: string }[] }) => invoke<string>("study_export", { chatId, req }),
  /** Writes a reference book out as text files and charts for Ask to search; returns its folder and chapter files. */
  docExport: (module: string, kind: "reference" | "devotional" = "reference") => invoke<{ dir: string; files: string[] }>("doc_export", { module, kind }),
  /** A devotional's days as titles ("January 1" …), in calendar order. */
  devotionTitles: (module: string) => invoke<string[]>("devotion_titles", { module }),
  /** The reading for a day, by its title ("September 24"). */
  devotion: (module: string, title: string) => invoke<string | null>("devotion", { module, title }),
  /** Opens an https page in its own window inside the app; `key` reuses the window. */
  openWeb: (key: string, url: string, title: string) => invoke<void>("open_web", { key, url, title }),
  askCancel: (chatId: string) => invoke<void>("ask_cancel", { chatId }),
  print: () => invoke<void>("print_page"),
  /** The screenshot scene the app was launched with (TES_SCENE), as JSON, or null. */
  scene: () => invoke<string | null>("scene"),
  ttsVoices: () => invoke<Voice[]>("tts_voices"),
  ttsSpeak: (id: number, text: string, voice: string | undefined, rate: number) => invoke<void>("tts_speak", { id, text, voice: voice ?? null, rate }),
  ttsStop: () => invoke<void>("tts_stop"),
  /** What the menu-bar menu shows and when the daily reminder fires; the menu's clicks come back as "tray" events. */
  setTray: (state: TrayState) => invoke<void>("set_tray", { state }),
};
