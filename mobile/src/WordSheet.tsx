// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { HL_COLORS, highlights, HlColor, useHighlights, vkey } from "./highlights";
import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { fmtRef } from "../../src/bible";
import { headwords, lexiconParts, renderHtml, Token } from "../../src/esword";
import { api, Article } from "./api";
import { Icon } from "./icons";

/** Says an original-language word through the native plugin, apart from Listen (which carries on): a Hebrew
 *  or Greek voice when the phone has one, otherwise its pronunciation ("ray-sheeth'") in English, as the
 *  desktop's SayButton does. Android's web view has no speech of its own. */
export function say(word: string, num: string, pron: string) {
  return invoke("plugin:tes-native|say", { word, lang: num.startsWith("H") ? "he" : "el", pron });
}

/** The plugin's "say" events (start, done), to every speaker button showing it. */
const sayWatchers = new Set<(kind: string) => void>();
let sayListening = false;
function listenSay() {
  if (sayListening) return;
  sayListening = true;
  addPluginListener<{ kind: string }>("tes-native", "say", (e) => sayWatchers.forEach((w) => w(e.kind))).catch(() => {
    sayListening = false;
  });
}

/** A speaker that says the word, and shows it was tapped: it pulses until the voice starts, stays lit while
 *  it speaks, and goes back when it's done. */
export function SayButton({ word, num, pron, size = 20 }: { word: string; num: string; pron: string; size?: number }) {
  const [state, setState] = useState<"idle" | "waiting" | "speaking">("idle");
  useEffect(() => {
    listenSay();
    const w = (kind: string) => setState((s) => (s === "idle" ? s : kind === "start" ? "speaking" : "idle"));
    sayWatchers.add(w);
    return () => {
      sayWatchers.delete(w);
    };
  }, []);
  // Never stuck lit, if an event goes missing.
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), state === "waiting" ? 6000 : 8000);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      className={`say ${state}`}
      aria-label={`Say ${word}`}
      aria-busy={state !== "idle"}
      onClick={() => {
        setState("waiting");
        say(word, num, pron).catch(() => setState("idle"));
      }}
    >
      <Icon name="speaker" size={size} />
    </button>
  );
}

/** The words of a verse, as indexes into its tokens. */
export const taggedWords = (tokens: Token[]) => tokens.flatMap((t, i) => (t.word ? [i] : []));

