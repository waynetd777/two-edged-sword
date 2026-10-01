// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The words of the song playing in Music, in the reading column: the line being sung lit and kept
// in the middle, when the lyrics are timed. Music is asked where it is every second; in between
// the time is counted on here. During Quiet time's Worship part, why the song was chosen is shown.

import { Fragment, useEffect, useRef, useState } from "react";
import { api, MusicState } from "./api";
import { fmtRef } from "./bible";
import { Icon } from "./icons";
import { artworkFor, Lyrics, lyricsFor, sceneSong } from "./lyrics";
import { Topbar } from "./Shell";
import { useApp } from "./state";
import { Flames } from "./Flames";
import { useDark } from "./WebPage";

const plainLines = (text: string): Lyrics => ({
  lines: text.split(/\r?\n/).map((l) => ({ text: l.trim() })),
  timed: false,
  source: "music",
});

export function LyricsPage({ focus, setFocus }: { focus: boolean; setFocus: (f: boolean) => void }) {
  const app = useApp();
  const dark = useDark();
  const [now, setNow] = useState<MusicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Music's position when last asked, and when that was, so the time runs on between asks.
  const heard = useRef({ pos: 0, t: 0, playing: false });
  const [t, setT] = useState(0);
  useEffect(() => {
    let dead = false;
    const check = async () => {
      const sc = sceneSong;
      const scene: MusicState | null = sc
        ? { state: "playing", ours: false, album: "", lyrics: "", bpm: 0, ...sc, position: sc.position }
        : null;
      const st =
        scene ??
        (await api.musicState().catch((e) => {
          if (!dead) setError(String(e));
          return null;
        }));
      if (dead || !st) return;
      setError(null);
      heard.current = { pos: st.position, t: performance.now(), playing: st.state === "playing" };
      setNow((n) =>
        n && n.name === st.name && n.artist === st.artist && n.state === st.state && n.lyrics === st.lyrics
          ? { ...n, position: st.position }
          : st,
      );
    };
    check();
    const poll = window.setInterval(check, 1000);
    const tick = window.setInterval(() => {
      const h = heard.current;
      setT(h.playing ? h.pos + (performance.now() - h.t) / 1000 : h.pos);
    }, 200);
    return () => {
      dead = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  const name = now?.name ?? "";
  const artist = now?.artist ?? "";
  const [words, setWords] = useState<{ key: string; lyrics: Lyrics | null; offline?: boolean } | null>(null);
  const key = `${name}\u0000${artist}`;
  useEffect(() => {
    if (!name) return;
    let dead = false;
    const saved = now?.lyrics ?? "";
    lyricsFor(name, artist, now?.album ?? "", now?.duration ?? 0, saved)
      .then((lyrics) => !dead && setWords({ key, lyrics }))
      .catch(() => !dead && setWords({ key, lyrics: saved.trim() ? plainLines(saved) : null, offline: true }));
    return () => {
      dead = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const lyrics = words?.key === key ? words.lyrics : undefined;
  const [cover, setCover] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!name) return;
    let dead = false;
    artworkFor(name, artist, now?.album ?? "")
      .then((url) => !dead && setCover({ key, url }))
      .catch(() => !dead && setCover({ key, url: null }));
    return () => {
      dead = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const artUrl = cover?.key === key && !!name ? cover.url : null;

  // The line being sung: the last one started.
  let cur = -1;
  if (lyrics?.timed) for (let i = 0; i < lyrics.lines.length && lyrics.lines[i].at! <= t + 0.2; i++) cur = i;
  // A rest, where nothing is sung, shown as dots after line `after` (-1: before the first): the
  // intro, an empty line (a break the lyrics mark), or a long gap after a line once it's been sung.
  let rest: { after: number; from: number; to: number } | null = null;
  if (lyrics?.timed && now?.state === "playing" && lyrics.lines.length) {
    const L = lyrics.lines;
    const end = now.duration || L[L.length - 1].at! + 10;
    const next = L[cur + 1]?.at ?? end;
    if (cur < 0) {
      if (L[0].at! > 3) rest = { after: -1, from: 0, to: L[0].at! };
    } else if (!L[cur].text) rest = { after: cur, from: L[cur].at!, to: next };
    else if (next - L[cur].at! > 10) {
      // Roughly how long the line takes to sing.
      const sung = L[cur].at! + Math.max(4, Math.min(L[cur].text.length * 0.15, 7));
      if (t >= sung && cur < L.length - 1) rest = { after: cur, from: sung, to: next };
    }
    if (rest && rest.to - rest.from < 2.5) rest = null;
  }
  const lit = rest?.after === cur ? -1 : cur;
  const scroller = useRef<HTMLElement>(null);
  const target = rest ? `[data-rest]` : lit >= 0 ? `[data-line="${lit}"]` : null;
  useEffect(() => {
    if (target) scroller.current?.querySelector(target)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target, lit]);
  useEffect(() => scroller.current?.scrollTo({ top: 0 }), [key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, setFocus]);

  // Why Quiet time chose this song, while it plays in the Worship part.
  const s = app.session;
  const step = s?.steps[s.i];
  const why = step?.kind === "worship" && now?.ours ? step.picked?.find((x) => x.name === name)?.why : undefined;

  const tools = (
    <div style={{ display: "flex", gap: 2 }}>
      <button
        className="ibtn"
        type="button"
        aria-label="Open Music"
        title="Open Music"
        onClick={() => api.musicControl("show").catch((e) => app.toast(String(e)))}
      >
        <Icon name="export" />
      </button>
      {!focus && (
        <button className="ibtn" type="button" aria-label="Focus mode" title="Focus mode (⌘.)" onClick={() => setFocus(true)}>
          <Icon name="focus" />
        </button>
      )}
    </div>
  );

  const stopped = !now || now.state === "stopped" || !name;
  const songTime = () => {
    const h = heard.current;
    return h.playing ? h.pos + (performance.now() - h.t) / 1000 : h.pos;
  };
  return (
    <div className="main lyrics-page" style={{ minHeight: 0 }}>
      {/* The artwork, large and blurred, behind everything: as Music's full-screen view. */}
      {artUrl && (
        <div className="lyrics-art" aria-hidden>
          <img key={artUrl} src={artUrl} alt="" />
        </div>
      )}
      {/* No words: flames, swelling to the song's tempo, in front of the artwork. */}
      {!stopped && lyrics === null && (
        <div className="lyrics-art" aria-hidden style={{ opacity: 0.85 }}>
          <Flames bpm={now?.bpm ?? 0} playing={now?.state === "playing"} time={songTime} dark={dark} />
        </div>
      )}
      {focus ? (
        <header className="topbar drag" style={{ borderBottom: 0, paddingLeft: 84 }}>
          <div className="spacer" />
          {tools}
          <button className="btn" type="button" onClick={() => setFocus(false)}>
            Exit focus<span className="kbd">esc</span>
          </button>
        </header>
      ) : (
        <Topbar right={tools}>
          <button className="btn" type="button" title="Back to the Bible" onClick={app.closeDoc}>
            <Icon name="read" />
            {fmtRef(app.loc)}
          </button>
        </Topbar>
      )}
      {/* The song's heading stays put while its words scroll under it. */}
      <div style={{ flexShrink: 0, padding: focus ? "18px 10% 14px" : "18px 40px 14px 36px", textAlign: focus ? "center" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: focus ? "center" : undefined }}>
          {artUrl && <img className="lyrics-cover" src={artUrl} alt="" />}
          <div>
            <div className="label">{stopped ? "Lyrics" : `Lyrics · ${artist}`}</div>
            <h1 data-quiet-anchor style={{ margin: "6px 0 0", font: "500 30px/1.15 var(--display)" }}>
              {stopped ? "Nothing playing" : name}
            </h1>
          </div>
        </div>
        {why && <p style={{ margin: "10px 0 0", font: "400 15px/1.55 var(--serif)", color: "var(--muted)" }}>{why}</p>}
      </div>
      <main ref={scroller} className="scroll lyrics-words" style={{ flex: "1 1 auto", padding: focus ? "0 10% 40vh" : "0 40px 40vh 36px" }}>
        {error ? (
          <p className="err">{error}</p>
        ) : stopped ? (
          <p className="n">Play a song in Music and its words show here.</p>
        ) : lyrics === undefined ? (
          <p className="n">Finding the words…</p>
        ) : !lyrics ? (
          <p className="n">No lyrics found for this song{words?.offline ? " (couldn't reach LRCLIB)" : ""}.</p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: focus ? "center" : undefined,
              textAlign: focus ? "center" : undefined,
              gap: lyrics.timed ? 14 : 4,
              paddingTop: 8,
            }}
          >
            {rest?.after === -1 && <Rest {...rest} t={t} focus={focus} />}
            {lyrics.lines.map((l, i) => (
              <Fragment key={i}>
                <div
                  data-line={i}
                  className={lyrics.timed ? `lyric${i === lit ? " now" : ""}` : undefined}
                  style={{
                    font: lyrics.timed ? "600 30px/1.3 var(--display)" : "400 20px/1.5 var(--serif)",
                    minHeight: l.text ? undefined : lyrics.timed ? 0 : "0.8em",
                    transformOrigin: focus ? "center" : "left center",
                    opacity: lyrics.timed && i !== lit ? (i < cur ? 0.35 : 0.55) : 1,
                  }}
                >
                  {l.text}
                </div>
                {rest?.after === i && <Rest {...rest} t={t} focus={focus} />}
              </Fragment>
            ))}
            <p className="n" style={{ marginTop: 28, fontSize: 12 }}>
              {lyrics.source === "lrclib" ? "Lyrics from LRCLIB" : "Lyrics saved with the song in Music"}
              {lyrics.timed ? "" : " · not timed"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/** Three dots through a rest, as Music shows: each fills in turn as the rest goes by, the three
 *  gently breathing, and they fade as the words come back. */
function Rest({ from, to, t, focus }: { from: number; to: number; t: number; focus: boolean }) {
  const p = Math.min(1, Math.max(0, (t - from) / (to - from)));
  const ending = to - t < 0.6;
  return (
    <div
      data-rest
      className={`lyric-rest${ending ? " ending" : ""}`}
      style={{ alignSelf: focus ? "center" : "flex-start", transformOrigin: focus ? "center" : "left center" }}
    >
      {[0, 1, 2].map((k) => (
        <span key={k} style={{ opacity: 0.25 + 0.75 * Math.min(1, Math.max(0, p * 3 - k)) }} />
      ))}
    </div>
  );
}
