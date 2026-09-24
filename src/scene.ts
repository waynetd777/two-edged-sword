// Screenshot mode. tools/screenshots.py launches the app with a scene in TES_SCENE (scenes are in
// tools/screenshots/scenes.json); the app sets it up and saves nothing, so the user's settings,
// chats and place are untouched. Outside screenshot mode none of this runs.

import { api, setReadOnly } from "./api";
import { setSceneChat } from "./Ask";
import { Chat, Loc, Pending, Screen, Settings, useApp } from "./state";
import type { PlayerState } from "./speech";

export interface Scene {
  name: string;
  settings?: Partial<Settings>;
  screen?: Screen;
  loc?: Loc;
  /** A Strong's number for Word Study. */
  word?: string;
  /** Text for Search. */
  search?: string;
  /** A chat to show in the Ask panel, instead of asking a model. */
  chat?: Chat;
  /** The player, shown at this place without speaking. */
  player?: Partial<PlayerState>;
  /** Scroll the study pane back to the top once the page settles (an Ask chat opens scrolled to its end). */
  scrollTop?: boolean;
  /** Scroll this CSS selector into view once the page settles (a row low on a long screen). */
  scrollTo?: string;
  /** Asked for after the rest has settled, as a click elsewhere would (a dictionary article, a question). */
  pending?: Pending;
  /** A reference book or devotional to open, at a chapter (and, with para, a paragraph). */
  doc?: { module: string; title: string; kind?: "reference" | "devotional"; para?: number };
  /** Click this paragraph of the open book once it has loaded, selecting it. */
  selectPara?: number;
  /** A journal entry to open, by id. */
  journal?: string;
  /** A CSS selector clicked after that (a toolbar button, say), to show what it does. */
  click?: string;
}

let started = false;

/** Sets up the scene once the library has loaded; no-op without one. */
export function runScene(app: ReturnType<typeof useApp>, still: (s: Partial<PlayerState>) => void) {
  if (started) return;
  started = true;
  api.scene().then((json) => {
    if (!json) return;
    const sc: Scene = JSON.parse(json);
    setReadOnly(true);
    // Give the stored settings and place a moment to load, so the scene is applied on top of them.
    window.setTimeout(() => {
      if (sc.chat) { const chat = sc.chat; app.setChats(() => [chat]); setSceneChat(chat.id); }
      if (sc.settings) app.set(sc.settings);
      if (sc.loc) app.open(sc.loc, sc.screen ?? "read");
      else if (sc.screen) app.go(sc.screen);
      if (sc.doc) app.openDoc(sc.doc.module, sc.doc.title, sc.doc.kind ?? "reference", sc.doc.para);
      if (sc.click) { const q = sc.click; window.setTimeout(() => (document.querySelector(q) as HTMLElement | null)?.click(), 2800); }
      if (sc.selectPara) { const n = sc.selectPara; window.setTimeout(() => (document.querySelector(`[data-seg="${n}"]`) as HTMLElement | null)?.click(), 2000); }
      if (sc.journal) { const id = sc.journal; window.setTimeout(() => app.startEntry({ openId: id }), 1200); }
      if (sc.word) app.studyWord(sc.word);
      if (sc.search) app.searchText(sc.search);
      if (sc.player) still(sc.player);
      if (sc.pending) { const x = sc.pending; window.setTimeout(() => app.setPending(x), 1500); }
      if (sc.scrollTo) { const q = sc.scrollTo; window.setTimeout(() => document.querySelector(q)?.scrollIntoView({ block: "center" }), 1500); }
      if (sc.scrollTop) window.setTimeout(() => document.querySelectorAll(".study .scroll").forEach((el) => { el.scrollTop = 0; }), 1500);
    }, 400);
  }).catch(() => {});
}
