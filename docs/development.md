# Development

The app is built with Tauri 2: a React and TypeScript frontend, built by Vite, and a Rust backend.
The Rust side reads the modules (e-Sword X's SQLite formats, read-only), keeps the search index,
writes the journal, reads aloud and runs the AI tools for Ask. The frontend draws every screen.

**Contents:** [Commands](#commands) · [Security checks](#security-checks) · [Where things live](#where-things-live) · [Signing and Full Disk Access](#signing-and-full-disk-access) · [Open at Login](#open-at-login) · [Help](#help) · [Writing the docs](#writing-the-docs) · [Screenshots](#screenshots) · [The product page](#the-product-page) · [Differences from the KJV](#differences-from-the-kjv) · [Building modules](#building-modules) · [Writing modules](#writing-modules) · [Reference book format](#reference-book-format) · [The code](#the-code) · [Licensed Bibles](#licensed-bibles)

## Commands

| Command | What it does |
|---|---|
| `make dev` | Run the app with hot reload |
| `make check` | Run the Rust tests and the TypeScript check. Some tests read the modules on this Mac and are skipped where they're missing |
| `make lint` | Run rustfmt, clippy, Prettier and ESLint; any warning fails it |
| `make fmt` | Format the Rust (rustfmt), and the TypeScript and CSS (Prettier) |
| `make app` | Build the .app, signed with the identity in `signing.local` if there is one. If the current version has been released, it first bumps it (1.0.4 → 1.0.5) |
| `make install-app` | Build the app and replace the copy in /Applications |
| `make dmg` | Pack the built app into `Two-edged-Sword.dmg` for a release |
| `make release NOTES="…"` | Publish a release: bump, build, DMG, commit, push, GitHub release, install (`tools/release.py`) |
| `make help` | Check the help: every link in the guides, and each screen's section, must point at a heading that exists |
| `make core` | Build the built-in modules into `src-tauri/modules/` (`make dev` and `make app` build any that are missing) |
| `make screenshots` | Retake the screenshots in `docs/images/` |
| `make site` | Remake the product page's WebP pictures from the dark screenshots |
| `make og` | Render the product page's share card, `site/img/og.png` |
| `make visions` | Open `visions.html` in Safari to flick through the pictures behind a song's words, drawn as on the Lyrics page. ← and → step through them; other keys change the theme, words, verses, colours and beat; a box finds one by name or theme. `make visions v=eagle` starts at one picture; `?theme=light` in the address shows it on paper |
| `make icons` | Redraw the icon artwork and regenerate the icon set |
| `make sign-check` | Show how the installed app is signed |

- If hot reload leaves a screen broken after an edit, reload the window (⌘R) or restart `make dev`
  before treating it as a bug.
- The app also builds on Windows, so far without screenshot mode:
  - **Build**: needs Rust, Node, Python and Visual Studio Build Tools with the C++ workload.
    `npx tauri build --debug --no-bundle` makes `src-tauri/target/debug/TwoEdgedSword.exe`.
    `npx tauri build` makes the installer,
    `src-tauri/target/release/bundle/nsis/Two-edged Sword_<version>_x64-setup.exe`. It installs
    per user, without admin rights, with the built-in modules beside the .exe.
  - **Uninstall**: the uninstaller's "Delete the application data" option misses
    `%APPDATA%\Two-edged Sword`, so `src-tauri/windows/hooks.nsh` clears it.
  - **Settings and folders**: `tauri.windows.conf.json` holds Windows' build settings. Data goes
    in `%APPDATA%\Two-edged Sword`, and the module tools cache downloads in
    `%LOCALAPPDATA%\Two-edged Sword\Caches`. A panic goes to `crash.log` in the data folder, as
    the app has no console.
  - **macOS-only code**: the AppKit modules are `#[cfg(target_os = "macos")]`, and
    `src-tauri/src/other.rs` stands in for them elsewhere. Any new AppKit call or macOS-only
    Tauri API needs the same `cfg`.
  - **Modules**: e-Sword for Windows' modules can't be read, as their text is encrypted. e-Sword
    X's modules work, copied into the app's `Modules` folder.
  - **Shortcuts**: ⌘ on macOS is Ctrl on Windows (`cmdKey` in `src/keys.ts`). `shortcut()` writes
    every shortcut hint, the help's included, in Windows' terms there.
  - **Media controls and Open at Login**: `media_win.rs`, and the Run key in `login_win.rs`.
  - **Reading aloud**: the web view's speech (`src/webSpeech.ts`), which sends the same "tts"
    events as `tts.rs`.
  - **Songs**: files in the Music folder (`music_files.rs`), played in the page
    (`src/localMusic.ts`), which answers as `music.rs` does.
  - **Ask**: finds the AI tools' command-line programs in their installers' folders
    (`.local\bin`, `%LOCALAPPDATA%\<name>\bin`), in npm's packages, and with `where`. From npm it
    runs the program itself, as an npm `.cmd` shim can't pass a prompt's newlines. It runs them
    with no console window (`process::no_window`) and ends them with `taskkill /T`.
  - **Spelling**: Windows' spell checker, with Harper for grammar (`spell_win.rs`, which shares
    `kjv_words.rs` with `spell.rs`).
  - **Web view**: Edge's engine draws the page, not WebKit. Its `scrollTo` returns a promise, so
    an effect must never return a call's result. Its `execCommand` styles the whole of any
    element it covers, so `styles.css` matches the highlighter's paint on any element, not only
    on spans.
- `cargo test --lib` in `src-tauri` runs the Rust tests on Windows, except the spelling ones.
  `.github/workflows/windows-tests.yml` runs them, and the TypeScript check, on every push to
  `main` that changes the code.
- On macOS 27, release builds link with Rust's lld against the macOS 26 SDK (when it's installed),
  because macOS 27's linker sometimes breaks proc-macro builds ("can't find crate"). The comment in
  the Makefile explains.

