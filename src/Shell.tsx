// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { ReactNode, useState } from "react";
import { fmtRef, isApocrypha } from "./bible";
import { HelpButton } from "./Help";
import { Icon, Wordmark } from "./icons";
import { Screen, useApp } from "./state";
import { todayReading } from "./plans";
import { useRefPreview } from "./StudyPane";
import { confirmDelete, Popover, SearchList } from "./ui";

const NAV: { s: Screen; label: string; icon: string; key: string; tip: string }[] = [
  { s: "read", label: "Read", icon: "read", key: "1", tip: "Read the Bible beside the study pane" },
  { s: "compare", label: "Compare", icon: "compare", key: "2", tip: "Translations side by side" },
  { s: "search", label: "Search", icon: "search", key: "3", tip: "Search the Bible, commentaries, dictionaries and journal" },
  { s: "word", label: "Word Study", icon: "word", key: "4", tip: "A Greek or Hebrew word: its meaning and every use" },
  { s: "journal", label: "Journal", icon: "journal", key: "5", tip: "Your journal, linked to the verses" },
  { s: "plans", label: "Quiet time", icon: "plans", key: "6", tip: "Reading plans and devotionals for today" },
  { s: "library", label: "Library", icon: "library", key: "7", tip: "Your modules and their order" },
  {
    s: "history",
    label: "KJV History",
    icon: "lineage",
    key: "8",
    tip: "Where the King James Version came from, and which of its sources you have",
  },
];
export const SCREEN_KEYS = NAV.map((n) => n.s);

function ago(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short" });
}

export function Sidebar() {
  const app = useApp();
  const today = todayReading(app);
  const { onRefHover, onDocHover, preview, hide } = useRefPreview(app.settings.bible, "right");
  const leave = () => onRefHover(null, null);
  // Each list shows its newest SHOWN; "Show all" opens the rest in place.
  const SHOWN = 8;
  const [allBookmarks, setAllBookmarks] = useState(false);
  const [allRecent, setAllRecent] = useState(false);
  // The × a row shows on hover, in place of its date or Bible. A span, since the row is a button.
  const remove = (label: string, go: () => void) => (
    <span
      role="button"
      tabIndex={0}
      className="x"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        hide();
        go();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          go();
        }
      }}
    >
      <Icon name="x" size={12} />
    </span>
  );
  const more = (n: number, open: boolean, toggle: () => void) =>
    n > SHOWN && (
      <button type="button" className="bm more" onClick={toggle}>
        {open ? "Show fewer" : `Show all (${n})`}
      </button>
    );
  return (
    <aside className="sidebar drag">
      <div className="brand">
        <Wordmark />
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Screens">
        {NAV.map((n) => (
          <button key={n.s} type="button" className={`nav ${app.screen === n.s ? "on" : ""}`} title={n.tip} onClick={() => app.go(n.s)}>
            <Icon name={n.icon} />
            {n.label}
            <span className="k">⌘{n.key}</span>
          </button>
        ))}
      </nav>
      {app.bookmarks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="lab" style={{ paddingBottom: 2 }}>
            Bookmarks
          </div>
          {app.bookmarks.slice(0, allBookmarks ? undefined : SHOWN).map((b) =>
            b.doc ? (
              // A paragraph of a book: the books icon, the chapter and paragraph; the paragraph previewed on hover.
              <button
                key={b.id}
                type="button"
                className="bm"
                onMouseEnter={(e) =>
                  onDocHover({ ...b.doc!, book: app.mod(b.doc!.kind ?? "reference", b.doc!.module)?.title }, e.currentTarget)
                }
                onMouseLeave={() => onDocHover(null, null)}
                onClick={() => {
                  hide();
                  app.openDoc(b.doc!.module, b.doc!.title, b.doc!.kind, b.doc!.para);
                }}
              >
                <Icon name="bookmark" style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span className="t">{b.doc.title}</span>
                <span className="r">¶{b.doc.para}</span>
                {remove("Remove bookmark", () => app.removeBookmark(b.id))}
              </button>
            ) : (
              <button
                key={b.id}
                type="button"
                className="bm"
                onMouseEnter={(e) => onRefHover(b.ref, e.currentTarget, b.bible)}
                onMouseLeave={leave}
                onClick={() => {
                  hide();
                  app.open({ book: b.ref.book, chapter: b.ref.chapter, verse: b.ref.verse, to: b.ref.to }, "read");
                }}
              >
                <Icon name="bookmark" style={{ color: "var(--accent)" }} />
                <span className="t">{fmtRef(b.ref)}</span>
                <span className="r">{app.mod("bible", b.bible)?.abbrev ?? ""}</span>
                {remove("Remove bookmark", () => app.removeBookmark(b.id))}
              </button>
            ),
          )}
          {more(app.bookmarks.length, allBookmarks, () => setAllBookmarks(!allBookmarks))}
        </div>
      )}
      {app.recent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="lab" style={{ paddingBottom: 2, display: "flex", alignItems: "center" }}>
            Recent
            <button
              type="button"
              className="labbtn"
              title="Clear the Recent list"
              onClick={async () => {
                if (await confirmDelete("the Recent list", "Your bookmarks and reading aren't affected.")) app.clearRecent();
              }}
            >
              Clear
            </button>
          </div>
          {app.recent.slice(0, allRecent ? undefined : SHOWN).map((r) =>
            r.doc ? (
              // A book's or devotional's chapter: a book icon and its title, previewed on hover like a passage.
              <button
                key={`${r.doc.module}|${r.doc.title}`}
                type="button"
                className="bm"
                onMouseEnter={(e) =>
                  onDocHover({ ...r.doc!, book: app.mod(r.doc!.kind ?? "reference", r.doc!.module)?.title }, e.currentTarget)
                }
                onMouseLeave={() => onDocHover(null, null)}
                onClick={() => {
                  hide();
                  app.openDoc(r.doc!.module, r.doc!.title, r.doc!.kind);
                }}
              >
                <Icon name="library" size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
                <span className="t">{r.doc.title}</span>
                <span className="r">{ago(r.at)}</span>
                {remove("Remove from Recent", () => app.removeRecent(r))}
              </button>
            ) : (
              <button
                key={`${r.book}.${r.chapter}`}
                type="button"
                className="bm"
                onMouseEnter={(e) => onRefHover({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, e.currentTarget)}
                onMouseLeave={leave}
                onClick={() => {
                  hide();
                  app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read");
                }}
              >
                <Icon name="bible" size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
                <span className="t">{fmtRef(r)}</span>
                <span className="r">{ago(r.at)}</span>
                {remove("Remove from Recent", () => app.removeRecent(r))}
              </button>
            ),
          )}
          {more(app.recent.length, allRecent, () => setAllRecent(!allRecent))}
        </div>
      )}
      <div style={{ marginTop: "auto" }}>
        {today ? (
          <button type="button" className="today" title="Today's readings in Quiet time" onClick={() => app.go("plans")}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: "100%" }}>
              <span className="lab" style={{ padding: 0 }}>
                Today
              </span>
              <span className="n">{today.progress}</span>
            </span>
            <span style={{ font: "600 15px/1.25 var(--display)" }}>{today.label}</span>
            <span style={{ height: 4, borderRadius: 999, background: "var(--border)", width: "100%" }}>
              <span style={{ display: "block", width: `${today.pct}%`, height: 4, borderRadius: 999, background: "var(--accent)" }} />
            </span>
          </button>
        ) : (
          <button type="button" className="today" title="Today's readings in Quiet time" onClick={() => app.go("plans")}>
            <span className="lab" style={{ padding: 0 }}>
              Quiet time
            </span>
            <span style={{ fontSize: 12 }}>Choose a plan…</span>
          </button>
        )}
        <button
          type="button"
          className={`nav ${app.screen === "settings" ? "on" : ""}`}
          style={{ marginTop: 8 }}
          title="Theme, reading, voice and the AI assistant"
          onClick={() => app.go("settings")}
        >
          <Icon name="settings" />
          Settings<span className="k">⌘,</span>
        </button>
      </div>
      {preview}
    </aside>
  );
}

