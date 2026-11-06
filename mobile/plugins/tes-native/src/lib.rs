// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The phone app's native side: Swift on iOS (`ios/`). For now one thing: the iPhone stays upright except
//! while a picture is open full screen (allow_rotation). Elsewhere the command does nothing.

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

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("tes-native")
        .invoke_handler(tauri::generate_handler![allow_rotation])
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
