// swift-tools-version:5.5

import PackageDescription

let package = Package(
    name: "tauri-plugin-tes-native",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "tauri-plugin-tes-native",
            type: .static,
            targets: ["tauri-plugin-tes-native"])
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-tes-native",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
