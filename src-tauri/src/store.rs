// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The app's own data (settings, bookmarks, highlights, plans, chats): one JSON document per
//! name under ~/Library/Application Support/Two-edged Sword/. The frontend owns the shapes;
//! this side only reads and writes whole documents, atomically.

use serde_json::Value;
use std::path::PathBuf;

/// The user's home folder (USERPROFILE where there is no HOME, as on Windows, for the tests).
pub fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).unwrap_or_default())
}

pub fn data_dir() -> PathBuf {
    // %APPDATA% on Windows; the home folder's in a test without it.
    #[cfg(windows)]
    if let Some(d) = std::env::var_os("APPDATA").filter(|_| !cfg!(test)) {
        return PathBuf::from(d).join("Two-edged Sword");
    }
    home().join("Library/Application Support/Two-edged Sword")
}

/// A folder shipped in the app (Contents/Resources/<name>); in a debug build, src-tauri/<name>.
pub fn bundled(name: &str) -> PathBuf {
    if cfg!(debug_assertions) {
        return std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(name);
    }
    // On Windows the resources sit beside the .exe.
    let res = |e: &std::path::Path| {
        if cfg!(windows) {
            e.parent().map(|d| d.to_path_buf())
        } else {
            Some(e.parent()?.parent()?.join("Resources"))
        }
    };
    std::env::current_exe().ok().and_then(|e| Some(res(&e)?.join(name))).unwrap_or_default()
}

/// A file's size and modified time (since the epoch), for telling when it has changed; zeros if
/// it can't be read.
pub fn file_stamp(path: &std::path::Path) -> (u64, std::time::Duration) {
    let m = std::fs::metadata(path).ok();
    let len = m.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime = m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).unwrap_or_default();
    (len, mtime)
}

/// A title as a file name: letters, digits and the characters in `keep`, the rest as spaces, at
/// most `max` characters, no leading or trailing dots; "untitled" if nothing is left.
pub fn file_name(s: &str, max: usize, keep: &str) -> String {
    let t: String = s.chars().map(|c| if c.is_alphanumeric() || keep.contains(c) { c } else { ' ' }).collect();
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    let t: String = t.chars().take(max).collect();
    let t = t.trim_matches(|c: char| c == '.' || c == ' ').to_string();
    if t.is_empty() {
        "untitled".into()
    } else {
        t
    }
}

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn path_for(dir: &std::path::Path, name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) {
        return Err(format!("bad store name {name:?}"));
    }
    Ok(dir.join(format!("{name}.json")))
}

pub fn read(dir: &std::path::Path, name: &str) -> Result<Value, String> {
    let p = path_for(dir, name)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| format!("{}: {e}", p.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Null),
        Err(e) => Err(e.to_string()),
    }
}

/// Writes to a temporary file and renames it over the old one, so a crash mid-write can never
/// leave a half-written document.
pub fn write(dir: &std::path::Path, name: &str, value: &Value) -> Result<(), String> {
    let p = path_for(dir, name)?;
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    write_text_atomic(&p, &text)
}

/// A translation's differences from the KJV (`variances-<module>`): the list built on this Mac
/// by tools/variances/ if there is one, else the one shipped with the app (Contents/Resources/variances).
pub fn variances(dir: &std::path::Path, name: &str) -> Result<Value, String> {
    let own = read(dir, name)?;
    if !own.is_null() {
        return Ok(own);
    }
    read(&bundled("variances"), name)
}

/// A hidden temporary name beside `p`, unique to this write, so it can't clobber a file of the
/// user's (`Notes.tmp`) or another write in flight.
fn tmp_beside(p: &std::path::Path) -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    p.with_file_name(format!(".{name}.{}.{}.tmp", std::process::id(), N.fetch_add(1, Ordering::Relaxed)))
}

