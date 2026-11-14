// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { discover, pair, startSync } from "./phoneSync";
import { useEffect, useRef, useState } from "react";
import { api, libraryIs, Module, save, saved, scene } from "./api";
import { Read } from "./Read";
import { Jump, Search } from "./Search";
import { WordStudy } from "./WordStudy";
import { Library } from "./Library";
import { HelpScreen, JournalScreen, PlansTab, SettingsScreen } from "./More";
import { MenuDrawer } from "./Menu";
import { KjvHistory } from "./KjvHistory";
import { JournalHost, newEntry, openEntry } from "./JournalEdit";
import { journal } from "./journal";
import { DictionarySheet } from "./Dictionary";
import { TextWordHost } from "./WordSheet";
import { syncReminders } from "./Reminder";
import { plansStore } from "./plansStore";
import { history, Tab } from "./history";
import { MissingVoice, onMissingVoice } from "./player";

/** The voice each language is read in, and what it reads, for the message when the phone has none. */
const VOICE: Record<string, { voice: string; what: string }> = {
  el: { voice: "Greek", what: "Greek" },
  he: { voice: "Hebrew", what: "Hebrew and Syriac" },
  la: { voice: "Italian", what: "Latin" },
};
const ANDROID = /Android/.test(navigator.userAgent);

