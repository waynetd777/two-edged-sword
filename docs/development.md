# Development

Tauri 2, with a React and TypeScript frontend (Vite) and a Rust backend. The Rust side reads the
e-Sword modules (SQLite, read-only), keeps the search index, writes the journal, speaks aloud and
runs the AI tools for Ask; the frontend is everything you see.

## Commands

| Command | What it does |
|---|---|
| `make dev` | The app with hot reload |
| `make check` | Rust tests (including ones against your e-Sword library) and the TypeScript check |
| `make app` | Build the .app, signed with the identity in `signing.local` if there is one |
| `make install-app` | Build it and replace the copy in /Applications |
| `make icons` | Redraw the icon artwork (`tools/make_icons.py`) and regenerate the icon set |
| `make sign-check` | Show how the installed app is signed |
| `make screenshots` | Retake the screenshots in `docs/images/`, light and dark (see below) |

Hot reload can leave a screen in a broken state after edits that change a component's hooks.
Reload the window (⌘R) or restart `make dev` before treating it as a bug.

## Where things live

| What | Where |
|---|---|
| e-Sword X modules (read-only) | `~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/` |
| Journal, one Markdown file per month | the Obsidian vault's `Two-edged Sword/` folder, or `~/Documents/Two-edged Sword/`; set in Settings |
| Settings, bookmarks, highlights, plans, chats, the day the reminder last came (`reminder.json`) | `~/Library/Application Support/Two-edged Sword/*.json` |
| Search index (rebuilt on its own when modules change) | `~/Library/Application Support/Two-edged Sword/search-index.sqlite` |
| Library material written out for Ask | `~/Library/Application Support/Two-edged Sword/ask/` and `books/` (see [Ask](ask.md)) |

## Signing and Full Disk Access

The modules live inside e-Sword's own container, so macOS asks "would like to access data from
other apps". That answer is remembered only for the exact build, so it comes back after every
rebuild. Give the app Full Disk Access once (System Settings › Privacy & Security › Full Disk
Access) and it stops: that grant is tied to the signing certificate, so sign builds with a stable
self-signed one. Copy `signing.local.example` to `signing.local` (untracked) and name the
certificate there.

## Build times

`src-tauri/Cargo.toml` keeps the lib `rlib`-only, uses thin LTO with parallel codegen units for
release builds, drops debug info for dependencies in dev builds, and optimises SQLite even in dev
builds because it does all the searching.

## Screenshots

`make screenshots` retakes every image in `docs/images/`, in both themes, and
`python3 tools/screenshots.py read ask --theme dark` retakes just some. Each scene (the screen,
passage, Bible, study-pane tab and so on) is in `tools/screenshots/scenes.json`. The script
launches the dev build with the scene in `TES_SCENE`; `src/scene.ts` sets it up at 1440×900 and
saves nothing, so your own settings, chats and window position are left alone. It captures the
window, and writes it 1400px wide without the display's colour profile (which would tint it in
browsers). The Ask shot shows a saved answer, `tools/screenshots/ask-chat.json`, rather than
asking a model each time; the Listen shot places the player without speaking. A scene can
`scrollTo` a CSS selector, and `crop` the image to `[x, y, width, height]` of the 1400px-wide
shot for one part of a screen (the reminder shot is just the Quiet time section of Settings).
The menu-bar menu is a native menu that screenshot mode can't open, so `docs/images/menu-bar.png` is
taken by hand (⌘⇧4 with the menu open, cropped to the menu).

It needs Screen Recording permission for the terminal, and starts the Vite dev server if it isn't
already running. Scenes use public-domain Bibles only.

Screenshot mode is also the way to see the app while debugging: a one-off scene can put it in
the state a bug needs (including `pending`, which replays a click that opens an article,
commentary or question) and capture what it shows. `CLAUDE.md` and `AGENTS.md` show how.

## The code

| Where | What |
|---|---|
| `src/` | The screens (`Read.tsx`, `Compare.tsx`, `WordStudy.tsx`…), shared state (`state.tsx`), the Rust calls (`api.ts`), e-Sword markup rendering (`esword.tsx`) |
| `src/speech.tsx` | Reading aloud: verse by verse through the native synthesiser, word highlighting, sleep timer |
| `src/Ask.tsx`, `src/assistant.ts` | The Ask panels, and which AI tools and models are available |
| `src-tauri/src/library.rs`, `content.rs` | Finding modules and reading text out of them |
| `src-tauri/src/search.rs`, `index.rs` | Search and its index |
| `src/tray.tsx`, `src-tauri/src/tray.rs` | The menu-bar menu and the daily reminder, which is timed on the Rust side so it fires with the window hidden |
| `src-tauri/src/tts.rs` | Speech through AVSpeechSynthesizer (WebKit's speech API hides downloaded voices) |
| `src-tauri/src/assistant/` | Running Claude Code or Codex for Ask |
| `src-tauri/src/study.rs`, `books.rs` | Writing library material out as files for Ask to search |
| `index.html` | The splash screen, painted before React starts |
| `src/scene.ts`, `tools/screenshots.py` | Screenshot mode and the script that drives it |
| `tools/make_icons.py` | The icon artwork (the sidebar logo and splash reuse the same sword) |

Decisions and known bugs are recorded with sift in `_sift/` (see `AGENTS.md`):
`python3 _sift/bin/sift.py decisions` lists why things are the way they are.

## Licensed Bibles

The NIV, ESV and other copyrighted modules are licensed for personal use. They are never copied
into this repo (`.gitignore` excludes module files), and the app only reads them where e-Sword
keeps them. Screenshots in `docs/images/` show public-domain text only.
