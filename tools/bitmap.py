#!/usr/bin/env python3
"""Turn a picture into a small grey bitmap for one of the pictures behind a song's words.

    python3 tools/bitmap.py photo.jpg src/pictures/lion-bitmap.ts LION_BITMAP --crop 0.1,0.05,0.9,0.8 --width 160

The picture is cropped (left, top, right, bottom, as fractions of it), scaled to `--width`,
turned to grey with its contrast stretched, and its edges faded out in a soft oval so it sits in
the page without a frame. It is written as a PNG data URI in a TypeScript module, with the
source and licence given on the command line kept in a comment above it. Only public-domain or
CC0 pictures go in the repo.

`--pad` carries the ground out round the picture (its edge colour, blended in over `--seam`), so
the fade clears a subject that fills its photo; `--channel r` (or g or b) takes one colour in
place of grey, for a subject its ground's grey would hide (a tan horn on grey-blue). Keep a dark
subject's ground: without it, it shows as light on the dark page, like a negative.
"""
import argparse, base64, io, pathlib
from PIL import Image, ImageFilter, ImageOps

ap = argparse.ArgumentParser()
ap.add_argument("image")
ap.add_argument("out")
ap.add_argument("name")
ap.add_argument("--crop", default="0,0,1,1", help="left,top,right,bottom as fractions")
ap.add_argument("--width", type=int, default=160)
ap.add_argument("--fade", type=float, default=0.18, help="how far in from the edge the fade runs, of the width")
ap.add_argument("--pad", default="0", help="add this much (of each side; or across,down) of the picture's edge colour round it, so the fade clears the subject")
ap.add_argument("--seam", default="0", help="how wide (of the picture's shorter side) the padding blends into it")
ap.add_argument("--channel", default="grey", help="grey, or r, g or b: one colour, for a subject its ground's grey would hide (a tan horn on grey-blue)")
ap.add_argument("--source", default="", help="where it came from, and its licence, for the comment")
a = ap.parse_args()

rgb = Image.open(a.image).convert("RGB")
l, t, r, b = (float(v) for v in a.crop.split(","))
rgb = rgb.crop((int(l * rgb.width), int(t * rgb.height), int(r * rgb.width), int(b * rgb.height)))
rgb = rgb.resize((a.width, round(rgb.height * a.width / rgb.width)), Image.LANCZOS)
pads = [float(v) for v in a.pad.split(",")] * 2
if pads[0] or pads[1]:
    # The ground carried out past the edges: the border's mean colour, the seam blurred into it.
    w0, h0 = rgb.size
    edge = [rgb.getpixel((x, y)) for x in range(w0) for y in (0, h0 - 1)] + [rgb.getpixel((x, y)) for y in range(h0) for x in (0, w0 - 1)]
    mean = tuple(sum(c[i] for c in edge) // len(edge) for i in range(3))
    px, py = round(w0 * pads[0]), round(h0 * pads[1])
    big = Image.new("RGB", (w0 + 2 * px, h0 + 2 * py), mean)
    big.paste(rgb, (px, py))
    soft = max(3, round(min(w0, h0) * float(a.seam)))
    seam = Image.new("L", big.size, 0)
    seam.paste(255, (px + soft, py + soft, px + w0 - soft, py + h0 - soft))
    seam = seam.filter(ImageFilter.GaussianBlur(soft))
    rgb = Image.composite(big, big.filter(ImageFilter.GaussianBlur(soft * 2)), seam)
grey = rgb.convert("L") if a.channel == "grey" else rgb.getchannel("RGB".index(a.channel.upper()))
im = ImageOps.autocontrast(grey, cutoff=1)
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
