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
    python3 tools/screenshots.py --tutorials     # the website tutorials' pictures (tutorials/*.json)
    make screenshots                             # the same as the first

Needs: the Vite dev server (started here if it isn't running), Pillow, and e-Sword X's modules.
Scenes are in tools/screenshots/scenes.json, and the website tutorials' in tutorials/<tutorial>.json: those are
taken on the demo home (demo_home.py) and written to site/img/tut/ instead, at twice the window's
width in points.
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

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "screenshots"))
import demo_home  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = ROOT / "tools" / "screenshots"
OUT = ROOT / "docs" / "images"
SITE = ROOT / "site" / "img" / "tut"
DEMO_HOME = HERE / "out" / "home"
BIN = ROOT / "src-tauri" / "target" / "debug" / "TwoEdgedSword"
DEV_URL = "http://localhost:1430"
WIDTH = 1400
POINTS = 1440  # the window's width in points; the site's pictures are twice this, whatever the display's scale
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
    """Launches the app on the scene, unseen, and returns its webview's snapshots as sRGB images
    (one, or the scene's "frames" of them), or None."""
    # A fixture from a file beside scenes.json: "chatFile" becomes "chat", and so on.
    files = {"chatFile": "chat", "sessionFile": "session", "entriesFile": "entries", "variancesFile": "variances", "songFile": "song", "chapterSongsFile": "chapterSongs"}
    sc = {k: v for k, v in scene.items() if k not in files and k not in ("crop", "width", "settle", "songVision", "songVisionAt", "songVisionDur", "frames", "every", "step", "darkOnly", "home", "site", "card")}
    for f, k in files.items():
        if f in scene:
            sc[k] = json.loads((HERE / scene[f]).read_text(encoding="utf-8"))
    # "songVision": one of the pictures behind the song's words, shown in full (Visions.tsx),
    # "songVisionAt" (0–1) of the way through it.
    if "songVision" in scene and "song" in sc:
        sc["song"] = {**sc["song"], "vision": scene["songVision"]}
        if "songVisionAt" in scene:
            sc["song"]["visionAt"] = scene["songVisionAt"]
        # "songVisionDur": the seconds it takes, instead of its own.
        if "songVisionDur" in scene:
            sc["song"]["visionDur"] = scene["songVisionDur"]
    if "step" in scene:
        sc["stepped"] = True  # the song's picture waits for the frames (src/sceneClock.ts)
    # No favourite translations unless the scene names them: the user's own could be licensed Bibles.
    # On the demo home, its own settings: favourites all public domain, and its colours' names (a
    # scene clears the user's).
    sc["settings"] = {**(demo_home.settings() if scene.get("home") else {"favBibles": []}), **sc.get("settings", {}), "theme": theme}
    with tempfile.TemporaryDirectory() as tmp:
        shot = pathlib.Path(tmp) / "shot.tiff"
        frames, every = scene.get("frames", 1), scene.get("every", 0.1)
        env = {**os.environ, "TES_SCENE": json.dumps(sc), "TES_SNAPSHOT": str(shot), "TES_SNAPSHOT_AFTER": str(scene.get("settle", SETTLE)),
               "TES_SNAPSHOT_FRAMES": str(frames), "TES_SNAPSHOT_EVERY": str(every)}
        # "step": the page's clock moved on this many seconds before each frame, in place of "every"
        # (src/sceneClock.ts): evenly spaced frames, however slowly WebKit draws them.
        if "step" in scene:
            env["TES_SNAPSHOT_STEP"] = str(scene["step"])
        # "home": "demo": the app runs in the tutorials' demo home folder, on its data alone.
        if scene.get("home"):
            env["HOME"] = str(DEMO_HOME)
        if frames > 1:
            # Half the window's 1440 points, 1440px at 2x: a full-size snapshot takes 0.75s, this 0.14s.
            env["TES_SNAPSHOT_WIDTH"] = "720"
        # An animated scene's frames are shot-000.tiff, shot-001.tiff and so on.
        shots = [shot] if frames == 1 else [shot.with_name(f"shot-{i:03}.tiff") for i in range(frames)]
        app = subprocess.Popen([str(BIN)], cwd=ROOT / "src-tauri", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            # The app writes the file whole (atomically) once WebKit has drawn it.
            # The last thing written: the snapshot, or an animation's list of when each frame was taken.
            done = shot if frames == 1 else shot.with_name("shot-times.txt")
            end = time.time() + scene.get("settle", SETTLE) + frames * max(every, 1) + 30
            while not done.exists() and app.poll() is None and time.time() < end:
                time.sleep(0.2)
            if not done.exists():
                return None
            times = [0.0] if frames == 1 else [float(t) for t in done.read_text(encoding="utf-8").split()]
            ims = []
            for f, t in zip(shots, times):
                if not f.exists():
                    continue  # a frame WebKit didn't draw in time
                im = Image.open(f)
                im.load()
                im = to_srgb(im.convert("RGBA") if im.mode not in ("RGB", "RGBA") else im)
                im.info["at"] = t
                ims.append(im)
            return ims or None
        finally:
            # SIGKILL, not a normal quit: a normal quit saves the window's size and place.
            app.send_signal(signal.SIGKILL)
            app.wait()


def chrome(im, theme):
    """Draws back what a webview snapshot leaves out: the window's (unfocused) buttons and its
    rounded corners, as a capture of the window showed them. Measured at 1400px wide, and scaled
    to the picture's width."""
    w, h = im.size
    s = w / WIDTH
    k = 4  # drawn large and scaled down, for smooth edges
    over = Image.new("RGBA", (w * k, h * k))
    d = ImageDraw.Draw(over)
    fill, rim = ((224, 225, 226), (219, 220, 222)) if theme == "light" else ((129, 131, 132), (136, 137, 139))
    for cx in (15, 37.5, 60):
        cy, r = 16, 6.75
        d.ellipse([(cx - r) * s * k, (cy - r) * s * k, (cx + r) * s * k, (cy + r) * s * k], fill=fill + (255,), outline=rim + (255,), width=round(k * s))
    im = Image.alpha_composite(im.convert("RGBA"), over.resize((w, h), Image.LANCZOS))
    mask = Image.new("L", (w * k, h * k))
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w * k - 1, h * k - 1], radius=round(16 * s * k), fill=255)
    im.putalpha(mask.resize((w, h), Image.LANCZOS))
    return im


