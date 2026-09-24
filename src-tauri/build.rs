fn main() {
    // SMAppService (src/login_item.rs) lives in ServiceManagement; without this the class is
    // missing at run time and Open at Login stays disabled.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-lib=framework=ServiceManagement");
    }
    tauri_build::build()
}
