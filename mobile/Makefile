# The phone app. Run from mobile/.
SIM ?= iPhone 17
APP_ID = com.wayned.two-edged-sword
SIM_APP = src-tauri/gen/apple/build/arm64-sim/Two-edged Sword.app

ios-sim:   ## Build for the Simulator, install on $(SIM) (booting it if needed) and launch
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

.PHONY: ios-sim shot
