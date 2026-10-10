// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The journal editor's small pickers: tags (after # in the entry, or from the Tag button), a
// reference to insert or link, a highlight colour, and a misspelling's suggestions.

import { useState } from "react";
import { HL, HL_DOT, hlLabel } from "./Read";
import { useSpelling } from "./spelling";
import { HlColor, HlTheme } from "./state";
import { Popover } from "./ui";

export type TagOption = { tag: string; name?: string; colour?: HlColor; add?: boolean };
/** Tags to offer for what has been typed: the highlight themes first, then the journal's own tags,
 *  most used first, leaving out those the entry has; and a new tag when nothing matches exactly. */
export function tagOptions(q: string, themes: HlTheme[], counts: Map<string, number>, has: string[]): TagOption[] {
  const x = q.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
  const fits = (t: string, name = "") => !x || t.includes(x) || name.toLowerCase().includes(x.replace(/-/g, " "));
  const themed = themes
    .filter((t) => !has.includes(t.tag) && fits(t.tag, t.name))
    .map((t) => ({ tag: t.tag, name: t.name, colour: t.colour }));
  const own = [...counts.entries()]
    .filter(([t]) => !has.includes(t) && !themes.some((h) => h.tag === t) && fits(t))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => ({ tag }));
  const all: TagOption[] = [...themed, ...own].slice(0, 12);
  if (x && !all.some((o) => o.tag === x) && !has.includes(x)) all.push({ tag: x, add: true });
  return all;
}

/** The list of tags to pick from: under the caret after # in the entry, or with its own box (the Tag button). */
export function TagPicker({
  anchor,
  options,
  index,
  onIndex,
  onPick,
  onClose,
  query,
  onQuery,
}: {
  anchor: DOMRect;
  options: TagOption[];
  index: number;
  onIndex: (i: number) => void;
  onPick: (tag: string) => void;
  onClose: () => void;
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const box = onQuery !== undefined;
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      onIndex((index + (e.key === "ArrowDown" ? 1 : -1) + options.length) % Math.max(1, options.length));
    } else if (e.key === "Enter" && options[index]) {
      e.preventDefault();
      onPick(options[index].tag);
    }
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div
        style={{ padding: 6, display: "flex", flexDirection: "column", gap: 1 }}
        onMouseDown={(e) => {
          if (!box) e.preventDefault();
        }}
      >
        {box && (
          <label className="field" style={{ margin: "2px 2px 6px" }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                onQuery!(e.target.value);
                onIndex(0);
              }}
              onKeyDown={keys}
              placeholder="Tag, e.g. new-birth"
              aria-label="Add a tag"
            />
          </label>
        )}
        {options.length === 0 && (
          <span className="hint" style={{ padding: "4px 6px" }}>
            Type a tag
          </span>
        )}
        {options.map((o, i) => (
          <button
            key={o.tag}
            type="button"
            className="opt"
            title={o.name ? `#${o.tag}` : undefined}
            aria-selected={i === index}
            onMouseEnter={() => onIndex(i)}
            onClick={() => onPick(o.tag)}
            style={{
              background: i === index ? "var(--accentsoft)" : "none",
              border: 0,
              borderRadius: 6,
              color: "var(--text)",
              padding: "3px 6px",
              textAlign: "left",
            }}
          >
            {o.colour ? (
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: HL_DOT[o.colour], flexShrink: 0 }} />
            ) : (
              <span style={{ width: 10, flexShrink: 0, color: "var(--muted)", textAlign: "center" }}>#</span>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {o.add ? (
                <>
                  Add <b>#{o.tag}</b>
                </>
              ) : (
                (o.name ?? o.tag)
              )}
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

export function RefPrompt({
  anchor,
  label,
  placeholder = "e.g. jn 3 8 or Rom 8:28-30",
  onClose,
  onSubmit,
}: {
  anchor: DOMRect;
  label: string;
  placeholder?: string;
  onClose: () => void;
  /** False for text that isn't a reference; null when it failed for another reason (said elsewhere). */
  onSubmit: (t: string) => Promise<boolean | null>;
}) {
  const [t, setT] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <form
        style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBad((await onSubmit(t)) === false);
        }}
      >
        <span className="label">{label}</span>
        <label className="field">
          <input
            autoFocus
            value={t}
            onChange={(e) => {
              setT(e.target.value);
              setBad(false);
            }}
            placeholder={placeholder}
            aria-label={label}
          />
        </label>
        {bad && (
          <span className="err" style={{ fontSize: 12 }}>
            That isn't a reference I recognise.
          </span>
        )}
      </form>
    </Popover>
  );
}

