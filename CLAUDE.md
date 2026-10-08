<!-- sift:begin (generated — edits inside this block are overwritten on upgrade; add local notes below the end marker) -->
# sift

This repo uses sift, in `_sift/`. Read `_sift/conventions.md` once per session and follow it — the privacy rule in it is the part that matters.
Before reading unfamiliar code: `python3 _sift/bin/sift.py map <path>` — it gives you sizes and symbol ranges to read instead of whole files.
Before fixing a bug: `python3 _sift/bin/sift.py bug find "<error>"`. After: `sift bug add …`.
After a decision worth remembering: `sift decide "<title>" --context … --decision … --consequences …` (one command, written complete); `sift decisions` reads them back.
There are no subsystem pages here and none are to be written; `_sift/conventions.md` says why.
<!-- sift:end -->

# Seeing the app

To see a screen, check a UI change, or reproduce a bug, use screenshot mode rather than driving the app with clicks or the accessibility tree (clicks don't get through, and walking the accessibility tree of a big screen takes minutes). The app launches straight into a described state, saves nothing, and its webview is saved to a PNG you can look at. The window is invisible and never takes the focus, so several can run at once (`-j`, 4 by default).

- Standard scenes: `python3 tools/screenshots.py <scene> --theme dark` (names in `tools/screenshots/scenes.json`; writes `docs/images/<scene>-<theme>.png`). `make screenshots` retakes them all for the docs.
- A one-off scene, e.g. to reproduce a bug: call the script's functions with your own scene, then delete the image it wrote:
  ```python
  import sys; sys.path.insert(0, "tools"); import screenshots as s
  srv = s.dev_server()
  s.build()
  s.shoot({"name": "debug", "word": "G26", "pending": {"article": {"module": "isbe", "topic": "Love"}}}, "dark")
  if srv: srv.terminate()
  ```
- A scene (the `Scene` type in `src/scene.ts`) can set `settings`, `screen`, `loc`, `word` (Word Study), `search`, a fixture `chat`, a still `player`, `scrollTop`, `scrollTo` (a CSS selector scrolled into view), `pending` (an article, commentary or question asked for after the page settles, as a click elsewhere would), `doc` (open a book at a chapter), `selectPara` (click a paragraph), `click` (click any CSS selector afterwards, e.g. a toolbar button; a list is clicked in turn), `clickText` (a real click on the first place some text is shown, before `click`; e.g. a misspelled word, to open its menu), `type` (then type into a box: `["[aria-label=\"Find\"]", "rest"]`), a Quiet time `session`, a `song` shown on the Lyrics page as if playing in Music (timed lyrics as LRC, an image for its artwork, and `vision`: one of the pictures behind the words, by name, shown in full; `songVision` in scenes.json), sample journal `entries` (shown instead of the user's), `help` (the help drawer open), `journal` (open an entry by id), `chapterSongs` (the songs Songs for this chapter chooses, instead of asking the assistant) and `unread` (today's reading shown as not yet done). In scenes.json, `chatFile`, `sessionFile`, `entriesFile`, `songFile` and `chapterSongsFile` load those fixtures from `tools/screenshots/`. Add a field there when a bug needs one. In `tools/screenshots/scenes.json`, `crop: [x, y, width, height]` trims the saved 1400px-wide image to one part of the screen, and `"tray": true` shoots the menu-bar window instead of the main one. Hover can't be simulated.
- It needs the Vite dev server (the script starts it). Screenshots are macOS only. Scenes read the user's real library and data, without changing them. Show only public-domain Bibles in anything committed.

# Docs and help

When a feature is added or changed, update its guide in `docs/` in the same change: the app's help drawer (`?`, ⌘?) shows those guides, so this keeps both current. Write it the way `docs/development.md` › "Writing the docs" says: only the facts needed to use the feature, short plain sentences, a `##` section per topic (each is a folding section in the help), lists and tables rather than paragraphs, developer detail in `docs/development.md`. Then run `make help`, which checks every link and each screen's section resolve.
