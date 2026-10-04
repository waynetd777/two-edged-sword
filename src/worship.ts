// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Worship songs for Quiet time: chosen from the user's Music library to suit the day's reading.
// The assistant picks them from the library's worship songs by number, so it can only name songs
// that are there; without an assistant, or if its answer can't be read, they are picked at random.
// Songs Quiet time has played are kept (worship-history), and none played in the last two weeks
// is chosen again.

import { api, MusicTrack } from "./api";
import { askOnce } from "./Ask";
import { assistantModels, pickModel } from "./assistant";
import { today, ymd } from "./plans";

/** Genres that hold worship music, as the Music app and the stores name them. */
const WORSHIP = /christian|gospel|worship|praise|religious|inspirational|ccm/i;

let library: Promise<MusicTrack[]> | null = null;
/** The library's worship songs, one of each title and artist; read once a session. */
function worshipSongs(): Promise<MusicTrack[]> {
  library ??= api
    .musicTracks()
    .then((ts) => {
      const seen = new Set<string>();
      return ts.filter((t) => {
        const k = songKey(t);
        if (!WORSHIP.test(t.genre) || !t.name.trim() || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    })
    .catch((e) => {
      library = null;
      throw e;
    });
  return library;
}

/** Days a played song is left out of the choice for. */
const REST_DAYS = 14;
const HISTORY = "worship-history";

/** A song Quiet time played, and the day (yyyy-mm-dd). */
interface Played {
  id: string;
  name: string;
  artist: string;
  date: string;
}

const songKey = (t: { name: string; artist: string }) => `${t.name.toLowerCase()}|${t.artist.toLowerCase()}`;

let history: Promise<Played[]> | null = null;
function playedSongs(): Promise<Played[]> {
  history ??= api.storeRead<Played[]>(HISTORY).then(
    (x) => (Array.isArray(x) ? x : []),
    () => [],
  );
  return history;
}

/** Records that Quiet time is playing these songs today. */
export async function markPlayed(songs: Song[]) {
  const date = ymd(new Date());
  const all = await playedSongs();
  const fresh = songs.filter((s) => !all.some((p) => p.id === s.id && p.date === date));
  if (!fresh.length) return;
  all.push(...fresh.map(({ id, name, artist }) => ({ id, name, artist, date })));
  await api.storeWrite(HISTORY, all);
}

/** The songs played in the last REST_DAYS days, by id and by title and artist. */
async function recentlyPlayed(): Promise<Set<string>> {
  const d = new Date();
  d.setDate(d.getDate() - REST_DAYS);
  const since = ymd(d);
  return new Set((await playedSongs()).filter((p) => p.date > since).flatMap((p) => [p.id, songKey(p)]));
}

export interface Song {
  id: string;
  name: string;
  artist: string;
  /** Why it suits the reading. */ why?: string;
}
/** The songs, with the assistant's word on the day's themes (`intro`), or why it had to guess (`note`). */
export interface Picked {
  songs: Song[];
  intro?: string;
  note?: string;
}

// A day's choice is kept, so starting Quiet time again doesn't wait for the assistant again.
const chosen = new Map<string, Promise<Picked>>();

/** `n` songs for a Quiet time reading `about` (its parts, "John 3", "My Utmost for His Highest"),
 *  leaving out the songs in `avoid` (by id). */
export function pickSongs(n: number, about: string[], when: "before" | "after", model: string, avoid: string[] = []): Promise<Picked> {
  const key = JSON.stringify([n, about, when, avoid, today().toDateString()]);
  let p = chosen.get(key);
  if (!p) {
    p = choose(n, about, when, model, new Set(avoid));
    chosen.set(key, p);
    // Only a real choice is kept; a random one (or a failure) is tried again next time.
    p.then(
      (x) => {
        if (x.note) chosen.delete(key);
      },
      () => chosen.delete(key),
    );
  }
  return p;
}

async function choose(n: number, about: string[], when: "before" | "after", model: string, avoid: Set<string>): Promise<Picked> {
  const library = (await worshipSongs()).filter((t) => !avoid.has(t.id));
  if (!library.length) throw new Error("No worship songs in your Music library (Christian, gospel or worship genres).");
  // Leaving out what was played lately, unless that leaves too few.
  const recent = await recentlyPlayed();
  const rested = library.filter((t) => !recent.has(t.id) && !recent.has(songKey(t)));
  const all = rested.length >= n ? rested : library;
  const take = (xs: MusicTrack[]) => xs.slice(0, n).map(({ id, name, artist }) => ({ id, name, artist }));
  const random = (note: string): Picked => ({ songs: take([...all].sort(() => Math.random() - 0.5)), note });
  const models = assistantModels();
  if (!models.length) return random("Chosen at random: no AI assistant is set up.");
  const list = all.map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`).join("\n");
  const prompt = `Choose ${n} worship song${n === 1 ? "" : "s"} for someone's quiet time with God, to play ${when === "before" ? "before their reading, preparing their heart for it" : "after their reading, as a response to it"}.
Today they are reading: ${about.join("; ")}.
Choose songs whose words and themes fit what these passages are about, and that suit worship (not upbeat rock or songs about something else). Choose only from the numbered list below, which is their own music library.
Reply with only JSON, and nothing else, in this form:
{"intro": "one or two sentences on what today's reading is about and how the songs answer it", "songs": [{"n": 12, "why": "one sentence on how this song relates to the reading"}]}
with the songs in the order to play them. Speak to the reader as "you", warmly and plainly; name passages, not verse numbers alone.

${list}`;
  try {
    const answer = await askOnce(prompt, pickModel(model, models));
    const r = readAnswer(answer);
    const seen = new Set<number>();
    const songs = r.songs
      .filter((x) => all[x.n - 1] && !seen.has(x.n) && seen.add(x.n))
      .slice(0, n)
      .map(({ n: k, why }) => {
        const { id, name, artist } = all[k - 1];
        return { id, name, artist, why };
      });
    if (!songs.length) return random("Chosen at random: the assistant's answer couldn't be read.");
    return { songs, intro: r.intro };
  } catch (e) {
    return random(`Chosen at random: ${e instanceof Error ? e.message : e}`);
  }
}

/** The assistant's JSON, from wherever it is in the answer; a bare array of numbers is taken too. */
function readAnswer(text: string): { intro?: string; songs: { n: number; why?: string }[] } {
  const obj = text.match(/\{[\s\S]*\}/)?.[0];
  if (obj) {
    try {
      const j = JSON.parse(obj) as { intro?: unknown; songs?: unknown };
      const songs = Array.isArray(j.songs)
        ? j.songs.flatMap((x) => {
            const o = x as { n?: unknown; why?: unknown };
            return typeof o.n === "number"
              ? [{ n: o.n, why: typeof o.why === "string" ? o.why : undefined }]
              : typeof x === "number"
                ? [{ n: x }]
                : [];
          })
        : [];
      return { intro: typeof j.intro === "string" ? j.intro : undefined, songs };
    } catch {
      /* fall through */
    }
  }
  const nums = text.match(/\[[\d,\s]*\]/)?.[0];
  try {
    return { songs: (nums ? (JSON.parse(nums) as number[]) : []).map((n) => ({ n })) };
  } catch {
    return { songs: [] };
  }
}
