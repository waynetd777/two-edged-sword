import { useEffect, useState } from "react";
import { CompareScreen } from "./Compare";
import { JournalScreen } from "./Journal";
import { LibraryScreen } from "./Library";
import { PlansScreen } from "./PlansScreen";
import { SearchScreen } from "./Search";
import { SettingsScreen } from "./Settings";
import { WordStudyScreen } from "./WordStudy";
import { Palette } from "./Palette";
import { PlayerBar, ReadScreen } from "./Read";
import { DocReader } from "./DocReader";
import { StrongsHover } from "./WordLookup";
import { QuietTime } from "./QuietTime";
import { SCREEN_KEYS, Sidebar } from "./Shell";
import { PlayerProvider, usePlayer } from "./speech";
import { runScene } from "./scene";
import { AppProvider, useApp } from "./state";
import { hideSplash } from "./splash";
import { Tooltips, WordHoverBox } from "./ui";

function Screens() {
  const app = useApp();
  const [focus, setFocus] = useState(false);
  const [palette, setPalette] = useState(false);

  const player = usePlayer();
  useEffect(() => { if (app.lib) hideSplash(); }, [app.lib]);
  // Screenshot mode only (TES_SCENE); otherwise it finds no scene and does nothing.
  useEffect(() => { if (app.lib) runScene(app, player.still); }, [app.lib]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘1–⌘7 switch screens, ⌘K opens the palette, ⌘, Settings, ⌘. focus mode, ⌘[ ⌘] history.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= SCREEN_KEYS.length) { app.go(SCREEN_KEYS[n - 1]); setFocus(false); e.preventDefault(); }
      else if (e.key === "k") { setPalette(true); e.preventDefault(); }
      else if (e.key === ",") { app.go("settings"); e.preventDefault(); }
      else if (e.key === ".") { app.go("read"); setFocus((f) => !f); e.preventDefault(); }
      else if (e.key === "[") { app.back(); e.preventDefault(); }
      else if (e.key === "]") { app.forward(); e.preventDefault(); }
      else if (e.key === "\\") { app.set({ studyPane: !app.settings.studyPane }); e.preventDefault(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [app]);

  if (!app.lib) return null;
  if (!app.lib.found || !app.bibles.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }} className="drag">
        <div className="card" style={{ maxWidth: 520, padding: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 style={{ margin: 0, font: "500 28px var(--display)" }}>No e-Sword library found</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>Two-edged Sword reads the Bibles and books you have in e-Sword X. Install e-Sword X and download at least one Bible, then press Rescan.</p>
          <code style={{ fontSize: 12, color: "var(--muted)" }}>{app.lib.dir}</code>
          <div><button className="btn primary" type="button" onClick={app.rescan}>Rescan</button></div>
        </div>
      </div>
    );
  }
  const screen = app.screen;
  const openPalette = () => setPalette(true);
  return (
    <div className={`shell ${focus && screen === "read" ? "nosidebar" : ""}`}>
      {!(focus && screen === "read") && <Sidebar />}
      {screen === "read" && app.doc && <DocReader focus={focus} setFocus={setFocus} />}
      {screen === "read" && !app.doc && <ReadScreen focus={focus} setFocus={setFocus} openPalette={openPalette} />}
      {screen === "compare" && <CompareScreen openPalette={openPalette} />}
      {screen === "search" && <SearchScreen />}
      {screen === "word" && <WordStudyScreen />}
      {screen === "journal" && <JournalScreen />}
      {screen === "plans" && <PlansScreen />}
      {screen === "library" && <LibraryScreen />}
      {screen === "settings" && <SettingsScreen />}
      {(screen !== "read" || app.doc) && <PlayerBar focus={focus && screen === "read"} />}
      {palette && <Palette onClose={() => setPalette(false)} onAsk={() => app.setPending({ ask: "" })} />}
      {app.toastMsg && <div className="toast" role="status">{app.toastMsg}</div>}
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
