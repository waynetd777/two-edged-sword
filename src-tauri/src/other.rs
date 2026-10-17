// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Off macOS (Windows): the AppKit modules' places that have no Windows version, each with what
//! lib.rs and the page call, doing nothing or saying there's nothing, so the rest of the app runs.

/// Reading aloud (tts.rs): no voices, so the page reads nothing.
pub mod tts {
    use serde::Serialize;
    use tauri::AppHandle;

    #[derive(Serialize)]
    pub struct Voice {}

    #[tauri::command]
    pub fn tts_voices() -> Vec<Voice> {
        Vec::new()
    }
    #[tauri::command]
    pub fn tts_speak(_app: AppHandle, _id: u64, _text: String, _voice: Option<String>, _rate: f32) {}
    #[tauri::command]
    pub fn tts_pause(_app: AppHandle, _on: bool) {}
    #[tauri::command]
    pub fn tts_stop(_app: AppHandle) {}
}

/// AppKit pieces (platform/).
pub mod platform {
    pub fn about_panel(_name: &str, _version: &str, _copyright: &str, _icon_png: &[u8], _link: &str, _url: &str) {}
    pub fn activate() {}
}

/// Screenshot mode (screenshot.rs) is macOS only: never a scene.
pub mod screenshot {
    use tauri::AppHandle;

    pub fn scene() -> Option<String> {
        None
    }
    pub fn tray_scene() -> bool {
        false
    }
    pub fn show_tray(_app: &AppHandle) {}
    pub fn prepare_main(_w: &tauri::WebviewWindow) {}
    pub fn start_snapshots(_app: &AppHandle, _tray_scene: bool) {}
}

/// Whether the Run key started the app (login_win.rs), so it stays in the notification area.
pub mod login_launch {
    pub fn probe() -> bool {
        std::env::args().any(|a| a == crate::login_item::ARG)
    }
}
