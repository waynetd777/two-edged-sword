// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { ReactNode, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { Icon } from "./icons";
import { HL, HL_DOT, hlLabel, VoiceSelect } from "./Read";
import { BibleSelect, Topbar } from "./Shell";
import { modelGroups, PROVIDER_NAME, pickModel, refreshAssistant, useAssistant } from "./assistant";
import { READ_FONTS, ReadFont, useApp } from "./state";
import { confirmDelete, Popover, SearchList, Seg, Switch } from "./ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="label" style={{ paddingLeft: 4 }}>
        {title}
      </span>
      <div className="card" style={{ overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px minmax(0,1fr)",
        gap: 16,
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        minHeight: 28,
      }}
    >
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
        {children}
        {hint && <span className="hint">{hint}</span>}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const app = useApp();
  const s = app.settings;
  const asst = useAssistant();
  useEffect(() => {
    refreshAssistant();
  }, []);
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
            <Row label="Theme">
              <Seg
                value={(s.theme as string) === "midnight" ? "dark" : s.theme}
                options={[
                  ["auto", "Match macOS"],
                  ["light", "Light"],
                  ["dark", "Dark"],
                ]}
                onChange={(v) => app.set({ theme: v })}
              />
            </Row>
            <Row label="Reading font">
              <Seg
                value={s.readFont}
                options={Object.entries(READ_FONTS).map(([k, f]) => [k as ReadFont, f.label])}
                onChange={(v) => app.set({ readFont: v })}
              />
            </Row>
            <Row label="Reading text size">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12 }}>A</span>
                <input
                  type="range"
                  min={14}
                  max={28}
                  value={s.readSize}
                  onChange={(e) => app.set({ readSize: +e.target.value })}
                  aria-label="Reading text size"
                  style={{ width: 200 }}
                />
                <span style={{ fontSize: 18 }}>A</span>
                <span className="n">{s.readSize} px</span>
              </div>
              <div style={{ font: `400 ${s.readSize}px/1.6 var(--serif)`, marginTop: 6 }}>
                <span className={s.redLetters ? "red" : undefined}>For God so loved the world…</span>
              </div>
            </Row>
            <Row label="Words of Jesus in red">
              <Switch on={s.redLetters} onChange={(v) => app.set({ redLetters: v })} />
            </Row>
            <Row
              label="Greek and Hebrew Bibles"
              hint="For those with Strong's numbers but no English of their own, such as Hebrew OT+ and Greek NT BYZ+: each word's commonest rendering in the KJV, from your concordance."
            >
              <Switch on={s.kjvGlosses} onChange={(v) => app.set({ kjvGlosses: v })}>
                English under each word
              </Switch>
            </Row>
            <Row label="Copying verses" hint="⌘C or Copy on the verse toolbar. The reference and translation always go on the last line.">
              <Switch on={s.copyNumbers} onChange={(v) => app.set({ copyNumbers: v })}>
                Include verse numbers
              </Switch>
            </Row>
            <Row label="Show verses as">
              <Seg
                value={s.layout}
                options={[
                  ["verse", "One per line"],
                  ["paragraph", "Paragraphs"],
                ]}
                onChange={(v) => app.set({ layout: v })}
              />
            </Row>
          </Section>
          <Section title="Bibles">
            <Row label="Default translation">
              <BibleSelect titled all value={app.defaultBible} onChange={app.setDefaultBible} style={{ maxWidth: "min(360px, 100%)" }} />
            </Row>
            <Row
              label="Favourite translations"
              hint="Up to three. Buttons to the left of Paragraph and Verse in the reader switch to them."
            >
              <FavBibles />
            </Row>
            <Row label="Compare starts with" hint="Change them on the Compare screen.">
              <div style={{ display: "flex", gap: 5 }}>
                {s.compare.map((c) => (
                  <span key={c} className="chip" style={{ cursor: "default" }}>
                    {app.mod("bible", c)?.abbrev ?? c}
                  </span>
                ))}
              </div>
            </Row>
            <Row label="Library" hint="Checked for new modules each time the app opens, or press Rescan on the Library screen.">
              <span style={{ fontSize: 12.5 }}>e-Sword X · {app.lib?.modules.length} modules · read-only</span>
            </Row>
          </Section>
          <Section title="Highlights">
            <Row
              label="Colour names"
              hint="What each colour stands for, such as a theme. The highlight pickers show the names; leave one blank to keep the colour's own name."
            >
              <HlNames />
            </Row>
          </Section>
          <Section title="Listening">
            <Row label="Voice" hint="More voices: System Settings › Accessibility › Spoken Content › System Voice › Manage Voices.">
              <div style={{ width: 320 }}>
                <VoiceSelect />
              </div>
            </Row>
            <Row
              label="Hebrew voice"
              hint="For the Hebrew Bibles and the Targums. macOS's Hebrew voices (Carmit) speak the modern pronunciation."
            >
              <div style={{ width: 320 }}>
                <VoiceSelect lang="he" />
              </div>
            </Row>
            <Row label="Greek voice" hint="For the Greek Bibles. macOS's Greek voices (Melina) speak the modern pronunciation.">
              <div style={{ width: 320 }}>
                <VoiceSelect lang="el" />
              </div>
            </Row>
            <Row
              label="Latin voice"
              hint="For the Latin Vulgates. An Italian voice (Alice, Luca, Federica) says Church Latin the way it is said."
            >
              <div style={{ width: 320 }}>
                <VoiceSelect lang="la" />
              </div>
            </Row>
            <Row label="Speed">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={s.rate}
                  onChange={(e) => app.set({ rate: Math.round(+e.target.value * 100) / 100 })}
                  aria-label="Speed"
                  style={{ width: 200 }}
                />
                <b>{s.rate}×</b>
              </div>
            </Row>
            <Row label="While reading aloud">
              <Switch on={s.highlightWords} onChange={(v) => app.set({ highlightWords: v })}>
                Highlight each word
              </Switch>
              <Switch on={s.continueChapter} onChange={(v) => app.set({ continueChapter: v })}>
                Continue into the next chapter
              </Switch>
              <Switch on={s.continueEntry} onChange={(v) => app.set({ continueEntry: v })}>
                Continue into the next journal entry
              </Switch>
              <Switch on={s.readNumbers} onChange={(v) => app.set({ readNumbers: v })}>
                Read verse numbers
              </Switch>
            </Row>
            <Row label="While a song plays" hint="Behind the words on the Lyrics page, in the artwork's colours.">
              <Switch on={s.songVisions} onChange={(v) => app.set({ songVisions: v })}>
                Show pictures: a cross, a dove, stars and more
              </Switch>
            </Row>
          </Section>
          <Section title="Journal">
            <Row
              label="Save journal to"
              hint="One Markdown file per month, e.g. 2026-09.md. In your Obsidian vault the entries open there too."
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <code style={{ fontSize: 12 }}>{app.journalDir.replace(/^\/Users\/[^/]+/, "~")}</code>
                <button className="btn small" type="button" onClick={chooseDir}>
                  Change…
                </button>
                {s.journalDir && (
                  <button className="btn small" type="button" onClick={() => app.set({ journalDir: "" })}>
                    Use default
                  </button>
                )}
              </div>
            </Row>
            <Row label="Show notes beside verses">
              <Switch on={s.showNotes} onChange={(v) => app.set({ showNotes: v })} />
            </Row>
            <Row label="Check grammar" hint="With spelling, by macOS: a blue underline, and a click explains it.">
              <Switch on={s.journalGrammar ?? true} onChange={(v) => app.set({ journalGrammar: v })} />
            </Row>
          </Section>
          <Section title="AI assistant">
            {(["claude", "codex", "antigravity", "copilot"] as const).map((k) => {
              const c = asst.status?.[k];
              return (
                <Row key={k} label={PROVIDER_NAME[k]}>
                  {!c ? (
                    <span className="n">Checking…</span>
                  ) : c.path ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                      <Icon name="check" style={{ color: "var(--good)" }} />
                      Found · {c.version ?? "version unknown"}
                      {k !== "claude" && !c.models.length ? " · no models: run it once in Terminal to sign in" : ""}
                    </span>
                  ) : (
                    <span className="n">Not installed</span>
                  )}
                </Row>
              );
            })}
            {asst.status && !asst.available && (
              <div className="hint">
                Install Claude Code, Codex, Antigravity or GitHub Copilot and sign in, and Ask appears throughout the app. Until then it
                stays hidden.
              </div>
            )}
            {asst.models.length > 0 && (
              <Row label="Default model">
                <select
                  className="btn"
                  style={{ maxWidth: "min(360px, 100%)" }}
                  value={pickModel(s.model, asst.models)}
                  onChange={(e) => app.set({ model: e.target.value })}
                >
                  {modelGroups(asst.models).map((g) => (
                    <optgroup key={g.provider} label={g.name}>
                      {g.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Row>
            )}
            <Row
              label="Search my library"
              hint="In a chat about a passage, the assistant can search every commentary on it, the lexicon entries for its words, your dictionaries and your other Bibles, and does when the question calls for them."
            >
              <Switch on={s.includeCommentaries} onChange={(v) => app.set({ includeCommentaries: v })} />
            </Row>
            <Row
              label="Include my journal"
              hint="With Search my library on, a chat about a passage can also draw on your journal entries linked to it: your prayers, notes and sermons. They go to the AI (Anthropic, OpenAI or Google) with your questions."
            >
              <Switch on={s.askJournal} onChange={(v) => app.set({ askJournal: v })} />
            </Row>
            <Row
              label="Suggest a next question"
              hint="After each answer, the assistant reads the last few questions and answers and offers a follow-up in the empty box; → or Tab types it in. It's one more call to the assistant per answer."
            >
              <Switch on={s.askSuggest} onChange={(v) => app.set({ askSuggest: v })} />
            </Row>
            <Row
              label="Licensed text"
              hint="When off, no copyrighted module's text is sent: questions about the NIV, ESV and other licensed Bibles send public-domain text instead, and licensed commentaries, lexicons, dictionaries and books are left out."
            >
              <Switch on={s.allowLicensed} onChange={(v) => app.set({ allowLicensed: v })}>
                Allow their text to be sent
              </Switch>
            </Row>
            <Row label="Chats" hint="Kept on this Mac. Delete one from the Recent menu on any Ask card.">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12.5 }}>
                  {app.chats.length} chat{app.chats.length === 1 ? "" : "s"}
                </span>
                <button
                  className="btn small"
                  type="button"
                  disabled={!app.chats.length}
                  onClick={async () => {
                    if (await confirmDelete(`all ${app.chats.length} chats`)) app.setChats(() => []);
                  }}
                >
                  <Icon name="trash" size={13} />
                  Delete all chats
                </button>
              </div>
            </Row>
          </Section>
          <Section title="Quiet time">
            <Row
              label="Daily reminder"
              hint="A notification at this time if today's reading isn't done. The app keeps running in the menu bar after its window is closed; it can't remind you once you quit it."
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Switch on={s.reminder} onChange={(v) => app.set({ reminder: v })}>
                  Remind me
                </Switch>
                <input
                  className="btn"
                  type="time"
                  value={s.reminderTime}
                  disabled={!s.reminder}
                  onChange={(e) => e.target.value && app.set({ reminderTime: e.target.value })}
                />
              </div>
            </Row>
            <Row label="When I fall behind">
              <select
                className="btn"
                style={{ maxWidth: "min(360px, 100%)" }}
                value={s.whenBehind}
                onChange={(e) => app.set({ whenBehind: e.target.value as typeof s.whenBehind })}
              >
                <option value="ask">Ask me each time</option>
                <option value="move">Move the rest later</option>
                <option value="skip">Skip the missed readings</option>
              </select>
            </Row>
          </Section>
          <AppVersion />
        </div>
      </div>
    </div>
  );
}

