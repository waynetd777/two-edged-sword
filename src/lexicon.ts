// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { api } from "./api";
import { concordanceRenderings, lexiconParts } from "./esword";

/** A Strong's number's lexicon entry, in its parts, and how the KJV renders it. */
export interface Lex {
  num: string;
  word: string;
  translit: string;
  pron: string;
  rest: string;
  total?: number;
  html: string;
  renderings: [string, number][];
}

// Entries and renderings looked up already, by module and number. A miss may be a failure, so it
// isn't kept: the next lookup tries again.
const entries = new Map<string, Promise<Omit<Lex, "renderings"> | null>>();
const renderings = new Map<string, Promise<[string, number][]>>();

function cached<T>(cache: Map<string, Promise<T>>, key: string, get: () => Promise<T>, miss: (v: T) => boolean): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = get();
    cache.set(key, p);
    p.then((v) => {
      if (miss(v) && cache.get(key) === p) cache.delete(key);
    });
  }
  return p;
}

/** A number's lexicon entry alone (no concordance): null when it has none, or it couldn't be read. */
export const lexEntry = (lexicon: string, num: string) =>
  cached(
    entries,
    `${lexicon}/${num}`,
    () =>
      api
        .article("lexicon", lexicon, num)
        .then((a) => (a ? { num, html: a.html, ...lexiconParts(a.html) } : null))
        .catch(() => null),
    (v) => !v,
  );

/** The KJV's renderings of a number, commonest first as the concordance lists them; none when it can't be read. */
export const lexRenderings = (concordance: string, num: string) =>
  cached(
    renderings,
    `${concordance}/${num}`,
    () =>
      api
        .article("lexicon", concordance, num)
        .then((c) => (c ? concordanceRenderings(c.html) : []))
        .catch(() => [] as [string, number][]),
    (v) => !v.length,
  );

/** A number's entry with its renderings: null without a lexicon or an entry. Never rejects. */
export async function loadLex(
  lexicon: string | null | undefined,
  concordance: string | null | undefined,
  num: string,
): Promise<Lex | null> {
  if (!lexicon) return null;
  const [e, r] = await Promise.all([lexEntry(lexicon, num), concordance ? lexRenderings(concordance, num) : Promise.resolve([])]);
  return e ? { ...e, renderings: r } : null;
}
