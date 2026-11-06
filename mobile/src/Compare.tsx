// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useState } from "react";
import { Token } from "../../src/esword";
import { api, Module, save, saved, useLibraryKey, Verse } from "./api";
import { Icon } from "./icons";

/** The Bibles Compare starts with, as the mockups and the desktop's defaults have them. */
export const COMPARE_DEFAULT = ["kjv", "asv", "bsb", "web", "ylt"];

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

/** Indices of the words in b that aren't in the longest common run with a (the desktop's Compare.tsx). */
function diffWords(a: string[], b: string[]): Set<number> {
  const n = a.length,
    m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set<number>();
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keep.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out = new Set<number>();
  for (let k = 0; k < m; k++) if (!keep.has(k)) out.add(k);
  return out;
}

const words = (ts: Token[]) => ts.filter((t) => t.word).map((t) => norm(t.text));

/** Each Bible's verses of a chapter, from the last copy at once and then from the module. */
export function useChapters(ids: string[], l: { book: number; chapter: number }) {
  const lib = useLibraryKey();
  const [map, setMap] = useState<Map<string, Verse[]>>(new Map());
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    const start = new Map(ids.map((id) => [id, saved<Verse[]>(`ch.${id}.${l.book}.${l.chapter}`, [])]));
    setMap(start);
    for (const id of ids)
      api
        .chapter(id, l.book, l.chapter)
        .then((vs) => live && setMap((m) => new Map(m).set(id, vs)))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, l.book, l.chapter, lib]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

export function CompareView({
  bibles,
  ids,
  tokensOf,
  diff,
  onDiff,
  active,
  onWord,
  onEdit,
}: {
  bibles: Module[];
  ids: string[];
  /** A Bible's tokens for the verse (with borrowed Strong's numbers where it has none). */
  tokensOf: (id: string) => Token[] | undefined;
  diff: boolean;
  onDiff: (on: boolean) => void;
  /** The tapped word, to mark. */
  active?: { bible: string; i: number };
  onWord: (bible: string, i: number) => void;
  onEdit: () => void;
}) {
  const base = ids.includes("kjv") ? "kjv" : ids[0];
  const baseWords = words(tokensOf(base) ?? []);
  return (
    <>
      <div className="cmpbar">
        <span className="m" style={{ flex: 1 }}>
          {ids.length} translations ·{" "}
          <button className="link" onClick={onEdit}>
            Edit
          </button>
        </span>
        <label className="switch">
          Differences from the {bibles.find((b) => b.id === base)?.abbrev || base.toUpperCase()}
          <input type="checkbox" checked={diff} onChange={(e) => onDiff(e.target.checked)} />
          <span className="knob" aria-hidden="true" />
        </label>
      </div>
      <div className="cmp">
        {ids.map((id) => {
          const m = bibles.find((b) => b.id === id);
          const ts = tokensOf(id);
          const d = diff && id !== base && ts ? diffWords(baseWords, words(ts)) : null;
          return (
            <div key={id} className="card">
              <p className={`abbr ${id === base ? "base" : ""}`}>{m?.abbrev || id.toUpperCase()}</p>
              {!ts ? (
                <p className="empty">Opening…</p>
              ) : !ts.length ? (
                <p className="empty">Not in this translation.</p>
              ) : (
                <p className="text ctext">
                  {ts.map((t, i) => {
                    if (t.note) return null;
                    if (!t.word) return <span key={i}>{t.italic ? <i>{t.text}</i> : t.text}</span>;
                    const cls = [d?.has(t.wi) ? "diff" : "", active?.bible === id && active.i === i ? "w on" : ""].join(" ").trim();
                    return (
                      <span key={i} className={cls || undefined} onClick={() => onWord(id, i)}>
                        {t.italic ? <i>{t.text}</i> : t.text}
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
          );
        })}
        <p className="hint" style={{ marginTop: 8 }}>
          Swipe, or ‹ ›, for the next verse.
        </p>
      </div>
    </>
  );
}

/** Which Bibles Compare shows, in order. */
export function CompareEdit({ bibles, ids, onChange, onClose }: { bibles: Module[]; ids: string[]; onChange: (ids: string[]) => void; onClose: () => void }) {
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  useEffect(() => save("compare", ids), [ids]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet picker" aria-label="Bibles to compare">
        <div className="grab" onClick={onClose}>
          <span />
        </div>
        <div className="shead">
          <h2 style={{ flex: 1 }}>Compare</h2>
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sbody">
          <div className="list">
            {bibles
              .filter((b) => !b.id.endsWith("+"))
              .map((b) => (
                <button key={b.id} className={`row ${ids.includes(b.id) ? "on" : ""}`} onClick={() => toggle(b.id)}>
                  <span className="grow">{b.title}</span>
                  <span className="m">{b.abbrev}</span>
                  <span style={{ width: 18, color: "var(--accent)", display: "flex" }}>{ids.includes(b.id) && <Icon name="check" size={18} />}</span>
                </button>
              ))}
          </div>
          <p className="m" style={{ marginTop: 12 }}>
            Shown in the order you tick them. The KJV, when ticked, is the one differences are marked against.
          </p>
        </div>
      </section>
    </>
  );
}
