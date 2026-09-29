// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { LibrarySource, ModuleInfo } from "./api";
import { isLicensed } from "./Ask";
import { htmlText, renderHtml } from "./esword";
import { Icon } from "./icons";
import { BibleSelect, Topbar } from "./Shell";
import { useApp } from "./state";
import { orderModules } from "./StudyPane";
import { ClearButton, Popover, Switch } from "./ui";

/** Whether a module matches the library filter: every word typed is in its title, abbreviation or file name. */
/** A file size the way Finder shows it (decimal units). */
export function fmtSize(b: number) {
  return b >= 1e9
    ? `${(b / 1e9).toFixed(1)} GB`
    : b >= 1e6
      ? `${(b / 1e6).toFixed(b >= 1e8 ? 0 : 1)} MB`
      : `${Math.max(1, Math.round(b / 1e3))} KB`;
}
const total = (ms: ModuleInfo[]) => fmtSize(ms.reduce((t, m) => t + (m.size ?? 0), 0));

const matches = (m: ModuleInfo, q: string) => {
  const t = `${m.title} ${m.abbrev} ${m.id}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w));
};

/** A module name's tooltip: its title, then the start of its description when that says more. */
function blurb(m: ModuleInfo) {
  let t = htmlText(m.info);
  if (t.toLowerCase().startsWith(m.title.toLowerCase())) t = t.slice(m.title.length).replace(/^[\s.,:;–—-]+/, "");
  if (!t) return m.title;
  if (t.length > 160) t = t.slice(0, 160).replace(/\s+\S*$/, "") + "…";
  return `${m.title}: ${t}`;
}

type ShowInfo = (m: ModuleInfo, rect: DOMRect) => void;
/** The ⓘ beside a module: its e-Sword description in a popover. */
const SOURCE: Record<LibrarySource, string> = { app: "your modules folder", esword: "e-Sword X", bundled: "built in" };

/** "12 from your modules folder, 140 from e-Sword X and 4 built in." */
const fromSources = (ms: ModuleInfo[]) => {
  const parts = (["app", "esword", "bundled"] as const)
    .map((s) => [s, ms.filter((m) => m.source === s).length] as const)
    .filter(([, k]) => k)
    .map(([s, k]) => (s === "bundled" ? `${k} ${SOURCE[s]}` : `${k} from ${SOURCE[s]}`));
  return parts.length ? `${parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]}.` : "";
};

const InfoButton = ({ m, onInfo }: { m: ModuleInfo; onInfo: ShowInfo }) => (
  <button
    className="ibtn"
    type="button"
    aria-label={`About ${m.title}`}
    title="About"
    style={{ width: 22, height: 22, flexShrink: 0 }}
    onClick={(e) => onInfo(m, e.currentTarget.getBoundingClientRect())}
  >
    <Icon name="info" size={13} />
  </button>
);

// While filtering, only the matches are listed, keeping their place numbers, and they can't be moved.
function Ordered({
  kind,
  title,
  orderKey,
  q,
  onInfo,
}: {
  kind: ModuleInfo["kind"];
  title: string;
  orderKey: "commentaryOrder" | "dictionaryOrder";
  q: string;
  onInfo: ShowInfo;
}) {
  const app = useApp();
  const ms = orderModules(
    (app.lib?.modules ?? []).filter((m) => m.kind === kind && m.id !== app.tsk),
    app.settings[orderKey],
  );
  const move = (i: number, d: number) => {
    const ids = ms.map((m) => m.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    app.set({ [orderKey]: ids } as never);
  };
  const shown = ms.map((m, i) => ({ m, i })).filter(({ m }) => !q || matches(m, q));
  if (q && !shown.length) return null;
  return (
    <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 4 }}>
        <span className="label">{title}</span>
        <span className="n">
          {q ? `${shown.length} of ${ms.length}` : ms.length} · {total(ms)}
        </span>
      </div>
      {shown.map(({ m, i }) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, minHeight: 26 }}>
          <span className="n" style={{ width: 22, flexShrink: 0 }}>
            {i + 1}
          </span>
          <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={blurb(m)}>
            {m.title}
          </span>
          <InfoButton m={m} onInfo={onInfo} />
          {!q && (
            <>
              <button
                className="ibtn"
                type="button"
                aria-label={`Move ${m.title} up`}
                style={{ width: 22, height: 22 }}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <Icon name="up" size={13} />
              </button>
              <button
                className="ibtn"
                type="button"
                aria-label={`Move ${m.title} down`}
                style={{ width: 22, height: 22 }}
                disabled={i === ms.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon name="down" size={13} />
              </button>
            </>
          )}
        </div>
      ))}
      <div className="hint" style={{ paddingTop: 4 }}>
        The order they appear in the study pane.
      </div>
    </div>
  );
}

export function LibraryScreen() {
  const app = useApp();
  const [q, setQ] = useState("");
  const bibles = app.bibles.filter((b) => !q || matches(b, q));
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ m: ModuleInfo; rect: DOMRect } | null>(null);
  const ms = app.lib?.modules ?? [];
  const n = (k: ModuleInfo["kind"]) => ms.filter((m) => m.kind === k).length;
  const hidden = app.settings.hiddenBibles;
  const showInfo: ShowInfo = (m, rect) => setInfo({ m, rect });
  const none = !!q && !ms.some((m) => m.id !== app.tsk && matches(m, q));
  return (
    <div className="main">
      <Topbar>
        <label className="field" style={{ marginLeft: 16, flexGrow: 1, maxWidth: 420 }}>
          <Icon name="search" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.preventDefault();
                e.stopPropagation();
                setQ("");
              }
            }}
            placeholder="Find a Bible, commentary or book in the library"
            aria-label="Find in library"
          />
          <ClearButton show={!!q} onClear={() => setQ("")} />
        </label>
      </Topbar>
      <div className="scroll" style={{ flexGrow: 1, padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, font: "500 30px/1 var(--display)" }}>Library</h1>
          <span style={{ color: "var(--muted)" }}>
            {ms.length} modules, {total(ms)} · {n("bible")} Bibles, {n("commentary")} commentaries, {n("dictionary")} dictionaries,{" "}
            {n("lexicon")} lexicons, {n("reference")} reference books, {n("devotional")} devotionals
          </span>
        </div>
        <div className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <Icon name="check" size={22} style={{ color: "var(--good)" }} />
          <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <b>
              Reading {n("bible")} Bibles and {ms.length - n("bible")} books
            </b>
            <span className="hint" style={{ fontSize: 12.5 }}>
              {fromSources(ms)} Read-only: nothing is copied or changed. Modules added to your folder or in e-Sword appear after a rescan.
            </span>
          </div>
          <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            <Switch
              on={app.settings.readEsword}
              onChange={async (v) => {
                app.set({ readEsword: v });
                setBusy(true);
                await app.rescan(v);
                setBusy(false);
              }}
            >
              Read e-Sword X
            </Switch>
          </span>
          <button
            className="btn"
            type="button"
            onClick={() => {
              const d = app.lib?.dirs.find((x) => x.source === "app");
              if (d) revealItemInDir(d.path);
            }}
          >
            <Icon name="finder" />
            Show in Finder
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await app.rescan();
              setBusy(false);
              app.toast("Library rescanned");
            }}
          >
            <Icon name="refresh" />
            {busy ? "Rescanning…" : "Rescan"}
          </button>
        </div>
        {!q && (
          <div className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
            <Icon name="map" size={22} style={{ color: "var(--accent)" }} />
            <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <b>Where the King James Version came from</b>
              <span className="hint" style={{ fontSize: 12.5 }}>
                The manuscript traditions and printed editions the translators worked from, and which of them are in your library.
              </span>
            </div>
            <button className="btn" type="button" aria-label="Show where the KJV came from" onClick={() => app.go("history")}>
              Show
            </button>
          </div>
        )}
        {none && <div className="empty">Nothing in the library matches “{q}”.</div>}
        {bibles.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="label">Bibles</div>
              <span className="n">
                {q ? `${bibles.length} of ${n("bible")}` : n("bible")} · {total(app.bibles)}
              </span>
              <span className="n" style={{ marginLeft: "auto" }}>
                Default
              </span>
              <BibleSelect all value={app.defaultBible} onChange={app.setDefaultBible} />
            </div>
            <table
              style={{
                borderCollapse: "separate",
                borderSpacing: 0,
                width: "100%",
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <thead>
                <tr>
                  {["Translation", "Abbrev.", "Features", "Licence", "In picker"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "var(--muted)",
                        textAlign: i === 4 ? "right" : "left",
                        background: "var(--panel2)",
                        padding: "8px 14px",
                        borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bibles.map((b) => {
                  const lic = isLicensed(b);
                  return (
                    <tr key={b.id}>
                      <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span title={blurb(b)}>{b.title}</span>
                          <InfoButton m={b} onInfo={showInfo} />
                        </span>
                      </td>
                      <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{b.abbrev}</td>
                      <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                        {b.features.join(", ")}
                      </td>
                      <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 20,
                            padding: "0 8px",
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 500,
                            background: lic ? "var(--pubg)" : "var(--pdbg)",
                            color: lic ? "var(--pufg)" : "var(--pdfg)",
                          }}
                        >
                          {lic ? "Personal use" : "Public domain"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                        <Switch
                          on={!hidden.includes(b.id)}
                          onChange={(on) => app.set({ hiddenBibles: on ? hidden.filter((x) => x !== b.id) : [...hidden, b.id] })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          <Ordered kind="commentary" title="Commentaries" orderKey="commentaryOrder" q={q} onInfo={showInfo} />
          <Ordered kind="dictionary" title="Dictionaries" orderKey="dictionaryOrder" q={q} onInfo={showInfo} />
          {(["lexicon", "reference", "devotional"] as const)
            .filter((k) => !q || ms.some((m) => m.kind === k && matches(m, q)))
            .map((k) => (
              <div key={k} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 4 }}>
                  <span className="label">{k === "lexicon" ? "Lexicons" : k === "devotional" ? "Devotionals" : "Reference and maps"}</span>
                  <span className="n">
                    {q ? `${ms.filter((m) => m.kind === k && matches(m, q)).length} of ${n(k)}` : n(k)} ·{" "}
                    {total(ms.filter((m) => m.kind === k))}
                  </span>
                </div>
                {ms
                  .filter((m) => m.kind === k && (!q || matches(m, q)))
                  .map((m) => (
                    <div key={m.id} style={{ fontSize: 12.5, minHeight: 24, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={blurb(m)}>
                        {m.title}
                      </span>
                      <InfoButton m={m} onInfo={showInfo} />
                    </div>
                  ))}
              </div>
            ))}
          {app.tsk && !q && (
            <div className="card" style={{ padding: "14px 16px" }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="label">Cross-references</span>
                <span className="n">{total(ms.filter((m) => m.id === app.tsk && m.kind === "commentary"))}</span>
              </span>
              {(() => {
                const t = app.mod("commentary", app.tsk);
                return (
                  t && (
                    <div style={{ fontSize: 12.5, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ flexGrow: 1 }} title={blurb(t)}>
                        {t.title}
                      </span>
                      <InfoButton m={t} onInfo={showInfo} />
                    </div>
                  )
                );
              })()}
              <div className="hint" style={{ marginTop: 4 }}>
                Always shown under the commentary.
              </div>
            </div>
          )}
        </div>
      </div>
      {info && (
        <Popover anchor={info.rect} onClose={() => setInfo(null)} width={420}>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <b style={{ font: "500 20px var(--display)", flexGrow: 1 }}>{info.m.title}</b>
              {(info.m.kind === "reference" || info.m.kind === "devotional") && (
                <button
                  className="btn small"
                  type="button"
                  onClick={() => {
                    setInfo(null);
                    app.openDoc(info.m.id, undefined, info.m.kind as "reference" | "devotional");
                  }}
                >
                  <Icon name="read" size={13} />
                  Read
                </button>
              )}
              {info.m.kind === "bible" && (
                <button
                  className="btn small"
                  type="button"
                  onClick={() => {
                    setInfo(null);
                    app.set({ bible: info.m.id });
                    app.open(app.loc, "read");
                  }}
                >
                  <Icon name="read" size={13} />
                  Read
                </button>
              )}
            </div>
            <div className="es" style={{ fontSize: 12.5, lineHeight: 1.5, maxHeight: 300, overflowY: "auto" }}>
              {renderHtml(info.m.info)}
            </div>
            <div className="hint" style={{ fontSize: 12 }}>
              {info.m.source === "bundled" ? "Built in" : `From ${SOURCE[info.m.source]}`}
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}
