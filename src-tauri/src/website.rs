// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The app's website, and the ways into it: the Help menu's "Two-edged Sword Website", and the
//! About panel, whose credits carry the address as a link. Settings has a Website button too, from
//! src/website.ts, which holds the same address.

use tauri::menu::{MenuItem, MenuItemKind, HELP_SUBMENU_ID};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

pub const WEBSITE: &str = "https://two-edged-sword.davies.co.za/";

/// The Help menu item's id.
pub const MENU_ID: &str = "website";
/// The About item's id, in place of the platform's own.
pub const ABOUT_ID: &str = "app:about";

/// Opens the website in the browser.
pub fn open(app: &AppHandle) {
    if let Err(e) = app.opener().open_url(WEBSITE, None::<&str>) {
        eprintln!("website: {e}");
    }
}

/// Adds "Two-edged Sword Website" to the Help menu, after the help item, and puts the app's own
/// About item in place of the platform's, so its panel can carry the link. Main thread, as setup is.
pub fn add_to_menu(app: &AppHandle) -> tauri::Result<()> {
    let Some(menu) = app.menu() else { return Ok(()) };
    if let Some(help) = menu.get(HELP_SUBMENU_ID).and_then(|i| i.as_submenu().cloned()) {
        help.append(&MenuItem::with_id(app, MENU_ID, "Two-edged Sword Website", true, None::<&str>)?)?;
    }
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        if app_menu.get(ABOUT_ID).is_none() {
            app_menu.remove_at(0)?;
            app_menu.insert(&MenuItem::with_id(app, ABOUT_ID, "About Two-edged Sword", true, None::<&str>)?, 0)?;
        }
    }
    Ok(())
}

/// Shows the About panel: name, version, copyright, icon, and the website under them as a link.
pub fn about(app: &AppHandle) {
    let version = app.package_info().version.to_string();
    let _ = app.run_on_main_thread(move || {
        crate::platform::about_panel(
            "Two-edged Sword",
            &version,
            "© 2026 Wayne Davies. Free software under the GNU GPL, version 3 or later.",
            include_bytes!("../icons/128x128@2x.png"),
            WEBSITE.trim_start_matches("https://").trim_end_matches('/'),
            WEBSITE,
        );
    });
}

#[cfg(test)]
mod tests {
    use super::WEBSITE;

    /// src/website.ts holds the same address for Settings' Website button.
    #[test]
    fn same_address_in_the_front_end() {
        let ts = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/website.ts")).unwrap();
        assert!(ts.contains(&format!("\"{WEBSITE}\"")), "src/website.ts must say {WEBSITE}");
    }
}
