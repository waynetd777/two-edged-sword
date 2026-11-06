// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { api, libraryIs, Module, save, saved, scene } from "./api";
import { Icon } from "./icons";
import { Read } from "./Read";
import { Jump, Search } from "./Search";
import { WordStudy } from "./WordStudy";
import { Library } from "./Library";
import { More } from "./More";
import { DictionarySheet } from "./Dictionary";
import { syncReminders } from "./Reminder";
import { plansStore } from "./plansStore";
import { history, Tab } from "./history";


const TABS: { id: Tab; label: string }[] = [
  { id: "read", label: "Read" },
  { id: "search", label: "Search" },
  { id: "words", label: "Words" },
  { id: "library", label: "Library" },
  { id: "more", label: "More" },
];

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
  const [dict, setDict] = useState<{ start?: string } | null>(null);
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
  /** What was just brought in, shown for a few seconds above the tabs. */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number>(0);
  const tell = (text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  };
  const toldFailed = useRef(new Set<string>()).current;
  /** Modules AirDropped, opened from Files, dragged in with Finder or (Android) opened in the app: taken
   *  into the library (lib.rs import_waiting). */
  const takeIn = () =>
    invoke<{ dir?: string }>("plugin:tes-native|inbox_dir")
      .catch(() => ({}) as { dir?: string })
      .then((r) => api.importWaiting(r.dir))
      .then(({ added, failed: bad }) => {
        let failed = bad;
        if (added.length) loadModules();
        const parts = [];
        if (added.length) parts.push(`Added ${added.length > 2 ? `${added.length} modules` : added.join(" and ")} to the Library`);
        // A bad file left in Documents is found every time: told once.
        failed = failed.filter((f) => !toldFailed.has(f));
        failed.forEach((f) => toldFailed.add(f));
        if (failed.length) parts.push(`${failed.join(", ")} couldn't be read as ${failed.length > 1 ? "modules" : "a module"}`);
        if (parts.length) tell(parts.join(". ") + ".");
      })
      .catch(() => {});

  useEffect(() => {
    loadModules();
    takeIn();
    window.addEventListener("tes-inbox", takeIn);
    const unInbox = listen("tes-inbox", takeIn);
    const shown = () => document.visibilityState === "visible" && takeIn();
    document.addEventListener("visibilitychange", shown);
    // Android: the bundled modules are copied out of the APK on the first start (and after an update); the
    // library is read again once they are.
    const bundled = () =>
      invoke<{ dir?: string }>("plugin:tes-native|bundled_dir")
        .then((r) => {
          if (r.dir) return invoke("set_bundled", { dir: r.dir }).then(loadModules);
        })
        .catch(() => {});
    if ((window as unknown as { TesInsets?: unknown }).TesInsets) bundled();
    window.addEventListener("tes-bundled", bundled);
    // The week's reminders, from today: again whenever a day is marked read or the plan changes.
    syncReminders().catch(() => {});
    const unPlans = plansStore.subscribe(() => syncReminders().catch(() => {}));
    scene.then((sc) => {
      if (sc.includes("search")) setTab("search");
      if (sc.includes("library")) setTab("library");
      if (sc.includes("more")) setTab("more");
      const w = sc.find((x) => x.startsWith("study="));
      if (w) {
        setWord(w.slice(6));
        setTab("words");
      }
    });
    // A step back or forward can land on another tab.
    const off = history.onRestore((p) => {
      setTab(p.tab);
      if (p.word) setWord(p.word);
    });
    return () => {
      off();
      unPlans();
      window.removeEventListener("tes-inbox", takeIn);
      unInbox.then((u) => u());
      document.removeEventListener("visibilitychange", shown);
    };
  }, []);

  // Finder can drop a module in while the app is open: looked for again whenever the Library is opened.
  useEffect(() => {
    if (tab === "library") takeIn();
  }, [tab]);

  return (
    <div className="app">
      {/* Every tab stays mounted, so each keeps its place while another is shown. */}
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
        <Search
          modules={modules}
          active={tab === "search"}
          onJump={open}
        />
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
      <div className="screen" hidden={tab !== "more"}>
        <More
          modules={modules}
          onJump={open}
          onLibrary={() => {
            history.push({ tab: "library" });
            setTab("library");
          }}
        />
      </div>
      {dict && (
        <DictionarySheet
          modules={modules}
          start={dict.start}
          onGo={(r) => {
            setDict(null);
            open({ ref: r });
          }}
          onClose={() => setDict(null)}
        />
      )}
      {notice && (
        <div className="notice" role="status" onClick={() => { setNotice(null); setTab("library"); }}>
          {notice}
        </div>
      )}
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "on" : ""}`}
            onClick={() => {
              history.push({ tab: t.id, word: t.id === "words" ? word : "" });
              setTab(t.id);
            }}
          >
            {t.id === "words" ? <span className="alpha">α</span> : <Icon name={t.id === "read" ? "book" : t.id} />}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
