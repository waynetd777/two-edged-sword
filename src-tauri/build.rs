// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

fn main() {
    // SMAppService (src/login_item.rs) lives in ServiceManagement; without this the class is
    // missing at run time and Open at Login stays disabled.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-lib=framework=ServiceManagement");
    }
    tauri_build::build()
}
