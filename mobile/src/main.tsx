// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { createRoot } from "react-dom/client";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource/eb-garamond/greek-400.css";
import "./styles.css";
import { App } from "./App";
import { applyPrefs } from "./Settings";
import "@fontsource-variable/literata";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/inter";
import { invoke } from "@tauri-apps/api/core";

// Errors go to the app's log (lib.rs's log, which prints only in debug builds): the Simulator has
// no web inspector here.
{
  const send = (msg: string) => invoke("log", { msg }).catch(() => {});
  window.addEventListener("error", (e) => send(`${e.message} at ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => send(`unhandled: ${String(e.reason)}`));
  const err = console.error.bind(console);
  console.error = (...a: unknown[]) => {
    send(a.map(String).join(" "));
    err(...a);
  };
}

applyPrefs();

// Android's web view reports env(safe-area-inset-*) as 0 though the app draws under the status and gesture
// bars, so the plugin hands over their real heights (TesInsets) and these win (pager-system's lesson).
function applyAndroidInsets() {
  const i = (window as unknown as { TesInsets?: { top(): number; bottom(): number } }).TesInsets;
  if (!i) return;
  document.documentElement.style.setProperty("--top", `${i.top()}px`);
  document.documentElement.style.setProperty("--bottom", `${i.bottom()}px`);
}
applyAndroidInsets();

// A light tap in the hand for everything that can be tapped: buttons, links, tabs, chips, a verse, a word.
const TAPPABLE = 'button:not(:disabled), a, [role="tab"], [role="button"], input[type="checkbox"], .w, .v, .pv, .chip, .row';
document.addEventListener(
  "click",
  (e) => {
    if ((e.target as Element | null)?.closest?.(TAPPABLE)) invoke("plugin:tes-native|tap").catch(() => {});
  },
  { capture: true, passive: true },
);
window.addEventListener("tes-insets", applyAndroidInsets);
createRoot(document.getElementById("root")!).render(<App />);
