//! The menu-bar menu and the daily Quiet time reminder. The frontend owns what they say: it sends
//! a TrayState whenever today's reading, the place or the reminder setting changes (src/tray.tsx),
//! and gets the menu's choices back as "tray" events. The reminder is timed here because the
//! window's page is throttled once the window is hidden.

use crate::store;
use chrono::Timelike;
use serde::Deserialize;
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    /// Today's reading ("Psalm 23 · John 3"), or None without an active plan.
    today: Option<String>,
    /// Today's reading is marked done.
    done: bool,
    /// Where reading left off ("John 3").
    reading: String,
    reminder: bool,
    /// "HH:MM", local time.
    reminder_time: String,
}

/// None until the frontend has sent its first state (it waits for the saved settings and plans).
#[derive(Default)]
pub struct Tray(Mutex<Option<TrayState>>);

/// A choice from the menu that the frontend carries out ("open" and "quit" are handled in lib.rs).
/// It brings the window up first, except for the reminder, which only flips a setting.
pub fn on_action(app: &AppHandle, id: &str) {
    if id == "login" {
        toggle_login(app);
        return;
    }
    if !["quiet", "continue", "journal", "search", "reminder"].contains(&id) {
        return;
    }
    if id != "reminder" {
        crate::show_main(app);
    }
    let _ = app.emit("tray", id);
}

pub fn menu(app: &AppHandle, s: Option<&TrayState>) -> tauri::Result<Menu<Wry>> {
    let quiet_label = match s {
        Some(TrayState { today: Some(t), done: false, .. }) => format!("Start Quiet Time: {t}"),
        Some(TrayState { today: Some(_), done: true, .. }) => "Quiet Time: done today".to_string(),
        _ => "Quiet Time…".to_string(),
    };
    let reading = s.map(|s| s.reading.as_str()).filter(|r| !r.is_empty());
    let continue_label = reading.map_or("Continue Reading".to_string(), |r| format!("Continue Reading {r}"));
    let reminder_label = match s {
        Some(s) if !s.reminder_time.is_empty() => format!("Daily Reminder at {}", s.reminder_time),
        _ => "Daily Reminder".to_string(),
    };
    let quiet = MenuItem::with_id(app, "quiet", quiet_label, true, None::<&str>)?;
    let cont = MenuItem::with_id(app, "continue", continue_label, true, None::<&str>)?;
    let journal = MenuItem::with_id(app, "journal", "New Journal Entry", true, None::<&str>)?;
    let search = MenuItem::with_id(app, "search", "Search…", true, None::<&str>)?;
    let reminder = CheckMenuItem::with_id(app, "reminder", reminder_label, s.is_some(), s.is_some_and(|s| s.reminder), None::<&str>)?;
    let login = login_menu_item(app)?;
    let open = MenuItem::with_id(app, "open", "Open Two-edged Sword", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    Menu::with_items(app, &[&quiet, &cont, &journal, &search, &sep()?, &reminder, &login, &sep()?, &open, &quit])
}

/// "Open at Login", ticked from what macOS reports. Disabled where there is nothing to register
/// (the unbundled `make dev` binary).
#[cfg(target_os = "macos")]
fn login_menu_item(app: &AppHandle) -> tauri::Result<CheckMenuItem<Wry>> {
    CheckMenuItem::with_id(app, "login", "Open at Login", crate::login_item::available(), crate::login_item::status().is_on(), None::<&str>)
}

#[cfg(not(target_os = "macos"))]
fn login_menu_item(app: &AppHandle) -> tauri::Result<CheckMenuItem<Wry>> {
    CheckMenuItem::with_id(app, "login", "Open at Login", false, false, None::<&str>)
}

/// Flips Open at Login and rebuilds the menu from the status macOS reports afterwards. If macOS
/// wants the user to approve it, System Settings opens at Login Items.
fn toggle_login(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use crate::login_item::{self, Status};
        if login_item::set(!login_item::status().is_on()) == Status::RequiresApproval {
            login_item::open_settings();
        }
    }
    let s = app.state::<Tray>().0.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if let (Ok(m), Some(t)) = (menu(app, s.as_ref()), app.tray_by_id("main")) {
        let _ = t.set_menu(Some(m));
    }
}

#[tauri::command]
pub fn set_tray(app: AppHandle, tray: tauri::State<'_, Tray>, state: TrayState) -> Result<(), String> {
    let m = menu(&app, Some(&state)).map_err(|e| e.to_string())?;
    *tray.0.lock().unwrap_or_else(|p| p.into_inner()) = Some(state);
    if let Some(t) = app.tray_by_id("main") {
        t.set_menu(Some(m)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Minutes after the reminder time within which it still fires: waking the Mac at 7:10 still
/// reminds for 6:30, but opening the app in the evening doesn't.
const GRACE_MINUTES: i64 = 120;

/// Whether to remind now, given the state, the local date and minute of the day, and the date the
/// reminder last fired.
fn due(s: &TrayState, date: &str, minute: i64, fired: Option<&str>) -> bool {
    let Some((h, m)) = s.reminder_time.split_once(':') else { return false };
    let (Ok(h), Ok(m)) = (h.parse::<i64>(), m.parse::<i64>()) else { return false };
    let at = h * 60 + m;
    s.reminder && !s.done && fired != Some(date) && minute >= at && minute < at + GRACE_MINUTES
}

/// Checks twice a minute whether the reminder is due. The date it last fired is kept in the store,
/// so relaunching the app doesn't remind twice on one day.
pub fn start_reminders(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let Some(s) = app.state::<Tray>().0.lock().unwrap_or_else(|p| p.into_inner()).clone() else { continue };
        let now = chrono::Local::now();
        let date = now.format("%Y-%m-%d").to_string();
        let minute = (now.hour() * 60 + now.minute()) as i64;
        let dir = store::data_dir();
        let fired = store::read(&dir, "reminder").ok().and_then(|v| v.get("fired").and_then(|f| f.as_str()).map(str::to_string));
        if !due(&s, &date, minute, fired.as_deref()) {
            continue;
        }
        let body = s.today.as_deref().map_or("Time for your Quiet Time.".to_string(), |t| format!("Today: {t}"));
        if let Err(e) = app.notification().builder().title("Quiet Time").body(body).show() {
            eprintln!("reminder: {e}");
        }
        let _ = store::write(&dir, "reminder", &serde_json::json!({ "fired": date }));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st(reminder: bool, done: bool, time: &str) -> TrayState {
        TrayState { today: Some("John 3".into()), done, reading: "John 3".into(), reminder, reminder_time: time.into() }
    }

    #[test]
    fn fires_once_in_the_window() {
        let s = st(true, false, "06:30");
        assert!(!due(&s, "2026-09-24", 6 * 60 + 29, None));
        assert!(due(&s, "2026-09-24", 6 * 60 + 30, None));
        assert!(due(&s, "2026-09-24", 8 * 60 + 29, Some("2026-09-23")));
        assert!(!due(&s, "2026-09-24", 8 * 60 + 30, None));
        assert!(!due(&s, "2026-09-24", 7 * 60, Some("2026-09-24")));
    }

    #[test]
    fn not_when_off_done_or_malformed() {
        assert!(!due(&st(false, false, "06:30"), "2026-09-24", 400, None));
        assert!(!due(&st(true, true, "06:30"), "2026-09-24", 400, None));
        assert!(!due(&st(true, false, ""), "2026-09-24", 400, None));
        assert!(!due(&st(true, false, "6h30"), "2026-09-24", 400, None));
    }
}
