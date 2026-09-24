mod books;
mod claude;
mod content;
mod index;
mod journal;
mod library;
mod search;
mod store;

use library::{Kind, Library, ModuleInfo};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Everything except VISIBLE: the window is created hidden and shown once its background is
/// painted, so restoring visibility would undo that.
const STATE_FLAGS: StateFlags = StateFlags::all().difference(StateFlags::VISIBLE);

struct AppState {
    /// Replaced wholesale by `rescan_library` when modules are added.
    lib_cell: std::sync::RwLock<Arc<Library>>,
    data: PathBuf,
    running: Arc<claude::Running>,
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
    dir: String,
    found: bool,
    modules: Vec<ModuleInfo>,
}

#[tauri::command]
fn library_info(st: State<AppState>) -> LibraryInfo {
    let lib = st.lib();
    LibraryInfo { dir: lib.dir.to_string_lossy().to_string(), found: lib.dir.is_dir(), modules: lib.modules.clone() }
}

/// Looks for modules again (after new ones are downloaded in e-Sword).
#[tauri::command]
async fn rescan_library(st: State<'_, AppState>) -> Result<LibraryInfo, String> {
    let dir = st.lib().dir.clone();
    let fresh = Arc::new(tauri::async_runtime::spawn_blocking(move || Library::scan(dir)).await.map_err(|e| e.to_string())?);
    *st.lib_cell.write().map_err(|e| e.to_string())? = fresh.clone();
    let (lib, index) = (fresh.clone(), st.index.clone());
    std::thread::spawn(move || {
        let _ = index.update(&lib);
    });
    Ok(LibraryInfo { dir: fresh.dir.to_string_lossy().to_string(), found: fresh.dir.is_dir(), modules: fresh.modules.clone() })
}

#[tauri::command]
fn get_chapter(st: State<AppState>, bible: String, book: i64, chapter: i64) -> Result<Vec<content::Verse>, String> {
    content::chapter(&st.lib(), &bible, book, chapter)
}

#[tauri::command]
fn get_passages(st: State<AppState>, bible: String, ranges: Vec<content::Range>) -> Result<Vec<content::Passage>, String> {
    content::passages(&st.lib(), &bible, &ranges)
}

#[tauri::command]
fn chapter_sizes(st: State<AppState>, bible: String) -> Result<Vec<(i64, i64, i64)>, String> {
    content::chapter_sizes(&st.lib(), &bible)
}

#[tauri::command]
fn commentary_ranges(st: State<AppState>, module: String) -> Result<Vec<(i64, i64, i64, i64, i64)>, String> {
    content::commentary_ranges(&st.lib(), &module)
}

#[tauri::command]
fn get_commentary(st: State<AppState>, module: String, book: i64, chapter: i64, verse: i64) -> Result<content::Commentary, String> {
    content::commentary(&st.lib(), &module, book, chapter, verse)
}

#[tauri::command]
fn get_coverage(st: State<AppState>, book: i64, chapter: i64, verse: i64) -> Vec<content::Coverage> {
    content::coverage(&st.lib(), book, chapter, verse)
}

#[tauri::command]
fn get_article(st: State<AppState>, kind: Kind, module: String, topic: String) -> Result<Option<content::Article>, String> {
    content::article(&st.lib(), kind, &module, &topic)
}

#[tauri::command]
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

#[tauri::command]
fn strongs_by_book(st: State<AppState>, bible: String, number: String) -> Result<Vec<(i64, i64)>, String> {
    content::strongs_by_book(&st.lib(), &bible, &number)
}

#[tauri::command]
fn strongs_for_word(st: State<AppState>, bible: String, word: String) -> Result<Vec<content::WordNumber>, String> {
    content::strongs_for_word(&st.lib(), &bible, &word)
}

#[tauri::command]
fn translit_search(st: State<AppState>, lexicon: String, query: String, limit: usize) -> Result<Vec<content::TranslitHit>, String> {
    content::translit_search(&st.lib(), &lexicon, &query, limit)
}