/** The favourite Bibles: chips to take one off, and Add while there are fewer than three. */
/** A name for each highlight colour, saved as it's typed. */
function HlNames() {
  const app = useApp();
  const names = app.settings.hlNames ?? {};
  return (
    <div className="hlnames" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 14px", width: "100%" }}>
      {HL.map((c) => (
        <label key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dot" title={hlLabel(c, names)} style={{ background: HL_DOT[c], flexShrink: 0 }} />
          <input
            className="btn"
            style={{ flexGrow: 1, minWidth: 0 }}
            value={names[c] ?? ""}
            placeholder={c[0].toUpperCase() + c.slice(1)}
            aria-label={`Name for ${c}`}
            onChange={(e) => app.set({ hlNames: { ...names, [c]: e.target.value } })}
          />
        </label>
      ))}
    </div>
  );
}

/** "Two-edged Sword 1.0.3 (build 20260927.142514)", under the last section. */
function AppVersion() {
  const [v, setV] = useState<[string, string] | null>(null);
  useEffect(() => {
    api
      .appVersion()
      .then(setV)
      .catch(() => {});
  }, []);
  if (!v) return null;
  return (
    <div className="hint" style={{ textAlign: "center", userSelect: "text", display: "flex", flexDirection: "column", gap: 2 }}>
      <span>
        Two-edged Sword {v[0]} (build {v[1]})
      </span>
      <span>Free software under the GNU General Public License, version 3 or later</span>
    </div>
  );
}

