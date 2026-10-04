// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The menu-bar window (src-tauri/src/tray.rs opens it under the icon): today's reading and how the
// plan stands, Start Quiet time, the few things worth doing from the menu bar with their keys, and
// the reminder and Open at Login switches. What it shows comes from the main window (src/tray.tsx);
// what is chosen goes back through Rust.

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, TrayInfo, TrayState } from "./api";
import { Icon, Sword } from "./icons";
import { READ_FONTS, ReadFont } from "./state";
import { Switch } from "./ui";

const WIDTH = 340;

/** The headline and the line under it. */
export function trayStatus(s: TrayState | null): { headline: string; sub: string } {
  if (!s) return { headline: "Two-edged Sword", sub: "Starting…" };
  if (!s.plan || !s.today) return { headline: "No reading plan", sub: "Choose one in Plans to read a little every day" };
  const where = [s.plan, s.progress].filter(Boolean).join(" · ");
  if (s.done) return { headline: "Today's reading is done", sub: s.streak > 1 ? `${s.streak} days in a row · ${s.plan}` : where };
  const late = s.behind > 0 ? ` · ${s.behind} ${s.behind === 1 ? "day" : "days"} behind` : "";
  return { headline: s.today, sub: where + late };
}

const hide = () => void getCurrentWindow().hide();
const act = (id: string) => void api.trayDo(id).catch((e) => console.error("tray", e));

function Item({ label, keys, icon, id, strong }: { label: string; keys?: string; icon: string; id: string; strong?: boolean }) {
  return (
    <button
      type="button"
      className={`tray-item${strong ? " strong" : ""}`}
      title={keys ? `${label} (${keys})` : label}
      onClick={() => act(id)}
    >
      <Icon name={icon} size={14} />
      <span className="grow ell">{label}</span>
      {keys && <span className="kbd">{keys}</span>}
    </button>
  );
}

/** The theme and reading font chosen in Settings (headings follow the reading font, as in the main
 *  window), which the main window may have changed since this one last opened. */
async function applyTheme() {
  const saved = await api.storeRead<{ theme?: string; readFont?: ReadFont }>("settings").catch(() => null);
  // A screenshot scene's settings (its theme), which aren't saved.
  const sc = await api.scene().catch(() => null);
  const s = { ...saved, ...(sc ? JSON.parse(sc).settings : {}) };
  const t = s?.theme ?? "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  const stack = READ_FONTS[s?.readFont as ReadFont]?.stack ?? READ_FONTS.literata.stack;
  document.documentElement.style.setProperty("--serif", stack);
  document.documentElement.style.setProperty("--display", stack);
}

export function TrayWindow() {
  const [info, setInfo] = useState<TrayInfo | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const refresh = useCallback(() => void api.trayInfo().then(setInfo), []);

  useEffect(() => {
    void applyTheme();
    const offs = [
      listen("tray-opened", () => {
        void applyTheme();
        refresh();
      }),
      listen("tray-state", refresh),
    ];
    // Read once both are listening, so a state sent meanwhile isn't missed.
    void Promise.all(offs).then(refresh);
    return () => offs.forEach((o) => void o.then((f) => f()));
  }, [refresh]);

  // Its keys while it's open.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") return hide();
      if (e.key === "Enter" && !e.metaKey) return act("quiet");
      if (!e.metaKey) return;
      const id = (
        { o: "open", r: "continue", j: "journal", f: "search", p: "plans", ",": "settings", q: "quit" } as Record<string, string>
      )[e.key.toLowerCase()];
      if (id) {
        e.preventDefault();
        act(id);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // The window is as tall as what it shows.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(
      () =>
        void getCurrentWindow()
          .setSize(new LogicalSize(WIDTH, Math.ceil(el.getBoundingClientRect().height)))
          .catch(() => {}),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [info !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;
  const s = info.state;
  const { headline, sub } = trayStatus(s);
  const hasPlan = !!s?.plan && !!s.today;
  return (
    <div ref={box} className="traywin">
      <div className="tray-head">
        <span className="tray-mark">
          <Sword size={30} />
        </span>
        <div className="tray-titles">
          <div className={`tray-title ell${s?.done ? " done" : ""}`}>
            {s?.done && <Icon name="check" size={15} />}
            {headline}
          </div>
          <div className="tray-sub ell">{sub}</div>
        </div>
      </div>
      {hasPlan && (
        <>
          <div className="tray-progress" title={`${s.pct}% of ${s.plan}`}>
            <i style={{ width: `${Math.max(2, s.pct)}%` }} />
          </div>
          <div className="tray-tiles">
            {(
              [
                ["Streak", s.streak, s.best > s.streak ? `best ${s.best}` : s.streak === 1 ? "day" : "days"],
                ["This week", `${s.week}/7`, "days read"],
                ["Plan", `${s.pct}%`, s.progress ?? ""],
              ] as const
            ).map(([label, n, note]) => (
              <button key={label} type="button" className="tray-tile" title="Open Plans" onClick={() => act("plans")}>
                <span className="lbl">{label}</span>
                <b>{n}</b>
                <span className="note ell">{note}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="tray-cta">
        {hasPlan && !s.done ? (
          <button type="button" className="btn primary tray-go" onClick={() => act("quiet")}>
            <Icon name="plans" size={14} />
            Start Quiet time
            <span className="kbd">↩</span>
          </button>
        ) : (
          <button type="button" className="btn tray-go" onClick={() => act("plans")}>
            <Icon name="plans" size={14} />
            {hasPlan ? "See the plan" : "Choose a plan"}
          </button>
        )}
      </div>
      <div className="tray-sec tray-list">
        <Item icon="read" label={s?.reading ? `Continue reading ${s.reading}` : "Continue reading"} keys="⌘R" id="continue" />
        <Item icon="journal" label="New journal entry" keys="⌘J" id="journal" />
        <Item icon="search" label="Search the Bible" keys="⌘F" id="search" />
      </div>
      <div className="tray-sec tray-switches">
        <div className="tray-switch">
          <Icon name="clock" size={14} />
          <span className="grow">Daily reminder{s?.reminderTime ? ` at ${s.reminderTime}` : ""}</span>
          <Switch on={!!s?.reminder} onChange={() => act("reminder")} />
        </div>
        {info.loginAvailable && (
          <div className="tray-switch">
            <Icon name="power" size={14} />
            <span className="grow">Open at login</span>
            <Switch on={info.login} onChange={() => void api.trayDo("login").then(refresh)} />
          </div>
        )}
      </div>
      <div className="tray-sec tray-list">
        <Item icon="bible" label="Open Two-edged Sword" keys="⌘O" strong id="open" />
        <Item icon="settings" label="Settings…" keys="⌘," id="settings" />
        <Item icon="x" label="Quit" keys="⌘Q" id="quit" />
      </div>
    </div>
  );
}
