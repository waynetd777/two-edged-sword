// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { APOCRYPHA, apocryphaName, BookSizes, BOOKS, book, isApocrypha, SECTIONS } from "./bible";
import { api, isReadOnly } from "./api";
import { bibleSizes } from "./sizes";
import { Icon } from "./icons";
import { useApp } from "./state";
import { confirm } from "@tauri-apps/plugin-dialog";

/** Tooltips everywhere in the app, styled like its popovers in place of macOS's plain ones. Any element there with a title (or data-tip, or an icon-only button's aria-label) gets one: the title moves to data-tip
 *  so the native tooltip doesn't show as well. Shown after a short pause, below the element (above
 *  it near the bottom of the window), or beside it in the sidebar; gone on leaving, clicking or scrolling. */
export function Tooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; side: "below" | "above" | "right" } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    let el: HTMLElement | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      el = null;
      setTip(null);
    };
    const over = (e: MouseEvent) => {
      // The nearest element with a title; failing that, an icon-only button's aria-label.
      const target = e.target as HTMLElement;
      const t = (target.closest?.("[title], [data-tip]") ??
        target.closest?.("button[aria-label], [role=button][aria-label]")) as HTMLElement | null;
      if (t === el) return;
      hide();
      if (!t) return;
      if (t.title) {
        t.dataset.tip = t.title;
        t.removeAttribute("title");
      }
      const text = t.dataset.tip || (!t.textContent?.trim() ? t.getAttribute("aria-label") : null);
      if (!text) return;
      el = t;
      timer = window.setTimeout(() => {
        if (el !== t || !t.isConnected || isReadOnly()) return; // none in screenshots
        const r = t.getBoundingClientRect();
        const x = Math.max(150, Math.min(r.left + r.width / 2, window.innerWidth - 150));
        if (t.closest(".sidebar")) setTip({ text, side: "right", x: r.right + 8, y: r.top + r.height / 2 });
        else if (r.bottom + 44 > window.innerHeight) setTip({ text, side: "above", x, y: r.top - 6 });
        else setTip({ text, side: "below", x, y: r.bottom + 6 });
      }, 450);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  if (!tip) return null;
  const style: React.CSSProperties =
    tip.side === "right"
      ? { left: tip.x, top: tip.y, transform: "translateY(-50%)" }
      : { left: tip.x, top: tip.y, transform: tip.side === "above" ? "translate(-50%, -100%)" : "translateX(-50%)" };
  return (
    <div className="tip" role="tooltip" style={style}>
      {tip.text}
    </div>
  );
}

/** Scrolls `el` so it stands a third of the way down the box that scrolls it, where the eye is when
 *  following text being read or sung (centred, the next lines start too far down). */
export function scrollToThird(el: Element | null | undefined, smooth = true) {
  if (!el) return;
  let box = el.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  if (!box) return el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  const r = el.getBoundingClientRect(),
    b = box.getBoundingClientRect();
  box.scrollTo({
    top: box.scrollTop + r.top - b.top - b.height / 3 + Math.min(r.height, b.height / 3) / 2,
    behavior: smooth ? "smooth" : "auto",
  });
}

/** The word under a click in rendered text (commentary, a book), and where it is, for the same
 *  look-up popup as a Bible word. Found from the click point rather than by wrapping every word in
 *  an element, so long HTML stays as it is. Null for links, numbers, images, a selection being
 *  made, or a click between words. */
export function wordAt(e: React.MouseEvent): { word: string; rect: DOMRect } | null {
  if (window.getSelection()?.toString()) return null;
  return wordAtPoint(e.clientX, e.clientY, e.target as HTMLElement);
}

