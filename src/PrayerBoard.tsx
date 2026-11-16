// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The prayer list's board, shared by the desktop's Prayer screen (Prayer.tsx) and the phone app's
// (mobile/src/PrayerScreen.tsx): a card per category with its points, in as many columns as fit (three on
// a wide window or a tablet held sideways, two upright, one on a phone). Points and categories are moved by
// dragging: with the mouse from anywhere on them, on a touch screen by holding a moment (or at once from
// the grip), and from the keyboard with the arrow keys on the grip. Pray through (PrayThrough) walks the
// list one point at a time. Styles in prayer.css, from the theme's colours, so both apps draw it the same.

import { Fragment, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./prayer.css";
import { fmtRef, parseRef, Ref } from "./bible";
import { Icon } from "./icons";
import { plainText } from "./esword";
import {
  addCat,
  addPoint,
  answeredPoints,
  CAT_COLOURS,
  CatColour,
  catsInOrder,
  deleteCat,
  deletePoint,
  moveCat,
  movePoint,
  PrayerCat,
  PrayerList,
  PrayerPoint,
  pointsIn,
  prayingNow,
  setAnswered,
  updateCat,
  updatePoint,
} from "./prayer";

type Change = (f: (l: PrayerList) => PrayerList) => void;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-02" → "2 Nov", with the year when it isn't this one. */
export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} ${MONTHS[m - 1]}${y === new Date().getFullYear() ? "" : ` ${y}`}`;
}

const COLOUR_NAMES: Record<CatColour, string> = {
  gold: "Gold",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  red: "Red",
  teal: "Teal",
  orange: "Orange",
  grey: "Grey",
};

const SUGGESTED = ["Family", "Friends", "Church", "Work", "The world"];

/** The six-dot grip drawn on what can be dragged. */
const Grip = () => (
  <svg viewBox="0 0 10 16" aria-hidden="true" className="pr-gripdots">
    {[3, 8, 13].map((y) => (
      <Fragment key={y}>
        <circle cx="3" cy={y} r="1.3" />
        <circle cx="7" cy={y} r="1.3" />
      </Fragment>
    ))}
  </svg>
);

/** How many columns of cards fit the board's width. */
const columnsFor = (w: number) => (w >= 980 ? 3 : w >= 600 ? 2 : 1);

/** The categories dealt into columns, each to the shortest so far, so the columns end level and the
 *  order reads left to right. */
function dealColumns(l: PrayerList, cats: PrayerCat[], n: number): string[][] {
  const cols: string[][] = Array.from({ length: n }, () => []);
  const h = new Array<number>(n).fill(0);
  for (const c of cats) {
    let i = 0;
    for (let j = 1; j < n; j++) if (h[j] < h[i] - 0.5) i = j;
    cols[i].push(c.id);
    h[i] += 2.2 + (c.folded ? 0 : pointsIn(l, c.id).length + 1);
  }
  return cols;
}

type Drag =
  | {
      kind: "point";
      id: string;
      cat: string;
      index: number;
      x: number;
      y: number;
      dx: number;
      dy: number;
      w: number;
      h: number;
      label: string;
    }
  | { kind: "cat"; id: string; index: number; x: number; y: number; dx: number; dy: number; w: number; label: string };

type Editing = { kind: "point"; id: string } | { kind: "add"; cat: string } | { kind: "rename"; id: string } | { kind: "newcat" } | null;

/** Something just done that can be taken back, shown where it happened. */
interface Undo {
  text: string;
  cat?: string;
  index?: number;
  before: PrayerList;
}

export function PrayerBoard({
  list,
  onChange,
  onOpenVerse,
  touch = false,
  chapter,
}: {
  list: PrayerList;
  onChange: Change;
  onOpenVerse: (r: Ref) => void;
  /** A touch screen: bigger rows, and holding a moment starts a drag. */
  touch?: boolean;
  /** For Pray through to show the words of a point's verses. */
  chapter?: ChapterOf;
}) {
  const [view, setView] = useState<"praying" | "answered">("praying");
  const [editing, setEditing] = useState<Editing>(null);
  const [menu, setMenu] = useState<string | null>(null);
  /** A point whose trash was pressed: asked about in its place. */
  const [asking, setAsking] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [praying, setPraying] = useState(false);
  const [say, setSay] = useState("");
  const [cols, setCols] = useState(1);
  const board = useRef<HTMLDivElement>(null);
  const frozen = useRef<string[][] | null>(null);

  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCols(columnsFor(el.clientWidth)));
    ro.observe(el);
    setCols(columnsFor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // A finger held still a moment starts a drag; from then on it mustn't scroll the page. Listening from
  // the start (WebKit only lets a listener that was there when the touch began stop the scroll).
  const holding = useRef(false);
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (holding.current || dragRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 7000);
    return () => window.clearTimeout(t);
  }, [undo]);

  /** A change that can be taken back, with what to say where it happened. */
  const undoable = (text: string, f: (l: PrayerList) => PrayerList, at?: { cat: string; index: number }) => {
    setUndo({ text, before: list, ...at });
    onChange(f);
  };

  // While a point is dragged, the list is drawn as it would be if dropped now.
  const shown = useMemo(() => {
    if (drag?.kind === "point") return movePoint(list, drag.id, drag.cat, drag.index);
    if (drag?.kind === "cat") return moveCat(list, drag.id, drag.index);
    return list;
  }, [list, drag]);
  const cats = catsInOrder(shown);
  const answered = answeredPoints(list);
  const nPraying = prayingNow(list).length;
  const columns = frozen.current ?? dealColumns(shown, cats, cols);
  const byId = new Map(cats.map((c) => [c.id, c]));

  // ---------- dragging ----------

  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const suppressClick = useRef(false);

  /** Where a point being dragged would go, from the pointer: the card under it, and the rows above it. */
  const pointTarget = (x: number, y: number, d: Extract<Drag, { kind: "point" }>): { cat: string; index: number } | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cat]");
    if (!el || !board.current?.contains(el)) return null;
    const cat = el.dataset.cat!;
    const c = byId.get(cat);
    if (c?.folded) return { cat, index: pointsIn(list, cat).filter((p) => p.id !== d.id).length };
    const rows = [...el.querySelectorAll<HTMLElement>("[data-pid]")].filter((r) => r.dataset.pid !== d.id);
    return { cat, index: rows.filter((r) => r.getBoundingClientRect().top + r.offsetHeight / 2 < y).length };
  };

  /** Where a category being dragged would go: the cards before the pointer, in reading order. */
  const catTarget = (x: number, y: number, d: Extract<Drag, { kind: "cat" }>): number => {
    const cards = [...(board.current?.querySelectorAll<HTMLElement>("[data-catcard]") ?? [])].filter((c) => c.dataset.catcard !== d.id);
    return cards.filter((c) => {
      const r = c.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      return cy < y - r.height / 2 || (Math.abs(cy - y) <= r.height / 2 && r.left + r.width / 2 < x);
    }).length;
  };

  const scroller = () => {
    let el: HTMLElement | null = board.current;
    while (el) {
      const o = getComputedStyle(el).overflowY;
      if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return (document.scrollingElement as HTMLElement) ?? document.body;
  };

  const moveTo = (x: number, y: number) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "point") {
      const t = pointTarget(x, y, d);
      setDrag({ ...d, x, y, ...(t ?? {}) });
    } else setDrag({ ...d, x, y, index: catTarget(x, y, d) });
  };

  /** Starts a drag of a point or a category, from a pointer pressed at (x, y) on element `el`. */
  const begin = (kind: "point" | "cat", id: string, el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    if (kind === "point") {
      const p = list.points.find((q) => q.id === id)!;
      frozen.current = dealColumns(list, catsInOrder(list), cols);
      const index = pointsIn(list, p.cat).findIndex((q) => q.id === id);
      setDrag({ kind, id, cat: p.cat, index, x, y, dx: x - r.left, dy: y - r.top, w: r.width, h: r.height, label: p.title });
    } else {
      const c = list.cats.find((q) => q.id === id)!;
      const index = catsInOrder(list).findIndex((q) => q.id === id);
      setDrag({ kind, id, index, x, y, dx: 28, dy: 22, w: Math.min(r.width, 280), label: c.name });
    }
    setEditing(null);
    setMenu(null);
    setUndo(null);
    if (touch) navigator.vibrate?.(10);
  };

  const finish = (drop: boolean) => {
    const d = dragRef.current;
    holding.current = false;
    frozen.current = null;
    setDrag(null);
    if (!d || !drop) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    if (d.kind === "point") {
      const p = list.points.find((q) => q.id === d.id);
      const was = p ? pointsIn(list, p.cat).findIndex((q) => q.id === d.id) : -1;
      if (p && (p.cat !== d.cat || was !== d.index)) {
        onChange((l) => movePoint(l, d.id, d.cat, d.index));
        const to = list.cats.find((c) => c.id === d.cat)?.name ?? "";
        setSay(p.cat !== d.cat ? `Moved to ${to}.` : `Moved to position ${d.index + 1}.`);
      }
    } else {
      const was = catsInOrder(list).findIndex((c) => c.id === d.id);
      if (was !== d.index) {
        onChange((l) => moveCat(l, d.id, d.index));
        setSay(`Moved to position ${d.index + 1}.`);
      }
    }
  };

  // Following the pointer, scrolling near the edges, and Esc to put it back.
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    let last = { x: 0, y: 0 };
    let raf = 0;
    const move = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      moveTo(e.clientX, e.clientY);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    // A touch's pointer is cancelled once the browser takes it for a scroll: the touch itself is
    // followed instead, and kept from scrolling the page.
    const pcancel = (e: PointerEvent) => e.pointerType !== "touch" && cancel();
    const tmove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      last = { x: t.clientX, y: t.clientY };
      moveTo(t.clientX, t.clientY);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    const tick = () => {
      const s = scroller();
      const r = s === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : s.getBoundingClientRect();
      const edge = 70;
      const v =
        last.y && last.y < r.top + edge ? -(r.top + edge - last.y) / 4 : last.y > r.bottom - edge ? (last.y - (r.bottom - edge)) / 4 : 0;
      if (v) {
        s.scrollTop += Math.max(-24, Math.min(24, v));
        moveTo(last.x, last.y);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", pcancel);
    // A touch that ended unseen leaves nothing held: the next press puts it back. Listened for only
    // after the press that began the drag has gone by (its effects run while that press is still
    // on its way up to the window).
    const stray = () => cancel();
    const strayAt = window.setTimeout(() => window.addEventListener("pointerdown", stray), 0);
    window.addEventListener("keydown", key);
    document.addEventListener("touchmove", tmove, { passive: false });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", cancel);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", pcancel);
      window.clearTimeout(strayAt);
      window.removeEventListener("pointerdown", stray);
      window.removeEventListener("keydown", key);
      document.removeEventListener("touchmove", tmove);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", cancel);
    };
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Pressing on a point or a card's header: a mouse drags once it moves a little; a finger once it has
   *  held still a moment (moving first is a scroll). From the grip, at once. */
  const press = (kind: "point" | "cat", id: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || editing?.kind === "point" || dragRef.current) return;
    const t = e.target as HTMLElement;
    const fromGrip = !!t.closest(".pr-grip");
    if (!fromGrip && t.closest(".pr-check, .pr-chip, .pr-ib, .pr-menu, input, textarea, a")) return;
    const el = e.currentTarget.closest<HTMLElement>(kind === "point" ? "[data-pid]" : "[data-catcard]")!;
    const sx = e.clientX;
    const sy = e.clientY;
    if (fromGrip) {
      e.preventDefault();
      begin(kind, id, el, sx, sy);
      return;
    }
    let timer = 0;
    const stop = () => {
      window.clearTimeout(timer);
      holding.current = false;
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    const mv = (m: PointerEvent) => {
      const far = Math.hypot(m.clientX - sx, m.clientY - sy);
      if (e.pointerType === "mouse" ? far > 5 : far > 8) {
        stop();
        if (e.pointerType === "mouse") begin(kind, id, el, sx, sy);
      }
    };
    if (e.pointerType !== "mouse")
      timer = window.setTimeout(() => {
        stop();
        holding.current = true;
        begin(kind, id, el, sx, sy);
      }, 380);
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  /** The arrow keys on a point's grip move it: up and down, and across into the category before or after. */
  const pointKeys = (p: PrayerPoint) => (e: React.KeyboardEvent) => {
    const order = catsInOrder(list);
    const ci = order.findIndex((c) => c.id === p.cat);
    const here = pointsIn(list, p.cat);
    const i = here.findIndex((q) => q.id === p.id);
    let to: { cat: string; index: number } | null = null;
    if (e.key === "ArrowUp") to = i > 0 ? { cat: p.cat, index: i - 1 } : ci > 0 ? { cat: order[ci - 1].id, index: 999 } : null;
    else if (e.key === "ArrowDown")
      to = i < here.length - 1 ? { cat: p.cat, index: i + 1 } : ci < order.length - 1 ? { cat: order[ci + 1].id, index: 0 } : null;
    else if (e.key === "ArrowLeft" && ci > 0) to = { cat: order[ci - 1].id, index: 999 };
    else if (e.key === "ArrowRight" && ci < order.length - 1) to = { cat: order[ci + 1].id, index: 999 };
    else return;
    e.preventDefault();
    if (!to) return;
    onChange((l) => movePoint(l, p.id, to.cat, to.index));
    const name = order.find((c) => c.id === to.cat)?.name ?? "";
    setSay(to.cat === p.cat ? `${p.title}: position ${to.index + 1} of ${here.length}.` : `${p.title}: moved to ${name}.`);
    // The grip keeps the focus once it is drawn in its new place.
    requestAnimationFrame(() => board.current?.querySelector<HTMLElement>(`[data-pid="${p.id}"] .pr-grip`)?.focus());
  };

  const catKeys = (c: PrayerCat) => (e: React.KeyboardEvent) => {
    const order = catsInOrder(list);
    const i = order.findIndex((x) => x.id === c.id);
    const d = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const to = i + d;
    if (to < 0 || to >= order.length) return;
    onChange((l) => moveCat(l, c.id, to));
    setSay(`${c.name}: position ${to + 1} of ${order.length}.`);
    requestAnimationFrame(() => board.current?.querySelector<HTMLElement>(`[data-catcard="${c.id}"] .pr-grip`)?.focus());
  };

  // ---------- drawing ----------

  const pointRow = (p: PrayerPoint, cat: PrayerCat, index: number) => {
    // The gap is the point's own height, so nothing below moves under the pointer as the drag starts.
    if (drag?.kind === "point" && drag.id === p.id)
      return <div key={p.id} data-pid={p.id} className="pr-slot" style={{ height: Math.max(36, drag.h - 8) }} aria-hidden="true" />;
    if (editing?.kind === "point" && editing.id === p.id)
      return (
        <PointEditor
          key={p.id}
          point={p}
          onDone={(patch) => {
            setEditing(null);
            if (patch) onChange((l) => updatePoint(l, p.id, patch));
          }}
          onAnswered={() => {
            setEditing(null);
            undoable(`“${p.title}” answered.`, (l) => setAnswered(l, p.id, true), { cat: cat.id, index });
          }}
          onDelete={() => {
            setEditing(null);
            setAsking(p.id);
          }}
          onOpenVerse={onOpenVerse}
        />
      );
    if (asking === p.id)
      return (
        <ConfirmRow
          key={p.id}
          pid={p.id}
          text={`Delete “${p.title}”?`}
          onCancel={() => setAsking(null)}
          onDelete={() => {
            setAsking(null);
            onChange((l) => deletePoint(l, p.id));
            setSay(`“${p.title}” deleted.`);
          }}
        />
      );
    return (
      <div key={p.id} data-pid={p.id} className="pr-point" onPointerDown={press("point", p.id)}>
        <button
          type="button"
          className="pr-check"
          aria-label={`Mark “${p.title}” answered`}
          title="Answered"
          onClick={() => undoable(`“${p.title}” answered.`, (l) => setAnswered(l, p.id, true), { cat: cat.id, index })}
        >
          <Icon name="check" />
        </button>
        {/* A div acting as a button: WebKit sizes a real <button> too short in this grid when its text
            wraps, and the verses under it are drawn over the note. */}
        <div
          role="button"
          tabIndex={0}
          className="pr-body"
          onClick={() => !suppressClick.current && setEditing({ kind: "point", id: p.id })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditing({ kind: "point", id: p.id });
            }
          }}
          aria-label={`${p.title}${p.note ? `. ${p.note}` : ""}. Edit`}
        >
          <span className="pr-title">{p.title}</span>
          {p.note && <span className="pr-note">{p.note}</span>}
        </div>
        {p.verses.length > 0 && (
          <div className="pr-verses">
            {p.verses.map((v) => (
              <VerseChip key={v} v={v} onOpen={onOpenVerse} />
            ))}
          </div>
        )}
        <button type="button" className="pr-ib pr-trash" aria-label={`Delete “${p.title}”`} title="Delete" onClick={() => setAsking(p.id)}>
          <Icon name="trash" />
        </button>
        <button type="button" className="pr-grip" aria-label={`Move “${p.title}”: arrow keys`} onKeyDown={pointKeys(p)}>
          <Grip />
        </button>
      </div>
    );
  };

  const undoRow = (u: Undo) => (
    <div className="pr-undo" role="status">
      <span>{u.text}</span>
      <button
        type="button"
        onClick={() => {
          const was = u.before;
          setUndo(null);
          onChange(() => was);
        }}
      >
        Undo
      </button>
    </div>
  );

  const card = (c: PrayerCat) => {
    const pts = pointsIn(shown, c.id);
    const compact = drag?.kind === "cat";
    if (compact && drag.id === c.id) return <div key={c.id} data-catcard={c.id} className="pr-card pr-cardslot" aria-hidden="true" />;
    const renaming = editing?.kind === "rename" && editing.id === c.id;
    const adding = editing?.kind === "add" && editing.cat === c.id;
    const folded = !!c.folded && !compact;
    const dropping = drag?.kind === "point" && drag.cat === c.id && c.folded;
    const rows: ReactNode[] = pts.map((p, i) => pointRow(p, c, i));
    if (undo?.cat === c.id && undo.index !== undefined)
      rows.splice(Math.min(undo.index, rows.length), 0, <Fragment key="undo">{undoRow(undo)}</Fragment>);
    return (
      <section
        key={c.id}
        data-cat={c.id}
        data-catcard={c.id}
        className={`pr-card pc-${c.colour}${dropping ? " pr-drop" : ""}`}
        aria-label={c.name}
      >
        <header className="pr-head" onPointerDown={renaming ? undefined : press("cat", c.id)}>
          <button type="button" className="pr-grip" aria-label={`Move ${c.name}: arrow keys`} onKeyDown={catKeys(c)}>
            <Grip />
          </button>
          <span className="pr-dot" aria-hidden="true" />
          {renaming ? (
            <NameInput
              initial={c.name}
              label="Category name"
              onDone={(name) => {
                setEditing(null);
                if (name && name !== c.name) onChange((l) => updateCat(l, c.id, { name }));
              }}
            />
          ) : (
            <h3 className="pr-name">
              <button
                type="button"
                onClick={() => !suppressClick.current && onChange((l) => updateCat(l, c.id, { folded: !c.folded }))}
                aria-expanded={!folded}
              >
                {c.name}
              </button>
            </h3>
          )}
          <span className="pr-count" aria-label={`${pointsIn(list, c.id).length} points`}>
            {pointsIn(list, c.id).length}
          </span>
          {!compact && (
            <button
              type="button"
              className="pr-ib"
              aria-label={`${c.name}: more`}
              aria-haspopup="menu"
              aria-expanded={menu === c.id}
              onClick={() => setMenu(menu === c.id ? null : c.id)}
            >
              <Icon name="dots" />
            </button>
          )}
          {!compact && (
            <button
              type="button"
              className={`pr-ib pr-fold${folded ? " folded" : ""}`}
              aria-label={folded ? `Show ${c.name}` : `Fold ${c.name}`}
              onClick={() => onChange((l) => updateCat(l, c.id, { folded: !c.folded }))}
            >
              <Icon name="down" />
            </button>
          )}
          {menu === c.id && (
            <CatMenu
              cat={c}
              points={list.points.filter((p) => p.cat === c.id).length}
              onClose={() => setMenu(null)}
              onRename={() => {
                setMenu(null);
                setEditing({ kind: "rename", id: c.id });
              }}
              onColour={(colour) => onChange((l) => updateCat(l, c.id, { colour }))}
              onDelete={() => {
                setMenu(null);
                undoable(`${c.name} deleted.`, (l) => deleteCat(l, c.id));
              }}
            />
          )}
        </header>
        {!folded && !compact && (
          <>
            {rows.length > 0 && <div className="pr-points">{rows}</div>}
            {adding ? (
              <AddInput cat={c} onAdd={(title) => onChange((l) => addPoint(l, c.id, title).list)} onDone={() => setEditing(null)} />
            ) : (
              <button type="button" className="pr-add" onClick={() => setEditing({ kind: "add", cat: c.id })}>
                <Icon name="plus" /> Add a point
              </button>
            )}
          </>
        )}
      </section>
    );
  };

  const newCat =
    editing?.kind === "newcat" ? (
      <div className="pr-card pr-newform">
        <NameInput
          initial=""
          label="New category's name"
          placeholder="Name, e.g. Family"
          onDone={(name) => {
            if (!name) return setEditing(null);
            const { list: next, id } = addCat(list, name);
            onChange(() => next);
            setEditing({ kind: "add", cat: id });
          }}
        />
      </div>
    ) : (
      <button type="button" className="pr-newcat" onClick={() => setEditing({ kind: "newcat" })}>
        <Icon name="plus" /> New category
      </button>
    );

  const empty = cats.length === 0;
  const deletedCat = undo && !undo.cat ? undoRow(undo) : null;

  return (
    <div className={`pr${touch ? " pr-touch" : ""}${drag ? " pr-dragging" : ""}`} ref={board}>
      <div className="pr-bar">
        <div className="pr-seg" role="tablist" aria-label="Show">
          <button
            type="button"
            role="tab"
            aria-selected={view === "praying"}
            className={view === "praying" ? "on" : ""}
            onClick={() => setView("praying")}
          >
            Praying for <span>{nPraying}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "answered"}
            className={view === "answered" ? "on" : ""}
            onClick={() => setView("answered")}
          >
            Answered <span>{answered.length}</span>
          </button>
        </div>
        <span className="pr-sp" />
        <button type="button" className="pr-btn" disabled={!nPraying} onClick={() => setPraying(true)}>
          <Icon name="prayer" /> Pray through
        </button>
        {view === "praying" && !empty && (
          <button type="button" className="pr-btn primary" onClick={() => setEditing({ kind: "newcat" })}>
            <Icon name="plus" /> New category
          </button>
        )}
      </div>

      {view === "answered" ? (
        <Answered list={list} onChange={onChange} onOpenVerse={onOpenVerse} />
      ) : empty ? (
        <div className="pr-empty">
          <h2>Who and what do you pray for?</h2>
          <p>Make a category for each part of your life, then add the people and needs you pray for under it.</p>
          <div className="pr-suggest">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                type="button"
                className="pr-btn"
                onClick={() => {
                  const { list: next, id } = addCat(list, s);
                  onChange(() => next);
                  setEditing({ kind: "add", cat: id });
                }}
              >
                <Icon name="plus" /> {s}
              </button>
            ))}
          </div>
          <div className="pr-emptynew">{newCat}</div>
        </div>
      ) : drag?.kind === "cat" ? (
        <div className="pr-compact" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cats.map(card)}
        </div>
      ) : (
        <>
          {deletedCat}
          <div className="pr-cols" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((col, i) => (
              <div className="pr-col" key={i}>
                {col.map((id) => byId.get(id)).map((c) => c && card(c))}
                {i === columns.length - 1 && newCat}
              </div>
            ))}
          </div>
        </>
      )}

      {drag && (
        <div
          className={`pr-lift ${drag.kind === "cat" ? "pr-liftcat" : ""}`}
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }}
          aria-hidden="true"
        >
          {drag.label}
        </div>
      )}
      <div className="pr-sr" aria-live="polite">
        {say}
      </div>
      {praying && (
        <PrayThrough
          list={list}
          onChange={onChange}
          onClose={() => setPraying(false)}
          onOpenVerse={onOpenVerse}
          touch={touch}
          chapter={chapter}
        />
      )}
    </div>
  );
}

/** A chapter's verses, as each app reads them (the text in e-Sword markup). */
export type ChapterOf = (book: number, chapter: number) => Promise<{ v: number; text: string }[]>;

/** At most this many verses of a passage are shown; a longer one ends with "…". */
const MOST_VERSES = 12;

/** A passage's words, plain: the verses it names in its first chapter (the whole chapter for "Psalm 23"). */
async function passage(chapter: ChapterOf, r: Ref): Promise<{ text: string; more: boolean }> {
  const vs = await chapter(r.book, r.chapter);
  const from = r.verse ?? 1;
  const to = r.toChapter && r.toChapter !== r.chapter ? Infinity : (r.to ?? r.verse ?? Infinity);
  const in_ = vs.filter((x) => x.v >= from && x.v <= to);
  const shown = in_.slice(0, MOST_VERSES);
  return {
    text: shown.map((x) => plainText(x.text)).join(" "),
    more: in_.length > shown.length || (!!r.toChapter && r.toChapter !== r.chapter),
  };
}

/** The words of a point's verses, in Pray through. */
function Scripture({ refs, chapter, onOpen }: { refs: string[]; chapter: ChapterOf; onOpen?: (r: Ref) => void }) {
  const [texts, setTexts] = useState<Record<string, { text: string; more: boolean } | null>>({});
  const key = refs.join("|");
  useEffect(() => {
    let live = true;
    for (const v of refs) {
      const r = parseRef(v);
      if (!r) continue;
      passage(chapter, r)
        .then((t) => live && setTexts((x) => ({ ...x, [v]: t.text ? t : null })))
        .catch(() => live && setTexts((x) => ({ ...x, [v]: null })));
    }
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each reference with its words once they're read; a reference without them (not in this Bible, or
  // not read yet) is still shown, as a chip.
  return (
    <div className="pr-scripture">
      {refs.map((v) => {
        const t = texts[v];
        if (!t) return <VerseChip key={v} v={v} onOpen={onOpen} />;
        const r = parseRef(v);
        return (
          <blockquote key={v}>
            <p>
              {t.text}
              {t.more ? " …" : ""}
            </p>
            {onOpen && r ? (
              <button type="button" className="pr-cite" title={`Read ${v}`} onClick={() => onOpen(r)}>
                {v}
              </button>
            ) : (
              <cite className="pr-cite">{v}</cite>
            )}
          </blockquote>
        );
      })}
    </div>
  );
}

/** Asked in a point's place before it is deleted. Cancel has the focus, so Return doesn't delete by
 *  accident; Esc cancels. */
function ConfirmRow({ pid, text, onCancel, onDelete }: { pid?: string; text: string; onCancel: () => void; onDelete: () => void }) {
  return (
    <div className="pr-confirm" data-pid={pid} role="alertdialog" aria-label={text} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <span>{text}</span>
      <button type="button" className="pr-btn" autoFocus onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="pr-btn pr-dangerfill" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function VerseChip({ v, onOpen }: { v: string; onOpen?: (r: Ref) => void }) {
  const r = parseRef(v);
  if (!onOpen) return <span className="pr-chip pr-chipstill">{v}</span>;
  return (
    <button type="button" className="pr-chip" disabled={!r} onClick={() => r && onOpen(r)} title={r ? `Read ${v}` : undefined}>
      {v}
    </button>
  );
}

/** A one-line input that answers its text on Enter or when the focus leaves, and nothing on Esc. */
function NameInput({
  initial,
  label,
  placeholder,
  onDone,
}: {
  initial: string;
  label: string;
  placeholder?: string;
  onDone: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const end = (text: string) => {
    if (done.current) return;
    done.current = true;
    onDone(text.trim());
  };
  return (
    <input
      className="pr-input pr-nameinput"
      autoFocus
      value={v}
      aria-label={label}
      placeholder={placeholder}
      maxLength={60}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") end(v);
        else if (e.key === "Escape") end(initial);
      }}
      onBlur={() => end(v)}
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}

/** Adding points to a category: Enter adds one and leaves the box open for the next. */
function AddInput({ cat, onAdd, onDone }: { cat: PrayerCat; onAdd: (title: string) => void; onDone: () => void }) {
  const [v, setV] = useState("");
  return (
    <div className="pr-addform">
      <input
        className="pr-input"
        autoFocus
        value={v}
        aria-label={`New point for ${cat.name}`}
        placeholder={`Pray for…`}
        maxLength={200}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            onAdd(v.trim());
            setV("");
          } else if (e.key === "Escape") onDone();
        }}
        onBlur={() => {
          if (v.trim()) onAdd(v.trim());
          onDone();
        }}
      />
    </div>
  );
}

/** A point opened to change it: its title, note and verses; Answered and Delete. Saved on Done, Enter in the
 *  title, or when the focus leaves it; Esc leaves it as it was. */
function PointEditor({
  point,
  onDone,
  onAnswered,
  onDelete,
  onOpenVerse,
}: {
  point: PrayerPoint;
  onDone: (patch: Partial<PrayerPoint> | null) => void;
  onAnswered: () => void;
  onDelete: () => void;
  onOpenVerse: (r: Ref) => void;
}) {
  const [title, setTitle] = useState(point.title);
  const [note, setNote] = useState(point.note ?? "");
  const [verses, setVerses] = useState(point.verses);
  const [verse, setVerse] = useState("");
  const [bad, setBad] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const closed = useRef(false);
  const pressed = useRef(false);
  // A press anywhere else saves it, even when nothing in it had the focus.
  useEffect(() => {
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && saveRef.current();
    window.addEventListener("pointerdown", out, true);
    return () => window.removeEventListener("pointerdown", out, true);
  }, []);
  const save = () => {
    if (closed.current) return;
    closed.current = true;
    const t = title.trim();
    const n = note.trim();
    // A verse typed but not yet added with Return is kept too.
    const typed = parseRef(verse);
    const label = typed && fmtRef(typed, "short");
    onDone({ title: t || point.title, note: n || undefined, verses: label && !verses.includes(label) ? [...verses, label] : verses });
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  const addVerse = () => {
    const r = parseRef(verse);
    if (!r) {
      setBad(!!verse.trim());
      return false;
    }
    const label = fmtRef(r, "short");
    if (!verses.includes(label)) setVerses([...verses, label]);
    setVerse("");
    setBad(false);
    return true;
  };
  return (
    <div
      ref={box}
      className="pr-edit"
      data-pid={point.id}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          closed.current = true;
          onDone(null);
        }
      }}
      // A press inside (Delete, Answered, a verse's ×) isn't leaving it: WebKit doesn't focus a button
      // that's clicked, so the box would otherwise close before the click arrives.
      onPointerDownCapture={() => {
        pressed.current = true;
        const clear = () => window.setTimeout(() => (pressed.current = false), 0);
        window.addEventListener("pointerup", clear, { once: true });
        window.addEventListener("pointercancel", clear, { once: true });
      }}
      onBlur={(e) => {
        if (pressed.current || box.current?.contains(e.relatedTarget as Node)) return;
        save();
      }}
    >
      <input
        className="pr-input pr-edittitle"
        autoFocus
        value={title}
        aria-label="Prayer point"
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <input
        className="pr-input"
        value={note}
        aria-label="Note"
        placeholder="A note (optional)"
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <div className="pr-verses pr-editverses">
        {verses.map((v) => (
          <span key={v} className="pr-chipx">
            <VerseChip v={v} onOpen={onOpenVerse} />
            <button type="button" aria-label={`Remove ${v}`} onClick={() => setVerses(verses.filter((x) => x !== v))}>
              <Icon name="x" />
            </button>
          </span>
        ))}
        <input
          className={`pr-input pr-verseinput${bad ? " bad" : ""}`}
          value={verse}
          aria-label="Add a verse"
          aria-invalid={bad}
          placeholder="Add a verse, e.g. Phil 4:6"
          onChange={(e) => {
            setVerse(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addVerse();
            }
          }}
        />
      </div>
      {bad && <p className="pr-err">That isn't a verse the app knows. Try “Phil 4:6” or “Psalm 23”.</p>}
      <div className="pr-editbar">
        <button type="button" className="pr-btn" onClick={onAnswered}>
          <Icon name="check" /> Answered
        </button>
        <button type="button" className="pr-btn pr-danger" onClick={onDelete}>
          <Icon name="trash" /> Delete
        </button>
        <span className="pr-sp" />
        <span className="pr-since">Added {fmtDay(point.created)}</span>
        <button
          type="button"
          className="pr-btn primary"
          onClick={() => {
            if (verse.trim() && !parseRef(verse)) return setBad(true);
            save();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** A category's ⋯ menu: rename, its colour, delete (asked again first). */
function CatMenu({
  cat,
  points,
  onClose,
  onRename,
  onColour,
  onDelete,
}: {
  cat: PrayerCat;
  points: number;
  onClose: () => void;
  onRename: () => void;
  onColour: (c: CatColour) => void;
  onDelete: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", out, true);
    window.addEventListener("keydown", key);
    box.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      window.removeEventListener("pointerdown", out, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div className="pr-menu" role="menu" ref={box} onPointerDown={(e) => e.stopPropagation()}>
      {asking ? (
        <div className="pr-ask">
          <p>
            Delete {cat.name}
            {points ? ` and its ${points === 1 ? "point" : `${points} points`}` : ""}?
          </p>
          <div>
            <button type="button" className="pr-btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button type="button" className="pr-btn pr-dangerfill" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" role="menuitem" onClick={onRename}>
            Rename
          </button>
          <div className="pr-swatches" role="group" aria-label="Colour">
            {CAT_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                className={`pr-swatch pc-${c}`}
                aria-label={COLOUR_NAMES[c]}
                aria-pressed={cat.colour === c}
                onClick={() => onColour(c)}
              />
            ))}
          </div>
          <button type="button" role="menuitem" className="pr-menudanger" onClick={() => setAsking(true)}>
            Delete category…
          </button>
        </>
      )}
    </div>
  );
}

/** The answered points, the latest first, each with when it was answered. */
function Answered({ list, onChange, onOpenVerse }: { list: PrayerList; onChange: Change; onOpenVerse: (r: Ref) => void }) {
  const pts = answeredPoints(list);
  const cats = new Map(list.cats.map((c) => [c.id, c]));
  const [asking, setAsking] = useState<string | null>(null);
  if (!pts.length)
    return (
      <div className="pr-empty pr-emptysmall">
        <h2>Nothing answered yet</h2>
        <p>Tick a point when God answers it. It comes here, with the day, to look back on.</p>
      </div>
    );
  return (
    <ul className="pr-answered">
      {pts.map((p) => {
        const c = cats.get(p.cat);
        if (asking === p.id)
          return (
            <li key={p.id} className="pr-ansconfirm">
              <ConfirmRow
                text={`Delete “${p.title}”?`}
                onCancel={() => setAsking(null)}
                onDelete={() => {
                  setAsking(null);
                  onChange((l) => deletePoint(l, p.id));
                }}
              />
            </li>
          );
        return (
          <li key={p.id} className={c ? `pc-${c.colour}` : ""}>
            <span className="pr-done" aria-hidden="true">
              <Icon name="check" />
            </span>
            <div className="pr-ansbody">
              <span className="pr-title">{p.title}</span>
              {p.note && <span className="pr-note">{p.note}</span>}
              <span className="pr-ansmeta">
                {c && (
                  <span className="pr-anscat">
                    <span className="pr-dot" aria-hidden="true" />
                    {c.name}
                  </span>
                )}
                <span>
                  Answered {fmtDay(p.answered!)} · prayed for since {fmtDay(p.created)}
                </span>
              </span>
              {p.verses.length > 0 && (
                <div className="pr-verses">
                  {p.verses.map((v) => (
                    <VerseChip key={v} v={v} onOpen={onOpenVerse} />
                  ))}
                </div>
              )}
            </div>
            <div className="pr-ansact">
              <button type="button" className="pr-btn" onClick={() => onChange((l) => setAnswered(l, p.id, false))}>
                Pray again
              </button>
              <button type="button" className="pr-ib" aria-label={`Delete “${p.title}”`} title="Delete" onClick={() => setAsking(p.id)}>
                <Icon name="trash" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Pray through: the points still being prayed for, one at a time, category by category. ← and → step,
 *  Esc closes. Marking one answered moves on. */
export function PrayThrough({
  list,
  onChange,
  onClose,
  onOpenVerse,
  doneLabel = "Close",
  touch = false,
  chapter,
}: {
  list: PrayerList;
  onChange: Change;
  onClose: () => void;
  /** Without it (in Quiet time), a point's verses are only shown. */
  onOpenVerse?: (r: Ref) => void;
  /** The last page's button. */
  doneLabel?: string;
  /** A touch screen: touch-sized buttons. */
  touch?: boolean;
  /** A chapter's verses in the Bible being read, for the words of a point's verses. */
  chapter?: ChapterOf;
}) {
  // The order as it was when it opened, so marking one answered doesn't shift the rest.
  const [ids] = useState(() => prayingNow(list).map((p) => p.id));
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const panel = useRef<HTMLDivElement>(null);
  const p = list.points.find((x) => x.id === ids[i]);
  const cat = p && list.cats.find((c) => c.id === p.cat);
  const end = i >= ids.length;
  const step = (d: number) => setI((n) => Math.max(0, Math.min(ids.length, n + d)));
  /** A swipe across: left for the next point, right for the one before. Mostly sideways, and far enough
   *  that a tap or a scroll isn't taken for one. */
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipe.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  };
  const swipeEnd = (e: React.TouchEvent) => {
    const s0 = swipe.current;
    const t = e.changedTouches[0];
    swipe.current = null;
    if (!s0 || !t) return;
    const dx = t.clientX - s0.x;
    const dy = t.clientY - s0.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && i < ids.length) step(1);
    else if (dx > 0 && i > 0) step(-1);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => panel.current?.focus(), [i]);
  return (
    <div className={`pr pr-pray${touch ? " pr-touch" : ""}`} role="dialog" aria-modal="true" aria-label="Pray through">
      <div className="pr-prayscrim" onClick={onClose} />
      <div
        className={`pr-praypanel${cat ? ` pc-${cat.colour}` : ""}`}
        ref={panel}
        tabIndex={-1}
        onTouchStart={swipeStart}
        onTouchEnd={swipeEnd}
        onTouchCancel={() => (swipe.current = null)}
      >
        <div className="pr-praytop">
          <span className="pr-prayprog" aria-label={end ? "Finished" : `${i + 1} of ${ids.length}`}>
            {end ? `${ids.length} of ${ids.length}` : `${i + 1} of ${ids.length}`}
          </span>
          <div className="pr-praytrack" aria-hidden="true">
            <div style={{ width: `${(Math.min(i + (end ? 0 : 1), ids.length) / Math.max(1, ids.length)) * 100}%` }} />
          </div>
          <button type="button" className="pr-ib" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {end || !p ? (
          <div className="pr-praybody pr-prayend">
            <p className="pr-praycat">Finished</p>
            <h2>You have prayed through your list.</h2>
            <p className="pr-praynote">“Pray without ceasing.” 1 Thessalonians 5:17</p>
            <div className="pr-praybar">
              <button type="button" className="pr-btn" onClick={() => setI(0)}>
                Start again
              </button>
              <button type="button" className="pr-btn primary" onClick={onClose}>
                {doneLabel}
              </button>
            </div>
          </div>
        ) : (
          <div className="pr-praybody" key={p.id}>
            <p className="pr-praycat">
              <span className="pr-dot" aria-hidden="true" />
              {cat?.name}
            </p>
            <h2>{p.title}</h2>
            {p.note && <p className="pr-praynote">{p.note}</p>}
            {chapter && p.verses.length > 0 && (
              <Scripture
                refs={p.verses}
                chapter={chapter}
                onOpen={
                  onOpenVerse &&
                  ((r) => {
                    onClose();
                    onOpenVerse(r);
                  })
                }
              />
            )}
            {!chapter && p.verses.length > 0 && (
              <div className="pr-verses">
                {p.verses.map((v) => (
                  <VerseChip
                    key={v}
                    v={v}
                    onOpen={
                      onOpenVerse &&
                      ((r) => {
                        onClose();
                        onOpenVerse(r);
                      })
                    }
                  />
                ))}
              </div>
            )}
            {done.has(p.id) && <p className="pr-praydone">Marked answered.</p>}
            <div className="pr-praybar">
              <button type="button" className="pr-btn" disabled={i === 0} onClick={() => step(-1)}>
                <Icon name="back" /> Back
              </button>
              <span className="pr-sp" />
              {done.has(p.id) ? (
                <button
                  type="button"
                  className="pr-btn"
                  onClick={() => {
                    onChange((l) => setAnswered(l, p.id, false));
                    setDone((s) => new Set([...s].filter((x) => x !== p.id)));
                  }}
                >
                  Undo answered
                </button>
              ) : (
                <button
                  type="button"
                  className="pr-btn"
                  onClick={() => {
                    onChange((l) => setAnswered(l, p.id, true));
                    setDone((s) => new Set(s).add(p.id));
                    step(1);
                  }}
                >
                  <Icon name="check" /> Answered
                </button>
              )}
              <button type="button" className="pr-btn primary" onClick={() => step(1)}>
                {i === ids.length - 1 ? "Finish" : "Next"} <Icon name="fwd" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
