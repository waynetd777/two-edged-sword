// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

const COMMANDS: &[&str] = &[
    "allow_rotation",
    "speak",
    "speech_pause",
    "speech_resume",
    "speech_stop",
    // addPluginListener in the app goes through these (the "speech" events).
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
