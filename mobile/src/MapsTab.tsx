// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { book, fmtRef, parseRef, Ref } from "../../src/bible";
import { api, Module, Offer, saved } from "./api";
import { bookTitles } from "./DocView";
import { downloadsBase } from "./Library";

/** A marked place on a map: the circle round it, in the picture's pixels, and the verses naming it. */
export interface Spot {
  name: string;
  x: number;
  y: number;
  r: number;
  refs: Ref[];
}

/** One map: its picture and its places. */
interface MapPage {
  module: string;
  title: string;
  src: string;
  spots: Spot[];
}

/** Which maps suit a book, by the words in their titles (the desktop's StudyPane.tsx). */
function mapHint(b: number): RegExp {
  if (b === 1) return /patriarch|near east|ancient/i;
  if (b >= 2 && b <= 5) return /exodus|egypt|sinai/i;
  if (b >= 6 && b <= 8) return /canaan|tribal|division/i;
  if (b >= 9 && b <= 14) return /saul|david|solomon|united|kingdoms of israel|judah|assyrian|old testament/i;
  if (b >= 15 && b <= 17) return /persian|old testament/i;
  if (b === 27) return /persian|greek|babylon/i;
  if (b >= 23 && b <= 39) return /assyrian|babylon|kingdoms of israel|judah|old testament/i;
  if (b >= 40 && b <= 43) return /jesus|herod|roman rule/i;
  if (b === 44) return /paul|apostles|early ministry|spread|roman empire/i;
  if (b >= 45 && b <= 65) return /paul|roman empire|new testament|spread/i;
  if (b === 66) return /seven churches|roman empire|new testament/i;
  return /world of the new testament|roman empire|spread/i;
}

/** A map chapter's first picture and its image map's places, read with patterns rather than parsed:
 *  the pictures are megabytes of base64. */
function readMap(module: string, title: string, html: string): MapPage | null {
  const img = html.match(/<img[^>]+src="(data:image\/[^"]+)"[^>]*>/i);
  if (!img) return null;
  const usemap = img[0].match(/usemap="#([^"]+)"/i)?.[1];
  const map = usemap ? html.match(new RegExp(`<map name="${usemap}">([\\s\\S]*?)</map>`, "i"))?.[1] : undefined;
  const spots: Spot[] = [];
  for (const a of map?.matchAll(/<area\b[^>]*>/gi) ?? []) {
    const at = (k: string) => a[0].match(new RegExp(`${k}="([^"]*)"`, "i"))?.[1] ?? "";
    const c = at("coords").split(",").map(Number);
    if (at("shape").toLowerCase() !== "circle" || c.length !== 3 || c.some(isNaN)) continue;
    const refs = at("data-refs")
      .split(";")
      .map((t) => parseRef(t))
      .filter((r): r is Ref => !!r);
    if (refs.length) spots.push({ name: at("title") || at("alt"), x: c[0], y: c[1], r: c[2], refs });
  }
  return { module, title, src: img[1], spots };
}

/** Every map in the maps books, read once a session. */
let allMaps: Promise<MapPage[]> | null = null;
function loadMaps(books: Module[]) {
  if (!allMaps)
    allMaps = Promise.all(
      books.map(async (m) => {
        const titles = await bookTitles(m.id);
        const pages = await Promise.all(
          titles.map((t) =>
            api
              .article("reference", m.id, t)
              .then((a) => (a ? readMap(m.id, t, a.html) : null))
              .catch(() => null),
          ),
        );
        return pages.filter((p): p is MapPage => !!p);
      }),
    ).then((x) => x.flat());
  return allMaps;
}

const names = (r: Ref, at: { book: number; chapter: number; verse: number }) =>
  r.book === at.book && r.chapter === at.chapter && (r.verse === at.verse || (r.verse! <= at.verse && (r.to ?? r.verse!) >= at.verse));

/** A map with rings round some of its places, in the picture's own pixels so they scale with it. */
export function RingedMap({ page, ring, onTap }: { page: { src: string; spots: Spot[] }; ring: Spot[]; onTap?: () => void }) {
  const [size, setSize] = useState<[number, number] | null>(null);
  return (
    <div className="ringed" onClick={onTap}>
      <img src={page.src} alt="" draggable={false} onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
      {size && ring.length > 0 && (
        <svg viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
          {ring.map((s) => (
            <circle key={s.name + s.x} cx={s.x} cy={s.y} r={Math.max(s.r * 1.6, size[0] / 70)} />
          ))}
        </svg>
      )}
    </div>
  );
}

