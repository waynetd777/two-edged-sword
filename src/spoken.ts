// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// How text is said aloud: the words the voice gets wrong respelled, references said in full, chapters
// announced, and the map from each spoken character back to the page's. Shared by the desktop's Listen
// (speech.tsx) and the phone's (mobile/src/player.ts), so a correction reaches both.

import type { Voice } from "./api";
import { book, psalmLabel, Ref } from "./bible";
import { tokenize } from "./esword";
import { findRefs } from "./refs";

/** Words the voice gets wrong, spelled as it says them right ("teach", "teaching", "teacher"). */
export const SAY_AS: [RegExp, string][] = [
  [/\bEcclesiastes\b/gi, "Ek-lee-zee-ass-tiz"],
  [/\bteach/g, "teetch"],
  [/\bTeach/g, "Teetch"],
  [/\bTEACH/g, "TEETCH"],
];
export const sayAs = (s: string) => SAY_AS.reduce((x, [re, to]) => x.replace(re, to), s);

/** How a chapter is announced: "Psalm 23", "First Samuel, chapter 3", "John, chapter 3, from verse 16". */
export function spokenChapter(b: number, c: number, fromVerse?: number): string {
  const name = sayAs(book(b).name).replace(/^1 /, "First ").replace(/^2 /, "Second ").replace(/^3 /, "Third ");
  const ch = b === 19 ? `Psalm ${c}` : book(b).chapters === 1 ? name : `${name}, chapter ${c}`;
  return fromVerse && fromVerse > 1 ? `${ch}, from verse ${fromVerse}` : ch;
}

/** A reference as it should be heard: "Exo 31:18" is "Exodus 31 18", "1 Cor 13" "First Corinthians 13". */
export function sayRef(r: Ref): string {
  const name = sayAs(psalmLabel(book(r.book).name))
    .replace(/^1 /, "First ")
    .replace(/^2 /, "Second ")
    .replace(/^3 /, "Third ");
  if (!r.verse) return `${name} ${r.chapter}`;
  if (book(r.book).chapters === 1) return `${name} ${r.verse}${r.to && r.to !== r.verse ? ` to ${r.to}` : ""}`;
  if (r.toChapter && r.toChapter !== r.chapter) return `${name} ${r.chapter} ${r.verse} to ${r.toChapter} ${r.to}`;
  return `${name} ${r.chapter} ${r.verse}${r.to && r.to !== r.verse ? ` to ${r.to}` : ""}`;
}

// Apple's character voices, in every language: last when Automatic picks one.
export const NOVELTY =
  /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bahh|Bells|Boing|Bubbles|Cellos|Jester|Organ|Trinoids|Whisper|Zarvox|Wobble|Bad News|Good News|Superstar|Albert|Fred|Junior|Kathy|Ralph)\b/;

/** Voices best first: Premium, then Enhanced, then the rest, character voices last. */
export const rankVoices = (vs: Voice[]) =>
  [...vs].sort((a, b) => Number(NOVELTY.test(a.name)) - Number(NOVELTY.test(b.name)) || b.quality - a.quality);

/** The voices for Hebrew, Greek or Latin, best first. Latin has none of its own: an Italian voice
 *  says Church Latin as it's said. */
export const voicesFor = (all: Voice[], lang: "he" | "el" | "la") =>
  rankVoices(all.filter((v) => v.lang.startsWith(lang === "la" ? "it" : lang) || (lang === "la" && v.lang.startsWith("la"))));

/** A Latin Bible: the Vulgates (Latin, Latin+, Vulg-C, Vulg-C+). */
export const isLatin = (m?: { title: string; abbrev: string }) => !!m && /\b(latin|vulg)/i.test(`${m.title} ${m.abbrev}`);

/** "he" for a text mostly in Hebrew letters (or Syriac's, which are read as Hebrew: speakable), "el" for
 *  Greek, else null. */
