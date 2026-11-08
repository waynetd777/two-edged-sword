// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The journal on the phone: a simple editor for an entry (its title, verses and text, as Markdown), the
// list of entries under More, and the list of a verse's entries that the note button opens (Read.tsx).
// Entries are the desktop's own, kept in journal.ts and synced with it.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fmtRef, parseRef, Ref } from "../../src/bible";
import { mdToHtml } from "../../src/md";
import { Icon } from "./icons";
import { Entry, entriesOn, journal, newId, nowLocal, useJournal, useJournalError } from "./journal";

// ---------- which entry is open: one editor for the whole app (App.tsx) ----------

type Editing = { id: string } | { verse?: string } | null;
let editing: Editing = null;
const editWatchers = new Set<() => void>();
const setEditing = (e: Editing) => {
  editing = e;
  editWatchers.forEach((w) => w());
};
/** Opens an entry, or a new one (on a verse, when given). */
export const openEntry = (id: string) => setEditing({ id });
export const newEntry = (verse?: Ref) => setEditing({ verse: verse ? fmtRef(verse) : undefined });

/** "2026-09-23T07:02" → "23 September 2026". */
export const entryDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};
/** The first words of an entry's text, without Markdown's marks. */
export const entryPeek = (e: Entry) =>
  e.body
    .replace(/<[^>]+>/g, "")
    .replace(/[#*_=>`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

/** The editor, over everything, while an entry is open. */
export function JournalHost({ onGo }: { onGo: (r: Ref) => void }) {
  const e = useSyncExternalStore(
    (f) => {
      editWatchers.add(f);
      return () => {
        editWatchers.delete(f);
      };
    },
    () => editing,
  );
  if (!e) return null;
  return (
    <JournalEdit
      key={"id" in e ? e.id : `new-${e.verse ?? ""}`}
      id={"id" in e ? e.id : undefined}
      verse={"verse" in e ? e.verse : undefined}
      onClose={() => setEditing(null)}
      onGo={(r) => {
        setEditing(null);
        onGo(r);
      }}
    />
  );
}

/** How much of the screen the keyboard covers, so the editor can scroll its text clear of it. */
function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => setH(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", f);
    vv.addEventListener("scroll", f);
    return () => {
      vv.removeEventListener("resize", f);
      vv.removeEventListener("scroll", f);
    };
  }, []);
  return h;
}

