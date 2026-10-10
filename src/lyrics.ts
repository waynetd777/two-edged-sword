// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// A song's words for the Lyrics page: timed ones from LRCLIB (lrclib.net, a free public lyrics
// database; the song's name, artist, album and length are sent to it), else the lyrics saved
// with the song in Music, else LRCLIB's untimed ones. And its artwork: Music's own, else the
// album's cover from Apple's public iTunes search.

import { api } from "./api";

export interface Lyrics {
  /** The lines; `at` is when each is sung, in seconds, when the lyrics are timed. */
  lines: { at?: number; text: string }[];
  timed: boolean;
  source: "lrclib" | "music";
}

interface Found {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const API = "https://lrclib.net/api";

/** Screenshot mode's song, shown instead of asking Music and LRCLIB: timed lyrics as LRC, and
 *  an image for its artwork. */
export interface SceneSong {
  name: string;
  artist: string;
  position: number;
  duration: number;
  lrc: string;
  art?: string;
  /** One of the pictures behind the words (Visions), shown this far through (0–1). */
  vision?: string;
  visionAt?: number;
}
export let sceneSong: SceneSong | null = null;
export const setSceneSong = (s: SceneSong) => (sceneSong = s);
const cache = new Map<string, Promise<Lyrics | null>>();

/** "[01:02.50] words" lines, a line sung more than once carrying each time. */
function parseLrc(lrc: string): Lyrics["lines"] {
  const out: Lyrics["lines"] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const times = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!times.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const t of times) out.push({ at: +t[1] * 60 + +t[2], text });
  }
  return out.sort((a, b) => a.at! - b.at!);
}

const plain = (text: string): Lyrics["lines"] => text.split(/\r?\n/).map((l) => ({ text: l.trim() }));

async function get(path: string): Promise<unknown> {
  let r = await fetch(`${API}/${path}`);
  // It is sometimes briefly unavailable: once more, a moment later.
  if (r.status >= 500) r = await new Promise((ok) => setTimeout(ok, 800)).then(() => fetch(`${API}/${path}`));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`LRCLIB: ${r.status}`);
  return r.json();
}

/** Of several found, timed ones first, then the nearest in length. */
function best(found: Found[], duration: number): Found | null {
  const usable = found.filter((f) => !f.instrumental && (f.syncedLyrics || f.plainLyrics));
  usable.sort((a, b) => +!!b.syncedLyrics - +!!a.syncedLyrics || Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
  return usable[0] ?? null;
}

/** "Way Maker (Live)" → "Way Maker": what LRCLIB is likelier to have. */
const bare = (name: string) =>
  name
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .replace(/\s+-\s+.*$/, "")
    .trim();

async function lookup(name: string, artist: string, album: string, duration: number): Promise<Found | null> {
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const exact = (await get(
    `get?${q({ track_name: name, artist_name: artist, album_name: album, duration: String(Math.round(duration)) })}`,
  ).catch(() => null)) as Found | null;
  if (exact?.syncedLyrics) return exact;
  let found = ((await get(`search?${q({ track_name: name, artist_name: artist })}`)) as Found[] | null) ?? [];
  if (!found.some((f) => f.syncedLyrics) && bare(name) !== name)
    found = found.concat(((await get(`search?${q({ track_name: bare(name), artist_name: artist })}`)) as Found[] | null) ?? []);
  if (!found.length) found = ((await get(`search?${q({ q: `${bare(name)} ${artist}` })}`)) as Found[] | null) ?? [];
  return best(exact ? [exact, ...found] : found, duration);
}

/** The words for a song, or null when none are found. Asked once per song while the app runs. */
export function lyricsFor(name: string, artist: string, album: string, duration: number, saved: string): Promise<Lyrics | null> {
  if (sceneSong) return Promise.resolve({ lines: parseLrc(sceneSong.lrc), timed: true, source: "lrclib" });
  const key = `${name}\u0000${artist}`;
  let p = cache.get(key);
  if (!p) {
    p = lookup(name, artist, album, duration).then((f): Lyrics | null => {
      if (f?.syncedLyrics) return { lines: parseLrc(f.syncedLyrics), timed: true, source: "lrclib" };
      if (saved.trim()) return { lines: plain(saved), timed: false, source: "music" };
      if (f?.plainLyrics) return { lines: plain(f.plainLyrics), timed: false, source: "lrclib" };
      return null;
    });
    // A failed lookup (offline) is tried again next time.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

interface ItunesSong {
  artistName: string;
  collectionName: string;
  artworkUrl100?: string;
}
const art = new Map<string, Promise<string | null>>();
/** Music's own pictures, as blob addresses by song: the latest few are kept, older ones let go
 *  (and asked for again if their song comes back). */
const blobs: { key: string; url: string }[] = [];
const KEEP_BLOBS = 20;
const blobOf = (key: string, bytes: ArrayBuffer) => {
  const url = URL.createObjectURL(new Blob([bytes]));
  blobs.push({ key, url });
  while (blobs.length > KEEP_BLOBS) {
    const old = blobs.shift()!;
    URL.revokeObjectURL(old.url);
    art.delete(old.key);
  }
  return url;
};

/** The playing song's artwork, as an address an <img> can show; asked once per song. */
export function artworkFor(name: string, artist: string, album: string): Promise<string | null> {
  if (sceneSong) return Promise.resolve(sceneSong.art ?? null);
  const key = `${name}\u0000${artist}`;
  let p = art.get(key);
  if (!p) {
    p = api
      .musicArtwork()
      .catch(() => new ArrayBuffer(0))
      .then(async (bytes) => {
        // Music gives the picture of whatever is playing now: only this song's is kept as its own.
        const now = bytes.byteLength ? await api.musicState().catch(() => null) : null;
        if (now && now.name === name && now.artist === artist) return blobOf(key, bytes);
        const q = new URLSearchParams({ term: `${bare(name)} ${artist}`, entity: "song", limit: "10" });
        const r = await fetch(`https://itunes.apple.com/search?${q}`);
        if (!r.ok) throw new Error(`iTunes: ${r.status}`);
        const found = ((await r.json()) as { results: ItunesSong[] }).results.filter((x) => x.artworkUrl100);
        const hit = found.find((x) => album && x.collectionName === album) ?? found[0];
        return hit ? hit.artworkUrl100!.replace(/\/\d+x\d+bb\./, "/600x600bb.") : null;
      });
    p.catch(() => art.delete(key));
    art.set(key, p);
  }
  return p;
}
