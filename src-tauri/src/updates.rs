// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Checks GitHub for a newer release and offers to install it (tauri-plugin-updater: the
//! endpoint, releases/latest/download/latest.json, and the public key that every package must
//! be signed with are in tauri.conf.json under plugins.updater; tools/update_files.py writes
//! the release's files).
//!
//! When: 20 seconds after launch, then once a day while the app runs (the last check's time is
//! kept, so restarting doesn't check again), and whenever the user picks Check for Updates….
//! An update found in the background waits until the main window is next focused, so the offer
//! never pops up over another app. It offers Install and Restart, Later (asked again at the next
//! day's check) or Skip This Version. Release builds only, and never in screenshot mode.
//!
//! The offer, the download's progress and what it has to say are shown in the main window
//! (src/Update.tsx: the update-offer, update-progress and update-message events), which answers
//! with update_answer. A window that loads while an offer or its download is showing (a reload)
//! picks it up with update_offered. Native dialogs are left for when there is no main window.
//!
//! Before restarting it does what quitting does (crate::before_quit) and has the main window write
//! its waiting saves, since AppHandle::restart doesn't go through Quit.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{MenuItem, MenuItemKind};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(20);
const EVERY: Duration = Duration::from_secs(24 * 60 * 60);
const TICK: Duration = Duration::from_secs(60 * 60);

/// The app menu item's id.
pub const MENU_ID: &str = "check-updates";

const INSTALL: &str = "Install and Restart";
const LATER: &str = "Later";
const SKIP: &str = "Skip This Version";

/// Why an update can't be installed right now ("A backup is running."), or None when it can.
pub type Busy = fn(&AppHandle) -> Option<String>;

pub struct Updates {
    /// Found in the background, waiting for the main window to be in front.
    pending: Mutex<Option<Update>>,
    /// Offered in the main window, waiting for its answer.
    offered: Mutex<Option<Update>>,
    /// What the main window's dialog shows of it, for a window that loads after it was sent.
    showing: Mutex<Option<Shown>>,
    /// An offer is showing or an update is installing: no second offer meanwhile.
    asking: AtomicBool,
    busy: Busy,
}

/// What the main window shows of an update (update-offer).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Offer {
    name: String,
    version: String,
    current: String,
    notes: Option<String>,
    /// RFC 3339, from latest.json's pub_date.
    date: Option<String>,
}

/// The offer and, once it's being installed, the download's progress (update_offered).
#[derive(Serialize, Clone)]
pub struct Shown {
    offer: Offer,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<Progress>,
}

/// The download's progress (update-progress): "downloading", then "installing", then "restarting".
#[derive(Serialize, Clone)]
struct Progress {
    stage: &'static str,
    got: u64,
    total: Option<u64>,
}

#[derive(Serialize, Clone)]
struct Message<'a> {
    title: &'a str,
    text: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Answer {
    Install,
    Later,
    Skip,
}

#[derive(Default, Serialize, Deserialize)]
struct Saved {
    #[serde(default)]
    checked: u64,
    #[serde(default)]
    skipped: Option<String>,
}

/// Beside the app's other files in Application Support (store.rs).
fn saved_path() -> Option<PathBuf> {
    Some(crate::store::data_dir().join("updates.json"))
}

fn load() -> Saved {
    saved_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save(s: &Saved) {
    let Some(p) = saved_path() else { return };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(b) = serde_json::to_vec_pretty(s) {
        let _ = std::fs::write(p, b);
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn app_name(app: &AppHandle) -> String {
    app.package_info().name.clone()
}

/// Adds "Check for Updates…" to the app menu, after About (website::add_to_menu puts the app's
/// own About first, so this runs after it). Main thread, as setup is.
pub fn add_to_menu(app: &AppHandle) -> tauri::Result<()> {
    let Some(menu) = app.menu() else { return Ok(()) };
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        if app_menu.get(MENU_ID).is_none() {
            app_menu.insert(&MenuItem::with_id(app, MENU_ID, "Check for Updates…", true, None::<&str>)?, 1)?;
        }
    }
    Ok(())
}

/// Starts the background checks. Call once from setup, in the windowed app only.
pub fn start(app: &AppHandle, busy: Busy) {
    app.manage(Updates {
        pending: Mutex::new(None),
        offered: Mutex::new(None),
        showing: Mutex::new(None),
        asking: AtomicBool::new(false),
        busy,
    });
    #[cfg(windows)]
    remove_old_installers(&app_name(app));
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            if now().saturating_sub(load().checked) >= EVERY.as_secs() {
                tauri::async_runtime::block_on(check(&app, false));
            }
            std::thread::sleep(TICK);
        }
    });
}

