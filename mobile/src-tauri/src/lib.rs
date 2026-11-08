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
// Sync with the desktop app: pairing and encrypted requests (sync.rs), with the desktop's own encryption.
mod sync;
#[path = "../../../src-tauri/src/sync_crypto.rs"]
mod sync_crypto;

use library::{Kind, Library, Source};
use serde::Serialize;
use std::collections::HashSet;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    /// The library as last read. Each command takes its own handle (lib_of) and lets go of the lock at once,
    /// so a long search doesn't hold up a module being added, nor that the commands queued behind it.
    lib: RwLock<Arc<Library>>,
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

/// The library as it is now, held for as long as the caller needs it without keeping the lock.
fn lib_of(st: &AppState) -> Arc<Library> {
    st.lib.read().unwrap().clone()
}

fn scan() -> Library {
    // No e-Sword on a phone: the app's downloads first, then what ships in the app.
    Library::scan_choosing(vec![(Source::App, library::app_dir()), (Source::Bundled, library::bundled_dir())], &Default::default())
}

#[tauri::command(async)]
fn modules(st: State<AppState>) -> Vec<Module> {
    let lib = lib_of(&st);
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
    content::chapter(&lib_of(&st), &bible, book, chapter)
}

#[tauri::command(async)]
fn chapter_sizes(st: State<AppState>, bible: String) -> Result<Vec<(i64, i64, i64)>, String> {
    content::chapter_sizes(&lib_of(&st), &bible)
}

#[tauri::command(async)]
fn commentary(st: State<AppState>, module: String, book: i64, chapter: i64, verse: i64) -> Result<content::Commentary, String> {
    content::commentary(&lib_of(&st), &module, book, chapter, verse)
}

#[tauri::command(async)]
fn coverage(st: State<AppState>, book: i64, chapter: i64, verse: i64) -> Vec<content::Coverage> {
    content::coverage(&lib_of(&st), book, chapter, verse)
}

#[tauri::command(async)]
fn article(st: State<AppState>, kind: Kind, module: String, topic: String) -> Result<Option<content::Article>, String> {
    content::article(&lib_of(&st), kind, &module, &topic)
}

#[tauri::command(async)]
fn strongs_for_word(st: State<AppState>, bible: String, word: String) -> Result<Vec<content::WordNumber>, String> {
    content::strongs_for_word(&lib_of(&st), &bible, &word)
}

#[tauri::command(async)]
fn strongs_by_book(st: State<AppState>, bible: String, number: String) -> Result<Vec<(i64, i64)>, String> {
    content::strongs_by_book(&lib_of(&st), &bible, &number)
}

#[tauri::command(async)]
fn strongs_verses(
    st: State<AppState>,
    bible: String,
    number: String,
    book: Option<i64>,
    limit: usize,
) -> Result<Vec<content::VerseHit>, String> {
    content::strongs_verses(&lib_of(&st), &bible, &number, book, limit)
}

#[tauri::command(async)]
fn translit_search(st: State<AppState>, lexicon: String, query: String, limit: usize) -> Result<Vec<content::TranslitHit>, String> {
    content::translit_search(&lib_of(&st), &lexicon, &query, limit)
}

#[tauri::command(async)]
fn find_topics(st: State<AppState>, word: String) -> Vec<content::TopicHit> {
    content::find_topics(&lib_of(&st), &word, 8)
}

/// Every passage a commentary comments on, in order (F. B. Meyer's plan).
#[tauri::command(async)]
fn commentary_ranges(st: State<AppState>, module: String) -> Result<Vec<content::VerseRange>, String> {
    content::commentary_ranges(&lib_of(&st), &module)
}

/// A devotional's days, in calendar order ("January 1").
#[tauri::command(async)]
fn devotion_titles(st: State<AppState>, module: String) -> Result<Vec<String>, String> {
    content::devotion_titles(&lib_of(&st), &module)
}

/// A devotional's reading for a day ("September 24").
#[tauri::command(async)]
fn devotion(st: State<AppState>, module: String, title: String) -> Result<Option<String>, String> {
    content::devotion(&lib_of(&st), &module, &title)
}

/// A dictionary's entries starting with `prefix`, in order ("" for all of them).
#[tauri::command(async)]
fn list_topics(st: State<AppState>, kind: Kind, module: String, prefix: String, limit: usize) -> Result<Vec<String>, String> {
    content::topics(&lib_of(&st), kind, &module, &prefix, limit)
}