def blank(im):
    # An undrawn window is one flat colour.
    return ImageStat.Stat(im.convert("L")).stddev[0] < 4


def shoot(scene, theme):
    # A shot that came out blank (or never came) is taken again, from a fresh launch.
    for _ in range(3):
        ims = capture(scene, theme)
        if ims is not None and not blank(ims[0]):
            break
    else:
        print(f"  {scene['name']} {theme}: " + ("no window" if ims is None else "blank"))
        return False
    if scene.get("site"):
        return site(scene, ims[0], theme)
    # A scene may keep its own width (the menu-bar window, at its natural 2x size).
    width = scene.get("width", WIDTH)

    def finish(im):
        at = im.info.get("at", 0.0)
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        if not scene.get("tray"):
            im = chrome(im, theme)
        # "crop": [x, y, width, height] of the 1400px-wide image, for a shot of one part of a screen.
        if "crop" in scene:
            x, y, w, h = scene["crop"]
            im = im.crop((x, y, x + w, y + h))
        im.info["at"] = at
        return im

    # Every frame the first one's size (a frame taken mid-resize is dropped).
    ims = [finish(im) for im in ims if im.size == ims[0].size]
    im = ims[0]
    if scene.get("frames", 1) > 1 and "step" in scene:
        # Stepped: a looping MP4, which keeps the dark gradients smooth where a lossy WebP blotches
        # them, and its middle frame as a PNG for the guides and for a page that doesn't play it.
        ims[len(ims) // 2].save(OUT / f"{scene['name']}-{theme}.png", optimize=True)
        out = OUT / f"{scene['name']}-{theme}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            for i, f in enumerate(ims):
                f.convert("RGB").save(pathlib.Path(tmp) / f"{i:04}.png")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(round(1 / scene["step"], 3)), "-i", str(pathlib.Path(tmp) / "%04d.png"),
                            "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",  # H.264 wants an even width and height
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "film", "-pix_fmt", "yuv420p",
                            "-movflags", "+faststart", "-an", str(out)], check=True)
    elif scene.get("frames", 1) > 1:
        # Animated: a looping WebP, each frame shown for as long as it was on screen.
        out = OUT / f"{scene['name']}-{theme}.webp"
        at = [i.info["at"] for i in ims]
        durations = [max(20, round((b - a) * 1000)) for a, b in zip(at, at[1:])] + [round(scene.get("every", 0.1) * 1000)]
        im.save(out, save_all=True, append_images=ims[1:], duration=durations, loop=0, quality=80, method=6)
    else:
        out = OUT / f"{scene['name']}-{theme}.png"
        im.save(out, optimize=True)
    print(f"  {out.relative_to(ROOT)}  {im.width}x{im.height}" + (f", {len(ims)} frames" if len(ims) > 1 else ""))
    return True


