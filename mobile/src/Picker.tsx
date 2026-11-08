// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Choosing one module of a kind (a commentary in Study, a dictionary): those with something here first,
// starred ones first among them, a filter, and the rest folded away.

import { useEffect, useState } from "react";
import { save, saved } from "./api";
import { Icon } from "./icons";

export interface PickItem {
  id: string;
  title: string;
  abbrev: string;
  /** It has something for what's being read (notes on the verse, an entry for the word). */
  has: boolean;
  /** Beside it: which verses its notes cover. */
  note?: string;
}

export function Picker({
  heading,
  noun,
  starsKey,
  starred,
  items,
  module,
  hasLabel,
  noneLabel,
  emptyLabel,
  onPick,
  onClose,
}: {
  /** "Commentaries". */
  heading: string;
  /** "commentaries", for the filter. */
  noun: string;
  /** Where the stars are kept, and which are starred at first. */
  starsKey: string;
  starred: string[];
  items: PickItem[];
  module: string;
  /** Above those with something: "Notes on John 3:16". */
  hasLabel: string;
  /** Above the rest: "Nothing on this verse". */
  noneLabel: string;
  /** When none has anything. */
  emptyLabel: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [stars, setStars] = useState<string[]>(() => saved(starsKey, starred));
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => save(starsKey, stars), [starsKey, stars]);
  const f = filter.trim().toLowerCase();
  const match = (c: PickItem) => !f || c.title.toLowerCase().includes(f) || c.abbrev.toLowerCase().includes(f);
  const order = (a: PickItem, b: PickItem) => Number(stars.includes(b.id)) - Number(stars.includes(a.id)) || a.title.localeCompare(b.title);
  const has = items.filter((c) => c.has && match(c)).sort(order);
  const none = items.filter((c) => !c.has && match(c)).sort(order);
  const star = (id: string) => setStars((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const row = (c: PickItem) => (
    <div key={c.id} className={`row ${c.id === module ? "on" : ""}`}>
      <button
        className="star"
        aria-label={stars.includes(c.id) ? `Unstar ${c.title}` : `Star ${c.title}`}
        style={{ color: stars.includes(c.id) ? "#e3b341" : "var(--muted)" }}
        onClick={() => star(c.id)}
      >
        <Icon name="star" size={18} fill={stars.includes(c.id) ? "currentColor" : undefined} />
      </button>
      <button
        className="grow"
        style={{ border: "none", background: "none", textAlign: "left", minHeight: 48, padding: 0, fontSize: 16 }}
        onClick={() => onPick(c.id)}
      >
        {c.title}
      </button>
      {c.note && <span className="m">{c.note}</span>}
      {c.id === module && (
        <span style={{ color: "var(--accent)", display: "flex" }}>
          <Icon name="check" size={18} />
        </span>
      )}
    </div>
  );

  return (
    <>
      <div className="scrim" style={{ zIndex: 12 }} onClick={onClose} />
      <section className="sheet picker" style={{ zIndex: 13 }} aria-label={`Choose from the ${noun}`}>
        <div className="grab">
          <span />
        </div>
        <div className="shead">
          <h2 style={{ flex: 1 }}>{heading}</h2>
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        <label className="filter">
          <Icon name="search" size={15} />
          <input placeholder={`Filter ${noun}`} aria-label={`Filter ${noun}`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <div className="sbody">
          <p className="label">{hasLabel}</p>
          {has.length ? <div className="list">{has.map(row)}</div> : <p className="empty">{emptyLabel}</p>}
          {none.length > 0 &&
            (showAll || !has.length ? (
              <>
                <p className="label" style={{ marginTop: 16 }}>
                  {noneLabel}
                </p>
                <div className="list">{none.map(row)}</div>
              </>
            ) : (
              <button className="fold" onClick={() => setShowAll(true)}>
                {none.length} more ›
              </button>
            ))}
          <p className="m" style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Starred ones come first.
          </p>
        </div>
      </section>
    </>
  );
}
