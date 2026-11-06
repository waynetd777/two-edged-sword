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
use std::collections::HashSet;
use std::io::{Read, Write};
use std::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    lib: RwLock<Library>,
    /** Downloads asked to stop, by file name. */
    cancelled: Mutex<HashSet<String>>,
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
    /// Its file name ("barnes.cmti").
    file: String,
    size: u64,
    /// "bundled" (in the app) or "app" (downloaded, so it can be removed).
    source: Source,
    /// What it has beyond plain text: "Maps" for a book of maps.
    features: Vec<&'static str>,
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
        .map(|m| Module {
            id: m.id.clone(),
            kind: m.kind,
            title: m.title.clone(),
            abbrev: m.abbrev.clone(),
            strongs: m.strongs,
            rtl: m.rtl,
            file: m.path.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default(),
            size: m.size,
            source: m.source,
            features: m.features.clone(),
        })
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

#[tauri::command(async)]
fn strongs_for_word(st: State<AppState>, bible: String, word: String) -> Result<Vec<content::WordNumber>, String> {
    content::strongs_for_word(&st.lib.read().unwrap(), &bible, &word)
}

#[tauri::command(async)]
fn strongs_by_book(st: State<AppState>, bible: String, number: String) -> Result<Vec<(i64, i64)>, String> {
    content::strongs_by_book(&st.lib.read().unwrap(), &bible, &number)
}

#[tauri::command(async)]
fn strongs_verses(st: State<AppState>, bible: String, number: String, book: Option<i64>, limit: usize) -> Result<Vec<content::VerseHit>, String> {
    content::strongs_verses(&st.lib.read().unwrap(), &bible, &number, book, limit)
}

#[tauri::command(async)]
fn translit_search(st: State<AppState>, lexicon: String, query: String, limit: usize) -> Result<Vec<content::TranslitHit>, String> {
    content::translit_search(&st.lib.read().unwrap(), &lexicon, &query, limit)
}

#[tauri::command(async)]
fn find_topics(st: State<AppState>, word: String) -> Vec<content::TopicHit> {
    content::find_topics(&st.lib.read().unwrap(), &word, 8)
}

/// Every passage a commentary comments on, in order (F. B. Meyer's plan).
#[tauri::command(async)]
fn commentary_ranges(st: State<AppState>, module: String) -> Result<Vec<content::VerseRange>, String> {
    content::commentary_ranges(&st.lib.read().unwrap(), &module)
}

/// A devotional's days, in calendar order ("January 1").
#[tauri::command(async)]
fn devotion_titles(st: State<AppState>, module: String) -> Result<Vec<String>, String> {
    content::devotion_titles(&st.lib.read().unwrap(), &module)
}

/// A devotional's reading for a day ("September 24").
#[tauri::command(async)]
fn devotion(st: State<AppState>, module: String, title: String) -> Result<Option<String>, String> {
    content::devotion(&st.lib.read().unwrap(), &module, &title)
}

/// A dictionary's entries starting with `prefix`, in order ("" for all of them).
#[tauri::command(async)]
fn list_topics(st: State<AppState>, kind: Kind, module: String, prefix: String, limit: usize) -> Result<Vec<String>, String> {
    content::topics(&st.lib.read().unwrap(), kind, &module, &prefix, limit)
}

/// A reference book's chapters, in order.
#[tauri::command(async)]
fn reference_titles(st: State<AppState>, module: String) -> Result<Vec<String>, String> {
    content::reference_titles(&st.lib.read().unwrap(), &module)
}

// ---------- downloads (mobile/tools/modules_release.py makes what they fetch) ----------

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(std::time::Duration::from_secs(10)).timeout_read(std::time::Duration::from_secs(30)).build()
}