def site(scene, im, theme):
    """A website tutorial's picture: site/img/tut/<name>.webp at twice the window's width in points,
    so it's sharp on a Retina screen and doesn't grow on a display scaled past 2x. A "card" (a
    crop drawn at its own size on the tutorials' index) gets a copy at the window's own size too,
    <name>@1x.webp, for a 1x screen. "crop" is given at the docs' 1400px width and scaled."""
    SITE.mkdir(parents=True, exist_ok=True)
    # The menu-bar window is small: kept at its own 2x size ("width"), with no window buttons.
    full = scene.get("width", 2 * POINTS) if scene.get("tray") else 2 * POINTS
    for width, suffix in [(full, "")] + ([(full // 2, "@1x")] if scene.get("card") else []):
        out = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        if not scene.get("tray"):
            out = chrome(out, theme)
        if "crop" in scene:
            s = width / WIDTH
            x, y, w, h = (round(v * s) for v in scene["crop"])
            out = out.crop((x, y, x + w, y + h))
        path = SITE / f"{scene['name']}{suffix}.webp"
        out.save(path, quality=82, method=6)
        print(f"  {path.relative_to(ROOT)}  {out.width}x{out.height}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="scenes to take (default: all)")
    ap.add_argument("--theme", choices=["light", "dark"], action="append", help="default: both")
    ap.add_argument("-j", type=int, default=4, metavar="N", help="apps to run side by side (default 4)")
    ap.add_argument("--tutorials", action="store_true", help="the website tutorials' scenes (tutorials/*.json)")
    a = ap.parse_args()
    docs = json.loads((HERE / "scenes.json").read_text(encoding="utf-8"))
    # The tutorials' scenes: on the demo home, for the site, in its dark theme.
    tuts = [{"home": "demo", "site": True, "darkOnly": True, **s} for f in sorted((HERE / "tutorials").glob("*.json")) for s in json.loads(f.read_text(encoding="utf-8"))]
    scenes = tuts if a.tutorials else docs
    if a.names:
        everything = docs + tuts
        unknown = set(a.names) - {s["name"] for s in everything}
        if unknown:
            sys.exit(f"no such scene: {', '.join(sorted(unknown))}")
        scenes = [s for s in everything if s["name"] in a.names]
    themes = a.theme or ["light", "dark"]
    if any(s.get("home") for s in scenes):
        demo_home.main()
    OUT.mkdir(parents=True, exist_ok=True)
    server = dev_server()
    try:
        build()
        # "darkOnly": a screen that is always dark (the Lyrics page) is shot only in dark.
        jobs = [(s, t) for s in scenes for t in themes if not (s.get("darkOnly") and t == "light")]
        with concurrent.futures.ThreadPoolExecutor(max(1, a.j)) as pool:
            ok = all(list(pool.map(lambda job: shoot(*job), jobs)))
    finally:
        if server:
            server.terminate()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
