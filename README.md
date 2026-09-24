# Two-edged Sword

A personal Bible study app for macOS that reads the Bibles, commentaries, dictionaries,
lexicons and maps you already have in e-Sword X.

It never changes e-Sword's files: every module is opened read-only. What you make in the app
(journal, bookmarks, highlights, plans, chats) is kept separately.

Built with Tauri 2, React and Rust.

## Screens

⌘1 to ⌘7 switch between them, ⌘K goes to any reference or command, ⌘, opens Settings.

- **Read.** The chapter, one verse per line or as paragraphs, beside a study pane that follows
  the selected verse. The pane has commentary (every commentary that covers the verse, in your
  order), Treasury of Scripture Knowledge cross-references with previews, the dictionaries,
  your notes on the verse, maps for the book, and Ask Claude. Click any word to look it up:
  its Greek or Hebrew (from the KJV+ when the Bible has no Strong's numbers of its own), how
  the KJV translates it, dictionary articles, and the commentaries on that verse. Select verses
  to highlight, bookmark, note, compare, listen or copy. ⌘. is focus mode, ← and → turn the page.
- **Listen.** Reads the chapter aloud with any macOS voice, highlighting each word, at 0.5× to
  2×, with a sleep timer, carrying on into the next chapter. Space plays and pauses.
- **Compare.** Any number of translations side by side, verse by verse, with the wording that
  differs highlighted.
- **Search.** The Bible, every commentary and dictionary, and your journal at once. A Strong's
  number such as `G509` finds every verse that uses the word, however it is translated.
- **Word Study.** A Strong's entry, how often and where it is used, every verse in context,
  related words and the articles about it in your library.
- **Journal.** Dated entries with headings, bold and italic, lists, quotes and verses inserted
  from the Bible, linked to the verses they are about and shown beside them in Read.
- **Plans.** Reading plans: the Bible in a year, the New Testament in 90 days, the Gospels,
  F. B. Meyer's daily readings, your own, or a Psalm, a Proverb and one more chapter a day.
- **Library.** Every module, which Bibles appear in the picker, and the order of commentaries
  and dictionaries.

## Where things live

| What | Where |
|---|---|
| e-Sword X modules (read-only) | `~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/` |
| Journal, one Markdown file per month | your Obsidian vault's `Two-edged Sword/` folder, or `~/Documents/Two-edged Sword/`; change it in Settings |
| Settings, bookmarks, highlights, plans, chats | `~/Library/Application Support/Two-edged Sword/*.json` |
| Search index (rebuilt on its own when modules change) | `~/Library/Application Support/Two-edged Sword/search-index.sqlite` |

Ask Claude runs the Claude Code CLI installed on this Mac (`claude -p`, no tools), so it uses
your existing sign-in. The verses, and optionally what your commentaries say about them, go
with each question.

## Commands

| Command | What it does |
|---|---|
| `make dev` | The app with hot reload |
| `make check` | Rust tests (including ones against your e-Sword library) and the TypeScript check |
| `make app` | Build the .app |
| `make install-app` | Build it and replace the copy in /Applications |
| `make icons` | Redraw the icon artwork (`tools/make_icons.py`) and regenerate the icon set |

## Notes

**Licensed Bibles.** The NIV, ESV and other copyrighted modules are licensed for personal use.
They are never copied into this repo (`.gitignore` excludes module files) and the app only
reads them where e-Sword keeps them.

**Signing and Full Disk Access.** The modules live inside e-Sword's own container, so macOS asks
"would like to access data from other apps". That answer is remembered only for the exact build,
so it comes back after every rebuild. Give the app Full Disk Access once (System Settings ›
Privacy & Security › Full Disk Access) and it stops: that grant is tied to the signing
certificate, so sign builds with a stable self-signed one. Copy `signing.local.example` to
`signing.local` (untracked) and name the certificate there.

**Build times.** `src-tauri/Cargo.toml` keeps the lib `rlib`-only, uses thin LTO with parallel
codegen units for release builds, drops debug info for dependencies in dev builds, and
optimises SQLite even in dev builds because it does all the searching.
