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

.PHONY: check lint fmt test app install-app dmg dev icons sign-check help core visions site og

## cargo test + TypeScript type-check.
check:
	cd src-tauri && cargo test --lib
	npx tsc --noEmit -p tsconfig.json

test: check

## Check the code: rustfmt, clippy, Prettier and ESLint. Fails on any warning.
lint:
	cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
	npx prettier --check .
	npx eslint . --max-warnings 0

## Format the Rust and TypeScript.
fmt:
	cd src-tauri && cargo fmt
	npx prettier --write .

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
# number, the same on the app (CFBundleVersion) and the binary (Settings shows it).
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

## Pack the built app into the release DMG (src-tauri/target/release/bundle/dmg/), laid out like other Mac installers.
dmg:
	@python3 tools/dmg/make_dmg.py

## Build and replace /Applications/Two-edged Sword.app.
install-app: app
	@pkill -x TwoEdgedSword 2>/dev/null || true
	@rm -rf "/Applications/Two-edged Sword.app"
	@ditto "$(APP)" "/Applications/Two-edged Sword.app"
	@echo "installed /Applications/Two-edged Sword.app"

## Redraw design/icon.png and the tray template, then regenerate the Tauri icon set.
icons:
	@python3 tools/make_icons.py
	@npx tauri icon design/icon.png >/dev/null
	@rm -rf src-tauri/icons/android src-tauri/icons/ios
	@echo "regenerated src-tauri/icons"

## Retake docs/images/*-light.png and *-dark.png from tools/screenshots/scenes.json.
screenshots:
	@python3 tools/screenshots.py

## Remake the product page's pictures (site/img/*.webp) from the dark screenshots. Needs cwebp (brew install webp).
site:
	@for f in docs/images/*-dark.png; do cwebp -quiet -q 80 -m 6 "$$f" -o "site/img/$$(basename "$$f" -dark.png).webp"; done
	@cp src-tauri/icons/128x128@2x.png site/img/icon.png
	@sips -Z 180 src-tauri/icons/128x128@2x.png --out site/img/icon-180.png >/dev/null

## Render the product page's share card, site/img/og.png (1200×630), from tools/og.html with headless Chrome.
og:
	@"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 --virtual-time-budget=5000 --screenshot=site/img/og.png "file://$(CURDIR)/tools/og.html" 2>/dev/null
	@echo "  site/img/og.png"

sign-check:
	@codesign -dv --verbose=2 "/Applications/Two-edged Sword.app" 2>&1 | grep -E "^(Identifier|Authority|Signature|TeamIdentifier)"

## The pictures behind a song's words, one at a time, in Safari (visions.html); uses the dev server if it's running.
visions:
	@lsof -ti :1430 >/dev/null || (npx vite >/dev/null 2>&1 &) ; sleep 2; open -a Safari "http://localhost:1430/visions.html$(if $(v),?v=$(v))"

## Check the help: every link in the user guides, and each screen's section, points at a section that exists.
help:
	@python3 tools/helpcheck.py

## Build the modules built into the app (src-tauri/modules/) from public-domain sources.
core:
	@python3 tools/core/build.py

dev:
	@python3 tools/core/build.py --if-missing
	npm run tauri dev
