// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The desktop's side of sync with the phone app (src/sync.ts has the merging, sync.rs the server): what
// the desktop keeps, as sync's items and places, and back.

import type { Plan } from "./plans";
import type { Bookmark, HlColor, Recent } from "./state";
import { Mark, markKey, Place, planItems, plansFrom, under } from "./sync";

export interface Synced {
  bookmarks: Bookmark[];
  highlights: Record<string, HlColor>;
  docAt: Record<string, string>;
  plans: Plan[];
  recent: Recent[];
}

const toMark = (b: Bookmark): Mark =>
  b.doc
    ? { module: b.doc.module, title: b.doc.title, para: b.doc.para, ...(b.doc.kind ? { kind: b.doc.kind } : {}), created: b.created }
    : {
        book: b.ref.book,
        chapter: b.ref.chapter,
        ...(b.ref.verse ? { verse: b.ref.verse } : {}),
        ...(b.ref.to && b.ref.to !== b.ref.verse ? { to: b.ref.to } : {}),
        bible: b.bible,
        created: b.created,
      };

/** What's synced, as items. */
export function itemsOf(s: Synced): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const b of s.bookmarks) {
    const m = toMark(b);
    out[markKey(m)] = m;
  }
  for (const [k, c] of Object.entries(s.highlights)) out[`hl|${k}`] = c;
  for (const [m, t] of Object.entries(s.docAt)) out[`at|${m}`] = t;
  for (const p of s.plans) Object.assign(out, planItems(p));
  return out;
}

/** Recent as places: an online devotional or the song words (which have no module chapter) stay here. */
export function placesOf(recent: Recent[]): Place[] {
  return recent.flatMap((r): Place[] => {
    const at = Date.parse(r.at) || 0;
    if (r.doc)
      return r.doc.url || r.doc.view ? [] : [{ at, module: r.doc.module, title: r.doc.title, ...(r.doc.kind ? { kind: r.doc.kind } : {}) }];
    return [{ at, book: r.book, chapter: r.chapter, ...(r.verse ? { verse: r.verse } : {}), ...(r.to ? { to: r.to } : {}) }];
  });
}

/** The items and places back, as the desktop keeps them: bookmarks keep their ids, and Recent keeps
 *  what only the desktop has (online devotionals). */
export function fromItems(now: Record<string, unknown>, places: Place[], was: Synced, uid: () => string): Synced {
  const ids = new Map(was.bookmarks.map((b) => [markKey(toMark(b)), b.id]));
  const bookmarks: Bookmark[] = under(now, "bm|")
    .map(([k, v]) => {
      const m = v as Mark;
      const id = ids.get(`bm|${k}`) ?? uid();
      return "module" in m
        ? {
            id,
            ref: { book: 0, chapter: 0 },
            bible: "",
            created: m.created,
            doc: { module: m.module, title: m.title, para: m.para, ...(m.kind ? { kind: m.kind as never } : {}) },
          }
        : {
            id,
            ref: { book: m.book, chapter: m.chapter, ...(m.verse ? { verse: m.verse } : {}), ...(m.to ? { to: m.to } : {}) },
            bible: m.bible,
            created: m.created,
          };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
  const highlights = Object.fromEntries(under(now, "hl|")) as Record<string, HlColor>;
  const docAt = Object.fromEntries(under(now, "at|")) as Record<string, string>;
  const kept = was.recent.filter((r) => r.doc && (r.doc.url || r.doc.view));
  const recent: Recent[] = [
    ...places.map((p): Recent =>
      p.module
        ? {
            book: 0,
            chapter: 0,
            at: new Date(p.at).toISOString(),
            doc: { module: p.module, title: p.title ?? "", ...(p.kind ? { kind: p.kind as never } : {}) },
          }
        : {
            book: p.book ?? 1,
            chapter: p.chapter ?? 1,
            ...(p.verse ? { verse: p.verse } : {}),
            ...(p.to ? { to: p.to } : {}),
            at: new Date(p.at).toISOString(),
          },
    ),
    ...kept,
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50);
  return { bookmarks, highlights, docAt, plans: plansFrom(now), recent };
}
