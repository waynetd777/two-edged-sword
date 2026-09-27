# Two-edged Sword — build, sign and install the app.

APP      := src-tauri/target/release/bundle/macos/Two-edged Sword.app

# The signing certificate is named in signing.local, which is untracked: the name of a keychain
# identity is local to the machine that holds it. Copy signing.local.example and put your own
# self-signed certificate's name in it. Without one the build is signed ad hoc, and macOS asks
# again for permission to read e-Sword's library after every rebuild.
-include signing.local
SIGN_ID  := $(APPLE_SIGNING_IDENTITY)
# "-" is an ad-hoc signature: an empty identity makes the bundler fail instead.
export APPLE_SIGNING_IDENTITY := $(if $(SIGN_ID),$(SIGN_ID),-)

.PHONY: check test app install-app dev icons sign-check help core

## cargo test + TypeScript type-check.
check:
	cd src-tauri && cargo test --lib
	npx tsc --noEmit -p tsconfig.json

test: check

# Release builds strip the builder's home directory out of the binary (Rust bakes absolute
# paths into panic metadata). Debug builds skip this so `make dev` keeps its incremental cache.
# The remapping is limited to what goes into the binary (--remap-path-scope=object).
RELEASE_RUSTFLAGS := --remap-path-prefix=$(HOME)=/build --remap-path-scope=object
# macOS 27's linker (ld-27037) sometimes writes a library whose string table dyld refuses
# ("mis-aligned LINKEDIT string pool"), so rustc can't load a proc macro it has just built and
# stops with "can't find crate" (E0463). Release builds link with Rust's own lld instead; lld
# can't read the macOS 27 SDK's .tbd files, so it links against the 26.5 SDK when that's there.
LLD_DIR := $(shell rustc --print sysroot)/lib/rustlib/aarch64-apple-darwin/bin/gcc-ld
OLD_SDK := $(wildcard /Library/Developer/CommandLineTools/SDKs/MacOSX26*.sdk)
ifneq ($(OLD_SDK),)
RELEASE_RUSTFLAGS += -Clink-arg=-fuse-ld=lld -Clink-arg=-B$(LLD_DIR)
RELEASE_ENV := SDKROOT=$(lastword $(OLD_SDK))
endif

# Each release build bumps the version (tools/bump_version.py: 1.0.4 → 1.0.5) and gets its own build
# number, the same on the app (CFBundleVersion), its Help Book and the binary (Settings shows it).
# macOS caches the Help Book by its version (1.0.5) and only re-reads a new one, so every release needs one.
BUILD := $(shell date +%Y%m%d.%H%M%S)

## Bump the version and build the .app, signed with the identity in signing.local when there is one.
app:
	@echo "version $$(python3 tools/bump_version.py), build $(BUILD)"
	TES_BUILD=$(BUILD) $(RELEASE_ENV) RUSTFLAGS="$(RELEASE_RUSTFLAGS)" npm run tauri build -- --config '{"bundle":{"macOS":{"bundleVersion":"$(BUILD)"}}}'
	@if [ -n "$(SIGN_ID)" ]; then \
	  codesign -dv --verbose=2 "$(APP)" 2>&1 | grep -E "^Authority=$(SIGN_ID)" >/dev/null \
	    && echo "signed with $(SIGN_ID)" \
	    || { echo "WARNING: app is not signed with $(SIGN_ID)"; exit 1; }; \
	else echo "note: no signing.local, so the app is signed ad hoc"; fi

## Build and replace /Applications/Two-edged Sword.app.
install-app: app
	@pkill -x TwoEdgedSword 2>/dev/null || true
	@rm -rf "/Applications/Two-edged Sword.app"
	@ditto "$(APP)" "/Applications/Two-edged Sword.app"
	@echo "installed /Applications/Two-edged Sword.app"
	@# helpd keeps the old book cached under the same path and then shows "content unavailable", so drop its cache and re-register.
	@killall helpd 2>/dev/null || true
	@rm -rf ~/Library/Caches/com.apple.helpd/*
	@/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "/Applications/Two-edged Sword.app"

## Redraw design/icon.png and the tray template, then regenerate the Tauri icon set.
icons:
	@python3 tools/make_icons.py
	@npx tauri icon design/icon.png >/dev/null
	@rm -rf src-tauri/icons/android src-tauri/icons/ios
	@echo "regenerated src-tauri/icons"

## Retake docs/images/*-light.png and *-dark.png from tools/screenshots/scenes.json.
screenshots:
	@python3 tools/screenshots.py

sign-check:
	@codesign -dv --verbose=2 "/Applications/Two-edged Sword.app" 2>&1 | grep -E "^(Identifier|Authority|Signature|TeamIdentifier)"

## Build the Help Book from docs/ (the release build does this itself; for the dev build's Help menu).
help:
	@python3 tools/helpbook.py

## Build the modules built into the app (src-tauri/modules/) from public-domain sources.
core:
	@python3 tools/core/build.py

dev: help
	@python3 tools/core/build.py --if-missing
	npm run tauri dev
