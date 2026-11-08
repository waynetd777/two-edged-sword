// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { discover, pair, startSync } from "./phoneSync";
import { useEffect, useRef, useState } from "react";
import { api, libraryIs, Module, save, saved, scene } from "./api";
import { Icon } from "./icons";
import { Read } from "./Read";
import { Jump, Search } from "./Search";
import { WordStudy } from "./WordStudy";
import { Library } from "./Library";
import { More, PlansTab } from "./More";
import { JournalHost, newEntry, openEntry } from "./JournalEdit";
import { journal } from "./journal";
import { DictionarySheet } from "./Dictionary";
import { syncReminders } from "./Reminder";
import { plansStore } from "./plansStore";
import { history, Tab } from "./history";

const TABS: { id: Exclude<Tab, "words">; label: string }[] = [
  { id: "read", label: "Read" },
  { id: "plans", label: "Plans" },
  { id: "search", label: "Search" },
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
      .then(async ({ added, failed: bad }) => {
        if (added.length) await loadModules();
        const parts = [];
        if (added.length) parts.push(`Added ${added.length > 2 ? `${added.length} modules` : added.join(" and ")}`);
        // A bad file left in Documents is found every time: told once.
        const failed = bad.filter((f) => !toldFailed.has(f));
        failed.forEach((f) => toldFailed.add(f));
        if (failed.length) parts.push(`${failed.join(", ")} couldn't be read as ${failed.length > 1 ? "modules" : "a module"}`);
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
      invoke<{ dir?: string }>("plugin:tes-native|bundled_dir")
        .then((r) => {
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
      if (sc.includes("more")) setTab("more");
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
    // Once, at start: what it sets up is taken down when the app closes.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Finder can drop a module in while the app is open: looked for again whenever the Library is opened.
  useEffect(() => {
    if (tab === "library") takeIn();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the tab changes

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
        <Search modules={modules} active={tab === "search"} onJump={open} />
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
      <div className="screen" hidden={tab !== "more"}>
        <More
          modules={modules}
          onJump={open}
          onWords={() => {
            history.push({ tab: "words", word });
            setTab("words");
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
      <JournalHost onGo={(r) => open({ ref: r })} />
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
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            // Word Study is reached from More, so More stays lit there.
            className={`tab ${tab === t.id || (t.id === "more" && tab === "words") ? "on" : ""}`}
            onClick={() => {
              history.push({ tab: t.id });
              setTab(t.id);
            }}
          >
            <Icon name={t.id === "read" ? "book" : t.id === "plans" ? "calendar" : t.id} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
