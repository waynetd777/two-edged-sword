// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The help drawer: `?`, the top bar's ? button or Help › Two-edged Sword Help (⌘?) opens it on the
// right, on the current screen's section of the guide. Typing searches every guide; links move
// within the help. It stays open while you use the screen beside it; Esc or × closes it.

import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { helpFor, helpHtml, HelpSection, searchHelp, sectionAt, TOPICS } from "./guides";
import { Icon } from "./icons";
import { useApp } from "./state";
import { ClearButton } from "./ui";

/** What the drawer shows: a topic at a section (the screen's when none is named), or a search. */
export type HelpView = { topic?: string; section?: string; q?: string };

let view: HelpView | null = null;
const subs = new Set<() => void>();
const setView = (v: HelpView | null) => {
  view = v;
  subs.forEach((f) => f());
};
const useView = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => view,
  );

export const openHelp = (v: HelpView = {}) => setView(v);
export const toggleHelp = () => setView(view ? null : {});

function HelpText({ md, topic }: { md: string; topic: string }) {
  const html = useMemo(() => helpHtml(md), [md]);
  return (
    <div
      className="help-text"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a[data-href]") as HTMLElement | null;
        if (!a) return;
        e.preventDefault();
        const href = a.dataset.href ?? "";
        if (/^https?:/.test(href)) return void openUrl(href);
        // "guide.md#anchor", "guide.md" or "#anchor" in this guide.
        const m = /^(?:([\w-]+)\.md)?(?:#([\w-]+))?$/.exec(href);
        if (!m) return;
        const to = m[1] ?? topic;
        openHelp({ topic: to, section: m[2] ? sectionAt(to, m[2])?.title : undefined });
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** `scroll` brings it to the top of the drawer: the section a screen or a link opened. */
function Section({ s, topic, open, scroll }: { s: HelpSection; topic: string; open?: boolean; scroll?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (scroll) ref.current?.scrollIntoView({ block: "start" });
  }, [scroll]);
  return (
    <details ref={ref} className="help-sec" open={open}>
      <summary>
        <Icon name="fwd" size={12} className="help-chev" />
        {s.title}
      </summary>
      <HelpText md={s.body} topic={topic} />
    </details>
  );
}

function Results({ q }: { q: string }) {
  const hits = searchHelp(q).slice(0, 30);
  if (!hits.length) return <p className="help-none">Nothing in the help matches “{q}”. Ask can look further.</p>;
  return (
    <>
      {hits.map((h) => (
        <div key={h.topic.id + h.section.title} className="help-hit">
          <button
            type="button"
            className="help-hit-topic"
            title={`Open ${h.topic.title} at this section`}
            onClick={() => openHelp({ topic: h.topic.id, section: h.section.title })}
          >
            {h.topic.title}
          </button>
          <Section s={h.section} topic={h.topic.id} open />
        </div>
      ))}
    </>
  );
}

export function HelpDrawer() {
  const app = useApp();
  const v = useView();
  const [q, setQ] = useState("");

  // `?` outside a text box opens and closes it; Esc closes it. Help › Two-edged Sword Help (⌘?) opens it.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && view && !document.querySelector(".scrim, [role=dialog]")) {
        setView(null);
        return;
      }
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]")) return;
      toggleHelp();
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    const un = listen("help", () => openHelp({}));
    return () => {
      window.removeEventListener("keydown", k);
      void un.then((f) => f());
    };
  }, []);
  useEffect(() => setQ(v?.q ?? ""), [v?.topic, v?.section, v?.q]);

  if (!v) return null;
  const here = helpFor(app.screen, app.doc);
  const topic = TOPICS.find((t) => t.id === (v.topic ?? here.topic)) ?? TOPICS[0];
  const first = v.topic ? v.section : here.section;
  const query = q.trim();

  let body: ReactNode;
  if (query) body = <Results q={query} />;
  else
    body = (
      <>
        {topic.intro && <HelpText md={topic.intro} topic={topic.id} />}
        <div>
          {topic.sections.map((s) => (
            <Section key={`${topic.id}:${s.title}`} s={s} topic={topic.id} open={s.title === first} scroll={s.title === first} />
          ))}
        </div>
        <section className="help-block">
          <span className="lab">All topics</span>
          <div className="help-topics">
            {TOPICS.filter((t) => t.id !== topic.id).map((t) => (
              <button key={t.id} type="button" className="chip" onClick={() => openHelp({ topic: t.id })}>
                {t.title}
              </button>
            ))}
          </div>
        </section>
      </>
    );

  return (
    <aside className="help-drawer" role="complementary" aria-label="Help">
      <div className="help-head">
        {v.topic && (
          <button
            type="button"
            className="ibtn"
            aria-label="Back to this screen's help"
            title="Back to this screen's help"
            onClick={() => openHelp({})}
          >
            <Icon name="back" />
          </button>
        )}
        <h2>
          {topic.title}
          <span className="help-sub"> — help</span>
        </h2>
        <button type="button" className="ibtn" aria-label="Close help" title="Close help (Esc)" onClick={() => setView(null)}>
          <Icon name="x" />
        </button>
      </div>
      <label className="field">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the help" aria-label="Search the help" />
        <ClearButton show={!!q} onClear={() => setQ("")} />
      </label>
      <div className="help-body">{body}</div>
      <div className="help-foot">
        <button
          type="button"
          className="btn"
          title="Ask the assistant how something in Two-edged Sword works"
          onClick={() => {
            if (app.doc) app.closeDoc();
            if (app.screen !== "read") app.go("read");
            app.setPending({ ask: query ? `How do I ${query} in Two-edged Sword?` : "How do I " });
            setView(null);
          }}
        >
          <Icon name="chat" />
          Ask about Two-edged Sword
        </button>
      </div>
    </aside>
  );
}

/** The top bar's ? button. */
export function HelpButton() {
  const open = useView();
  return (
    <button type="button" className={`ibtn${open ? " on" : ""}`} aria-label="Help" title="Help for this screen (?)" onClick={toggleHelp}>
      <Icon name="help" />
    </button>
  );
}
