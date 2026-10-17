// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// No console window beside the app on Windows, in a debug build too.
#![cfg_attr(windows, windows_subsystem = "windows")]

/// The app menu labels an unbundled process by its executable name ("TwoEdgedSword" in
/// `tauri dev`); set the real name before AppKit starts. The bundled .app takes its name from
/// Info.plist anyway.
#[cfg(target_os = "macos")]
fn set_process_name() {
    use objc2_foundation::{NSProcessInfo, NSString};
    NSProcessInfo::processInfo().setProcessName(&NSString::from_str("Two-edged Sword"));
}

fn main() {
    #[cfg(target_os = "macos")]
    set_process_name();
    two_edged_sword_lib::run()
}
