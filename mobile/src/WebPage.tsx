// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// An online devotional on the phone, as on the desktop (src/WebPage.tsx): the site's page framed under
// the app's own bar, and frame.js (the desktop's, run in every frame of the phone's web view too) doing
// in the page what the app can't reach in to do. In the dark theme the page is inverted and its pictures
// inverted back, unless the moon turns that off for the site. Listen, then a tap on the page, reads it
// aloud from there, the word being read marked as in the reader. A site that won't be shown inside the
// app opens in a full-screen view of its own (the tes-native plugin's open_web) instead.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { player, usePlayer } from "./player";
import { inverts, useWeb, webStore } from "./webStore";
import type { OnlineDevotional } from "./plansShared";

/** The page open, if one is: which devotional, its address today, and (from Quiet time with audio) what
 *  to do once it's been read, the page then reading by itself from where its reading starts. */
interface Open {
  site: OnlineDevotional;
  url: string;
  onRead?: () => void;
  /** Quiet time's, when it closes the page (Done, or Back). */
  onClose?: () => void;
}
let open: Open | null = null;
const watchers = new Set<() => void>();
const put = (o: Open | null) => {
  open = o;
  watchers.forEach((w) => w());
};
const useOpen = () =>
  useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => open,
  );

/** Whether the phone is showing the dark theme now (Settings' choice, or the phone's own). */
export function isDark(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Opens an online devotional for today: framed in the app, or for a site that won't be, in a view of
 *  its own (where it can't be read aloud: `onRead` then waits for Next). */
export function openWebDevotional(site: OnlineDevotional, day: Date, opts: { onRead?: () => void; onClose?: () => void } = {}) {
  const url = site.url(day);
  if (site.window) {
    const dark = isDark();
    invoke("plugin:tes-native|open_web", { url, title: site.title, dark: dark && inverts(webStore.get(), site.id), black: dark }).catch(
      () => {},
    );
    return;
  }
  put({ site, url, ...opts });
}
export const closeWebDevotional = () => put(null);

/** A colour of the app's as [r, g, b, a]. */
function rgba(v: string): number[] {
  const el = document.createElement("span");
  el.style.color = v;
  document.body.appendChild(el);
  const c = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).map(Number);
  el.remove();
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1];
}
/** The colour that comes out as `c` through the page's invert(1) hue-rotate(180deg) (as the desktop's). */
function throughInvert([r, g, b, a]: number[]): string {
  const [x, y, z] = [255 - r, 255 - g, 255 - b];
  const k = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return `rgba(${k(-0.574 * x + 1.43 * y + 0.144 * z)}, ${k(0.426 * x + 0.43 * y + 0.144 * z)}, ${k(0.426 * x + 1.43 * y - 0.856 * z)}, ${a})`;
}
/** The reader's colours for the word and paragraph being read, for frame.js to use in the page. */
function readingColors(invert: boolean, dark: boolean) {
  const css = getComputedStyle(document.documentElement);
  const c = (name: string) => {
    const v = rgba(css.getPropertyValue(name).trim());
    return invert ? throughInvert(v) : `rgba(${v.join(", ")})`;
  };
  return { word: c("--hl-blue"), line: c("--accent"), para: c("--accentsoft"), blend: dark && !invert ? "screen" : "multiply" };
}

// What the page (another site's) may send: its paragraphs to read, a list of text within bounds. They
// come escaped for HTML (the desktop reads them as such), so are unescaped to be said.
const unescape = (t: string) => t.replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const pickedParas = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= 5000 && v.every((p) => typeof p === "string" && p.length <= 50000) ? (v as string[]).map(unescape) : null;

/** Over everything while it's open. */
export function WebPageHost() {
  const o = useOpen();
  return o ? <WebPage key={o.url} o={o} /> : null;
}

