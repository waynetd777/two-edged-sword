// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";

export type Kind = "bible" | "commentary" | "dictionary" | "lexicon" | "reference" | "devotional";

export interface Module {
  id: string;
  kind: Kind;
  title: string;
  abbrev: string;
  strongs: boolean;
  rtl: boolean;
}

export interface Verse {
  v: number;
  text: string;
}

export interface CommentEntry {
  chapterBegin: number;
  verseBegin: number;
  chapterEnd: number;
  verseEnd: number;
  html: string;
}

export interface Commentary {
  verse: CommentEntry[];
  chapter: string | null;
  book: string | null;
}

export interface Coverage {
  id: string;
  title: string;
  abbrev: string;
  range: [number, number, number, number] | null;
}

export interface Article {
  module: string;
  title: string;
  topic: string;
  html: string;
}

export interface WordNumber {
  num: string;
  count: number;
  forms: [string, number][];
}

export type SearchMode = "phrase" | "all" | "any";

export interface SearchQuery {
  text: string;
  mode: SearchMode;
  wholeWords: boolean;
  bible: string;
  bookFrom: number;
  bookTo: number;
  strongsBible?: string;
}

export interface ModuleMatches<T> {
  module: string;
  title: string;
  abbrev: string;
  count: number;
  hits: T[];
}

export interface SearchResults {
  bible: ModuleMatches<{ book: number; chapter: number; verse: number; text: string }>;
  commentaries: ModuleMatches<{ book: number; chapterBegin: number; verseBegin: number; chapterEnd: number; verseEnd: number; snippet: string }>[];
  dictionaries: ModuleMatches<string>[];
  strongs: boolean;
}

export const api = {
  search: (q: SearchQuery) => invoke<SearchResults>("search", { q }),
  strongsForWord: (bible: string, word: string) => invoke<WordNumber[]>("strongs_for_word", { bible, word }),
  article: (kind: Kind, module: string, topic: string) => invoke<Article | null>("article", { kind, module, topic }),
  modules: () => invoke<Module[]>("modules"),
  chapter: (bible: string, book: number, chapter: number) => invoke<Verse[]>("chapter", { bible, book, chapter }),
  chapterSizes: (bible: string) => invoke<[number, number, number][]>("chapter_sizes", { bible }),
  commentary: (module: string, book: number, chapter: number, verse: number) =>
    invoke<Commentary>("commentary", { module, book, chapter, verse }),
  coverage: (book: number, chapter: number, verse: number) => invoke<Coverage[]>("coverage", { book, chapter, verse }),
};

/** Debug builds: the parts of the state to open in (lib.rs's scene), for screenshots. */
export const scene: Promise<string[]> = invoke<string | null>("scene")
  .then((s) => (s ? s.split(",").map((x) => x.trim()) : []))
  .catch(() => []);

/** A value kept between launches. The UI draws from these at once and never waits on them. */
export function saved<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(`tes.${key}`);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(`tes.${key}`, JSON.stringify(value));
  } catch {
    // Storage unavailable: it just isn't remembered.
  }
}
