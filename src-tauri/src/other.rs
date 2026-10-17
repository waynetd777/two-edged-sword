// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Off macOS (Windows): the AppKit modules' places, with nothing behind them yet. Each has what
//! lib.rs and the page call, doing nothing or saying there's nothing, so the rest of the app runs.

/// Spelling and grammar (spell.rs): nothing is flagged.
pub mod spell {
    use serde::Serialize;

    #[derive(Serialize)]
    pub struct GrammarIssue {
        pub start: usize,
        pub len: usize,
        pub description: String,
        pub corrections: Vec<String>,
    }

    pub fn load_kjv(_lib: &crate::library::Library) {}
    pub fn kjv_ready() -> bool {
        true
    }
    pub fn check(_text: &str) -> Vec<(usize, usize)> {
        Vec::new()
    }
    pub fn grammar(_text: &str) -> Vec<GrammarIssue> {
        Vec::new()
    }
    pub fn guesses(_word: &str) -> Vec<String> {
        Vec::new()
    }
    pub fn correction(_word: &str) -> Option<String> {
        None
    }
    pub fn learn(_word: &str) {}
    pub fn ignore(_word: &str) {}
}

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

/// The media keys and Now Playing (media.rs).
pub mod media {
    use tauri::AppHandle;

    #[tauri::command]
    pub fn media_state(_app: AppHandle, _title: Option<String>, _playing: bool) {}
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

/// Open at Login (login_item.rs, login_launch.rs): not offered.
pub mod login_item {
    #[derive(PartialEq, Clone, Copy, Debug)]
    pub enum Status {
        NotFound,
        RequiresApproval,
    }

    impl Status {
        pub fn is_on(self) -> bool {
            false
        }
    }

    pub fn available() -> bool {
        false
    }
    pub fn status() -> Status {
        Status::NotFound
    }
    pub fn set(_on: bool) -> Status {
        Status::NotFound
    }
    pub fn open_settings() {}
}

pub mod login_launch {
    pub fn probe() -> bool {
        false
    }
}