function WebPage({ o }: { o: Open }) {
  const web = useWeb();
  const ps = usePlayer();
  const { site, url } = o;
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const q = matchMedia("(prefers-color-scheme: dark)");
    const f = () => setDark(isDark());
    q.addEventListener("change", f);
    const m = new MutationObserver(f);
    m.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      q.removeEventListener("change", f);
      m.disconnect();
    };
  }, []);
  const invert = dark && inverts(web, site.id);
  const zoom = web.zoom[site.id] ?? 1;
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sizing, setSizing] = useState(false);
  // Quiet time with audio: read by itself, from where the site's reading starts, once.
  const auto = useRef(o.onRead && site.start ? o.onRead : null);
  const frame = useRef<HTMLIFrameElement>(null);
  const post = (m: object) => frame.current?.contentWindow?.postMessage({ tes: true, ...m }, "*");
  const reading = ps.on && !!ps.doc?.web && ps.doc.module === site.id;
  const follow = site.follow && { from: url, href: site.follow };
  useEffect(() => {
    const t = window.setTimeout(() => setLoaded(true), 20000);
    return () => window.clearTimeout(t);
  }, [reload]);
  useEffect(() => post({ pick: picking }), [picking]);
  useEffect(() => post({ zoom }), [zoom]);
  useEffect(() => post({ colors: readingColors(invert, dark), invert }), [invert, dark]);
  useEffect(() => {
    if (reading) post({ para: ps.verse - 1, char: ps.at, word: true });
    else post({ stop: true });
  }, [reading, ps.verse, ps.at]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (e.source !== frame.current?.contentWindow || !m || m.tes !== true) return;
      if (m.picked) {
        setPicking(false);
        const next = m.auto ? auto.current : null;
        if (m.auto && !next) return;
        auto.current = null;
        const paras = pickedParas(m.picked);
        if (paras?.length) player.playWeb({ module: site.id, title: site.title }, paras, next ?? undefined);
        else next?.();
      } else if (m.cancel) {
        setPicking(false);
        if (m.auto && auto.current) {
          // Where its reading starts wasn't found: Next goes on, as for a page that isn't read.
          auto.current = null;
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [site.id, site.title]);
  const close = () => {
    if (reading) player.stop();
    closeWebDevotional();
    o.onClose?.();
  };
  const listen = () => {
    if (reading) return ps.paused ? player.resume() : player.pause();
    setPicking(!picking);
  };

  return (
    <div className="webpage" role="dialog" aria-label={site.title}>
      <header className="topbar">
        <button className="ibtn" aria-label="Back" onClick={close}>
          <Icon name="back" />
        </button>
        <h1 className="bartitle">{site.title}</h1>
        <button className={`ibtn ${picking || reading ? "on" : ""}`} aria-label="Listen" aria-pressed={picking || reading} onClick={listen}>
          <Icon name={reading && !ps.paused ? "pause" : "speaker"} />
        </button>
        <button className={`ibtn ${sizing ? "on" : ""}`} aria-label="Text size" aria-pressed={sizing} onClick={() => setSizing(!sizing)}>
          <Icon name="textsize" />
        </button>
        {dark && (
          <button
            className={`ibtn ${invert ? "on" : ""}`}
            aria-label="Dark page"
            aria-pressed={invert}
            onClick={() => webStore.setInvert(site.id, !inverts(web, site.id))}
          >
            <Icon name="moon" />
          </button>
        )}
        <button
          className="ibtn"
          aria-label="Reload"
          onClick={() => {
            setLoaded(false);
            setReload((n) => n + 1);
          }}
        >
          <Icon name="refresh" />
        </button>
      </header>
      {picking && <div className="webpage-hint">Tap where you want the reading to start</div>}
      {sizing && (
        <div className="webpage-size" role="group" aria-label="Text size">
          <button className="secondary" onClick={() => webStore.setZoom(site.id, Math.max(0.6, Math.round((zoom - 0.1) * 10) / 10))}>
            A−
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="secondary" onClick={() => webStore.setZoom(site.id, Math.min(2.5, Math.round((zoom + 0.1) * 10) / 10))}>
            A+
          </button>
        </div>
      )}
      <div className="webpage-frame">
        <iframe
          ref={frame}
          key={`${url}#${reload}`}
          src={url}
          title={site.title}
          // Scripts (and frame.js) run and the site keeps its own origin, but it can't take the app's window elsewhere.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => {
            setLoaded(true);
            post({
              zoom,
              pick: picking,
              colors: readingColors(invert, dark),
              invert,
              follow,
              still: !!site.still,
              ...(auto.current && site.start ? { start: site.start } : {}),
            });
          }}
          style={{ filter: invert ? "invert(1) hue-rotate(180deg)" : undefined }}
        />
        {!loaded && (
          <div className="webpage-loading" role="status" style={{ background: dark ? "#000" : "var(--bg)" }}>
            <span className="spin" />
            <span>Loading {site.title}…</span>
          </div>
        )}
      </div>
    </div>
  );
}
