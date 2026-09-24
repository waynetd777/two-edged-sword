// Worship songs for Quiet time: chosen from the user's Music library to suit the day's reading.
// The assistant picks them from the library's worship songs by number, so it can only name songs
// that are there; without an assistant, or if its answer can't be read, they are picked at random.

import { api, MusicTrack } from "./api";
import { askOnce } from "./Ask";
import { assistantModels, pickModel } from "./assistant";

/** Genres that hold worship music, as the Music app and the stores name them. */
const WORSHIP = /christian|gospel|worship|praise|religious|inspirational|ccm/i;

let library: Promise<MusicTrack[]> | null = null;
/** The library's worship songs, one of each title and artist; read once a session. */
function worshipSongs(): Promise<MusicTrack[]> {
  library ??= api.musicTracks().then((ts) => {
    const seen = new Set<string>();
    return ts.filter((t) => {
      const k = `${t.name.toLowerCase()}|${t.artist.toLowerCase()}`;
      if (!WORSHIP.test(t.genre) || !t.name.trim() || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }).catch((e) => { library = null; throw e; });
  return library;
}

export interface Picked { songs: { id: string; name: string; artist: string }[]; note?: string }

// A day's choice is kept, so starting Quiet time again doesn't wait for the assistant again.
const chosen = new Map<string, Promise<Picked>>();

/** `n` songs for a Quiet time reading `about` (its parts, "John 3", "My Utmost for His Highest"). */
export function pickSongs(n: number, about: string[], when: "before" | "after", model: string): Promise<Picked> {
  const key = JSON.stringify([n, about, when, new Date().toDateString()]);
  let p = chosen.get(key);
  if (!p) {
    p = choose(n, about, when, model);
    chosen.set(key, p);
    // Only a real choice is kept; a random one (or a failure) is tried again next time.
    p.then((x) => { if (x.note) chosen.delete(key); }, () => chosen.delete(key));
  }
  return p;
}

async function choose(n: number, about: string[], when: "before" | "after", model: string): Promise<Picked> {
  const all = await worshipSongs();
  if (!all.length) throw new Error("No worship songs in your Music library (Christian, gospel or worship genres).");
  const take = (xs: MusicTrack[]) => xs.slice(0, n).map(({ id, name, artist }) => ({ id, name, artist }));
  const random = (note: string): Picked => ({ songs: take([...all].sort(() => Math.random() - 0.5)), note });
  const models = assistantModels();
  if (!models.length) return random("Chosen at random: no AI assistant is set up.");
  const list = all.map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`).join("\n");
  const prompt = `Choose ${n} worship song${n === 1 ? "" : "s"} for someone's quiet time with God, to play ${when === "before" ? "before their reading, preparing their heart for it" : "after their reading, as a response to it"}.
Today they are reading: ${about.join("; ")}.
Choose songs whose words and themes fit what these passages are about, and that suit worship (not upbeat rock or songs about something else). Choose only from the numbered list below, which is their own music library.
Reply with only the numbers of your choices, in the order to play them, as a JSON array such as [12, 4, 88], and nothing else.

${list}`;
  try {
    const answer = await askOnce(prompt, pickModel(model, models));
    const nums = JSON.parse(answer.match(/\[[\d,\s]*\]/)?.[0] ?? "[]") as number[];
    const chosen = [...new Set(nums)].map((k) => all[k - 1]).filter(Boolean);
    if (!chosen.length) return random("Chosen at random: the assistant's answer couldn't be read.");
    return { songs: take(chosen) };
  } catch (e) {
    return random(`Chosen at random: ${e instanceof Error ? e.message : e}`);
  }
}