export function App() {
  const [tab, setTab] = useState<Tab>("read");
  /** Something to open in Read, from another tab; n makes the same place twice count twice. */
  const [jump, setJump] = useState<(Jump & { n: number }) | null>(null);
  const [word, setWord] = useState<string>(() => saved("wordStudy", "G26"));
  useEffect(() => save("wordStudy", word), [word]);
  /** Opens Word Study on a number or word, as a step back can return from. */
  const study = (w: string) => {
    history.push({ tab: "words", word: w });
    setWord(w);
    setTab("words");
  };
  /** The dictionaries, over everything: a word to look up, or a dictionary to open at. */
  const [dict, setDict] = useState<{ start?: string; n?: number } | null>(null);
  /** A word to search for, from a word tapped in a commentary, a dictionary or a book. */
  const [query, setQuery] = useState<{ q: string; n: number } | null>(null);
  const open = (j: Jump) => {
    setJump({ ...j, n: (jump?.n ?? 0) + 1 });
    setTab("read");
  };
  // The module list from last time, so Read draws before the library is asked.
  const [modules, setModules] = useState<Module[]>(() => saved("modules", []));

  const loadModules = () =>
    api
      .modules()
      .then((m) => {
        setModules(m);
        save("modules", m);
        libraryIs(m.map((x) => x.file));
      })
      .catch(() => {});
  /** Modules being taken in, in the middle of the screen over a dimmed page: "Adding…" with a spinner
   *  while it runs, then what came (a tick) for a few seconds, or until tapped. */
  const [msg, setMsg] = useState<{ text: string; busy: boolean; ok?: boolean } | null>(null);
  const msgTimer = useRef<number>(0);
  const setAdding = (text: string) => {
    clearTimeout(msgTimer.current);
    setMsg({ text, busy: true });
  };
  const tell = (text: string, ok: boolean) => {
    setMsg({ text, busy: false, ok });
    clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 3000);
  };
  const toldFailed = useRef(new Set<string>()).current;
  /** A language Listen read in English for want of a voice: said once (player.ts checkVoices). */
  const [noVoice, setNoVoice] = useState<MissingVoice | null>(null);
  useEffect(() => onMissingVoice(setNoVoice), []);
  /** Modules AirDropped, opened from Files, dragged in with Finder or (Android) opened in the app: taken
   *  into the library (lib.rs import_waiting). One at a time: the Library opening, the app coming forward
   *  and the picker closing can all ask at once, and would race for the same files; one asked for while
   *  another runs follows it. The picker says how many it brought, so "Adding…" shows until they're in. */
  const taking = useRef<"no" | "yes" | "again">("no");

  const takeIn = (e?: Event) => {
    const count = (e as CustomEvent<{ count?: number }> | undefined)?.detail?.count;
    if (count) setAdding(`Adding ${count > 1 ? `${count} modules` : "the module"}…`);
    if (taking.current !== "no") {
      taking.current = "again";
      return;
    }
    taking.current = "yes";
    invoke<{ dir?: string }>("plugin:tes-native|inbox_dir")
      .catch(() => ({}) as { dir?: string })
      // Anything waiting: "Adding…" while it's taken in, however it came.
      .then(async (r) => {
        const n = await api.countWaiting(r.dir).catch(() => 0);
        if (n) setAdding(`Adding ${n > 1 ? `${n} modules` : "the module"}…`);
        return api.importWaiting(r.dir);
      })
      .then(async ({ added, failed: bad, badName }) => {
        if (added.length) await loadModules();
        const parts = [];
        if (added.length) parts.push(`Added ${added.length > 2 ? `${added.length} modules` : added.join(" and ")}`);
        // A bad file left in Documents is found every time: told once.
        const failed = bad.filter((f) => !toldFailed.has(f));
        failed.forEach((f) => toldFailed.add(f));
        if (failed.length) parts.push(`${failed.join(", ")} couldn't be read as ${failed.length > 1 ? "modules" : "a module"}`);
        if (badName?.length)
          parts.push(
            `${badName.join(", ")} can't be added under ${badName.length > 1 ? "those names" : "that name"}: rename it with letters and numbers`,
          );
        if (parts.length) tell(parts.join(". ") + ".", added.length > 0);
      })
      .catch(() => {})
      .finally(() => {
        setMsg((m) => (m?.busy ? null : m));
        const again = taking.current === "again";
        taking.current = "no";
        if (again) takeIn();
      });
  };

  useEffect(() => {
    loadModules();
    takeIn();
    window.addEventListener("tes-inbox", takeIn);
    const unInbox = listen("tes-inbox", () => takeIn());
    // Coming forward: a module opened in the app (Share, AirDrop) is copied in a moment later, so looked
    // for again shortly after too.
    const shown = () => {
      if (document.visibilityState !== "visible") return;
      takeIn();
      setTimeout(() => takeIn(), 1500);
    };
    document.addEventListener("visibilitychange", shown);
    // Android: the bundled modules are copied out of the APK on the first start (and after an update); the
    // library is read again once they are.
    const bundled = () =>
      invoke<{ dir?: string; error?: string }>("plugin:tes-native|bundled_dir")
        .then((r) => {
          // Copying them out failed before the page was listening: Read says so (tes-bundled-error).
          if (r.error) window.dispatchEvent(new CustomEvent("tes-bundled-error", { detail: r.error }));
          if (r.dir) return invoke("set_bundled", { dir: r.dir }).then(loadModules);
        })
        .catch(() => {});
    if ((window as unknown as { TesInsets?: unknown }).TesInsets) bundled();
    window.addEventListener("tes-bundled", bundled);
    // The week's reminders, from today: again whenever a day is marked read or the plan changes.
    syncReminders().catch(() => {});
    // Sync with the computer, if paired (phoneSync.ts).
    startSync();
    const unPlans = plansStore.subscribe(() => syncReminders().catch(() => {}));
    scene.then((sc) => {
      if (sc.includes("search")) setTab("search");
      if (sc.includes("library")) setTab("library");
      // pair=<code>: pairs with the first computer found (a debug desktop build run with TES_PAIR_CODE).
      // findmac: only looks for computers and logs them (debug.log), without pairing.
      if (sc.includes("findmac")) discover().then((f) => invoke("log", { msg: `found ${JSON.stringify(f)}` }));
      // pairat=<host>:<port>:<code>: the same at a known address, as the Simulator doesn't find it over Bonjour.
      const pa = sc
        .find((x) => x.startsWith("pairat="))
        ?.slice(7)
        .split(":");
      if (pa)
        pair({ name: "Test Mac", host: pa[0], port: Number(pa[1]) }, pa[2], "Simulator").catch((e) => invoke("log", { msg: `pair: ${e}` }));
      const pc = sc.find((x) => x.startsWith("pair="));
      if (pc)
        discover().then(
          (f) => (
            invoke("log", { msg: `found ${JSON.stringify(f)}` }),
            f[0] && pair(f[0], pc.slice(5), "Simulator").catch((e) => invoke("log", { msg: `pair: ${e}` }))
          ),
        );
      // adding: the "Adding…" shown while picked modules are taken in.
      // sweeplater: looks for waiting modules again after 8s, as the app coming forward would.
      if (sc.includes("sweeplater")) setTimeout(() => window.dispatchEvent(new Event("tes-inbox")), 8000);
      if (sc.includes("adding")) setTimeout(() => setAdding("Adding 2 modules…"), 2500);
      // Debug: page=<journal|settings|help|history> opens that screen.
      const pg = sc.find((x) => x.startsWith("page="))?.slice(5);
      if (pg === "journal" || pg === "settings" || pg === "help" || pg === "history") setTab(pg);
      // entry=<id>: a journal entry open to read; newentry: a new one open to write.
      const en = sc.find((x) => x.startsWith("entry="));
      if (en) journal.load().then(() => openEntry(en.slice(6)));
      if (sc.includes("newentry")) newEntry({ book: 43, chapter: 3, verse: 16 });
      const w = sc.find((x) => x.startsWith("study="));
      if (w) {
        setWord(w.slice(6));
        setTab("words");
      }
    });
    // Highlights, bookmarks or a plan that couldn't be kept (the phone's storage for the app is full): said,
    // once a minute at most, rather than lost without a word.
    let saidFull = 0;
    const saveFailed = () => {
      if (Date.now() - saidFull < 60_000) return;
      saidFull = Date.now();
      tell("Your changes couldn't be saved: the app's storage is full.", false);
    };
    window.addEventListener("tes-save-failed", saveFailed);
    // A step back or forward can land on another tab.
    const off = history.onRestore((p) => {
      setTab(p.tab);
      if (p.word) setWord(p.word);
    });
    return () => {
      off();
      unPlans();
      window.removeEventListener("tes-inbox", takeIn);
      window.removeEventListener("tes-save-failed", saveFailed);
      unInbox.then((u) => u());
      document.removeEventListener("visibilitychange", shown);
    };
    // Once, at start: what it sets up is taken down when the app closes.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Finder can drop a module in while the app is open: looked for again whenever the Library is opened.
  useEffect(() => {
    if (tab === "library") takeIn();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the tab changes

  return (
    <div className="app">
      {/* Every screen stays mounted, so each keeps its place while another is shown. */}
      <div className="screen" hidden={tab !== "read"}>
        <Read
          modules={modules}
          jump={jump}
          onWordStudy={study}
          onModulesChanged={loadModules}
          onLibrary={() => {
            history.push({ tab: "library" });
            setTab("library");
          }}
        />
      </div>
      <div className="screen" hidden={tab !== "search"}>
        <Search modules={modules} active={tab === "search"} onJump={open} query={query} />
      </div>
      <div className="screen" hidden={tab !== "words"}>
        <WordStudy modules={modules} target={word} onTarget={study} onJump={open} onDictionary={(w) => setDict({ start: w })} />
      </div>
      <div className="screen" hidden={tab !== "library"}>
        <Library
          modules={modules}
          onChanged={loadModules}
          onRead={(book) => open({ book })}
          onDictionary={(m) => {
            save("dictionary", m);
            setDict({});
          }}
          onLexicon={() => {
            history.push({ tab: "words", word });
            setTab("words");
          }}
        />
      </div>
      <div className="screen" hidden={tab !== "plans"}>
        <PlansTab
          modules={modules}
          onJump={open}
          onLibrary={() => {
            history.push({ tab: "library" });
            setTab("library");
          }}
        />
      </div>
      <div className="screen" hidden={tab !== "journal"}>
        <JournalScreen />
      </div>
      <div className="screen" hidden={tab !== "history"}>
        <KjvHistory modules={modules} onRead={(bible) => open({ bible })} onCompare={(compare) => open({ compare })} />
      </div>
      <div className="screen" hidden={tab !== "settings"}>
        <SettingsScreen modules={modules} />
      </div>
      <div className="screen" hidden={tab !== "help"}>
        <HelpScreen />
      </div>
      {dict && (
        <DictionarySheet
          key={dict.n}
          modules={modules}
          start={dict.start}
          onGo={(r) => {
            setDict(null);
            open({ ref: r });
          }}
          onClose={() => setDict(null)}
        />
      )}
      <TextWordHost
        strongsBible={modules.find((m) => m.kind === "bible" && m.strongs && m.id.startsWith("kjv"))?.id ?? modules.find((m) => m.kind === "bible" && m.strongs)?.id}
        onWordStudy={study}
        onDictionary={(m, topic) => {
          save("dictionary", m);
          setDict({ start: topic, n: Date.now() });
        }}
        onSearch={(q) => {
          setDict(null);
          history.push({ tab: "search" });
          setTab("search");
          setQuery({ q, n: Date.now() });
        }}
      />
      <JournalHost onGo={(r) => open({ ref: r })} />
      {noVoice && (
        <div className="adding" role="alertdialog" aria-label="No voice for this language">
          <span className="tick bad" aria-hidden>
            !
          </span>
          <span>
            This {/iPad/.test(navigator.userAgent) ? "iPad" : "phone"} has no {VOICE[noVoice.lang]?.voice} voice, so{" "}
            {VOICE[noVoice.lang]?.what} is read in English.
          </span>
          <span className="m">
            {ANDROID
              ? `${noVoice.download ? "One can be downloaded" : "Add one"} in Settings › Text-to-speech output › Google › Install voice data.`
              : "Add one in Settings › Accessibility › Spoken Content › Voices."}
          </span>
          <div className="btns">
            {ANDROID && (
              <button
                className="primary"
                onClick={() => {
                  setNoVoice(null);
                  invoke("plugin:tes-native|speech_settings").catch(() => {});
                }}
              >
                Open settings
              </button>
            )}
            <button className={ANDROID ? "" : "primary"} onClick={() => setNoVoice(null)}>
              OK
            </button>
          </div>
        </div>
      )}
      {msg && (
        <div className="adding" role="status" onClick={() => !msg.busy && setMsg(null)}>
          {msg.busy ? (
            <span className="spin" aria-hidden />
          ) : (
            <span className={msg.ok ? "tick" : "tick bad"} aria-hidden>
              {msg.ok ? "✓" : "!"}
            </span>
          )}
          {msg.text}
        </div>
      )}
      <MenuDrawer
        tab={tab}
        onPick={(t) => {
          history.push({ tab: t });
          setTab(t);
        }}
      />
    </div>
  );
}
