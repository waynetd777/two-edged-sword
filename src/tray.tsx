// The menu-bar menu: keeps its labels (today's reading, where reading left off, the reminder) in
// step with the app, and carries out what is chosen from it. The reminder itself is timed on the
// Rust side, which keeps running while the window is closed.

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import { book } from "./bible";
import { current, firstUndone, todayFor, ymd, today as startOfToday } from "./plans";
import { useStartQuietTime } from "./QuietTime";
import { useApp } from "./state";

type TrayAction = "quiet" | "continue" | "search" | "journal" | "reminder";

export function useTray() {
  const app = useApp();
  const startQuiet = useStartQuietTime();
  // The date, so today's reading moves on at midnight without anything else changing.
  const [day, setDay] = useState(() => ymd(startOfToday()));
  useEffect(() => {
    const t = window.setInterval(() => setDay(ymd(startOfToday())), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const plan = current(app.plans);
  const t = plan && !(plan.kind === "sequence" && firstUndone(plan) < 0) ? todayFor(plan) : null;
  const done = !!plan && (plan.kind === "ppo" ? plan.doneDates : plan.readDates ?? []).includes(day);
  const reading = app.doc ? app.doc.title : `${book(app.loc.book).name} ${app.loc.chapter}`;
  const { reminder, reminderTime } = app.settings;

  // Nothing is sent until the saved settings and plans are in, so the reminder can't fire on the defaults.
  const ready = app.plansReady;
  useEffect(() => {
    if (ready) api.setTray({ today: t?.label ?? null, done, reading, reminder, reminderTime }).catch((e) => console.error("tray", e));
  }, [ready, t?.label, done, reading, reminder, reminderTime]);

  // The listener is set up once; what it does is read from here, so it always sees the current state.
  const act = useRef<(a: TrayAction) => void>(() => {});
  act.current = (a) => {
    if (a === "quiet") { if (plan && t && !done && t.parts.length) startQuiet(plan, t.parts, false); else app.go("plans"); }
    else if (a === "continue") app.go("read");
    else if (a === "search") app.go("search");
    else if (a === "journal") app.startEntry({});
    else if (a === "reminder") app.set({ reminder: !reminder });
  };
  useEffect(() => {
    const un = listen<TrayAction>("tray", (e) => act.current(e.payload));
    return () => { un.then((f) => f()); };
  }, []);
}
