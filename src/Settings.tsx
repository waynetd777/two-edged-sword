import { ReactNode, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { Icon } from "./icons";
import { VoiceSelect } from "./Read";
import { Topbar } from "./Shell";
import { MODELS, READ_FONTS, ReadFont, useApp } from "./state";
import { Seg, Switch } from "./ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="label" style={{ paddingLeft: 4 }}>{title}</span>
      <div className="card" style={{ overflow: "hidden" }}>{children}</div>
    </div>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 16, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--border)", minHeight: 28 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>{children}{hint && <span className="hint">{hint}</span>}</div>
    </div>
  );
}

export function SettingsScreen() {
  const app = useApp();
  const s = app.settings;
  const [claude, setClaude] = useState<{ path: string | null; version: string | null } | null>(null);
  useEffect(() => { api.claudeStatus().then(setClaude); }, []);
  const chooseDir = async () => {
    const d = await openDialog({ directory: true, defaultPath: app.journalDir });
    if (typeof d === "string") app.set({ journalDir: d });
  };
  return (
    <div className="main">
      <Topbar />
      <div className="scroll" style={{ flexGrow: 1 }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
          <h1 style={{ margin: 0, font: "500 30px/1 var(--display)" }}>Settings</h1>
          <Section title="Appearance">
            <Row label="Theme"><Seg value={s.theme} options={[["auto", "Match macOS"], ["light", "Light"], ["dark", "Dark"]]} onChange={(v) => app.set({ theme: v })} /></Row>
            <Row label="Reading font"><Seg value={s.readFont} options={Object.entries(READ_FONTS).map(([k, f]) => [k as ReadFont, f.label])} onChange={(v) => app.set({ readFont: v })} /></Row>
            <Row label="Reading text size">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 12 }}>A</span><input type="range" min={14} max={28} value={s.readSize} onChange={(e) => app.set({ readSize: +e.target.value })} aria-label="Reading text size" style={{ width: 200 }} /><span style={{ fontSize: 18 }}>A</span><span className="n">{s.readSize} px</span></div>
              <div style={{ font: `400 ${s.readSize}px/1.6 var(--serif)`, marginTop: 6 }}><span className={s.redLetters ? "red" : undefined}>For God so loved the world…</span></div>
            </Row>
            <Row label="Words of Jesus in red"><Switch on={s.redLetters} onChange={(v) => app.set({ redLetters: v })} /></Row>
            <Row label="Copying verses" hint="⌘C or Copy on the verse toolbar. The reference and translation always go on the last line."><Switch on={s.copyNumbers} onChange={(v) => app.set({ copyNumbers: v })}>Include verse numbers</Switch></Row>
            <Row label="Show verses as"><Seg value={s.layout} options={[["verse", "One per line"], ["paragraph", "Paragraphs"]]} onChange={(v) => app.set({ layout: v })} /></Row>
          </Section>
          <Section title="Bibles">
            <Row label="Default translation"><select className="btn" value={s.bible} onChange={(e) => app.set({ bible: e.target.value })}>{app.bibles.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></Row>
            <Row label="Compare starts with" hint="Change them on the Compare screen."><div style={{ display: "flex", gap: 5 }}>{s.compare.map((c) => <span key={c} className="chip" style={{ cursor: "default" }}>{app.mod("bible", c)?.abbrev ?? c}</span>)}</div></Row>
            <Row label="Library" hint="Checked for new modules each time the app opens, or press Rescan on the Library screen."><span style={{ fontSize: 12.5 }}>e-Sword X · {app.lib?.modules.length} modules · read-only</span></Row>
          </Section>
          <Section title="Listening">
            <Row label="Voice" hint="More voices: System Settings › Accessibility › Spoken Content › System Voice › Manage Voices."><div style={{ width: 320 }}><VoiceSelect /></div></Row>
            <Row label="Speed"><div style={{ display: "flex", alignItems: "center", gap: 12 }}><input type="range" min={0.5} max={2} step={0.05} value={s.rate} onChange={(e) => app.set({ rate: Math.round(+e.target.value * 100) / 100 })} aria-label="Speed" style={{ width: 200 }} /><b>{s.rate}×</b></div></Row>
            <Row label="While reading aloud">
              <Switch on={s.highlightWords} onChange={(v) => app.set({ highlightWords: v })}>Highlight each word</Switch>
              <Switch on={s.continueChapter} onChange={(v) => app.set({ continueChapter: v })}>Continue into the next chapter</Switch>
              <Switch on={s.readNumbers} onChange={(v) => app.set({ readNumbers: v })}>Read verse numbers</Switch>
            </Row>
          </Section>
          <Section title="Journal">
            <Row label="Save journal to" hint="One Markdown file per month, e.g. 2026-09.md. In your Obsidian vault the entries open there too.">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><code style={{ fontSize: 12 }}>{app.journalDir.replace(/^\/Users\/[^/]+/, "~")}</code><button className="btn small" type="button" onClick={chooseDir}>Change…</button>{s.journalDir && <button className="btn small" type="button" onClick={() => app.set({ journalDir: "" })}>Use default</button>}</div>
            </Row>
            <Row label="Show notes beside verses"><Switch on={s.showNotes} onChange={(v) => app.set({ showNotes: v })} /></Row>
          </Section>
          <Section title="Ask Claude">
            <Row label="Claude Code">
              {claude === null ? <span className="n">Checking…</span> : claude.path ? <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><Icon name="check" style={{ color: "var(--good)" }} />Found · {claude.version ?? "version unknown"}</span> : <span className="err" style={{ fontSize: 12.5 }}>Not found. Install Claude Code and sign in to use Ask.</span>}
            </Row>
            <Row label="Default model"><Seg value={s.model} options={MODELS.map((m) => [m.id, m.name] as [typeof m.id, string])} onChange={(v) => app.set({ model: v })} /></Row>
            <Row label="Include commentaries" hint="Adds what your commentaries say about the verses to each question."><Switch on={s.includeCommentaries} onChange={(v) => app.set({ includeCommentaries: v })} /></Row>
            <Row label="Licensed translations" hint="When off, questions about the NIV, ESV and other licensed Bibles send public-domain text instead."><Switch on={s.allowLicensed} onChange={(v) => app.set({ allowLicensed: v })}>Allow their text to be sent</Switch></Row>
            <Row label="Chats" hint="Kept on this Mac. Delete one from the Recent menu on any Ask card.">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 12.5 }}>{app.chats.length} chat{app.chats.length === 1 ? "" : "s"}</span><button className="btn small" type="button" disabled={!app.chats.length} onClick={() => { if (window.confirm("Delete all chats? This can't be undone.")) app.setChats(() => []); }}><Icon name="trash" size={13} />Delete all chats</button></div>
            </Row>
          </Section>
          <Section title="Reading plan">
            <Row label="When I fall behind"><select className="btn" value={s.whenBehind} onChange={(e) => app.set({ whenBehind: e.target.value as typeof s.whenBehind })}><option value="ask">Ask me each time</option><option value="move">Move the rest later</option><option value="skip">Skip the missed readings</option></select></Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
