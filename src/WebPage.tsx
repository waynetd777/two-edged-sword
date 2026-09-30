// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// An online devotional's page in the reading column, framed under its heading, so Quiet time's bar
// and the rest of the app stay in view. In the dark theme the page is inverted, pictures included
// (a page from another site can't be reached into, as its own window's can), unless its moon
// button (shown only then, here and in the plan's devotionals list) turns that off for that site. Open in window shows it in a window of its own instead,
// dark without inverting its pictures.

import { useEffect, useState } from "react";
import { api } from "./api";
import { fmtRef } from "./bible";
import { Icon } from "./icons";
import { Topbar } from "./Shell";
import { Settings, useApp } from "./state";

const isDark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/** Whether an online devotional's page is inverted to look dark, in the dark theme. */
export const inverts = (settings: Settings, id: string) => settings.webInvert[id] ?? true;

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
export function useDark(): boolean {
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, setFocus]);

  const invert = dark && inverts(app.settings, doc.module);
  const openWindow = () => api.openWeb(doc.module, url, doc.title, inverts(app.settings, doc.module)).catch((e) => app.toast(String(e)));
  const tools = (
    <div style={{ display: "flex", gap: 2 }}>
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
      {focus ? (
        <header className="topbar drag" style={{ borderBottom: 0, paddingLeft: 84 }}>
          <div className="spacer" />
          {tools}
          <button className="btn" type="button" onClick={() => setFocus(false)}>
            Exit focus<span className="kbd">esc</span>
          </button>
        </header>
      ) : (
        <Topbar right={tools}>
          <button className="btn" type="button" title="Back to the Bible" onClick={app.closeDoc}>
            <Icon name="read" />
            {fmtRef(app.loc)}
          </button>
        </Topbar>
      )}
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
            key={`${url}#${reload}`}
            src={url}
            title={doc.title}
            onLoad={() => setLoaded(`${url}#${reload}`)}
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
