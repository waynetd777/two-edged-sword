# The phone app. Run from mobile/.
SIM ?= iPhone 17
APP_ID = com.wayned.two-edged-sword
SIM_APP = src-tauri/gen/apple/build/arm64-sim/Two-edged Sword.app

# Tauri copies the bundled modules into gen/apple/assets and never removes one dropped from
# tauri.conf.json, so every build starts that folder afresh.
assets:
	rm -rf src-tauri/gen/apple/assets

ios-sim: assets   ## Build for the Simulator, install on $(SIM) (booting it if needed) and launch
	cargo tauri ios build --debug --target aarch64-sim
	xcrun simctl boot "$(SIM)" 2>/dev/null || true
	xcrun simctl bootstatus "$(SIM)" -b >/dev/null
	xcrun simctl install "$(SIM)" "$(SIM_APP)"
	xcrun simctl terminate "$(SIM)" $(APP_ID) 2>/dev/null || true
	SIMCTL_CHILD_TES_SCENE="$(SCENE)" xcrun simctl launch "$(SIM)" $(APP_ID)

shot:      ## make shot SCENE=study [OUT=file.png]: relaunch in a scene (lib.rs's scene) and screenshot the Simulator
	xcrun simctl terminate "$(SIM)" $(APP_ID) 2>/dev/null || true
	SIMCTL_CHILD_TES_SCENE="$(SCENE)" xcrun simctl launch "$(SIM)" $(APP_ID) >/dev/null
	sleep 4
	xcrun simctl io "$(SIM)" screenshot "$(or $(OUT),shot.png)"

icons:     ## The app icons from src-tauri/icons/source (python3 tools/icons.py makes those from design/icon.png)
	cargo tauri icon src-tauri/icons/source/ios.png
	rm -rf src-tauri/icons/android
	cargo tauri icon src-tauri/icons/source/android.png -o target/android-icons
	mv target/android-icons/android src-tauri/icons/android
	rm -rf target/android-icons
	python3 tools/icons.py finish

modules-release:  ## The downloads: gzipped modules and manifest.json in target/modules-release
	python3 tools/modules_release.py

# Uploads the downloads to the GitHub release tagged `modules` (made the first time), replacing what's there.
modules-publish: modules-release
	gh release view modules >/dev/null 2>&1 || gh release create modules --title "Modules for the phone app" --notes "Public-domain modules for Two-edged Sword on iPhone and Android, downloaded from the app's Library." --latest=false
	gh release upload modules target/modules-release/* --clobber

.PHONY: assets icons ios-sim shot modules-release modules-publish
