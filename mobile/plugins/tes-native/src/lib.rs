// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The phone app's native side: Swift on iOS (`ios/`). The iPhone stays upright except while a picture is
//! open full screen (allow_rotation); reading aloud with iOS's own voices, which carries on with the screen
//! locked (speak and the rest, with "speech" events for each word). Elsewhere the commands do nothing.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{command, AppHandle, Runtime};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_tes_native);

#[cfg(target_os = "ios")]
struct Native<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[derive(serde::Serialize)]
struct Rotation {
    allow: bool,
}

/// Lets the phone turn (a picture is open), or turns it back upright and keeps it there.
#[command]
async fn allow_rotation<R: Runtime>(app: AppHandle<R>, allow: bool) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<()>("allowRotation", Rotation { allow }).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, Rotation { allow });
        Ok(())
    }
}

/// One stretch of text to read, with the app's id for it (a verse number).
#[derive(serde::Serialize, serde::Deserialize)]
struct Item {
    id: i64,
    text: String,
}

#[derive(serde::Serialize)]
struct Speak {
    items: Vec<Item>,
    /// 1 = iOS's normal pace; 0.5 to 2.
    rate: f64,
    /// For the lock screen: "1 John 1".
    title: String,
}

/// Reads `items` aloud one after another, replacing anything being read.
#[command]
async fn speak<R: Runtime>(app: AppHandle<R>, items: Vec<Item>, rate: f64, title: String) -> Result<(), String> {
    native(&app, "speak", Speak { items, rate, title })
}

#[command]
async fn speech_pause<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    native(&app, "speechPause", ())
}

#[command]
async fn speech_resume<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    native(&app, "speechResume", ())
}

#[command]
async fn speech_stop<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    native(&app, "speechStop", ())
}

fn native<R: Runtime, A: serde::Serialize>(app: &AppHandle<R>, method: &str, args: A) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<()>(method, args).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, method, args);
        Err("reading aloud isn't on this platform yet".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("tes-native")
        .invoke_handler(tauri::generate_handler![allow_rotation, speak, speech_pause, speech_resume, speech_stop])
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            {
                use tauri::Manager;
                let handle = _api.register_ios_plugin(init_plugin_tes_native)?;
                _app.manage(Native(handle));
            }
            Ok(())
        })
        .build()
}
