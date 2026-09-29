// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Screenshot mode. tools/screenshots.py launches the app with a scene in TES_SCENE (scenes are in
// tools/screenshots/scenes.json); the app sets it up and saves nothing, so the user's settings,
// chats and place are untouched. Outside screenshot mode none of this runs.

import { api, JournalEntry, setReadOnly, setSceneJournal } from "./api";
import { setSceneChat } from "./Ask";
import { Chat, Loc, Pending, Screen, Session, Settings, useApp } from "./state";
import type { PlayerState } from "./speech";
import { setSceneVariances, VarianceFile } from "./variances";

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
  /** A Quiet time session to show (its worship songs already chosen, say). */
  session?: Omit<Session, "started">;
  /** Journal entries shown instead of the user's (from entriesFile). */
  entries?: JournalEntry[];
  /** A journal entry to open, by id. */
  journal?: string;
  /** A CSS selector clicked after that (a toolbar button, say), to show what it does. */
  click?: string | string[];
  /** Before `click`: a click on the first place this text is shown (a misspelled word, say). */
  clickText?: string;
  /** Then text typed into a box, as [CSS selector, text] (find's box, say). */
  type?: [string, string];
  /** A translation's differences from the KJV, shown instead of the user's (from variancesFile). */
  variances?: VarianceFile;
}

let started = false;

/** Sets up the scene once the library has loaded; no-op without one. */
export function runScene(app: ReturnType<typeof useApp>, still: (s: Partial<PlayerState>) => void) {
  if (started) return;
  started = true;
  api
    .scene()
    .then((json) => {
      if (!json) return;
      const sc: Scene = JSON.parse(json);
      setReadOnly(true);
      if (sc.entries) setSceneJournal(sc.entries);
      if (sc.variances) setSceneVariances(sc.variances);
      // Give the stored settings and place a moment to load, so the scene is applied on top of them.
      window.setTimeout(() => {
        if (sc.chat) {
          const chat = sc.chat;
          app.setChats(() => [chat]);
          setSceneChat(chat.id);
        }
        // The KJV unless the scene says otherwise: never the user's own choice, which may be licensed.
        // Nor the user's highlight names, plans' Bibles or Recent list, which are theirs.
        app.set({ bible: "kjv", hlNames: {}, ...sc.settings });
        app.setPlans((ps) => ps.map((p) => ({ ...p, bible: "kjv" })));
        const at = new Date().toISOString();
        app.setRecent(
          [
            [43, 3],
            [19, 23],
            [45, 8],
            [23, 53],
            [1, 1],
          ].map(([book, chapter]) => ({ book, chapter, at })),
        );
        if (sc.loc) app.open(sc.loc, sc.screen ?? "read");
        else if (sc.screen) app.go(sc.screen);
        if (sc.doc) app.openDoc(sc.doc.module, sc.doc.title, sc.doc.kind ?? "reference", sc.doc.para);
        // Then text typed into a box. React tracks an input's value itself, so it's set through the
        // native setter and announced.
        const type = () => {
          if (!sc.type) return;
          const [q, text] = sc.type;
          const el = document.querySelector(q) as HTMLInputElement | null;
          if (!el) return;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, text);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        // A real click, with coordinates, at the middle of the text: what caretRangeFromPoint needs.
        const clickText = (t: string) => {
          const w = document.createTreeWalker(document.querySelector(".main") ?? document.body, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
            const i = n.data.indexOf(t);
            if (i < 0) continue;
            const r = document.createRange();
            r.setStart(n, i);
            r.setEnd(n, i + t.length);
            const b = r.getBoundingClientRect(),
              x = b.left + b.width / 2,
              y = b.top + b.height / 2;
            document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
            return;
          }
        };
        // After a journal entry opens (which replaces its editor), and retried until it's there.
        // Several selectors are clicked in turn, each once it's there.
        const click = (qs = sc.click ? ([] as string[]).concat(sc.click) : []) => {
          if (!qs.length) {
            type();
            return;
          }
          const [q, ...rest] = qs;
          const at = Date.now();
          const go = () => {
            const el = document.querySelector(q) as HTMLElement | null;
            if (el) {
              el.click();
              window.setTimeout(() => click(rest), 400);
            } else if (Date.now() - at < 3000) window.setTimeout(go, 200);
          };
          go();
        };
        if (sc.click || sc.type || sc.clickText)
          window.setTimeout(
            () => {
              if (sc.clickText) {
                clickText(sc.clickText);
                window.setTimeout(click, 700);
              } else click();
            },
            sc.journal && sc.entries ? 4300 : 2800,
          );
        if (sc.selectPara) {
          const n = sc.selectPara;
          window.setTimeout(() => (document.querySelector(`[data-seg="${n}"]`) as HTMLElement | null)?.click(), 2000);
        }
        if (sc.session) {
          const x = sc.session;
          window.setTimeout(() => app.setSession({ ...x, started: Date.now() }), 1200);
        }
        // Scene entries arrive with the journal's next check for changes (every 3 seconds).
        if (sc.journal) {
          const id = sc.journal;
          window.setTimeout(() => app.startEntry({ openId: id }), sc.entries ? 3800 : 1200);
        }
        if (sc.word) app.studyWord(sc.word);
        if (sc.search) app.searchText(sc.search);
        if (sc.player) still(sc.player);
        if (sc.pending) {
          const x = sc.pending;
          window.setTimeout(() => app.setPending(x), 1500);
        }
        if (sc.scrollTo) {
          const q = sc.scrollTo;
          window.setTimeout(() => document.querySelector(q)?.scrollIntoView({ block: "center" }), 1500);
        }
        if (sc.scrollTop)
          window.setTimeout(
            () =>
              document.querySelectorAll(".study .scroll").forEach((el) => {
                el.scrollTop = 0;
              }),
            1500,
          );
      }, 400);
    })
    .catch(() => {});
}
