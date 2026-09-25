import { ReactNode, useEffect } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Icon } from "./icons";
import { VoiceSelect } from "./Read";
import { Topbar } from "./Shell";
import { PROVIDER_NAME, pickModel, refreshAssistant, useAssistant } from "./assistant";
import { READ_FONTS, ReadFont, useApp } from "./state";
import { confirmDelete, Seg, Switch } from "./ui";

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
  const asst = useAssistant();
  useEffect(() => { refreshAssistant(); }, []);
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
            <Row label="Theme"><Seg value={(s.theme as string) === "midnight" ? "dark" : s.theme} options={[["auto", "Match macOS"], ["light", "Light"], ["dark", "Dark"]]} onChange={(v) => app.set({ theme: v })} /></Row>
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
          <Section title="AI assistant">
            {(["claude", "codex"] as const).map((k) => {
              const c = asst.status?.[k];
              return (
                <Row key={k} label={PROVIDER_NAME[k]}>
                  {!c ? <span className="n">Checking…</span> : c.path ? <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><Icon name="check" style={{ color: "var(--good)" }} />Found · {c.version ?? "version unknown"}</span> : <span className="n">Not installed</span>}
                </Row>
              );
            })}
            {asst.status && !asst.available && <div className="hint">Install Claude Code or Codex and sign in, and Ask appears throughout the app. Until then it stays hidden.</div>}
            {asst.models.length > 0 && <Row label="Default model"><select className="btn" value={pickModel(s.model, asst.models)} onChange={(e) => app.set({ model: e.target.value })}>{asst.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Row>}
            <Row label="Search my library" hint="In a chat about a passage, the assistant can search every commentary on it, the lexicon entries for its words, your dictionaries and your other Bibles, and does when the question calls for them."><Switch on={s.includeCommentaries} onChange={(v) => app.set({ includeCommentaries: v })} /></Row>
            <Row label="Include my journal" hint="With Search my library on, a chat about a passage can also draw on your journal entries linked to it: your prayers, notes and sermons. They are sent to Claude or OpenAI with your questions."><Switch on={s.askJournal} onChange={(v) => app.set({ askJournal: v })} /></Row>
            <Row label="Licensed text" hint="When off, no copyrighted module's text is sent: questions about the NIV, ESV and other licensed Bibles send public-domain text instead, and licensed commentaries, lexicons, dictionaries and books are left out."><Switch on={s.allowLicensed} onChange={(v) => app.set({ allowLicensed: v })}>Allow their text to be sent</Switch></Row>
            <Row label="Chats" hint="Kept on this Mac. Delete one from the Recent menu on any Ask card.">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 12.5 }}>{app.chats.length} chat{app.chats.length === 1 ? "" : "s"}</span><button className="btn small" type="button" disabled={!app.chats.length} onClick={async () => { if (await confirmDelete(`all ${app.chats.length} chats`)) app.setChats(() => []); }}><Icon name="trash" size={13} />Delete all chats</button></div>
            </Row>
          </Section>
          <Section title="Quiet time">
            <Row label="Daily reminder" hint="A notification at this time if today's reading isn't done. The app keeps running in the menu bar after its window is closed; it can't remind you once you quit it."><div style={{ display: "flex", gap: 10, alignItems: "center" }}><Switch on={s.reminder} onChange={(v) => app.set({ reminder: v })}>Remind me</Switch><input className="btn" type="time" value={s.reminderTime} disabled={!s.reminder} onChange={(e) => e.target.value && app.set({ reminderTime: e.target.value })} /></div></Row>
            <Row label="When I fall behind"><select className="btn" value={s.whenBehind} onChange={(e) => app.set({ whenBehind: e.target.value as typeof s.whenBehind })}><option value="ask">Ask me each time</option><option value="move">Move the rest later</option><option value="skip">Skip the missed readings</option></select></Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