function wordAtPoint(x: number, y: number, target: HTMLElement): { word: string; rect: DOMRect } | null {
  if (target.closest("a, button, input, textarea, img, .strongs, [data-num], [role=button]")) return null;
  const r = document.caretRangeFromPoint?.(x, y);
  const node = r?.startContainer;
  if (!r || !node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  const isW = (c: string | undefined) => !!c && /[\p{L}\p{M}'’]/u.test(c);
  let a = r.startOffset,
    b = r.startOffset;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  while (a < b && /['’]/.test(text[a])) a++;
  while (b > a && /['’]/.test(text[b - 1])) b--;
  if (b - a < 2) return null;
  const range = document.createRange();
  range.setStart(node, a);
  range.setEnd(node, b);
  const rect = range.getBoundingClientRect();
  if (x < rect.left - 2 || x > rect.right + 2 || y < rect.top - 2 || y > rect.bottom + 2) return null;
  return { word: text.slice(a, b), rect };
}

// Pointing at a word in rendered text highlights it and shows a hand, as a Bible word does. The
// highlight is one box drawn over the word (WordHoverBox, mounted once), moved without
// re-rendering the text under it, so long commentary stays cheap to hover over.
let setWordBox: ((r: DOMRect | null) => void) | null = null;
let hoverFrame = 0;
export function WordHoverBox() {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    setWordBox = setBox;
    const clear = () => setBox(null);
    document.addEventListener("scroll", clear, true);
    return () => {
      setWordBox = null;
      document.removeEventListener("scroll", clear, true);
    };
  }, []);
  return box && <div className="whover" style={{ left: box.left - 2, top: box.top, width: box.width + 4, height: box.height }} />;
}
/** Spread on text that wordAt makes clickable. */
export const wordHover = {
  onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget,
      x = e.clientX,
      y = e.clientY,
      t = e.target as HTMLElement,
      dragging = e.buttons !== 0;
    cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => {
      const w = dragging ? null : wordAtPoint(x, y, t);
      el.style.cursor = w ? "pointer" : "";
      setWordBox?.(w?.rect ?? null);
    });
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    cancelAnimationFrame(hoverFrame);
    e.currentTarget.style.cursor = "";
    setWordBox?.(null);
  },
};

/** Asks before anything is deleted, as a native macOS alert with Delete as its button.
 *  Used for every delete in the app, rather than window.confirm. */
export function confirmDelete(what: string, detail = "This can't be undone."): Promise<boolean> {
  return confirm(detail, { title: `Delete ${what}?`, kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }).catch(() => false);
}

/** The popovers and dialogs open, last opened last: Escape closes only the top one. */
const layers: object[] = [];

/** Closes on Escape (the top one only, when one is open over another) or a click outside. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const me = {};
    layers.push(me);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && layers[layers.length - 1] === me) {
        e.stopPropagation();
        close.current();
      }
    };
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    window.addEventListener("keydown", key, true);
    const t = window.setTimeout(() => window.addEventListener("mousedown", down), 0);
    return () => {
      layers.splice(layers.indexOf(me), 1);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("mousedown", down);
      window.clearTimeout(t);
    };
  }, [ref, active]);
}

/** Copies text, and says so in a toast once it's on the clipboard; false if it couldn't be. */
export async function copyText(text: string, toastMsg: string, toast: (msg: string) => void): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("copy", e);
    return false;
  }
  toast(toastMsg);
  return true;
}

/** Lets a floating bar be dragged out of the way: spread `bind` on it (or on a handle inside it) and add `style` to it. It can be
 *  picked up anywhere, buttons included (a drag doesn't click them), and is kept on screen. The offset
 *  isn't saved, and goes back to nothing while `open` is false, so the bar always opens where it was made to. */
