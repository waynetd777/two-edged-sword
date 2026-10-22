// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// A book's or a map's picture over the whole window, to zoom into and move around.

import { useEffect, useRef, useState } from "react";
import { markClear } from "./esword";
import { Icon } from "./icons";

/** An image over the whole window, fitted at first. The wheel (or two fingers on a trackpad) zooms about the
 *  pointer, to 16 screen pixels a picture pixel, dragging pans, a double-click fits it again, Esc closes it; ← → step through the chapter's images. */
export function ImageViewer({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const go = (n: number) => {
    setI(n);
    setView({ z: 1, x: 0, y: 0 });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowLeft" && i > 0) go(i - 1);
      if (e.key === "ArrowRight" && i < images.length - 1) go(i + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [i, images.length, onClose]);
  // Not React's onWheel: that listener is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const im = img.current;
      const r = im?.getBoundingClientRect();
      if (!im || !r) return;
      // Far enough to see each pixel. Unlimited, WebKit's tiles for a picture scaled thousands of times over
      // were left on the screen as streaks when it was zoomed out again.
      const most = Math.max(1, (16 * im.naturalWidth) / Math.max(1, im.offsetWidth));
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // A trackpad pinch arrives as a wheel with ctrlKey and small steps.
      const f = Math.exp(-dy * (e.ctrlKey && Math.abs(dy) < 50 ? 0.01 : 0.002));
      setView((v) => {
        const z = Math.min(most, Math.max(0.05, v.z * f));
        const k = 1 - z / v.z;
        return { z, x: v.x + (e.clientX - r.left) * k, y: v.y + (e.clientY - r.top) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <div className="viewer" role="dialog" aria-label="Image">
      <div
        ref={scroll}
        className="scroll"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          contain: "strict",
          padding: "56px 40px 40px",
          cursor: panning ? "grabbing" : "grab",
        }}
        // Here, not on the image: the drag's pointer capture sends the clicks to this element.
        onDoubleClick={() => setView({ z: 1, x: 0, y: 0 })}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
          setPanning(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          d.x = e.clientX;
          d.y = e.clientY;
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          drag.current = null;
          setPanning(false);
        }}
      >
        <img
          ref={img}
          src={images[i]}
          onLoad={markClear}
          alt=""
          draggable={false}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            transformOrigin: "0 0",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          }}
        />
      </div>
      <div className="viewer-hint">Scroll to zoom · drag to pan · double-click to fit · Esc to close</div>
      <div className="viewer-ctrls">
        {images.length > 1 && (
          <span style={{ color: "#ccc", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            {i + 1} of {images.length}
          </span>
        )}
        {images.length > 1 && (
          <button className="ibtn" type="button" aria-label="Previous image" disabled={i === 0} onClick={() => go(i - 1)}>
            <Icon name="back" />
          </button>
        )}
        {images.length > 1 && (
          <button className="ibtn" type="button" aria-label="Next image" disabled={i === images.length - 1} onClick={() => go(i + 1)}>
            <Icon name="fwd" />
          </button>
        )}
        <button className="ibtn" type="button" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