export function MapsTab({
  at,
  modules,
  onChanged,
  onGo,
  onOpen,
}: {
  at: { book: number; chapter: number; verse: number };
  modules: Module[];
  onChanged: () => void;
  onGo: (r: Ref) => void;
  /** Full screen, with the rings. */
  onOpen: (src: string, ring: Spot[], spots: Spot[]) => void;
}) {
  const books = modules.filter((m) => m.kind === "reference" && m.features.includes("Maps"));
  const [maps, setMaps] = useState<MapPage[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [place, setPlace] = useState<Spot | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!books.length) return;
    let live = true;
    loadMaps(books).then((m) => live && setMaps(m));
    return () => {
      live = false;
    };
  }, [books.map((b) => b.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setChosen(null);
    setPlace(null);
  }, [at.book, at.chapter, at.verse]);

  // Maps with a place this verse names first, then this chapter's, then the ones for the book.
  const ranked = useMemo(() => {
    if (!maps) return [];
    const hint = mapHint(at.book);
    const score = (p: MapPage) =>
      p.spots.filter((s) => s.refs.some((r) => names(r, at))).length * 100 +
      p.spots.filter((s) => s.refs.some((r) => r.book === at.book && r.chapter === at.chapter)).length +
      (hint.test(p.title) ? 0.5 : 0);
    return maps
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);
  }, [maps, at.book, at.chapter, at.verse]); // eslint-disable-line react-hooks/exhaustive-deps -- at's fields, not the object made anew each render

  if (!books.length) return <GetMaps onChanged={onChanged} />;
  if (!maps) return <p className="empty">Opening the maps…</p>;

  const list = all ? maps : ranked;
  const page = maps.find((p) => `${p.module}|${p.title}` === chosen) ?? ranked[0] ?? maps[0];
  if (!page) return <p className="empty">The maps book has no maps.</p>;
  const here = page.spots.filter((s) => s.refs.some((r) => names(r, at)));

  return (
    <>
      <div className="chips wrap">
        {list.slice(0, all ? undefined : 3).map((p) => (
          <button
            key={p.module + p.title}
            className={`chip ${p === page ? "on" : ""}`}
            onClick={() => {
              setChosen(`${p.module}|${p.title}`);
              setPlace(null);
            }}
          >
            {p.title.replace(/^\d+\.\s*/, "")}
          </button>
        ))}
        <button className="chip" onClick={() => setAll(!all)}>
          {all ? "Fewer" : `All ${maps.length} maps`}
        </button>
      </div>
      {!ranked.length && !all && <p className="m">No map marks a place in {book(at.book).name}; here's the first.</p>}
      <RingedMap page={page} ring={place ? [place] : here} onTap={() => onOpen(page.src, place ? [place] : here, page.spots)} />
      <p className="m" style={{ margin: "6px 0 12px" }}>
        Tap the map to zoom in, then tap a dot to see its verses.
      </p>
      <p className="label">{here.length ? `Places in ${fmtRef(at)}` : `No place on this map is in ${fmtRef(at)}`}</p>
      {here.length > 0 && (
        <div className="chips wrap" style={{ marginBottom: 12 }}>
          {here.map((s) => (
            <button key={s.name + s.x} className={`chip ${place === s ? "on" : ""}`} onClick={() => setPlace(place === s ? null : s)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {place && (
        <>
          <p className="label">
            {place.name} · {place.refs.length} {place.refs.length === 1 ? "verse" : "verses"}
          </p>
          <div className="prose" style={{ fontSize: 14 }}>
            {place.refs.slice(0, 80).map((r, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <a className="ref" onClick={() => onGo(r)}>
                  {fmtRef(r, "short")}
                </a>
              </span>
            ))}
            {place.refs.length > 80 && <span className="m"> and {place.refs.length - 80} more</span>}
          </div>
        </>
      )}
    </>
  );
}

/** No maps book yet: download it here, without going to the Library. */
function GetMaps({ onChanged }: { onChanged: () => void }) {
  const offer = saved<Offer[]>("offers", []).find((o) => o.kind === "reference" && /\bmaps?\b|atlas/i.test(o.title));
  const [going, setGoing] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const un = listen<{ file: string; done: number; total: number }>("download", (e) => {
      if (offer && e.payload.file === offer.file) setGoing({ done: e.payload.done, total: e.payload.total });
    });
    return () => {
      un.then((f) => f());
    };
  }, [offer?.file]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!offer) return <p className="empty">Maps come from the Library: open it once while online, then come back.</p>;
  const get = () => {
    setErr(null);
    setGoing({ done: 0, total: offer.size });
    api
      .download(downloadsBase() + offer.file + ".gz", offer.file, offer.sha256, offer.size)
      .then(onChanged)
      .catch((e) => {
        setGoing(null);
        setErr(String(e));
      });
  };
  return (
    <div className="card" style={{ marginTop: 4 }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{offer.title}</p>
      <p className="m" style={{ margin: "0 0 12px" }}>
        Maps of the Bible's lands, with the places in each verse marked. {(offer.gz / 1e6).toFixed(0)} MB to download.
      </p>
      {going ? (
        <span className="progress">
          <span style={{ width: `${Math.min(100, (going.done / Math.max(1, going.total)) * 100)}%` }} />
        </span>
      ) : (
        <button className="primary" style={{ width: "100%" }} onClick={get}>
          Download the maps
        </button>
      )}
      {err && (
        <p className="m" style={{ color: "var(--red)", marginTop: 8 }}>
          Couldn't download: {err}
        </p>
      )}
    </div>
  );
}
