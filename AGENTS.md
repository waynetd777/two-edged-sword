<!-- sift:begin (generated — edits inside this block are overwritten on upgrade; add local notes below the end marker) -->
# sift

This repo uses sift, in `_sift/`. Read `_sift/conventions.md` once per session and follow it — the privacy rule in it is the part that matters.
Before reading unfamiliar code: `python3 _sift/bin/sift.py map <path>` — it gives you sizes and symbol ranges to read instead of whole files.
Before fixing a bug: `python3 _sift/bin/sift.py bug find "<error>"`. After: `sift bug add …`.
After a decision worth remembering: `sift decide "<title>" --context … --decision … --consequences …` (one command, written complete); `sift decisions` reads them back.
There are no subsystem pages here and none are to be written; `_sift/conventions.md` says why.
<!-- sift:end -->

# Seeing the app

To see a screen, check a UI change, or reproduce a bug, use screenshot mode rather than driving the app with clicks or the accessibility tree (clicks don't get through, and walking the accessibility tree of a big screen takes minutes). The app launches straight into a described state, saves nothing, and its window is captured to a PNG you can look at.

- Standard scenes: `python3 tools/screenshots.py <scene> --theme dark` (names in `tools/screenshots/scenes.json`; writes `docs/images/<scene>-<theme>.png`). `make screenshots` retakes them all for the docs.
- A one-off scene, e.g. to reproduce a bug: call the script's functions with your own scene, then delete the image it wrote:
  ```python
  import sys, tempfile; sys.path.insert(0, "tools"); import screenshots as s
  srv = s.dev_server()
  with tempfile.TemporaryDirectory() as tmp:
      s.shoot({"name": "debug", "word": "G26", "pending": {"article": {"module": "isbe", "topic": "Love"}}}, "dark", s.build(tmp))
  if srv: srv.terminate()
  ```
- A scene (the `Scene` type in `src/scene.ts`) can set `settings`, `screen`, `loc`, `word` (Word Study), `search`, a fixture `chat`, a still `player`, `scrollTop`, `scrollTo` (a CSS selector scrolled into view), `pending` (an article, commentary or question asked for after the page settles, as a click elsewhere would), `doc` (open a book at a chapter), `selectPara` (click a paragraph) and `click` (click any CSS selector afterwards, e.g. a toolbar button). Add a field there when a bug needs one. In `tools/screenshots/scenes.json`, `crop: [x, y, width, height]` trims the saved 1400px-wide image to one part of the screen. Hover can't be simulated.
- It needs the Vite dev server (the script starts it) and Screen Recording permission for the terminal. Scenes read the user's real library and data, without changing them. Show only public-domain Bibles in anything committed.
