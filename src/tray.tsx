// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The menu-bar window's data: keeps what it shows (today's reading, the plan and streak, where
// reading left off, the reminder) in step with the app, and carries out what is chosen in it
// (src/TrayWindow.tsx). The reminder itself is timed on the
// Rust side, which keeps running while the window is closed.

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import { book } from "./bible";
import { behind, current, parseYmd, readOn, streak, todayIfOngoing } from "./plans";
import { useReadingDay } from "./readingDay";
import { useStartQuietTime } from "./QuietTime";
import { useApp } from "./state";

type TrayAction = "quiet" | "quiet-audio" | "continue" | "search" | "journal" | "plans" | "settings" | "reminder";

export function useTray() {
  const app = useApp();
  const startQuiet = useStartQuietTime();
  // The date, so today's reading moves on at midnight without anything else changing.
  const day = useReadingDay();

  const plan = current(app.plans);
  const t = todayIfOngoing(plan);
  const done = !!plan && readOn(plan, parseYmd(day));
  const reading = app.doc ? app.doc.title : `${book(app.loc.book).name} ${app.loc.chapter}`;
  const { reminder, reminderTime } = app.settings;
  const st = plan ? streak(plan) : null;
  const [run, best, week] = [st?.current ?? 0, st?.best ?? 0, st?.week ?? 0];
  const late = plan?.kind === "sequence" ? behind(plan) : 0;

  // Nothing is sent until the saved settings and plans are in, so the reminder can't fire on the defaults.
  const ready = app.plansReady;
  useEffect(() => {
    if (ready)
      api
        .setTray({
          today: t?.label ?? null,
          done,
          reading,
          reminder,
          reminderTime,
          plan: plan?.name ?? null,
          progress: t?.progress ?? null,
          pct: t?.pct ?? 0,
          streak: run,
          best,
          week,
          behind: late,
        })
        .catch((e) => console.error("tray", e));
  }, [ready, t?.label, t?.progress, t?.pct, done, reading, reminder, reminderTime, plan?.name, run, best, week, late]);

  // The listener is set up once; what it does is read from here, so it always sees the current state.
  const act = useRef<(a: TrayAction) => void>(() => {});
  act.current = (a) => {
    if (a === "quiet" || a === "quiet-audio") {
      if (plan && t && !done && t.parts.length) startQuiet(plan, t.parts, a === "quiet-audio");
      else app.go("plans");
    } else if (a === "continue") app.go("read");
    else if (a === "search") app.go("search");
    else if (a === "plans") app.go("plans");
    else if (a === "settings") app.go("settings");
    else if (a === "journal") app.startEntry({});
    else if (a === "reminder") app.set({ reminder: !reminder });
  };
  useEffect(() => {
    const un = listen<TrayAction>("tray", (e) => act.current(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, []);
}
