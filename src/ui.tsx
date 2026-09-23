import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BOOKS, book, SECTIONS } from "./bible";
import { Icon } from "./icons";

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
export function RefPicker({ anchor, onClose, onPick, initialBook }: { anchor: DOMRect; onClose: () => void; onPick: (b: number, c: number) => void; initialBook?: number }) {
  const [b, setB] = useState<number | null>(null);
  return (
    <Popover anchor={anchor} onClose={onClose} width={560}>
      {b === null ? (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {SECTIONS.map((s) => (
            <div key={s.name} style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr)", gap: 8, alignItems: "start" }}>
              <span className="label" style={{ paddingTop: 5 }}>{s.name}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {BOOKS.filter((x) => x.n >= s.from && x.n <= s.to).map((x) => (
                  <button key={x.n} type="button" className={`chip ${x.n === initialBook ? "on" : ""}`} onClick={() => (x.chapters === 1 ? onPick(x.n, 1) : setB(x.n))}>{x.name}</button>
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
              <button key={c} type="button" className="btn" style={{ justifyContent: "center", padding: 0 }} onClick={() => onPick(b, c)}>{c}</button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

export function Spinner() {
  return <span className="n" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Loading…</span>;
}
