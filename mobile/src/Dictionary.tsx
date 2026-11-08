// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useMemo, useState } from "react";
import { Ref } from "../../src/bible";
import { renderHtml } from "../../src/esword";
import { api, Article, Module, save, saved } from "./api";
import { Icon } from "./icons";

/** A dictionary's entries by name, lower-cased, with plurals and "A; B" entries under each part: the
 *  desktop's topicNames (StudyPane.tsx). */
function topicNames(ts: string[]): Map<string, string> {
  const m = new Map(ts.map((t) => [t.toLowerCase(), t]));
  const add = (k: string, t: string) => k && !m.has(k) && m.set(k, t);
  for (const t of ts)
    for (const part of t.toLowerCase().split(/\s*;\s*/)) {
      const bare = part.replace(/\s*\([^)]*\)\s*$/, "").trim();
      for (const k of [part, bare]) {
        add(k, t);
        add(k.endsWith("s") ? k.slice(0, -1) : k + "s", t);
      }
    }
  return m;
}

const indexes = new Map<string, Promise<Map<string, string>>>();
const topicIndex = (module: string) => {
  let p = indexes.get(module);
  if (!p) {
    p = api.topics("dictionary", module, "", 200000).then(topicNames);
    p.catch(() => indexes.delete(module));
    indexes.set(module, p);
  }
  return p;
};

/** Words not worth an entry, though a dictionary may have one ("Lord" has; "the" mustn't show). */
const SKIP = new Set(
  "the and that this with unto them they their there then thee thou thy thine have hath shall will said from were which when what into upon also even every them were been being came come made make went more than also have shall these those your ours ours".split(
    " ",
  ),
);

