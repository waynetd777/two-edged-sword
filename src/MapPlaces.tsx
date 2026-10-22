// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// A map's places, from the HTML image map its picture carries (tools/maps/build.py writes one): a target on
// each dot and name that rings the dot on hover, and, on a click, a card of the place's verses.

import { CSSProperties, useMemo, useState } from "react";
import { fmtRef, parseRef, Ref } from "./bible";
import { markClear } from "./esword";
import { Popover } from "./ui";

export interface Place {
  name: string;
  sure: boolean;
  /** Centre and radius of the target, in the picture's own pixels. */
  x: number;
  y: number;
  r: number;
  /** The box of the place's name on the map, in the same pixels. */
  label?: [number, number, number, number];
  refs: Ref[];
}

/** The places of the image map an <img usemap="#name"> points to: only areas with verses (data-refs), so a
 *  module's other image maps (links to elsewhere) are left alone. */
export function imagePlaces(img: Element): Place[] {
  const name = (img.getAttribute("usemap") || "").replace(/^#/, "");
  if (!name) return [];
  const map = Array.from(img.ownerDocument.getElementsByTagName("map")).find((m) => m.getAttribute("name") === name);
  if (!map) return [];
  const out: Place[] = [];
  for (const a of Array.from(map.getElementsByTagName("area"))) {
    const refs = (a.getAttribute("data-refs") || "")
      .split(";")
      .map((t) => parseRef(t))
      .filter((r): r is Ref => !!r);
    const c = (a.getAttribute("coords") || "").split(",").map(Number);
    if (!refs.length || (a.getAttribute("shape") || "").toLowerCase() !== "circle" || c.length !== 3 || c.some(isNaN)) continue;
    const l = (a.getAttribute("data-label") || "").split(",").map(Number);
    out.push({
      name: a.getAttribute("title") || a.getAttribute("alt") || "",
      sure: a.getAttribute("data-sure") !== "0",
      x: c[0],
      y: c[1],
      r: c[2],
      label: l.length === 4 && !l.some(isNaN) ? (l as [number, number, number, number]) : undefined,
      refs,
    });
  }
  return out;
}

// The same place, though the page was parsed again.
const same = (a: Place, b?: Place | null) => !!b && a.x === b.x && a.y === b.y && a.name === b.name;

/** Targets over a picture of `w` × `h` pixels, placed in percentages so they follow its displayed size: over
 *  the whole of a positioned parent the picture's size, or where `style` puts them. */
export function PlaceSpots({
  places,
  w,
  h,
  onPick,
  picked,
  style = { inset: 0 },
}: {
  places: Place[];
  w: number;
  h: number;
  onPick: (p: Place, rect: DOMRect) => void;
  /** The place whose card is open, ringed as on hover. */
  picked?: Place | null;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(-1);
  const spots = useMemo(() => {
    const pct = (v: number, of: number) => `${(v / of) * 100}%`;
    const props = (p: Place, i: number) => ({
      onMouseEnter: () => setHover(i),
      onMouseLeave: () => setHover((h) => (h === i ? -1 : h)),
      // Not a drag of the picture (the viewer pans on pointer down), nor a click on it (it opens full screen).
      onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
      onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const dot = (e.currentTarget.parentElement?.querySelector(`[data-spot="${i}"]`) ?? e.currentTarget) as HTMLElement;
        onPick(p, dot.getBoundingClientRect());
      },
    });
    return places.map((p, i) => {
      const dot: CSSProperties = { left: pct(p.x, w), top: pct(p.y, h), width: `max(${pct(2 * p.r, w)}, 18px)` };
      const l = p.label;
      return (
        <span key={i}>
          <button
            type="button"
            className={`map-spot${hover === i || same(p, picked) ? " on" : ""}`}
            data-spot={i}
            style={dot}
            aria-label={p.sure ? p.name : `${p.name} (site uncertain)`}
            {...props(p, i)}
          />
          {l && (
            <span
              className="map-label"
              style={{ left: pct(l[0], w), top: pct(l[1], h), width: pct(l[2] - l[0], w), height: pct(l[3] - l[1], h) }}
              {...props(p, i)}
            />
          )}
        </span>
      );
    });
  }, [places, w, h, hover, onPick, picked]);
  return (
    <div className="map-spots" style={style}>
      {spots}
    </div>
  );
}

/** A map's picture in a page, with its places to click; a click elsewhere on it opens it full screen. */
export function MapPicture({
  src,
  places,
  onImage,
  onPick,
  picked,
}: {
  src: string;
  places: Place[];
  onImage?: (src: string) => void;
  onPick: (p: Place, rect: DOMRect) => void;
  picked?: Place | null;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <span className="map-pic">
      <img
        src={src}
        alt=""
        draggable={false}
        className={onImage ? "zoomable" : undefined}
        onLoad={(e) => {
          markClear(e);
          setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
        }}
        onClick={(e) => {
          if (!onImage) return;
          e.stopPropagation();
          onImage(src);
        }}
      />
      {size && <PlaceSpots places={places} w={size.w} h={size.h} onPick={onPick} picked={picked} />}
    </span>
  );
}

/** A place's card: its name and its verses, each showing the verse on hover and opening it on a click. */
export function PlacePopover({
  place,
  anchor,
  onClose,
  onRef,
  onRefHover,
}: {
  place: Place;
  anchor: DOMRect;
  onClose: () => void;
  onRef: (r: Ref) => void;
  onRefHover?: (r: Ref | null, el: HTMLElement | null) => void;
}) {
  // By book: "Genesis 12:8, 13:3", "Joshua 7:2".
  const books: Ref[][] = [];
  for (const r of place.refs) {
    const last = books[books.length - 1];
    if (last && last[0].book === r.book) last.push(r);
    else books.push([r]);
  }
  return (
    <Popover anchor={anchor} onClose={onClose} width={340} style={{ maxHeight: 360 }}>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ font: "500 17px/1.25 var(--display)" }}>{place.name}</div>
        <div className="n" style={{ marginBottom: 8 }}>
          {place.sure ? "" : "Site uncertain · "}
          {place.refs.length === 1 ? "1 verse" : `${place.refs.length} verses`}
        </div>
        {books.map((rs) => (
          <div key={rs[0].book} style={{ font: "400 13px/1.6 var(--ui)" }}>
            {rs.map((r, i) => (
              <span key={i}>
                {i > 0 && ", "}
                <a
                  className="ref"
                  onClick={(e) => {
                    e.preventDefault();
                    onRef(r);
                  }}
                  onMouseEnter={(e) => onRefHover?.(r, e.currentTarget)}
                  onMouseLeave={() => onRefHover?.(null, null)}
                >
                  {i === 0 ? fmtRef(r) : fmtRef(r).replace(/^.* (?=\d+:)/, "")}
                </a>
              </span>
            ))}
          </div>
        ))}
      </div>
    </Popover>
  );
}