/// A module's About: e-Sword's description of it, HTML.
#[tauri::command(async)]
fn module_info(st: State<AppState>, kind: Kind, id: String) -> Result<String, String> {
    Ok(lib_of(&st).module(kind, &id)?.info.clone())
}

/// A reference book's chapters, in order.
#[tauri::command(async)]
fn reference_titles(st: State<AppState>, module: String) -> Result<Vec<String>, String> {
    content::reference_titles(&lib_of(&st), &module)
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

/// A small file from the downloads, such as a module's cover, as bytes.
#[tauri::command(async)]
fn fetch_bytes(url: String) -> Result<tauri::ipc::Response, String> {
    let mut buf = Vec::new();
    Read::read_to_end(&mut agent().get(&url).call().map_err(|e| e.to_string())?.into_reader().take(2_000_000), &mut buf)
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(buf))
}

// ---------- the journal (src/journal.ts): its entries as JSON in the app's data folder ----------

fn journal_path() -> std::path::PathBuf {
    store::data_dir().join("journal.json")
}

/// The journal's entries as JSON text, "[]" before there are any.
#[tauri::command(async)]
fn journal_read() -> Result<String, String> {
    match std::fs::read_to_string(journal_path()) {
        Ok(t) => Ok(t),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("[]".into()),
        Err(e) => Err(e.to_string()),
    }
}

/// Replaces the journal with `text`, written beside it first (under a name of its own, flushed to disk)
/// and then renamed over it, so a crash can't leave half a file; one write at a time.
#[tauri::command(async)]
fn journal_write(text: String) -> Result<(), String> {
    static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let _held = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
    let path = journal_path();
    if let Some(d) = path.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let tmp = path.with_extension(format!("json.{}-{n}.tmp", std::process::id()));
    let written = std::fs::File::create(&tmp).and_then(|mut f| {
        f.write_all(text.as_bytes())?;
        f.sync_all()
    });
    match written.and_then(|_| std::fs::rename(&tmp, &path)) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e.to_string())
        }
    }
}

