// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The help drawer: `?`, the top bar's ? button or Help › Two-edged Sword Help (⌘?) opens it on the
// right, on the current screen's section of the guide. Typing searches every guide; links move
// within the help. It stays open while you use the screen beside it; Esc or × closes it.

import { listen } from "@tauri-apps/api/event";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { parseRef } from "./bible";
import { helpFor, helpHtml, HelpSection, searchHelp, sectionAt, TOPICS, Walkthrough, WALKTHROUGHS } from "./guides";
import { useAssistant } from "./assistant";
import { Icon } from "./icons";
import { isMac } from "./keys";
import { Screen, useApp } from "./state";
import { ClearButton, Popover, SearchList } from "./ui";

/** What the drawer shows: a topic at a section (the screen's when none is named), a Getting started
 *  walk-through at a step, or a search. */
type HelpView = { topic?: string; section?: string; guide?: string; step?: number; q?: string };

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

// The drawer's own back and forward: the pages it showed since it opened (topics, sections a link
// opened, a walk-through's steps). Opening it afresh starts a new history.
let past: HelpView[] = [];
let future: HelpView[] = [];
const same = (a: HelpView, b: HelpView) => JSON.stringify(a) === JSON.stringify(b);

export const openHelp = (v: HelpView = {}) => {
  if (!view) past = [];
  else if (!same(view, v)) past.push(view);
  future = [];
  setView(v);
};
const toggleHelp = () => (view ? setView(null) : openHelp({}));
/** Back to the last page; from the first one that isn't the screen's own, back to the screen's. */
const canBack = (v: HelpView) => past.length > 0 || !!(v.topic || v.guide);
const helpBack = () => {
  if (!view) return;
  future.push(view);
  setView(past.pop() ?? {});
};
const helpForward = () => {
  const next = future.pop();
  if (!next || !view) return;
  past.push(view);
  setView(next);
};

