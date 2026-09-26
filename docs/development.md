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

Release and dev build profiles in `src-tauri/Cargo.toml` are tuned for build speed; its comments
say why.

## Where things live

| What | Where |
|---|---|
| e-Sword X modules (read-only) | `~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/` |
| Journal, one Markdown file per month | `~/Library/CloudStorage/OneDrive-Personal/Notes/Two-edged Sword/` if that exists, else `~/Documents/Two-edged Sword/`; change it in Settings |
| Settings, bookmarks, highlights, plans, chats, `reminder.json` (when the reminder last fired) | `~/Library/Application Support/Two-edged Sword/*.json` |
| Search index (rebuilt on its own when modules change) | `~/Library/Application Support/Two-edged Sword/search-index.sqlite` |
| Library material written out for Ask | `~/Library/Application Support/Two-edged Sword/ask/` and `books/` (see [Ask](ask.md)) |
| Differences from the KJV, one reviewed list per translation, and their work folders | `~/Library/Application Support/Two-edged Sword/variances-<module>.json`, `variances-work/` |
| Downloads cached by the build scripts in `tools/` | `~/Library/Caches/Two-edged Sword/` |

In `ask/`, each passage chat gets `studies/<chat>/`, with the dictionaries hard-linked in from
`ask/dictionaries/` rather than copied; each journal chat gets `journal/<chat>/`.

## Signing and Full Disk Access

To stop macOS asking for e-Sword's data after every rebuild, sign builds with a stable
self-signed certificate: create one (`signing.local.example` says how), copy that file to
`signing.local` (untracked) and put the certificate's name in it. Then give the installed app
Full Disk Access once (System Settings › Privacy & Security › Full Disk Access). Unsigned builds
are asked again every time because the answer is tied to the exact build.

## Open at Login

Works only in the app from `make install-app` (disabled under `make dev`): it registers the
installed bundle as a login item, which survives rebuilds while the bundle identifier stays
`com.wayned.two-edged-sword`. When macOS opens the app at login, it starts in the menu bar with
no window or Dock icon.

## Screenshots

`make screenshots` retakes every image in `docs/images/`, in both themes;
`python3 tools/screenshots.py read ask --theme dark` retakes just some. It needs Pillow, the
Xcode Command Line Tools and Screen Recording permission for the terminal, and starts the Vite
dev server if it isn't running.

Each scene is in `tools/screenshots/scenes.json`. The script launches the dev build with the
scene in `TES_SCENE`; the app sizes the window to 1440×900, `src/scene.ts` sets up the scene and
nothing is saved. The window is written 1400px wide, converted from the display's colour profile
to sRGB. Ask, Worship and Journal shots use fixtures in `tools/screenshots/` (a saved answer, a
session with songs chosen, sample entries) so nothing is asked of a model and your journal stays
private. Scenes use public-domain Bibles only. `AGENTS.md` lists the scene fields and shows how
to use a one-off scene to see the app while debugging.

The menu-bar menu is native and screenshot mode can't open it, so `docs/images/menu-bar.png` is
taken by hand (⌘⇧4 with the menu open, cropped to the menu).

## The code

| Where | What |
|---|---|
| `src/` | The screens (`Read.tsx`, `Compare.tsx`, `WordStudy.tsx`, `QuietTime.tsx`, `Journal.tsx`…), shared state (`state.tsx`), the Rust calls (`api.ts`), e-Sword markup rendering (`esword.tsx`) |
| `src/speech.tsx` | Reading aloud: verse by verse through the native synthesiser, word highlighting, sleep timer |
| `src/Ask.tsx`, `src/assistant.ts` | The Ask panels, and which AI tools and models are available |
| `src-tauri/src/library.rs`, `content.rs` | Finding modules and reading text out of them |
| `src-tauri/src/search.rs`, `index.rs` | Search and its index |
| `src-tauri/src/journal.rs` | The journal's monthly Markdown files |
| `src-tauri/src/store.rs` | The JSON files in Application Support |
| `src-tauri/src/music.rs` | Quiet time's worship songs, played through Music |
| `src/tray.tsx`, `src-tauri/src/tray.rs` | The menu-bar menu and the daily reminder, which is timed on the Rust side so it fires with the window hidden |
| `src-tauri/src/login_item.rs`, `login_launch.rs` | Open at Login, and telling a login launch from the user opening the app |
| `src-tauri/src/tts.rs` | Speech through AVSpeechSynthesizer (WebKit's speech API hides downloaded voices) |
| `src-tauri/src/assistant/` | Running Claude Code, Codex, Antigravity or Copilot for Ask |
| `src-tauri/src/study.rs`, `books.rs` | Writing library material out as files for Ask to search: a folder per passage chat with the dictionaries hard-linked in, and `ask/journal/<chat>/` for journal chats |
| `index.html` | The splash screen, painted before React starts |
| `src/scene.ts`, `tools/screenshots.py` | Screenshot mode and the script that drives it |
| `src/variances.tsx`, `src/KjvHistory.tsx` | The ≠ marks and their popup, and the KJV History page |
| `tools/variances/` | Finding, reviewing and building each translation's differences from the KJV (see [Translations and manuscripts](manuscripts.md)) |
| `tools/sefaria/`, `tools/vulgate/`, `tools/crosswire/`, `tools/syriac/`, `tools/wlc/`, `tools/latin/`, `tools/targum/` | Building modules from free sources (see [Library](library.md#building-modules)) |
| `tools/make_icons.py` | The icon artwork (the sidebar logo and splash reuse the same sword) |

Design decisions and known bugs are logged in `_sift/`; `python3 _sift/bin/sift.py decisions`
lists them.

## Licensed Bibles

The NIV, ESV and other copyrighted modules are licensed for personal use. They are never copied
into this repo (`.gitignore` excludes module files), and the app only reads them where e-Sword
keeps them. Screenshots in `docs/images/` show public-domain text only.
