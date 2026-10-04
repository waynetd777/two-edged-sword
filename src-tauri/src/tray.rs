// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The menu-bar icon, its window and the daily Quiet time reminder. Clicking the icon opens a
//! small window of its own under it (src/TrayWindow.tsx, the page with `?view=tray`), which
//! closes when it loses focus. The main window owns what it says: it sends a TrayState whenever
//! today's reading, the place, the streak or the reminder setting changes (src/tray.tsx), and gets
//! the window's choices back as "tray" events. The reminder is timed here because the main
//! window's page is throttled once the window is hidden.

use crate::store;
use chrono::Timelike;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const ID: &str = "main";
/// The menu window's width, in points.
const WIDTH: f64 = 340.0;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
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
    /// The active plan's name, how far through it is ("day 12 of 365") and as a percentage.
    plan: Option<String>,
    progress: Option<String>,
    pct: u32,
    /// Days read in a row, the best run, and of the last seven reading days how many were read.
    streak: u32,
    best: u32,
    week: u32,
    /// Days a dated plan is behind.
    behind: u32,
}

/// None until the frontend has sent its first state (it waits for the saved settings and plans).
#[derive(Default)]
pub struct Tray(Mutex<Option<TrayState>>);

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?;
    TrayIconBuilder::with_id(ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Two-edged Sword")
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button_state: MouseButtonState::Up, rect, .. } = ev {
                toggle(tray.app_handle(), rect);
            }
        })
        .build(app)?;
    if let Some(t) = app.get_webview_window("tray") {
        let t2 = t.clone();
        t.on_window_event(move |ev| {
            if let tauri::WindowEvent::Focused(false) = ev {
                if t2.is_visible().unwrap_or(false) {
                    *TRAY_BLURRED_AT.lock().unwrap() = Some(std::time::Instant::now());
                }
                let _ = t2.hide();
            }
        });
    }
    Ok(())
}

/// Opens the menu window under the icon, or closes it.
/// When the menu window last closed itself on losing focus.
static TRAY_BLURRED_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

/// A click on the icon this soon after the menu closed on losing focus is the click that took the
/// focus: it closes the menu rather than opening it again.
const CLICK_AFTER_BLUR: std::time::Duration = std::time::Duration::from_millis(400);

fn toggle(app: &AppHandle, rect: tauri::Rect) {
    let Some(w) = app.get_webview_window("tray") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    // With the main window closed, clicking the icon takes the focus from the menu first, so it has
    // just hidden itself: this click was meant to close it.
    if TRAY_BLURRED_AT.lock().unwrap().take().is_some_and(|t| t.elapsed() < CLICK_AFTER_BLUR) {
        return;
    }
    // The icon's place is in physical pixels across all screens: find the screen it's on and use
    // that screen's scale, as the window's own is the screen it was last on.
    let guess = w.scale_factor().unwrap_or(2.0);
    let (pos, size) = (rect.position.to_physical::<f64>(guess), rect.size.to_physical::<f64>(guess));
    let monitors = app.available_monitors().unwrap_or_default();
    let screen = monitors.iter().find(|m| {
        let (p, s) = (m.position(), m.size());
        pos.x >= p.x as f64 && pos.x < (p.x + s.width as i32) as f64 && pos.y >= p.y as f64 && pos.y < (p.y + s.height as i32) as f64
    });
    let scale = screen.map_or(guess, |m| m.scale_factor());
    let (pos, size) = if (scale - guess).abs() > f64::EPSILON {
        (rect.position.to_physical::<f64>(scale), rect.size.to_physical::<f64>(scale))
    } else {
        (pos, size)
    };
    let width = WIDTH * scale;
    let mut x = pos.x + size.width / 2.0 - width / 2.0;
    if let Some(m) = screen {
        let right = (m.position().x + m.size().width as i32) as f64;
        x = x.min(right - width - 8.0 * scale).max(m.position().x as f64 + 8.0 * scale);
    }
    let y = pos.y + size.height + 6.0 * scale;
    let place = tauri::PhysicalPosition::new(x, y);
    let _ = w.set_position(place);
    let _ = w.show();
    // Once on that screen, place it again: macOS converts the first move with the old screen's scale.
    let _ = w.set_position(place);
    let _ = w.set_focus();
    let _ = w.emit("tray-opened", ());
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayInfo {
    state: Option<TrayState>,
    /// Open at Login can be set (not in the unbundled `make dev` binary), and whether it's on.
    login_available: bool,
    login: bool,
}

/// What the menu window shows.
#[tauri::command]
pub fn tray_info(tray: tauri::State<'_, Tray>) -> TrayInfo {
    #[cfg(target_os = "macos")]
    let (login_available, login) = (crate::login_item::available(), crate::login_item::status().is_on());
    #[cfg(not(target_os = "macos"))]
    let (login_available, login) = (false, false);
    TrayInfo { state: tray.0.lock().unwrap_or_else(|p| p.into_inner()).clone(), login_available, login }
}

/// A choice in the menu window. "open", "quit" and "login" are done here; the rest the main
/// window carries out, brought up first, except the reminder, which only flips a setting.
#[tauri::command]
pub fn tray_do(app: AppHandle, id: String) {
    match id.as_str() {
        "open" => crate::show_main(&app),
        "quit" => crate::quit(&app),
        "login" => toggle_login(),
        "quiet" | "quiet-audio" | "continue" | "journal" | "search" | "plans" | "settings" | "reminder" => {
            if id != "reminder" {
                crate::show_main(&app);
            }
            let _ = app.emit_to("main", "tray", &id);
        }
        _ => return,
    }
    if id != "reminder" && id != "login" {
        if let Some(t) = app.get_webview_window("tray") {
            let _ = t.hide();
        }
    }
}

/// Flips Open at Login. If macOS wants the user to approve it, System Settings opens at Login Items.
fn toggle_login() {
    #[cfg(target_os = "macos")]
    {
        use crate::login_item::{self, Status};
        if login_item::set(!login_item::status().is_on()) == Status::RequiresApproval {
            login_item::open_settings();
        }
    }
}

#[tauri::command]
pub fn set_tray(app: AppHandle, tray: tauri::State<'_, Tray>, state: TrayState) -> Result<(), String> {
    let (on, at) = (state.reminder, state.reminder_time.clone());
    let prev = tray.0.lock().unwrap_or_else(|p| p.into_inner()).replace(state);
    // Turning the reminder on sends one notification straight away, so macOS asks for permission
    // now rather than when the first reminder is due.
    if on && prev.is_some_and(|p| !p.reminder) {
        if let Err(e) = app
            .notification()
            .builder()
            .title("Quiet Time")
            .body(format!("You'll be reminded at {at} if today's reading isn't done."))
            .show()
        {
            eprintln!("reminder: {e}");
        }
    }
    let _ = app.emit_to("tray", "tray-state", ());
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
        TrayState {
            today: Some("John 3".into()),
            done,
            reading: "John 3".into(),
            reminder,
            reminder_time: time.into(),
            ..Default::default()
        }
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