function FavBibles() {
  const app = useApp();
  const favs = app.settings.favBibles ?? [];
  const [a, setA] = useState<DOMRect | null>(null);
  const set = (next: string[]) => app.set({ favBibles: next });
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
      {favs.map((id) => (
        <span key={id} className="chip" style={{ cursor: "default" }} title={app.mod("bible", id)?.title}>
          {app.mod("bible", id)?.abbrev ?? id}
          <button
            className="ibtn"
            type="button"
            aria-label={`Remove ${app.mod("bible", id)?.abbrev ?? id}`}
            title="Remove"
            style={{ width: 16, height: 16 }}
            onClick={() => set(favs.filter((x) => x !== id))}
          >
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      {favs.length < 3 && (
        <button className="btn small" type="button" onClick={(e) => setA(e.currentTarget.getBoundingClientRect())}>
          <Icon name="plus" />
          Add
        </button>
      )}
      {!favs.length && <span className="n">None yet</span>}
      {a && (
        <Popover anchor={a} onClose={() => setA(null)} width={380} style={{ padding: 0, overflow: "hidden" }}>
          <SearchList
            placeholder="Find a Bible"
            onClose={() => setA(null)}
            onPick={(id) => {
              setA(null);
              if (!favs.includes(id)) set([...favs, id].slice(0, 3));
            }}
            items={app.bibles
              .filter((b) => !favs.includes(b.id))
              .map((b) => ({ key: b.id, label: b.abbrev, sub: b.title, title: b.title, terms: b.id }))}
          />
        </Popover>
      )}
    </div>
  );
}
