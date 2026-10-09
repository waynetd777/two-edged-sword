// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The pictures viewer (visions.html, `make visions`): each of the pictures behind a song's words,
// one at a time, drawn by Visions as on the Lyrics page, fading in and out and beginning again.
// ← and → step through them; the keys below change the theme, the words, the colours and so on.
// For working on the pictures only: not part of the app.

import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { setSceneVision, Visions } from "./Visions";
import { VISIONS } from "./pictures";

/** Artwork to take the colours from: none (warm gold and soft blue), or a made-up cover of two. */
const ARTS: { name: string; colours: [string, string] | null }[] = [
  { name: "no artwork", colours: null },
  { name: "red and purple", colours: ["#c0392b", "#6c3483"] },
  { name: "green and teal", colours: ["#2e8b57", "#17a2b8"] },
  { name: "orange and blue", colours: ["#e67e22", "#2c5aa0"] },
  { name: "pink and gold", colours: ["#d63384", "#d4a017"] },
];
function cover(colours: [string, string]) {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const x = c.getContext("2d")!;
  x.fillStyle = colours[0];
  x.fillRect(0, 0, 96, 96);
  x.fillStyle = colours[1];
  x.fillRect(0, 60, 96, 36);
  return c.toDataURL("image/png");
}

const LINES = [
  "Amazing grace, how sweet the sound",
  "That saved a wretch like me",
  "I once was lost, but now am found",
  "Was blind, but now I see",
  "",
  "'Twas grace that taught my heart to fear",
  "And grace my fears relieved",
  "How precious did that grace appear",
  "The hour I first believed",
];

function Viewer() {
  const start = Math.max(
    0,
    VISIONS.findIndex((v) => v.name === new URLSearchParams(location.search).get("v")),
  );
  const [i, setI] = useState(start);
  const [run, setRun] = useState(0); // bumped to begin the picture again
  const [dark, setDark] = useState(true);
  const [words, setWords] = useState(new URLSearchParams(location.search).get("w") !== "0"); // `?w=0`: without the words
  const [playing, setPlaying] = useState(true);
  const [art, setArt] = useState(0);
  const [bpm, setBpm] = useState(72);
  const v = VISIONS[i];
  const artUrl = useMemo(() => (ARTS[art].colours ? cover(ARTS[art].colours!) : null), [art]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (i !== start) history.replaceState(null, "", `?v=${encodeURIComponent(v.name)}`);
  }, [i, start, v.name]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement) return;
      const n = VISIONS.length;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setI((x) => (x + 1) % n);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setI((x) => (x - 1 + n) % n);
      else if (e.key === " ") setPlaying((p) => !p);
      else if (e.key === "t") setDark((d) => !d);
      else if (e.key === "w") setWords((w) => !w);
      else if (e.key === "c") setArt((a) => (a + 1) % ARTS.length);
      else if (e.key === "r") setRun((r) => r + 1);
      else if (e.key === "b") setBpm((b) => (b === 72 ? 120 : b === 120 ? 0 : 72));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // The song's clock, for the beat.
  const time = useMemo(() => {
    const t0 = performance.now();
    return () => (performance.now() - t0) / 1000;
  }, []);
  const wordsAt = () => {
    const col = document.getElementById("words");
    if (!words || !col) return null;
    const r = col.getBoundingClientRect();
    return { left: r.left, right: r.right };
  };

  // `?at=0.5` begins the first picture halfway through (for a screenshot); the rest from the start.
  setSceneVision(v.name, i === start && run === 0 ? Number(new URLSearchParams(location.search).get("at")) || 0 : 0, true);
  return (
    <div className={`viewer ${dark ? "dark" : "light"}`}>
      {artUrl && (
        <div className="lyrics-art" aria-hidden>
          <img key={artUrl} src={artUrl} alt="" />
        </div>
      )}
      <div className="lyrics-art" aria-hidden>
        <Visions
          key={`${v.name}/${run}/${words}`}
          bpm={bpm}
          playing={playing}
          time={time}
          dark={dark}
          art={artUrl}
          words={wordsAt}
          song={LINES.join("\n")}
        />
      </div>
      {words && (
        <div id="words">
          {LINES.map((l, n) => (
            <p key={n} className={n === 1 ? "now" : ""}>
              {l || " "}
            </p>
          ))}
        </div>
      )}
      <div className="bar">
        <button onClick={() => setI((x) => (x - 1 + VISIONS.length) % VISIONS.length)}>←</button>
        <select value={i} onChange={(e) => setI(Number(e.target.value))}>
          {VISIONS.map((p, n) => (
            <option key={p.name} value={n}>
              {n + 1}. {p.name}
            </option>
          ))}
        </select>
        <button onClick={() => setI((x) => (x + 1) % VISIONS.length)}>→</button>
        <span>
          {i + 1}/{VISIONS.length} · {v.lane === "back" ? "backdrop" : "passing"} · {v.dur[0]}–{v.dur[1]}s · {ARTS[art].name} ·{" "}
          {bpm || "no"} bpm
          {playing ? "" : " · paused"}
        </span>
        {v.themes && <span style={{ opacity: 0.6 }}>themes: {v.themes.join(", ")}</span>}
        <span className="keys">← → pictures · space pause · t theme · w words · c colours · b beat · r restart</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Viewer />);