/// On Windows the updater downloads each update's installer to a folder in Temp
/// ("Two-edged Sword-1.1.0-updater-Zu7DmM") and leaves it there after installing. By the time the
/// app starts again that installer has done its work, so the folders go.
#[cfg(windows)]
fn remove_old_installers(name: &str) {
    let Ok(dir) = std::fs::read_dir(std::env::temp_dir()) else { return };
    let prefix = format!("{name}-");
    for e in dir.flatten() {
        let n = e.file_name().to_string_lossy().into_owned();
        if n.starts_with(&prefix) && n.contains("-updater-") && e.path().is_dir() {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

/// Check for Updates…: says what it found, even when there's nothing new.
pub fn check_now(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { check(&app, true).await });
}

/// The main window gained focus: offer an update a background check found.
pub fn focused(app: &AppHandle) {
    let Some(state) = app.try_state::<Updates>() else { return };
    let Some(update) = state.pending.lock().unwrap().take() else { return };
    let app = app.clone();
    tauri::async_runtime::spawn(async move { offer(&app, update).await });
}

async fn check(app: &AppHandle, asked: bool) {
    let found = match app.updater() {
        Ok(u) => u.check().await,
        Err(e) => Err(e),
    };
    let mut saved = load();
    match found {
        Ok(Some(update)) => {
            saved.checked = now();
            save(&saved);
            if asked {
                offer(app, update).await;
            } else if saved.skipped.as_deref() != Some(update.version.as_str()) {
                let focused = app.get_webview_window("main").and_then(|w| w.is_focused().ok()).unwrap_or(false);
                if focused {
                    offer(app, update).await;
                } else if let Some(state) = app.try_state::<Updates>() {
                    *state.pending.lock().unwrap() = Some(update);
                }
            }
        }
        Ok(None) => {
            saved.checked = now();
            save(&saved);
            if asked {
                let v = app.package_info().version.to_string();
                tell(app, "You're up to date", &format!("{} {v} is the newest version.", app_name(app))).await;
            }
        }
        Err(e) => {
            // A failed background check is tried again within the hour.
            eprintln!("update check failed: {e}");
            if asked {
                // The release has no package for this system (Windows, until one is published).
                let why = if e.to_string().contains("platform") {
                    "Updates for this system aren't published yet.".to_string()
                } else {
                    e.to_string()
                };
                tell(app, "Couldn't check for updates", &why).await;
            }
        }
    }
}

/// The main window, brought in front if it isn't, or None when there is none to show things in.
fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let w = app.get_webview_window("main")?;
    if !w.is_focused().unwrap_or(false) {
        let app = app.clone();
        let _ = app.clone().run_on_main_thread(move || crate::show_main(&app));
    }
    Some(w)
}

async fn offer(app: &AppHandle, update: Update) {
    let Some(state) = app.try_state::<Updates>() else { return };
    if state.asking.swap(true, Ordering::SeqCst) {
        // Already offered, or installing: the window that shows it is brought forward.
        main_window(app);
        return;
    }
    let shown = Offer {
        name: app_name(app),
        version: update.version.clone(),
        current: update.current_version.clone(),
        notes: update.body.as_deref().map(str::trim).filter(|n| !n.is_empty()).map(String::from),
        date: update.raw_json["pub_date"].as_str().map(String::from),
    };
    *state.offered.lock().unwrap() = Some(update);
    if main_window(app).is_some() {
        *state.showing.lock().unwrap() = Some(Shown { offer: shown.clone(), progress: None });
        if app.emit_to("main", "update-offer", &shown).is_ok() {
            return;
        }
        *state.showing.lock().unwrap() = None;
    }
    // No window to show it in: a native dialog instead.
    let Some(update) = state.offered.lock().unwrap().take() else { return };
    let answer = ask_natively(app, &shown).await;
    answered(app, update, answer).await
}

async fn ask_natively(app: &AppHandle, shown: &Offer) -> Answer {
    let mut text = format!("{} {} is available. You have {}.", shown.name, shown.version, shown.current);
    if let Some(notes) = &shown.notes {
        text.push_str("\n\n");
        text.push_str(notes);
    }
    let dialog = app
        .dialog()
        .message(text)
        .title(format!("A new version of {} is available", shown.name))
        .buttons(MessageDialogButtons::YesNoCancelCustom(INSTALL.into(), LATER.into(), SKIP.into()));
    let choice =
        tauri::async_runtime::spawn_blocking(move || dialog.blocking_show_with_result()).await.unwrap_or(MessageDialogResult::Cancel);
    // Custom buttons come back as their labels; anything else (Esc, closed) is Later.
    match choice {
        MessageDialogResult::Custom(c) if c == INSTALL => Answer::Install,
        MessageDialogResult::Custom(c) if c == SKIP => Answer::Skip,
        _ => Answer::Later,
    }
}

/// The offer the main window's dialog shows, and its download's progress, for a window that has
/// just loaded: one sent before it loaded is still waiting for an answer.
#[tauri::command]
pub fn update_offered(app: AppHandle) -> Option<Shown> {
    app.try_state::<Updates>()?.showing.lock().unwrap().clone()
}

/// The main window's answer to update-offer; Esc or closing the dialog is Later.
#[tauri::command]
pub async fn update_answer(app: AppHandle, answer: Answer) {
    let Some(state) = app.try_state::<Updates>() else { return };
    let Some(update) = state.offered.lock().unwrap().take() else { return };
    answered(&app, update, answer).await;
}

async fn answered(app: &AppHandle, update: Update, answer: Answer) {
    match answer {
        Answer::Install => install(app, update).await,
        Answer::Skip => {
            let mut saved = load();
            saved.skipped = Some(update.version.clone());
            save(&saved);
        }
        Answer::Later => {}
    }
    // Here unless it restarted.
    let state = app.state::<Updates>();
    *state.showing.lock().unwrap() = None;
    state.asking.store(false, Ordering::SeqCst);
}

async fn install(app: &AppHandle, update: Update) {
    let state = app.state::<Updates>();
    if let Some(why) = (state.busy)(app) {
        tell(app, "The update will wait", &format!("{why} {} will offer it again later.", app_name(app))).await;
        return;
    }
    // Saves the page is holding back are written now (src/state.tsx), and again once the update is
    // in, for anything typed while it downloaded.
    let _ = app.emit_to("main", "flush", ());
    let progress = |stage, got, total| {
        let p = Progress { stage, got, total };
        if let Some(shown) = state.showing.lock().unwrap().as_mut() {
            shown.progress = Some(p.clone());
        }
        let _ = app.emit_to("main", "update-progress", p);
    };
    progress("downloading", 0, None);
    // A few times a second is enough for the bar.
    let (mut got, mut last) = (0u64, None::<Instant>);
    let done = update
        .download_and_install(
            |n, total| {
                got += n as u64;
                if last.is_none_or(|t| t.elapsed() >= Duration::from_millis(100)) || Some(got) == total {
                    last = Some(Instant::now());
                    progress("downloading", got, total);
                }
            },
            || {
                progress("installing", 0, None);
                // Windows' installer closes the app as it starts, so this is the last word: what
                // quitting does is done now, as the restart below won't be reached there.
                #[cfg(windows)]
                {
                    let _ = app.emit_to("main", "flush", ());
                    std::thread::sleep(Duration::from_millis(500));
                    crate::before_quit(app);
                }
            },
        )
        .await;
    match done {
        Ok(()) => {
            progress("restarting", 0, None);
            let _ = app.emit_to("main", "flush", ());
            crate::before_quit(app);
            std::thread::sleep(Duration::from_millis(500));
            app.restart()
        }
        Err(e) => tell(app, "The update didn't install", &e.to_string()).await,
    }
}

async fn tell(app: &AppHandle, title: &str, text: &str) {
    if main_window(app).is_some() && app.emit_to("main", "update-message", Message { title, text }).is_ok() {
        return;
    }
    let dialog = app.dialog().message(text).title(title).kind(MessageDialogKind::Info);
    let _ = tauri::async_runtime::spawn_blocking(move || dialog.blocking_show()).await;
}
