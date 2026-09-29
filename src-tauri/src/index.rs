// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! A full-text index of the commentaries and dictionaries, so searching them does not mean
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
use std::sync::Mutex;

#[derive(Default)]
pub struct Index {
    pub path: PathBuf,
    /// Modules ("commentary/gill") whose index matches the file on disk.
    ready: Mutex<HashMap<String, bool>>,
    pub building: AtomicBool,
    pub done: AtomicUsize,
    pub total: AtomicUsize,
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
    let m = std::fs::metadata(path).ok();
    let len = m.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime =
        m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    // The version changes when what goes in the index does (2: hyphens inside words taken out), so
    // every module is indexed again.
    format!("2-{len}-{mtime}")
}

fn open(path: &Path) -> rusqlite::Result<Connection> {
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
        .filter(|m| (m.kind == Kind::Commentary && m.id != "tsk") || m.kind == Kind::Dictionary)
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

    /// Brings the index up to date with the library. Runs on a background thread.
    pub fn update(&self, lib: &Library) -> Result<(), String> {
        if self.building.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        let r = self.update_inner(lib);
        self.building.store(false, Ordering::SeqCst);
        r
    }

    fn update_inner(&self, lib: &Library) -> Result<(), String> {
        let mut c = open(&self.path).map_err(|e| e.to_string())?;
        let want = indexed_kinds(lib);
        let have: HashMap<String, String> = {
            let mut st = c.prepare("SELECT key, stamp FROM modules").map_err(|e| e.to_string())?;
            let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).collect()
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
        let c = open(&self.path).map_err(|e| e.to_string())?;
        let mut st = c
            .prepare_cached("SELECT map.src FROM docs JOIN map ON map.rowid = docs.rowid WHERE docs MATCH ?1 AND map.key = ?2")
            .map_err(|e| e.to_string())?;
        let rows = st.query_map(params![fts_query, key(kind, id)], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
        let mut v: Vec<i64> = rows.filter_map(Result::ok).collect();
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
        _ => "SELECT rowid, Topic || ' ' || Definition FROM Dictionary",
    };
    let rows: Vec<(i64, String)> = lib.with(kind, id, |src| {
        let mut st = src.prepare(sql)?;
        let r = st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default())))?;
        r.collect()
    })?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    {
        let mut map = tx.prepare("INSERT INTO map(key, src) VALUES (?1, ?2)").map_err(|e| e.to_string())?;
        let mut doc = tx.prepare("INSERT INTO docs(rowid, body) VALUES (?1, ?2)").map_err(|e| e.to_string())?;
        for (src, html) in rows {
            map.execute(params![k, src]).map_err(|e| e.to_string())?;
            let rowid = tx.last_insert_rowid();
            // Without the hyphens inside words, as search takes them out of the query.
            doc.execute(params![rowid, crate::search::unhyphen(&plain(&html)).0]).map_err(|e| e.to_string())?;
        }
    }
    tx.execute("INSERT OR REPLACE INTO modules(key, stamp) VALUES (?1, ?2)", params![k, stamp(path)]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// FTS5 query for the words: a quoted phrase, or quoted terms joined with AND / OR.
pub fn fts_query(terms: &[String], phrase: &str, mode: crate::search::Mode) -> String {
    let q = |t: &str| format!("\"{}\"", t.replace('"', "\"\""));
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
    fn builds_queries() {
        let t = vec!["born".to_string(), "again".to_string()];
        assert_eq!(fts_query(&t, "born again", Mode::Phrase), "\"born again\"");
        assert_eq!(fts_query(&t, "", Mode::All), "\"born\" AND \"again\"");
        assert_eq!(fts_query(&t, "", Mode::Any), "\"born\" OR \"again\"");
    }
}
