// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! What differs between operating systems. macOS has the implementation; elsewhere the fallbacks
//! do nothing, so the rest of the app builds there too.

#[cfg(target_os = "macos")]
mod about;

/// macOS's About panel with `link` under the copyright, clickable, opening `url`. Main thread.
/// Elsewhere, nothing: the platform's own About item stays.
pub fn about_panel(name: &str, version: &str, copyright: &str, icon_png: &[u8], link: &str, url: &str) {
    #[cfg(target_os = "macos")]
    about::show(name, version, copyright, icon_png, link, url);
    #[cfg(not(target_os = "macos"))]
    let _ = (name, version, copyright, icon_png, link, url);
}
