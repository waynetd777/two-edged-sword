// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { save, saved } from "./api";
import { addDays, current, psalmLabel, readOn, today, todayFor } from "./plansShared";
import { plansStore } from "./plansStore";

interface Setting {
  on: boolean;
  /** "07:00" */
  time: string;
}

const get = () => saved<Setting>("reminder", { on: false, time: "07:00" });

/** Schedules the next week's reminders, as the desktop's: at the chosen time, unless the day's reading
 *  is already done. Called when the setting changes, when the app opens and when a day is marked. */
export function syncReminders(): Promise<void> {
  const s = get();
  const list: { id: number; at: number; title: string; body: string }[] = [];
  const plan = current(plansStore.get());
  if (s.on && plan) {
    const [h, m] = s.time.split(":").map(Number);
    const start = today();
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      if (i === 0 && readOn(plan, day)) continue;
      const at = new Date(day);
      at.setHours(h, m, 0, 0);
      if (at.getTime() <= Date.now()) continue;
      const body = i === 0 ? todayFor(plan).parts.length && todayFor(plan).label : "";
      list.push({
        id: 1000 + i,
        at: at.getTime(),
        title: "Time for your Bible reading",
        body: body ? `Today: ${psalmLabel(body)}` : plan.name,
      });
    }
  }
  return invoke("schedule_reminders", { list });
}

export function Reminder() {
  const [s, setS] = useState<Setting>(get);
  const [err, setErr] = useState<string | null>(null);
  const change = (next: Setting) => {
    setS(next);
    save("reminder", next);
    setErr(null);
    syncReminders().catch((e) => setErr(String(e)));
  };
  const plan = current(plansStore.get());
  return (
    <div className="card flush">
      <label className="row switch" style={{ justifyContent: "space-between" }}>
        <span className="grow">Daily reminder</span>
        <input type="checkbox" checked={s.on} onChange={(e) => change({ ...s, on: e.target.checked })} />
        <span className="knob" aria-hidden="true" />
      </label>
      {s.on && (
        <label className="row">
          <span className="grow">At</span>
          <input type="time" className="time" value={s.time} onChange={(e) => e.target.value && change({ ...s, time: e.target.value })} />
        </label>
      )}
      <p className="m" style={{ margin: 0, padding: "0 14px 12px", lineHeight: 1.5 }}>
        {err
          ? err
          : !plan
            ? "Reminds you of your plan's reading. Choose a plan first."
            : "A notification with the day's reading, unless you've read it already."}
      </p>
    </div>
  );
}
