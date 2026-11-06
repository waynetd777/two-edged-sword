// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The phone's stand-in for the desktop's store.rs: the folders the shared module readers ask for.
//! On a phone they come from Tauri's path resolver at start-up, not from $HOME.

use std::path::PathBuf;
use std::sync::OnceLock;

pub static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
pub static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

/// There's no e-Sword on a phone; library.rs builds e-Sword's folder from this, and it's never read.
pub fn home() -> PathBuf {
    data_dir()
}

/// The app's own data folder: downloaded modules go in its Modules folder.
pub fn data_dir() -> PathBuf {
    DATA_DIR.get().cloned().unwrap_or_default()
}

/// A folder shipped in the app.
pub fn bundled(name: &str) -> PathBuf {
    RESOURCE_DIR.get().map(|d| d.join(name)).unwrap_or_default()
}

/// A file's size and modified time (since the epoch); zeros if it can't be read.
pub fn file_stamp(path: &std::path::Path) -> (u64, std::time::Duration) {
    let m = std::fs::metadata(path).ok();
    let len = m.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime = m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).unwrap_or_default();
    (len, mtime)
}
