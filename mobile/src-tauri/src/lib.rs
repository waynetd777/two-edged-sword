// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The phone app's Rust side. The module readers are the desktop app's own files, compiled in
//! here unchanged (#[path]), so a fix to reading modules reaches both apps. Only store.rs is the
//! phone's own: where the folders are.

#![allow(dead_code)]

#[path = "../../../src-tauri/src/content.rs"]
mod content;
#[path = "../../../src-tauri/src/index.rs"]
mod index;
#[path = "../../../src-tauri/src/library.rs"]
mod library;
#[path = "../../../src-tauri/src/search.rs"]
mod search;
mod store;

use library::{Kind, Library, Source};
use serde::Serialize;
use std::sync::RwLock;
use tauri::{Manager, State};

struct AppState {
    lib: RwLock<Library>,
}

/// What the UI needs to know of a module: not its description or path.
#[derive(Serialize)]
struct Module {
    id: String,
    kind: Kind,
    title: String,
    abbrev: String,
    strongs: bool,
    rtl: bool,
}

fn scan() -> Library {
    // No e-Sword on a phone: the app's downloads first, then what ships in the app.
    Library::scan_choosing(vec![(Source::App, library::app_dir()), (Source::Bundled, library::bundled_dir())], &Default::default())
}

#[tauri::command]
fn modules(st: State<AppState>) -> Vec<Module> {
    let lib = st.lib.read().unwrap();
    lib.modules
        .iter()
        .map(|m| Module { id: m.id.clone(), kind: m.kind, title: m.title.clone(), abbrev: m.abbrev.clone(), strongs: m.strongs, rtl: m.rtl })
        .collect()
}

#[tauri::command(async)]
fn chapter(st: State<AppState>, bible: String, book: i64, chapter: i64) -> Result<Vec<content::Verse>, String> {
    content::chapter(&st.lib.read().unwrap(), &bible, book, chapter)
}

#[tauri::command(async)]
fn chapter_sizes(st: State<AppState>, bible: String) -> Result<Vec<(i64, i64, i64)>, String> {
    content::chapter_sizes(&st.lib.read().unwrap(), &bible)
}

#[tauri::command(async)]
fn commentary(st: State<AppState>, module: String, book: i64, chapter: i64, verse: i64) -> Result<content::Commentary, String> {
    content::commentary(&st.lib.read().unwrap(), &module, book, chapter, verse)
}

#[tauri::command(async)]
fn coverage(st: State<AppState>, book: i64, chapter: i64, verse: i64) -> Vec<content::Coverage> {
    content::coverage(&st.lib.read().unwrap(), book, chapter, verse)
}

#[tauri::command(async)]
fn article(st: State<AppState>, kind: Kind, module: String, topic: String) -> Result<Option<content::Article>, String> {
    content::article(&st.lib.read().unwrap(), kind, &module, &topic)
}

/// Debug builds only: a state to open in, from TES_SCENE (comma-separated: study, goto, word, verse, xrefs,
/// picker, end), so a screenshot can show a sheet without anyone tapping. On the Simulator:
/// `SIMCTL_CHILD_TES_SCENE=study xcrun simctl launch booted com.wayned.two-edged-sword`.
#[tauri::command]
fn scene() -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var("TES_SCENE").ok()
    } else {
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let paths = app.path();
            let _ = store::DATA_DIR.set(paths.app_data_dir()?);
            let _ = store::RESOURCE_DIR.set(paths.resource_dir()?);
            let _ = std::fs::create_dir_all(library::app_dir());
            app.manage(AppState { lib: RwLock::new(scan()) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![scene, modules, chapter, chapter_sizes, commentary, coverage, article])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
