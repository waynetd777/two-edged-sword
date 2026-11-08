// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! A full-text index of the commentaries, dictionaries, books and devotionals, so searching them does not mean
//! reading several hundred megabytes of HTML with LIKE each time. It is derived data, kept in
//! the app's data folder, built in the background, and rebuilt per module whenever a module's
//! file changes (or a new module appears). Until a module is indexed, search falls back to LIKE.

use crate::library::{Kind, Library};
use crate::search::plain;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct Index {
    pub path: PathBuf,
    /// Modules ("commentary/gill") whose index matches the file on disk.
    ready: Mutex<HashMap<String, bool>>,
    pub building: AtomicBool,
    pub done: AtomicUsize,
    pub total: AtomicUsize,
    /// The library to index next: one asked for while a build runs is done when it finishes.
    next: Mutex<Option<Arc<Library>>>,
    /// The connection searches read through, opened on the first.
    reader: Mutex<Option<Connection>>,
    /// A search found the file damaged: the next update makes it again.
    corrupt: AtomicBool,
}

#[derive(Serialize)]
pub struct Progress {
    pub building: bool,
    pub done: usize,
    pub total: usize,
}

pub fn key(kind: Kind, id: &str) -> String {
    format!("{kind:?}/{id}").to_lowercase()
}

fn stamp(path: &Path) -> String {
    let (len, mtime) = crate::store::file_stamp(path);
    let mtime = mtime.as_secs();
    // The version changes when what goes in the index does (2: hyphens inside words taken out), so
    // every module is indexed again.
    format!("2-{len}-{mtime}")
}

/// The file is damaged (a crash or full disk mid-write) or isn't a database at all.
fn is_corrupt(e: &rusqlite::Error) -> bool {
    matches!(e.sqlite_error_code(), Some(rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase))
}

/// The same from an error already made text (build_one's).
fn says_corrupt(e: &str) -> bool {
    e.contains("malformed") || e.contains("not a database")
}

/// Deletes the index and its WAL files, so the next open starts a new one.
fn delete_files(path: &Path) {
    for end in ["", "-wal", "-shm"] {
        let mut p = path.as_os_str().to_owned();
        p.push(end);
        let _ = std::fs::remove_file(PathBuf::from(p));
    }
}

/// Opens the index, made again from nothing if the file is damaged: it holds nothing that can't be rebuilt.
fn open(path: &Path) -> rusqlite::Result<Connection> {
    match open_once(path) {
        Err(e) if is_corrupt(&e) => {
            eprintln!("search index damaged ({e}); making it again");
            delete_files(path);
            open_once(path)
        }
        r => r,
    }
}

fn open_once(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(p) = path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let c = Connection::open(path)?;
    c.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS modules (key TEXT PRIMARY KEY, stamp TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS map (rowid INTEGER PRIMARY KEY, key TEXT NOT NULL, src INTEGER NOT NULL);
         CREATE INDEX IF NOT EXISTS map_key ON map(key);
         CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2');",
    )?;
    Ok(c)
}

fn indexed_kinds(lib: &Library) -> Vec<(Kind, String, PathBuf)> {
    lib.modules
        .iter()
        .filter(|m| {
            (m.kind == Kind::Commentary && m.id != "tsk") || matches!(m.kind, Kind::Dictionary | Kind::Reference | Kind::Devotional)
        })
        .map(|m| (m.kind, m.id.clone(), m.path.clone()))
        .collect()
}

impl Index {
    pub fn new(path: PathBuf) -> Index {
        Index { path, ..Default::default() }
    }

    pub fn is_ready(&self, kind: Kind, id: &str) -> bool {
        self.ready.lock().map(|r| r.get(&key(kind, id)).copied().unwrap_or(false)).unwrap_or(false)
    }

    pub fn progress(&self) -> Progress {
        Progress {
            building: self.building.load(Ordering::SeqCst),
            done: self.done.load(Ordering::SeqCst),
            total: self.total.load(Ordering::SeqCst),
        }
    }

