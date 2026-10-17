// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The KJV's words, for the spell checkers (spell.rs on macOS, spell_win.rs on Windows): every
//! word in it counts as spelled right, and a sentence in KJV English isn't grammar-checked.

use std::collections::HashSet;
use std::sync::OnceLock;

/// Every word in the user's KJV, lowercase; read once at start, in the background.
pub static KJV: OnceLock<HashSet<String>> = OnceLock::new();

/// Words that mark a sentence as KJV English even though macOS knows them.
pub const KJV_MARKERS: &[&str] =
    &["thee", "thou", "thy", "thine", "ye", "hast", "hath", "dost", "doth", "shalt", "wast", "wert", "canst", "saith", "unto", "spake"];

pub fn norm(w: &str) -> String {
    w.trim_matches(|c: char| c == '\'' || c == '’').replace('’', "'").to_lowercase()
}

pub fn words(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !(c.is_alphabetic() || c == '\'' || c == '’')).map(norm).filter(|w| !w.is_empty())
}

/// Reads the KJV's words from the library (a Bible whose abbreviation is KJV), off the main
/// thread. One read at a time: a caller arriving during another's waits for it rather than
/// reading them again. Tags (Strong's numbers, notes) are dropped.
pub fn load_kjv(lib: &crate::library::Library) {
    use crate::library::Kind;
    static LOADING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _one = LOADING.lock().unwrap_or_else(|e| e.into_inner());
    if kjv_ready() {
        return;
    }
    let Some(id) = lib.of_kind(Kind::Bible).find(|m| m.abbrev.eq_ignore_ascii_case("KJV")).map(|m| m.id.clone()) else { return };
    let texts = lib.with(Kind::Bible, &id, |c| {
        let mut st = c.prepare("SELECT Scripture FROM Bible")?;
        let rows = st.query_map([], |r| r.get::<_, Option<String>>(0))?;
        rows.map(|r| r.map(|t| t.unwrap_or_default())).collect::<rusqlite::Result<Vec<_>>>()
    });
    // A KJV that can't be read isn't tried again on every check: spelling goes on without it.
    let texts = texts.unwrap_or_else(|e| {
        eprintln!("spelling: the KJV's words: {e}");
        Vec::new()
    });
    let mut set = HashSet::new();
    for t in texts {
        let mut plain = String::with_capacity(t.len());
        let mut tag = false;
        for c in t.chars() {
            match c {
                '<' => tag = true,
                '>' => {
                    tag = false;
                    plain.push(' ')
                }
                _ if !tag => plain.push(c),
                _ => {}
            }
        }
        set.extend(words(&plain));
    }
    let _ = KJV.set(set);
}

/// Whether the KJV's words have been read (the journal's first check waits for them, since what
/// it finds is kept for each paragraph).
pub fn kjv_ready() -> bool {
    KJV.get().is_some()
}

pub fn in_kjv(word: &str) -> bool {
    KJV.get().is_some_and(|k| k.contains(&norm(word)))
}