/// A journal file that can't be read is moved aside (journal.json.bad-<time>), kept for recovery, so
/// the journal can start again without writing over it. Answers its new name.
#[tauri::command(async)]
fn journal_set_aside() -> Result<String, String> {
    let path = journal_path();
    let to = path.with_extension(format!("json.bad-{}", chrono::Local::now().format("%Y%m%d-%H%M%S")));
    std::fs::rename(&path, &to).map_err(|e| e.to_string())?;
    Ok(to.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
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
    // Read before the lock is taken, so the commands reading the library (some on the main thread) wait
    // only for the swap, not the scan.
    let lib = scan();
    *st.lib.write().unwrap() = Arc::new(lib);
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
    // Read before the lock is taken, so the commands reading the library (some on the main thread) wait
    // only for the swap, not the scan.
    let lib = scan();
    *st.lib.write().unwrap() = Arc::new(lib);
    Ok(())
}

// ---------- modules brought in from elsewhere (AirDrop, Files, Finder, Android's "open with") ----------

const MODULE_EXTS: [&str; 6] = ["bbli", "cmti", "dcti", "lexi", "refi", "devi"];

/// Where modules wait to be taken into the library: on iOS, the Inbox AirDrop and "Open in" copy to and
/// Documents, which Finder shows (UIFileSharingEnabled); on Android, the Inbox the plugin copies an opened
/// file to (`inbox`, from the plugin's inbox_dir).
fn waiting_dirs(inbox: Option<String>) -> Vec<(std::path::PathBuf, bool)> {
    let mut dirs: Vec<_> = inbox.map(|d| (std::path::PathBuf::from(d), true)).into_iter().collect();
    if let Some(docs) = store::DOCS_DIR.get() {
        dirs.push((docs.join("Inbox"), true));
        dirs.push((docs.clone(), false));
        // tmp/<bundle id>-Inbox, where iOS copies a module opened in the app and the Files picker copies what's
        // chosen; and tmp/tes-picked-Inbox, where the plugin moves what was picked.
        if let Ok(rd) = std::fs::read_dir(std::env::temp_dir()) {
            dirs.extend(
                rd.flatten().map(|e| e.path()).filter(|p| p.is_dir() && p.to_string_lossy().ends_with("-Inbox")).map(|p| (p, true)),
            );
        }
    }
    dirs
}

/// How many modules are waiting to be taken in (by their names alone): quick, so the app can say
/// "Adding…" before import_waiting does the work.
#[tauri::command(async)]
fn count_waiting(inbox: Option<String>) -> usize {
    waiting_dirs(inbox)
        .iter()
        .filter_map(|(d, _)| std::fs::read_dir(d).ok())
        .flat_map(|rd| rd.flatten())
        .filter(|e| {
            let p = e.path();
            p.is_file() && MODULE_EXTS.contains(&p.extension().and_then(|x| x.to_str()).unwrap_or_default().to_ascii_lowercase().as_str())
        })
        .count()
}

#[derive(Serialize)]
struct Brought {
    /// The modules taken in, by title.
    added: Vec<String>,
    /// Files that looked like modules but couldn't be read as one, by name.
    failed: Vec<String>,
    /// Files whose names have nothing the app can use as a module's file name.
    #[serde(rename = "badName")]
    bad_name: Vec<String>,
}

/// The file name a module brought in is kept under: a copy's number dropped ("kjv-1", "kjv (1)": iOS and
/// browsers name second copies so, but it's still kjv), lower case, and anything but letters, digits and
/// `._+-` made `_` ("King James" → "king_james"), as safe_name allows no more.
fn module_stem(stem: &str, inbox: bool) -> String {
    let mut s = stem.trim().to_string();
    if let Some(base) = s
        .strip_suffix(')')
        .and_then(|t| t.rsplit_once(" ("))
        .filter(|(_, n)| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
        .map(|(b, _)| b)
    {
        s = base.trim_end().to_string();
    }
    if inbox {
        if let Some((base, n)) = s.rsplit_once('-') {
            if !base.is_empty() && !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()) {
                s = base.to_string();
            }
        }
    }
    let s: String = s.chars().map(|c| if c.is_ascii_alphanumeric() || "._+-".contains(c) { c.to_ascii_lowercase() } else { '_' }).collect();
    s.trim_start_matches('.').to_string()
}

#[cfg(test)]
mod module_stem_tests {
    use super::module_stem;

    #[test]
    fn names_brought_in() {
        assert_eq!(module_stem("kjv (1)", false), "kjv");
        assert_eq!(module_stem("kjv-1", true), "kjv");
        assert_eq!(module_stem("kjv-1", false), "kjv-1");
        assert_eq!(module_stem("King James", true), "king_james");
        assert_eq!(module_stem("Matthew Henry (2)", true), "matthew_henry");
        assert_eq!(module_stem("..", true), "");
    }
}

/// Takes any modules waiting (waiting_dirs) into the app's Modules folder, replacing one of the same name,
/// and reads the library again if any came.
#[tauri::command(async)]
fn import_waiting(st: State<AppState>, inbox: Option<String>) -> Brought {
    let mut out = Brought { added: vec![], failed: vec![], bad_name: vec![] };
    let dest = library::app_dir();
    let _ = std::fs::create_dir_all(&dest);
    for (dir, inbox) in waiting_dirs(inbox) {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in entries.flatten() {
            let path = e.path();
            if !path.is_file() {
                continue;
            }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
            let ext = path.extension().and_then(|x| x.to_str()).unwrap_or_default().to_ascii_lowercase();
            if !MODULE_EXTS.contains(&ext.as_str()) {
                // Anything else left in an Inbox is of no use; what's in Documents is the user's own.
                if inbox {
                    let _ = std::fs::remove_file(&path);
                }
                continue;
            }
            let stem = module_stem(path.file_stem().and_then(|x| x.to_str()).unwrap_or_default(), inbox);
            let file = format!("{stem}.{ext}");
            if safe_name(&file).is_err() {
                // Nothing usable left of its name (all dots, say): said apart from a file that isn't a module.
                out.bad_name.push(name);
                if inbox {
                    let _ = std::fs::remove_file(&path);
                }
                continue;
            }
            let title = (|| -> Option<String> {
                let c = rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
                let t: Option<String> = c.query_row("SELECT Title FROM Details LIMIT 1", [], |r| r.get(0)).ok()?;
                Some(t.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| stem.clone()))
            })();
            let Some(title) = title else {
                // Changed in the last few seconds: it may still be arriving (iOS copying a file opened in the
                // app). Left for the next look, not thrown away.
                let fresh =
                    path.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|d| d.as_secs() < 10);
                if fresh {
                    continue;
                }
                out.failed.push(name);
                if inbox {
                    let _ = std::fs::remove_file(&path);
                }
                continue;
            };
            let to = dest.join(&file);
            let moved = std::fs::rename(&path, &to).is_ok() || (std::fs::copy(&path, &to).is_ok() && std::fs::remove_file(&path).is_ok());
            if moved {
                out.added.push(title);
            } else {
                out.failed.push(name);
            }
        }
    }
    if !out.added.is_empty() {
        // Read before the lock is taken, so the commands reading the library (some on the main thread) wait
        // only for the swap, not the scan.
        let lib = scan();
        *st.lib.write().unwrap() = Arc::new(lib);
    }
    out
}

