# Development

Tauri 2, with a React and TypeScript frontend (Vite) and a Rust backend. The Rust side reads the
modules (e-Sword X's SQLite formats, read-only), keeps the search index, writes the journal, speaks aloud and
runs the AI tools for Ask. The frontend is everything you see.

## Commands

| Command | What it does |
|---|---|
| `make dev` | Build the help, then run the app with hot reload |
| `make check` | Rust tests (some read the modules on this Mac, and skip without them) and the TypeScript check |
| `make lint` | rustfmt, clippy, Prettier and ESLint; any warning fails it |
| `make fmt` | Format the Rust (rustfmt) and TypeScript and CSS (Prettier) |
| `make app` | Bump the version (1.0.4 → 1.0.5) and build the .app, signed with the identity in `signing.local` if there is one |
| `make install-app` | Build it and replace the copy in /Applications |
| `make dmg` | Pack the built app into `Two-edged-Sword.dmg` for a release |
| `make help` | Build the Help Book from `docs/` |
| `make core` | Build the built-in modules into `src-tauri/modules/` (`make dev` and `make app` build them if they're missing) |
| `make screenshots` | Retake the screenshots in `docs/images/` |
| `make icons` | Redraw the icon artwork and regenerate the icon set |
| `make sign-check` | Show how the installed app is signed |

- If hot reload leaves a screen broken after an edit, reload the window (⌘R) or restart
  `make dev` before treating it as a bug.
- On macOS 27, release builds link with Rust's lld against the macOS 26 SDK, because macOS 27's
  linker sometimes breaks proc-macro builds ("can't find crate"). The Makefile explains.

Every release build gets the next patch version (`tools/bump_version.py`, which keeps
`tauri.conf.json`, `package.json`, `Cargo.toml` and the lock files in step) and one build number,
stamped on the app, its Help book and the binary; Settings shows both. For a minor or major step,
run `python3 tools/bump_version.py 1.1.0` first: `make app` then builds 1.1.1. Commit the bump with
the release.

To publish one: `make install-app`, `make dmg`, commit and push, then
`gh release create v<version> src-tauri/target/release/bundle/dmg/Two-edged-Sword.dmg`. The README's
download link points at the latest release's `Two-edged-Sword.dmg`, so keep that name.
`tools/dmg/make_dmg.py` draws the window's background from `tools/dmg/background.html` (the app's
wordmark and fonts, rendered by WebKit) and has Finder lay out the icons, so the first run asks to
let the terminal control Finder.

## Where things live

| What | Where |
|---|---|
| The app's modules folder (read first; `tools/` writes here) | `~/Library/Application Support/Two-edged Sword/Modules/` (`TES_LIBRARY` overrides it for `tools/`) |
| e-Sword X modules (read-only, if Library › Read e-Sword X is on) | `~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/` |
| Modules built into the app (read last) | `Contents/Resources/modules/` in the app; `src-tauri/modules/` in a debug build |
| Journal, a Markdown file per month | `~/Documents/Two-edged Sword/`, or the folder chosen in Settings |
| Settings, bookmarks, highlights, plans, chats | `~/Library/Application Support/Two-edged Sword/*.json` |
| Search index | `~/Library/Application Support/Two-edged Sword/search-index.sqlite` |
| Library material written out for Ask | `~/Library/Application Support/Two-edged Sword/ask/` and `books/` |
| Differences from the KJV | Shipped: `src-tauri/variances/`. Built on this Mac (read first): `~/Library/Application Support/Two-edged Sword/variances-<module>.json`, with `variances-work/` |
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
Resources; `src-tauri/Info.plist` registers it. The book carries the app's version, which every
release build bumps, because macOS keeps showing a cached book until its version changes. `make install-app` also clears the Help cache (`~/Library/Caches/com.apple.helpd/`) and re-registers the app, since the old book cached at the same path otherwise makes Help show "The selected content is currently unavailable". Under `make dev`, Help opens the pages in the
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
- Developer detail goes here, not in the user guides, and the guides don't link here: Help
  hasn't this page, so `make help` stops on a link to it.

Run `make help` to check the result.

## Screenshots

`make screenshots` retakes every image in `docs/images/`, in both themes;
`python3 tools/screenshots.py read ask --theme dark` retakes some. It needs Pillow, the Xcode
Command Line Tools and Screen Recording permission for the terminal.

- Each scene is in `tools/screenshots/scenes.json`. `src/scene.ts` sets it up, and nothing is
  saved.
- Ask, Worship, Closing verse, Lyrics and Journal shots use fixtures in `tools/screenshots/`, so no
  model or service is asked and your journal stays private. The Lyrics shot is a public-domain hymn
  with the app's icon as its artwork.
- Scenes use public-domain Bibles only. `AGENTS.md` lists the scene fields.
- A scene with `"tray": true` shows the menu-bar window alone (the main window runs hidden to send it what to show), and `width` keeps the image at its own width. `"unread": true` shows today's reading as not yet done, so the menu-bar window shows Start Quiet time.

## Differences from the KJV

The ≠ lists are reviewed one translation at a time. The app ships the ones in `src-tauri/variances/`;
a list in the app's data folder takes their place, so a new or rebuilt one shows at once.
To make one for another translation:

```sh
W=~/Library/Application\ Support/Two-edged\ Sword/variances-work
python3 tools/variances/candidates.py esv --books 40-66 --out "$W/esv-nt"                # New Testament
python3 tools/variances/candidates.py esv --books 1-39 --no-shorter --out "$W/esv-ot"    # Old Testament
python3 tools/variances/candidates.py esv --refs tools/variances/disputed-ot.txt --out "$W/esv-disputed"
python3 tools/variances/candidates.py esv --refs tools/variances/disputed-nt.txt --out "$W/esv-disputed-nt"
# review every batch as tools/variances/review.md says, then for each folder:
python3 tools/variances/build.py esv --work "$W/esv-nt"   # check them and merge into the list
```

`disputed-ot.txt` and `disputed-nt.txt` list often-disputed verses a word count misses (Revelation
22:19, John 7:53–8:11), for `--refs`; drop any the other batches already hold. `build.py` merges
verse by verse, so folders and books can be added one at a time. Candidates ignore note markers,
count "Jehovah" as "LORD", and don't call a verse missing when GNB joins it to the one before.
To ship a list, copy `variances-<module>.json` into `src-tauri/variances/`.

## Building modules

The texts listed under Library › Building modules in the user guide are built by scripts in
`tools/`, numbered like the KJV so they compare beside it. Each writes to the app's modules folder;
then press **Rescan**.

| Script | Builds | Run first | From |
|---|---|---|---|
| `tools/crosswire/build.py` | Syriac Peshitta NT, Murdock, Etheridge, Tyndale, Geneva 1599, Douay-Rheims | | CrossWire |
| `tools/sefaria/build.py` | Targum, Targum Pseudo-Jonathan, the Babylonian Talmud | | Sefaria |
| `tools/vulgate/build.py` | Clementine Vulgate (1592) | | Clementine Vulgate Project |
| `tools/wlc/build.py` | WLC+: the Hebrew Old Testament word by word | | Open Scriptures, STEPBible |
| `tools/ginsburg/build.py` | Ginsburg's Hebrew Bible (1894) | wlc | ahembd/Ginsburg_Hebrew_Bible |
| `tools/ginsburg/plus.py` | Ginsburg+, word by word | ginsburg | WLC+ |
| `tools/beza/build.py` | Beza's Greek New Testament (1598) | | textus-receptus.com; e-Sword's TR+ if you have it |
| `tools/beza/plus.py` | Beza 1598+, word by word | beza | STEPBible |
| `tools/lxx/build.py` | Brenton's Greek Septuagint, with the Apocrypha | | eBible.org |
| `tools/lxx/plus.py` | LXX-Brenton+, word by word | lxx | e-Sword's Greek OT+, STEPBible |
| `tools/latin/build.py` | Latin+ and Vulg-C+, word by word (downloads about 1 GB) | | Stanza, Whitaker's WORDS |
| `tools/targum/build.py` | Targum+ and Ps-Jon+, word by word | sefaria, wlc | WLC+, Jastrow |
| `tools/syriac/build.py` | Peshitta+, word by word | crosswire | ETCBC, SEDRA |
| `tools/rheims/build.py` | The Rheims New Testament (1582) | crosswire | Bible Support file 11077, in ~/Downloads |

Run each with `python3`. Downloads are cached in `~/Library/Caches/Two-edged Sword/`.

All are public domain or openly licensed, except some Sefaria translations, SEDRA's glosses and
Jastrow, which are for non-commercial use. That's fine for personal study.

- `lxx/plus.py` needs e-Sword X's Greek OT+. No openly licensed tagged Septuagint exists.
- `beza/build.py` uses e-Sword X's Greek NT TR+, if you have it, to correct the transcription. Without
  it, the transcription is kept as it is.

## Writing modules

Scripts in `tools/` share `tools/modules.py`:

- `LIBRARY`: the app's modules folder, where every script writes.
- `find(name)`: an input module from the app's folder, e-Sword X's library or the built-in
  modules, in the order the app reads them.
- `module(file, title, abbrev, info)`: a writer for any of the six formats. It yields the new
  module's connection and replaces the old file only when the block finishes.

`tools/core/build.py` builds the built-in modules from public-domain sources only (its docstring
lists them), under the ids the app looks for first: `kjv`, `kjv+`, `strong`, `kjc` and `tsk`.

Nothing from e-Sword X goes into a module that could be shipped: its licence forbids passing its
modules on. Two scripts read e-Sword modules, so what they build is for your own library only:
`lxx/plus.py` (Greek OT+) and `beza/build.py` (TR+, if it's there).

`tools/stepbible.py` reads STEPBible's TAGNT: every Greek NT edition's words with Strong's numbers
and grammar, numbered as the KJV. It gives ἐγώ, σύ and εἰμί their forms' numbers (μου G3450), as
Strong's and the KJV+ do.

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
| `src/awake.ts`, `keep_awake` in `lib.rs` | Keeping the screen awake (a `caffeinate`) while reading aloud, in Quiet time, or on Read or Compare in front |
| `src/Ask.tsx`, `src/assistant.ts` | The Ask panels, and which AI tools and models are available |
| `src-tauri/src/library.rs`, `content.rs` | Finding modules and reading text out of them |
| `src-tauri/src/search.rs`, `index.rs` | Search and its index |
| `src-tauri/src/journal.rs` | The journal's monthly Markdown files |
| `src-tauri/src/store.rs` | The JSON files in Application Support |
| `src-tauri/src/music.rs` | Quiet time's worship songs, played through Music |
| `src/LyricsPage.tsx`, `src/lyrics.ts`, `src/Flames.tsx` | The playing song's words (LRCLIB), artwork (Music, else the iTunes search API) and the flames shown when it has none |
| `src/closing.ts` | Quiet time's closing verse, chosen by the assistant |
| `src/WebPage.tsx` | An online devotional framed in the reading column; `open_web` in `lib.rs` is its own window, and `web_frameable` checks (with curl) whether a site added by the user can be framed |
| `src/tray.tsx`, `src/TrayWindow.tsx`, `src-tauri/src/tray.rs` | The menu-bar window (what it shows comes from the main window) and the daily reminder |
| `src-tauri/src/login_item.rs`, `login_launch.rs` | Open at Login |
| `src-tauri/src/tts.rs` | Speech through AVSpeechSynthesizer (WebKit's speech API hides downloaded voices) |
| `src-tauri/src/help.rs`, `tools/helpbook.py` | The Help menu and the Help Book |
| `src-tauri/src/assistant/` | Running Claude Code, Codex, Antigravity or Copilot for Ask |
| `src-tauri/src/study.rs`, `books.rs` | Writing library material out as files for Ask to search |
| `index.html` | The splash screen, painted before React starts |
| `src/scene.ts`, `tools/screenshots.py` | Screenshot mode and the script that drives it |
| `src/variances.tsx`, `src/KjvHistory.tsx` | The ≠ marks and their popup, and the KJV History page |
| `tools/variances/` | Building each translation's differences from the KJV |
| `tools/sefaria/`, `tools/vulgate/`, `tools/crosswire/` and the rest | Building modules from free sources ([Building modules](#building-modules)) |
| `tools/make_icons.py` | The icon artwork |

Every source file starts with the copyright notice from the About box and `SPDX-License-Identifier: GPL-3.0-or-later`; add both to a new file.
Formatting is `src-tauri/rustfmt.toml` and `.prettierrc.json` (140 columns); lint rules are clippy's defaults and `eslint.config.js`.
Run `make lint` before committing.

Design decisions and known bugs are logged in `_sift/`; `python3 _sift/bin/sift.py decisions`
lists them.

## Licensed Bibles

The NIV, ESV and other copyrighted modules are licensed for personal use. They are never copied
into this repo (`.gitignore` excludes module files), and the app only reads them where e-Sword
keeps them. Screenshots show public-domain text only.
