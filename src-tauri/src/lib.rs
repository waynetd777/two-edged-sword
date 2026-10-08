// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

mod assistant;
mod books;
mod content;
mod help;
mod index;
mod journal;
mod library;
#[cfg(target_os = "macos")]
mod login_item;
#[cfg(target_os = "macos")]
mod login_launch;
mod media;
mod music;
mod platform;
mod search;
mod spell;
mod store;
mod study;
mod tray;
mod tts;
mod website;

use library::{Kind, Library, ModuleInfo};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Everything except VISIBLE: the window is created hidden and shown once its background is
/// painted, so restoring visibility would undo that.
const STATE_FLAGS: StateFlags = StateFlags::all().difference(StateFlags::VISIBLE);

struct AppState {
    /// Replaced wholesale by `rescan_library` when modules are added.
    lib_cell: std::sync::RwLock<Arc<Library>>,
    data: PathBuf,
    running: Arc<assistant::Running>,
    index: Arc<index::Index>,
}

impl AppState {
    fn lib(&self) -> Arc<Library> {
        self.lib_cell.read().map(|l| l.clone()).unwrap_or_else(|e| e.into_inner().clone())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryInfo {
    /// The folders read, in order.
    dirs: Vec<LibraryDir>,
    modules: Vec<ModuleInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryDir {
    source: library::Source,
    path: String,
    found: bool,
}

impl LibraryInfo {
    fn of(lib: &Library) -> LibraryInfo {
        let dirs = lib
            .dirs
            .iter()
            .map(|(source, p)| LibraryDir { source: *source, path: p.to_string_lossy().to_string(), found: p.is_dir() })
            .collect();
        LibraryInfo { dirs, modules: lib.modules.clone() }
    }
}

/// Settings › readEsword (the frontend's settings document), on unless turned off.
fn read_esword(data: &std::path::Path) -> bool {
    store::read(data, "settings").ok().and_then(|v| v.get("readEsword").and_then(|b| b.as_bool())).unwrap_or(true)
}

#[tauri::command]
fn library_info(st: State<AppState>) -> LibraryInfo {
    LibraryInfo::of(&st.lib())
}

/// Looks for modules again (after new ones are added), reading e-Sword's folder or not as
/// `esword` says, or as the saved setting says without it.
#[tauri::command]
async fn rescan_library(st: State<'_, AppState>, esword: Option<bool>) -> Result<LibraryInfo, String> {
    let dirs = library::dirs(esword.unwrap_or_else(|| read_esword(&st.data)));
    let fresh = Arc::new(tauri::async_runtime::spawn_blocking(move || Library::scan(dirs)).await.map_err(|e| e.to_string())?);
    *st.lib_cell.write().map_err(|e| e.to_string())? = fresh.clone();
    let (lib, index, ask_root) = (fresh.clone(), st.index.clone(), study::root(&st.data));
    std::thread::spawn(move || {
        let _ = index.update(&lib);
        study::export_dictionaries(&lib, &ask_root);
    });
    Ok(LibraryInfo::of(&fresh))
}

#[tauri::command]
fn get_chapter(st: State<AppState>, bible: String, book: i64, chapter: i64) -> Result<Vec<content::Verse>, String> {
    content::chapter(&st.lib(), &bible, book, chapter)
}

#[tauri::command]
fn get_passages(st: State<AppState>, bible: String, ranges: Vec<content::Range>) -> Result<Vec<content::Passage>, String> {
    content::passages(&st.lib(), &bible, &ranges)
}

#[tauri::command(async)]
fn chapter_sizes(st: State<AppState>, bible: String) -> Result<Vec<(i64, i64, i64)>, String> {
    content::chapter_sizes(&st.lib(), &bible)
}

#[tauri::command]
fn commentary_ranges(st: State<AppState>, module: String) -> Result<Vec<content::VerseRange>, String> {
    content::commentary_ranges(&st.lib(), &module)
}

#[tauri::command]
fn get_commentary(st: State<AppState>, module: String, book: i64, chapter: i64, verse: i64) -> Result<content::Commentary, String> {
    content::commentary(&st.lib(), &module, book, chapter, verse)
}

#[tauri::command(async)]
fn get_coverage(st: State<AppState>, book: i64, chapter: i64, verse: i64) -> Vec<content::Coverage> {
    content::coverage(&st.lib(), book, chapter, verse)
}

#[tauri::command]
fn get_article(st: State<AppState>, kind: Kind, module: String, topic: String) -> Result<Option<content::Article>, String> {
    content::article(&st.lib(), kind, &module, &topic)
}

#[tauri::command(async)]
fn find_topics(st: State<AppState>, word: String) -> Vec<content::TopicHit> {
    content::find_topics(&st.lib(), &word, 8)
}

#[tauri::command]
fn list_topics(st: State<AppState>, kind: Kind, module: String, prefix: String, limit: usize) -> Result<Vec<String>, String> {
    content::topics(&st.lib(), kind, &module, &prefix, limit)
}

#[tauri::command]
fn reference_titles(st: State<AppState>, module: String) -> Result<Vec<String>, String> {
    content::reference_titles(&st.lib(), &module)
}

#[tauri::command(async)]
fn strongs_by_book(st: State<AppState>, bible: String, number: String) -> Result<Vec<(i64, i64)>, String> {
    content::strongs_by_book(&st.lib(), &bible, &number)
}

#[tauri::command(async)]
fn strongs_for_word(st: State<AppState>, bible: String, word: String) -> Result<Vec<content::WordNumber>, String> {
    content::strongs_for_word(&st.lib(), &bible, &word)
}

#[tauri::command(async)]
fn translit_search(st: State<AppState>, lexicon: String, query: String, limit: usize) -> Result<Vec<content::TranslitHit>, String> {
    content::translit_search(&st.lib(), &lexicon, &query, limit)
}

#[tauri::command(async)]
fn strongs_verses(
    st: State<AppState>,
    bible: String,
    number: String,
    book: Option<i64>,
    limit: usize,
) -> Result<Vec<content::VerseHit>, String> {
    content::strongs_verses(&st.lib(), &bible, &number, book, limit)
}

#[tauri::command]
async fn search(st: State<'_, AppState>, query: search::Query) -> Result<search::Results, String> {
    let lib = st.lib().clone();
    let ix = st.index.clone();
    tauri::async_runtime::spawn_blocking(move || search::run(&lib, Some(&ix), &query)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn index_progress(st: State<AppState>) -> index::Progress {
    st.index.progress()
}

#[tauri::command]
fn store_read(st: State<AppState>, name: String) -> Result<serde_json::Value, String> {
    store::read(&st.data, &name)
}

#[tauri::command]
fn variances_read(st: State<AppState>, name: String) -> Result<serde_json::Value, String> {
    store::variances(&st.data, &name)
}

#[tauri::command]
fn store_write(st: State<AppState>, name: String, value: serde_json::Value) -> Result<(), String> {
    store::write(&st.data, &name, &value)
}

/// The app's version and build number (the Makefile's, the same as CFBundleVersion and the Help
/// Book's; "dev" outside a release build), for Settings.
#[tauri::command]
fn app_version(app: AppHandle) -> (String, String) {
    (app.package_info().version.to_string(), option_env!("TES_BUILD").unwrap_or("dev").to_string())
}

/// The journal's folder unless Settings names another.
#[tauri::command]
fn journal_default_dir() -> String {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    home.join("Documents/Two-edged Sword").to_string_lossy().to_string()
}

/// A folder the user chose: an absolute path with no `..` in it.
fn chosen_dir(dir: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(dir);
    if !p.is_absolute() || p.components().any(|c| c == std::path::Component::ParentDir) {
        return Err(format!("not a usable folder: {dir}"));
    }
    Ok(p)
}

// The journal and file commands run off the main thread: the folder may be on a cloud drive
// such as OneDrive, where reading a file that is only in the cloud first downloads it.
#[tauri::command(async)]
fn journal_list(dir: String) -> Result<Vec<journal::Entry>, String> {
    journal::list(&chosen_dir(&dir)?)
}

#[tauri::command(async)]
fn journal_save(dir: String, entry: journal::Entry) -> Result<(), String> {
    journal::save(&chosen_dir(&dir)?, &entry)
}

// Music: each runs osascript, which can take a moment (and, the first time, waits on the
// permission prompt), so off the main thread.
#[tauri::command(async)]
fn music_tracks() -> Result<Vec<music::Track>, String> {
    music::tracks()
}
#[tauri::command(async)]
fn music_play(ids: Vec<String>) -> Result<usize, String> {
    music::play(&ids)
}
#[tauri::command(async)]
fn music_state() -> Result<music::State, String> {
    music::state()
}
#[tauri::command(async)]
fn music_control(cmd: String) -> Result<(), String> {
    music::control(&cmd)
}
/// Sent as raw bytes (an ArrayBuffer in the page), not a JSON array of numbers.
#[tauri::command(async)]
fn music_artwork() -> Result<tauri::ipc::Response, String> {
    music::artwork().map(tauri::ipc::Response::new)
}

/// While reading aloud, in Quiet time or on a reading screen (awake.ts), the display is kept from
/// sleeping (so the screensaver and lock don't come on) by a `caffeinate`, which ends when they do,
/// or with the app (-w) if it quits first.
#[tauri::command]
fn keep_awake(on: bool) -> Result<(), String> {
    use std::sync::Mutex;
    static CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);
    let mut c = CHILD.lock().unwrap_or_else(|e| e.into_inner());
    if on {
        // One at a time; a finished one (killed from outside) is replaced.
        if let Some(ch) = c.as_mut() {
            if ch.try_wait().ok().flatten().is_none() {
                return Ok(());
            }
        }
        let child = std::process::Command::new("/usr/bin/caffeinate")
            .args(["-d", "-i", "-w", &std::process::id().to_string()])
            .spawn()
            .map_err(|e| e.to_string())?;
        *c = Some(child);
    } else if let Some(mut ch) = c.take() {
        let _ = ch.kill();
        let _ = ch.wait();
    }
    Ok(())
}

// Spelling (spell.rs): not async, so they run on the main thread, as AppKit wants.
#[tauri::command]
fn spell_check(st: State<AppState>, text: String) -> Vec<(usize, usize)> {
    kjv_words(&st);
    spell::check(&text)
}
#[tauri::command]
fn spell_grammar(st: State<AppState>, text: String) -> Vec<spell::GrammarIssue> {
    kjv_words(&st);
    spell::grammar(&text)
}
/// The KJV's words, read here if a check comes before the start-up read has finished.
fn kjv_words(st: &AppState) {
    if !spell::kjv_ready() {
        spell::load_kjv(&st.lib());
    }
}
#[tauri::command]
fn spell_guesses(word: String) -> Vec<String> {
    spell::guesses(&word)
}
#[tauri::command]
fn spell_correction(word: String) -> Option<String> {
    spell::correction(&word)
}
#[tauri::command]
fn spell_learn(word: String) {
    spell::learn(&word)
}
#[tauri::command]
fn spell_ignore(word: String) {
    spell::ignore(&word)
}

#[tauri::command(async)]
fn journal_stamp(dir: String) -> Result<String, String> {
    Ok(journal::stamp(&chosen_dir(&dir)?))
}

#[tauri::command(async)]
fn journal_delete(dir: String, id: String) -> Result<(), String> {
    journal::delete(&chosen_dir(&dir)?, &id)
}

#[tauri::command(async)]
/// An export the user saved from a dialog: only a document of a known kind, never a dotfile.
fn write_text_file(path: String, text: String) -> Result<(), String> {
    let p = chosen_dir(&path)?;
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if name.starts_with('.') || !["md", "txt", "html", "json"].contains(&ext.as_str()) {
        return Err(format!("won't write {name}: only .md, .txt, .html or .json files"));
    }
    store::write_text_atomic(&p, &text)
}

#[tauri::command]
async fn assistant_status() -> Result<assistant::CliStatus, String> {
    tauri::async_runtime::spawn_blocking(assistant::status).await.map_err(|e| e.to_string())
}

/// Async so finding the CLI (which can ask a login shell) doesn't hold up the window.
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
fn ask(
    app: AppHandle,
    st: State<AppState>,
    chat_id: String,
    prompt: String,
    model: String,
    session: Option<String>,
    book_dir: Option<String>,
    study_dir: Option<String>,
) -> Result<(), String> {
    // A folder chat runs in that folder with read-only search tools; only the app's own folders count.
    let root = study::root(&st.data);
    // Canonical first, so `..` can't lead out of them.
    let inside = |d: Option<String>, top: PathBuf| {
        let (d, top) = (std::fs::canonicalize(d?).ok()?, std::fs::canonicalize(top).ok()?);
        d.starts_with(&top).then_some(d)
    };
    let folder = match (
        inside(book_dir, books::root(&st.data)),
        inside(study_dir.clone(), study::studies_root(&root)),
        inside(study_dir, study::journal_root(&root)),
    ) {
        (Some(b), _, _) => assistant::Folder::Book(b),
        (None, Some(dir), _) => assistant::Folder::Study(dir),
        (None, None, Some(dir)) => assistant::Folder::Journal(dir),
        _ => assistant::Folder::None,
    };
    // A chat in use keeps its folder: study::prune goes by when it was last touched.
    if let assistant::Folder::Study(d) | assistant::Folder::Journal(d) = &folder {
        let _ = std::fs::File::open(d).and_then(|f| f.set_modified(std::time::SystemTime::now()));
    }
    assistant::ask(app, st.running.clone(), &st.data, folder, chat_id, prompt, model, session)
}

/// Writes out the library's material on a passage for a chat; returns the folder.
#[tauri::command]
async fn study_export(st: State<'_, AppState>, chat_id: String, req: study::Request) -> Result<String, String> {
    let (lib, root) = (st.lib(), study::root(&st.data));
    tauri::async_runtime::spawn_blocking(move || study::export(&lib, &root, &chat_id, &req).map(|d| d.to_string_lossy().to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Writes out journal entries for a chat about them; returns the folder (passed to `ask` as its study_dir).
#[tauri::command]
async fn journal_export(
    st: State<'_, AppState>,
    chat_id: String,
    label: String,
    entries: Vec<study::JournalNote>,
) -> Result<String, String> {
    let root = study::root(&st.data);
    tauri::async_runtime::spawn_blocking(move || {
        study::export_journal(&root, &chat_id, &label, &entries).map(|d| d.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn doc_export(st: State<'_, AppState>, module: String, kind: Option<library::Kind>) -> Result<books::Export, String> {
    let (lib, root) = (st.lib(), books::root(&st.data));
    let kind = kind.unwrap_or(library::Kind::Reference);
    tauri::async_runtime::spawn_blocking(move || books::export(&lib, &root, &module, kind)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn devotion_titles(st: State<AppState>, module: String) -> Result<Vec<String>, String> {
    content::devotion_titles(&st.lib(), &module)
}

#[tauri::command]
fn devotion(st: State<AppState>, module: String, title: String) -> Result<Option<String>, String> {
    content::devotion(&st.lib(), &module, &title)
}

/// An online page (a devotional) in its own window inside the app, reused if already open.
/// The app in dark mode: a devotional's web page shown dark by inverting it, with pictures and
/// video inverted back so they look as they should. Crude, but it works on any site.
const DARK_PAGE: &str = r##"(() => {
  const css = "html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }"
    + " img, video, picture, canvas, svg image, [style*='background-image'] { filter: invert(1) hue-rotate(180deg) !important; }";
  const add = () => {
    const at = document.head || document.documentElement;
    if (!document.getElementById("tes-dark")) {
      const s = document.createElement("style");
      s.id = "tes-dark";
      s.textContent = css;
      at.appendChild(s);
    }
    // macOS colours the title bar from the page's theme colour, or failing that from the top of the
    // page as it was before the inversion (white, often): a dark one of our own instead.
    document.querySelectorAll("meta[name='theme-color']:not(#tes-theme)").forEach((m) => m.remove());
    if (!document.getElementById("tes-theme")) {
      const m = document.createElement("meta");
      m.id = "tes-theme";
      m.name = "theme-color";
      m.content = "#121214";
      at.appendChild(m);
    }
  };
  add();
  document.addEventListener("DOMContentLoaded", add);
})();"##;

/// Whether a web page lets itself be shown inside another page (an online devotional added by the
/// user, framed in the reading column), from its headers: X-Frame-Options, or a
/// Content-Security-Policy with frame-ancestors, says no. Fetched with the system's curl.
#[tauri::command(async)]
fn web_frameable(url: String) -> Result<bool, String> {
    if !url.starts_with("https://") {
        return Err("only https pages can be opened".into());
    }
    let out = std::process::Command::new("/usr/bin/curl")
        .args([
            "-sL",
            "--max-time",
            "15",
            "-o",
            "/dev/null",
            "-D",
            "-",
            "-A",
            "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15",
            &url,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("couldn't reach that address".into());
    }
    let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
    // After redirects, the last response's headers.
    let last = text.rsplit("http/").next().unwrap_or("");
    Ok(!last.lines().any(|l| {
        l.starts_with("x-frame-options:")
            || (l.starts_with("content-security-policy:") && l.contains("frame-ancestors") && !l.contains("frame-ancestors *"))
    }))
}

#[tauri::command]
/// `dark` inverts the page to look dark; `dark_app` is the app's dark theme, where the window is
/// black while the page loads, and has a dark title bar, even for a page left as it is.
fn open_web(app: AppHandle, key: String, url: String, title: String, dark: bool, dark_app: bool) -> Result<(), String> {
    let black = dark || dark_app;
    // A window's scripts are fixed when it is made, so dark and light pages are separate windows;
    // the other one, if open, is closed.
    let base = format!("web-{}", key.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>());
    let label = format!("{base}-{}", if dark { "dark" } else { "light" });
    if let Some(other) = app.get_webview_window(&format!("{base}-{}", if dark { "light" } else { "dark" })) {
        let _ = other.close();
    }
    let parsed: tauri::Url = url.parse().map_err(|e| format!("bad address: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("only https pages can be opened".into());
    }
    // Same size and place as the main window, so it reads like a page of the app.
    let main = app.get_webview_window("main");
    let frame = main.as_ref().and_then(|m| {
        let scale = m.scale_factor().ok()?;
        let size = m.inner_size().ok()?.to_logical::<f64>(scale);
        let pos = m.outer_position().ok()?.to_logical::<f64>(scale);
        Some((size, pos))
    });
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.navigate(parsed);
        let _ = w.set_title(&title);
        let _ = w.set_theme(Some(if black { tauri::Theme::Dark } else { tauri::Theme::Light }));
        let _ =
            w.set_background_color(Some(if black { tauri::window::Color(0, 0, 0, 255) } else { tauri::window::Color(255, 255, 255, 255) }));
        title_bar(&w, black);
        if let Some((size, pos)) = frame {
            let _ = w.set_size(size);
            let _ = w.set_position(pos);
        }
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let mut b = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(parsed)).title(&title);
    if dark {
        b = b.initialization_script(DARK_PAGE);
    }
    // The title bar too: left alone, macOS draws it light or dark as it pleases.
    b = if black {
        b.background_color(tauri::window::Color(0, 0, 0, 255)).theme(Some(tauri::Theme::Dark))
    } else {
        b.theme(Some(tauri::Theme::Light))
    };
    b = match frame {
        Some((size, pos)) => b.inner_size(size.width, size.height).position(pos.x, pos.y),
        None => b.inner_size(1000.0, 820.0),
    };
    let w = b.build().map_err(|e| e.to_string())?;
    title_bar(&w, black);
    Ok(())
}

/// A web window's title bar in the app's theme. Asking for a dark window isn't enough: macOS still
/// drew some sites' title bars white. A transparent title bar over the window's own dark
/// background always comes out dark, with dark appearance for light title text.
fn title_bar(w: &tauri::WebviewWindow, dark: bool) {
    #[cfg(target_os = "macos")]
    unsafe {
        use objc2_app_kit::{NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua, NSColor, NSWindow};
        let Ok(ptr) = w.ns_window() else { return };
        let win = &*(ptr as *const NSWindow);
        win.setAppearance(NSAppearance::appearanceNamed(if dark { NSAppearanceNameDarkAqua } else { NSAppearanceNameAqua }).as_deref());
        win.setTitlebarAppearsTransparent(dark);
        if dark {
            win.setBackgroundColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(18.0 / 255.0, 18.0 / 255.0, 20.0 / 255.0, 1.0)));
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (w, dark);
}

#[tauri::command]
fn ask_cancel(st: State<AppState>, chat_id: String) {
    assistant::cancel(&st.running, &chat_id)
}

/// Screenshot mode (tools/screenshots.py): the scene to set up, as JSON, from TES_SCENE. The
/// page then saves nothing, so the user's settings, chats and place are left as they were.
#[tauri::command]
fn scene() -> Option<String> {
    std::env::var("TES_SCENE").ok().filter(|s| !s.is_empty())
}

#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

/// In the Dock while the window is open, only in the menu bar while it is closed. Runs on the main
/// thread, as every caller does: the tray's menu handler, the window's events and Reopen.
#[cfg(target_os = "macos")]
fn set_in_dock(app: &AppHandle, shown: bool) {
    let _ = app.set_activation_policy(if shown { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory });
}

#[cfg(not(target_os = "macos"))]
fn set_in_dock(_app: &AppHandle, _shown: bool) {}

/// Makes a window invisible and click-through while it still draws, for screenshots
/// (tools/screenshots.py saves its webview's snapshot): nothing flashes on screen. macOS only.
fn make_unseen(w: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    if let Ok(ns) = w.ns_window() {
        // Tauri's own NSWindow, alive as long as the window is; setup runs on the main thread.
        let window = unsafe { &*(ns as *const objc2_app_kit::NSWindow) };
        window.setAlphaValue(0.0);
        window.setIgnoresMouseEvents(true);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = w;
}

/// Saves what the window's webview shows to `dest` as a TIFF, for screenshots taken unseen
/// (make_unseen: an invisible window's own capture is blank, its webview's snapshot isn't). The file
/// appears when WebKit has drawn it. macOS only.
fn snapshot(w: &tauri::WebviewWindow, dest: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let dest = dest.to_path_buf();
        w.with_webview(move |wv| unsafe {
            use objc2::runtime::AnyObject;
            let webview = wv.inner() as *mut AnyObject;
            let done = block2::RcBlock::new(move |image: *mut AnyObject, _error: *mut AnyObject| {
                if image.is_null() {
                    return;
                }
                let tiff: *mut AnyObject = objc2::msg_send![image, TIFFRepresentation];
                if !tiff.is_null() {
                    let path = objc2_foundation::NSString::from_str(&dest.to_string_lossy());
                    let _: bool = objc2::msg_send![tiff, writeToFile: &*path, atomically: true];
                }
            });
            let config: *mut AnyObject = std::ptr::null_mut();
            let _: () = objc2::msg_send![webview, takeSnapshotWithConfiguration: config, completionHandler: &*done];
        })
        .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (w, dest);
        Err("Snapshots are macOS only.".into())
    }
}

/// Brings the app to the front: after coming back from Accessory, `set_focus()` alone can leave
/// the window behind whatever the user was working in.
#[cfg(target_os = "macos")]
fn activate() {
    use objc2::runtime::{AnyClass, AnyObject};
    let Some(cls) = AnyClass::get(c"NSApplication") else { return };
    unsafe {
        let nsapp: *mut AnyObject = objc2::msg_send![cls, sharedApplication];
        if !nsapp.is_null() {
            let _: () = objc2::msg_send![nsapp, activateIgnoringOtherApps: true];
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn activate() {}

/// Quits from the menu bar, keeping the main window's size and place.
fn quit(app: &AppHandle) {
    let _ = app.save_window_state(STATE_FLAGS);
    app.exit(0)
}

pub(crate) fn show_main(app: &AppHandle) {
    // Back in the Dock before the window is shown: done afterwards, the window can come up
    // behind whatever had focus.
    set_in_dock(app, true);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        activate();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data = store::data_dir();
    // Made up front, so Show in Finder has somewhere to go before anything is built into it.
    let _ = std::fs::create_dir_all(library::app_dir());
    let lib = Arc::new(Library::scan(library::dirs(read_esword(&data))));
    let index = Arc::new(index::Index::new(data.join("search-index.sqlite")));
    // The KJV's words, so the journal's spell checker takes its spellings as right.
    {
        let lib = lib.clone();
        std::thread::spawn(move || spell::load_kjv(&lib));
    }
    {
        let (lib, index, ask_root) = (lib.clone(), index.clone(), study::root(&data));
        std::thread::spawn(move || {
            if let Err(e) = index.update(&lib) {
                eprintln!("search index: {e}");
            }
            // Then the dictionaries Ask searches, written out once (slow only the first time).
            study::prune(&ask_root);
            study::export_dictionaries(&lib, &ask_root);
        });
    }
    let state = AppState { lib_cell: std::sync::RwLock::new(lib), data, running: Arc::new(assistant::Running::default()), index };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(STATE_FLAGS)
                .with_filter(|label| !label.starts_with("web-") && label != "tray")
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .manage(tray::Tray::default())
        .invoke_handler(tauri::generate_handler![
            library_info,
            rescan_library,
            get_chapter,
            get_passages,
            get_commentary,
            chapter_sizes,
            commentary_ranges,
            get_coverage,
            get_article,
            find_topics,
            list_topics,
            reference_titles,
            strongs_for_word,
            translit_search,
            doc_export,
            study_export,
            devotion_titles,
            devotion,
            open_web,
            web_frameable,
            strongs_by_book,
            strongs_verses,
            search,
            index_progress,
            store_read,
            variances_read,
            store_write,
            journal_default_dir,
            app_version,
            journal_list,
            journal_save,
            journal_delete,
            journal_stamp,
            journal_export,
            spell_check,
            spell_grammar,
            spell_guesses,
            spell_correction,
            spell_learn,
            spell_ignore,
            keep_awake,
            music_tracks,
            music_play,
            music_state,
            music_control,
            music_artwork,
            write_text_file,
            assistant_status,
            ask,
            ask_cancel,
            print_page,
            scene,
            media::media_state,
            tts::tts_voices,
            tts::tts_speak,
            tts::tts_stop,
            tts::tts_pause,
            tray::set_tray,
            tray::tray_info,
            tray::tray_do
        ])
        .on_menu_event(|app, ev| {
            if ev.id() == help::MENU_ID {
                help::show(app);
            } else if ev.id() == website::MENU_ID {
                website::open(app);
            } else if ev.id() == website::ABOUT_ID {
                website::about(app);
            }
        })
        .setup(|app| {
            // Did Login Items start this, rather than someone opening the app? Asked first: the
            // answer is in the launch AppleEvent AppKit is dispatching now, and it has to be known
            // before anything shows the window. A login launch stays in the menu bar.
            // A scene with "tray": true shows the menu-bar window alone, for its screenshot; the
            // main window runs hidden to send it what to show.
            let tray_scene = scene().and_then(|sc| serde_json::from_str::<serde_json::Value>(&sc).ok()).is_some_and(|v| v["tray"] == true);
            #[cfg(target_os = "macos")]
            let quiet = (login_launch::probe() && scene().is_none()) || tray_scene;
            #[cfg(not(target_os = "macos"))]
            let quiet = tray_scene;
            if quiet {
                set_in_dock(app.handle(), false);
            }
            help::add_to_menu(app.handle())?;
            website::add_to_menu(app.handle())?;
            // The menu-bar icon and the window it opens; until the main window sends today's
            // reading, that window has its choices without the details.
            tray::build(app.handle())?;
            if tray_scene {
                if let Some(t) = app.get_webview_window("tray") {
                    let _ = t.set_position(tauri::LogicalPosition::new(200.0, 120.0));
                    make_unseen(&t);
                    let _ = t.show();
                }
            }
            tray::start_reminders(app.handle().clone());
            // tools/screenshots.py: the scene's snapshot to TES_SNAPSHOT, once it has settled.
            if let (Some(_), Some(out)) = (scene(), std::env::var_os("TES_SNAPSHOT")) {
                let label = if tray_scene { "tray" } else { "main" };
                let after = std::env::var("TES_SNAPSHOT_AFTER").ok().and_then(|s| s.parse().ok()).unwrap_or(6.0);
                let app = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs_f64(after));
                    if let Some(w) = app.get_webview_window(label) {
                        let _ = snapshot(&w, std::path::Path::new(&out));
                    }
                });
            }

            if let Some(w) = app.get_webview_window("main") {
                // Screenshots are taken at one size, whatever size the window was left at.
                // They're taken unseen and out of the Dock, without taking the focus.
                if scene().is_some() {
                    let _ = w.set_size(tauri::LogicalSize::new(1440.0, 900.0));
                    let _ = w.center();
                    make_unseen(&w);
                    set_in_dock(app.handle(), false);
                }
                // Paint the window and the webview in the theme's background before showing it,
                // so no white frame appears. Keep in step with --bg in src/styles.css and index.html.
                let dark = matches!(w.theme(), Ok(tauri::Theme::Dark));
                let (r, g, b) = if dark { (13u8, 17u8, 23u8) } else { (246u8, 248u8, 250u8) };
                let _ = w.set_background_color(Some(tauri::window::Color(r, g, b, 255)));
                #[cfg(target_os = "macos")]
                {
                    let w_show = w.clone();
                    let _ = w.with_webview(move |wv| {
                        unsafe {
                            use objc2::runtime::AnyObject;
                            let webview: *mut AnyObject = wv.inner() as *mut AnyObject;
                            let color = objc2_app_kit::NSColor::colorWithSRGBRed_green_blue_alpha(
                                r as f64 / 255.0,
                                g as f64 / 255.0,
                                b as f64 / 255.0,
                                1.0,
                            );
                            let _: () = objc2::msg_send![webview, setUnderPageBackgroundColor: &*color];
                            let no = objc2_foundation::NSNumber::new_bool(false);
                            let key = objc2_foundation::NSString::from_str("drawsBackground");
                            let _: () = objc2::msg_send![webview, setValue: &*no, forKey: &*key];
                        }
                        if !quiet {
                            let _ = w_show.show();
                            if scene().is_none() {
                                let _ = w_show.set_focus();
                            }
                        }
                    });
                    if !quiet {
                        let w_fallback = w.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(1200));
                            if matches!(w_fallback.is_visible(), Ok(false)) {
                                let _ = w_fallback.show();
                            }
                        });
                    }
                }
                #[cfg(not(target_os = "macos"))]
                if !quiet {
                    let _ = w.show();
                }
                // Closing the window hides it; the app stays in the menu bar.
                let w2 = w.clone();
                w.on_window_event(move |ev| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
                        api.prevent_close();
                        let _ = w2.app_handle().save_window_state(STATE_FLAGS);
                        let _ = w2.hide();
                        // The page goes back to the default Bible for when the window is reopened.
                        let _ = w2.emit("main-window-closed", ());
                        // Out of the Dock once the window has gone: the app is only in the menu bar now.
                        set_in_dock(w2.app_handle(), false);
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, ev| {
            if let tauri::RunEvent::Exit = ev {
                app.state::<AppState>().running.kill_all();
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = ev {
                show_main(app);
            }
        });
}
