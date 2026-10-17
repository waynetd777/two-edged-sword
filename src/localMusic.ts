// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Songs on Windows: the music files in the Music folder (music_files.rs), played here in the page
// rather than in a Music app. It answers as music.rs does on macOS, so Quiet time, Songs for the
// chapter and the Lyrics page work the same.

import { invoke } from "@tauri-apps/api/core";
import type { MusicState, MusicTrack } from "./api";

interface FileTrack extends MusicTrack {
  album: string;
  duration: number;
}

const audio = new Audio();
/** The songs asked for, the one playing (or loading), and its file as a blob URL. */
let queue: FileTrack[] = [];
let at = -1;
let url = "";
/** The playing song's lyrics and tempo, from its tags; read once it starts. */
let extra = { lyrics: "", bpm: 0 };
let known = new Map<string, FileTrack>();

const STOPPED: MusicState = {
  state: "stopped",
  name: "",
  artist: "",
  ours: false,
  album: "",
  position: 0,
  duration: 0,
  lyrics: "",
  bpm: 0,
};

export async function fileTracks(): Promise<MusicTrack[]> {
  const all = await invoke<FileTrack[]>("music_files");
  known = new Map(all.map((t) => [t.id, t]));
  return all;
}

/** Plays song `i` of the queue; past the end, stops. */
async function start(i: number) {
  const t = queue[i];
  at = i;
  if (!t) return stop();
  const bytes = await invoke<ArrayBuffer>("music_file", { path: t.id });
  // Something else was asked for while the file was read.
  if (queue[at] !== t) return;
  URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([bytes]));
  audio.src = url;
  extra = { lyrics: "", bpm: 0 };
  invoke<typeof extra>("music_file_extra", { path: t.id })
    .then((x) => {
      if (queue[at] === t) extra = x;
    })
    .catch(() => {});
  await audio.play();
}
audio.addEventListener("ended", () => void start(at + 1).catch(() => stop()));

function stop() {
  queue = [];
  at = -1;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  URL.revokeObjectURL(url);
  url = "";
}

/** Plays these songs in this order, once through; returns how many were found. */
export async function filePlay(ids: string[]): Promise<number> {
  if (!known.size) await fileTracks();
  queue = ids.map((id) => known.get(id)).filter((t): t is FileTrack => !!t);
  if (queue.length) await start(0);
  else stop();
  return queue.length;
}

export function fileState(): MusicState {
  const t = queue[at];
  if (!t) return STOPPED;
  return {
    state: audio.paused ? "paused" : "playing",
    name: t.name,
    artist: t.artist,
    ours: true,
    album: t.album,
    position: audio.currentTime,
    duration: audio.duration || t.duration,
    lyrics: extra.lyrics,
    bpm: extra.bpm,
  };
}

export async function fileControl(cmd: "pause" | "play" | "next" | "stop" | "show") {
  if (cmd === "pause") audio.pause();
  else if (cmd === "play" && queue[at]) await audio.play();
  else if (cmd === "next" && queue[at]) await start(at + 1);
  else if (cmd === "stop") stop();
}

/** The playing song's artwork as image bytes; empty when it has none. */
export async function fileArtwork(): Promise<ArrayBuffer> {
  const t = queue[at];
  return t ? invoke<ArrayBuffer>("music_file_artwork", { path: t.id }) : new ArrayBuffer(0);
}