Once the current version is released (tagged `v<version>` on GitHub), the next release build moves
to the next patch version. Until then, local builds share a version. `tools/bump_version.py` does
the bump, and keeps `tauri.conf.json`, `package.json`, `Cargo.toml` and the lock files in step.
Every build also gets its own build number, stamped on the app and the binary; Settings shows both.
For a minor or major step, run `python3 tools/bump_version.py 1.1.0` first.

To publish a release, run `make release NOTES="What's new"` (`tools/release.py`). It refuses to
start without notes or with uncommitted changes. Then it:

1. bumps the version and builds the app;
2. makes the DMG and the update files (the notes go in the update offer);
3. commits the bump as `Two-edged Sword <version>` and pushes;
4. creates the GitHub release with `Two-edged-Sword.dmg`, `Two-edged-Sword.app.tar.gz` and
   `latest.json`;
5. installs the app, and opens it again if it was running.

`INSTALL=0` skips the install and `DRY_RUN=1` prints the steps. After a failure, run it again: the
unreleased version is kept. The README's download link points at the latest release's
`Two-edged-Sword.dmg`, so keep that name.

`make dmg` also runs `tools/update_files.py`, which packs the app as `Two-edged-Sword.app.tar.gz`,
signs it and writes `latest.json`. Installed copies read
`releases/latest/download/latest.json` (`src-tauri/src/updates.rs`, `plugins.updater` in
`tauri.conf.json`) and only install a package signed with the key in
`~/.tauri/waynetd777-updater.key`. Keep that key backed up: without it no installed copy will
accept another update. Updates are checked in release builds only, never in screenshot mode.
`tools/dmg/make_dmg.py` draws the DMG window's background from `tools/dmg/background.html` (in the
product page's look, with `site/`'s fonts and icon, rendered by WebKit) and has Finder lay out
the icons. Its first run therefore asks to let the terminal control Finder.

`.github/workflows/windows-release.yml` adds the Windows installer to each release when it's
published:

- It builds the installer from the release's commit. `tools/update_windows.py` then signs it,
  uploads it as `Two-edged-Sword_x64-setup.exe` with its `.sig`, and adds `windows-x86_64` to the
  release's `latest.json`.
