import { ReactNode } from "react";
import { BOOKS, book, fmtRef } from "./bible";
import { Icon, Sword } from "./icons";
import { Screen, useApp } from "./state";
import { todayReading } from "./plans";
import { useRefPreview } from "./StudyPane";

const NAV: { s: Screen; label: string; icon: string; key: string }[] = [
  { s: "read", label: "Read", icon: "read", key: "1" },
  { s: "compare", label: "Compare", icon: "compare", key: "2" },
  { s: "search", label: "Search", icon: "search", key: "3" },
  { s: "word", label: "Word Study", icon: "word", key: "4" },
  { s: "journal", label: "Journal", icon: "journal", key: "5" },
  { s: "plans", label: "Plans", icon: "plans", key: "6" },
  { s: "library", label: "Library", icon: "library", key: "7" },
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
  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible, "right");
  const leave = () => onRefHover(null, null);
  return (
    <aside className="sidebar drag">
      <div className="brand"><Sword /><b>Two-edged Sword</b></div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Screens">
        {NAV.map((n) => (
          <button key={n.s} type="button" className={`nav ${app.screen === n.s ? "on" : ""}`} onClick={() => app.go(n.s)}>
            <Icon name={n.icon} />{n.label}<span className="k">⌘{n.key}</span>
          </button>
        ))}
      </nav>
      {app.bookmarks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="lab" style={{ paddingBottom: 2 }}>Bookmarks</div>
          {app.bookmarks.slice(0, 8).map((b) => (
            <button key={b.id} type="button" className="bm" onMouseEnter={(e) => onRefHover(b.ref, e.currentTarget, b.bible)} onMouseLeave={leave} onClick={() => { hide(); app.open({ book: b.ref.book, chapter: b.ref.chapter, verse: b.ref.verse, to: b.ref.to }, "read"); }}>
              <Icon name="bookmark" style={{ color: "var(--accent)" }} /><span className="t">{fmtRef(b.ref)}</span><span className="r">{app.mod("bible", b.bible)?.abbrev ?? ""}</span>
            </button>
          ))}
        </div>
      )}
      {app.recent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="lab" style={{ paddingBottom: 2 }}>Recent</div>
          {app.recent.slice(0, 5).map((r) => (
            <button key={`${r.book}.${r.chapter}`} type="button" className="bm" onMouseEnter={(e) => onRefHover({ book: r.book, chapter: r.chapter }, e.currentTarget)} onMouseLeave={leave} onClick={() => { hide(); app.open({ book: r.book, chapter: r.chapter }, "read"); }}>
              <span className="t">{book(r.book).name} {r.chapter}</span><span className="r">{ago(r.at)}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: "auto" }}>
        {today ? (
          <button type="button" className="today" onClick={() => app.go("plans")}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: "100%" }}><span className="lab" style={{ padding: 0 }}>Today</span><span className="n">{today.progress}</span></span>
            <span style={{ font: "600 15px/1.25 var(--display)" }}>{today.label}</span>
            <span style={{ height: 4, borderRadius: 999, background: "var(--border)", width: "100%" }}><span style={{ display: "block", width: `${today.pct}%`, height: 4, borderRadius: 999, background: "var(--accent)" }} /></span>
          </button>
        ) : (
          <button type="button" className="today" onClick={() => app.go("plans")}>
            <span className="lab" style={{ padding: 0 }}>Reading plan</span>
            <span style={{ fontSize: 12 }}>Choose a plan…</span>
          </button>
        )}
        <button type="button" className={`nav ${app.screen === "settings" ? "on" : ""}`} style={{ marginTop: 8 }} onClick={() => app.go("settings")}>
          <Icon name="settings" />Settings<span className="k">⌘,</span>
        </button>
      </div>
      {preview}
    </aside>
  );
}

/** The 52px bar at the top of every screen: history, reference and Bible pickers, search, tools. */
export function Topbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  const app = useApp();
  return (
    <header className="topbar drag">
      <button className="ibtn" type="button" aria-label="Back" disabled={!app.canBack} onClick={app.back}><Icon name="back" /></button>
      <button className="ibtn" type="button" aria-label="Forward" disabled={!app.canForward} onClick={app.forward}><Icon name="fwd" /></button>
      {children}
      <div className="spacer" />
      {right}
    </header>
  );
}

export function RefButton({ onClick }: { onClick: () => void }) {
  const { loc } = useApp();
  const r = { book: loc.book, chapter: loc.chapter, verse: loc.verse, to: loc.to };
  return <button className="btn" type="button" style={{ fontWeight: 600 }} onClick={onClick}>{fmtRef(r)}<Icon name="down" className="sm" style={{ color: "var(--muted)" }} /></button>;
}

export function BibleSelect({ value, onChange, style }: { value: string; onChange: (id: string) => void; style?: React.CSSProperties }) {
  const app = useApp();
  const list = app.bibles.filter((b) => !app.settings.hiddenBibles.includes(b.id) || b.id === value);
  return (
    <label className="btn" style={{ position: "relative", ...style }} title={app.mod("bible", value)?.title}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="bible" />{app.mod("bible", value)?.abbrev ?? value}</span>
      <Icon name="down" className="sm" style={{ color: "var(--muted)" }} />
      <select aria-label="Bible" value={value} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
        {list.map((b) => <option key={b.id} value={b.id}>{b.abbrev} · {b.title}</option>)}
      </select>
    </label>
  );
}

export function SearchField({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="field" style={{ marginLeft: 16, flexGrow: 1, maxWidth: 420, cursor: "text", textAlign: "left" }} onClick={onOpen}>
      <Icon name="search" /><span style={{ flexGrow: 1, color: "var(--muted)" }}>Search, or type a reference like rom 8 28</span><span className="kbd">⌘K</span>
    </button>
  );
}

export const allBooks = BOOKS;