/** The 52px bar at the top of every screen: history, reference and Bible pickers, search, tools, help. */
export function Topbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  const app = useApp();
  return (
    <header className="topbar drag">
      <button className="ibtn" type="button" aria-label="Back" title="Back (⌘[)" disabled={!app.canBack} onClick={app.back}>
        <Icon name="back" />
      </button>
      <button className="ibtn" type="button" aria-label="Forward" title="Forward (⌘])" disabled={!app.canForward} onClick={app.forward}>
        <Icon name="fwd" />
      </button>
      {children}
      <div className="spacer" />
      {right}
      <HelpButton />
    </header>
  );
}

export function RefButton({ onClick }: { onClick: () => void }) {
  const { loc } = useApp();
  const r = { book: loc.book, chapter: loc.chapter, verse: loc.verse, to: loc.to };
  const apo = isApocrypha(loc.book, loc.chapter);
  return (
    <button
      className={`btn ${apo ? "apo" : ""}`}
      type="button"
      style={{ fontWeight: 600 }}
      title={apo ? "Apocrypha · Go to a book, chapter or verse" : "Go to a book, chapter or verse"}
      onClick={onClick}
    >
      {fmtRef(r)}
      <Icon name="down" className="sm" style={{ color: "var(--muted)" }} />
    </button>
  );
}

/** The Bible picker: a button that opens a searchable list. `titled` shows the Bible's title rather
 *  than its abbreviation; `all` lists the Bibles hidden from the picker too (for settings). */
export function BibleSelect({
  value,
  onChange,
  style,
  titled,
  all,
}: {
  value: string;
  onChange: (id: string) => void;
  style?: React.CSSProperties;
  titled?: boolean;
  all?: boolean;
}) {
  const app = useApp();
  const [a, setA] = useState<DOMRect | null>(null);
  const list = app.bibles.filter((b) => all || !app.settings.hiddenBibles.includes(b.id) || b.id === value);
  const m = app.mod("bible", value);
  return (
    <>
      <button
        className="btn"
        type="button"
        aria-label="Bible"
        style={style}
        title={app.mod("bible", value)?.title}
        onClick={(e) => setA(e.currentTarget.getBoundingClientRect())}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <Icon name="bible" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(titled ? m?.title : m?.abbrev) ?? value}
          </span>
        </span>
        <Icon name="down" className="sm" style={{ color: "var(--muted)" }} />
      </button>
      {a && (
        <Popover anchor={a} onClose={() => setA(null)} width={380} style={{ padding: 0, overflow: "hidden" }}>
          <SearchList
            placeholder="Find a Bible"
            current={value}
            onClose={() => setA(null)}
            onPick={(id) => {
              setA(null);
              onChange(id);
            }}
            items={list.map((b) => ({ key: b.id, label: b.abbrev, sub: b.title, title: b.title, terms: b.id }))}
          />
        </Popover>
      )}
    </>
  );
}

export function SearchField({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="field"
      style={{ marginLeft: 16, flexGrow: 1, maxWidth: 420, cursor: "text", textAlign: "left" }}
      onClick={onOpen}
    >
      <Icon name="search" />
      <span style={{ flexGrow: 1, color: "var(--muted)" }}>Search, or type a reference like rom 8 28</span>
      <span className="kbd">⌘K</span>
    </button>
  );
}