/** The verse's words that have an entry in one of the dictionaries, in the order they come. */
async function verseEntries(text: string, dicts: Module[]): Promise<{ word: string; module: string; topic: string }[]> {
  const idx = await Promise.all(dicts.map((d) => topicIndex(d.id).catch(() => new Map<string, string>())));
  const out: { word: string; module: string; topic: string }[] = [];
  const seen = new Set<string>();
  for (const w of text.match(/[A-Za-z][A-Za-z’'-]+/g) ?? []) {
    const k = w.toLowerCase().replace(/[’']s$/, "");
    if (k.length < 4 || SKIP.has(k) || seen.has(k)) continue;
    for (let i = 0; i < dicts.length; i++) {
      const t = idx[i].get(k);
      if (t) {
        seen.add(k);
        out.push({ word: w, module: dicts[i].id, topic: t });
        break;
      }
    }
  }
  return out;
}

/** Dictionaries: the verse's words with entries, a look-up box, the dictionaries to switch between,
 *  and the entry. In the study sheet (with `text`, the verse) and on its own (Library, Words). */
export function DictionaryPanel({
  modules,
  text,
  start,
  onGo,
}: {
  modules: Module[];
  text?: string;
  start?: string;
  onGo: (r: Ref) => void;
}) {
  const dicts = useMemo(() => modules.filter((m) => m.kind === "dictionary"), [modules]);
  const [module, setModule] = useState<string>(() => {
    const s = saved<string>("dictionary", "easton");
    return dicts.some((d) => d.id === s) ? s : (dicts[0]?.id ?? "");
  });
  const [q, setQ] = useState(start ?? "");
  const [found, setFound] = useState<string[]>([]);
  const [entry, setEntryRaw] = useState<{ module: string; topic: string } | null>(null);
  /** The entries read before this one, for ‹ Back. */
  const [trail, setTrail] = useState<{ module: string; topic: string }[]>([]);
  /** A dictionary switched to that hasn't the entry being read: "Grace" isn't in Smith's. */
  const [missing, setMissing] = useState<{ topic: string; title: string } | null>(null);
  /** Shows an entry, keeping the one it came from for ‹ Back. */
  const setEntry = (e: { module: string; topic: string } | null, push = true) => {
    setMissing(null);
    if (push && entry && e && (e.module !== entry.module || e.topic !== entry.topic)) setTrail((t) => [...t, entry]);
    if (!e) setTrail([]);
    setEntryRaw(e);
    // The lit dictionary is always the one being read.
    if (e) setModule(e.module);
  };
  const [art, setArt] = useState<Article | null | undefined>(undefined);
  const [suggest, setSuggest] = useState<{ word: string; module: string; topic: string }[] | null>(null);
  const [names, setNames] = useState<Map<string, string> | null>(null);

  useEffect(() => save("dictionary", module), [module]);
  useEffect(() => {
    if (!module) return;
    topicIndex(module)
      .then(setNames)
      .catch(() => setNames(null));
  }, [module]);
  // The verse's words with entries, again for each verse.
  useEffect(() => {
    if (text === undefined) return;
    let live = true;
    setSuggest(null);
    setEntryRaw(null);
    setTrail([]);
    setMissing(null);
    verseEntries(text, dicts).then((s) => live && setSuggest(s));
    return () => {
      live = false;
    };
  }, [text, dicts]);
  // Typing: the dictionary's entries starting with it.
  useEffect(() => {
    const w = q.trim();
    if (!w || !module) return setFound([]);
    let live = true;
    const t = setTimeout(
      () =>
        api
          .topics("dictionary", module, w, 40)
          .then((r) => live && setFound(r))
          .catch(() => live && setFound([])),
      120,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, module]);
  // A start word (from Words): straight to its entry when the dictionary has one.
  useEffect(() => {
    if (!start || !names) return;
    const t = names.get(start.toLowerCase());
    if (t) setEntry({ module, topic: t });
  }, [start, names]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!entry) return;
    let live = true;
    setArt(undefined);
    api
      .article("dictionary", entry.module, entry.topic)
      .then((a) => live && setArt(a))
      .catch(() => live && setArt(null));
    return () => {
      live = false;
    };
  }, [entry?.module, entry?.topic]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dicts.length) return <p className="empty">No dictionaries on this phone. The Library has Easton's, ISBE, Smith's and more.</p>;
  const open = (m: string, topic: string) => {
    setEntry({ module: m, topic });
    setQ("");
    setFound([]);
  };
  // Switching dictionary keeps the entry when the other one has it too, and says so when it hasn't.
  const switchTo = (id: string) => {
    setModule(id);
    const was = entry ?? (missing ? { module: "", topic: missing.topic } : null);
    if (!was) return;
    topicIndex(id).then((n) => {
      const t = n.get(was.topic.toLowerCase());
      if (t) setEntry({ module: id, topic: t }, false);
      else {
        // ‹ Back returns to the entry being read, in its own dictionary.
        if (entry) setTrail((tr) => [...tr, entry]);
        setEntryRaw(null);
        setMissing({ topic: was.topic, title: dicts.find((d) => d.id === id)?.title ?? "this dictionary" });
      }
    });
  };
  /** ‹ Back: the entry before, or where it all started (the verse's words, or the look-up). */
  const back = () => {
    setMissing(null);
    const prev = trail[trail.length - 1];
    setTrail((t) => t.slice(0, -1));
    setEntryRaw(prev ?? null);
    if (prev) setModule(prev.module);
  };
  const backLabel = trail.length
    ? "‹ Back"
    : text !== undefined && (suggest?.length ?? 0) > 0
      ? "‹ This verse's words"
      : "‹ Look up another";
  const title = dicts.find((d) => d.id === entry?.module)?.title;

  return (
    <>
      <label className="filter" style={{ margin: "0 0 10px" }}>
        <Icon name="search" size={15} />
        <input
          type="search"
          placeholder="Look up a word or name"
          aria-label="Look up a word or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && found[0] && open(module, found[0])}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </label>
      <div className="chips" style={{ marginBottom: 10 }}>
        {dicts.map((d) => (
          <button key={d.id} className={`chip ${module === d.id ? "on" : ""}`} onClick={() => switchTo(d.id)}>
            {d.abbrev || d.title}
          </button>
        ))}
      </div>

      {q.trim() ? (
        found.length ? (
          <div className="list">
            {found.map((t) => (
              <button key={t} className="row" onClick={() => open(module, t)}>
                <span className="grow">{t}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">Nothing in this dictionary starts “{q.trim()}”.</p>
        )
      ) : missing ? (
        <>
          <button className="link" style={{ marginBottom: 8, fontSize: 13 }} onClick={back}>
            {backLabel}
          </button>
          <p className="empty">
            “{missing.topic}” isn't in {missing.title}.
          </p>
        </>
      ) : entry ? (
        art === undefined ? (
          <p className="empty">Opening…</p>
        ) : !art ? (
          <p className="empty">This entry couldn't be read.</p>
        ) : (
          <>
            <button className="link" style={{ marginBottom: 8, fontSize: 13 }} onClick={back}>
              {backLabel}
            </button>
            <p className="label">{title}</p>
            <h3 className="entry-title">{art.topic}</h3>
            <div className="prose">
              {renderHtml(art.html, {
                onRef: onGo,
                topic: (n) => names?.get(n.toLowerCase()),
                onTopic: (t) => setEntry({ module: entry.module, topic: t }),
              })}
            </div>
          </>
        )
      ) : text !== undefined ? (
        suggest === null ? (
          <p className="empty">Looking for this verse's words…</p>
        ) : suggest.length ? (
          <>
            <p className="label">In this verse</p>
            <div className="chips wrap">
              {suggest.map((s) => (
                <button key={s.word + s.module} className="chip" onClick={() => open(s.module, s.topic)}>
                  {s.topic}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="empty">No word in this verse has an entry. Look one up above.</p>
        )
      ) : (
        <p className="empty">Type a word or name to look it up.</p>
      )}
    </>
  );
}

/** The dictionaries over everything: from the Library's Read, or Words' look-up. */
export function DictionarySheet({
  modules,
  start,
  onGo,
  onClose,
}: {
  modules: Module[];
  start?: string;
  onGo: (r: Ref) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet tall" aria-label="Dictionaries">
        <div className="grab" onClick={onClose}>
          <span />
        </div>
        <div className="shead">
          <h2 style={{ flex: 1 }}>Dictionaries</h2>
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sbody">
          <DictionaryPanel modules={modules} start={start} onGo={onGo} />
        </div>
      </section>
    </>
  );
}
