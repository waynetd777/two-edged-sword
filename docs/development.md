# Development

Tauri 2, with a React and TypeScript frontend (Vite) and a Rust backend. The Rust side reads the
e-Sword modules (SQLite, read-only), keeps the search index, writes the journal, speaks aloud and
runs the AI tools for Ask. The frontend is everything you see.

## Commands

| Command | What it does |
|---|---|
| `make dev` | Build the help, then run the app with hot reload |
| `make check` | Rust tests (some read your e-Sword library) and the TypeScript check |
| `make app` | Build the .app, signed with the identity in `signing.local` if there is one |
| `make install-app` | Build it and replace the copy in /Applications |
| `make help` | Build the Help Book from `docs/` |
| `make screenshots` | Retake the screenshots in `docs/images/` |
| `make icons` | Redraw the icon artwork and regenerate the icon set |
| `make sign-check` | Show how the installed app is signed |

- If hot reload leaves a screen broken after an edit, reload the window (⌘R) or restart
  `make dev` before treating it as a bug.
- On macOS 27, release builds link with Rust's lld against the macOS 26 SDK, because macOS 27's
  linker sometimes breaks proc-macro builds ("can't find crate"). The Makefile explains.

## Where things live

| What | Where |
|---|---|
| e-Sword X modules (read-only) | `~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/` |
| Journal, a Markdown file per month | `~/Library/CloudStorage/OneDrive-Personal/Notes/Two-edged Sword/` if that exists, else `~/Documents/Two-edged Sword/` |
| Settings, bookmarks, highlights, plans, chats | `~/Library/Application Support/Two-edged Sword/*.json` |
| Search index | `~/Library/Application Support/Two-edged Sword/search-index.sqlite` |
| Library material written out for Ask | `~/Library/Application Support/Two-edged Sword/ask/` and `books/` |
| Differences from the KJV | `~/Library/Application Support/Two-edged Sword/variances-<module>.json`, `variances-work/` |
| Downloads cached by `tools/` | `~/Library/Caches/Two-edged Sword/` |

## Signing and Full Disk Access

Unsigned builds make macOS ask for e-Sword's data after every rebuild. To stop that:

1. Create a self-signed certificate (`signing.local.example` says how).
2. Copy `signing.local.example` to `signing.local` (untracked) and put the certificate's name in
   it.
3. Give the installed app Full Disk Access once (System Settings › Privacy & Security).

## Open at Login

Works only in the app from `make install-app`, not under `make dev`. It registers the installed
bundle as a login item, which survives rebuilds while the bundle identifier stays
`com.wayned.two-edged-sword`.

## Help

The app's Help menu opens an Apple Help Book built from the user guides in `docs/` (all but this
one). `tools/helpbook.py` converts them with pandoc, a page per `##` section, styled like the app,
with search indexes from `hiutil`. The release build runs it and copies the book into the app's
Resources; `src-tauri/Info.plist` registers it. Under `make dev`, Help opens the pages in the
browser instead.

Ask gets the same guides: `src-tauri/src/help.rs` builds them into the app, and before each
question writes them to `help/` in the chat's folder, where the assistant searches them when a
question is about the app.

## Writing the docs

Every new or changed feature updates its guide in `docs/` in the same change, and so the help.
Keep them short:

- Only what someone needs to use the feature: what it does, how to do it, the keys.
- Short sentences in plain words. One idea per sentence or bullet.
- A `##` section per topic: each becomes a help page, and its first sentence is the page's
  summary in Help search. `###` headings split up anything longer.
- Lists and tables rather than paragraphs; no edge cases, internals or history.
- Developer detail goes here, not in the user guides.

Run `make help` to check the result.

## Screenshots

`make screenshots` retakes every image in `docs/images/`, in both themes;
`python3 tools/screenshots.py read ask --theme dark` retakes some. It needs Pillow, the Xcode
Command Line Tools and Screen Recording permission for the terminal.