export function useDrag(open: boolean) {
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!open) setOff({ x: 0, y: 0 });
  }, [open]);
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, select, textarea")) return;
    // A handle inside the card (marked data-drag) moves the card, so that's what's kept on screen.
    const el = e.currentTarget.closest<HTMLElement>("[data-drag]") ?? e.currentTarget,
      sx = e.clientX,
      sy = e.clientY,
      start = off;
    const r = el.getBoundingClientRect();
    let moved = false;
    const move = (m: PointerEvent) => {
      const dx = m.clientX - sx,
        dy = m.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setOff({
        x: start.x + Math.max(8 - r.left, Math.min(dx, window.innerWidth - 8 - r.right)),
        y: start.y + Math.max(8 - r.top, Math.min(dy, window.innerHeight - 8 - r.bottom)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) return;
      // The click that ends a drag isn't one; if none comes, the next real one must still get through.
      const eat = (c: MouseEvent) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener("click", eat, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", eat, true), 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return {
    off,
    bind: { onPointerDown },
    style: { transform: `translate(${off.x}px, ${off.y}px)`, cursor: "grab", touchAction: "none" } as React.CSSProperties,
  };
}

/** A floating card placed below (or above) an anchor rectangle and kept on screen. */
export function Popover({
  anchor,
  onClose,
  children,
  width = 380,
  style,
  place = "below",
}: {
  anchor: DOMRect;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  style?: React.CSSProperties;
  place?: "below" | "above" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 8 });
  useDismiss(ref, onClose);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight,
      vw = window.innerWidth,
      vh = window.innerHeight;
    let left = place === "right" ? anchor.right + 8 : anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, vw - width - 12));
    let top = place === "above" ? anchor.top - h - 8 : place === "right" ? anchor.top - 12 : anchor.bottom + 8;
    if (top + h > vh - 12) top = Math.max(12, anchor.top - h - 8);
    if (top < 12) top = 12;
    setPos({ left, top });
  }, [anchor, width, place, children]);
  return (
    <div
      ref={ref}
      className="popover"
      style={{ left: pos.left, top: pos.top, width, maxHeight: "calc(100vh - 24px)", overflowY: "auto", ...style }}
    >
      {children}
    </div>
  );
}

