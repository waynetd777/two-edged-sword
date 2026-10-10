// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// An online devotional's page in the reading column, framed under its heading, so Quiet time's bar
// and the rest of the app stay in view. In the dark theme the page is inverted, and frame.js, run in
// the page, inverts its pictures back; unless its moon button (shown only then, here and in the
// plan's devotionals list) turns that off for that site. Open in window shows it in a window of its
// own instead.

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { isDark } from "./dom";
import { Icon } from "./icons";
import { onlineDevotionals } from "./plans";
import { ReadingColumnTopbar, useEscExitsFocus } from "./ReadingColumn";
import { useListenKey, usePlayer } from "./speech";
import { Settings, useApp } from "./state";

/** Quiet time with audio: the online devotional to read aloud by itself once its page is ready
 *  (where it starts is known: OnlineDevotional.start), and what to do when it's read. */
let autoRead: { id: string; onEnd: () => void } | null = null;
export function readWhenReady(id: string, onEnd: () => void) {
  autoRead = { id, onEnd };
  window.dispatchEvent(new Event("tes-autoread"));
}
export const cancelAutoRead = () => {
  autoRead = null;
};

/** Whether an online devotional's page is inverted to look dark, in the dark theme. */
export const inverts = (settings: Settings, id: string) => settings.webInvert[id] ?? true;

/** A colour of the app's as [r, g, b, a]. */
function rgba(v: string): number[] {
  const el = document.createElement("span");
  el.style.color = v;
  document.body.appendChild(el);
  const c = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).map(Number);
  el.remove();
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1];
}

/** The colour that comes out as `c` through the page's invert(1) hue-rotate(180deg): the filter
 *  undoes itself, so it is the filter applied to `c`. */
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
  // Blended so the word shows through the box: a light page darkens under it, a dark one lightens.
  return { word: c("--hl-blue"), line: c("--accent"), para: c("--accentsoft"), blend: dark && !invert ? "screen" : "multiply" };
}

/** Whether this devotional's page is inverted in the dark theme: shown only then, as that's the
 *  only time it matters. In the devotionals list, and over the page itself. */
export function InvertButton({ id }: { id: string }) {
  const app = useApp();
  const dark = useDark();
  if (!dark) return null;
  const on = inverts(app.settings, id);
  return (
    <button
      className={`ibtn ${on ? "on" : ""}`}
      type="button"
      aria-label="Dark page"
      aria-pressed={on}
      title={
        on ? "Inverted to look dark: click to show the page as the site made it" : "As the site made it: click to invert it to look dark"
      }
      onClick={() => app.set({ webInvert: { ...app.settings.webInvert, [id]: !on } })}
    >
      <Icon name="moon" />
    </button>
  );
}

/** Whether the app is showing its dark theme, kept up to date. */
function useDark(): boolean {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const check = () => setDark(isDark());
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", check);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", check);
    };
  }, []);
  return dark;
}