    /// Brings the index up to date with the library. Runs on a background thread. While a build
    /// is running this returns at once, and that build goes on to index `lib` when it is done.
    pub fn update(&self, lib: Arc<Library>) -> Result<(), String> {
        *self.next.lock().unwrap_or_else(|e| e.into_inner()) = Some(lib);
        let mut r = Ok(());
        loop {
            if self.building.swap(true, Ordering::SeqCst) {
                return r;
            }
            while let Some(lib) = self.next.lock().unwrap_or_else(|e| e.into_inner()).take() {
                r = self.update_inner(&lib);
            }
            self.building.store(false, Ordering::SeqCst);
            // One asked for between the last look and here would otherwise wait for the next update.
            if self.next.lock().unwrap_or_else(|e| e.into_inner()).is_none() {
                return r;
            }
        }
    }

    /// Deletes a damaged index, closing the searches' connection to it first.
    fn start_over(&self) {
        *self.reader.lock().unwrap_or_else(|e| e.into_inner()) = None;
        eprintln!("search index damaged; making it again");
        delete_files(&self.path);
    }

    fn update_inner(&self, lib: &Library) -> Result<(), String> {
        if self.corrupt.swap(false, Ordering::SeqCst) {
            self.start_over();
        }
        let mut c = open(&self.path).map_err(|e| e.to_string())?;
        let want = indexed_kinds(lib);
        let stamps = |c: &Connection| -> rusqlite::Result<HashMap<String, String>> {
            let mut st = c.prepare("SELECT key, stamp FROM modules")?;
            let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            Ok(rows.filter_map(Result::ok).collect())
        };
        let have = match stamps(&c) {
            Ok(h) => h,
            Err(e) if is_corrupt(&e) => {
                drop(c);
                self.start_over();
                c = open(&self.path).map_err(|e| e.to_string())?;
                stamps(&c).map_err(|e| e.to_string())?
            }
            Err(e) => return Err(e.to_string()),
        };
        let mut todo = Vec::new();
        {
            let mut ready = self.ready.lock().map_err(|e| e.to_string())?;
            ready.clear();
            for (kind, id, path) in &want {
                let k = key(*kind, id);
                let fresh = have.get(&k).is_some_and(|s| *s == stamp(path));
                ready.insert(k, fresh);
                if !fresh {
                    todo.push((*kind, id.clone(), path.clone()));
                }
            }
        }
        // Drop modules that are gone.
        let wanted: Vec<String> = want.iter().map(|(k, id, _)| key(*k, id)).collect();
        for k in have.keys().filter(|k| !wanted.contains(k)) {
            remove(&mut c, k).map_err(|e| e.to_string())?;
        }
        self.total.store(todo.len(), Ordering::SeqCst);
        self.done.store(0, Ordering::SeqCst);
        for (kind, id, path) in todo {
            let k = key(kind, &id);
            if let Err(e) = build_one(&mut c, lib, kind, &id, &path) {
                eprintln!("index {k}: {e}");
                if says_corrupt(&e) {
                    // Made again from nothing on the next update (the next launch, or modules added).
                    self.corrupt.store(true, Ordering::SeqCst);
                    break;
                }
            } else if let Ok(mut ready) = self.ready.lock() {
                ready.insert(k, true);
            }
            self.done.fetch_add(1, Ordering::SeqCst);
        }
        let _ = c.execute_batch("INSERT INTO docs(docs) VALUES('optimize');");
        Ok(())
    }

    /// Source rowids in the module whose text contains the words (candidates only: the caller
    /// applies the exact phrase and whole-word rules to the text).
    pub fn candidates(&self, kind: Kind, id: &str, fts_query: &str) -> Result<Vec<i64>, String> {
        let mut reader = self.reader.lock().unwrap_or_else(|e| e.into_inner());
        let c = match reader.as_mut() {
            Some(c) => c,
            None => reader.insert(open(&self.path).map_err(|e| e.to_string())?),
        };
        let found = (|| -> rusqlite::Result<Vec<i64>> {
            let mut st =
                c.prepare_cached("SELECT map.src FROM docs JOIN map ON map.rowid = docs.rowid WHERE docs MATCH ?1 AND map.key = ?2")?;
            let rows = st.query_map(params![fts_query, key(kind, id)], |r| r.get::<_, i64>(0))?;
            rows.collect()
        })();
        let mut v = match found {
            Ok(v) => v,
            Err(e) => {
                if is_corrupt(&e) {
                    // Searches read the modules directly until it is made again.
                    self.corrupt.store(true, Ordering::SeqCst);
                    *reader = None;
                    if let Ok(mut ready) = self.ready.lock() {
                        ready.clear();
                    }
                }
                return Err(e.to_string());
            }
        };
        v.sort_unstable();
        Ok(v)
    }
}

