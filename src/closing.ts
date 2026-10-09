// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The closing verse for Quiet time: a verse or short passage chosen by the assistant to wrap up the
// day's readings, with a few sentences drawing together what they taught. Checked against the
// Bible being read, so it can only open a passage that is there; without an assistant, or if its
// answer can't be used, the Aaronic blessing (Numbers 6:24–26) closes instead.

import { api } from "./api";
import { askOnce } from "./Ask";
import { assistantModels, pickModel } from "./assistant";
import { book, fmtRef, parseRef } from "./bible";
import { today } from "./plans";

export interface Closing {
  b: number;
  c: number;
  v: number;
  v2?: number;
  /** "Philippians 4:6–7". */
  label: string;
  /** What the day's readings came to, and how the passage sums it up. */
  why?: string;
  /** Why the blessing closes instead, when the assistant's choice couldn't be had. */
  note?: string;
}

const BLESSING = { b: 4, c: 6, v: 24, v2: 26 };
const MAX_VERSES = 8;

// A day's choice is kept, so starting Quiet time again doesn't wait for the assistant again.
const chosen = new Map<string, Promise<Closing>>();

/** The closing passage for a Quiet time reading `about` ("John 3", "My Utmost for His Highest"),
 *  steering clear of `except`: a favourite passage read every day after it. */
export function pickClosing(about: string[], bible: string, model: string, except?: string): Promise<Closing> {
  const key = JSON.stringify([about, bible, except, today().toDateString()]);
  let p = chosen.get(key);
  if (!p) {
    p = choose(about, bible, model, except);
    chosen.set(key, p);
    p.then(
      (x) => {
        if (x.note) chosen.delete(key);
      },
      () => chosen.delete(key),
    );
  }
  return p;
}

const withLabel = (x: Omit<Closing, "label">): Closing => ({
  ...x,
  label: fmtRef({ book: x.b, chapter: x.c, verse: x.v, to: x.v2 }),
});

async function choose(about: string[], bible: string, model: string, except?: string): Promise<Closing> {
  const blessing = (note: string) => withLabel({ ...BLESSING, note });
  const models = assistantModels();
  if (!models.length) return blessing("The blessing closes: no AI assistant is set up to choose a verse.");
  const prompt = `Someone has just finished their quiet time with God. Today they read: ${about.join("; ")}.
Choose one Bible verse, or a short passage of at most ${MAX_VERSES} verses in one chapter, to close their quiet time: one that gathers up what today's readings teach and sends them into the day with it. It may come from today's readings or from elsewhere in the Bible.${except ? `\nThey end every day with ${except}, read after this, so choose something else.` : ""}
Reply with only JSON, and nothing else, in this form:
{"ref": "Philippians 4:6-7", "why": "two or three sentences drawing together what today's readings taught, and how this passage sums it up"}
Speak to the reader as "you", warmly and plainly; name passages, not verse numbers alone.`;
  try {
    const answer = await askOnce(prompt, pickModel(model, models));
    const j = JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { ref?: unknown; why?: unknown };
    const r = typeof j.ref === "string" ? parseRef(j.ref) : undefined;
    if (!r?.verse || (r.toChapter && r.toChapter !== r.chapter))
      return blessing("The blessing closes: the assistant's choice couldn't be read.");
    // Only verses this Bible has, and a short passage at most.
    const sizes = await api.chapterSizes(bible).catch(() => []);
    const n = sizes.find(([b, c]) => b === r.book && c === r.chapter)?.[2];
    if (!n || r.verse > n) return blessing(`The blessing closes: ${book(r.book).name} ${r.chapter}:${r.verse} isn't in this Bible.`);
    const to = r.to && r.to > r.verse ? Math.min(r.to, n, r.verse + MAX_VERSES - 1) : undefined;
    return withLabel({ b: r.book, c: r.chapter, v: r.verse, v2: to, why: typeof j.why === "string" ? j.why : undefined });
  } catch (e) {
    return blessing(`The blessing closes: ${e instanceof Error ? e.message : e}`);
  }
}
