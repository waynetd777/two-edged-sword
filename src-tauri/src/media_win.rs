// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The keyboard's media keys and Windows' media controls (the panel by the volume, and on the lock
//! screen), for reading aloud, as media.rs gives them on macOS: the page says what is being read
//! and whether it's playing, and the keys come back as "media" events ("play", "pause", "next",
//! "previous").

use tauri::{AppHandle, Emitter, Manager};
use windows::core::HSTRING;
use windows::Foundation::TypedEventHandler;
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls, SystemMediaTransportControlsButton,
    SystemMediaTransportControlsButtonPressedEventArgs,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

thread_local! {
    /// The main window's controls, made on the main thread the first time the page says anything.
    static CONTROLS: std::cell::OnceCell<Option<SystemMediaTransportControls>> = const { std::cell::OnceCell::new() };
}

fn controls(app: &AppHandle) -> Option<SystemMediaTransportControls> {
    let w = app.get_webview_window("main")?;
    let hwnd = HWND(w.hwnd().ok()?.0 as _);
    let interop = windows::core::factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>().ok()?;
    let c: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd) }.ok()?;
    for on in [c.SetIsPlayEnabled(true), c.SetIsPauseEnabled(true), c.SetIsNextEnabled(true), c.SetIsPreviousEnabled(true)] {
        on.ok()?;
    }
    let a = app.clone();
    let pressed =
        TypedEventHandler::<SystemMediaTransportControls, SystemMediaTransportControlsButtonPressedEventArgs>::new(move |_, args| {
            let Some(args) = args.as_ref() else { return Ok(()) };
            let name = match args.Button()? {
                SystemMediaTransportControlsButton::Play => "play",
                SystemMediaTransportControlsButton::Pause => "pause",
                SystemMediaTransportControlsButton::Next => "next",
                SystemMediaTransportControlsButton::Previous => "previous",
                _ => return Ok(()),
            };
            let _ = a.emit("media", name);
            Ok(())
        });
    c.ButtonPressed(&pressed).ok()?;
    Some(c)
}

pub fn state(app: &AppHandle, title: Option<String>, playing: bool) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        CONTROLS.with(|cell| {
            let Some(c) = cell.get_or_init(|| controls(&a)) else { return };
            let shown = c.DisplayUpdater();
            match title {
                Some(t) => {
                    let _ = c.SetIsEnabled(true);
                    if let Ok(u) = &shown {
                        let _ = u.SetType(MediaPlaybackType::Music);
                        if let Ok(m) = u.MusicProperties() {
                            let _ = m.SetTitle(&HSTRING::from(t));
                            let _ = m.SetArtist(&HSTRING::from("Two-edged Sword"));
                        }
                        let _ = u.Update();
                    }
                    let _ = c.SetPlaybackStatus(if playing { MediaPlaybackStatus::Playing } else { MediaPlaybackStatus::Paused });
                }
                None => {
                    let _ = c.SetPlaybackStatus(MediaPlaybackStatus::Stopped);
                    if let Ok(u) = &shown {
                        let _ = u.ClearAll();
                        let _ = u.Update();
                    }
                    let _ = c.SetIsEnabled(false);
                }
            }
        });
    });
}

/// What is being read (`title`; none when nothing is) and whether it is playing or paused.
#[tauri::command]
pub fn media_state(app: AppHandle, title: Option<String>, playing: bool) {
    state(&app, title, playing);
}