export function scriptOf(text: string): "he" | "el" | null {
  const he = (text.match(/[\u0590-\u05FF\u0710-\u072F]/g) ?? []).length,
    el = (text.match(/[\u0370-\u03FF\u1F00-\u1FFF]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (he > en && he >= el) return "he";
  if (el > en) return "el";
  return null;
}

/**
 * A verse as it is read aloud: its words as the reader shows them (tokenize), so a word-by-word
 * Bible is read in its own language without the English and grammar beneath each word, and the
 * character positions match the tokens' for the highlight. Another edition's reading (⟨ ⟩) is
 * blanked out, the same length.
 */
export function speechText(html: string): string {
  return tokenize(html)
    .map((t) => (t.variant ? " ".repeat(t.text.length) : t.text))
    .join("");
}

// "read" and "lead", which the voice says "red" and "led" whatever they mean, and "er" between
// consonants (perfectly, servant, mercy; not perish, every, fierce), which it says "e-er". "cer"
// is "sur" ("cur" is a hard c); "ger" is left, as its g is hard or soft by the word (fingers, danger).
// Only where the "er" is stressed: in the word's first syllable, or the first after a prefix
// (concerning, imperfect); not everlasting or brothers, which the voice says right.
export const HETERONYMS = /\b(read|lead)\b|(?<=[bdfhjklmnpqstvwxz])er(?=[bcdfghjklmnpqstvwxz])|cer(?=[bcdfghjklmnpqstvwxz])/gi;

/** "read" as "reed" after a word that wants the present ("to read", "shall read", "did ye
 *  never read"); "lead" as "leed" unless it is the metal ("as lead", "tin, and lead"). */
export function respell(t: string, m: RegExpMatchArray): string | null {
  const word = m[0],
    before = t.slice(Math.max(0, m.index! - 40), m.index).toLowerCase();
  const keepCase = (say: string) => (word[0] === word[0].toUpperCase() ? say[0].toUpperCase() + say.slice(1) : say);
  const up = (c: string, to: string) => (c === c.toUpperCase() ? to.toUpperCase() : to);
  if (/^c?er$/i.test(word)) {
    const head = (t.slice(0, m.index!).match(/[A-Za-z]*$/)?.[0] ?? "") + word.slice(0, word.length - 2);
    if (!/^(?:con|de|re|pre|ob|sub|im|dis|ex)?[^aeiouy]*$/i.test(head)) return null;
    // Said right as they are, and worse respelled: mercy, certain, deserve (its s a z).
    if (/m$/i.test(head) || (/^c/i.test(word) && !head.slice(0, -1)) || /^(?:con|de|re|pre|ob|sub)s$/i.test(head)) return null;
  }
  if (/^er$/i.test(word)) return up(word[0], "u") + word[1];
  if (/^cer$/i.test(word)) return up(word[0], "s") + up(word[1], "u") + word[2];
  if (/^read$/i.test(word))
    return /\b(to|shall|shalt|will|wilt|would|should|can|canst|could|may|might|must|do|dost|doth|does|did|didst|let)(\s+(ye|you|thou|he|she|they|we|i|not|never))*\s+$/.test(
      before,
    ) || /(^|[.!?;:"“]\s*)$/.test(before)
      ? keepCase("reed")
      : null;
  if (/\b(as|the|of|with|like)\s+$/.test(before) || /\b(tin|iron|brass|silver|gold)\b[^.;]*$/.test(before)) return null;
  return keepCase("leed");
}

/**
 * The text to speak, with its references said in full, and for each character of it the
 * character of `text` it stands for, so the word highlight still lands on the page's words.
 */
export function speakable(text: string): { spoken: string; at: number[] } {
  // e-Sword writes references "Psa_82:1"; the same length with a space, so positions hold.
  // An em dash as an en dash, which sounds the same: after a long clause ending in an em dash,
  // macOS's premium voices report the rest of the verse as one stretch, and the highlight stops.
  const t = text.replace(/([A-Za-z])_(\d)/g, "$1 $2").replace(/[\u2014\u2015]/g, "\u2013");
  let spoken = "",
    last = 0;
  const at: number[] = [];
  const copy = (to: number) => {
    for (let k = last; k < to; k++) at.push(k);
    spoken += t.slice(last, to);
  };
  // References, and "v. 12" / "vv. 3–5" (said "verse", not "version"), in the order they come.
  const said = findRefs(t, true).map((h) => ({ index: h.index, length: h.length, say: sayRef(h.ref) }));
  // The verses after it, a list of them and ranges ("vv. 7, 11-14"): "verses 7, 11 to 14".
  for (const m of t.matchAll(/\b(vv?|vs|ver)\.\s*(\d+(?:\s*[-\u2013]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-\u2013]\s*\d+)?)*)/gi))
    if (!said.some((h) => m.index < h.index + h.length && h.index < m.index + m[0].length)) {
      const list = m[2].split(/\s*,\s*/).map((p) => p.replace(/\s*[-\u2013]\s*/, " to "));
      const many = /^vv$/i.test(m[1]) || list.length > 1 || / to /.test(list[0]);
      said.push({ index: m.index, length: m[0].length, say: `${many ? "verses" : "verse"} ${list.join(", ")}` });
    }
  for (const [re, to] of SAY_AS)
    for (const m of t.matchAll(re))
      if (!said.some((h) => m.index < h.index + h.length && h.index < m.index + m[0].length))
        said.push({ index: m.index, length: m[0].length, say: to });
  // Words the voice says the wrong way, respelled the same length so positions hold.
  for (const m of t.matchAll(HETERONYMS)) {
    const say = respell(t, m);
    if (say && !said.some((h) => m.index < h.index + h.length && h.index < m.index + m[0].length))
      said.push({ index: m.index, length: m[0].length, say });
  }
  said.sort((x, y) => x.index - y.index);
  for (const h of said) {
    copy(h.index);
    const say = h.say;
    // Each spoken character of the reference points into the written one, in proportion.
    for (let k = 0; k < say.length; k++) at.push(h.index + Math.min(h.length - 1, Math.floor((k * h.length) / say.length)));
    spoken += say;
    last = h.index + h.length;
  }
  copy(t.length);
  return SYRIAC.test(spoken) ? asHebrew(spoken, at) : { spoken, at };
}

const SYRIAC = /[\u0710-\u072F]/;
/** Syriac's letters, ܐ to ܬ, and the Hebrew letter each one is (the two alphabets match one for one). */
const SYRIAC_LETTERS: Record<string, string> = {
  "\u0710": "א",
  "\u0712": "ב",
  "\u0713": "ג",
  "\u0714": "ג",
  "\u0715": "ד",
  "\u0716": "ד",
  "\u0717": "ה",
  "\u0718": "ו",
  "\u0719": "ז",
  "\u071A": "ח",
  "\u071B": "ט",
  "\u071C": "ט",
  "\u071D": "י",
  "\u071E": "י",
  "\u071F": "כ",
  "\u0720": "ל",
  "\u0721": "מ",
  "\u0722": "נ",
  "\u0723": "ס",
  "\u0724": "ס",
  "\u0725": "ע",
  "\u0726": "פ",
  "\u0727": "פ",
  "\u0728": "צ",
  "\u0729": "ק",
  "\u072A": "ר",
  "\u072B": "ש",
  "\u072C": "ת",
};
/** Hebrew's final forms, which its voice expects at the end of a word. */
const FINAL: Record<string, string> = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };

/**
 * Syriac in Hebrew letters, for the Hebrew voice: no computer or phone has a Syriac one, and the
 * English voice says nothing at all for it. Its vowel marks are left out and its punctuation is a
 * full stop; `at` is kept in step, so the word being read is still marked.
 */
function asHebrew(text: string, at: number[]): { spoken: string; at: number[] } {
  let spoken = "";
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const he = SYRIAC_LETTERS[c] ?? (c >= "\u0700" && c <= "\u070D" ? "." : c >= "\u0700" && c <= "\u074F" ? "" : c);
    if (!he) continue;
    spoken += he;
    out.push(at[i]);
  }
  spoken = spoken.replace(/[כמנפצ](?![\u05D0-\u05EA])/g, (c) => FINAL[c]);
  return { spoken, at: out };
}