export function Dialog({
  onClose,
  children,
  width,
  height,
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  width: number;
  height?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  return (
    <div className="scrim">
      <div ref={ref} role="dialog" aria-label={label} className="dialog" style={{ width, height }}>
        {children}
      </div>
    </div>
  );
}

export function Switch({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <button type="button" className="sw" aria-pressed={on} onClick={() => onChange(!on)}>
      <span className="trk" />
      {children}
    </button>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** The books a Bible has and how many chapters each (sizes.ts). */
export { bibleSizes };
/** The books a Bible has, once looked up. */
const bibleBooks = (bible: string): Promise<Set<number>> => bibleSizes(bible).then((m) => new Set(m.keys()));
/** A Bible's books and chapters, or null until known. */
export function useBibleSizes(bible: string): BookSizes | null {
  const [got, setGot] = useState<{ bible: string; sizes: BookSizes } | null>(null);
  useEffect(() => {
    let live = true;
    bibleSizes(bible).then((sizes) => {
      if (live) setGot({ bible, sizes });
    });
    return () => {
      live = false;
    };
  }, [bible]);
  return got && got.bible === bible && got.sizes.size ? got.sizes : null;
}

/** The yellow pill marking the Apocrypha, wherever a book or chapter of it shows. */
export function ApoPill({ title, small }: { title?: string; small?: boolean }) {
  return (
    <span
      className={`apopill ${small ? "small" : ""}`}
      title={title ?? "Apocrypha: not in the Protestant canon (the KJV of 1611 printed it between the Testaments)"}
    >
      Apocrypha
    </span>
  );
}
/** The books a Bible has (an Old or New Testament alone has only its own), or null until known. */
export function useBibleBooks(bible: string): Set<number> | null {
  const [got, setGot] = useState<{ bible: string; books: Set<number> } | null>(null);
  useEffect(() => {
    let live = true;
    bibleBooks(bible).then((books) => {
      if (live) setGot({ bible, books });
    });
    return () => {
      live = false;
    };
  }, [bible]);
  return got && got.bible === bible && got.books.size ? got.books : null;
}

/** Book, then chapter, then verse (or the whole chapter). */
export function RefPicker({
  anchor,
  onClose,
  onPick,
  initialBook,
}: {
  anchor: DOMRect;
  onClose: () => void;
  onPick: (b: number, c: number, v?: number) => void;
  initialBook?: number;
}) {
  const bible = useApp().settings.bible;
  const sizes = useBibleSizes(bible);
  const has = (n: number) => (!sizes ? n <= 66 : sizes.has(n));
  const chapters = (n: number) => sizes?.get(n) ?? book(n).chapters;
  const [b, setB] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (b === null || c === null) return;
    let live = true;
    setCount(0);
    api
      .passages(bible, [{ book: b, chapter: c, from: 1, to: 200 }])
      .then(([p]) => live && setCount(p?.verses.length ?? 0))
      .catch(() => live && onPick(b, c));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, c, bible]);
  const pickChapter = (bk: number, ch: number) => {
    setB(bk);
    setC(ch);
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={560}>
      {b !== null && c !== null ? (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="ibtn"
              aria-label="Back to chapters"
              onClick={() => (chapters(b) === 1 ? setB(null) : setC(null))}
            >
              <Icon name="back" />
            </button>
            <b style={{ font: "500 22px var(--display)" }}>
              {book(b).name} {c}
            </b>
            {isApocrypha(b, c) && <ApoPill title={apocryphaName(b, c)} />}
            <button type="button" className="btn small" style={{ marginLeft: "auto" }} onClick={() => onPick(b, c)}>
              Whole chapter
            </button>
          </div>
          {count ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0,1fr))", gap: 4 }}>
              {Array.from({ length: count }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="btn"
                  style={{ justifyContent: "center", padding: 0 }}
                  onClick={() => onPick(b, c, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <Spinner />
          )}
        </div>
      ) : b === null ? (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* The Apocrypha between the Testaments, as the KJV of 1611 printed them. */}
          {[...SECTIONS.slice(0, 4), { name: "Apocrypha", from: 67, to: 78 }, ...SECTIONS.slice(4)].map((s) => {
            const list = (s.from > 66 ? APOCRYPHA : BOOKS).filter((x) => x.n >= s.from && x.n <= s.to && has(x.n));
            if (!list.length) return null;
            const apo = s.from > 66;
            return (
              <div key={s.name} style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr)", gap: 8, alignItems: "start" }}>
                <span className="label" style={{ paddingTop: 5, color: apo ? "var(--pufg)" : undefined }}>
                  {s.name}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {list.map((x) => (
                    <button
                      key={x.n}
                      type="button"
                      className={`chip ${apo ? "apo" : ""} ${x.n === initialBook ? "on" : ""}`}
                      title={apo ? `${x.name} (Apocrypha)` : undefined}
                      onClick={() => (chapters(x.n) === 1 ? pickChapter(x.n, 1) : setB(x.n))}
                    >
                      {x.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="ibtn" aria-label="Back to books" onClick={() => setB(null)}>
              <Icon name="back" />
            </button>
            <b style={{ font: "500 22px var(--display)" }}>{book(b).name}</b>
            {b > 66 && <ApoPill />}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0,1fr))", gap: 4 }}>
            {Array.from({ length: chapters(b) }, (_, i) => i + 1).map((c) => {
              const extra = b <= 66 && isApocrypha(b, c);
              return (
                <button
                  key={c}
                  type="button"
                  className={`btn ${extra ? "apo" : ""}`}
                  title={extra ? `${apocryphaName(b, c)} (Apocrypha)` : undefined}
                  style={{ justifyContent: "center", padding: 0 }}
                  onClick={() => pickChapter(b, c)}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {b <= 66 && chapters(b) > book(b).chapters && (
            <div className="hint">
              Yellow chapters are Apocrypha: {apocryphaName(b, book(b).chapters + 1)}
              {b === 27 ? " (13) and Bel and the Dragon (14)" : ""}.
            </div>
          )}
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
      <button
        className="ibtn"
        type="button"
        aria-label="Back"
        title="Back"
        disabled={!trail.canBack}
        onClick={() => onGo(-1)}
        style={{ width: 24, height: 24 }}
      >
        <Icon name="back" size={13} />
      </button>
      <button
        className="ibtn"
        type="button"
        aria-label="Forward"
        title="Forward"
        disabled={!trail.canForward}
        onClick={() => onGo(1)}
        style={{ width: 24, height: 24 }}
      >
        <Icon name="fwd" size={13} />
      </button>
    </span>
  );
}

function Spinner() {
  return (
    <span className="n" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      Loading…
    </span>
  );
}

interface ListItem {
  key: string;
  label: string;
  /** Muted, after the label. */ sub?: string;
  title?: string;
  /** A heading shown above the first item of each group. */ group?: string;
  /** Also searched. */ terms?: string;
}

/** A long list in a popover with a search box on top: typing filters it, ↑↓ move, Enter picks,
 *  Esc clears the search (or closes, when it's empty). */
export function SearchList({
  items,
  current,
  onPick,
  onClose,
  placeholder,
}: {
  items: ListItem[];
  current?: string;
  onPick: (key: string) => void;
  onClose: () => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((it) => {
    const hay = `${it.label} ${it.sub ?? ""} ${it.terms ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  useEffect(() => {
    setAt(Math.max(0, q ? 0 : shown.findIndex((it) => it.key === current)));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      setAt((i) => Math.min(shown.length - 1, i + 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setAt((i) => Math.max(0, i - 1));
      e.preventDefault();
    } else if (e.key === "Enter" && shown[at]) {
      onPick(shown[at].key);
      e.preventDefault();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (q) setQ("");
      else onClose();
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <label className="field">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={key}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          <ClearButton show={!!q} onClear={() => setQ("")} />
        </label>
      </div>
      <div ref={list} className="doclist" style={{ padding: 6, maxHeight: 440, overflowY: "auto" }}>
        {shown.map((it, i) => (
          <div key={it.key} style={{ display: "contents" }}>
            {it.group && it.group !== shown[i - 1]?.group && (
              <div className="label" style={{ padding: `${i ? 10 : 6}px 10px 4px` }}>
                {it.group}
              </div>
            )}
            <button
              type="button"
              data-i={i}
              title={it.title ?? it.label}
              className={`${it.key === current ? "on" : ""} ${i === at ? "at" : ""}`}
              onMouseMove={() => setAt(i)}
              onClick={() => onPick(it.key)}
            >
              {it.label}
              {it.sub && (
                <span className="n" style={{ marginLeft: 8 }}>
                  {it.sub}
                </span>
              )}
            </button>
          </div>
        ))}
        {!shown.length && (
          <div className="hint" style={{ padding: "8px 10px" }}>
            Nothing matches “{q}”.
          </div>
        )}
      </div>
    </div>
  );
}

/** The x at the end of a search box, shown while it has text; clicking it keeps the box focused. */
export function ClearButton({ show, onClear, label = "Clear" }: { show: boolean; onClear: () => void; label?: string }) {
  if (!show) return null;
  return (
    <button
      type="button"
      className="ibtn"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      style={{ width: 20, height: 20, flexShrink: 0 }}
    >
      <Icon name="x" size={12} />
    </button>
  );
}

/** Previous and next, as chevrons floating at the middle of the reading column's sides; each one's
 *  tooltip says where it goes. Put inside a `.sidenav-wrap` around the scrolling column. */
export function SideNav({
  prev,
  next,
}: {
  prev?: { label: string; go: () => void } | null;
  next?: { label: string; go: () => void } | null;
}) {
  return (
    <>
      {prev && (
        <button
          type="button"
          className="sidenav left"
          aria-label={prev.label}
          title={prev.label}
          onClick={(e) => {
            e.stopPropagation();
            prev.go();
          }}
        >
          <Icon name="back" />
        </button>
      )}
      {next && (
        <button
          type="button"
          className="sidenav right"
          aria-label={next.label}
          title={next.label}
          onClick={(e) => {
            e.stopPropagation();
            next.go();
          }}
        >
          <Icon name="fwd" />
        </button>
      )}
    </>
  );
}
