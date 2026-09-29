#!/usr/bin/env python3
# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Draw the app's artwork: design/icon.png (the Dock icon source) and src-tauri/icons/tray@2x.png.

The icon is a two-edged sword (Hebrews 4:12): a gold blade with a light and a dark edge, a
curved cross-guard, a leather grip and a round pommel, on a deep ink tile. Drawn with PIL
because no SVG rasteriser is installed here, so this file is the source of truth; the same
shapes are in index.html's splash and the sidebar mark as SVG.

  * the tile needs real transparent corners;
  * the tray image is a TEMPLATE: black plus alpha only, macOS tints it;
  * supersample and downsample for smooth edges.

    python3 tools/make_icons.py            # then: npx tauri icon design/icon.png
    make icons                             # does both
"""

import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
S = 1024
SS = 4

INK = (27, 37, 50)
GLOW = (38, 53, 74)
BLADE_LIGHT = (239, 217, 164)
BLADE_DARK = (198, 151, 74)
FULLER = (138, 102, 48)
GOLD = (216, 177, 96)
GRIP = (110, 69, 38)
WRAP = (142, 93, 53)
PIN = (180, 138, 62)


def quad(p0, p1, p2, n=40):
    """Points along a quadratic Bezier curve."""
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


def sword(d, k, fill=None):
    """Draw the sword in 1024-space scaled by k. With `fill`, every part is that one colour."""
    def P(pts):
        return [(x * k, y * k) for x, y in pts]

    c = (lambda col: fill or col)
    d.polygon(P([(512, 176), (470, 262), (470, 640), (512, 640)]), fill=c(BLADE_LIGHT))
    d.polygon(P([(512, 176), (554, 262), (554, 640), (512, 640)]), fill=c(BLADE_DARK))
    if not fill:
        d.line(P([(512, 292), (512, 604)]), fill=FULLER, width=int(8 * k))
    guard = quad((334, 648), (512, 612), (690, 648)) + [(690, 684)] + quad((690, 684), (512, 652), (334, 684))
    d.polygon(P(guard), fill=c(GOLD))
    for cx in (334, 690):
        d.ellipse(P([(cx - 26, 640), (cx + 26, 692)]), fill=c(GOLD))
    d.rounded_rectangle(P([(486, 674), (538, 810)]), radius=12 * k, fill=c(GRIP))
    if not fill:
        for y in (704, 734, 764):
            d.line(P([(486, y), (538, y + 16)]), fill=WRAP, width=int(8 * k))
    d.ellipse(P([(472, 800), (552, 880)]), fill=c(GOLD))
    if not fill:
        d.ellipse(P([(498, 826), (526, 854)]), fill=PIN)


def icon():
    k = SS
    img = Image.new("RGBA", (S * k, S * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([100 * k, 100 * k, 924 * k, 924 * k], radius=185 * k, fill=INK)
    d.ellipse([(512 - 290) * k, (440 - 290) * k, (512 + 290) * k, (440 + 290) * k], fill=GLOW)
    sword(d, k)
    out = ROOT / "design" / "icon.png"
    out.parent.mkdir(exist_ok=True)
    img.resize((S, S), Image.LANCZOS).save(out)
    print("wrote", out.relative_to(ROOT))


def tray():
    """22pt menu-bar icon at 2x (44px): a bold sword silhouette, black plus alpha, drawn on its
    own 44px grid rather than shrunk from the Dock icon, so the blade and guard stay legible."""
    size, k = 44, SS
    img = Image.new("RGBA", (size * k, size * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    black = (0, 0, 0, 255)

    def P(pts):
        return [(x * k, y * k) for x, y in pts]

    # Blade: point at the top, two edges down to the guard.
    d.polygon(P([(22, 2), (26.5, 8), (26.5, 28), (17.5, 28), (17.5, 8)]), fill=black)
    # Fuller: a transparent groove down the middle gives it a two-edged look.
    d.line(P([(22, 9), (22, 26)]), fill=(0, 0, 0, 0), width=int(1.6 * k))
    # Cross-guard with rounded ends.
    d.rounded_rectangle(P([(10, 28), (34, 32.5)]), radius=2.25 * k, fill=black)
    # Grip and pommel.
    d.rectangle(P([(19.8, 32), (24.2, 38.5)]), fill=black)
    d.ellipse(P([(18.5, 37.5), (25.5, 44)]), fill=black)
    out = ROOT / "src-tauri" / "icons" / "tray@2x.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(out)
    print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    icon()
    tray()
