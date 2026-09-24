//! The e-Sword X library: every module is a SQLite file in e-Sword's container, opened
//! read-only and immutable so nothing we do can change it or take a lock e-Sword would notice.

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Bible,
    Commentary,
    Dictionary,
    Lexicon,
    Reference,
    Devotional,
}

impl Kind {
    fn from_ext(ext: &str) -> Option<Kind> {
        match ext {
            "bbli" => Some(Kind::Bible),
            "cmti" => Some(Kind::Commentary),
            "dcti" => Some(Kind::Dictionary),
            "lexi" => Some(Kind::Lexicon),
            "refi" => Some(Kind::Reference),
            "devi" => Some(Kind::Devotional),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfo {
    /// The file name without its extension ("kjv+"), unique within a kind.
    pub id: String,
    pub kind: Kind,
    pub title: String,
    pub abbrev: String,
    /// e-Sword's own description, HTML.
    pub info: String,
    /// Bibles only: the text carries Strong's numbers (`<num>G25</num>`).
    pub strongs: bool,
    #[serde(skip)]
    pub path: PathBuf,
}

pub struct Library {
    pub dir: PathBuf,
    pub modules: Vec<ModuleInfo>,
    conns: Mutex<HashMap<String, Connection>>,
}

/// Where e-Sword X keeps its modules.
pub fn default_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    Path::new(&home).join("Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
}

pub fn open_readonly(path: &Path) -> rusqlite::Result<Connection> {
    // immutable=1: SQLite assumes nobody changes the file, so it never creates a journal or
    // takes a lock. e-Sword only ever reads its modules, so that holds.
    let uri = format!("file:{}?immutable=1", url_escape(&path.to_string_lossy()));
    Connection::open_with_flags(uri, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI | OpenFlags::SQLITE_OPEN_NO_MUTEX)
}

fn url_escape(p: &str) -> String {
    let mut out = String::with_capacity(p.len());
    for ch in p.chars() {
        match ch {
            ' ' => out.push_str("%20"),
            '?' => out.push_str("%3f"),
            '#' => out.push_str("%23"),
            '%' => out.push_str("%25"),
            '+' => out.push_str("%2b"),
            _ => out.push(ch),
        }
    }
    out
}

impl Library {
    pub fn scan(dir: PathBuf) -> Library {
        let mut modules = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let path = e.path();
                let (Some(stem), Some(ext)) = (path.file_stem().and_then(|s| s.to_str()), path.extension().and_then(|s| s.to_str())) else { continue };
                let Some(kind) = Kind::from_ext(&ext.to_ascii_lowercase()) else { continue };
                match read_details(&path, kind) {
                    Ok((title, abbrev, info, strongs)) => modules.push(ModuleInfo { id: stem.to_string(), kind, title, abbrev, info, strongs, path }),
                    Err(err) => eprintln!("skipping {}: {err}", path.display()),
                }
            }
        }
        modules.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        Library { dir, modules, conns: Mutex::new(HashMap::new()) }
    }

    pub fn module(&self, kind: Kind, id: &str) -> Result<&ModuleInfo, String> {
        self.modules.iter().find(|m| m.kind == kind && m.id == id).ok_or_else(|| format!("no {kind:?} module called {id}"))
    }

    pub fn of_kind(&self, kind: Kind) -> impl Iterator<Item = &ModuleInfo> {
        self.modules.iter().filter(move |m| m.kind == kind)
    }

    /// Runs `f` on the module's (cached) connection.
    pub fn with<T>(&self, kind: Kind, id: &str, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
        let m = self.module(kind, id)?;
        let key = format!("{kind:?}/{id}");
        let mut conns = self.conns.lock().map_err(|e| e.to_string())?;
        if !conns.contains_key(&key) {
            let c = open_readonly(&m.path).map_err(|e| e.to_string())?;
            conns.insert(key.clone(), c);
        }
        f(conns.get(&key).expect("inserted above")).map_err(|e| e.to_string())
    }
}

fn read_details(path: &Path, kind: Kind) -> rusqlite::Result<(String, String, String, bool)> {
    let c = open_readonly(path)?;
    let (title, abbrev, info): (String, String, String) = c.query_row("SELECT Title, Abbreviation, Information FROM Details LIMIT 1", [], |r| {
        Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?.unwrap_or_default()))
    })?;
    let strongs = kind == Kind::Bible
        && c.query_row("SELECT 1 FROM Bible WHERE Book = 43 AND Chapter = 3 AND Scripture LIKE '%<num>%' LIMIT 1", [], |_| Ok(())).optional()?.is_some();
    Ok((title, abbrev, info, strongs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_uri_characters() {
        assert_eq!(url_escape("/a b/kjv+.bbli"), "/a%20b/kjv%2b.bbli");
        assert_eq!(url_escape("/x?y#z%"), "/x%3fy%23z%25");
    }

    #[test]
    fn kinds_from_extensions() {
        assert_eq!(Kind::from_ext("bbli"), Some(Kind::Bible));
        assert_eq!(Kind::from_ext("refi"), Some(Kind::Reference));
        assert_eq!(Kind::from_ext("devi"), Some(Kind::Devotional));
        assert_eq!(Kind::from_ext("dzip"), None);
    }
}