/// The downloads' manifest, as text.
#[tauri::command(async)]
fn fetch_manifest(url: String) -> Result<String, String> {
    agent().get(&url).call().map_err(|e| e.to_string())?.into_string().map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
struct Progress {
    file: String,
    done: u64,
    total: u64,
}

/// A name with no folder in it: the manifest's file names go into the Modules folder and nowhere else.
fn safe_name(file: &str) -> Result<&str, String> {
    let ok = !file.is_empty() && !file.starts_with('.') && file.chars().all(|c| c.is_ascii_alphanumeric() || "._+-".contains(c));
    ok.then_some(file).ok_or_else(|| format!("not a module file name: {file}"))
}

/// Downloads `url` (a gzipped module), unpacking it as it comes and checking it against `sha256`,
/// into the Modules folder; then the library is read again. Progress goes out as "download" events.
#[tauri::command(async)]
fn download(app: AppHandle, st: State<AppState>, url: String, file: String, sha256: String, size: u64) -> Result<(), String> {
    use sha2::Digest;
    let file = safe_name(&file)?.to_string();
    st.cancelled.lock().unwrap().remove(&file);
    let dir = library::app_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let part = dir.join(format!(".{file}.part"));
    let result = (|| -> Result<(), String> {
        let resp = agent().get(&url).call().map_err(|e| e.to_string())?;
        let mut gz = flate2::read::GzDecoder::new(resp.into_reader());
        let mut out = std::io::BufWriter::new(std::fs::File::create(&part).map_err(|e| e.to_string())?);
        let mut hash = sha2::Sha256::new();
        let mut buf = vec![0u8; 256 * 1024];
        let (mut done, mut told) = (0u64, 0u64);
        loop {
            if st.cancelled.lock().unwrap().contains(&file) {
                return Err("cancelled".into());
            }
            let n = gz.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hash.update(&buf[..n]);
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            done += n as u64;
            if done - told >= 512 * 1024 {
                told = done;
                let _ = app.emit("download", Progress { file: file.clone(), done, total: size });
            }
        }
        out.flush().map_err(|e| e.to_string())?;
        let got: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if !got.eq_ignore_ascii_case(&sha256) {
            return Err("the download was damaged; try again".into());
        }
        std::fs::rename(&part, dir.join(&file)).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&part);
        return result;
    }
    *st.lib.write().unwrap() = scan();
    let _ = app.emit("download", Progress { file, done: size, total: size });
    Ok(())
}

#[tauri::command]
fn cancel_download(st: State<AppState>, file: String) {
    st.cancelled.lock().unwrap().insert(file);
}

/// Removes a downloaded module (never one that ships in the app), then reads the library again.
#[tauri::command(async)]
fn remove_module(st: State<AppState>, file: String) -> Result<(), String> {
    let path = library::app_dir().join(safe_name(&file)?);
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    *st.lib.write().unwrap() = scan();
    Ok(())
}

// ---------- the daily reminder ----------

#[derive(serde::Deserialize)]
struct Remind {
    id: i32,
    /// When, in milliseconds since the epoch.
    at: i64,
    title: String,
    body: String,
}

/// The reminder's ids: one a day, a fortnight ahead at most.
const REMINDER_IDS: std::ops::Range<i32> = 1000..1014;

/// Replaces the scheduled reminders with `list` (none turns them off). Asks for permission the first
/// time; an error says notifications are off.
#[tauri::command(async)]
fn schedule_reminders(app: AppHandle, list: Vec<Remind>) -> Result<(), String> {
    use tauri_plugin_notification::{NotificationExt, PermissionState, Schedule};
    let n = app.notification();
    #[cfg(mobile)]
    let _ = n.cancel(REMINDER_IDS.collect());
    if list.is_empty() {
        return Ok(());
    }
    let mut state = n.permission_state().map_err(|e| e.to_string())?;
    if state != PermissionState::Granted {
        state = n.request_permission().map_err(|e| e.to_string())?;
    }
    if state != PermissionState::Granted {
        return Err("Notifications are off for Two-edged Sword. Turn them on in the iPhone's Settings.".into());
    }
    for r in list.into_iter().filter(|r| REMINDER_IDS.contains(&r.id)) {
        let date = time::OffsetDateTime::from_unix_timestamp_nanos(r.at as i128 * 1_000_000).map_err(|e| e.to_string())?;
        n.builder()
            .id(r.id)
            .title(r.title)
            .body(r.body)
            .schedule(Schedule::At { date, repeating: false, allow_while_idle: true })
            .show()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Bibles, commentaries and dictionaries, as the desktop searches them. No full-text index yet: the
/// bundled commentaries are small enough to scan.
#[tauri::command(async)]
fn search(st: State<AppState>, q: search::Query) -> Result<search::Results, String> {
    search::run(&st.lib.read().unwrap(), None, &q)
}

/// Android: the bundled modules, copied out of the APK by the plugin into `dir`/modules; the library is
/// read again with them.
#[tauri::command(async)]
fn set_bundled(st: State<AppState>, dir: String) {
    *store::RESOURCE_DIR.write().unwrap() = Some(std::path::PathBuf::from(dir));
    *st.lib.write().unwrap() = scan();
}

/// Debug builds: the UI's errors and console.error, in the app's own log (`xcrun simctl launch --console`).
#[tauri::command]
fn log(msg: String) {
    if cfg!(debug_assertions) {
        eprintln!("[ui] {msg}");
    }
}

/// Debug builds only: a state to open in, from TES_SCENE (comma-separated: study, goto, word, verse, xrefs,
/// picker, dict, end, hop, stepnext, listen, listendoc, listenplan, mark, saved, bible=<id>, more, plan=<year|nt90|gospels|ppo>, page=<plans|settings>, search, q=<words>, study=<number or word>, library, modules=<url>, get=<file>, at=<ref>, maps, doc=<module>[|chapter], image), so a screenshot can show a sheet without anyone tapping. On the Simulator:
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
        .plugin(tauri_plugin_tes_native::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let paths = app.path();
            let _ = store::DATA_DIR.set(paths.app_data_dir()?);
            *store::RESOURCE_DIR.write().unwrap() = Some(paths.resource_dir()?);
            let _ = std::fs::create_dir_all(library::app_dir());
            app.manage(AppState { lib: RwLock::new(scan()), cancelled: Mutex::new(HashSet::new()) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![log, scene, set_bundled, modules, chapter, chapter_sizes, commentary, coverage, article, strongs_for_word, search, strongs_by_book, strongs_verses, translit_search, find_topics, fetch_manifest, list_topics, reference_titles, devotion_titles, devotion, commentary_ranges, schedule_reminders, download, cancel_download, remove_module])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
