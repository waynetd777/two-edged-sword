//! The app's own data (settings, bookmarks, highlights, plans, chats): one JSON document per
//! name under ~/Library/Application Support/Two-edged Sword/. The frontend owns the shapes;
//! this side only reads and writes whole documents, atomically.

use serde_json::Value;
use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join("Library/Application Support/Two-edged Sword")
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
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = tmp_beside(&p);
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// The difference lists shipped in the app (Contents/Resources/variances); in a debug build,
/// src-tauri/variances.
fn bundled_variances() -> PathBuf {
    if cfg!(debug_assertions) { return std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("variances"); }
    std::env::current_exe().ok().and_then(|e| Some(e.parent()?.parent()?.join("Resources/variances"))).unwrap_or_default()
}

/// A translation's differences from the KJV (`variances-<module>`): the list built on this Mac
/// by tools/variances/ if there is one, else the one shipped with the app.
pub fn variances(dir: &std::path::Path, name: &str) -> Result<Value, String> {
    let own = read(dir, name)?;
    if !own.is_null() { return Ok(own); }
    read(&bundled_variances(), name)
}

/// A hidden temporary name beside `p`, unique to this write, so it can't clobber a file of the
/// user's (`Notes.tmp`) or another write in flight.
fn tmp_beside(p: &std::path::Path) -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    p.with_file_name(format!(".{name}.{}.{}.tmp", std::process::id(), N.fetch_add(1, Ordering::Relaxed)))
}

pub fn write_text_atomic(p: &std::path::Path, text: &str) -> Result<(), String> {
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = tmp_beside(p);
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, p).map_err(|e| e.to_string())
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
    let _ = fs::remove_dir_all(&new);
    let _ = fs::remove_dir_all(&old);
    fs::create_dir_all(&new).map_err(|e| e.to_string())?;
    let r = build(&new).inspect_err(|_| { let _ = fs::remove_dir_all(&new); })?;
    if dir.exists() { fs::rename(dir, &old).map_err(|e| e.to_string())?; }
    if let Err(e) = fs::rename(&new, dir) {
        let _ = fs::rename(&old, dir);
        return Err(e.to_string());
    }
    let _ = fs::remove_dir_all(&old);
    Ok(r)
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
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn replaces_folders_whole() {
        let dir = std::env::temp_dir().join(format!("tes-replace-{}", std::process::id())).join("book");
        replace_dir(&dir, |d| std::fs::write(d.join("a.txt"), "1").map_err(|e| e.to_string())).unwrap();
        let r: Result<(), String> = replace_dir(&dir, |d| { std::fs::write(d.join("b.txt"), "2").unwrap(); Err("failed".into()) });
        assert!(r.is_err());
        assert!(dir.join("a.txt").exists() && !dir.join("b.txt").exists(), "a failed build leaves the old folder");
        replace_dir(&dir, |d| std::fs::write(d.join("b.txt"), "2").map_err(|e| e.to_string())).unwrap();
        assert!(!dir.join("a.txt").exists() && dir.join("b.txt").exists());
        assert_eq!(std::fs::read_dir(dir.parent().unwrap()).unwrap().count(), 1, "nothing left beside it");
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }
}
