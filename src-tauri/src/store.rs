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
    let tmp = p.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

pub fn write_text_atomic(p: &std::path::Path, text: &str) -> Result<(), String> {
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, p).map_err(|e| e.to_string())
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
}
