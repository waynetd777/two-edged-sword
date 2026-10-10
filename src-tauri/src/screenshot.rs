// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Screenshot mode (tools/screenshots.py): the app starts in the scene TES_SCENE describes, saves
//! nothing, and its windows are invisible and click-through while they still draw. Once it has
//! settled, the webview's snapshot goes to TES_SNAPSHOT.

use tauri::{AppHandle, Manager};

/// The scene to set up, as JSON, from TES_SCENE. The page then saves nothing, so the user's
/// settings, chats and place are left as they were.
pub fn scene() -> Option<String> {
    std::env::var("TES_SCENE").ok().filter(|s| !s.is_empty())
}

/// A scene with "tray": true shows the menu-bar window alone, for its screenshot; the main window
/// runs hidden to send it what to show.
pub fn tray_scene() -> bool {
    scene().and_then(|sc| serde_json::from_str::<serde_json::Value>(&sc).ok()).is_some_and(|v| v["tray"] == true)
}

/// Makes a window invisible and click-through while it still draws: nothing flashes on screen.
fn make_unseen(w: &tauri::WebviewWindow) {
    if let Ok(ns) = w.ns_window() {
        // Tauri's own NSWindow, alive as long as the window is; setup runs on the main thread.
        let window = unsafe { &*(ns as *const objc2_app_kit::NSWindow) };
        window.setAlphaValue(0.0);
        window.setIgnoresMouseEvents(true);
    }
}

/// The menu-bar window, shown unseen, for a tray scene.
pub fn show_tray(app: &AppHandle) {
    if let Some(t) = app.get_webview_window("tray") {
        let _ = t.set_position(tauri::LogicalPosition::new(200.0, 120.0));
        make_unseen(&t);
        let _ = t.show();
    }
}

/// The main window for a scene: always one size, whatever size it was left at, unseen and out of
/// the Dock, without taking the focus.
pub fn prepare_main(w: &tauri::WebviewWindow) {
    let _ = w.set_size(tauri::LogicalSize::new(1440.0, 900.0));
    let _ = w.center();
    make_unseen(w);
    crate::set_in_dock(w.app_handle(), false);
}

/// Saves what the window's webview shows to `dest` as a TIFF (an invisible window's own capture
/// is blank, its webview's snapshot isn't). The file appears when WebKit has drawn it.
fn snapshot(w: &tauri::WebviewWindow, dest: &std::path::Path) -> Result<(), String> {
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
        // TES_SNAPSHOT_WIDTH: the snapshot this many points wide, which is quicker to take
        // (an animated screenshot's frames); otherwise the window's full size.
        let width = std::env::var("TES_SNAPSHOT_WIDTH").ok().and_then(|s| s.parse::<f64>().ok());
        let config: *mut AnyObject =
            match (objc2::runtime::AnyClass::get(c"WKSnapshotConfiguration"), objc2::runtime::AnyClass::get(c"NSNumber"), width) {
                (Some(cls), Some(num), Some(width)) => {
                    let c: *mut AnyObject = objc2::msg_send![cls, new];
                    let n: *mut AnyObject = objc2::msg_send![num, numberWithDouble: width];
                    let _: () = objc2::msg_send![c, setSnapshotWidth: n];
                    c
                }
                _ => std::ptr::null_mut(),
            };
        let _: () = objc2::msg_send![webview, takeSnapshotWithConfiguration: config, completionHandler: &*done];
    })
    .map_err(|e| e.to_string())
}

/// The scene's snapshot to TES_SNAPSHOT, once it has settled (TES_SNAPSHOT_AFTER seconds).
pub fn start_snapshots(app: &AppHandle, tray_scene: bool) {
    let (Some(_), Some(out)) = (scene(), std::env::var_os("TES_SNAPSHOT")) else { return };
    let label = if tray_scene { "tray" } else { "main" };
    let num = |k: &str, d: f64| std::env::var(k).ok().and_then(|s| s.parse().ok()).unwrap_or(d);
    let after = num("TES_SNAPSHOT_AFTER", 6.0);
    // An animated screenshot: TES_SNAPSHOT_FRAMES of them, at least TES_SNAPSHOT_EVERY
    // seconds apart, each to TES_SNAPSHOT with its number before the extension
    // (shot-007.tiff). Each waits for the one before: asked for faster than WebKit draws
    // them, they all come back the same. When each was taken goes in shot-times.txt.
    let frames = num("TES_SNAPSHOT_FRAMES", 1.0).max(1.0) as usize;
    let every = num("TES_SNAPSHOT_EVERY", 0.1);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs_f64(after));
        let out = std::path::PathBuf::from(out);
        let start = std::time::Instant::now();
        let stem = out.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        let ext = out.extension().unwrap_or_default().to_string_lossy().into_owned();
        let mut times = String::new();
        for i in 0..frames {
            let dest = if frames == 1 { out.clone() } else { out.with_file_name(format!("{stem}-{i:03}.{ext}")) };
            let at = start.elapsed();
            if let Some(w) = app.get_webview_window(label) {
                let _ = snapshot(&w, &dest);
            }
            let given_up = std::time::Instant::now() + std::time::Duration::from_secs(5);
            while !dest.exists() && std::time::Instant::now() < given_up {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            times.push_str(&format!("{:.3}\n", at.as_secs_f64()));
            let next = at + std::time::Duration::from_secs_f64(every);
            std::thread::sleep(next.saturating_sub(start.elapsed()));
        }
        if frames > 1 {
            let _ = std::fs::write(out.with_file_name(format!("{stem}-times.txt")), times);
        }
    });
}