- It signs with the repository secret `TAURI_SIGNING_PRIVATE_KEY` (the updater key's contents),
  plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one.
- It builds nothing in `tools/`. `make release` zips the Mac's built-in modules as
  `Two-edged-Sword-modules.zip` on the release, and the job unpacks that into
  `src-tauri/modules`, so both installers ship the same modules.
- It starts from compiled crates cached by `.github/workflows/windows-cache.yml`, which does the
  same build on `main` after each push that changes the code. (A cache saved on a release's tag
  could be used by that tag alone.) That build skips the modules (`tauri.no-modules.conf.json`).
- To add the installer to a release by hand, use Actions › Windows release › Run workflow, with
  the tag. The release needs its modules zip.

Windows copies install an update quietly, with a progress window
(`plugins.updater.windows.installMode` in `tauri.windows.conf.json`). The updater leaves each
installer in a `Two-edged Sword-<version>-updater-…` folder in Temp; the app removes those when it
starts (`remove_old_installers` in `updates.rs`).

## Security checks

GitHub runs these; alerts are under the repository's Security tab:

- Dependabot alerts, with pull requests that fix a vulnerable dependency.
- Dependabot version updates once a month: one grouped pull request each for npm, Cargo and
  Actions (`.github/dependabot.yml`).
- Secret scanning with push protection.
- Private vulnerability reporting.
- CodeQL (`.github/workflows/codeql.yml`) on the Rust, TypeScript, Python and workflows, on each
  push and weekly. GitHub's default CodeQL setup can't scan Rust, so it's off and this workflow
  replaces it.

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
| Differences from the KJV | Shipped: `src-tauri/variances/`. Built on this Mac (read first): `~/Library/Application Support/Two-edged Sword/variances-<module>.json`, with working files in `variances-work/` |
| Downloads cached by `tools/` | `~/Library/Caches/Two-edged Sword/` |

## Signing and Full Disk Access

Unsigned builds make macOS ask for access to e-Sword's data after every rebuild. To stop that:

1. Create a self-signed certificate (`signing.local.example` says how).
2. Copy `signing.local.example` to `signing.local` (untracked) and put the certificate's name in
   it.
3. Give the installed app Full Disk Access once (System Settings › Privacy & Security).

## Open at Login

Works only in the app installed by `make install-app`, not under `make dev`. It registers the
installed bundle as a login item. The login item survives rebuilds as long as the bundle
identifier stays `com.wayned.two-edged-sword`.

## Help

The help is a drawer on the right of the window (`src/Help.tsx`). It shows the user guides in
`docs/`, all but this one. Three things open it: `?`, the top bar's ? button, and Help ›
Two-edged Sword Help (⌘?, which `src-tauri/src/help.rs` turns into a `help` event).
`src/guides.ts` imports the guides at build time, drops their screenshots and breadcrumbs, and
splits each into its `##` sections. Its `SCREEN_HELP` says which section each screen opens on.
Links between guides stay in the drawer. `make help` (`tools/helpcheck.py`) checks that every link
and screen points at a heading that exists.

- **Getting started** (`docs/getting-started.md`) is walk-throughs. Each `##` is a walk-through
  and each `###` under it a step, shown one at a time with Back, Next and Done
  (`settings.guidesDone`). The welcome dialog (`src/Welcome.tsx`) offers it when the app opens,
  until `settings.offerGuide` is off.
- **Mac or Windows only**: a guide marks parts with `<!-- mac -->…<!-- /mac -->` and
  `<!-- windows -->…<!-- /windows -->`, and the help drops the other platform's (`forPlatform`).
  GitHub shows both, so words that join the two there go in `<!-- github -->…<!-- /github -->`,
  which the help never shows.
- **Links into the app**: `[label](app:library)` opens a screen and keeps the help open.
  `app:library#commentaries` also scrolls to the element marked `data-help="commentaries"` and
  flashes it (Settings marks each section with its title's slug). `app:open/john-3`,
  `app:palette`, `app:modules` and `app:rescan` do what they say (`runAction` in `src/Help.tsx`).
  These links show a ↗; plain links open more help.
- **Automatic links**: the help links these names without any markup (`PLACES` in
  `src/guides.ts`): a Settings section ("Settings › Listening"), Settings, the Library, Quiet
  time, the Journal, Word Study and KJV History. It skips them in bold, headings, links and code.
- The drawer has its own back and forward, and one section open at a time.

Ask gets the same guides. `src-tauri/src/help.rs` builds them into the app and, before each
question, writes them to `help/` in the chat's folder. The assistant searches them there when a
question is about the app.

## Writing the docs

Every new or changed feature updates its guide in `docs/` in the same change, which updates the
help too. Keep the guides short:

- Only what someone needs to use the feature: what it does, how to do it, the keys.
- Short sentences in plain words. One idea per sentence or bullet.
- A `##` section per topic: each is a folding section in the help, found by the help's search.
  `###` headings split up anything longer.
- Lists and tables rather than paragraphs; no edge cases, internals or history.
- Developer detail goes here, not in the user guides. The guides don't link here: this page isn't
  in the help, so `make help` stops on a link to it.
- Write for both platforms, and mark what only one has (`<!-- mac -->`, `<!-- windows -->`, under
  [Help](#help)). Name a place in the app plainly ("Settings › Bibles", "the Library") and the help
  links it; use an `app:` link for a step's action ("[Open John 3](app:open/john-3)").
- A new feature gets a step in its Getting started walk-through too.

Run `make help` to check the result.

## Screenshots

`make screenshots` retakes every image in `docs/images/`, in both themes. To retake only some, name
their scenes: `python3 tools/screenshots.py read ask --theme dark`. `-j N` sets how many copies of
the app run side by side (4 by default). It needs Pillow.

- The window is invisible, ignores clicks, stays out of the Dock and never takes the focus, so
  nothing flashes on screen. After `TES_SNAPSHOT_AFTER` seconds the app saves its webview's
  snapshot to the file named in `TES_SNAPSHOT`. The script draws the window's buttons and rounded
  corners back on, and retakes any shot that comes out blank.
- Each scene is in `tools/screenshots/scenes.json`. `src/scene.ts` sets it up, and nothing is
  saved.
- The Ask, Worship, Songs for the chapter, Closing verse, Lyrics and Journal shots use fixtures in
  `tools/screenshots/`. No model or service is asked, and your journal stays private. The Lyrics
  shot is a public-domain hymn with the app's icon as its artwork.
- Scenes use public-domain Bibles only. `AGENTS.md` lists the scene fields.
- A scene with `"frames": N` and `"every": seconds` is animated. The app takes N snapshots, each
  once the one before is saved and at least `every` seconds after it (`TES_SNAPSHOT_FRAMES`,
  `TES_SNAPSHOT_EVERY`). They're taken at half size (`TES_SNAPSHOT_WIDTH`), which is quicker. The
  script makes them a looping WebP, each frame shown for as long as it was on screen. The unseen
  window gives about 7 frames a second at most. `"darkOnly": true` shoots a scene in dark only.
- With `"step": seconds` in place of `"every"`, the page's clock stands still and is moved on that
  much before each frame (`src/sceneClock.ts`, `TES_SNAPSHOT_STEP`). The frames are then evenly
  spaced however slowly they're taken. The script makes them a looping MP4 (needs `ffmpeg`, `brew
  install ffmpeg`) and saves the middle frame as a PNG for the guides. The product page plays the
  MP4. The song's picture waits for the first frame; `songVisionDur` sets how many seconds it
  takes.
- A scene with `"tray": true` shows the menu-bar window alone; the main window runs hidden to send
  it what to show. Its `width` saves the image at that many pixels wide instead of 1400, the
  window's natural size.
- `"unread": true` shows today's reading as not yet done, so the menu-bar window shows Start Quiet
  time.
- The website tutorials' pictures are scenes in `tools/screenshots/tutorials/` (one file a
  tutorial; their fixtures are in `tools/screenshots/tut-fixtures/`). `python3 tools/screenshots.py
  --tutorials` takes them all, and naming one takes it alone; `make screenshots` leaves them out.
  - They run on a demo home folder (`HOME` set to `tools/screenshots/out/home`, written by
    `demo_home.py`): its invented highlights, bookmarks, journal and reading plan, and only the
    built-in modules, so nothing of yours shows. Its search index is kept between runs; the first
    run builds it, which takes a few minutes.
  - They're saved to `site/img/tut/<name>.webp` in dark only, at twice the window's width in points
    (2880), whatever the display's scale. A `"crop"` is given at 1400 wide and scaled.
  - A `"card": true` scene (a card on the tutorials' index and the home page) also gets
    `<name>@1x.webp`, cut at the window's own size in points (411 by 257 for a 400 by 250 crop), for
    `srcset`. The card shows it at that size, so it's sharp on a 1x screen too.

## Printing to PDF

The journal's PDF is the main window's page printed to a file with no print panel: WebKit's
`NSPrintOperation` on a Mac, WebView2's `PrintToPdf` on Windows (`pdf.rs`). It prints with no
margins; the page lays out each sheet itself.

- **Pages are made in the app.** WebKit's print cuts every page-height, through lines and pictures,
  and ignores `break-inside` and `break-after: avoid`. CSS columns don't help: they lay out
  differently when printing. So `paginate` in `journalDoc.ts` lays the document out at the text
  width, cuts each page after its last whole line (`findBreak`), and gives each its own `.jpage`
  with a forced break after it, which WebKit keeps.
- **What it keeps together**: `WHOLE` is never split, `WITH_NEXT` never ends a page, `NEED` is the
  room something needs to start on a page, and a paragraph leaves at least two lines either side.
- **Each page is measured as cut** (a cut verse box keeps its padding) and cut again shorter if it's
  too tall. 8 points are spare at the foot: printed lines sit up to 3 points lower than on screen.
- **Margins and footer** are inside each `.jpage`, so the cover's band runs to the paper's edges
  (`--pm`). The paper is the user's (`pdf_paper_size`: A4, or Letter).
- **Faces and colours are fixed** (`--p-*` in `.jdoc`): the reading-font setting changes `--serif`
  and `--display`, and the theme the colours.
- **Checking a change**: print through WebKit, not Chrome, which paginates properly and hides these
  problems. A small Swift program that loads the page in a `WKWebView` and runs the same
  `NSPrintOperation` does it without the app.

## The product page

`site/` is the app's web page, https://two-edged-sword.davies.co.za/: plain HTML, CSS and JavaScript
with no build step. `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to
`main` that changes `site/`. `site/.nojekyll` keeps Pages from running Jekyll over it, and
`site/sitemap.xml` is the sitemap given to Google Search Console.

- Its pictures are WebP copies of the dark screenshots, in `site/img/`. After `make screenshots`,
  `make site` remakes them (it needs `cwebp`, from `brew install webp`).
- `site/tutorials/` has the tutorials: an index and five pages (Reading, Teaching, Digging deeper,
  Devotional, Your library), each following one invented story (the Thursday group at Hillside
  Church, Romans 8, and Anna's question about Colossians 1:14) with a picture for every step. They
  share `landing.css` with the home page, plus `tutorials.css` and `tutorials.js`.
  - A Mac / Windows PC switch at the top swaps every key (`data-win="Ctrl+K"` on a `kbd`) and the
    `.os-pane` blocks, and is remembered per browser.
  - Ask is shown as You ask, It reads and The answer (`.ask`), so it's clear what you type and what
    the assistant does.
  - Their pictures are the tutorial scenes (see Screenshots). A change to a screen a tutorial shows
    should retake its pictures and update its steps in the same change.
  - They give glory to God and speak of Jesus as Lord and Saviour and of the Holy Spirit as
    Comforter, as the story allows; invented names only.
- `img/og.png` is the share card, 1200×630, rendered from `tools/og.html` with headless Chrome by
  `make og`.
- Each zoomable screenshot is a `.tour`. Each `li` step under it carries either a spot to centre on
  (`data-x` and `data-y` in percent of the picture, `data-s` the scale) or a picture to show
  (`data-img`), and `data-caption`, the line under it. `landing.js` plays a tour while it's on
  screen.
- To view the page locally, run `python3 -m http.server 8787` in `site/`, then open
  http://localhost:8787/.
- The fonts are served from `site/fonts/`, so the page paints in them at once: Atkinson Hyperlegible
  Next, and EB Garamond for the Greek. Both are OFL and copied from `node_modules`.
- The website's address is in `src/website.ts` and `src-tauri/src/website.rs`, for Settings, the
  Help menu and the About panel. A test in `website.rs` keeps the two the same.

## Differences from the KJV

The ≠ lists are reviewed one translation at a time. The app ships the ones in
`src-tauri/variances/`. A list in the app's data folder takes the shipped one's place, so a new or
rebuilt list shows at once. To make one for another translation:

```sh
W=~/Library/Application\ Support/Two-edged\ Sword/variances-work
python3 tools/variances/candidates.py esv --books 40-66 --out "$W/esv-nt"                # New Testament
python3 tools/variances/candidates.py esv --books 1-39 --no-shorter --out "$W/esv-ot"    # Old Testament
python3 tools/variances/candidates.py esv --refs tools/variances/disputed-ot.txt --out "$W/esv-disputed"
python3 tools/variances/candidates.py esv --refs tools/variances/disputed-nt.txt --out "$W/esv-disputed-nt"
# review every batch as tools/variances/review.md says, then for each folder:
python3 tools/variances/build.py esv --work "$W/esv-nt"   # check them and merge into the list
```

- `disputed-ot.txt` and `disputed-nt.txt` list often-disputed verses that a word count misses
  (Revelation 22:19, John 7:53–8:11), for `--refs`. Drop any the other batches already hold.
- `build.py` merges verse by verse, so folders and books can be added one at a time.
- `candidates.py` reads each Bible as the app does: your own copy, else the built-in one, else
  e-Sword X's. When it compares, it:
  - ignores note markers;
  - counts "Jehovah" (and "Jah") as the KJV's LORD or GOD;
  - counts Murdock's and Etheridge's Aramaic forms (Aloha, Jeshu, Meshiha, Spirit of Holiness) as
    their English;
  - doesn't call a verse missing when GNB joins it to the one before.
- `--longer` also picks verses much longer than the KJV's (the Septuagint's additions).
- `--brackets` counts bracketed text as left out. Darby brackets doubtful text, but YLT's brackets
  are supplied words.
- `candidates.py` stops if a folder holds reviews that `build.py` hasn't merged yet;
  `--discard-reviews` drops them.

To ship a list, copy `variances-<module>.json` into `src-tauri/variances/`.

## Building modules

The texts listed under Library › Building modules in the user guide are built by scripts in
`tools/`. They're numbered like the KJV, so they compare beside it. Each script writes to the app's
modules folder; then press **Rescan**. "Run first" names the scripts whose output a script reads.

| Script | Builds | Run first | From |
|---|---|---|---|
| `tools/crosswire/build.py` | Syriac Peshitta NT, Murdock, Etheridge, Tyndale, Geneva 1599, Douay-Rheims; Stephanus' TR (1550) and the MKJV 1993 (`mkjv1993.bbli`: CrossWire's 1.4, from the Wayback Machine, as its 2.0 is another work), not built in | | CrossWire |
| `tools/crosswire/trplus.py` | TR 1550+, Stephanus' TR word by word, not built in | | CrossWire, STEPBible |
| `tools/sefaria/build.py` | Targum, Targum Pseudo-Jonathan, the Babylonian Talmud (Sefaria's merged text, all versions) | | Sefaria |
| `tools/vulgate/build.py` | Clementine Vulgate (1592) | | Clementine Vulgate Project |
| `tools/wlc/build.py` | WLC+: the Hebrew Old Testament word by word; WLC, the same as running Hebrew, not built in | | Open Scriptures, STEPBible |
| `tools/ginsburg/build.py` | Ginsburg's Hebrew Bible (1894) | wlc | ahembd/Ginsburg_Hebrew_Bible |
| `tools/ginsburg/plus.py` | Ginsburg+, word by word | ginsburg | WLC+ |
| `tools/beza/build.py` | Beza's Greek New Testament (1598) | | textus-receptus.com; e-Sword's TR+ if you have it |
| `tools/beza/plus.py` | Beza 1598+, word by word | beza | STEPBible |
| `tools/lxx/build.py` | Brenton's Greek Septuagint, with the Apocrypha | | eBible.org |
| `tools/lxx/plus.py` | LXX-Brenton+, word by word | lxx | GLAUx, STEPBible |
| `tools/latin/clementine.py` | Vulg-C+, word by word, with Strong's numbers (needs `pip install stanza==1.14.0`) | vulgate, wlc, lxx/plus.py | Stanza's PROIEL model (CC BY-NC-SA), Whitaker's WORDS, WLC+, Byz+, LXX-Brenton+ |
| `tools/latin/build.py` | Latin+, word by word, with Strong's numbers, in the KJV's numbering (downloads about 1 GB) | vulgate, wlc, lxx/plus.py | e-Sword's Latin Vulgate, Stanza, Whitaker's WORDS, WLC+, Byz+, LXX-Brenton+ |
| `tools/targum/build.py` | Targum+ and Ps-Jon+, word by word | sefaria, wlc | WLC+, Jastrow |
| `tools/syriac/build.py` | Peshitta+, word by word, from the Greek | crosswire | Byz+, STEPBible, Murdock, Etheridge |
| `tools/syriac/sedra.py` | Peshitta SEDRA, word by word | crosswire | ETCBC, SEDRA |
| `tools/rheims/build.py` | The Rheims New Testament (1582), read from the scanned book with macOS's Vision or Windows' OCR | crosswire | Internet Archive (`vulgatenewtestam00lond`, the University of Toronto's copy) |

- Run each with `python3`, on a Mac or on Windows. Downloads are cached in
  `~/Library/Caches/Two-edged Sword/` (on Windows, `%LOCALAPPDATA%\Two-edged Sword\Caches`), and the
  modules written to the app's modules folder, `%APPDATA%\Two-edged Sword\Modules` on Windows.
- On Windows, `pip install truststore` too: the tools then check HTTPS certificates against Windows'
  own store, which fetches a root certificate it hasn't seen yet (archive.org's, on a new PC), where
  Python's own check would fail.
- `tools/rheims` reads the scans with macOS's Vision (`ocr.swift`) or, on Windows, Windows' own OCR
  (`ocr.ps1`, with its own reading settings). The Mac's build is the better: 85% of Challoner's
  words matched against Windows' 82%, with the same verses. A script that reads an e-Sword
  module looks in the modules folder and, on a Mac, e-Sword X's folder; on Windows, put the e-Sword
  X (Mac) version in the modules folder. Without macOS's word list (`/usr/share/dict/words`),
  `tools/sefaria` divides a few run-together words less well and `tools/larkin` has only each
  book's own words to judge its scans' OCR by.
- Every download is also kept in a private archive, `Two-edged Sword Sources` in OneDrive (or the
  folder `$TES_SOURCES` names), at the same path as in the cache, so a source can't be lost to a
  cleared cache or a site gone down (Rheims' first source was, when Bible Support stopped its
  downloads). When a download fails, or no longer matches its pinned sha256, `modules.fetch` takes
  the archived copy; a source that has changed keeps its old copy beside the new one, dated.
  `python3 tools/modules.py archive` keeps whatever is in the cache now. The archive is never
  committed or shared, as some sources may not be passed on.
- `tools/core` also builds into the app the modules from `crosswire`, `vulgate`, `lxx`, `ginsburg`,
  `latin/clementine.py` and `syriac/build.py`, and three of `sefaria`'s Targums, from open versions
  only (see [Writing modules](#writing-modules)).
- Sources on GitHub, Bitbucket and SWORD's svn are pinned to a commit or revision, so a rebuild
  gives the same text. Move a pin only on purpose.

All are public domain or openly licensed, except some Sefaria translations, SEDRA's glosses and
Jastrow, which are non-commercial (fine for personal study).

- LXX-Brenton+'s word forms are GLAUx's, tagged by a model trained partly on non-commercial
  treebanks. GLAUx publishes its results under CC BY-SA 4.0, so LXX-Brenton+ is shared under it
  too.
- Peshitta+'s English and Strong's numbers come from the Greek it's lined up with, so Word Study
  opens the Greek word.
- `beza/build.py` uses e-Sword X's Greek NT TR+, if you have it, to correct the transcription.
  Without it, the transcription is kept as it is.

## Writing modules

Scripts in `tools/` share `tools/modules.py`:

- `LIBRARY`: the app's modules folder, where every script writes.
- `find(name)`: finds an input module in the app's folder, e-Sword X's library or the built-in
  modules, in the order the app reads them. Inside `with shipping():`, it looks in the built-in
  modules only.
- `module(file, title, abbrev, info)`: a writer for any of the six formats. It yields the new
  module's connection, and replaces the old file only when the block finishes.
- `fetch(url, path, sha256=…)`: a cached download. It's retried, checked against its hash when one
  is given, and written whole or not at all.
- `chapter_lengths(name)`: the number of verses in each chapter of a module, found with `find`.
- `hebrew_consonants`, `greek_key`, `similar`: the comparison keys the word-by-word builders use to
  match words.

`tools/books.py` holds the 66 books' names in each source's spelling.

`tools/core/build.py` builds the built-in modules from public-domain and openly licensed sources.
Its docstring lists them and their licences.

- **Ids**: `kjv`, `kjv+`, `strong`, `kjc` and `tsk` are the ids the app looks for first. The others
  mostly take e-Sword's ids (`asv`, `henry`, `wesley`, …). Where e-Sword X has a module the app
  also has, the app reads its own copy, unless the user chooses e-Sword's on the Library screen
  (Settings › `eswordCopies`).
- **Options**: `--only jfb asv` builds just those; `--if-missing` builds only what isn't there.
- **Other tools' Bibles** it builds into the bundle:
  - the Peshitta, Murdock, Etheridge, Tyndale, Geneva 1599 and Douay-Rheims (`tools/crosswire`);
  - the Clementine Vulgate (`tools/vulgate`) and the Greek Brenton (`tools/lxx/build.py`);
  - Ginsburg and Ginsburg+ (`tools/ginsburg`), shared under the GPL as the app is, since a few
    verses come from a GPL-3.0 source;
  - WLC+ (`tools/wlc`);
  - the word-by-word LXX-Brenton+ and Peshitta+ (`tools/lxx/plus.py`, `tools/syriac/build.py`),
    from open sources only;
  - Targum+ and Ps-Jon+ (`tools/targum`), from the built-in Targums. Their Jastrow glosses are
    CC BY-NC, so they're shared under CC BY-NC and left out of a build that's sold, like Vulg-C+;
  - Vulg-C+ (`tools/latin/clementine.py`). Its tagging is Stanza 1.14.0's, trained on the
    non-commercial PROIEL treebank, so it's shared under CC BY-NC-SA and left out of a build
    that's sold. It needs Stanza installed only when it's rebuilt;
  - the Aramaic Targum, Targum Pseudo-Jonathan and its English (`targum_aramaic`,
    `pseudojonathan_aramaic`, `pseudojonathan_english`; `open_targum` in `tools/sefaria`). These
    take named Sefaria versions only (`open_versions`), each checked against the licence Sefaria's
    API gives it. A version that isn't public domain, CC0, CC BY or CC BY-SA stops the build.
- Each of these runs inside `shipping()`, so it reads only the built-in modules.
- **The map book**, `maps.refi`, built with `tools/maps/build.py`. Its maps are drawn from
  OpenBible.info's places, NASA and USGS terrain (Mapzen's Terrain Tiles) and Natural Earth's
  coasts, at 3,600 pixels wide. Its first run downloads some thousands of terrain tiles (cached);
  `--only jesus --pictures DIR` draws one map to look at.
- **Books**, all public domain and pinned by sha256:
  - `josephus.refi`, `edersheim.refi`, `pilgrim.refi`, `lawrence.refi` and `bounds.refi` (seven books
    in one), built with `tools/ccel/build.py` from the
    Christian Classics Ethereal Library's ThML editions. Each `scripRef` becomes a `<ref>` the app
    opens, and footnotes are listed under each chapter.
  - `foxe.refi`, built with `tools/gutenberg/build.py` from Project Gutenberg's HTML (Forbush's
    edition). Its Bible references aren't marked, so they aren't linked.
  - `larkin_dispensational_truth.refi`, `larkin_revelation.refi`, `larkin_daniel.refi`,
    `larkin_second_coming.refi`, `larkin_spirit_world.refi` and `larkin_rightly_dividing.refi`, built with
    `tools/larkin/build.py` from the Internet Archive's scans: the OCR's text, and each page with a
    chart as a picture (two-page charts joined, sideways ones turned, other copies used where they
    show more at the binding). Chart pages, chapter starts and turns are listed by hand in `BOOKS`.
    Pictures are drawn on every core and kept in the cache; one is redrawn only when what it's
    drawn from changes. Lines where most words aren't English or used elsewhere in the book are taken
    as garbled OCR and left out. `tools/larkin/fixes/<book>.json` holds a proofreading of the built
    text (paragraphs to drop, misread words put right), each fix checked against other scanned copies'
    OCR before it went in.
- **Covers.** Every module has one: a small copy at the start of its description, which the About
  views float to the top right, and the books also open with it. `tools/covers.py` draws them as new
  bindings, in free fonts from Google Fonts (pinned), from a kit of materials (cloth, linen, buckram,
  leather, paper), stamps (gold, silver, blind, ink), borders, emblems and layouts (classic, a label,
  a band, half-bound, an all-over pattern).
  - Larkin's are drawn from their scans (`COVERS` in `tools/larkin/build.py`); the other books'
    are a `cover` in their builder's `BOOKS`.
  - Every other module's is in `tools/covers_catalog.py`, by file name; related modules are bound
    alike (each original language, the Talmud by its orders, a module and its "w/ glosses" twin).
  - `modules.module()` adds the cover as a module is written, so every builder gets it.
    `python3 tools/covers.py apply <folder>` adds or redraws them in modules already built.
- **Histories.** Every module's description has a short history of the work, a paragraph headed
  **History.** after its first. They are in `tools/history.py`, by file name (a "+" edition shares
  its plain one's, the Talmud's tractates one). `modules.module()` adds it as a module is written;
  `python3 tools/history.py apply <folder>` adds or replaces it in modules already built.

Nothing from e-Sword X goes into a module that could be shipped: its licence forbids passing its
modules on. These scripts read e-Sword modules, so they build for your own library only:

- `beza/build.py` (TR+, if it's there), and `beza/plus.py` with it;
- `latin/build.py` (Latin+, from e-Sword's `latin.bbli`; its tagger's PROIEL model is CC BY-NC-SA
  too).

These aren't built in either:

- `rheims`, as it is a machine reading of the scans, with misreadings left in;
- `sefaria`'s Targum (English) and Talmud, `targum` and `syriac/sedra.py`, as their sources are
  non-commercial.

`tools/stepbible.py` reads STEPBible's TAGNT: every Greek NT edition's words with Strong's numbers
and grammar, numbered as the KJV. It gives ἐγώ, σύ and εἰμί their forms' numbers (μου G3450), as
Strong's and the KJV+ do. It also loads STEPBible's Greek and Hebrew lexicons, and decodes
Robinson's grammar codes, for the builders that need them.

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
| `src/dom.ts`, `src/sizes.ts`, `src/readingDay.ts` | HTML escaping, dark mode and text highlights; each Bible's chapter sizes (cleared on rescan); the reading day, which turns at 4am |
| `src/ReaderTools.tsx`, `src/ReadingColumn.tsx` | Pieces shared by Read, the book reader, Lyrics, the web devotional and Journal: highlight dots, copy, focus-mode hints and the top bar |
| `src/lexicon.ts` | Cached lexicon and concordance lookups for Word Study and the word popover |
| `src/speech.tsx` | Reading aloud: word highlighting, sleep timer |
| `src/awake.ts`, `keep_awake` in `lib.rs` | Keeping the screen awake (with `caffeinate`) while reading aloud, in Quiet time, or while Read or Compare is in front |
| `src/Ask.tsx`, `src/assistant.ts` | The Ask panels, and which AI tools and models are available |
| `src-tauri/src/library.rs`, `content.rs` | Finding modules and reading text out of them |
| `src-tauri/src/search.rs`, `index.rs` | Search and its index |
| `src-tauri/src/journal.rs` | The journal's monthly Markdown files |
| `src/JournalPrint.tsx`, `src/journalDoc.ts`, `src-tauri/src/pdf.rs` | Printing the journal: the dialog; the document (cover, In your words, the entries) and its pages; printing the page straight to a PDF ([Printing to PDF](#printing-to-pdf)) |
| `src-tauri/src/store.rs` | The JSON files in Application Support |
| `src/music.ts` | One shared poll of what Music is playing, for Quiet time and Lyrics |
| `src-tauri/src/music.rs` | Worship songs played through Music, for Quiet time and for a chapter (`src/ChapterSongs.tsx`) |
| `src/LyricsPage.tsx`, `src/lyrics.ts`, `src/Flames.tsx` | The playing song's words (from LRCLIB), its artwork (from Music, else the iTunes search API) and the flames shown when it has none |
| `tools/bitmap.py`, `src/pictures/*-bitmap.ts` | Turns a public-domain picture into a small, faded grey bitmap in a TypeScript module. `bitmap` in `pictures/kit.ts` shows it in the artwork's colour. Made this way: the lion of Judah (Rosa Bonheur's lion), the lamb (a lamb in the grass, Unsplash), the open Bible (a Bible open on a table, Unsplash), the eagle, the shofar, the crown of thorns, Dürer's praying hands, objects from the Met's open-access photographs (the cup, a lyre, the Crown of the Andes, an alabaster jar, a helmet, a breastplate, a censer, a key, a water jar), Redouté's rose, the temple's furnishings (from old engravings and the Arch of Titus), and the details of Renaissance paintings. `--pad` extends a photo's background outwards, so the faded oval clears the subject. `--channel r` uses one colour channel where grey would lose the subject (the tan shofar on grey-blue). A dark subject (the eagle, the thorns) keeps its pale ground, shown as "photo"; otherwise it would look like a negative on the dark page. Only public-domain or CC0 pictures go in |
| `src/Visions.tsx`, `src/pictures/` | The 125 pictures behind a playing song's words, drawn in the artwork's colours. **Subjects**: `sky`, `land`, `places`, `signs`, `creatures`; for Pentecostal worship `spirit`, `worship`, `throne`, `temple`, `deliverance`, `renewal`; and `paintings` (details of Renaissance paintings). **Drawing**: `pictures/kit.ts` gives layers, tones, glows, drifting specks, photo pictures, and a random number source that screenshot mode seeds. `src/canvasLoop.ts` runs their canvas and the flames'. **Choosing**: each picture has `themes`, the words a song about it would use. A picture whose themes are in the song's title or words is chosen more often (`suits` in Visions.tsx). A theme counts for less the more pictures share it, so common worship words don't crowd the choice. A scene's `song.vision` shows one picture. **Verses**: each picture has a whole `verse`, so it reads right in any Bible. LyricsPage looks them up in the Bible chosen in Settings. Each picture's draw calls `verse(f, box)` (kit.ts) with where the picture stands, to put the verse under it (or over it, clear of the flames) within its placed stretch. A picture that fills the page places a stretch for its verse alone, and only when the verse will show (`room.verse`). The viewer (`make visions`) shows the KJV's verses, from `pictures/kjv-verses.ts`, which `tools/visions_verses.py` makes from the bundled KJV (`make visions` runs it) |
| `src/closing.ts` | Quiet time's closing verse, chosen by the assistant |
| `src/WebPage.tsx` | An online devotional framed in the reading column. `open_web` in `lib.rs` opens a site in its own window instead, and `web_frameable` checks (with curl) whether a site the user added can be framed |
| `src/tray.tsx`, `src/TrayWindow.tsx`, `src-tauri/src/tray.rs` | The menu-bar window (the main window sends it what to show) and the daily reminder |
| `src-tauri/src/login_item.rs`, `login_launch.rs` | Open at Login |
| `src-tauri/src/updates.rs`, `src/Update.tsx`, `tools/update_files.py` | Checking GitHub for a new release and installing it; the prompt for it in the main window; the release's signed update files |
| `src-tauri/src/tts.rs` | Speech through AVSpeechSynthesizer (WebKit's speech API hides downloaded voices) |
| `src/Help.tsx`, `src/guides.ts`, `src/Welcome.tsx`, `src-tauri/src/help.rs`, `tools/helpcheck.py` | The help drawer, the guides it shows, the Getting started offer, the Help menu, and the link check |
| `src/ImageViewer.tsx` | A book's or a map's picture full screen, to zoom and pan |
| `src-tauri/src/assistant/` | Running Claude Code, Codex, Antigravity or Copilot for Ask; `mod.rs` holds the streaming they share |
| `src-tauri/src/process.rs` | Running a command with a time limit (Music, the login shell, the assistants' `--version`) |
| `src-tauri/src/study.rs`, `books.rs` | Writing library material out as files for Ask to search |
| `index.html` | The splash screen, painted before React starts |
| `src/scene.ts`, `src-tauri/src/screenshot.rs`, `tools/screenshots.py` | Screenshot mode and the script that drives it |
| `src/variances.tsx`, `src/KjvHistory.tsx` | The ≠ marks and their popup, and the KJV History page |
| `tools/variances/` | Building each translation's differences from the KJV |
| `tools/sefaria/`, `tools/vulgate/`, `tools/crosswire/` and the rest | Building modules from free sources ([Building modules](#building-modules)) |
| `tools/make_icons.py` | The icon artwork |

- Every source file starts with the copyright notice from the About box and
  `SPDX-License-Identifier: GPL-3.0-or-later`; add both to a new file.
- Formatting rules are in `src-tauri/rustfmt.toml` and `.prettierrc.json` (140 columns). Lint rules
  are clippy's defaults and `eslint.config.js`. Run `make lint` before committing.
- Design decisions and known bugs are logged in `_sift/`; `python3 _sift/bin/sift.py decisions`
  lists the decisions.

## Licensed Bibles

The NIV, ESV and other copyrighted modules are licensed for personal use. They are never copied
into this repo (`.gitignore` excludes module files), and the app only reads them where e-Sword
keeps them. Screenshots show public-domain text only.
