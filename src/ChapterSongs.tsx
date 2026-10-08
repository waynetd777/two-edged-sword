// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Songs for this chapter: a button in the reader's top bar that has the assistant choose worship
// songs from the Music library to suit the chapter open (a Bible's or a book's), as Quiet time's
// Worship part does (worship.ts). Asks how many, says why each suits the chapter, and plays them in
// Music on Play, their words on the Lyrics page.

import { useState } from "react";
import { Working } from "./Ask";
import { api } from "./api";
import { Icon, Play } from "./icons";
import { usePlayer } from "./speech";
import { useApp } from "./state";
import { Popover } from "./ui";
import { Picked, pickChapterSongs, setChapterPlaying } from "./worship";

const COUNTS = [1, 2, 3, 4, 5, 6, 8];
let lastCount = 4; // what was asked for last, this session

/** `about` names the chapter for the assistant ("Romans 8"), `label` for the card if shorter;
 *  `text` gives a book chapter's words, read when asked. */
export function SongsButton({ about, label, text }: { about: string; label?: string; text?: () => string }) {
  const app = useApp();
  const player = usePlayer();
  const [a, setA] = useState<DOMRect | null>(null);
  const [n, setN] = useState(lastCount);
  // The chapter it was chosen for, so another chapter starts again from the count.
  const [got, setGot] = useState<{ about: string; picked: Picked | null } | null>(null);
  const cur = got?.about === about ? got : null;
  // After Choose again, different songs rather than the ones kept.
  const [again, setAgain] = useState(false);
  const choose = () => {
    lastCount = n;
    setGot({ about, picked: null });
    pickChapterSongs(n, about, text?.() ?? "", app.settings.model, again)
      .catch((e): Picked => ({ songs: [], note: e instanceof Error ? e.message : String(e) }))
      .then((picked) => setGot((g) => (g?.about === about ? { about, picked } : g)));
  };
  const play = (p: Picked) =>
    api
      .musicPlay(p.songs.map((x) => x.id))
      .then((found) => {
        if (!found) return app.toast("Couldn't find the songs in Music");
        setChapterPlaying(p.songs);
        // The songs, not the chapter read aloud: its player stops and closes.
        player.stop();
        setA(null);
        app.openLyrics();
      })
      .catch((e) => app.toast(String(e)));
  const p = cur?.picked;
  return (
    <>
      <button
        className="ibtn"
        type="button"
        aria-label="Songs for this chapter"
        title="Songs for this chapter: worship songs from Music that relate to it"
        onClick={(e) => setA(e.currentTarget.getBoundingClientRect())}
      >
        <Icon name="music" />
      </button>
      {a && (
        <Popover anchor={a} onClose={() => setA(null)} width={460}>
          <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="label">Songs for {label ?? about}</span>
            {!cur ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="n">How many</span>
                  <div className="seg">
                    {COUNTS.map((k) => (
                      <button key={k} type="button" className={k === n ? "on" : ""} onClick={() => setN(k)}>
                        {k}
                      </button>
                    ))}
                  </div>
                  <button className="btn primary small" type="button" style={{ marginLeft: "auto" }} onClick={choose}>
                    Choose songs
                  </button>
                </div>
                <div className="hint" style={{ fontSize: 12.5 }}>
                  The AI assistant picks them from the worship songs in your Music library.
                </div>
              </>
            ) : !p ? (
              <Working text="Choosing songs" />
            ) : (
              <>
                {p.intro && <p style={{ margin: 0, font: "400 15px/1.55 var(--serif)" }}>{p.intro}</p>}
                {p.note && (
                  <div className={p.songs.length ? "hint" : "err"} style={{ fontSize: 12.5 }}>
                    {p.note}
                  </div>
                )}
                {p.songs.length > 0 && (
                  <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.songs.map((x) => (
                      <li key={x.id}>
                        <b style={{ fontWeight: 600 }}>{x.name}</b> <span className="n">— {x.artist}</span>
                        {x.why && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)", marginTop: 2 }}>{x.why}</div>}
                      </li>
                    ))}
                  </ol>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {p.songs.length > 0 && (
                    <button className="btn primary" type="button" title="Play these songs in Music" onClick={() => play(p)}>
                      <Play size={12} />
                      Play songs
                    </button>
                  )}
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setGot(null);
                      setAgain(true);
                    }}
                  >
                    Choose again
                  </button>
                </div>
              </>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
