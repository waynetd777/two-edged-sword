// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";
import { TouchEvent, useEffect, useRef, useState } from "react";
import { fmtRef, Ref } from "../../src/bible";
import type { Spot } from "./MapsTab";

const MAX = 8;

/** A picture from a book (Larkin's charts), full screen: pinch to zoom, drag to move, double-tap to
 *  zoom in or back out. The page itself can't zoom (user-scalable=no), so this does it. */
export function ImageViewer({
  src,
  ring,
  spots,
  onGo,
  onClose,
}: {
  src: string;
  ring?: Spot[];
  /** A map's places, each a dot to tap for a card of its verses (as the desktop's map). */
  spots?: Spot[];
  /** A verse on a place's card was tapped. */
  onGo?: (r: Ref) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<[number, number] | null>(null);
  const [picked, setPicked] = useState<Spot | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  // The phone stays upright, so a wide chart turns instead, to use the screen's height.
  const [turned, setTurned] = useState(false);
  /** Swiping down, unzoomed, to close: how far it has gone. */
  const [down, setDown] = useState(0);
  const g = useRef<{
    d0: number;
    s0: number;
    mx: number;
    my: number;
    x0: number;
    y0: number;
    tx: number;
    ty: number;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef(0);
  // The one screen the iPhone may turn on (plugins/tes-native); upright again when it closes.
  useEffect(() => {
    invoke("plugin:tes-native|allow_rotation", { allow: true }).catch(() => {});
    return () => {
      invoke("plugin:tes-native|allow_rotation", { allow: false }).catch(() => {});
    };
  }, []);

  const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const mid = (e: TouchEvent) =>
    e.touches.length > 1
      ? { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 }
      : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const start = (e: TouchEvent) => {
    setAnim(false);
    const m = mid(e);
    g.current = { d0: e.touches.length > 1 ? dist(e) : 0, s0: t.s, mx: m.x, my: m.y, x0: t.x, y0: t.y, tx: m.x, ty: m.y, moved: false };
  };
  const move = (e: TouchEvent) => {
    const s = g.current;
    if (!s) return;
    const m = mid(e);
    s.moved = s.moved || Math.hypot(m.x - s.tx, m.y - s.ty) > 6 || e.touches.length > 1;
    if (e.touches.length > 1) {
      if (!s.d0) {
        // A second finger joined: start the pinch from here.
        Object.assign(s, { d0: dist(e), s0: t.s, mx: m.x, my: m.y, x0: t.x, y0: t.y });
        return;
      }
      const scale = Math.min(MAX, Math.max(1, (s.s0 * dist(e)) / s.d0));
      // Keep the point between the fingers where it was.
      const c = centre();
      const k = scale / s.s0;
      const x = m.x - c.x - (s.mx - c.x - s.x0) * k;
      const y = m.y - c.y - (s.my - c.y - s.y0) * k;
      setT({ s: scale, x, y });
    } else if (t.s > 1) setT({ s: t.s, x: s.x0 + m.x - s.mx, y: s.y0 + m.y - s.my });
    else if (m.y - s.my > 0 && Math.abs(m.x - s.mx) < m.y - s.my) setDown(m.y - s.my);
  };
  const end = (e: TouchEvent) => {
    const s = g.current;
    if (e.touches.length) return start(e);
    g.current = null;
    if (down > 120) return onClose();
    if (down) {
      setAnim(true);
      setDown(0);
    }
    if (t.s <= 1.02) {
      setAnim(true);
      setT({ s: 1, x: 0, y: 0 });
    }
    if (s && !s.moved) {
      if (spots?.length) setPicked(nearest(s.tx, s.ty));
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        setAnim(true);
        if (t.s > 1) setT({ s: 1, x: 0, y: 0 });
        else {
          const c = centre();
          setT({ s: 3, x: (c.x - s.tx) * 2, y: (c.y - s.ty) * 2 });
        }
      } else lastTap.current = now;
    }
  };

  /** The place whose dot is nearest a tap, within a fingertip of it, or none. */
  const nearest = (cx: number, cy: number): Spot | null => {
    const el = img.current;
    if (!el || !size || !spots) return null;
    const b = el.getBoundingClientRect();
    // Where the tap is on the picture, 0 to 1 each way. Turned a quarter clockwise, its top edge is on the right.
    let u = (cx - b.left) / b.width;
    let v = (cy - b.top) / b.height;
    if (turned) [u, v] = [v, 1 - u];
    const perPx = (turned ? b.height : b.width) / size[0];
    let best: Spot | null = null;
    let bestD = 26;
    for (const p of spots) {
      const d = Math.hypot(p.x - u * size[0], p.y - v * size[1]) * perPx;
      if (d < bestD) [best, bestD] = [p, d];
    }
    return best;
  };
  // A dot's radius in the picture's pixels, so it stays the same size on screen however far it's zoomed.
  const dotR = size && img.current?.clientWidth ? (4.5 * size[0]) / (img.current.clientWidth * t.s) : 0;
  const stop = {
    onTouchStart: (e: TouchEvent) => e.stopPropagation(),
    onTouchMove: (e: TouchEvent) => e.stopPropagation(),
    onTouchEnd: (e: TouchEvent) => e.stopPropagation(),
  };

  return (
    <div
      className="viewer"
      style={down ? { background: `rgba(0, 0, 0, ${Math.max(0.3, 1 - down / 400)})` } : undefined}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      <div
        className={["vpic", anim ? "anim" : "", turned ? "turned" : ""].join(" ")}
        style={{ transform: `translate(${t.x}px, ${t.y + down}px) scale(${t.s})${turned ? " rotate(90deg)" : ""}` }}
      >
        <img
          ref={img}
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
        />
        {/* A map's places for the verse, ringed as in the study pane. */}
        {ring && size && ring.length > 0 && (
          <svg viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
            {ring.map((s) => (
              <circle key={s.name + s.x} cx={s.x} cy={s.y} r={Math.max(s.r * 1.6, size[0] / 70)} />
            ))}
          </svg>
        )}
        {spots && size && dotR > 0 && (
          <svg className="dots" viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
            {spots.map((p) => (
              <circle
                key={p.name + p.x + "," + p.y}
                className={p === picked ? "on" : ""}
                cx={p.x}
                cy={p.y}
                r={p === picked ? dotR * 1.8 : dotR}
              />
            ))}
          </svg>
        )}
      </div>
      <button
        className="turn"
        aria-label={turned ? "Turn the picture back" : "Turn the picture sideways"}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onClick={() => {
          setAnim(true);
          setT({ s: 1, x: 0, y: 0 });
          setTurned(!turned);
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 12a8 8 0 1 1-2.3-5.6" />
          <path d="M20 4v4h-4" />
        </svg>
      </button>
      <button
        className="close"
        aria-label="Close"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onClick={onClose}
      >
        ✕
      </button>
      {picked && (
        <div className="place-card" {...stop}>
          <button className="x" aria-label="Close the place" onClick={() => setPicked(null)}>
            ✕
          </button>
          <p className="label">
            {picked.name} · {picked.refs.length} {picked.refs.length === 1 ? "verse" : "verses"}
          </p>
          <div className="prose">
            {picked.refs.slice(0, 80).map((r, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <a className="ref" onClick={() => onGo?.(r)}>
                  {fmtRef(r, "short")}
                </a>
              </span>
            ))}
            {picked.refs.length > 80 && <span className="m"> and {picked.refs.length - 80} more</span>}
          </div>
        </div>
      )}
      {t.s === 1 && !down && !picked && (
        <p className="vhint">
          {spots?.length
            ? "Tap a dot for its verses · pinch to zoom · swipe down to close"
            : "Pinch or double-tap to zoom · swipe down to close"}
        </p>
      )}
    </div>
  );
}
