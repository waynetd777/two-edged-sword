// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useState } from "react";
import { api, Module, save, saved, scene } from "./api";
import { Icon } from "./icons";
import { Read } from "./Read";
import { Jump, Search } from "./Search";
import { WordStudy } from "./WordStudy";
import { Library } from "./Library";
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
      })
      .catch(() => {});
  useEffect(() => {
    loadModules();
    scene.then((sc) => {
      if (sc.includes("search")) setTab("search");
      if (sc.includes("library")) setTab("library");
      const w = sc.find((x) => x.startsWith("study="));
      if (w) {
        setWord(w.slice(6));
        setTab("words");
      }
    });
    // A step back or forward can land on another tab.
    return history.onRestore((p) => {
      setTab(p.tab);
      if (p.word) setWord(p.word);
    });
  }, []);

  return (
    <div className="app">
      {/* Every tab stays mounted, so each keeps its place while another is shown. */}
      <div className="screen" hidden={tab !== "read"}>
        <Read modules={modules} jump={jump} onWordStudy={study} />
      </div>
      <div className="screen" hidden={tab !== "search"}>
        <Search
          modules={modules}
          active={tab === "search"}
          onJump={open}
        />
      </div>
      <div className="screen" hidden={tab !== "words"}>
        <WordStudy modules={modules} target={word} onTarget={study} onJump={open} />
      </div>
      <div className="screen" hidden={tab !== "library"}>
        <Library modules={modules} onChanged={loadModules} />
      </div>
      {tab === "more" && (
        <div className="soon">
          <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
          <p>Coming next.</p>
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
