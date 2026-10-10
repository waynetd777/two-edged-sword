// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Ask in the journal: about the entry open (or the part of it selected), or about the entries the
// list shows. An answer can be put into the entry.

import { useMemo } from "react";
import { api, JournalEntry } from "./api";
import { AskPanel } from "./Ask";
import { parseRef, Ref } from "./bible";
import { Icon } from "./icons";
import { useApp } from "./state";
import { Seg } from "./ui";

/** `listed` are the entries the list shows (filtered), which a whole-journal Ask is about; `listedLabel` says which. */
export function JournalAsk({
  entry,
  scope,
  setScope,
  picked,
  setPicked,
  listed,
  listedLabel,
  onInsert,
  onClose,
}: {
  entry: JournalEntry;
  scope: "entry" | "journal";
  setScope: (s: "entry" | "journal") => void;
  /** Text selected in the entry, which an Ask about the entry is then about. */
  picked: string;
  setPicked: (t: string) => void;
  listed: JournalEntry[];
  listedLabel: string;
  onInsert: (md: string, tags?: string[]) => void;
  onClose: () => void;
}) {
  const app = useApp();
  // An Ask about the entry gets its first Bible reference as its passage (with the library's
  // material on it) and the rest of the journal to search.
  const passage = useMemo(() => entry.verses.map((v) => parseRef(v)).find((r): r is Ref => !!r) ?? null, [entry.verses]);
  const others = useMemo(() => app.journal.filter((e) => e.id !== entry.id), [app.journal, entry.id]);
  return (
    <div
      className="card"
      style={{
        position: "absolute",
        right: 20,
        bottom: 60,
        width: 380,
        zIndex: 20,
        boxShadow: "0 14px 40px var(--shadow)",
        borderRadius: 12,
        padding: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 0", flexWrap: "wrap" }}>
        <Seg
          value={scope}
          options={[
            ["entry", "This entry"],
            ["journal", "Whole journal"],
          ]}
          onChange={setScope}
        />
        <button className="ibtn" type="button" aria-label="Close" title="Close" style={{ marginLeft: "auto" }} onClick={onClose}>
          <Icon name="x" />
        </button>
        {scope === "entry" && picked && (
          <span className="chip" style={{ maxWidth: "100%", cursor: "default" }} title={picked}>
            <span className="t" style={{ minWidth: 0 }}>
              On “{picked}”
            </span>
            <button
              className="ibtn"
              type="button"
              aria-label="Ask about the whole entry"
              title="Ask about the whole entry"
              style={{ width: 16, height: 16 }}
              onClick={() => setPicked("")}
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        )}
        {scope === "journal" && (
          <span className="n" style={{ flexBasis: "100%" }}>
            Searches {listedLabel} ({listed.length} {listed.length === 1 ? "entry" : "entries"}).
          </span>
        )}
      </div>
      {scope === "entry" ? (
        <AskPanel
          key={`entry|${entry.id}`}
          source="Journal"
          opened={{ entry: entry.id }}
          label={entry.title || "this entry"}
          style={{ border: 0, background: "transparent", boxShadow: "none" }}
          passage={passage}
          journal={others}
          journalDir={(id) =>
            api.journalExport(
              id,
              "the whole journal",
              app.journal.map((e) => (e.id === entry.id ? entry : e)),
            )
          }
          context={() =>
            [
              `The user's journal entry, “${entry.title}”${entry.verses.length ? ` (on ${entry.verses.join(", ")})` : ""}${entry.tags.length ? ` #${entry.tags.join(" #")}` : ""}:\n${entry.body || "(nothing written yet)"}`,
              picked && `They have selected this part of it and are asking about it:\n“${picked}”`,
            ]
              .filter(Boolean)
              .join("\n\n")
          }
          suggestions={
            picked
              ? ["Explain this", "Suggest verses that speak to this", "Help me say this more clearly"]
              : !entry.body.trim()
                ? [
                    `Give me a few prompts to start writing${entry.verses.length ? ` on ${entry.verses.join(", ")}` : ""}`,
                    ...(entry.verses.length ? [] : ["Suggest a verse to reflect on today"]),
                    "Give me questions to reflect on",
                  ]
                : [
                    "Suggest cross-references I haven't linked",
                    "Give me questions to reflect on",
                    ...(others.length ? ["What else in my journal connects with this?"] : []),
                  ]
          }
          onInsert={onInsert}
        />
      ) : (
        <AskPanel
          key={`journal|${listedLabel}`}
          source="Journal"
          label={listedLabel}
          style={{ border: 0, background: "transparent", boxShadow: "none" }}
          journalDir={(id) =>
            api.journalExport(
              id,
              listedLabel,
              listed.map((e) => (e.id === entry.id ? entry : e)),
            )
          }
          context={() => `The entry they have open is “${entry.title || "Untitled"}” (${entry.created.slice(0, 10)}).`}
          suggestions={[
            "What themes keep coming back in my journal?",
            "Which verses do I return to most, and what have I said about them?",
            "How has my thinking changed over time?",
            "What have I been praying about lately?",
          ]}
          onInsert={onInsert}
        />
      )}
    </div>
  );
}
