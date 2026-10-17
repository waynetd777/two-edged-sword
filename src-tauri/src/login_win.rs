// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Open at Login on Windows, as login_item.rs is on macOS: the app in the user's Run key
//! (HKCU\Software\Microsoft\Windows\CurrentVersion\Run), started with --login so it stays in the
//! notification area (login_launch::probe).

use windows::core::HSTRING;
use windows::Win32::System::Registry::{RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const NAME: &str = "Two-edged Sword";
/// What a launch from the Run key is started with.
pub const ARG: &str = "--login";

#[derive(PartialEq, Clone, Copy, Debug)]
pub enum Status {
    Enabled,
    NotRegistered,
    /// Never on Windows: macOS's "approve it in System Settings".
    RequiresApproval,
}

impl Status {
    pub fn is_on(self) -> bool {
        self == Status::Enabled
    }
}

/// The command the Run key should hold: this copy of the app, quoted.
fn command() -> Option<String> {
    Some(format!("\"{}\" {ARG}", std::env::current_exe().ok()?.display()))
}

pub fn available() -> bool {
    command().is_some()
}

/// Enabled when the Run key starts this copy of the app.
pub fn status() -> Status {
    let mut buf = [0u16; 1024];
    let mut size = (buf.len() * 2) as u32;
    let read = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            &HSTRING::from(RUN),
            &HSTRING::from(NAME),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if read.is_err() {
        return Status::NotRegistered;
    }
    let held = String::from_utf16_lossy(&buf[..(size as usize / 2).saturating_sub(1)]);
    if command().is_some_and(|c| c.eq_ignore_ascii_case(&held)) {
        Status::Enabled
    } else {
        Status::NotRegistered
    }
}

pub fn set(on: bool) -> Status {
    let (run, name) = (HSTRING::from(RUN), HSTRING::from(NAME));
    unsafe {
        if on {
            let Some(cmd) = command() else { return status() };
            let wide: Vec<u16> = cmd.encode_utf16().chain([0]).collect();
            let _ = RegSetKeyValueW(HKEY_CURRENT_USER, &run, &name, REG_SZ.0, Some(wide.as_ptr().cast()), (wide.len() * 2) as u32);
        } else {
            let _ = RegDeleteKeyValueW(HKEY_CURRENT_USER, &run, &name);
        }
    }
    status()
}

/// macOS's Login Items settings; Windows needs no approval, so there's nothing to open.
pub fn open_settings() {}
