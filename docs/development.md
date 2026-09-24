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

Hot reload can leave a screen in a broken state after edits that change a component's hooks.
Reload the window (⌘R) or restart `make dev` before treating it as a bug.

## Where things live

| What | Where |
|---|---|
| e-Sword X modules (read-only) | `~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/` |
| Journal, one Markdown file per month | the Obsidian vault's `Two-edged Sword/` folder, or `~/Documents/Two-edged Sword/`; set in Settings |
| Settings, bookmarks, highlights, plans, chats | `~/Library/Application Support/Two-edged Sword/*.json` |
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

## The code

| Where | What |
|---|---|
| `src/` | The screens (`Read.tsx`, `Compare.tsx`, `WordStudy.tsx`…), shared state (`state.tsx`), the Rust calls (`api.ts`), e-Sword markup rendering (`esword.tsx`) |
| `src/speech.tsx` | Reading aloud: verse by verse through the native synthesiser, word highlighting, sleep timer |
| `src/Ask.tsx`, `src/assistant.ts` | The Ask panels, and which AI tools and models are available |
| `src-tauri/src/library.rs`, `content.rs` | Finding modules and reading text out of them |
| `src-tauri/src/search.rs`, `index.rs` | Search and its index |
| `src-tauri/src/tts.rs` | Speech through AVSpeechSynthesizer (WebKit's speech API hides downloaded voices) |
| `src-tauri/src/assistant/` | Running Claude Code or Codex for Ask |
| `src-tauri/src/study.rs`, `books.rs` | Writing library material out as files for Ask to search |
| `index.html` | The splash screen, painted before React starts |
| `tools/make_icons.py` | The icon artwork (the sidebar logo and splash reuse the same sword) |

Decisions and known bugs are recorded with sift in `_sift/` (see `AGENTS.md`):
`python3 _sift/bin/sift.py decisions` lists why things are the way they are.

## Licensed Bibles

The NIV, ESV and other copyrighted modules are licensed for personal use. They are never copied
into this repo (`.gitignore` excludes module files), and the app only reads them where e-Sword
keeps them. Screenshots in `docs/images/` show public-domain text only.
