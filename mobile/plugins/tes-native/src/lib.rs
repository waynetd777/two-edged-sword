// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The phone app's native side: Swift on iOS (`ios/`), Kotlin on Android (`android/`). The iPhone stays upright except while a picture is
//! open full screen (allow_rotation); reading aloud with iOS's own voices, which carries on with the screen
//! locked (speak and the rest, with "speech" events for each word). Elsewhere the commands do nothing.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{command, AppHandle, Runtime};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_tes_native);

#[cfg(mobile)]
struct Native<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[derive(serde::Serialize)]
struct Rotation {
    allow: bool,
}

/// Lets the phone turn (a picture is open), or turns it back upright and keeps it there.
#[command]
async fn allow_rotation<R: Runtime>(app: AppHandle<R>, allow: bool) -> Result<(), String> {
    #[cfg(mobile)]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<()>("allowRotation", Rotation { allow }).map_err(|e| e.to_string());
    }
    #[cfg(not(mobile))]
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
    /// A voice's identifier (from voices), or none for the best English one installed.
    voice: Option<String>,
}

/// The phone's English voices: identifier, name, language and quality.
#[command]
async fn voices<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    #[cfg(mobile)]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<serde_json::Value>("voices", ()).map_err(|e| e.to_string());
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(serde_json::json!({ "voices": [] }))
    }
}

/// Reads `items` aloud one after another, replacing anything being read.
#[command]
async fn speak<R: Runtime>(app: AppHandle<R>, items: Vec<Item>, rate: f64, title: String, voice: Option<String>) -> Result<(), String> {
    native(&app, "speak", Speak { items, rate, title, voice })
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
    #[cfg(mobile)]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<()>(method, args).map_err(|e| e.to_string());
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, method, args);
        Err("reading aloud isn't on this platform yet".into())
    }
}

#[derive(serde::Serialize)]
struct Say {
    word: String,
    /// "he" or "el": the word's language.
    lang: String,
    /// Its pronunciation in English letters, said when the phone has no voice for the language.
    pron: String,
}

/// Says one original-language word, apart from Listen (which carries on).
#[command]
async fn say<R: Runtime>(app: AppHandle<R>, word: String, lang: String, pron: String) -> Result<(), String> {
    native(&app, "say", Say { word, lang, pron })
}

/// A light tap felt in the hand, for a button or a word tapped.
#[command]
async fn tap<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    native(&app, "tap", ())
}

/// Android: where the bundled modules were copied out of the APK, once they have been.
#[command]
async fn bundled_dir<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<serde_json::Value>("bundledDir", ()).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(serde_json::json!({}))
    }
}

/// Android: the folder a module opened in the app is copied to, to be taken into the library.
#[command]
async fn inbox_dir<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<serde_json::Value>("inboxDir", ()).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(serde_json::json!({}))
    }
}

/// The Library's Add from Files: the system's file picker; what's chosen waits in the Inbox to be taken in.
#[command]
async fn pick_modules<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    #[cfg(mobile)]
    {
        use tauri::Manager;
        return app.state::<Native<R>>().0.run_mobile_plugin::<serde_json::Value>("pickModules", ()).map_err(|e| e.to_string());
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(serde_json::json!({ "count": 0 }))
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("tes-native")
        .invoke_handler(tauri::generate_handler![allow_rotation, speak, speech_pause, speech_resume, speech_stop, voices, bundled_dir, inbox_dir, pick_modules, say, tap])
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            {
                use tauri::Manager;
                let handle = _api.register_ios_plugin(init_plugin_tes_native)?;
                _app.manage(Native(handle));
            }
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin("com.wayned.tes.plugin", "TesNativePlugin")?;
                _app.manage(Native(handle));
            }
            Ok(())
        })
        .build()
}