/// Writes `text` to a temporary file beside `p`, flushed to the disk, then renames it over `p`, so
/// a crash or power cut leaves the old file or the new one, never half of one. The temporary file
/// is removed if anything fails.
pub fn write_text_atomic(p: &std::path::Path, text: &str) -> Result<(), String> {
    use std::io::Write;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = tmp_beside(p);
    let done = std::fs::File::create(&tmp)
        .and_then(|mut f| {
            f.write_all(text.as_bytes())?;
            f.sync_all()
        })
        .and_then(|_| rename_retrying(&tmp, p));
    if let Err(e) = done {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    // The rename itself made lasting too (a folder can be synced on a Mac, not on Windows).
    #[cfg(unix)]
    if let Some(dir) = p.parent().and_then(|d| std::fs::File::open(d).ok()) {
        let _ = dir.sync_all();
    }
    Ok(())
}

/// A rename, tried again a few times on Windows while something else (an antivirus scanner, the
/// search indexer, OneDrive) has the file open: access denied, or a sharing or lock violation.
pub fn rename_retrying(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    let mut wait = std::time::Duration::from_millis(20);
    let mut tries = 0;
    loop {
        match std::fs::rename(from, to) {
            Err(e) if cfg!(windows) && tries < 5 && matches!(e.raw_os_error(), Some(5 | 32 | 33)) => {
                std::thread::sleep(wait);
                wait *= 2;
                tries += 1;
            }
            r => return r,
        }
    }
}

/// Saves under way (the page's store writes waiting in the queue, journal saves), which a restart
/// into an update waits for (updates.rs).
static IN_FLIGHT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Counts as a save under way until dropped.
pub struct Saving(());

impl Drop for Saving {
    fn drop(&mut self) {
        IN_FLIGHT.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

pub fn saving() -> Saving {
    IN_FLIGHT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    Saving(())
}

pub fn saves_under_way() -> usize {
    IN_FLIGHT.load(std::sync::atomic::Ordering::SeqCst)
}

enum Job {
    Write(PathBuf, String, Saving),
    Wait(std::sync::mpsc::Sender<()>),
}

/// One thread writes the page's documents, in the order they were sent, so the window's thread
/// never waits on the disk and a later save of a document can't be overtaken by an earlier one.
fn queue() -> &'static std::sync::mpsc::Sender<Job> {
    static Q: std::sync::OnceLock<std::sync::mpsc::Sender<Job>> = std::sync::OnceLock::new();
    Q.get_or_init(|| {
        let (tx, rx) = std::sync::mpsc::channel::<Job>();
        std::thread::spawn(move || {
            for job in rx {
                match job {
                    Job::Write(p, text, _saving) => {
                        if let Err(e) = write_text_atomic(&p, &text) {
                            eprintln!("{}: {e}", p.display());
                        }
                    }
                    Job::Wait(done) => {
                        let _ = done.send(());
                    }
                }
            }
        });
        tx
    })
}

/// `write`, done in the background, after any writes queued before it. Fails at once only for a
/// bad name or value; a failure to write is logged.
pub fn write_queued(dir: &std::path::Path, name: &str, value: &Value) -> Result<(), String> {
    let p = path_for(dir, name)?;
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    queue().send(Job::Write(p, text, saving())).map_err(|e| e.to_string())
}

/// Returns once every write queued before it is done, so a read after a write sees it.
pub fn writes_done() {
    let (tx, rx) = std::sync::mpsc::channel();
    if queue().send(Job::Wait(tx)).is_ok() {
        let _ = rx.recv();
    }
}

/// One lock per exported folder, so overlapping exports of the same thing take turns.
pub fn dir_lock(dir: &std::path::Path) -> std::sync::Arc<std::sync::Mutex<()>> {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex, OnceLock};
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
    LOCKS.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner()).entry(dir.to_path_buf()).or_default().clone()
}

