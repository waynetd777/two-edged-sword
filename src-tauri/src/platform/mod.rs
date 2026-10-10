// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! AppKit pieces the Tauri API doesn't reach. Main thread, all of them.

mod about;

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject};

/// macOS's About panel with `link` under the copyright, clickable, opening `url`.
pub fn about_panel(name: &str, version: &str, copyright: &str, icon_png: &[u8], link: &str, url: &str) {
    about::show(name, version, copyright, icon_png, link, url);
}

/// The NSApplication.
pub fn ns_app() -> Option<Retained<AnyObject>> {
    let cls = AnyClass::get(c"NSApplication")?;
    unsafe { objc2::msg_send![cls, sharedApplication] }
}

/// Brings the app to the front: after coming back from Accessory, `set_focus()` alone can leave
/// the window behind whatever the user was working in.
pub fn activate() {
    if let Some(app) = ns_app() {
        let _: () = unsafe { objc2::msg_send![&*app, activateIgnoringOtherApps: true] };
    }
}
