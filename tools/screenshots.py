#!/usr/bin/env python3
# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Retake the README and docs screenshots: docs/images/<scene>-<theme>.png.

Launches the dev build once per scene and theme with the scene in TES_SCENE (src/scene.ts sets it
up and the app saves nothing). The window is invisible and takes no focus, so nothing flashes on
screen: the app saves its webview's snapshot to TES_SNAPSHOT, and the window's buttons and rounded
corners are drawn back on it here. Written 1400px wide in sRGB with no colour profile.

    python3 tools/screenshots.py                 # every scene, light and dark
    python3 tools/screenshots.py read ask        # just these
    python3 tools/screenshots.py --theme dark    # one theme
    python3 tools/screenshots.py -j 1            # one at a time (default: 4 side by side)
    make screenshots                             # the same as the first

Needs: the Vite dev server (started here if it isn't running), Pillow, and e-Sword X's modules.
Scenes are in tools/screenshots/scenes.json.
"""

import argparse
import concurrent.futures
import io
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

from PIL import Image, ImageCms, ImageDraw, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = ROOT / "tools" / "screenshots"
OUT = ROOT / "docs" / "images"
BIN = ROOT / "src-tauri" / "target" / "debug" / "TwoEdgedSword"
DEV_URL = "http://localhost:1430"
WIDTH = 1400
SETTLE = 6.0  # seconds after launch before the snapshot: splash, library load, scene, fonts


def to_srgb(im):
    """The pixels converted from the display's colour profile (which macOS embeds) to sRGB, and the
    profile dropped. Only dropping it would leave the display's tint in the pixels (the Dell's)."""
    icc = im.info.get("icc_profile")
    if icc:
        alpha = im.getchannel("A") if im.mode == "RGBA" else None
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        im = ImageCms.profileToProfile(im.convert("RGB"), src, ImageCms.createProfile("sRGB"), renderingIntent=ImageCms.Intent.PERCEPTUAL)
        if alpha:
            im.putalpha(alpha)
    im.info.pop("icc_profile", None)
    return im


def dev_server():
    """The Vite dev server the debug build loads its page from; started if it isn't running."""
    try:
        urllib.request.urlopen(DEV_URL, timeout=1)
        return None
    except OSError:
        pass
    p = subprocess.Popen(["npx", "vite", "--port", "1430", "--strictPort"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        time.sleep(0.5)
        try:
            urllib.request.urlopen(DEV_URL, timeout=1)
            return p
        except OSError:
            pass
    sys.exit("the Vite dev server didn't start")


def build():
    # --no-default-features, as `tauri dev` builds it, so the page comes from the dev server.
    subprocess.run(["cargo", "build", "--no-default-features"], cwd=ROOT / "src-tauri", check=True)


def capture(scene, theme):
    """Launches the app on the scene, unseen, and returns its webview's snapshot as an sRGB image, or None."""
    # A fixture from a file beside scenes.json: "chatFile" becomes "chat", and so on.
    files = {"chatFile": "chat", "sessionFile": "session", "entriesFile": "entries", "variancesFile": "variances", "songFile": "song", "chapterSongsFile": "chapterSongs"}
    sc = {k: v for k, v in scene.items() if k not in files and k not in ("crop", "width", "settle", "songVision")}
    for f, k in files.items():
        if f in scene:
            sc[k] = json.loads((HERE / scene[f]).read_text())
    # "songVision": one of the pictures behind the song's words, shown in full (Visions.tsx).
    if "songVision" in scene and "song" in sc:
        sc["song"] = {**sc["song"], "vision": scene["songVision"]}
    # No favourite translations unless the scene names them: the user's own could be licensed Bibles.
    sc["settings"] = {"favBibles": [], **sc.get("settings", {}), "theme": theme}
    with tempfile.TemporaryDirectory() as tmp:
        shot = pathlib.Path(tmp) / "shot.tiff"
        env = {**os.environ, "TES_SCENE": json.dumps(sc), "TES_SNAPSHOT": str(shot), "TES_SNAPSHOT_AFTER": str(scene.get("settle", SETTLE))}
        app = subprocess.Popen([str(BIN)], cwd=ROOT / "src-tauri", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            # The app writes the file whole (atomically) once WebKit has drawn it.
            end = time.time() + scene.get("settle", SETTLE) + 30
            while not shot.exists() and app.poll() is None and time.time() < end:
                time.sleep(0.2)
            if not shot.exists():
                return None
            im = Image.open(shot)
            im.load()
            return to_srgb(im.convert("RGBA") if im.mode not in ("RGB", "RGBA") else im)
        finally:
            # SIGKILL, not a normal quit: a normal quit saves the window's size and place.
            app.send_signal(signal.SIGKILL)
            app.wait()


def chrome(im, theme):
    """Draws back what a webview snapshot leaves out: the window's (unfocused) buttons and its
    rounded corners, as a capture of the window showed them. Measured at 1400px wide."""
    k = 4  # drawn large and scaled down, for smooth edges
    w, h = im.size
    over = Image.new("RGBA", (w * k, h * k))
    d = ImageDraw.Draw(over)
    fill, rim = ((224, 225, 226), (219, 220, 222)) if theme == "light" else ((129, 131, 132), (136, 137, 139))
    for cx in (15, 37.5, 60):
        cy, r = 16, 6.75
        d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=fill + (255,), outline=rim + (255,), width=k)
    im = Image.alpha_composite(im.convert("RGBA"), over.resize((w, h), Image.LANCZOS))
    mask = Image.new("L", (w * k, h * k))
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w * k - 1, h * k - 1], radius=16 * k, fill=255)
    im.putalpha(mask.resize((w, h), Image.LANCZOS))
    return im


def blank(im):
    # An undrawn window is one flat colour.
    return ImageStat.Stat(im.convert("L")).stddev[0] < 4


def shoot(scene, theme):
    # A shot that came out blank (or never came) is taken again, from a fresh launch.
    for _ in range(3):
        im = capture(scene, theme)
        if im is not None and not blank(im):
            break
    else:
        print(f"  {scene['name']} {theme}: " + ("no window" if im is None else "blank"))
        return False
    # A scene may keep its own width (the menu-bar window, at its natural 2x size).
    width = scene.get("width", WIDTH)
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    if not scene.get("tray"):
        im = chrome(im, theme)
    # "crop": [x, y, width, height] of the 1400px-wide image, for a shot of one part of a screen.
    if "crop" in scene:
        x, y, w, h = scene["crop"]
        im = im.crop((x, y, x + w, y + h))
    out = OUT / f"{scene['name']}-{theme}.png"
    im.save(out, optimize=True)
    print(f"  {out.relative_to(ROOT)}  {im.width}x{im.height}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="scenes to take (default: all)")
    ap.add_argument("--theme", choices=["light", "dark"], action="append", help="default: both")
    ap.add_argument("-j", type=int, default=4, metavar="N", help="apps to run side by side (default 4)")
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
        build()
        jobs = [(s, t) for s in scenes for t in themes]
        with concurrent.futures.ThreadPoolExecutor(max(1, a.j)) as pool:
            ok = all(list(pool.map(lambda job: shoot(*job), jobs)))
    finally:
        if server:
            server.terminate()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
