#!/usr/bin/env python3
"""Turn a picture into a small grey bitmap for one of the pictures behind a song's words.

    python3 tools/bitmap.py photo.jpg src/pictures/lion-bitmap.ts LION_BITMAP --crop 0.1,0.05,0.9,0.8 --width 160

The picture is cropped (left, top, right, bottom, as fractions of it), scaled to `--width`,
turned to grey with its contrast stretched, and its edges faded out in a soft oval so it sits in
the page without a frame. It is written as a PNG data URI in a TypeScript module, with the
source and licence given on the command line kept in a comment above it. Only public-domain or
CC0 pictures go in the repo.
"""
import argparse, base64, io, pathlib, sys
from PIL import Image, ImageOps

ap = argparse.ArgumentParser()
ap.add_argument("image")
ap.add_argument("out")
ap.add_argument("name")
ap.add_argument("--crop", default="0,0,1,1", help="left,top,right,bottom as fractions")
ap.add_argument("--width", type=int, default=160)
ap.add_argument("--fade", type=float, default=0.18, help="how far in from the edge the fade runs, of the width")
ap.add_argument("--source", default="", help="where it came from, and its licence, for the comment")
a = ap.parse_args()

im = Image.open(a.image).convert("L")
l, t, r, b = (float(v) for v in a.crop.split(","))
im = im.crop((int(l * im.width), int(t * im.height), int(r * im.width), int(b * im.height)))
im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
im = ImageOps.autocontrast(im, cutoff=1)
# The fade: an oval mask, full in the middle, to nothing at the edges.
w, h = im.size
mask = Image.new("L", (w, h), 0)
px = mask.load()
for y in range(h):
    for x in range(w):
        dx = (x - w / 2) / (w / 2)
        dy = (y - h / 2) / (h / 2)
        d = (dx * dx + dy * dy) ** 0.5
        k = min(1.0, max(0.0, (1.0 - d) / a.fade))
        px[x, y] = round(255 * (k * k * (3 - 2 * k)))
out = Image.merge("LA", (im, mask))
buf = io.BytesIO()
out.save(buf, "PNG", optimize=True)
uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
pathlib.Path(a.out).write_text(
    "// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.\n"
    "// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.\n\n"
    f"// Made by tools/bitmap.py: a {w}x{h} grey bitmap with its edges faded, from\n"
    f"// {a.source or a.image}\n\n"
    f"export const {a.name} = \"{uri}\";\n"
)
print(f"  {a.out}  {w}x{h}  {len(uri) // 1024} KB")
