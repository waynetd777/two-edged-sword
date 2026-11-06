// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";
import { TouchEvent, useEffect, useRef, useState } from "react";

const MAX = 8;

/** A picture from a book (Larkin's charts), full screen: pinch to zoom, drag to move, double-tap to
 *  zoom in or back out. The page itself can't zoom (user-scalable=no), so this does it. */
export function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  // The phone stays upright, so a wide chart turns instead, to use the screen's height.
  const [turned, setTurned] = useState(false);
  /** Swiping down, unzoomed, to close: how far it has gone. */
  const [down, setDown] = useState(0);
  const g = useRef<{ d0: number; s0: number; mx: number; my: number; x0: number; y0: number; tx: number; ty: number; moved: boolean } | null>(null);
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

  return (
    <div
      className="viewer"
      style={down ? { background: `rgba(0, 0, 0, ${Math.max(0.3, 1 - down / 400)})` } : undefined}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
      <img
        src={src}
        alt=""
        draggable={false}
        className={[anim ? "anim" : "", turned ? "turned" : ""].join(" ").trim() || undefined}
        style={{ transform: `translate(${t.x}px, ${t.y + down}px) scale(${t.s})${turned ? " rotate(90deg)" : ""}` }}
      />
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.3-5.6" />
          <path d="M20 4v4h-4" />
        </svg>
      </button>
      <button className="close" aria-label="Close" onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} onClick={onClose}>
        ✕
      </button>
      {t.s === 1 && !down && <p className="vhint">Pinch or double-tap to zoom · swipe down to close</p>}
    </div>
  );
}