fn remove(c: &mut Connection, k: &str) -> rusqlite::Result<()> {
    let tx = c.transaction()?;
    tx.execute("DELETE FROM docs WHERE rowid IN (SELECT rowid FROM map WHERE key = ?1)", params![k])?;
    tx.execute("DELETE FROM map WHERE key = ?1", params![k])?;
    tx.execute("DELETE FROM modules WHERE key = ?1", params![k])?;
    tx.commit()
}

fn build_one(c: &mut Connection, lib: &Library, kind: Kind, id: &str, path: &Path) -> Result<(), String> {
    let k = key(kind, id);
    remove(c, &k).map_err(|e| e.to_string())?;
    let sql = match kind {
        Kind::Commentary => "SELECT rowid, Comments FROM VerseCommentary",
        Kind::Reference => "SELECT rowid, Content FROM Reference",
        Kind::Devotional => "SELECT rowid, Devotion FROM Devotional",
        _ => "SELECT rowid, Topic || ' ' || Definition FROM Dictionary",
    };
    let tx = c.transaction().map_err(|e| e.to_string())?;
    // A row at a time, straight from the module: a big dictionary is never held whole.
    lib.with(kind, id, |src| {
        let mut st = src.prepare(sql)?;
        let mut rows = st.query([])?;
        let mut map = tx.prepare("INSERT INTO map(key, src) VALUES (?1, ?2)")?;
        let mut doc = tx.prepare("INSERT INTO docs(rowid, body) VALUES (?1, ?2)")?;
        while let Some(r) = rows.next()? {
            let (src, html) = (r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default());
            map.execute(params![k, src])?;
            let rowid = tx.last_insert_rowid();
            // Without the hyphens inside words, as search takes them out of the query.
            doc.execute(params![rowid, crate::search::unhyphen(&plain(&html)).0])?;
        }
        Ok(())
    })?;
    tx.execute("INSERT OR REPLACE INTO modules(key, stamp) VALUES (?1, ?2)", params![k, stamp(path)]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// FTS5 query for the words: a quoted phrase, or quoted terms joined with AND / OR. With `prefix`
/// (a search for part words), each term, or the phrase's last word, also matches words it begins.
pub fn fts_query(terms: &[String], phrase: &str, mode: crate::search::Mode, prefix: bool) -> String {
    let star = if prefix { " *" } else { "" };
    let q = |t: &str| format!("\"{}\"{star}", t.replace('"', "\"\""));
    match mode {
        crate::search::Mode::Phrase => q(phrase),
        crate::search::Mode::All => terms.iter().map(|t| q(t)).collect::<Vec<_>>().join(" AND "),
        crate::search::Mode::Any => terms.iter().map(|t| q(t)).collect::<Vec<_>>().join(" OR "),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::Mode;

    #[test]
    fn a_damaged_index_is_made_again() {
        let dir = std::env::temp_dir().join(format!("tes-index-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("search-index.sqlite");
        std::fs::write(&path, vec![0x5au8; 8192]).unwrap();
        let c = open(&path).unwrap();
        assert_eq!(c.query_row("SELECT count(*) FROM modules", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn builds_queries() {
        let t = vec!["born".to_string(), "again".to_string()];
        assert_eq!(fts_query(&t, "born again", Mode::Phrase, false), "\"born again\"");
        assert_eq!(fts_query(&t, "", Mode::All, false), "\"born\" AND \"again\"");
        assert_eq!(fts_query(&t, "", Mode::Any, false), "\"born\" OR \"again\"");
        assert_eq!(fts_query(&t, "born again", Mode::Phrase, true), "\"born again\" *");
        assert_eq!(fts_query(&t, "", Mode::All, true), "\"born\" * AND \"again\" *");
    }
}