/** Scrolls to and flashes [data-help=target] once the screen it's on has drawn. */
function showTarget(target: string, tries = 20) {
  const el = document.querySelector<HTMLElement>(`[data-help="${target}"]`);
  if (!el) {
    if (tries) window.setTimeout(() => showTarget(target, tries - 1), 50);
    return;
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("help-flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("help-flash");
}

const SCREENS: Screen[] = ["read", "compare", "search", "word", "journal", "plans", "library", "history", "settings"];

/** What a guide's `app:` button does: app:library (any screen; app:library#commentaries also brings
 *  the element marked data-help="commentaries" into view and flashes it), app:open/john-3 (a
 *  passage), app:palette (⌘K), app:modules (the modules folder) or app:rescan. The drawer stays open. */
function runAction(app: ReturnType<typeof useApp>, action: string) {
  const [path, target] = action.split("#");
  const [what, arg = ""] = path.split("/");
  if ((SCREENS as string[]).includes(what)) {
    if (app.doc && what === "read") app.closeDoc();
    app.go(what as Screen);
    if (target) showTarget(target);
  } else if (what === "open") {
    const r = parseRef(arg.replace(/-/g, " "));
    if (r) app.open({ book: r.book, chapter: r.chapter, verse: r.verse }, "read");
  } else if (what === "palette") window.dispatchEvent(new Event("open-palette"));
  else if (what === "modules") {
    const d = app.lib?.dirs.find((x) => x.source === "app");
    if (d) revealItemInDir(d.path).catch((e) => app.toast(String(e)));
  } else if (what === "rescan")
    app
      .rescan()
      .then(() => app.toast("Library rescanned"))
      .catch((e) => app.toast(`Couldn't rescan the library: ${e}`));
}

function HelpText({ md, topic }: { md: string; topic: string }) {
  const app = useApp();
  const html = useMemo(() => helpHtml(md), [md]);
  return (
    <div
      className="help-text"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("[data-href]") as HTMLElement | null;
        if (!a) return;
        e.preventDefault();
        const href = a.dataset.href ?? "";
        if (/^https?:/.test(href)) return void openUrl(href);
        if (href.startsWith("app:")) return runAction(app, href.slice(4));
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
    <details
      ref={ref}
      className="help-sec"
      open={open}
      // One section open at a time: opening one closes the others and brings it to the top of the drawer.
      onToggle={(e) => {
        const me = e.currentTarget;
        if (!me.open) return;
        me.parentElement?.querySelectorAll<HTMLDetailsElement>("details.help-sec[open]").forEach((d) => d !== me && (d.open = false));
        requestAnimationFrame(() => me.scrollIntoView({ block: "start", behavior: "smooth" }));
      }}
    >
      <summary>
        <Icon name="fwd" size={12} className="help-chev" />
        {s.title}
      </summary>
      <HelpText md={s.body} topic={topic} />
    </details>
  );
}

/** The Getting started walk-throughs, each with its number of steps or a Done mark. */
function GuideList() {
  const app = useApp();
  return (
    <section className="help-block">
      <span className="lab">Getting started</span>
      <div className="help-guides">
        {WALKTHROUGHS.map((g) => (
          <button
            key={g.id}
            type="button"
            className="help-guide"
            title={`Walk through “${g.title}”, a step at a time`}
            onClick={() => openHelp({ guide: g.id, step: 0 })}
          >
            <span className="help-guide-t">{g.title}</span>
            {app.settings.guidesDone[g.id] ? (
              <span className="help-done">
                <Icon name="check" size={12} />
                Done
              </span>
            ) : (
              <span className="n">{g.steps.length} steps</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

/** A walk-through, one step at a time: Back, Next, and Done on the last, which marks it finished. */
function GuideSteps({ g, step }: { g: Walkthrough; step: number }) {
  const app = useApp();
  const n = g.steps.length;
  const at = Math.min(Math.max(step, 0), n - 1);
  const s = g.steps[at];
  const last = at === n - 1;
  return (
    <div className="help-guidebox">
      {at === 0 && g.summary && <HelpText md={g.summary} topic="getting-started" />}
      <span className="n">
        Step {at + 1} of {n}
      </span>
      <h3 className="help-steptitle">{s.title}</h3>
      <HelpText md={s.body} topic="getting-started" />
      <div className="help-steps">
        {/* A disabled button shows no tooltip, so the span carries it. */}
        <span title={at === 0 ? "This is the first step" : "Go back a step"}>
          <button type="button" className="btn" disabled={at === 0} onClick={() => openHelp({ guide: g.id, step: at - 1 })}>
            Back
          </button>
        </span>
        <span className="help-dots" aria-hidden="true">
          {g.steps.map((x, i) => (
            <i key={x.title} className={i === at ? "on" : i < at ? "past" : ""} />
          ))}
        </span>
        <button
          type="button"
          className="btn primary"
          title={last ? "Finish this walk-through and mark it done" : "Go to the next step"}
          onClick={() => {
            if (!last) return openHelp({ guide: g.id, step: at + 1 });
            app.set({ guidesDone: { ...app.settings.guidesDone, [g.id]: true } });
            openHelp({ topic: "getting-started" });
          }}
        >
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
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
  const [topics, setTopics] = useState<DOMRect | null>(null);
  const canAsk = useAssistant().available;

  // `?` outside a text box opens and closes it; Esc closes it. Help › Two-edged Sword Help (⌘?) opens it.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // An Esc something else has used (the ⌘K palette, a search box, focus mode) isn't for the help.
      if (e.key === "Escape" && view && !e.defaultPrevented && !document.querySelector(".scrim, [role=dialog]")) {
        e.preventDefault();
        setView(null);
        return;
      }
      // Windows has no Help menu: Ctrl+? opens it as ⌘? does there, from a text box too.
      if (!isMac && e.ctrlKey && !e.altKey && (e.key === "?" || (e.shiftKey && e.code === "Slash"))) {
        openHelp({});
        e.preventDefault();
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
  useEffect(() => setQ(v?.q ?? ""), [v?.topic, v?.section, v?.guide, v?.step, v?.q]);

  if (!v) return null;
  const here = helpFor(app.screen, app.doc);
  const guide = v.guide ? WALKTHROUGHS.find((g) => g.id === v.guide) : undefined;
  const topic = TOPICS.find((t) => t.id === (v.topic ?? here.topic)) ?? TOPICS[0];
  const first = v.topic ? v.section : here.section;
  const query = q.trim();

  let body: ReactNode;
  if (query) body = <Results q={query} />;
  else if (guide) body = <GuideSteps g={guide} step={v.step ?? 0} />;
  else if (topic.id === "getting-started")
    body = (
      <>
        {topic.intro && <HelpText md={topic.intro} topic={topic.id} />}
        <GuideList />
      </>
    );
  else
    body = (
      <>
        {topic.intro && <HelpText md={topic.intro} topic={topic.id} />}
        <div>
          {topic.sections.map((s) => (
            <Section key={`${topic.id}:${s.title}`} s={s} topic={topic.id} open={s.title === first} scroll={s.title === first} />
          ))}
        </div>
        <GuideList />
      </>
    );

  return (
    <aside className="help-drawer" role="complementary" aria-label="Help">
      <div className="help-head">
        <span title={canBack(v) ? "Back to the help page you were on" : "Nothing to go back to"}>
          <button type="button" className="ibtn" aria-label="Back" disabled={!canBack(v)} onClick={helpBack}>
            <Icon name="back" />
          </button>
        </span>
        <span title={future.length ? "Forward to the help page you went back from" : "Nothing to go forward to"}>
          <button type="button" className="ibtn" aria-label="Forward" disabled={!future.length} onClick={helpForward}>
            <Icon name="fwd" />
          </button>
        </span>
        <h2>
          {guide ? guide.title : topic.title}
          <span className="help-sub"> — {guide ? "getting started" : "help"}</span>
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
      <div className="help-nav">
        <button
          type="button"
          className="btn small"
          title="Step-by-step walk-throughs of everything the app does"
          onClick={() => openHelp({ topic: "getting-started" })}
        >
          Getting started
        </button>
        <button
          type="button"
          className="btn small"
          title="Choose a guide to read"
          onClick={(e) => setTopics(e.currentTarget.getBoundingClientRect())}
        >
          All topics
          <Icon name="down" size={12} />
        </button>
      </div>
      {topics && (
        <Popover anchor={topics} onClose={() => setTopics(null)} width={280} style={{ padding: 0, overflow: "hidden" }}>
          <SearchList
            placeholder="Find a topic"
            current={guide ? "getting-started" : topic.id}
            onClose={() => setTopics(null)}
            onPick={(id) => {
              setTopics(null);
              openHelp({ topic: id });
            }}
            items={TOPICS.map((t) => ({ key: t.id, label: t.title }))}
          />
        </Popover>
      )}
      <div className="help-body">{body}</div>
      {canAsk && (
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
      )}
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
