#!/usr/bin/env python3
"""Retake the README and docs screenshots: docs/images/<scene>-<theme>.png.

Launches the dev build once per scene and theme with the scene in TES_SCENE (src/scene.ts sets it
up and the app saves nothing), captures its window, and writes it 1400px wide in sRGB with no
colour profile (macOS embeds the display's, which tints the image in browsers).

    python3 tools/screenshots.py                 # every scene, light and dark
    python3 tools/screenshots.py read ask        # just these
    python3 tools/screenshots.py --theme dark    # one theme
    make screenshots                             # the same as the first

Needs: the Vite dev server (started here if it isn't running), Screen Recording permission for
the terminal, Pillow, and e-Sword X's modules. Scenes are in tools/screenshots/scenes.json.
"""

import argparse
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = ROOT / "tools" / "screenshots"
OUT = ROOT / "docs" / "images"
BIN = ROOT / "src-tauri" / "target" / "debug" / "TwoEdgedSword"
DEV_URL = "http://localhost:1420"
WIDTH = 1400
SETTLE = 6.0  # seconds after the window appears: splash, library load, scene, fonts


def dev_server():
    """The Vite dev server the debug build loads its page from; started if it isn't running."""
    try:
        urllib.request.urlopen(DEV_URL, timeout=1)
        return None
    except OSError:
        pass
    p = subprocess.Popen(["npx", "vite", "--port", "1420", "--strictPort"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        time.sleep(0.5)
        try:
            urllib.request.urlopen(DEV_URL, timeout=1)
            return p
        except OSError:
            pass
    sys.exit("the Vite dev server didn't start")


def build(tmp):
    # --no-default-features, as `tauri dev` builds it, so the page comes from the dev server.
    subprocess.run(["cargo", "build", "--no-default-features"], cwd=ROOT / "src-tauri", check=True)
    exe = pathlib.Path(tmp) / "window_id"
    subprocess.run(["swiftc", "-O", str(HERE / "window_id.swift"), "-o", str(exe)], check=True)
    return exe


def window_of(window_id, pid, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        out = subprocess.run([str(window_id), str(pid)], capture_output=True, text=True).stdout.strip()
        if out:
            return out
        time.sleep(0.3)
    return None


def shoot(scene, theme, window_id):
    sc = {k: v for k, v in scene.items() if k != "chatFile"}
    if "chatFile" in scene:
        sc["chat"] = json.loads((HERE / scene["chatFile"]).read_text())
    sc["settings"] = {**sc.get("settings", {}), "theme": theme}
    env = {**os.environ, "TES_SCENE": json.dumps(sc)}
    app = subprocess.Popen([str(BIN)], cwd=ROOT / "src-tauri", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        win = window_of(window_id, app.pid)
        if not win:
            print(f"  {scene['name']} {theme}: no window")
            return False
        time.sleep(SETTLE)
        # Found again just before capturing: the window can be replaced while the page settles.
        win = window_of(window_id, app.pid, timeout=5) or win
        with tempfile.NamedTemporaryFile(suffix=".png") as raw:
            subprocess.run(["screencapture", "-x", "-o", f"-l{win}", raw.name], check=True)
            im = Image.open(raw.name)
            im.load()
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        im.info.pop("icc_profile", None)
        out = OUT / f"{scene['name']}-{theme}.png"
        im.save(out, optimize=True)
        print(f"  {out.relative_to(ROOT)}  {im.width}x{im.height}")
        return True
    finally:
        # SIGKILL, not a normal quit: a normal quit saves the window's size and place.
        app.send_signal(signal.SIGKILL)
        app.wait()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="scenes to take (default: all)")
    ap.add_argument("--theme", choices=["light", "dark"], action="append", help="default: both")
    a = ap.parse_args()
    scenes = json.loads((HERE / "scenes.json").read_text())
    if a.names:
        unknown = set(a.names) - {s["name"] for s in scenes}
        if unknown:
            sys.exit(f"no such scene: {', '.join(sorted(unknown))}")
        scenes = [s for s in scenes if s["name"] in a.names]
    themes = a.theme or ["light", "dark"]
    OUT.mkdir(parents=True, exist_ok=True)
    server = dev_server()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            window_id = build(tmp)
            ok = all([shoot(s, t, window_id) for s in scenes for t in themes])
    finally:
        if server:
            server.terminate()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