/** A tapped word or Strong's number: its lexicon entry, with the verse's previous and next words. */
export function WordSheet({
  at,
  tokens,
  index,
  num,
  onIndex,
  guessFrom,
  guessVerse,
  onStudy,
  onWordStudy,
  onClose,
}: {
  /** Opens the number's full Word Study. */
  onWordStudy: (num: string) => void;
  /** In a Bible without Strong's numbers: the Strong's Bible to guess a word's number from. */
  guessFrom?: string;
  /** The same verse in that Bible: a word found there takes its numbers. */
  guessVerse?: Token[];
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
  // A word with no number of its own: the numbers the KJV most often uses it for, as the desktop
  // guesses them (WordLookup.tsx). undefined while looking.
  const [guess, setGuess] = useState<string[] | undefined>(undefined);
  const own = t?.strongs ?? [];
  const nums = own.length ? own : (guess ?? []);
  const shown = follow ?? num ?? nums[0];
  useEffect(() => {
    let live = true;
    setGuess(own.length || !guessFrom ? [] : undefined);
    if (own.length || !guessFrom || !t) return;
    const forms = headwords(t.text);
    // First the same verse in the KJV: the word, or a form of it, with its numbers there.
    const there = guessVerse?.find((k) => k.word && k.strongs.length && headwords(k.text).some((f) => forms.includes(f)));
    if (there) {
      setGuess(there.strongs);
      return;
    }
    // Otherwise what the KJV most often translates it from, in this testament's language.
    const lang = at.book >= 40 && at.book <= 66 ? "G" : "H";
    (async () => {
      for (const h of forms) {
        const ns = (await api.strongsForWord(guessFrom, h).catch(() => [])).filter((n) => n.num.startsWith(lang));
        if (ns.length) {
          if (live)
            setGuess(
              ns
                .sort((a, b) => b.count - a.count)
                .slice(0, 2)
                .map((n) => n.num),
            );
          return;
        }
      }
      if (live) setGuess([]);
    })();
    return () => {
      live = false;
    };
  }, [index, guessFrom, t?.text, guessVerse?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [entry, setEntry] = useState<Article | null | undefined>(undefined);

  useEffect(() => setFollow(null), [index, num]);
  useEffect(() => {
    if (!shown) {
      setEntry(guess === undefined ? undefined : null);
      return;
    }
    let live = true;
    setEntry(undefined);
    api
      .article("lexicon", "strong", shown)
      .then((a) => live && setEntry(a))
      .catch(() => live && setEntry(null));
    return () => {
      live = false;
    };
  }, [shown, guess]);

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
          <button
            disabled={prev === undefined}
            onClick={() => prev !== undefined && onIndex(prev)}
            aria-label={`Previous word: ${word(prev)}`}
          >
            ‹ {word(prev)}
          </button>
          <span className="m">
            {fmtRef(at)} · “{t?.text}”
          </span>
          <button disabled={next === undefined} onClick={() => next !== undefined && onIndex(next)} aria-label={`Next word: ${word(next)}`}>
            {word(next)} ›
          </button>
        </div>
        {nums.length > 1 && !follow && (
          <div className="nums">
            {nums.map((n) => (
              <button key={n} className={n === shown ? "on" : undefined} onClick={() => setFollow(n)}>
                {n}
              </button>
            ))}
          </div>
        )}
        <div className="sbody">
          {entry === undefined ? (
            <p className="empty">Opening…</p>
          ) : !shown ? (
            <p className="empty">No Strong's number found for “{t?.text}”.</p>
          ) : !entry || !parts ? (
            <p className="empty">{shown} isn't in Strong's lexicon.</p>
          ) : (
            <>
              {!own.length && !follow && !num && (
                <p className="m" style={{ margin: "0 0 8px" }}>
                  A guess: this Bible has no Strong's numbers, so this is how the KJV translates “{t?.text}”.
                </p>
              )}
              <div className="head">
                <span className="orig" lang={shown?.startsWith("H") ? "he" : "el"}>
                  {parts.word}
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <i className="translit">{parts.translit}</i>
                  <span className="m">{parts.pron}</span>
                </span>
                {shown && <SayButton word={parts.word} num={shown} pron={parts.pron} />}
                <span className="spacer" />
                <span className="tag">{shown}</span>
              </div>
              <div className="prose">{renderHtml(parts.rest, { inlineNums: true, onStrongs: (n) => setFollow(n) })}</div>
              {parts.total !== undefined && <p className="m">{parts.total} times in the KJV</p>}
              {follow && (
                <button className="fold" onClick={() => setFollow(null)}>
                  ‹ Back to {num ?? nums[0]}
                </button>
              )}
            </>
          )}
          <HighlightRow at={at} />
          <div className="actions">
            {shown && entry && (
              <button className="primary" onClick={() => onWordStudy(shown)}>
                Word Study
              </button>
            )}
            <button className="secondary" onClick={onStudy}>
              Study this verse
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

/** The verse's highlight: a colour to set it, ✕ to clear it (highlights.ts; synced with the desktop). */
const DOT: Record<HlColor, string> = {
  red: "#e59a92",
  orange: "#efb97e",
  yellow: "#e9d271",
  green: "#a9cf9f",
  teal: "#8fcfc6",
  blue: "#9fc0e6",
  purple: "#c1a9e3",
  grey: "#aab3bf",
};
function HighlightRow({ at }: { at: { book: number; chapter: number; verse: number } }) {
  const all = useHighlights();
  const k = vkey(at.book, at.chapter, at.verse);
  const on = all[k];
  return (
    <div className="hlrow" role="group" aria-label={`Highlight verse ${at.verse}`}>
      <span className="m">Highlight</span>
      {HL_COLORS.map((c) => (
        <button
          key={c}
          className={`hldot ${on === c ? "on" : ""}`}
          style={{ background: DOT[c] }}
          aria-label={c}
          aria-pressed={on === c}
          onClick={() => highlights.set(k, on === c ? null : c)}
        />
      ))}
      {on && (
        <button className="hlclear" aria-label="Remove the highlight" onClick={() => highlights.set(k, null)}>
          ✕
        </button>
      )}
    </div>
  );
}