export function WebPage({ focus, setFocus }: { focus: boolean; setFocus: (f: boolean) => void }) {
  const app = useApp();
  const doc = app.doc!;
  const url = doc.url ?? "";
  const [reload, setReload] = useState(0);
  // Which load has finished (address and reload), so a new one shows the spinner again; given up on
  // after 20 seconds, in case a page never says it has loaded.
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    const k = `${url}#${reload}`;
    const t = window.setTimeout(() => setLoaded(k), 20000);
    return () => window.clearTimeout(t);
  }, [url, reload]);
  const dark = useDark();
  const player = usePlayer();
  const ps = player.state;
  // Read aloud: the button is pressed, then a click on the page says where to start (frame.js,
  // run in the page, posts back its paragraphs from there on). Escape lets go of the button.
  const [picking, setPicking] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const post = (m: object) => frame.current?.contentWindow?.postMessage({ tes: true, ...m }, "*");
  const reading = ps.on && ps.doc?.module === doc.module && !!ps.doc.url;
  const zoom = app.settings.webZoom[doc.module] ?? 1;
  const site = onlineDevotionals(app.settings.webDevotionals).find((o) => o.id === doc.module);
  const follow = site?.follow && { from: url, href: site.follow };
  // Asked to read by itself (Quiet time): the page is told where to start, now if it's ready,
  // or when it has loaded (after following a link to the day's page).
  const start = () => (autoRead?.id === doc.module && site?.start ? site.start : undefined);
  useEffect(() => {
    const ask = () => {
      const at = start();
      if (at) post({ start: at, follow });
    };
    window.addEventListener("tes-autoread", ask);
    return () => window.removeEventListener("tes-autoread", ask);
  });
  const invert = dark && inverts(app.settings, doc.module);
  const listen = () => {
    if (reading) return player.toggle();
    if (!picking) app.toast("Click where you want the reading to start");
    setPicking(!picking);
  };
  useListenKey(listen);
  useEffect(() => post({ pick: picking }), [picking]);
  useEffect(() => post({ zoom }), [zoom]);
  useEffect(() => post({ colors: readingColors(invert, dark), invert }), [invert, dark]);
  useEffect(() => {
    if (reading) post({ para: ps.verse - 1, char: ps.char, word: app.settings.highlightWords });
    else post({ stop: true });
  }, [reading, ps.verse, ps.char, app.settings.highlightWords]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (e.source !== frame.current?.contentWindow || !m || m.tes !== true) return;
      if (m.picked) {
        setPicking(false);
        const auto = m.auto && autoRead?.id === doc.module ? autoRead : null;
        if (m.auto && !auto) return;
        autoRead = null;
        if (Array.isArray(m.picked) && m.picked.length)
          player.playDoc(doc.module, doc.title, m.picked.map(String), 0, "devotional", { url, onEnd: auto?.onEnd });
      } else if (m.cancel) {
        setPicking(false);
        if (m.auto) autoRead = null;
      } else if (m.key) {
        // A key pressed in the page: the app's shortcuts work there too.
        if (m.key.key === "Escape" && picking) setPicking(false);
        else window.dispatchEvent(new KeyboardEvent("keydown", { ...m.key, bubbles: true, cancelable: true }));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [picking, doc.module, doc.title, url, player]);
  useEffect(() => setPicking(false), [url]);
  // Esc lets go of Listen first, then leaves focus mode.
  useEscExitsFocus(focus, setFocus, () => {
    if (!picking) return false;
    setPicking(false);
    return true;
  });

  const openWindow = () => api.openWeb(doc.module, url, doc.title, inverts(app.settings, doc.module)).catch((e) => app.toast(String(e)));
  const tools = (
    <div style={{ display: "flex", gap: 2 }}>
      <button
        className={`ibtn ${picking || reading ? "on" : ""}`}
        type="button"
        aria-label="Listen"
        aria-pressed={picking || reading}
        title={
          reading
            ? "Pause or carry on reading (Space · ⌘P)"
            : picking
              ? "Click the page where reading should start · esc to cancel"
              : "Listen: then click the page where reading should start (⌘P)"
        }
        onClick={listen}
      >
        <Icon name="speaker" />
      </button>
      <InvertButton id={doc.module} />
      <button className="ibtn" type="button" aria-label="Reload" title="Reload the page" onClick={() => setReload((n) => n + 1)}>
        <Icon name="refresh" />
      </button>
      <button className="ibtn" type="button" aria-label="Open in window" title="Open in a window of its own" onClick={openWindow}>
        <Icon name="export" />
      </button>
      {!focus && (
        <button className="ibtn" type="button" aria-label="Focus mode" title="Focus mode (⌘.)" onClick={() => setFocus(true)}>
          <Icon name="focus" />
        </button>
      )}
    </div>
  );

  return (
    <div className="main" style={{ minHeight: 0 }}>
      <ReadingColumnTopbar focus={focus} setFocus={setFocus} tools={tools} />
      <div
        style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, padding: focus ? "0 10% 0" : "0 40px 0 36px" }}
      >
        <div style={{ padding: "18px 0 14px" }}>
          <div className="label">Online devotional</div>
          <h1 data-quiet-anchor style={{ margin: "6px 0 0", font: "500 30px/1.15 var(--display)" }}>
            {doc.title}
          </h1>
        </div>
        {/* Until the page has loaded, a spinner over it: on black in the dark theme, where a site's
            white page coming in would glare. */}
        <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", borderTop: "1px solid var(--border)" }}>
          <iframe
            ref={frame}
            key={`${url}#${reload}`}
            src={url}
            title={doc.title}
            onLoad={() => {
              setLoaded(`${url}#${reload}`);
              post({ zoom, pick: picking, colors: readingColors(invert, dark), invert, follow, start: start() });
            }}
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              width: "100%",
              border: 0,
              background: "#fff",
              filter: invert ? "invert(1) hue-rotate(180deg)" : undefined,
            }}
          />
          {loaded !== `${url}#${reload}` && (
            <div
              role="status"
              aria-label={`Loading ${doc.title}`}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                background: dark ? "#000" : "var(--bg)",
              }}
            >
              <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <span className="n">Loading {doc.title}…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