// ---------- the daily reminder ----------

#[derive(serde::Deserialize)]
struct Remind {
    id: i32,
    /// When, in milliseconds since the epoch.
    at: i64,
    title: String,
    body: String,
    /// The phone's offset from UTC at that time, in minutes east.
    #[serde(default)]
    tz: i32,
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
        #[cfg(target_os = "android")]
        let msg = "Notifications are off for Two-edged Sword. Turn them on in the phone's Settings, under Apps.";
        #[cfg(not(target_os = "android"))]
        let msg = "Notifications are off for Two-edged Sword. Turn them on in the iPhone's Settings.";
        return Err(msg.into());
    }
    for r in list.into_iter().filter(|r| REMINDER_IDS.contains(&r.id)) {
        // The plugin's iOS side reads the time's digits as the phone's local time (its date format has
        // a literal 'Z' and no time zone), so iOS is sent the local clock time; Android reads it as UTC.
        #[cfg(target_os = "ios")]
        let at = r.at + r.tz as i64 * 60_000;
        #[cfg(not(target_os = "ios"))]
        let at = r.at;
        let date = time::OffsetDateTime::from_unix_timestamp_nanos(at as i128 * 1_000_000).map_err(|e| e.to_string())?;
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
    search::run(&lib_of(&st), None, &q)
}

/// Android: the bundled modules, copied out of the APK by the plugin into `dir`/modules; the library is
/// read again with them.
#[tauri::command(async)]
fn set_bundled(st: State<AppState>, dir: String) {
    *store::RESOURCE_DIR.write().unwrap() = Some(std::path::PathBuf::from(dir));
    // Read before the lock is taken, so the commands reading the library (some on the main thread) wait
    // only for the swap, not the scan.
    let lib = scan();
    *st.lib.write().unwrap() = Arc::new(lib);
}

/// Debug builds: the UI's errors and console.error, in the app's own log (`xcrun simctl launch --console`).
#[tauri::command]
fn log(msg: String) {
    if cfg!(debug_assertions) {
        eprintln!("[ui] {msg}");
        // Also to a file in the app's data, readable from the Simulator's container.
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(store::data_dir().join("debug.log")) {
            let _ = writeln!(f, "{msg}");
        }
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
            #[cfg(target_os = "ios")]
            if let Ok(d) = paths.document_dir() {
                let _ = store::DOCS_DIR.set(d);
            }
            app.manage(AppState { lib: RwLock::new(Arc::new(scan())), cancelled: Mutex::new(HashSet::new()) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            log,
            scene,
            set_bundled,
            modules,
            chapter,
            chapter_sizes,
            commentary,
            coverage,
            article,
            strongs_for_word,
            search,
            strongs_by_book,
            strongs_verses,
            translit_search,
            find_topics,
            fetch_manifest,
            fetch_bytes,
            module_info,
            list_topics,
            reference_titles,
            devotion_titles,
            devotion,
            commentary_ranges,
            schedule_reminders,
            download,
            cancel_download,
            remove_module,
            count_waiting,
            import_waiting,
            sync::sync_pair,
            sync::sync_call,
            journal_read,
            journal_write,
            journal_set_aside
        ])
        .build(tauri::generate_context!())
        .expect("error while running the app")
        .run(|app, ev| {
            // A module AirDropped or opened from Files while the app runs: the page takes it in.
            #[cfg(any(target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { .. } = ev {
                let _ = app.emit("tes-inbox", ());
            }
            let _ = (app, ev);
        });
}
