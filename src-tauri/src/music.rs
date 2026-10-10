// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Worship songs from the user's Music library, for Quiet time or a chapter: the library listed, the chosen
//! songs queued as one playlist and played in the Music app. Driven by osascript (JavaScript for
//! Automation); the first use asks the user to let the app control Music.

use serde::Serialize;
use std::process::Command;
use std::time::Duration;

/// The app's own playlist, remade each time songs are played. Nothing else in the library is touched.
const PLAYLIST: &str = "Two-edged Sword";
/// Its name before chapters had songs too, removed if it's still there.
const OLD_PLAYLIST: &str = "Two-edged Sword · Quiet time";

#[derive(Serialize)]
pub struct Track {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub genre: String,
}

#[derive(Serialize)]
pub struct State {
    /// "playing", "paused", "stopped" (or fast forwarding, rewinding).
    pub state: String,
    pub name: String,
    pub artist: String,
    /// Whether what is playing is the app's playlist.
    pub ours: bool,
    pub album: String,
    /// Seconds into the song, and its length.
    pub position: f64,
    pub duration: f64,
    /// Lyrics saved with the song in the library, if any (Apple Music's own aren't readable).
    pub lyrics: String,
    /// Beats per minute, if Music knows it (0 when not).
    pub bpm: f64,
}

/// How long a quick question to Music may take before it is given up (a hung Music would otherwise
/// pile up a script per poll), and one that lists or queues the library, or waits on the
/// permission prompt the first time.
const QUICK: Duration = Duration::from_secs(15);
const SLOW: Duration = Duration::from_secs(180);

/// Runs a JXA script with one argument (read as `argv[0]`) and returns what it printed.
fn jxa(script: &str, arg: &str, limit: Duration) -> Result<String, String> {
    let out = crate::process::output_within(Command::new("/usr/bin/osascript").args(["-l", "JavaScript", "-e", script, arg]), limit)
        .map_err(|e| format!("Music didn't answer: {e}"))?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).trim().to_string());
    }
    let err = String::from_utf8_lossy(&out.stderr);
    if err.contains("-1743") || err.contains("Not authorized") || err.contains("-10004") {
        return Err("Two-edged Sword isn't allowed to control Music. Allow it in System Settings › Privacy & Security › Automation.".into());
    }
    Err(format!("Music: {}", err.trim()))
}

/// Every song in the library (not videos, podcasts or audiobooks).
pub fn tracks() -> Result<Vec<Track>, String> {
    let js = r#"function run(argv) {
        const t = Application("Music").libraryPlaylists[0].tracks;
        const [ids, names, artists, genres, kinds] = [t.persistentID(), t.name(), t.artist(), t.genre(), t.mediaKind()];
        const out = [];
        for (let i = 0; i < ids.length; i++) if (kinds[i] === "song") out.push([ids[i], names[i], artists[i] || "", genres[i] || ""]);
        return JSON.stringify(out);
    }"#;
    let rows: Vec<(String, String, String, String)> = serde_json::from_str(&jxa(js, "", SLOW)?).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(id, name, artist, genre)| Track { id, name, artist, genre }).collect())
}

/// Makes the app's playlist of these songs, in this order, and plays it. Returns how many it found.
pub fn play(ids: &[String]) -> Result<usize, String> {
    let js = r#"function run(argv) {
        const [name, old, ids] = JSON.parse(argv[0]);
        const m = Application("Music");
        // Remade each time: deleting a playlist leaves its songs in the library.
        for (const n of [name, old]) m.userPlaylists.whose({ name: n })().forEach((p) => m.delete(p));
        const pl = m.make({ new: "playlist", withProperties: { name } });
        const lib = m.libraryPlaylists[0].tracks;
        for (const id of ids) { const t = lib.whose({ persistentID: id })(); if (t.length) m.duplicate(t[0], { to: pl }); }
        const n = pl.tracks.length;
        // In order, once through: repeat would never let the part end.
        if (n) { m.shuffleEnabled = false; m.songRepeat = "off"; pl.play(); }
        return String(n);
    }"#;
    let arg = serde_json::to_string(&(PLAYLIST, OLD_PLAYLIST, ids)).map_err(|e| e.to_string())?;
    jxa(js, &arg, SLOW)?.parse().map_err(|_| "Music didn't say what it queued".to_string())
}