/// Has `build` write the folder's contents beside it, then swaps that in, so `dir` is never seen
/// half-written. Call with `dir_lock(dir)` held.
pub fn replace_dir<T>(dir: &std::path::Path, build: impl FnOnce(&std::path::Path) -> Result<T, String>) -> Result<T, String> {
    use std::fs;
    let name = dir.file_name().and_then(|n| n.to_str()).ok_or("bad folder name")?;
    let (new, old) = (dir.with_file_name(format!(".{name}.new")), dir.with_file_name(format!(".{name}.old")));
    // Stopped between the two renames last time: the old copy is the only one, so it goes back first.
    if !dir.exists() && old.exists() {
        fs::rename(&old, dir).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_dir_all(&new);
    let _ = fs::remove_dir_all(&old);
    fs::create_dir_all(&new).map_err(|e| e.to_string())?;
    let r = build(&new).inspect_err(|_| {
        let _ = fs::remove_dir_all(&new);
    })?;
    if dir.exists() {
        fs::rename(dir, &old).map_err(|e| e.to_string())?;
    }
    if let Err(e) = fs::rename(&new, dir) {
        let _ = fs::rename(&old, dir);
        return Err(e.to_string());
    }
    let _ = fs::remove_dir_all(&old);
    Ok(r)
}

/// How many backups of each kind are kept (the newest).
pub const BACKUPS_KEPT: usize = 14;

/// Copies `files` into a new dated folder under `into` ("2026-11-08 215012"), unless (not `force`) the
/// newest there is less than a day old. Keeps the newest BACKUPS_KEPT. Answers the folder made, if one was.
/// Used before sync changes the journal (journal.rs) and the bookmarks, highlights and plans (lib.rs).
pub fn backup(files: &[PathBuf], into: &std::path::Path, force: bool) -> Result<Option<PathBuf>, String> {
    let mut olds: Vec<PathBuf> =
        std::fs::read_dir(into).map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect()).unwrap_or_default();
    olds.sort();
    let recent = olds
        .last()
        .and_then(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|age| age < std::time::Duration::from_secs(86_400));
    let files: Vec<&PathBuf> = files.iter().filter(|p| p.is_file()).collect();
    if (recent && !force) || files.is_empty() {
        return Ok(None);
    }
    let stamp = chrono::Local::now().format("%Y-%m-%d %H%M%S").to_string();
    let mut to = into.join(&stamp);
    let mut n = 1;
    while to.exists() {
        n += 1;
        to = into.join(format!("{stamp} {n:02}"));
    }
    std::fs::create_dir_all(&to).map_err(|e| e.to_string())?;
    for p in files {
        if let Some(name) = p.file_name() {
            std::fs::copy(p, to.join(name)).map_err(|e| format!("making a backup: {e}"))?;
        }
    }
    olds.push(to.clone());
    olds.sort();
    while olds.len() > BACKUPS_KEPT {
        let _ = std::fs::remove_dir_all(olds.remove(0));
    }
    Ok(Some(to))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_names() {
        let dir = std::env::temp_dir().join(format!("tes-store-{}", std::process::id()));
        let v = serde_json::json!({"a": [1, 2]});
        write(&dir, "bookmarks", &v).unwrap();
        assert_eq!(read(&dir, "bookmarks").unwrap(), v);
        assert_eq!(read(&dir, "missing").unwrap(), Value::Null);
        assert!(write(&dir, "../x", &v).is_err());
        let w = serde_json::json!({"b": 3});
        write_queued(&dir, "queued", &v).unwrap();
        write_queued(&dir, "queued", &w).unwrap();
        writes_done();
        assert_eq!(read(&dir, "queued").unwrap(), w, "queued writes land in order");
        assert!(std::fs::read_dir(&dir).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".tmp")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn replace_dir_recovers_an_interrupted_swap() {
        let base = std::env::temp_dir().join(format!("tes-recover-{}", std::process::id()));
        let dir = base.join("book");
        // As if it stopped after moving the old folder aside and before moving the new one in.
        std::fs::create_dir_all(base.join(".book.old")).unwrap();
        std::fs::write(base.join(".book.old/a.txt"), "1").unwrap();
        let r: Result<(), String> = replace_dir(&dir, |_| Err("failed".into()));
        assert!(r.is_err());
        assert!(dir.join("a.txt").exists(), "the only copy is put back, not deleted");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn replaces_folders_whole() {
        let dir = std::env::temp_dir().join(format!("tes-replace-{}", std::process::id())).join("book");
        replace_dir(&dir, |d| std::fs::write(d.join("a.txt"), "1").map_err(|e| e.to_string())).unwrap();
        let r: Result<(), String> = replace_dir(&dir, |d| {
            std::fs::write(d.join("b.txt"), "2").unwrap();
            Err("failed".into())
        });
        assert!(r.is_err());
        assert!(dir.join("a.txt").exists() && !dir.join("b.txt").exists(), "a failed build leaves the old folder");
        replace_dir(&dir, |d| std::fs::write(d.join("b.txt"), "2").map_err(|e| e.to_string())).unwrap();
        assert!(!dir.join("a.txt").exists() && dir.join("b.txt").exists());
        assert_eq!(std::fs::read_dir(dir.parent().unwrap()).unwrap().count(), 1, "nothing left beside it");
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }
}
