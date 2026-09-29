// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The Help menu's "Two-edged Sword Help" (⌘?), opening the Help Book tools/helpbook.py builds from
//! docs/. The app's Info.plist names the book, so macOS also searches it from the Help menu's search
//! field. A dev build has no bundle to hold the book, so there it opens the built pages in the browser.
//! The same guides go into every Ask chat's folder (write_guides), for questions about the app.

use tauri::menu::{MenuItem, HELP_SUBMENU_ID};
use tauri::{AppHandle, Manager};

pub const MENU_ID: &str = "help";
const BOOK: &str = "Two-edged Sword.help";

/// Adds the item to the Help menu of the app's default menu. Main thread, as setup is.
pub fn add_to_menu(app: &AppHandle) -> tauri::Result<()> {
    let Some(help) = app.menu().and_then(|m| m.get(HELP_SUBMENU_ID)).and_then(|i| i.as_submenu().cloned()) else { return Ok(()) };
    help.append(&MenuItem::with_id(app, MENU_ID, "Two-edged Sword Help", true, None::<&str>)?)?;
    #[cfg(target_os = "macos")]
    set_shortcut();
    Ok(())
}

/// ⌘?, which the menu's accelerators can't spell (they'd give ⇧⌘/): set on the AppKit item itself.
#[cfg(target_os = "macos")]
fn set_shortcut() {
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::NSString;
    let Some(cls) = AnyClass::get(c"NSApplication") else { return };
    unsafe {
        let nsapp: *mut AnyObject = objc2::msg_send![cls, sharedApplication];
        let menu: *mut AnyObject = objc2::msg_send![nsapp, helpMenu];
        if menu.is_null() {
            return;
        }
        let title = NSString::from_str("Two-edged Sword Help");
        let item: *mut AnyObject = objc2::msg_send![menu, itemWithTitle: &*title];
        if item.is_null() {
            return;
        }
        let key = NSString::from_str("?");
        let _: () = objc2::msg_send![item, setKeyEquivalent: &*key];
        let _: () = objc2::msg_send![item, setKeyEquivalentModifierMask: 1usize << 20];
        // NSEventModifierFlagCommand
    }
}

/// The book in the app's Resources, when running from a bundle.
fn bundled(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().resource_dir().ok().map(|d| d.join(BOOK)).filter(|p| p.exists())
}

pub fn show(app: &AppHandle) {
    if bundled(app).is_some() {
        #[cfg(target_os = "macos")]
        unsafe {
            use objc2::runtime::{AnyClass, AnyObject};
            let Some(cls) = AnyClass::get(c"NSApplication") else { return };
            let nsapp: *mut AnyObject = objc2::msg_send![cls, sharedApplication];
            let _: () = objc2::msg_send![nsapp, showHelp: std::ptr::null::<AnyObject>()];
        }
        return;
    }
    // Only a dev build looks in the source tree (and only it has the path compiled in).
    #[cfg(debug_assertions)]
    {
        use tauri_plugin_opener::OpenerExt;
        let page =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("gen/help").join(BOOK).join("Contents/Resources/en.lproj/index.html");
        if page.exists() {
            let _ = app.opener().open_path(page.to_string_lossy(), None::<&str>);
        } else {
            eprintln!("no help built: run python3 tools/helpbook.py");
        }
    }
}

/// The user guides (docs/, but not development.md), built in, for Ask to search when a question is about the app.
const GUIDES: &[(&str, &str)] = &[
    ("features.md", include_str!("../../docs/features.md")),
    ("reading.md", include_str!("../../docs/reading.md")),
    ("study.md", include_str!("../../docs/study.md")),
    ("manuscripts.md", include_str!("../../docs/manuscripts.md")),
    ("journal.md", include_str!("../../docs/journal.md")),
    ("quiet-time.md", include_str!("../../docs/quiet-time.md")),
    ("ask.md", include_str!("../../docs/ask.md")),
    ("library.md", include_str!("../../docs/library.md")),
];

/// A guide without its screenshots and breadcrumb, which are HTML and say nothing to a model.
fn text(md: &str) -> String {
    md.lines()
        .filter(|l| {
            !l.contains("images/")
                && !l.starts_with("<sub>")
                && !l.starts_with("<table>")
                && !l.starts_with("</table>")
                && !l.trim_start().starts_with("<tr>")
                && !l.trim_start().starts_with("</tr>")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Writes the guides into `<dir>/help/`, with an index.txt of each file's title and sections.
/// Unchanged files are left alone, so a chat's folder isn't rewritten on every question.
pub fn write_guides(dir: &std::path::Path) -> std::io::Result<()> {
    let help = dir.join("help");
    std::fs::create_dir_all(&help)?;
    let mut index = String::from("The Two-edged Sword user guide, one file per part, with its sections:\n\n");
    for (name, md) in GUIDES {
        let body = text(md);
        let heads: Vec<&str> = md.lines().filter_map(|l| l.strip_prefix("## ")).collect();
        let title = md.lines().find_map(|l| l.strip_prefix("# ")).unwrap_or(name);
        index.push_str(&format!("{name}: {title}{}\n", if heads.is_empty() { String::new() } else { format!(" ({})", heads.join("; ")) }));
        write_if_changed(&help.join(name), &body)?;
    }
    write_if_changed(&help.join("index.txt"), &index)
}

fn write_if_changed(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    if std::fs::read_to_string(path).is_ok_and(|t| t == text) {
        return Ok(());
    }
    std::fs::write(path, text)
}

#[cfg(test)]
mod tests {
    #[test]
    fn writes_the_guides_without_screenshots() {
        let dir = std::env::temp_dir().join(format!("tes-help-{}", std::process::id()));
        super::write_guides(&dir).unwrap();
        let index = std::fs::read_to_string(dir.join("help/index.txt")).unwrap();
        assert!(index.contains("reading.md: Reading (Read; Books and devotionals; Listen)"));
        let reading = std::fs::read_to_string(dir.join("help/reading.md")).unwrap();
        assert!(reading.contains("## Listen") && !reading.contains("images/"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
