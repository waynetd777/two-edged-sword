// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useState } from "react";
import { fmtRef } from "../../src/bible";
import { lexiconParts, renderHtml, Token } from "../../src/esword";
import { api, Article } from "./api";
import { Icon } from "./icons";

/** Says an original-language word, as the desktop's SayButton does: in a Hebrew or Greek voice when
 *  the phone has one, otherwise its pronunciation ("ray-sheeth'") in an English voice. */
function say(word: string, num: string, pron: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const lang = num.startsWith("H") ? "he" : "el";
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  const u = new SpeechSynthesisUtterance(voice ? word : pron.replace(/[-'ʼ]/g, " "));
  if (voice) u.voice = voice;
  else u.lang = "en-US";
  u.rate = voice ? 0.8 : 0.9;
  synth.speak(u);
}

/** The words of a verse that have a Strong's number, as indexes into its tokens. */
export const taggedWords = (tokens: Token[]) => tokens.flatMap((t, i) => (t.word && t.strongs.length ? [i] : []));

/** A tapped word or Strong's number: its lexicon entry, with the verse's previous and next words. */
export function WordSheet({
  at,
  tokens,
  index,
  num,
  onIndex,
  onStudy,
  onClose,
}: {
  at: { book: number; chapter: number; verse: number };
  tokens: Token[];
  /** The token tapped. */
  index: number;
  /** The number tapped, when it was a number rather than its word. */
  num?: string;
  onIndex: (i: number) => void;
  onStudy: () => void;
  onClose: () => void;
}) {
  const t = tokens[index];
  const words = taggedWords(tokens);
  const at_ = words.indexOf(index);
  const prev = at_ > 0 ? words[at_ - 1] : undefined;
  const next = at_ >= 0 && at_ < words.length - 1 ? words[at_ + 1] : undefined;
  // A number followed from inside an entry ("from G756") replaces the word's own.
  const [follow, setFollow] = useState<string | null>(null);
  const shown = follow ?? num ?? t?.strongs[0];
  const [entry, setEntry] = useState<Article | null | undefined>(undefined);

  useEffect(() => setFollow(null), [index, num]);
  useEffect(() => {
    if (!shown) return;
    let live = true;
    setEntry(undefined);
    api
      .article("lexicon", "strong", shown)
      .then((a) => live && setEntry(a))
      .catch(() => live && setEntry(null));
    return () => {
      live = false;
    };
  }, [shown]);

  const parts = entry ? lexiconParts(entry.html) : null;
  const word = (i?: number) => (i === undefined ? "" : tokens[i].text);

  return (
    <>
      <div className="scrim clear" onClick={onClose} />
      <section className="sheet word" aria-label="Word">
        <div className="grab" onClick={onClose}>
          <span />
        </div>
        <div className="wordnav">
          <button disabled={prev === undefined} onClick={() => prev !== undefined && onIndex(prev)} aria-label={`Previous word: ${word(prev)}`}>
            ‹ {word(prev)}
          </button>
          <span className="m">
            {fmtRef(at)} · “{t?.text}”
          </span>
          <button disabled={next === undefined} onClick={() => next !== undefined && onIndex(next)} aria-label={`Next word: ${word(next)}`}>
            {word(next)} ›
          </button>
        </div>
        {t && t.strongs.length > 1 && !follow && (
          <div className="nums">
            {t.strongs.map((n) => (
              <button key={n} className={n === shown ? "on" : undefined} onClick={() => setFollow(n)}>
                {n}
              </button>
            ))}
          </div>
        )}
        <div className="sbody">
          {entry === undefined ? (
            <p className="empty">Opening…</p>
          ) : !entry || !parts ? (
            <p className="empty">{shown} isn't in Strong's lexicon.</p>
          ) : (
            <>
              <div className="head">
                <span className="orig" lang={shown?.startsWith("H") ? "he" : "el"}>
                  {parts.word}
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <i className="translit">{parts.translit}</i>
                  <span className="m">{parts.pron}</span>
                </span>
                <button className="say" aria-label={`Say ${parts.word}`} onClick={() => shown && say(parts.word, shown, parts.pron)}>
                  <Icon name="speaker" size={20} />
                </button>
                <span className="spacer" />
                <span className="tag">{shown}</span>
              </div>
              <div className="prose">{renderHtml(parts.rest, { inlineNums: true, onStrongs: (n) => setFollow(n) })}</div>
              {parts.total !== undefined && <p className="m">{parts.total} times in the KJV</p>}
              {follow && (
                <button className="fold" onClick={() => setFollow(null)}>
                  ‹ Back to {num ?? t?.strongs[0]}
                </button>
              )}
            </>
          )}
          <div className="actions">
            <button className="primary" onClick={onStudy}>
              Study this verse
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
