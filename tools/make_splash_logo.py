#!/usr/bin/env python3
# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

"""The phone app's opening screen, as images: the desktop's logo (Wordmark in src/icons.tsx, the dark
theme's gold on its navy plate) with Hebrews 4:12 beneath it, as the desktop's splash has them
(index.html), drawn by Chrome so the lettering is the real fonts.

  python3 tools/make_splash_logo.py

Writes the iOS launch screen's image set (SplashLogo, 1x to 3x), the Android launch screen's drawable
(xxhdpi, 3x) and mobile/public/splash-logo.png for the page's own opening screen. Run it again when
the logo changes."""

import pathlib
import subprocess
import tempfile

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# The image's width on the phone, in points, and the logo's within it. Its height comes from the verse
# and is printed: the launch screens, the native covers and mobile/index.html all use both.
W, LOGO = 320, 280
TALL = 400
FONTS = ROOT / "node_modules/@fontsource/cinzel-decorative/files"

SWORD = """
  <path d="M512 176L470 262V640H512Z" fill="#efd9a4"/>
  <path d="M512 176L554 262V640H512Z" fill="#c6974a"/>
  <path d="M512 292V604" stroke="#8a6630" stroke-width="8" stroke-linecap="round" fill="none"/>
  <path d="M334 648Q512 612 690 648V684Q512 652 334 684Z" fill="#d8b160"/>
  <circle cx="334" cy="666" r="26" fill="#d8b160"/><circle cx="690" cy="666" r="26" fill="#d8b160"/>
  <rect x="486" y="674" width="52" height="136" rx="12" fill="#6e4526"/>
  <path d="M486 704L538 720M486 734L538 750M486 764L538 780" stroke="#8e5d35" stroke-width="8" fill="none"/>
  <circle cx="512" cy="840" r="40" fill="#d8b160"/><circle cx="512" cy="840" r="14" fill="#b48a3e"/>
"""

PAGE = f"""<!doctype html><html><head><style>
@font-face {{ font-family: "Cinzel Decorative"; font-weight: 700; src: url({(FONTS / "cinzel-decorative-latin-700-normal.woff2").as_uri()}); }}
@font-face {{ font-family: "Cinzel Decorative"; font-weight: 900; src: url({(FONTS / "cinzel-decorative-latin-900-normal.woff2").as_uri()}); }}
html, body {{ margin: 0; background: transparent; }}
.box {{ width: {W}px; display: flex; flex-direction: column; align-items: center; gap: 14px; }}
svg {{ display: block; width: {LOGO}px; height: auto; margin-bottom: 8px; }}
.what {{ margin-top: -6px; font: italic 13px/1.55 Georgia, serif; color: #8b949e; text-align: center; text-wrap: pretty; padding: 0 10px; }}
.cite {{ display: block; margin-top: 6px; font: normal 11px -apple-system, sans-serif; letter-spacing: .06em; text-transform: uppercase; }}
</style></head><body><div class="box">
<svg viewBox="-1 -1 174 60" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff6d8"/><stop offset="0.46" stop-color="#efcb76"/><stop offset="0.5" stop-color="#8f631c"/>
      <stop offset="0.64" stop-color="#f7dc95"/><stop offset="1" stop-color="#b5832b"/>
    </linearGradient>
    <filter id="s" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="0.8" stdDeviation="0.6" flood-color="rgba(0,0,0,0.7)"/></filter>
  </defs>
  <rect x="0.7" y="0.7" width="170.6" height="56.6" rx="10" fill="#0b1f3a" stroke="url(#g)" stroke-width="1.4"/>
  <svg x="6" y="5" width="38.4" height="48" viewBox="212 140 600 750"><circle cx="512" cy="440" r="290" fill="#26354a"/>{SWORD}</svg>
  <g fill="url(#g)" stroke="#6b4a17" stroke-width="0.35" filter="url(#s)" font-family="'Cinzel Decorative', serif">
    <text x="50" y="21" font-size="12" font-weight="700" letter-spacing="2.3">Two-edged</text>
    <text x="49" y="46.5" font-size="27" font-weight="900" letter-spacing="0.6">Sword</text>
  </g>
</svg>
<div class="what">For the word of God is quick, and powerful, and sharper than any twoedged sword, piercing even to the dividing asunder of soul and spirit, and of the joints and marrow, and is a discerner of the thoughts and intents of the heart.<span class="cite">Hebrews 4:12</span></div>
</div></body></html>"""


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        page = pathlib.Path(tmp) / "logo.html"
        shot = pathlib.Path(tmp) / "logo.png"
        page.write_text(PAGE)
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--force-device-scale-factor=3",
                "--default-background-color=00000000",
                f"--window-size={W},{TALL}",
                "--virtual-time-budget=3000",
                "--allow-file-access-from-files",
                f"--screenshot={shot}",
                page.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
        big = Image.open(shot).convert("RGBA")
        bottom = big.getbbox()[3]
        H = -(-bottom // 3) + 2  # in points, rounded up, with room under the citation
        big = big.crop((0, 0, W * 3, H * 3))

    ios = ROOT / "mobile/src-tauri/gen/apple/Assets.xcassets/SplashLogo.imageset"
    ios.mkdir(parents=True, exist_ok=True)
    for n, name in ((1, "logo.png"), (2, "logo@2x.png"), (3, "logo@3x.png")):
        (big if n == 3 else big.resize((W * n, H * n), Image.LANCZOS)).save(ios / name)
    (ios / "Contents.json").write_text(
        '{\n  "images" : [\n'
        '    { "filename" : "logo.png", "idiom" : "universal", "scale" : "1x" },\n'
        '    { "filename" : "logo@2x.png", "idiom" : "universal", "scale" : "2x" },\n'
        '    { "filename" : "logo@3x.png", "idiom" : "universal", "scale" : "3x" }\n'
        '  ],\n  "info" : { "author" : "xcode", "version" : 1 }\n}\n'
    )
    android = ROOT / "mobile/src-tauri/gen/android/app/src/main/res/drawable-xxhdpi"
    android.mkdir(parents=True, exist_ok=True)
    big.save(android / "splash_logo.png")
    big.save(ROOT / "mobile/public/splash-logo.png")
    print(f"opening image {W}x{H} pt written for iOS, Android and the page")


if __name__ == "__main__":
    main()
