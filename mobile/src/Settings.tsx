// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { player, sample, usePlayer, Voice, voices } from "./player";
import { Module, save, saved, scene } from "./api";
import { Reminder } from "./Reminder";
import { SyncSettings } from "./SyncSettings";

export interface Prefs {
  theme: "system" | "light" | "dark";
  font: "atkinson" | "literata" | "source" | "inter";
  size: number;
  red: boolean;
}

/** The reading fonts, as the desktop offers them (state.tsx READ_FONTS); Atkinson is the default. */
export const FONTS: Record<Prefs["font"], { label: string; stack: string }> = {
  atkinson: { label: "Atkinson", stack: '"Atkinson Hyperlegible Next Variable", -apple-system, sans-serif' },
  literata: { label: "Literata", stack: '"Literata Variable", Georgia, serif' },
  source: { label: "Source Serif", stack: '"Source Serif 4 Variable", Georgia, serif' },
  inter: { label: "Inter", stack: '"Inter Variable", -apple-system, sans-serif' },
};

const DEFAULTS: Prefs = { theme: "system", font: "atkinson", size: 19, red: true };
let prefs: Prefs = { ...DEFAULTS, ...saved<Partial<Prefs>>("prefs", {}) };
const watchers = new Set<() => void>();

/** Puts the settings on the page: the theme, the reading font and size, the red letters. */
export function applyPrefs(p = prefs) {
  const root = document.documentElement;
  if (p.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", p.theme);
  root.style.setProperty("--read", FONTS[p.font].stack);
  root.style.setProperty("--read-size", `${p.size}px`);
  root.classList.toggle("no-red", !p.red);
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  save("prefs", prefs);
  applyPrefs();
  watchers.forEach((w) => w());
}

export function usePrefs() {
  return useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => prefs,
  );
}

function Seg<T extends string>({
  value,
  options,
  onPick,
  label,
}: {
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <span className="seg inline" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} aria-selected={value === v} onClick={() => onPick(v)}>
          {l}
        </button>
      ))}
    </span>
  );
}

export function Settings({ modules }: { modules: Module[] }) {
  const p = usePrefs();
  return (
    <>
      <p className="label">Reading</p>
      <div className="card flush">
        <div className="row">
          <span className="grow">Theme</span>
          <Seg
            label="Theme"
            value={p.theme}
            options={[
              ["system", "System"],
              ["light", "Light"],
              ["dark", "Dark"],
            ]}
            onPick={(theme) => setPrefs({ theme })}
          />
        </div>
        <div className="row" style={{ flexWrap: "wrap", paddingTop: 10, paddingBottom: 10 }}>
          <span className="grow">Reading font</span>
          <div className="chips" style={{ width: "100%", marginTop: 8 }}>
            {(Object.keys(FONTS) as Prefs["font"][]).map((f) => (
              <button
                key={f}
                className={`chip ${p.font === f ? "on" : ""}`}
                style={{ fontFamily: FONTS[f].stack }}
                onClick={() => setPrefs({ font: f })}
              >
                {FONTS[f].label}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: "12px 14px" }}>
          <span>Reading text size</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="m" aria-hidden="true">
              A
            </span>
            <input
              type="range"
              min={15}
              max={28}
              step={1}
              value={p.size}
              aria-label="Reading text size"
              onChange={(e) => setPrefs({ size: +e.target.value })}
              style={{ flex: 1 }}
            />
            <span aria-hidden="true" style={{ fontSize: 20, color: "var(--muted)" }}>
              A
            </span>
          </span>
          <span style={{ fontFamily: "var(--read)", fontSize: "var(--read-size)", lineHeight: 1.5 }}>In the beginning was the Word.</span>
        </div>
        <label className="row switch" style={{ justifyContent: "space-between" }}>
          <span className="grow">Words of Jesus in red</span>
          <input type="checkbox" checked={p.red} onChange={(e) => setPrefs({ red: e.target.checked })} />
          <span className="knob" aria-hidden="true" />
        </label>
      </div>

      <p className="label" style={{ marginTop: 18 }}>
        Listen
      </p>
      <ListenSettings />

      <p className="label" style={{ marginTop: 18 }}>
        Quiet time
      </p>
      <Reminder />

      <p className="label" style={{ marginTop: 18 }}>
        Sync
      </p>
      <SyncSettings />

      <p className="label" style={{ marginTop: 18 }}>
        About
      </p>
      <div className="card">
        <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Two-edged Sword</p>
        <p className="m" style={{ margin: 0, lineHeight: 1.5 }}>
          Free software under the GNU General Public License, version 3 or later. Its Bibles, commentaries, dictionaries and books are in
          the public domain. {modules.length} modules on this phone.
        </p>
      </div>
    </>
  );
}

const QUALITY = { premium: "Premium", enhanced: "Enhanced", default: "" };

function ListenSettings() {
  const pl = usePlayer();
  const [voice, setVoice] = useState<string | null>(() => saved("listenVoice", null));
  const [list, setList] = useState<Voice[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    voices().then(setList);
    scene.then((sc) => sc.includes("voices") && setChoosing(true));
  }, []);
  const chosen = list?.find((v) => v.id === voice);
  const pick = (id: string | null) => {
    setVoice(id);
    save("listenVoice", id);
    if (!pl.on) sample(id);
  };
  return (
    <div className="card flush">
      <button className="row" onClick={() => setChoosing(true)}>
        <span className="grow">Voice</span>
        <span className="m">{chosen ? chosen.name : "Automatic"} ›</span>
      </button>
      <button className="row" onClick={player.faster}>
        <span className="grow">Speed</span>
        <span className="m">{pl.speed}× ›</span>
      </button>
      {choosing && (
        <>
          <div className="scrim" onClick={() => setChoosing(false)} />
          <section className="sheet tall" aria-label="Choose a voice">
            <div className="grab" onClick={() => setChoosing(false)}>
              <span />
            </div>
            <div className="shead">
              <h2 style={{ flex: 1 }}>Voice</h2>
              <button className="done" onClick={() => setChoosing(false)}>
                Done
              </button>
            </div>
            <div className="sbody">
              <p className="m" style={{ marginTop: 0 }}>
                Tap a voice to hear it.
              </p>
              <div className="list">
                <button className={`row ${voice === null ? "on" : ""}`} onClick={() => pick(null)}>
                  <span className="grow" style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
                    <span>Automatic</span>
                    <span className="m">The best voice on this phone, in your own English where it has one</span>
                  </span>
                  {voice === null && <Icon name="check" size={18} />}
                </button>
                {list?.map((v) => (
                  <button key={v.id} className={`row ${voice === v.id ? "on" : ""}`} onClick={() => pick(v.id)}>
                    <span className="grow" style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
                      <span>{v.name}</span>
                      <span className="m">
                        {v.language}
                        {QUALITY[v.quality] ? ` · ${QUALITY[v.quality]}` : ""}
                      </span>
                    </span>
                    {voice === v.id && <Icon name="check" size={18} />}
                  </button>
                ))}
              </div>
              <p className="m" style={{ marginTop: 14, lineHeight: 1.5 }}>
                More voices, and better ones (Enhanced and Premium), are free in the iPhone's Settings › Accessibility › Spoken Content ›
                Voices › English. Once downloaded they show here.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
