# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

"""The phone app's icons, from the desktop's design/icon.png (a macOS icon: a rounded square inside a
transparent margin). Run from mobile/: python3 tools/icons.py, then `make icons`.

- icons/source/ios.png: the square's contents to the edges. iOS draws its own rounded corners, and an
  icon with a margin or transparency looks small and gets a black frame.
- icons/source/android.png: the same artwork at 72% on its background (pager-system's lesson): Android's
  adaptive-icon mask, a circle or rounded square within the middle two thirds, would otherwise clip it.
"""

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent.parent
SRC = HERE.parent / "design" / "icon.png"
OUT = HERE / "src-tauri" / "icons" / "source"
SIZE = 1024


def main():
    im = Image.open(SRC).convert("RGBA")
    w = im.width
    alpha = im.getchannel("A")
    # The rounded square's edges, along the middle row and column.
    row = [alpha.getpixel((x, w // 2)) for x in range(w)]
    col = [alpha.getpixel((w // 2, y)) for y in range(w)]
    left = next(i for i, v in enumerate(row) if v > 250)
    right = w - 1 - next(i for i, v in enumerate(reversed(row)) if v > 250)
    top = next(i for i, v in enumerate(col) if v > 250)
    bottom = w - 1 - next(i for i, v in enumerate(reversed(col)) if v > 250)
    bg = im.getpixel((w // 2, top + 20))[:3]

    square = im.crop((left, top, right + 1, bottom + 1)).resize((SIZE, SIZE), Image.LANCZOS)
    ios = Image.new("RGBA", (SIZE, SIZE), bg + (255,))
    ios.alpha_composite(square)  # the rounded corners' transparency filled with the background
    ios = ios.convert("RGB")

    android = Image.new("RGB", (SIZE, SIZE), bg)
    inner = round(SIZE * 0.72)
    off = (SIZE - inner) // 2
    android.paste(ios.resize((inner, inner), Image.LANCZOS), (off, off))

    OUT.mkdir(parents=True, exist_ok=True)
    ios.save(OUT / "ios.png")
    android.save(OUT / "android.png")
    print(f"background #{bg[0]:02x}{bg[1]:02x}{bg[2]:02x}; wrote {OUT / 'ios.png'} and {OUT / 'android.png'}")


def finish():
    """After `cargo tauri icon` (make icons): iOS icons without an alpha channel (App Store Connect refuses
    an app icon with one), and Android's adaptive-icon background in the icon's own colour, not white."""
    bg = Image.open(OUT / "ios.png").convert("RGB").getpixel((4, 4))
    for png in (HERE / "src-tauri" / "gen" / "apple" / "Assets.xcassets" / "AppIcon.appiconset").glob("*.png"):
        Image.open(png).convert("RGB").save(png)
    colour = f"#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}"
    (HERE / "src-tauri" / "icons" / "android" / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">'
        + colour
        + "</color>\n</resources>\n"
    )
    print(f"iOS icons flattened; Android background {colour}")


if __name__ == "__main__":
    import sys

    finish() if sys.argv[1:] == ["finish"] else main()
