// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { book, fmtRef, parseRef } from "./bible";
import { plainText } from "./esword";
import { Icon } from "./icons";
import { mdPlain } from "./md";
import { Screen, useApp } from "./state";
import { useAssistant } from "./assistant";
import { ClearButton } from "./ui";

interface Item {
  id: string;
  group: string;
  icon: string;
  label: string;
  sub?: string;
  kbd?: string;
  run: () => void;
}

/** ⌘K: go to a reference, search, or run a command. */
export function Palette({ onClose, onAsk }: { onClose: () => void; onAsk: (ref: string) => void }) {
  const app = useApp();
  const canAsk = useAssistant().available;
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [preview, setPreview] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ref = parseRef(q);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    setPreview("");
    if (!ref?.verse) return;
    let dead = false;
    api
      .passages(app.settings.bible, [{ book: ref.book, chapter: ref.chapter, from: ref.verse, to: ref.to ?? ref.verse }])
      .then(([p]) => {
        if (!dead) setPreview(p.verses.map((v) => plainText(v.text)).join(" "));
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const go = (s: Screen) => {
      app.go(s);
      onClose();
    };
    if (ref) {
      const l = { book: ref.book, chapter: ref.chapter, verse: ref.verse, to: ref.to };
      out.push({
        id: "go",
        group: "Go to",
        icon: "read",
        label: fmtRef(ref),
        sub: preview || undefined,
        kbd: "⏎",
        run: () => {
          app.open(l, "read");
          onClose();
        },
      });
      if (ref.verse)
        out.push({
          id: "ch",
          group: "Go to",
          icon: "read",
          label: `${book(ref.book).name} ${ref.chapter}`,
          sub: "whole chapter",
          run: () => {
            app.open({ book: ref.book, chapter: ref.chapter }, "read");
            onClose();
          },
        });
      out.push({
        id: "cmp",
        group: "Do",
        icon: "compare",
        label: `Compare ${fmtRef(ref)} in ${app.settings.compare.map((c) => app.mod("bible", c)?.abbrev ?? c).join(", ")}`,
        run: () => {
          app.open(l, "compare");
          onClose();
        },
      });
      out.push({
        id: "note",
        group: "Do",
        icon: "note",
        label: `New journal entry on ${fmtRef(ref)}`,
        run: () => {
          app.startEntry({ verses: [fmtRef(ref)] });
          onClose();
        },
      });
      if (canAsk)
        out.push({
          id: "ask",
          group: "Do",
          icon: "chat",
          label: `Ask about ${fmtRef(ref)}`,
          kbd: "⌘L",
          run: () => {
            app.open(l, "read");
            onAsk(fmtRef(ref));
            onClose();
          },
        });
    }
    if (q.trim()) {
      const up = q.trim().toUpperCase();
      if (/^[GH]\d+$/.test(up))
        out.push({
          id: "ws",
          group: "Do",
          icon: "word",
          label: `Word study ${up}`,
          run: () => {
            app.studyWord(up);
            onClose();
          },
        });
      out.push({
        id: "s",
        group: "Do",
        icon: "search",
        label: `Search everything for “${q.trim()}”`,
        kbd: "⌘3",
        run: () => {
          app.searchText(q.trim());
          onClose();
        },
      });
      const ql = q.toLowerCase();
      app.journal
        .filter((e) => (e.title + " " + e.tags.join(" ") + " " + e.verses.join(" ")).toLowerCase().includes(ql))
        .slice(0, 4)
        .forEach((e) =>
          out.push({
            id: "j" + e.id,
            group: "Journal",
            icon: "journal",
            label: e.title || "Untitled",
            sub: `${new Date(e.created).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${e.verses.join(", ") || mdPlain(e.body).slice(0, 60)}`,
            run: () => {
              app.startEntry({ openId: e.id });
              onClose();
            },
          }),
        );
    } else {
      (
        [
          ["read", "Read", "⌘1"],
          ["compare", "Compare", "⌘2"],
          ["search", "Search", "⌘3"],
          ["word", "Word Study", "⌘4"],
          ["journal", "Journal", "⌘5"],
          ["plans", "Quiet time", "⌘6"],
          ["library", "Library", "⌘7"],
          ["settings", "Settings", "⌘,"],
        ] as [Screen, string, string][]
      ).forEach(([s, l, k]) =>
        out.push({ id: s, group: "Screens", icon: s === "plans" ? "plans" : s, label: l, kbd: k, run: () => go(s) }),
      );
    }
    return out;
  }, [q, ref?.book, ref?.chapter, ref?.verse, ref?.to, preview, app, canAsk]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setI(0), [q]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      setI((x) => Math.min(items.length - 1, x + 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setI((x) => Math.max(0, x - 1));
      e.preventDefault();
    } else if (e.key === "Enter") {
      (e.altKey ? items.find((x) => x.id === "cmp") : e.shiftKey ? items.find((x) => x.id === "note") : items[i])?.run();
      e.preventDefault();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };
  let lastGroup = "";
  return (
    <div
      className="scrim"
      style={{ alignItems: "flex-start", paddingTop: 90 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-label="Go to or search" className="dialog" style={{ width: 640 }}>
        <label
          style={{ display: "flex", alignItems: "center", gap: 12, height: 58, padding: "0 18px", borderBottom: "1px solid var(--border)" }}
        >
          <Icon name="search" size={20} style={{ color: "var(--muted)" }} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={key}
            placeholder="Reference, word, Strong's number or command"
            aria-label="Reference, word or command"
            style={{ border: 0, outline: 0, background: "transparent", flexGrow: 1, font: "400 20px var(--ui)", color: "var(--text)" }}
          />
          <ClearButton show={!!q} onClear={() => setQ("")} />
          <span className="kbd">esc</span>
        </label>
        <div style={{ padding: 6, maxHeight: 460, overflowY: "auto" }}>
          {items.map((it, k) => {
            const head =
              it.group !== lastGroup ? (
                <div className="label" style={{ padding: "10px 14px 4px" }}>
                  {it.group}
                </div>
              ) : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head}
                <button
                  type="button"
                  className="bm"
                  onMouseEnter={() => setI(k)}
                  onClick={it.run}
                  style={{
                    padding: "9px 14px",
                    gap: 12,
                    alignItems: it.sub ? "flex-start" : "center",
                    background: k === i ? "var(--accentsoft)" : undefined,
                  }}
                >
                  <Icon name={it.icon} style={{ color: k === i ? "var(--accent)" : "var(--muted)", marginTop: it.sub ? 2 : 0 }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flexGrow: 1 }}>
                    <b style={{ fontWeight: it.id === "go" ? 600 : 500 }}>{it.label}</b>
                    {it.sub && (
                      <span
                        style={{
                          font: it.id === "go" ? "400 15px/1.5 var(--serif)" : "12px var(--ui)",
                          color: it.id === "go" ? "var(--text)" : "var(--muted)",
                        }}
                      >
                        {it.sub}
                      </span>
                    )}
                  </span>
                  {it.kbd && <span className="kbd">{it.kbd}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
            background: "var(--panel2)",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          <span>
            Try <b style={{ color: "var(--text)" }}>jn 3 16</b>, <b style={{ color: "var(--text)" }}>ps 23</b>,{" "}
            <b style={{ color: "var(--text)" }}>G25</b>, <b style={{ color: "var(--text)" }}>nicodemus</b>
          </span>
          <span style={{ marginLeft: "auto" }}>
            <span className="kbd">↑</span> <span className="kbd">↓</span> move
          </span>
        </div>
      </div>
    </div>
  );
}
