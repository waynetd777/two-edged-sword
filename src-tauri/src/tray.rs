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

/// When the menu window last closed itself on losing focus.
static TRAY_BLURRED_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

/// A click on the icon this soon after the menu closed on losing focus is the click that took the
/// focus: it closes the menu rather than opening it again.
const CLICK_AFTER_BLUR: std::time::Duration = std::time::Duration::from_millis(400);

/// Where the icon was that the menu last opened under. With two screens each menu bar has the
/// icon, and a click on the other screen's takes the focus too: that one opens the menu there.
static OPENED_UNDER: std::sync::Mutex<Option<(f64, f64)>> = std::sync::Mutex::new(None);

/// The icon's place as the click gives it, to tell one screen's icon from another's.
fn icon_place(rect: &tauri::Rect) -> (f64, f64) {
    let p = rect.position.to_physical::<f64>(1.0);
    (p.x, p.y)
}

/// Opens the menu window under the icon, or closes it.
fn toggle(app: &AppHandle, rect: tauri::Rect) {
    let Some(w) = app.get_webview_window("tray") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    // With the main window closed, clicking the icon takes the focus from the menu first, so it has
    // just hidden itself: this click was meant to close it.
    let same_icon = *OPENED_UNDER.lock().unwrap() == Some(icon_place(&rect));
    if TRAY_BLURRED_AT.lock().unwrap().take().is_some_and(|t| t.elapsed() < CLICK_AFTER_BLUR) && same_icon {
        return;
    }
    *OPENED_UNDER.lock().unwrap() = Some(icon_place(&rect));
    // Placed in points: on macOS they're one space across screens, where physical pixels aren't
    // (each screen's are its points times its own scale, so with a Retina screen beside another,
    // a position in pixels lands on the wrong screen or in the wrong place). The click gives the
    // icon in the pixels of the screen it's on; the screen it's on is the one where, in that
    // screen's points, it falls inside it. The icon can be reported a few points above its
    // screen's top edge (seen: 5 on a screen placed higher than the built-in one), so it counts
    // as on the screen within an icon's height of its top; across, it must be inside.
    let monitors = app.available_monitors().unwrap_or_default();
    let icon = rect.position.to_physical::<f64>(1.0);
    let icon_size = rect.size.to_physical::<f64>(1.0);
    let in_points = |m: &tauri::Monitor| {
        let k = m.scale_factor();
        let (p, sz) = (m.position(), m.size());
        let (left, top) = (p.x as f64 / k, p.y as f64 / k);
        let (x, y, slack) = (icon.x / k, icon.y / k, icon_size.height / k);
        let inside = x >= left && x < left + sz.width as f64 / k && y >= top - slack && y < top + sz.height as f64 / k;
        inside.then_some((k, left, left + sz.width as f64 / k))
    };
    let screen = monitors.iter().find_map(in_points);
    let k = screen.map_or_else(|| w.scale_factor().unwrap_or(2.0), |s| s.0);
    let (x, y, iw, ih) = (icon.x / k, icon.y / k, icon_size.width / k, icon_size.height / k);
    let mut left = x + iw / 2.0 - WIDTH / 2.0;
    if let Some((_, screen_left, screen_right)) = screen {
        left = left.min(screen_right - WIDTH - 8.0).max(screen_left + 8.0);
    }
    let place = tauri::LogicalPosition::new(left, y + ih + 6.0);
    let _ = w.set_position(place);
    let _ = w.show();
    // Once on that screen, place it again, in case macOS moved it while showing it.
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
    let (login_available, login) = (crate::login_item::available(), crate::login_item::status().is_on());
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
    use crate::login_item::{self, Status};
    if login_item::set(!login_item::status().is_on()) == Status::RequiresApproval {
        login_item::open_settings();
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
    // Also kept here, so a store that can't be written doesn't remind every 30 seconds.
    let mut fired_here: Option<String> = None;
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let Some(s) = app.state::<Tray>().0.lock().unwrap_or_else(|p| p.into_inner()).clone() else { continue };
        let now = chrono::Local::now();
        let date = now.format("%Y-%m-%d").to_string();
        let minute = (now.hour() * 60 + now.minute()) as i64;
        let dir = store::data_dir();
        let fired = store::read(&dir, "reminder").ok().and_then(|v| v.get("fired").and_then(|f| f.as_str()).map(str::to_string));
        let fired = if fired_here.as_deref() == Some(date.as_str()) { fired_here.clone() } else { fired };
        if !due(&s, &date, minute, fired.as_deref()) {
            continue;
        }
        let body = s.today.as_deref().map_or("Time for your Quiet Time.".to_string(), |t| format!("Today: {t}"));
        if let Err(e) = app.notification().builder().title("Quiet Time").body(body).show() {
            eprintln!("reminder: {e}");
        }
        if let Err(e) = store::write(&dir, "reminder", &serde_json::json!({ "fired": date })) {
            eprintln!("reminder: {e}");
        }
        fired_here = Some(date);
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
