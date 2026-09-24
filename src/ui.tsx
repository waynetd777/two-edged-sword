import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BOOKS, book, SECTIONS } from "./bible";
import { api } from "./api";
import { Icon } from "./icons";
import { useApp } from "./state";
import { confirm } from "@tauri-apps/plugin-dialog";

/** Asks before anything is deleted, as a native macOS alert with Delete as its button.
 *  Used for every delete in the app, rather than window.confirm. */
export function confirmDelete(what: string, detail = "This can't be undone."): Promise<boolean> {
  return confirm(detail, { title: `Delete ${what}?`, kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }).catch(() => false);
}

/** Closes on Escape or a click outside. */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", key, true);
    const t = window.setTimeout(() => window.addEventListener("mousedown", down), 0);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("mousedown", down); window.clearTimeout(t); };
  }, [ref, onClose, active]);
}

/** A floating card placed below (or above) an anchor rectangle and kept on screen. */
export function Popover({ anchor, onClose, children, width = 380, style, place = "below" }: { anchor: DOMRect; onClose: () => void; children: ReactNode; width?: number; style?: React.CSSProperties; place?: "below" | "above" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 8 });
  useDismiss(ref, onClose);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left = place === "right" ? anchor.right + 8 : anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, vw - width - 12));
    let top = place === "above" ? anchor.top - h - 8 : place === "right" ? anchor.top - 12 : anchor.bottom + 8;
    if (top + h > vh - 12) top = Math.max(12, anchor.top - h - 8);
    if (top < 12) top = 12;
    setPos({ left, top });
  }, [anchor, width, place, children]);
  return <div ref={ref} className="popover" style={{ left: pos.left, top: pos.top, width, maxHeight: "calc(100vh - 24px)", overflowY: "auto", ...style }}>{children}</div>;
}

export function Dialog({ onClose, children, width, height, label }: { onClose: () => void; children: ReactNode; width: number; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  return (
    <div className="scrim">
      <div ref={ref} role="dialog" aria-label={label} className="dialog" style={{ width, height }}>{children}</div>
    </div>
  );
}

export function Switch({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return <button type="button" className="sw" aria-pressed={on} onClick={() => onChange(!on)}><span className="trk" />{children}</button>;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={String(v)} type="button" className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/** Book then chapter, as two grids. */
/** Book, then chapter, then verse (or the whole chapter). */
export function RefPicker({ anchor, onClose, onPick, initialBook }: { anchor: DOMRect; onClose: () => void; onPick: (b: number, c: number, v?: number) => void; initialBook?: number }) {
  const bible = useApp().settings.bible;
  const [b, setB] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (b === null || c === null) return;
    setCount(0);
    api.passages(bible, [{ book: b, chapter: c, from: 1, to: 200 }]).then(([p]) => setCount(p?.verses.length ?? 0)).catch(() => onPick(b, c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, c, bible]);
  const pickChapter = (bk: number, ch: number) => { setB(bk); setC(ch); };
  return (
    <Popover anchor={anchor} onClose={onClose} width={560}>
      {b !== null && c !== null ? (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="ibtn" aria-label="Back to chapters" onClick={() => (book(b).chapters === 1 ? setB(null) : setC(null))}><Icon name="back" /></button>
            <b style={{ font: "500 22px var(--display)" }}>{book(b).name} {c}</b>
            <button type="button" className="btn small" style={{ marginLeft: "auto" }} onClick={() => onPick(b, c)}>Whole chapter</button>
          </div>
          {count ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0,1fr))", gap: 4 }}>
              {Array.from({ length: count }, (_, i) => i + 1).map((v) => (
                <button key={v} type="button" className="btn" style={{ justifyContent: "center", padding: 0 }} onClick={() => onPick(b, c, v)}>{v}</button>
              ))}
            </div>
          ) : <Spinner />}
        </div>
      ) : b === null ? (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {SECTIONS.map((s) => (
            <div key={s.name} style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr)", gap: 8, alignItems: "start" }}>
              <span className="label" style={{ paddingTop: 5 }}>{s.name}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {BOOKS.filter((x) => x.n >= s.from && x.n <= s.to).map((x) => (
                  <button key={x.n} type="button" className={`chip ${x.n === initialBook ? "on" : ""}`} onClick={() => (x.chapters === 1 ? pickChapter(x.n, 1) : setB(x.n))}>{x.name}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="ibtn" aria-label="Back to books" onClick={() => setB(null)}><Icon name="back" /></button>
            <b style={{ font: "500 22px var(--display)" }}>{book(b).name}</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0,1fr))", gap: 4 }}>
            {Array.from({ length: book(b).chapters }, (_, i) => i + 1).map((c) => (
              <button key={c} type="button" className="btn" style={{ justifyContent: "center", padding: 0 }} onClick={() => pickChapter(b, c)}>{c}</button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

/** A back/forward history, like a browser's: visiting after going back drops what was ahead. */
export function useTrail<T>(same: (a: T, b: T) => boolean) {
  const [s, setS] = useState<{ items: T[]; i: number }>({ items: [], i: -1 });
  return {
    cur: s.i >= 0 ? s.items[s.i] : undefined,
    canBack: s.i > 0,
    canForward: s.i < s.items.length - 1,
    visit: (x: T) => setS((p) => (p.i >= 0 && same(p.items[p.i], x) ? p : { items: [...p.items.slice(0, p.i + 1), x], i: p.i + 1 })),
    /** Moves back (-1) or forward (1) and returns the item there. */
    go: (d: number): T | undefined => {
      const j = s.i + d;
      if (j < 0 || j >= s.items.length) return undefined;
      setS({ ...s, i: j });
      return s.items[j];
    },
    reset: (items: T[]) => setS({ items, i: items.length - 1 }),
  };
}

export function TrailButtons({ trail, onGo }: { trail: { canBack: boolean; canForward: boolean }; onGo: (d: number) => void }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      <button className="ibtn" type="button" aria-label="Back" title="Back" disabled={!trail.canBack} onClick={() => onGo(-1)} style={{ width: 24, height: 24 }}><Icon name="back" size={13} /></button>
      <button className="ibtn" type="button" aria-label="Forward" title="Forward" disabled={!trail.canForward} onClick={() => onGo(1)} style={{ width: 24, height: 24 }}><Icon name="fwd" size={13} /></button>
    </span>
  );
}

export function Spinner() {
  return <span className="n" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Loading…</span>;
}