/** The highlight colours to pick from, by name when Settings › Highlights names them; None (null)
 *  takes highlighting off. */
export function HighlightPicker({
  anchor,
  last,
  names,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  /** The colour used last, which the Highlight button puts on. */
  last: HlColor;
  names: Partial<Record<HlColor, string>> | undefined;
  onPick: (c: HlColor | null) => void;
  onClose: () => void;
}) {
  const named = HL.some((c) => names?.[c]?.trim());
  return (
    <Popover anchor={anchor} onClose={onClose} width={named ? 260 : 290}>
      {/* With names for the colours (Settings › Highlights), a list; without, a row of dots. */}
      <div
        className="hlpick"
        style={{
          padding: 8,
          display: "flex",
          flexDirection: named ? "column" : "row",
          alignItems: named ? "stretch" : "center",
          gap: named ? 2 : 8,
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {HL.map((c) => {
          const pick = () => onPick(c);
          const dot = (
            <span
              className="dot"
              style={{ background: HL_DOT[c], outline: c === last ? "2px solid var(--text)" : undefined, flexShrink: 0 }}
            />
          );
          return named ? (
            <button
              key={c}
              type="button"
              className="opt"
              aria-label={`Highlight: ${hlLabel(c, names)}`}
              title={hlLabel(c, names)}
              style={{ background: "none", border: 0, color: "var(--text)", padding: "2px 4px", textAlign: "left" }}
              onClick={pick}
            >
              {dot}
              {hlLabel(c, names)}
            </button>
          ) : (
            <button
              key={c}
              type="button"
              className="dot"
              aria-label={`Highlight ${c}`}
              title={hlLabel(c, names)}
              style={{ background: HL_DOT[c], outline: c === last ? "2px solid var(--text)" : undefined }}
              onClick={pick}
            />
          );
        })}
        <button
          className="btn small"
          type="button"
          style={named ? { marginTop: 4, alignSelf: "flex-start" } : { marginLeft: "auto" }}
          title="Take highlighting off the selection"
          onClick={() => onPick(null)}
        >
          None
        </button>
      </div>
    </Popover>
  );
}

/** A misspelling's (or grammar problem's) menu: suggestions, Change back, Add to dictionary, Ignore. */
export function SpellMenu({ spell }: { spell: ReturnType<typeof useSpelling> }) {
  if (!spell.menu) return null;
  return (
    <Popover anchor={spell.menu.rect} onClose={spell.closeMenu} width={spell.menu.grammar !== undefined ? 280 : 220}>
      <div style={{ padding: 6, display: "flex", flexDirection: "column" }}>
        {spell.menu.grammar !== undefined && (
          <span className="n" style={{ padding: "6px 10px", lineHeight: 1.4 }}>
            {spell.menu.grammar || "Possible grammar problem"}
          </span>
        )}
        {spell.menu.was && (
          <button className="opt" type="button" onClick={() => spell.choose(spell.menu!.was!)}>
            Change back to “{spell.menu.was}”
          </button>
        )}
        {spell.menu.guesses.map((g) => (
          <button key={g} className="opt" type="button" style={{ fontWeight: 600 }} onClick={() => spell.choose(g)}>
            {g}
          </button>
        ))}
        {!spell.menu.was && !spell.menu.guesses.length && spell.menu.grammar === undefined && (
          <span className="n" style={{ padding: "6px 10px" }}>
            No suggestions
          </span>
        )}
        {!spell.menu.was && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            {spell.menu.grammar === undefined && (
              <button className="opt" type="button" onClick={spell.learn}>
                Add “{spell.menu.word}” to dictionary
              </button>
            )}
            <button className="opt" type="button" onClick={spell.ignore}>
              Ignore
            </button>
          </>
        )}
      </div>
    </Popover>
  );
}