pub fn state() -> Result<State, String> {
    let js = r#"function run(argv) {
        const m = Application("Music");
        if (!m.running()) return JSON.stringify(["stopped", "", "", false, "", 0, 0, "", 0]);
        const state = m.playerState();
        let name = "", artist = "", ours = false, album = "", position = 0, duration = 0, lyrics = "", bpm = 0;
        try { const t = m.currentTrack(); name = t.name(); artist = t.artist(); album = t.album() || ""; duration = t.duration() || 0; } catch (e) {}
        try { lyrics = m.currentTrack().lyrics() || ""; } catch (e) {}
        try { bpm = m.currentTrack().bpm() || 0; } catch (e) {}
        try { position = m.playerPosition() || 0; } catch (e) {}
        try { ours = m.currentPlaylist().name() === argv[0]; } catch (e) {}
        return JSON.stringify([state, name, artist, ours, album, position, duration, lyrics, bpm]);
    }"#;
    let (state, name, artist, ours, album, position, duration, lyrics, bpm): (String, String, String, bool, String, f64, f64, String, f64) =
        serde_json::from_str(&jxa(js, PLAYLIST, QUICK)?).map_err(|e| e.to_string())?;
    Ok(State { state, name, artist, ours, album, position, duration, lyrics, bpm })
}

/// "pause", "play" or "next", for the app's playlist only: nothing else the user is
/// listening to is paused or skipped. "stop" is sent as the playlist ends, and stops whatever
/// Music has gone on to play after it (AutoPlay's similar songs) as well. "show" brings Music to the front.
pub fn control(cmd: &str) -> Result<(), String> {
    if cmd == "show" {
        return jxa(r#"function run(argv) { Application("Music").activate(); return ""; }"#, "", QUICK).map(|_| ());
    }
    if cmd == "stop" {
        return jxa(r#"function run(argv) { const m = Application("Music"); if (m.running() && m.playerState() !== "stopped") m.stop(); return ""; }"#, "", QUICK).map(|_| ());
    }
    if !["pause", "play", "next"].contains(&cmd) {
        return Err(format!("unknown command {cmd}"));
    }
    let js = r#"function run(argv) {
        const [cmd, name] = JSON.parse(argv[0]);
        const m = Application("Music");
        if (!m.running()) return "";
        let ours = false;
        try { ours = m.currentPlaylist().name() === name; } catch (e) {}
        if (!ours) return "";
        if (cmd === "pause") m.pause(); else if (cmd === "play") m.play(); else m.nextTrack();
        return "";
    }"#;
    jxa(js, &serde_json::to_string(&(cmd, PLAYLIST)).map_err(|e| e.to_string())?, QUICK).map(|_| ())
}

/// The playing song's artwork, as the image file's bytes (JPEG or PNG), or none. AppleScript, not
/// JXA: only it can write the artwork's raw data out, to a temporary file read back here.
pub fn artwork() -> Result<Vec<u8>, String> {
    let script = r#"on run argv
  tell application "Music"
    if not running then return ""
    try
      set d to raw data of artwork 1 of current track
    on error
      return ""
    end try
  end tell
  set fh to open for access (POSIX file (item 1 of argv)) with write permission
  set eof fh to 0
  write d to fh
  close access fh
  return "ok"
end run"#;
    // A file of its own each time: two asks at once mustn't read or remove each other's.
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("tes-artwork-{}-{n}", std::process::id()));
    let out = crate::process::output_within(Command::new("/usr/bin/osascript").args(["-e", script, &path.to_string_lossy()]), QUICK);
    let Ok(out) = out else {
        let _ = std::fs::remove_file(&path);
        return Ok(Vec::new());
    };
    if !out.status.success() || String::from_utf8_lossy(&out.stdout).trim() != "ok" {
        let _ = std::fs::remove_file(&path);
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&path);
    bytes
}
