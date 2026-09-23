// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
