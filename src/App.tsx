// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useRef, useState } from "react";
import { CompareScreen } from "./Compare";
import { JournalScreen } from "./Journal";
import { KjvHistoryScreen } from "./KjvHistory";
import { LibraryScreen } from "./Library";
import { PlansScreen } from "./PlansScreen";
import { SearchScreen } from "./Search";
import { SettingsScreen } from "./Settings";
import { WordStudyScreen } from "./WordStudy";
import { Palette } from "./Palette";
import { PlayerBar, ReadScreen } from "./Read";
import { DocReader } from "./DocReader";
import { HelpDrawer } from "./Help";
import { WebPage } from "./WebPage";
import { LyricsPage } from "./LyricsPage";
import { StrongsHover } from "./WordLookup";
import { QuietTime, useWorshipAhead } from "./QuietTime";
import { SCREEN_KEYS, Sidebar } from "./Shell";
import { PlayerProvider, usePlayer } from "./speech";
import { runScene } from "./scene";
import { AppProvider, useApp } from "./state";
import { useKeepAwake } from "./awake";
import { hideSplash } from "./splash";
import { useTray } from "./tray";
import { Tooltips, WordHoverBox } from "./ui";

function Screens() {
  const app = useApp();
  useTray();
  useWorshipAhead();
  // The screen stays awake through Quiet time, and while Read or Compare is in front.
  const [front, setFront] = useState(() => document.hasFocus());
  useEffect(() => {
    const on = () => setFront(true);
    const off = () => setFront(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  useKeepAwake("Quiet time", !!app.session);
  useKeepAwake("reading", front && (app.screen === "read" || app.screen === "compare"));
  const [focus, setFocus] = useState(false);
  const [palette, setPalette] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);

  const player = usePlayer();
  useEffect(() => {
    if (app.lib) hideSplash();
  }, [app.lib]);
  // Screenshot mode only (TES_SCENE); otherwise it finds no scene and does nothing.
  useEffect(() => {
    if (app.lib) runScene(app, player.still);
  }, [app.lib]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘1–⌘7 switch screens, ⌘K opens the palette, ⌘, Settings, ⌘. focus mode, ⌘[ ⌘] history,
  // ⌘+ ⌘− the reading text size (as its slider does). Listened for once, with the app as it is now.
  const appRef = useRef(app);
  appRef.current = app;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const app = appRef.current;
      if (!e.metaKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= SCREEN_KEYS.length) {
        app.go(SCREEN_KEYS[n - 1]);
        setFocus(false);
        e.preventDefault();
      } else if (e.key === "k") {
        setPalette(true);
        e.preventDefault();
      } else if (e.key === ",") {
        app.go("settings");
        e.preventDefault();
      } else if (e.key === ".") {
        if (app.screen !== "journal") app.go("read");
        setFocus((f) => !f);
        e.preventDefault();
      } else if (e.key === "[") {
        app.back();
        e.preventDefault();
      } else if (e.key === "]") {
        app.forward();
        e.preventDefault();
      } else if ((e.key === "=" || e.key === "+" || e.key === "-") && app.screen === "read" && app.doc?.url) {
        // An online devotional's page: its own size, kept for that site.
        const id = app.doc.module;
        const z = Math.round(((app.settings.webZoom[id] ?? 1) + (e.key === "-" ? -0.1 : 0.1)) * 10) / 10;
        if (z >= 0.5 && z <= 2.5) app.set({ webZoom: { ...app.settings.webZoom, [id]: z } });
        e.preventDefault();
      } else if (e.key === "=" || e.key === "+" || e.key === "-") {
        const size = app.settings.readSize + (e.key === "-" ? -1 : 1);
        if (size >= 14 && size <= 28) app.set({ readSize: size });
        e.preventDefault();
      } else if (e.key === "\\") {
        app.set({ studyPane: !app.settings.studyPane });
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (!app.lib) return null;
  if (!app.bibles.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }} className="drag">
        <div className="card" style={{ maxWidth: 520, padding: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 style={{ margin: 0, font: "500 28px var(--display)" }}>No Bibles found</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Two-edged Sword reads Bibles and books from these folders. Copy a module into the first, or download one in e-Sword X, then
            press Rescan.
          </p>
          {app.lib.dirs.map((d) => (
            <code key={d.source} style={{ fontSize: 12, color: "var(--muted)" }}>
              {d.path}
            </code>
          ))}
          <div>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                setRescanError(null);
                app.rescan().catch((e) => setRescanError(`Couldn't rescan: ${e}`));
              }}
            >
              Rescan
            </button>
          </div>
          {rescanError && <p style={{ margin: 0, color: "var(--muted)" }}>{rescanError}</p>}
        </div>
      </div>
    );
  }
  const screen = app.screen;
  const openPalette = () => setPalette(true);
  // Focus mode is Read's and the Journal's: the sidebar goes, and so do their side panes.
  const focused = focus && (screen === "read" || screen === "journal");
  return (
    <div className={`shell ${focused ? "nosidebar" : ""}`}>
      {!focused && <Sidebar />}
      {screen === "read" && app.doc?.url && <WebPage focus={focus} setFocus={setFocus} />}
      {screen === "read" && app.doc?.view === "lyrics" && <LyricsPage focus={focus} setFocus={setFocus} />}
      {screen === "read" && app.doc && !app.doc.url && !app.doc.view && (
        <DocReader focus={focus} setFocus={setFocus} openPalette={openPalette} />
      )}
      {screen === "read" && !app.doc && <ReadScreen focus={focus} setFocus={setFocus} openPalette={openPalette} />}
      {screen === "compare" && <CompareScreen openPalette={openPalette} />}
      {screen === "search" && <SearchScreen />}
      {screen === "word" && <WordStudyScreen />}
      {screen === "journal" && <JournalScreen openPalette={openPalette} focus={focus} setFocus={setFocus} />}
      {screen === "plans" && <PlansScreen openPalette={openPalette} />}
      {screen === "library" && <LibraryScreen />}
      {screen === "history" && <KjvHistoryScreen />}
      {screen === "settings" && <SettingsScreen />}
      {(screen !== "read" || app.doc) && <PlayerBar focus={focused} />}
      {palette && <Palette onClose={() => setPalette(false)} onAsk={() => app.setPending({ ask: "" })} />}
      {app.toastMsg && (
        <div className="toast" role="status">
          {app.toastMsg}
          {app.toastUndo && (
            <button type="button" className="toastundo" onClick={app.toastUndo}>
              Undo
            </button>
          )}
        </div>
      )}
      <HelpDrawer />
      <StrongsHover />
      <Tooltips />
      <WordHoverBox />
      <QuietTime focus={focus && screen === "read"} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <PlayerProvider>
        <Screens />
      </PlayerProvider>
    </AppProvider>
  );
}
