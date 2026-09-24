import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ModuleInfo } from "./api";
import { isLicensed } from "./Ask";
import { renderHtml } from "./esword";
import { Icon } from "./icons";
import { Topbar } from "./Shell";
import { useApp } from "./state";
import { orderModules } from "./StudyPane";
import { Popover, Switch } from "./ui";

function Ordered({ kind, title, orderKey }: { kind: ModuleInfo["kind"]; title: string; orderKey: "commentaryOrder" | "dictionaryOrder" }) {
  const app = useApp();
  const ms = orderModules((app.lib?.modules ?? []).filter((m) => m.kind === kind && m.id !== app.tsk), app.settings[orderKey]);
  const move = (i: number, d: number) => {
    const ids = ms.map((m) => m.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    app.set({ [orderKey]: ids } as never);
  };
  return (
    <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 4 }}><span className="label">{title}</span><span className="n">{ms.length}</span></div>
      {ms.map((m, i) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, minHeight: 26 }}>
          <span className="n" style={{ width: 22, flexShrink: 0 }}>{i + 1}</span>
          <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.title}>{m.title}</span>
          <button className="ibtn" type="button" aria-label={`Move ${m.title} up`} style={{ width: 22, height: 22 }} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={13} /></button>
          <button className="ibtn" type="button" aria-label={`Move ${m.title} down`} style={{ width: 22, height: 22 }} disabled={i === ms.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={13} /></button>
        </div>
      ))}
      <div className="hint" style={{ paddingTop: 4 }}>The order they appear in the study pane.</div>
    </div>
  );
}

export function LibraryScreen() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ m: ModuleInfo; rect: DOMRect } | null>(null);
  const ms = app.lib?.modules ?? [];
  const n = (k: ModuleInfo["kind"]) => ms.filter((m) => m.kind === k).length;
  const hidden = app.settings.hiddenBibles;
  return (
    <div className="main">
      <Topbar />
      <div className="scroll" style={{ flexGrow: 1, padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, font: "500 30px/1 var(--display)" }}>Library</h1>
          <span style={{ color: "var(--muted)" }}>{ms.length} modules · {n("bible")} Bibles, {n("commentary")} commentaries, {n("dictionary")} dictionaries, {n("lexicon")} lexicons, {n("reference")} reference books</span>
        </div>
        <div className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <Icon name="check" size={22} style={{ color: "var(--good)" }} />
          <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 2 }}><b>Reading your e-Sword X library</b><span className="hint" style={{ fontSize: 12.5 }}>Read-only. Nothing is copied or changed, and e-Sword keeps working as before. New modules you download in e-Sword appear after a rescan.</span></div>
          <button className="btn" type="button" onClick={() => app.lib && revealItemInDir(app.lib.dir)}><Icon name="finder" />Show in Finder</button>
          <button className="btn" type="button" disabled={busy} onClick={async () => { setBusy(true); await app.rescan(); setBusy(false); app.toast("Library rescanned"); }}><Icon name="refresh" />{busy ? "Rescanning…" : "Rescan"}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="label">Bibles</div><span className="n">{n("bible")}</span>
          <span className="n" style={{ marginLeft: "auto" }}>Default</span>
          <select className="btn small" value={app.settings.bible} onChange={(e) => app.set({ bible: e.target.value })} aria-label="Default Bible">{app.bibles.map((b) => <option key={b.id} value={b.id}>{b.abbrev}</option>)}</select>
        </div>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <thead><tr>{["Translation", "Abbrev.", "Features", "Licence", "In picker"].map((h, i) => <th key={h} style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)", textAlign: i === 4 ? "right" : "left", background: "var(--panel2)", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {app.bibles.map((b) => {
              const lic = isLicensed(b);
              return (
                <tr key={b.id}>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}><a onClick={(e) => setInfo({ m: b, rect: e.currentTarget.getBoundingClientRect() })} style={{ color: "var(--text)" }}>{b.title}</a></td>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>{b.abbrev}</td>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{b.strongs ? "Strong's numbers" : ""}</td>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}><span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 500, background: lic ? "var(--pubg)" : "var(--pdbg)", color: lic ? "var(--pufg)" : "var(--pdfg)" }}>{lic ? "Personal use" : "Public domain"}</span></td>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}><Switch on={!hidden.includes(b.id)} onChange={(on) => app.set({ hiddenBibles: on ? hidden.filter((x) => x !== b.id) : [...hidden, b.id] })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          <Ordered kind="commentary" title="Commentaries" orderKey="commentaryOrder" />
          <Ordered kind="dictionary" title="Dictionaries" orderKey="dictionaryOrder" />
          {(["lexicon", "reference"] as const).map((k) => (
            <div key={k} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 4 }}><span className="label">{k === "lexicon" ? "Lexicons" : "Reference and maps"}</span><span className="n">{n(k)}</span></div>
              {ms.filter((m) => m.kind === k).map((m) => <a key={m.id} style={{ fontSize: 12.5, color: "var(--text)", minHeight: 24, display: "flex", alignItems: "center" }} onClick={(e) => setInfo({ m, rect: e.currentTarget.getBoundingClientRect() })}>{m.title}</a>)}
            </div>
          ))}
          {app.tsk && <div className="card" style={{ padding: "14px 16px" }}><span className="label">Cross-references</span><div style={{ fontSize: 12.5, marginTop: 6 }}>{app.mod("commentary", app.tsk)?.title}</div><div className="hint" style={{ marginTop: 4 }}>Always shown under the commentary.</div></div>}
        </div>
      </div>
      {info && (
        <Popover anchor={info.rect} onClose={() => setInfo(null)} width={420}>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <b style={{ font: "500 20px var(--display)", flexGrow: 1 }}>{info.m.title}</b>
              {info.m.kind === "reference" && <button className="btn small" type="button" onClick={() => { setInfo(null); app.openDoc(info.m.id); }}><Icon name="read" size={13} />Read</button>}
            </div>
            <div className="es" style={{ fontSize: 12.5, lineHeight: 1.5, maxHeight: 300, overflowY: "auto" }}>{renderHtml(info.m.info)}</div>
          </div>
        </Popover>
      )}
    </div>
  );
}
