// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useState } from "react";
import { api, Module, save, saved, scene } from "./api";
import { Icon } from "./icons";
import { Read } from "./Read";
import { Jump, Search } from "./Search";

type Tab = "read" | "search" | "words" | "library" | "more";

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
  // The module list from last time, so Read draws before the library is asked.
  const [modules, setModules] = useState<Module[]>(() => saved("modules", []));

  useEffect(() => {
    api
      .modules()
      .then((m) => {
        setModules(m);
        save("modules", m);
      })
      .catch(() => {});
    scene.then((sc) => sc.includes("search") && setTab("search"));
  }, []);

  return (
    <div className="app">
      {/* Every tab stays mounted, so each keeps its place while another is shown. */}
      <div className="screen" hidden={tab !== "read"}>
        <Read modules={modules} jump={jump} />
      </div>
      <div className="screen" hidden={tab !== "search"}>
        <Search
          modules={modules}
          active={tab === "search"}
          onJump={(j) => {
            setJump({ ...j, n: (jump?.n ?? 0) + 1 });
            setTab("read");
          }}
        />
      </div>
      {tab !== "read" && tab !== "search" && (
        <div className="soon">
          <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
          <p>Coming next.</p>
        </div>
      )}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
            {t.id === "words" ? <span className="alpha">α</span> : <Icon name={t.id === "read" ? "book" : t.id} />}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
