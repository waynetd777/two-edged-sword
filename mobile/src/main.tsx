// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { createRoot } from "react-dom/client";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource/eb-garamond/greek-400.css";
import "./styles.css";
import { App } from "./App";
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

createRoot(document.getElementById("root")!).render(<App />);
