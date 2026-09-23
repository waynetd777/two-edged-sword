# Two-edged Sword — build, sign and install the app.

APP      := src-tauri/target/release/bundle/macos/Two-edged Sword.app

# The signing certificate is named in signing.local, which is untracked: the name of a keychain
# identity is local to the machine that holds it. Copy signing.local.example and put your own
# self-signed certificate's name in it. Without one the build is signed ad hoc, and macOS asks
# again for permission to read e-Sword's library after every rebuild.
-include signing.local
export APPLE_SIGNING_IDENTITY
SIGN_ID  := $(APPLE_SIGNING_IDENTITY)

.PHONY: check test app install-app dev icons sign-check

## cargo test + TypeScript type-check.
check:
	cd src-tauri && cargo test --lib
	npx tsc --noEmit -p tsconfig.json

test: check

# Release builds strip the builder's home directory out of the binary (Rust bakes absolute
# paths into panic metadata). Debug builds skip this so `make dev` keeps its incremental cache.
RELEASE_RUSTFLAGS := --remap-path-prefix=$(HOME)=/build

## Build the .app, signed with the identity in signing.local when there is one.
app:
	RUSTFLAGS="$(RELEASE_RUSTFLAGS)" npm run tauri build
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

## Redraw design/icon.png and the tray template, then regenerate the Tauri icon set.
icons:
	@python3 tools/make_icons.py
	@npx tauri icon design/icon.png >/dev/null
	@rm -rf src-tauri/icons/android src-tauri/icons/ios
	@echo "regenerated src-tauri/icons"

sign-check:
	@codesign -dv --verbose=2 "/Applications/Two-edged Sword.app" 2>&1 | grep -E "^(Identifier|Authority|Signature|TeamIdentifier)"

dev:
	npm run tauri dev
