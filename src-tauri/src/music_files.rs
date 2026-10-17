// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or
// later. SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Worship songs on Windows, where there is no Music app to drive: the music files in the user's
//! Music folder, listed with their tags and handed to the page, which plays them itself
//! (src/localMusic.ts). Only files under that folder are ever read.

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::{Accessor, ItemKey};
use serde::Serialize;
use std::path::{Path, PathBuf};

const AUDIO: &[&str] = &["mp3", "m4a", "aac", "flac", "ogg", "opus", "wav"];

#[derive(Serialize)]
pub struct FileTrack {
    /// The file's path, which is also how the page asks for it.
    pub id: String,
    pub name: String,
    pub artist: String,
    pub genre: String,
    pub album: String,
    pub duration: f64,
}

#[derive(Serialize, Default)]
pub struct Extra {
    /// Lyrics saved in the file's tags, if any.
    pub lyrics: String,
    pub bpm: f64,
}

/// The user's Music folder.
pub fn dir() -> PathBuf {
    crate::store::home().join("Music")
}

fn is_audio(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| AUDIO.contains(&e.to_ascii_lowercase().as_str()))
}

/// `path` if it is a music file inside the Music folder (followed through links), else an error.
fn checked(path: &str) -> Result<PathBuf, String> {
    let p = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    let root = std::fs::canonicalize(dir()).map_err(|e| e.to_string())?;
    if p.starts_with(&root) && is_audio(&p) {
        Ok(p)
    } else {
        Err("not a song in the Music folder".into())
    }
}

/// Every music file under the Music folder, with its title (or file name), artist, genre and album.
pub fn tracks() -> Result<Vec<FileTrack>, String> {
    let mut files = Vec::new();
    let mut todo = vec![dir()];
    while let Some(d) = todo.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            match e.file_type() {
                Ok(t) if t.is_dir() => todo.push(p),
                Ok(_) if is_audio(&p) => files.push(p),
                _ => {}
            }
        }
    }
    files.sort();
    Ok(files.into_iter().map(|p| track(&p)).collect())
}

fn track(p: &Path) -> FileTrack {
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut t = FileTrack {
        id: p.to_string_lossy().into_owned(),
        name: stem,
        artist: String::new(),
        genre: String::new(),
        album: String::new(),
        duration: 0.0,
    };
    // A file whose tags can't be read is still listed, by its name.
    let Ok(f) = lofty::read_from_path(p) else { return t };
    t.duration = f.properties().duration().as_secs_f64();
    if let Some(tag) = f.primary_tag().or_else(|| f.first_tag()) {
        let s = |v: Option<std::borrow::Cow<str>>| v.map(|v| v.into_owned()).unwrap_or_default();
        if let Some(n) = tag.title().filter(|n| !n.trim().is_empty()) {
            t.name = n.into_owned();
        }
        t.artist = s(tag.artist());
        t.genre = s(tag.genre());
        t.album = s(tag.album());
    }
    t
}

/// A song's bytes, for the page to play.
pub fn bytes(path: &str) -> Result<Vec<u8>, String> {
    std::fs::read(checked(path)?).map_err(|e| e.to_string())
}

/// A song's lyrics and tempo, from its tags.
pub fn extra(path: &str) -> Result<Extra, String> {
    let f = lofty::read_from_path(checked(path)?).map_err(|e| e.to_string())?;
    let Some(tag) = f.primary_tag().or_else(|| f.first_tag()) else { return Ok(Extra::default()) };
    Ok(Extra {
        lyrics: tag.get_string(ItemKey::Lyrics).unwrap_or_default().to_string(),
        bpm: tag
            .get_string(ItemKey::Bpm)
            .or_else(|| tag.get_string(ItemKey::IntegerBpm))
            .and_then(|b| b.trim().parse().ok())
            .unwrap_or(0.0),
    })
}

/// A song's artwork as image bytes; empty when it has none.
pub fn artwork(path: &str) -> Result<Vec<u8>, String> {
    let f = lofty::read_from_path(checked(path)?).map_err(|e| e.to_string())?;
    let pic = f.tags().iter().find_map(|t| t.pictures().first().map(|p| p.data().to_vec()));
    Ok(pic.unwrap_or_default())
}