#[tauri::command]
fn strongs_verses(st: State<AppState>, bible: String, number: String, book: Option<i64>, limit: usize) -> Result<Vec<content::VerseHit>, String> {
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
fn store_write(st: State<AppState>, name: String, value: serde_json::Value) -> Result<(), String> {
    store::write(&st.data, &name, &value)
}

/// The journal lives in the Obsidian vault when there is one, so entries show up there too.
#[tauri::command]
fn journal_default_dir() -> String {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let vault = home.join("Library/CloudStorage/OneDrive-Personal/Notes");
    let dir = if vault.is_dir() { vault.join("Two-edged Sword") } else { home.join("Documents/Two-edged Sword") };
    dir.to_string_lossy().to_string()
}

#[tauri::command]
fn journal_list(dir: String) -> Result<Vec<journal::Entry>, String> {
    journal::list(&PathBuf::from(dir))
}

#[tauri::command]
fn journal_save(dir: String, entry: journal::Entry) -> Result<(), String> {
    journal::save(&PathBuf::from(dir), &entry)
}

#[tauri::command]
fn journal_delete(dir: String, id: String) -> Result<(), String> {
    journal::delete(&PathBuf::from(dir), &id)
}

#[tauri::command]
fn write_text_file(path: String, text: String) -> Result<(), String> {
    store::write_text_atomic(&PathBuf::from(path), &text)
}

#[tauri::command]
async fn claude_status() -> claude::Status {
    tauri::async_runtime::spawn_blocking(claude::status).await.unwrap_or(claude::Status { path: None, version: None })
}

#[tauri::command]
fn ask(app: AppHandle, st: State<AppState>, chat_id: String, prompt: String, model: String, session: Option<String>, book_dir: Option<String>) -> Result<(), String> {
    // A book chat runs in the book's exported folder, with read-only tools confined to it.
    let book = book_dir.map(PathBuf::from).filter(|d| d.starts_with(books::root(&st.data)));
    let cwd = book.clone().unwrap_or_else(|| st.data.join("claude"));
    claude::ask(app, st.running.clone(), cwd, chat_id, prompt, model, session, book.is_some())
}

#[tauri::command]
async fn doc_export(st: State<'_, AppState>, module: String) -> Result<books::Export, String> {
    let (lib, root) = (st.lib(), books::root(&st.data));
    tauri::async_runtime::spawn_blocking(move || books::export(&lib, &root, &module)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn ask_cancel(st: State<AppState>, chat_id: String) {
    claude::cancel(&st.running, &chat_id)
}

#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let lib = Arc::new(Library::scan(library::default_dir()));
    let data = store::data_dir();
    let index = Arc::new(index::Index::new(data.join("search-index.sqlite")));
    {
        let (lib, index) = (lib.clone(), index.clone());
        std::thread::spawn(move || {
            if let Err(e) = index.update(&lib) { eprintln!("search index: {e}"); }
        });
    }
    let state = AppState { lib_cell: std::sync::RwLock::new(lib), data, running: Arc::new(claude::Running::default()), index };

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(STATE_FLAGS).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
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
            strongs_by_book,
            strongs_verses,
            search,
            index_progress,
            store_read,
            store_write,
            journal_default_dir,
            journal_list,
            journal_save,
            journal_delete,
            write_text_file,
            claude_status,
            ask,
            ask_cancel,
            print_page
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Two-edged Sword", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray@2x.png")).expect("tray icon is a valid png");
            TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Two-edged Sword")
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => {
                        let _ = app.save_window_state(STATE_FLAGS);
                        app.exit(0)
                    }
                    _ => {}
                })
                .build(app)?;

            if let Some(w) = app.get_webview_window("main") {
                // Paint the window and the webview in the theme's background before showing it,
                // so no white frame appears. Keep in step with --bg in src/styles.css and index.html.
                let dark = matches!(w.theme(), Ok(tauri::Theme::Dark));
                let (r, g, b) = if dark { (30u8, 30u8, 32u8) } else { (244u8, 241u8, 234u8) };
                let _ = w.set_background_color(Some(tauri::window::Color(r, g, b, 255)));
                #[cfg(target_os = "macos")]
                {
                    let w_show = w.clone();
                    let _ = w.with_webview(move |wv| {
                        unsafe {
                            use objc2::runtime::AnyObject;
                            let webview: *mut AnyObject = wv.inner() as *mut AnyObject;
                            let color = objc2_app_kit::NSColor::colorWithSRGBRed_green_blue_alpha(r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0, 1.0);
                            let _: () = objc2::msg_send![webview, setUnderPageBackgroundColor: &*color];
                            let no = objc2_foundation::NSNumber::new_bool(false);
                            let key = objc2_foundation::NSString::from_str("drawsBackground");
                            let _: () = objc2::msg_send![webview, setValue: &*no, forKey: &*key];
                        }
                        let _ = w_show.show();
                        let _ = w_show.set_focus();
                    });
                    let w_fallback = w.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(1200));
                        if matches!(w_fallback.is_visible(), Ok(false)) {
                            let _ = w_fallback.show();
                        }
                    });
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = w.show();
                }
                // Closing the window hides it; the app stays in the menu bar.
                let w2 = w.clone();
                w.on_window_event(move |ev| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
                        api.prevent_close();
                        let _ = w2.app_handle().save_window_state(STATE_FLAGS);
                        let _ = w2.hide();
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, ev| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = ev {
                show_main(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, ev);
        });
}