- Each scene is in `tools/screenshots/scenes.json`. `src/scene.ts` sets it up, and nothing is
  saved.
- Ask, Worship and Journal shots use fixtures in `tools/screenshots/`, so no model is asked and
  your journal stays private.
- Scenes use public-domain Bibles only. `AGENTS.md` lists the scene fields.
- The menu-bar menu can't be opened by the script, so `docs/images/menu-bar.png` is taken by hand
  (⌘⇧4 with the menu open).

## Differences from the KJV

The ≠ lists are reviewed one translation at a time and kept with the app's data, not in the repo.
To make one for another translation:

```sh
python3 tools/variances/candidates.py esv --books 40-66   # verses that may differ
# review the batches as tools/variances/review.md says
python3 tools/variances/build.py esv                       # check them and write the list
```

`tools/variances/disputed-ot.txt` lists often-disputed Old Testament verses, for
`candidates.py --refs`. `build.py` merges verse by verse, so books can be added a batch at a time.

## Reference book format

A `.refi` is a SQLite file with two tables:

- `Details (Title, Abbreviation, Information, Version)`: one row, Version 4.
- `Reference (Chapter, Content)`: a row per chapter in reading order, with an index on `Chapter`.
  Chapter names must be unique.

Content is HTML: paragraphs, bold and italics, tables, `<ref>Rom 8:28</ref>` for a Bible
reference, and images inline as `data:` URLs.

## The code

| Where | What |
|---|---|
| `src/` | The screens (`Read.tsx`, `Compare.tsx`, `WordStudy.tsx`, `QuietTime.tsx`, `Journal.tsx`…), shared state (`state.tsx`), the Rust calls (`api.ts`), e-Sword markup rendering (`esword.tsx`) |
| `src/speech.tsx` | Reading aloud: word highlighting, sleep timer |
| `src/Ask.tsx`, `src/assistant.ts` | The Ask panels, and which AI tools and models are available |
| `src-tauri/src/library.rs`, `content.rs` | Finding modules and reading text out of them |
| `src-tauri/src/search.rs`, `index.rs` | Search and its index |
| `src-tauri/src/journal.rs` | The journal's monthly Markdown files |
| `src-tauri/src/store.rs` | The JSON files in Application Support |
| `src-tauri/src/music.rs` | Quiet time's worship songs, played through Music |
| `src/tray.tsx`, `src-tauri/src/tray.rs` | The menu-bar menu and the daily reminder |
| `src-tauri/src/login_item.rs`, `login_launch.rs` | Open at Login |
| `src-tauri/src/tts.rs` | Speech through AVSpeechSynthesizer (WebKit's speech API hides downloaded voices) |
| `src-tauri/src/help.rs`, `tools/helpbook.py` | The Help menu and the Help Book |
| `src-tauri/src/assistant/` | Running Claude Code, Codex, Antigravity or Copilot for Ask |
| `src-tauri/src/study.rs`, `books.rs` | Writing library material out as files for Ask to search |
| `index.html` | The splash screen, painted before React starts |
| `src/scene.ts`, `tools/screenshots.py` | Screenshot mode and the script that drives it |
| `src/variances.tsx`, `src/KjvHistory.tsx` | The ≠ marks and their popup, and the KJV History page |
| `tools/variances/` | Building each translation's differences from the KJV |
| `tools/sefaria/`, `tools/vulgate/`, `tools/crosswire/` and the rest | Building modules from free sources ([Library](library.md#building-modules)) |
| `tools/make_icons.py` | The icon artwork |

Design decisions and known bugs are logged in `_sift/`; `python3 _sift/bin/sift.py decisions`
lists them.

## Licensed Bibles

The NIV, ESV and other copyrighted modules are licensed for personal use. They are never copied
into this repo (`.gitignore` excludes module files), and the app only reads them where e-Sword
keeps them. Screenshots show public-domain text only.
