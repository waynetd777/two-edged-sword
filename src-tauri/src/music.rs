//! Worship songs from the user's Music library, for Quiet time: the library listed, the chosen
//! songs queued as one playlist and played in the Music app. Driven by osascript (JavaScript for
//! Automation); the first use asks the user to let the app control Music.

use serde::Serialize;
use std::process::Command;

/// The app's own playlist, remade for each Quiet time. Nothing else in the library is touched.
const PLAYLIST: &str = "Two-edged Sword · Quiet time";

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
    /// Whether what is playing is the Quiet time playlist.
    pub ours: bool,
}

/// Runs a JXA script with one argument (read as `argv[0]`) and returns what it printed.
fn jxa(script: &str, arg: &str) -> Result<String, String> {
    let out = Command::new("/usr/bin/osascript").args(["-l", "JavaScript", "-e", script, arg]).output().map_err(|e| e.to_string())?;
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
    let rows: Vec<(String, String, String, String)> = serde_json::from_str(&jxa(js, "")?).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(id, name, artist, genre)| Track { id, name, artist, genre }).collect())
}

/// Makes the Quiet time playlist of these songs, in this order, and plays it. Returns how many it found.
pub fn play(ids: &[String]) -> Result<usize, String> {
    let js = r#"function run(argv) {
        const [name, ids] = JSON.parse(argv[0]);
        const m = Application("Music");
        // Remade each time: deleting a playlist leaves its songs in the library.
        m.userPlaylists.whose({ name })().forEach((p) => m.delete(p));
        const pl = m.make({ new: "playlist", withProperties: { name } });
        const lib = m.libraryPlaylists[0].tracks;
        for (const id of ids) { const t = lib.whose({ persistentID: id })(); if (t.length) m.duplicate(t[0], { to: pl }); }
        const n = pl.tracks.length;
        // In order, once through: repeat would never let the part end.
        if (n) { m.shuffleEnabled = false; m.songRepeat = "off"; pl.play(); }
        return String(n);
    }"#;
    let arg = serde_json::to_string(&(PLAYLIST, ids)).map_err(|e| e.to_string())?;
    jxa(js, &arg)?.parse().map_err(|_| "Music didn't say what it queued".to_string())
}

pub fn state() -> Result<State, String> {
    let js = r#"function run(argv) {
        const m = Application("Music");
        if (!m.running()) return JSON.stringify(["stopped", "", "", false]);
        const state = m.playerState();
        let name = "", artist = "", ours = false;
        try { const t = m.currentTrack(); name = t.name(); artist = t.artist(); } catch (e) {}
        try { ours = m.currentPlaylist().name() === argv[0]; } catch (e) {}
        return JSON.stringify([state, name, artist, ours]);
    }"#;
    let (state, name, artist, ours): (String, String, String, bool) = serde_json::from_str(&jxa(js, PLAYLIST)?).map_err(|e| e.to_string())?;
    Ok(State { state, name, artist, ours })
}

/// "pause", "play" or "next", for the Quiet time playlist only: nothing else the user is
/// listening to is paused or skipped. "stop" is sent as the playlist ends, and stops whatever
/// Music has gone on to play after it (AutoPlay's similar songs) as well. "show" brings Music to the front, where its lyrics are:
/// they aren't in the library's files, and Apple Music's own can't be read by another app.
pub fn control(cmd: &str) -> Result<(), String> {
    if cmd == "show" {
        return jxa(r#"function run(argv) { Application("Music").activate(); return ""; }"#, "").map(|_| ());
    }
    if cmd == "stop" {
        return jxa(r#"function run(argv) { const m = Application("Music"); if (m.running() && m.playerState() !== "stopped") m.stop(); return ""; }"#, "").map(|_| ());
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
    jxa(js, &serde_json::to_string(&(cmd, PLAYLIST)).map_err(|e| e.to_string())?).map(|_| ())
}
