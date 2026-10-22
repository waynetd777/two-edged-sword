// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// A book's or a map's picture over the whole window, to zoom into and move around.

import { useCallback, useEffect, useRef, useState } from "react";
import { Ref } from "./bible";
import { markClear } from "./esword";
import { Icon } from "./icons";
import { Place, PlacePopover, PlaceSpots } from "./MapPlaces";

/** An image over the whole window, fitted at first. The wheel (or two fingers on a trackpad) zooms about the
 *  pointer, to 16 screen pixels a picture pixel, dragging pans, a double-click fits it again, Esc closes it; ← → step through the chapter's images.
 *  A map's `places` (one list an image) can be clicked for their verses, which `onRef` opens. */
export function ImageViewer({
  images,
  start,
  onClose,
  places,
  onRef,
  onRefHover,
}: {
  images: string[];
  start: number;
  onClose: () => void;
  places?: Place[][];
  onRef?: (r: Ref) => void;
  onRefHover?: (r: Ref | null, el: HTMLElement | null) => void;
}) {
  const [i, setI] = useState(start);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  // A map's places: the picture's box as laid out (before the zoom's transform), and the place clicked.
  const here = (onRef && places?.[i]) || [];
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number; nw: number; nh: number } | null>(null);
  const [pick, setPick] = useState<{ place: Place; rect: DOMRect } | null>(null);
  const [panning, setPanning] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  // Stable, so the places aren't drawn again on every frame of a zoom.
  const onPick = useCallback((place: Place, rect: DOMRect) => setPick({ place, rect }), []);
  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  const drag = useRef<{ x: number; y: number } | null>(null);
  const go = (n: number) => {
    setI(n);
    setView({ z: 1, x: 0, y: 0 });
    setPick(null);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pick) return; // the place's card takes Esc first (Popover), and the arrows
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowLeft" && i > 0) go(i - 1);
      if (e.key === "ArrowRight" && i < images.length - 1) go(i + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [i, images.length, onClose, pick]);
  // The overlay follows the picture's laid-out box; the zoom moves both by the same transform.
  const hasPlaces = here.length > 0;
  useEffect(() => {
    const im = img.current;
    if (!im || !hasPlaces) return;
    const measure = () =>
      im.naturalWidth &&
      setBox({ l: im.offsetLeft, t: im.offsetTop, w: im.offsetWidth, h: im.offsetHeight, nw: im.naturalWidth, nh: im.naturalHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(im);
    im.addEventListener("load", measure);
    measure();
    return () => {
      ro.disconnect();
      im.removeEventListener("load", measure);
    };
  }, [i, hasPlaces]);
  // Not React's onWheel: that listener is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setPick(null);
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
          e.preventDefault(); // so no mousedown reaches the place's card to close it: closed here
          setPick(null);
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
            transform,
          }}
        />
        {hasPlaces && box && (
          <PlaceSpots
            places={here}
            w={box.nw}
            h={box.nh}
            onPick={onPick}
            picked={pick?.place}
            style={{ left: box.l, top: box.t, width: box.w, height: box.h, transformOrigin: "0 0", transform }}
          />
        )}
      </div>
      {pick && onRef && (
        <PlacePopover place={pick.place} anchor={pick.rect} onClose={() => setPick(null)} onRef={onRef} onRefHover={onRefHover} />
      )}
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
