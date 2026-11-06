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

# Your own iPhone, with your Apple team (a free personal team works: the install lasts 7 days). The team ID
# never goes in the repo: give TEAM=, or keep it in the keychain item tes-apple-team-id
# (security add-generic-password -a "$$USER" -s tes-apple-team-id -w <team id>).
TEAM ?= $(shell security find-generic-password -s tes-apple-team-id -w 2>/dev/null)
# The first iPhone plugged in or paired, unless DEVICE=<udid> says which.
DEVICE ?= $(shell xcrun devicectl list devices 2>/dev/null | awk '/physical/ && /iPhone/ {for (i=1;i<=NF;i++) if ($$i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$$/) {print $$i; exit}}')

ios-phone: assets   ## make ios-phone [TEAM=<team id>] [DEVICE=<udid>]: a release build on your iPhone
	@test -n "$(TEAM)" || (echo "Give TEAM=<your Apple team id>, or keep it in the keychain item tes-apple-team-id"; exit 1)
	@test -n "$(DEVICE)" || (echo "No iPhone found: plug it in, or give DEVICE=<udid> (xcrun devicectl list devices)"; exit 1)
	APPLE_DEVELOPMENT_TEAM=$(TEAM) cargo tauri ios build --export-method debugging; s=$$?; \
	  git checkout -- src-tauri/gen/apple/tes-mobile.xcodeproj/project.pbxproj 2>/dev/null; exit $$s
	rm -rf target/ipa && mkdir -p target/ipa && cd target/ipa && unzip -q "../../src-tauri/gen/apple/build/arm64/Two-edged Sword.ipa"
	xcrun devicectl device install app --device $(DEVICE) "target/ipa/Payload/Two-edged Sword.app"

# Android: our launcher icons into the generated project (cargo tauri android init writes Tauri's own), and a
# debug build on the phone plugged in (adb devices lists them), as pager-system's android-phone.
ANDROID_APK = src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
ANDROID_RELEASE_APK = src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
ANDROID_BUILD_TOOLS = $(lastword $(wildcard $(HOME)/Library/Android/sdk/build-tools/*))

android-icons:
	cp -R src-tauri/icons/android/ src-tauri/gen/android/app/src/main/res/

android-phone: android-icons   ## make android-phone [DEVICE=<serial>]: an optimised build on your Android phone over USB
	@# A release build: a debug one runs the Rust side unoptimised, and search is many times slower. Signed with
	@# this Mac's Android debug key (~/.android/debug.keystore), which is fine for your own phone.
	rm -rf src-tauri/gen/android/app/src/main/assets
	cargo tauri android build --apk --target aarch64
	$(ANDROID_BUILD_TOOLS)/apksigner sign --ks $$HOME/.android/debug.keystore --ks-pass pass:android --key-pass pass:android \
	  --out target/app-release.apk $(ANDROID_RELEASE_APK)
	adb $(if $(DEVICE),-s $(DEVICE),-d) install -r target/app-release.apk
	adb $(if $(DEVICE),-s $(DEVICE),-d) shell am start -n com.wayned.two_edged_sword/.MainActivity >/dev/null

android-emu: android-icons   ## A debug build on the running emulator (emulator -avd <name>)
	rm -rf src-tauri/gen/android/app/src/main/assets
	cargo tauri android build --debug --apk --target aarch64
	adb -e install -r $(ANDROID_APK)
	adb -e shell am start -n com.wayned.two_edged_sword/.MainActivity >/dev/null

# A free personal team's provisioning profile lists only devices Xcode has registered, and Tauri's build
# (for any iOS device) never registers one. This starts a build aimed at the device, which registers it and
# renews the profile, then stops at Tauri's step (expected). Run it once for each new iPhone or iPad.
ios-register:   ## make ios-register DEVICE=<udid> [TEAM=<team id>]: add a device to the team's profile
	@test -n "$(TEAM)" -a -n "$(DEVICE)" || (echo "Give DEVICE=<udid> (xcrun devicectl list devices) and TEAM, or keep TEAM in the keychain"; exit 1)
	-cd src-tauri/gen/apple && xcodebuild -project tes-mobile.xcodeproj -scheme tes-mobile_iOS -destination "id=$(DEVICE)" \
	  -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=$(TEAM) CODE_SIGN_STYLE=Automatic build >/dev/null 2>&1
	git checkout -- src-tauri/gen/apple/tes-mobile.xcodeproj/project.pbxproj

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

.PHONY: assets android-emu android-icons android-phone icons ios-phone ios-register ios-sim shot modules-release modules-publish