/** A text box as tall as its text, so the page scrolls rather than the box. */
function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function JournalEdit({ id, verse, onClose, onGo }: { id?: string; verse?: string; onClose: () => void; onGo: (r: Ref) => void }) {
  // A new entry is only kept once something is written in it.
  const [entry, setEntry] = useState<Entry>(() => {
    const was = id ? journal.find(id) : undefined;
    if (was) return was;
    const now = nowLocal();
    return { id: newId(), title: "", created: now, updated: now, verses: verse ? [verse] : [], tags: [], body: "" };
  });
  const isNew = useRef(!id || !journal.find(id));
  // An entry opens to read, formatted as the desktop shows it; a new one opens to write.
  const [editing, setEditing] = useState(isNew.current);
  const [adding, setAdding] = useState("");
  const [addErr, setAddErr] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const keyboard = useKeyboardHeight();
  const body = useRef<HTMLTextAreaElement>(null);

  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(entry);
  latest.current = entry;
  /** Changed since it was last kept. */
  const dirty = useRef(false);
  const keep = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const e = latest.current;
    if (isNew.current && !e.title.trim() && !e.body.trim()) return;
    isNew.current = false;
    dirty.current = false;
    journal.save(e);
  };
  const change = (p: Partial<Entry>) => {
    setEntry((e) => ({ ...e, ...p, updated: nowLocal() }));
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(keep, 700);
  };
  // Kept when the editor closes, however it closes; and written at once when the app goes to the
  // background, where it may be closed without another word.
  useEffect(() => {
    const away = (ev: Event) => {
      if (ev.type === "visibilitychange" && document.visibilityState === "visible") return;
      keep();
      journal.flush().catch(() => {});
    };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", away);
    return () => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", away);
      keep();
    };
  }, []);
  // Writing starts in the text.
  useEffect(() => {
    if (!editing) return;
    grow(body.current);
    if (isNew.current) setTimeout(() => body.current?.focus(), 350);
  }, [editing]);

  const addVerse = () => {
    const r = parseRef(adding.trim());
    if (!r) {
      setAddErr(true);
      return;
    }
    const v = fmtRef(r);
    if (!entry.verses.includes(v)) change({ verses: [...entry.verses, v] });
    setAdding("");
    setAddErr(false);
  };
  const go = (v: string) => {
    const r = parseRef(v);
    if (r) onGo(r);
  };
  const html = useMemo(() => (editing ? "" : mdToHtml(entry.body)), [editing, entry.body]);
  const journalError = useJournalError();

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="jedit" aria-label="Journal entry">
        <div className="shead">
          <span className="m" style={{ flex: 1 }}>
            {entryDate(entry.created)}
          </span>
          {!editing && (
            <button className="done" style={{ marginRight: 12 }} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="jbody" style={{ paddingBottom: `calc(${keyboard ? `${keyboard}px` : "var(--bottom)"} + 16px)` }}>
          {journalError && (
            <p className="m" role="alert" style={{ color: "var(--red)", margin: "0 0 10px", overflowWrap: "anywhere" }}>
              {journalError}
            </p>
          )}
          {editing ? (
            <input
              className="jtitle"
              placeholder="Enter a title"
              aria-label="Title"
              value={entry.title}
              onChange={(e) => change({ title: e.target.value })}
            />
          ) : (
            <h2 className="jtitle">{entry.title || entry.verses.join(", ") || "Untitled"}</h2>
          )}
          <div className="jverses">
            {entry.verses.map((v) => (
              <span key={v} className="jverse">
                <button className="go" style={editing ? undefined : { paddingRight: 12 }} onClick={() => go(v)}>
                  {v}
                </button>
                {editing && (
                  <button className="x" aria-label={`Remove ${v}`} onClick={() => change({ verses: entry.verses.filter((x) => x !== v) })}>
                    ✕
                  </button>
                )}
              </span>
            ))}
            {entry.tags.map((t) => (
              <span key={t} className="jtag">
                #{t}
              </span>
            ))}
            {editing && (
              <span className={`jadd ${addErr ? "bad" : ""}`}>
                <input
                  placeholder="Add a verse"
                  aria-label="Add a verse, like John 3:16"
                  value={adding}
                  enterKeyHint="done"
                  onChange={(e) => {
                    setAdding(e.target.value);
                    setAddErr(false);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && addVerse()}
                />
                {adding.trim() && (
                  <button aria-label="Add" onClick={addVerse}>
                    +
                  </button>
                )}
              </span>
            )}
          </div>
          {editing ? (
            <textarea
              ref={body}
              className="jtext"
              placeholder="Write here"
              aria-label="Entry"
              value={entry.body}
              onChange={(e) => {
                change({ body: e.target.value });
                grow(e.target);
              }}
            />
          ) : (
            <div
              className="prose jprose"
              // The desktop's own Markdown (md.ts): its highlights, headings, quotes and lists, and verse
              // references as links.
              dangerouslySetInnerHTML={{ __html: html || "<p class='m'>Nothing written yet.</p>" }}
              onClick={(e) => {
                const a = (e.target as HTMLElement).closest("a.ref") as HTMLElement | null;
                if (!a?.dataset.ref) return;
                try {
                  onGo(JSON.parse(a.dataset.ref) as Ref);
                } catch {
                  /* not a reference */
                }
              }}
            />
          )}
          {editing &&
            !isNew.current &&
            (deleting ? (
              <div className="actions" style={{ marginTop: 8 }}>
                <button className="secondary" onClick={() => setDeleting(false)}>
                  Keep
                </button>
                <button
                  className="primary danger"
                  onClick={() => {
                    window.clearTimeout(timer.current);
                    isNew.current = true; // nothing to keep on closing
                    latest.current = { ...latest.current, title: "", body: "" };
                    journal.remove(entry.id);
                    onClose();
                  }}
                >
                  Delete entry
                </button>
              </div>
            ) : (
              <button className="fold jdel" onClick={() => setDeleting(true)}>
                Delete this entry
              </button>
            ))}
        </div>
      </section>
    </>
  );
}

/** A row for an entry in a list: its title (or verses), date and first words. */
function EntryRow({ e, onOpen }: { e: Entry; onOpen: () => void }) {
  return (
    <button className="row jrow" onClick={onOpen}>
      <span className="grow" style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2 }}>
        <span className="t">{e.title || e.verses.join(", ") || "Untitled"}</span>
        <span className="m">
          {entryDate(e.created)}
          {e.title && e.verses.length ? ` · ${e.verses.join(", ")}` : ""}
        </span>
        {entryPeek(e) && <span className="p">{entryPeek(e)}</span>}
      </span>
      <span className="m">›</span>
    </button>
  );
}

/** The verse's entries, in the panel the note button opens, and a new one. */
export function VerseNotes({ at, onClose }: { at: Ref; onClose: () => void }) {
  const es = entriesOn(useJournal(), at);
  return (
    <div className="notestrip" role="group" aria-label={`Journal entries on ${fmtRef(at)}`}>
      <div className="list">
        {es.map((e) => (
          <EntryRow
            key={e.id}
            e={e}
            onOpen={() => {
              onClose();
              openEntry(e.id);
            }}
          />
        ))}
      </div>
      <button
        className="row jnew"
        onClick={() => {
          onClose();
          newEntry(at);
        }}
      >
        <Icon name="plus" size={18} />
        <span className="grow">New entry on {fmtRef(at)}</span>
      </button>
    </div>
  );
}

/** The whole journal, newest first, under More. */
export function JournalList() {
  const all = useJournal();
  // The journal couldn't be read (set aside) or saved: said over the list too, not only in an entry.
  const journalError = useJournalError();
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  const shown = f ? all.filter((e) => [e.title, e.body, ...e.verses, ...e.tags].some((x) => x.toLowerCase().includes(f))) : all;
  return (
    <>
      {journalError && (
        <p className="m" role="alert" style={{ color: "var(--red)", margin: "0 0 10px", overflowWrap: "anywhere" }}>
          {journalError}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <label className="filter" style={{ flex: 1, margin: 0 }}>
          <Icon name="search" size={15} />
          <input placeholder="Search the journal" aria-label="Search the journal" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="primary" style={{ flex: "none", padding: "0 16px" }} onClick={() => newEntry()}>
          New
        </button>
      </div>
      {!all.length ? (
        <p className="empty">
          No entries yet. Tap the note button under a verse to write one, or New here. Entries from the journal on your computer come over
          when you sync.
        </p>
      ) : !shown.length ? (
        <p className="empty">Nothing in the journal matches “{q.trim()}”.</p>
      ) : (
        <div className="card flush jlist">
          {shown.slice(0, 200).map((e) => (
            <EntryRow key={e.id} e={e} onOpen={() => openEntry(e.id)} />
          ))}
        </div>
      )}
      {shown.length > 200 && <p className="m">The newest 200 shown. Search to find others.</p>}
    </>
  );
}
