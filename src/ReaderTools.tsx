// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Pieces the Bible reader and the book reader share: the highlight colours on the selection's
// toolbar, ⌘C for the selection, and the hints along the foot of focus mode.

import { useEffect, useRef } from "react";
import { HL_COLOURS, HlColor } from "./state";

export const HL_DOT: Record<HlColor, string> = {
  red: "#e59a92",
  orange: "#efb97e",
  yellow: "#e9d271",
  green: "#a9cf9f",
  teal: "#8fcfc6",
  blue: "#9fc0e6",
  purple: "#c1a9e3",
  grey: "#aab3bf",
};
/** A highlight colour's name in the pickers: the user's name for it (Settings › Highlights), or the colour. */
export const hlLabel = (c: HlColor, names: Partial<Record<HlColor, string>> | undefined) =>
  names?.[c]?.trim() || c[0].toUpperCase() + c.slice(1);

/** The colour dots at the start of a selection's toolbar, and the name of the one it has, when the user named it. */
export function HighlightDots({
  current,
  names,
  onPick,
}: {
  current: HlColor | undefined;
  names: Partial<Record<HlColor, string>> | undefined;
  onPick: (c: HlColor | null) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "0 6px 0 4px" }}>
      {HL_COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          className="dot"
          aria-label={`Highlight: ${hlLabel(c, names)}`}
          title={hlLabel(c, names)}
          aria-pressed={current === c}
          style={{ background: HL_DOT[c], outline: current === c ? "2px solid var(--vt-ring)" : undefined }}
          onClick={() => onPick(current === c ? null : c)}
        />
      ))}
      {current && names?.[current]?.trim() && (
        <span
          style={{ fontSize: 12, alignSelf: "center", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {hlLabel(current, names)}
        </span>
      )}
    </div>
  );
}

/** ⌘C (which the Edit menu turns into a copy event) copies what `get` gives, unless some text has
 *  been selected with the mouse or the focus is in a text field. */
export function useCopySelection(get: () => { text: string; label: string } | null, toast: (msg: string) => void) {
  const latest = useRef({ get, toast });
  useEffect(() => {
    latest.current = { get, toast };
  });
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const t = document.activeElement as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      const s = window.getSelection();
      if (s && !s.isCollapsed && s.toString().trim()) return;
      const c = latest.current.get();
      if (!c || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", c.text);
      latest.current.toast(c.label);
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, []);
}

/** The keys along the foot of the screen in focus mode, after a first hint of what a click does. */
export function FocusHints({ click }: { click: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 18,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 18,
        color: "var(--muted)",
        fontSize: 12,
        pointerEvents: "none",
      }}
    >
      <span>{click}</span>
      <span>·</span>
      <span>
        <span className="kbd">space</span> listen
      </span>
      <span>·</span>
      <span>
        <span className="kbd">←</span> <span className="kbd">→</span> chapters
      </span>
    </div>
  );
}
