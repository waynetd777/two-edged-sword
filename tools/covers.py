# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Book covers for the reference books the tools build: drawn afresh, as a cloth-bound book looks new. A cover opens
the book (at the top of its first chapter) and a small copy opens its description (the app's About tab, where it sits
at the top right).

Larkin's books (tools/larkin) are drawn from their scans: the cloth's colour, the lettering where the scan has it and
the printed emblems cleaned from the scan. The books with no scan (tools/ccel, tools/gutenberg, Scofield in tools/core)
are designed (`design`): a cloth colour, the title and author stamped in gold or ink, a ruled frame and an ornament.

The lettering is in free typefaces from Google Fonts (SIL Open Font License), downloaded at a pinned commit and checked
against their sha256, into CACHES/covers.
"""
import base64, io
from pathlib import Path

from modules import CACHES, fetch

CACHE = CACHES / "covers"
FONTS = {
    "goudy": ("ofl/goudybookletter1911/GoudyBookletter1911.ttf", "62d219942d2e4a3a8473c116254966d308820ae1729e2fac3730e66c073a5548"),
    "fraktur": ("ofl/unifrakturmaguntia/UnifrakturMaguntia-Book.ttf", "d64afc0547059dd2e4a78da48bda0aba0a9901be58c7f8c201a8b2b6b4492cc8"),
    "cinzel": ("ofl/cinzel/Cinzel%5Bwght%5D.ttf", "f4d83d34d1f6c741193e4acf4b3dff9531e5a67b6aa65228d00a7db72a4e0f34"),
    "fell": ("ofl/imfellenglish/IMFeENrm28P.ttf", "fe9705bbde51af802719246d4608d08d37bde956ab99d9a590da996a5221a24c"),
    "fellsc": ("ofl/imfellenglishsc/IMFeENsc28P.ttf", "102324fb5434bb5da7963533426b0ad44c85bbc9e7755067535c9d11464a176b"),
    "greek": ("ofl/gfsdidot/GFSDidot-Regular.ttf", "4fc784ab824e8866eeef8ad55976b93e7e170fb1b8237fd4f8781b5b4dd297f9"),
    "hebrew": ("ofl/frankruhllibre/FrankRuhlLibre%5Bwght%5D.ttf", "f9bf26966681037aae894b031bd0dcf2c1bfdfa128dd0640cf276fe62a338a43"),
    "syriac": ("ofl/notosanssyriac/NotoSansSyriac%5Bwght%5D.ttf", "775585cc3c12877115d588f70af3aa140c78cb440f9d42c98273bf05bed3f6b1"),
}
FONT_URL = "https://raw.githubusercontent.com/google/fonts/e7db6ca603fd4862010383ff17ffd6cc4ffac1c0/{}"
GOLD = "gold"


def font(name, size):
    from PIL import ImageFont
    path, sha = FONTS[name]
    return ImageFont.truetype(str(fetch(FONT_URL.format(path), CACHE / Path(path).name, sha256=sha)), size)


def cloth(w, h, rgb):
    """New book cloth: an even colour with a fine, regular weave and a soft light from above."""
    import numpy as np
    yy, xx = np.mgrid[0:h, 0:w]
    weave = 2.2 * np.sin(xx * 2.0) * np.sin(yy * 0.7) + 1.6 * np.sin(yy * 2.2) + 1.6 * np.sin(xx * 1.9 + 1)
    light = 6 * (1 - yy / h) - 3
    return np.clip(np.array(rgb, float) + (weave + light)[..., None] * (np.array(rgb) / 120 + .15), 0, 255)


def words(w, h, lines):
    """Lettering as a mask, each line (text, font, cap height, baseline, width, centre): capitals sized by their
    height and spaced out to their width, or (cap height None) a line sized by its width."""
    import numpy as np
    from PIL import Image, ImageDraw
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    for txt, face, cap, base, width, cx in lines:
        if cap:
            top, bottom = font(face, 1000).getbbox("H")[1::2]
            f = font(face, int(cap / (bottom - top) * 1000))
            adv = [d.textlength(c, font=f) for c in txt]
            track = (width - (sum(adv) - adv[-1] + f.getbbox(txt[-1])[2])) / max(1, len(txt) - 1)
            x = cx - width / 2
            for c, a in zip(txt, adv):
                d.text((x, base), c, font=f, fill=255, anchor="ls")
                x += a + track
        else:
            f = font(face, int(100 * width / d.textlength(txt, font=font(face, 100))))
            d.text((cx, base), txt, font=f, fill=255, anchor="ms")
    return np.asarray(m, float) / 255


def printed(im, src, box, w, h, ground=None, channel=None):
    """An emblem printed on a cover, cut from a scan (`src`, its pixels) and set at `box` on the new one, as a clean
    mask: the ink darker than the cloth round it (or than `ground`, for an emblem that's mostly ink), its speckle
    smoothed and its edges sharp, as if freshly printed. `channel` ("R") judges by one colour, where black ink on red
    cloth differs most."""
    import numpy as np
    from PIL import Image, ImageFilter
    c = im.crop(src)
    a = np.asarray((c.getchannel(channel) if channel else c.convert("L")).filter(ImageFilter.MedianFilter(5)), float)
    if ground is None:
        ground = np.median(np.concatenate([a[:8].ravel(), a[-8:].ravel(), a[:, :8].ravel(), a[:, -8:].ravel()]))
    x0, y0, x1, y1 = box
    m = Image.fromarray(np.clip((ground - a - 6) * 8, 0, 255).astype("uint8")).resize((x1 - x0, y1 - y0), Image.LANCZOS)
    out = np.zeros((h, w))
    out[y0:y1, x0:x1] = np.clip((np.asarray(m.filter(ImageFilter.GaussianBlur(0.6)), float) / 255 - .45) * 4, 0, 1)
    return out


def gold(img, mask):
    """Gold leaf stamped into the cloth: a smooth sheen, and a fine dark edge where it's pressed in."""
    import numpy as np
    from PIL import Image, ImageFilter
    h, w = mask.shape
    t = np.cos(np.mgrid[0:h, 0:w][0] / h * 9)
    g = np.stack([222 + 18 * t, 182 + 18 * t, 98 + 14 * t], -1)
    edge = np.asarray(Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MaxFilter(3)), float)[..., None] / 255
    img = img * (1 - .35 * edge)
    return img * (1 - mask[..., None]) + g * mask[..., None]


def ink(img, mask, rgb):
    """Ink printed on the cloth."""
    return img * (1 - mask[..., None]) + mask[..., None] * rgb


def _ornament(d, kind, cx, cy, s):
    """A small stamped ornament, `s` across, centred at (cx, cy)."""
    if kind == "cross":  # a cross with flared ends in a ring
        d.ellipse((cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2), outline=255, width=max(3, s // 28))
        a, t = s * .36, s * .07
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            ex, ey = cx + dx * a, cy + dy * a
            px, py = -dy, dx
            d.polygon([(cx + px * t, cy + py * t), (ex + px * t * 2.2, ey + py * t * 2.2),
                       (ex - px * t * 2.2, ey - py * t * 2.2), (cx - px * t, cy - py * t)], fill=255)
    elif kind == "diamonds":  # three diamonds on a rule
        r = s * .09
        d.line((cx - s, cy, cx + s, cy), fill=255, width=max(2, s // 40))
        for x, k in ((cx - s * .45, .7), (cx, 1.0), (cx + s * .45, .7)):
            d.polygon([(x, cy - r * 1.8 * k), (x + r * k, cy), (x, cy + r * 1.8 * k), (x - r * k, cy)], fill=255)
    elif kind == "star":  # an eight-pointed star in a ring
        import math
        d.ellipse((cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2), outline=255, width=max(3, s // 28))
        pts = [(cx + (s * .4 if i % 2 == 0 else s * .17) * math.cos(math.pi * i / 8 - math.pi / 2),
                cy + (s * .4 if i % 2 == 0 else s * .17) * math.sin(math.pi * i / 8 - math.pi / 2)) for i in range(16)]
        d.polygon(pts, fill=255)
    elif kind == "lamp":  # an oil lamp with its flame
        d.ellipse((cx - s * .42, cy - s * .02, cx + s * .3, cy + s * .2), fill=255)
        d.polygon([(cx + s * .25, cy + s * .02), (cx + s * .5, cy - s * .06), (cx + s * .48, cy + s * .04), (cx + s * .25, cy + s * .14)], fill=255)
        d.arc((cx - s * .55, cy - s * .02, cx - s * .3, cy + s * .2), 90, 270, fill=255, width=max(3, s // 25))
        d.rectangle((cx - s * .2, cy + s * .2, cx + s * .08, cy + s * .26), fill=255)
        d.polygon([(cx + s * .5, cy - s * .08), (cx + s * .44, cy - s * .2), (cx + s * .5, cy - s * .36), (cx + s * .56, cy - s * .2)], fill=255)
    elif kind == "harp":  # David's harp: a pillar, a sound box rising to the right, a curved neck across the top, and its strings
        w = max(3, s // 30)
        foot, top, box = (cx - s * .26, cy + s * .46), (cx - s * .3, cy - s * .36), (cx + s * .32, cy - s * .26)
        c1, c2 = (cx - s * .05, cy - s * .12), (cx + s * .14, cy - s * .58)
        neck = [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * e + t ** 3 * f
                      for a, b, e, f in zip(top, c1, c2, box)) for t in (i / 40 for i in range(41))]
        d.line(neck, fill=255, width=w * 2, joint="curve")
        d.line([top, (cx - s * .36, cy + s * .05), foot], fill=255, width=w * 2, joint="curve")
        d.line([foot, box], fill=255, width=w * 4)
        d.ellipse((top[0] - w * 2, top[1] - w * 2, top[0] + w * 2, top[1] + w * 2), fill=255)
        for i in range(1, 8):
            x = top[0] + (box[0] - top[0]) * i / 8
            y0 = min(neck, key=lambda p: abs(p[0] - x))[1]
            y1 = foot[1] + (x - foot[0]) * (box[1] - foot[1]) / (box[0] - foot[0])
            if y1 > y0:
                d.line((x, y0, x, y1), fill=255, width=max(1, w // 2))


def bitmap(module):
    """One of the app's pictures (src/pictures/<module>.ts, made by tools/bitmap.py) as a grey image with its fade
    in its alpha."""
    import re
    from PIL import Image
    src = (Path(__file__).resolve().parent.parent / "src/pictures" / f"{module}.ts").read_text()
    data = re.sub(r"[^A-Za-z0-9+/=]", "", re.search(r"base64,([^;]+?)\";", src, re.S)[1])
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("LA")


def _plate(img, module, box):
    """One of the app's pictures as a plate set into the cover at `box`: printed in a dark sepia on cream paper, its
    faded edges going to the paper."""
    import numpy as np
    from PIL import Image
    x0, y0, x1, y1 = box
    im = bitmap(module)
    k = max((x1 - x0) / im.width, (y1 - y0) / im.height) * 1.3  # in on the subject, past the picture's faded margin
    im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    l, t = (im.width - (x1 - x0)) // 2, (im.height - (y1 - y0)) // 2
    a = np.asarray(im.crop((l, t, l + x1 - x0, t + y1 - y0)), float) / 255
    tone = a[..., 0] * a[..., 1] + (1 - a[..., 1]) * .82  # where it fades, the paper
    tone = np.clip((tone - .12) / .8, 0, 1)[..., None]
    ink, paper = np.array([58, 40, 30], float), np.array([236, 226, 202], float)
    img[y0:y1, x0:x1] = ink * (1 - tone) + paper * tone
    return img


def design(title, author, rgb, stamp=GOLD, ornament="diamonds", w=900, h=1400, picture=None):
    """A cloth cover designed for a book with no scan of one: `title` and `author` are lists of (text, cap height)
    lines in capitals, the title centred in the upper half and the author near the foot, a double ruled frame round
    them, and an ornament between (or `picture`, one of the app's pictures, src/pictures/<picture>.ts, set in as a
    plate); stamped in gold, or in ink (an RGB colour)."""
    import numpy as np
    from PIL import Image, ImageDraw
    frame = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(frame)
    d.rectangle((48, 48, w - 48, h - 48), outline=255, width=7)
    d.rectangle((66, 66, w - 66, h - 66), outline=255, width=2)
    for x, y in ((66, 66), (w - 66, 66), (66, h - 66), (w - 66, h - 66)):  # a small square at each corner
        d.rectangle((x - 9, y - 9, x + 9, y + 9), fill=255)
    plate = (w // 2 - 160, 600, w // 2 + 160, 1000)
    if picture:  # the plate's gilt rule
        d.rectangle((plate[0] - 14, plate[1] - 14, plate[2] + 14, plate[3] + 14), outline=255, width=3)
        d.rectangle((plate[0] - 5, plate[1] - 5, plate[2] + 5, plate[3] + 5), outline=255, width=2)
    else:
        _ornament(d, ornament, w // 2, 790, 150)
    lines, room = [], w - 220

    def block(rows, middle):
        gap = [c * .55 for _, c in rows]
        total = sum(c for _, c in rows) + sum(gap[:-1])
        y = middle - total / 2
        for (text, cap), g in zip(rows, gap):
            y += cap
            top, bottom = font("goudy", 1000).getbbox("H")[1::2]
            f = font("goudy", int(cap / (bottom - top) * 1000))
            natural = ImageDraw.Draw(frame).textlength(text, font=f)
            width = min(room, natural + cap * .14 * max(0, len(text) - 1))  # spaced out a little, within the frame
            lines.append((text, "goudy", cap if natural <= room else cap * room / natural, y, width, w / 2))
            y += g

    block(title, 430)
    block(author, 1130)
    mask = np.maximum(np.asarray(frame, float) / 255, words(w, h, lines))
    base = cloth(w, h, rgb)
    if picture:
        base = _plate(base, picture, plate)
    return gold(base, mask) if stamp == GOLD else ink(base, mask, stamp)


def html(pixels):
    """A cover as the app shows it: a picture to open the book with, and a smaller copy for its description."""
    import numpy as np
    from PIL import Image
    im = Image.fromarray(np.clip(pixels, 0, 255).astype("uint8")) if not isinstance(pixels, Image.Image) else pixels

    def webp(size):
        s = im.copy()
        s.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        s.save(buf, "WEBP", quality=85, method=6)
        return base64.b64encode(buf.getvalue()).decode()
    return (f'<p><img src="data:image/webp;base64,{webp(1400)}"></p>',
            f'<p><img src="data:image/webp;base64,{webp(600)}"></p>')  # sharp in the About views, and enlarged


# The full kit, for the covers of every module (CATALOG, in tools/covers_catalog.py): materials, stamps, borders,
# emblems and layouts, so that a library of a hundred covers doesn't look like one cover a hundred times. A cover is
# drawn from a spec (a dict; see `render`), in pixels of a cover 900 x 1400.

def material(w, h, kind, rgb):
    """A cover's ground, new: book cloth, a finer linen, a coarse buckram, grained leather, or smooth paper."""
    import numpy as np
    from PIL import Image, ImageFilter
    rgb = np.array(rgb, float)
    yy, xx = np.mgrid[0:h, 0:w]
    light = (5 * (1 - yy / h) - 2.5)
    if kind == "cloth":
        tex = 2.2 * np.sin(xx * 2.0) * np.sin(yy * 0.7) + 1.6 * np.sin(yy * 2.2) + 1.6 * np.sin(xx * 1.9 + 1)
    elif kind == "linen":
        tex = 1.4 * np.sin(xx * 2.8) + 1.4 * np.sin(yy * 2.6) + 1.2 * np.sin((xx + yy) * 0.9)
    elif kind == "buckram":
        tex = 3.2 * np.sign(np.sin(xx * 1.1)) * np.sign(np.sin(yy * 1.05)) + 1.5 * np.sin(yy * 0.5)
    elif kind == "leather":
        r = np.random.default_rng(7)
        g = np.asarray(Image.fromarray((r.random((h, w)) * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.9)), float)
        tex = (g - g.mean()) * 0.3
        light = light * 1.6 + 6 * np.exp(-((xx - w * .35) ** 2 + (yy - h * .3) ** 2) / (2 * (w * .6) ** 2))  # a soft sheen
    else:  # smooth paper
        tex = np.zeros((h, w))
    return np.clip(rgb + (tex + light)[..., None] * (rgb / 120 + .15), 0, 255)


def stamp(img, mask, how):
    """Lettering and ornament put on a cover: gold or silver leaf, blind (pressed in, darker, with no colour), or
    ink of an (r, g, b)."""
    import numpy as np
    from PIL import Image, ImageFilter
    if how == "gold":
        return gold(img, mask)
    if how == "silver":
        h, w = mask.shape
        t = np.cos(np.mgrid[0:h, 0:w][0] / h * 9)
        s = np.stack([206 + 20 * t, 210 + 20 * t, 214 + 20 * t], -1)
        edge = np.asarray(Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MaxFilter(3)), float)[..., None] / 255
        img = img * (1 - .35 * edge)
        return img * (1 - mask[..., None]) + s * mask[..., None]
    if how == "blind":
        lit = np.roll(np.roll(mask, 2, 0), 2, 1)
        return np.clip(img * (1 - .5 * mask[..., None]) + 30 * np.clip(lit - mask, 0, 1)[..., None], 0, 255)
    return ink(img, mask, how)


def _canvas(w, h):
    from PIL import Image, ImageDraw
    m = Image.new("L", (w, h), 0)
    return m, ImageDraw.Draw(m)


def _arr(m):
    import numpy as np
    return np.asarray(m, float) / 255


def border(d, kind, w, h, box=None):
    """A border round the cover (or round `box`): double, single, triple (thin, thick, thin), beaded, a Greek key,
    corner pieces, a rope, an arched top, or none."""
    import math
    x0, y0, x1, y1 = box or (48, 48, w - 48, h - 48)
    if kind == "double":
        d.rectangle((x0, y0, x1, y1), outline=255, width=7)
        d.rectangle((x0 + 18, y0 + 18, x1 - 18, y1 - 18), outline=255, width=2)
        for x, y in ((x0 + 18, y0 + 18), (x1 - 18, y0 + 18), (x0 + 18, y1 - 18), (x1 - 18, y1 - 18)):
            d.rectangle((x - 9, y - 9, x + 9, y + 9), fill=255)
    elif kind == "single":
        d.rectangle((x0 + 10, y0 + 10, x1 - 10, y1 - 10), outline=255, width=4)
    elif kind == "triple":
        d.rectangle((x0, y0, x1, y1), outline=255, width=2)
        d.rectangle((x0 + 9, y0 + 9, x1 - 9, y1 - 9), outline=255, width=7)
        d.rectangle((x0 + 22, y0 + 22, x1 - 22, y1 - 22), outline=255, width=2)
    elif kind == "beaded":
        d.rectangle((x0, y0, x1, y1), outline=255, width=3)
        d.rectangle((x0 + 32, y0 + 32, x1 - 32, y1 - 32), outline=255, width=3)
        for a, b, n in (((x0 + 16, y0 + 16), (x1 - 16, y0 + 16), 0), ((x0 + 16, y1 - 16), (x1 - 16, y1 - 16), 0),
                        ((x0 + 16, y0 + 16), (x0 + 16, y1 - 16), 1), ((x1 - 16, y0 + 16), (x1 - 16, y1 - 16), 1)):
            length = math.dist(a, b)
            for i in range(int(length // 22) + 1):
                x, y = a[0] + (b[0] - a[0]) * i * 22 / length, a[1] + (b[1] - a[1]) * i * 22 / length
                d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=255)
    elif kind == "greek":  # a meander band between two rules
        d.rectangle((x0, y0, x1, y1), outline=255, width=3)
        d.rectangle((x0 + 44, y0 + 44, x1 - 44, y1 - 44), outline=255, width=3)
        u = 11
        def key(x, y, horizontal):
            pts = [(0, 3), (0, 0), (3, 0), (3, 2), (1, 2), (1, 1), (2, 1)] if horizontal else [(3, 0), (0, 0), (0, 3), (2, 3), (2, 1), (1, 1), (1, 2)]
            d.line([(x + px * u, y + py * u) for px, py in pts], fill=255, width=3)
        for x in range(int(x0 + 10), int(x1 - 40), 3 * u + 4):
            key(x, y0 + 7, True)
            key(x, y1 - 37, True)
        for y in range(int(y0 + 48), int(y1 - 70), 3 * u + 4):
            key(x0 + 7, y, False)
            key(x1 - 37, y, False)
    elif kind == "corners":  # a single rule with fleurons in its corners
        d.rectangle((x0 + 6, y0 + 6, x1 - 6, y1 - 6), outline=255, width=3)
        for cx, cy, sx, sy in ((x0 + 6, y0 + 6, 1, 1), (x1 - 6, y0 + 6, -1, 1), (x0 + 6, y1 - 6, 1, -1), (x1 - 6, y1 - 6, -1, -1)):
            d.polygon([(cx, cy), (cx + sx * 90, cy), (cx + sx * 40, cy + sy * 14), (cx + sx * 14, cy + sy * 40), (cx, cy + sy * 90)], fill=255)
            d.ellipse((cx + sx * 46 - 9, cy + sy * 46 - 9, cx + sx * 46 + 9, cy + sy * 46 + 9), fill=255)
            d.line((cx + sx * 20, cy + sy * 70, cx + sx * 70, cy + sy * 20), fill=255, width=3)
    elif kind == "rope":  # a twisted rope between rules
        d.rectangle((x0, y0, x1, y1), outline=255, width=2)
        d.rectangle((x0 + 24, y0 + 24, x1 - 24, y1 - 24), outline=255, width=2)
        for x in range(int(x0), int(x1), 12):
            d.line((x, y0 + 22, x + 12, y0 + 2), fill=255, width=4)
            d.line((x, y1 - 2, x + 12, y1 - 22), fill=255, width=4)
        for y in range(int(y0), int(y1), 12):
            d.line((x0 + 2, y + 12, x0 + 22, y), fill=255, width=4)
            d.line((x1 - 22, y + 12, x1 - 2, y), fill=255, width=4)
    elif kind == "arch":  # a rule with an arched top
        r = (x1 - x0) / 2 - 20
        cx = (x0 + x1) / 2
        top = y0 + 20 + r
        d.arc((cx - r, y0 + 20, cx + r, y0 + 20 + 2 * r), 180, 360, fill=255, width=5)
        d.line((x0 + 20, top, x0 + 20, y1 - 20), fill=255, width=5)
        d.line((x1 - 20, top, x1 - 20, y1 - 20), fill=255, width=5)
        d.line((x0 + 20, y1 - 20, x1 - 20, y1 - 20), fill=255, width=5)
        d.rectangle((x0, y0, x1, y1), outline=255, width=2)


def emblem(d, kind, cx, cy, s):
    """A stamped emblem `s` across, centred at (cx, cy)."""
    import math
    lw = max(3, int(s / 30))
    if kind in ("cross", "diamonds", "star", "lamp"):
        return _ornament(d, kind, int(cx), int(cy), int(s))
    if kind == "star6":
        for k in (0, 1):
            pts = [(cx + s * .45 * math.sin(math.pi * (2 * i / 3 + k / 3)), cy - s * .45 * math.cos(math.pi * (2 * i / 3 + k / 3))) for i in range(3)]
            d.polygon(pts, outline=255, width=lw + 2)
    elif kind == "menorah":
        base = cy + s * .42
        d.line((cx, cy - s * .38, cx, base), fill=255, width=lw + 3)
        for i in (1, 2, 3):
            r = s * .13 * i
            d.arc((cx - r, cy - s * .38 - r + s * .3, cx + r, cy - s * .38 + r + s * .3), 0, 180, fill=255, width=lw + 1)
            for x in (cx - r, cx + r):
                d.line((x, cy - s * .38, x, cy - s * .08), fill=255, width=lw + 1)
        for i in range(-3, 4):
            x = cx + s * .13 * i
            d.polygon([(x, cy - s * .5), (x - s * .03, cy - s * .42), (x, cy - s * .38), (x + s * .03, cy - s * .42)], fill=255)
        d.polygon([(cx - s * .2, base), (cx + s * .2, base), (cx + s * .12, base - s * .06), (cx - s * .12, base - s * .06)], fill=255)
    elif kind == "book":  # an open book
        for sgn in (-1, 1):
            d.polygon([(cx, cy - s * .18), (cx + sgn * s * .45, cy - s * .3), (cx + sgn * s * .45, cy + s * .22), (cx, cy + s * .32)], outline=255, width=lw)
            for i in range(1, 5):
                y = cy - s * .18 + i * s * .09
                d.line((cx + sgn * s * .07, y + s * .02, cx + sgn * s * .38, y - s * .08), fill=255, width=max(2, lw - 1))
    elif kind == "dove":
        d.ellipse((cx - s * .28, cy - s * .08, cx + s * .2, cy + s * .14), fill=255)
        d.ellipse((cx + s * .12, cy - s * .16, cx + s * .3, cy + s * .02), fill=255)
        d.polygon([(cx + s * .29, cy - s * .08), (cx + s * .4, cy - s * .05), (cx + s * .29, cy - s * .02)], fill=255)
        d.polygon([(cx - s * .1, cy), (cx - s * .3, cy - s * .45), (cx + s * .05, cy - s * .08)], fill=255)
        d.polygon([(cx - s * .02, cy), (cx + s * .02, cy - s * .48), (cx + s * .14, cy - s * .06)], fill=255)
        d.polygon([(cx - s * .26, cy + s * .02), (cx - s * .46, cy + s * .12), (cx - s * .42, cy - s * .04)], fill=255)
        d.line((cx - s * .4, cy + s * .32, cx + s * .1, cy + s * .2), fill=255, width=lw)  # an olive twig
        for i in range(3):
            x = cx - s * .3 + i * s * .14
            d.ellipse((x - s * .04, cy + s * .2 - i * s * .03, x + s * .04, cy + s * .26 - i * s * .03), fill=255)
    elif kind == "crown":
        y = cy + s * .18
        pts = [(cx - s * .4, y), (cx - s * .44, cy - s * .2), (cx - s * .22, cy), (cx, cy - s * .3), (cx + s * .22, cy), (cx + s * .44, cy - s * .2), (cx + s * .4, y)]
        d.polygon(pts, fill=255)
        d.rectangle((cx - s * .4, y + s * .04, cx + s * .4, y + s * .12), fill=255)
        for x, yy in ((cx - s * .44, cy - s * .2), (cx, cy - s * .3), (cx + s * .44, cy - s * .2)):
            d.ellipse((x - s * .05, yy - s * .12, x + s * .05, yy - s * .02), fill=255)
    elif kind == "anchor":
        d.line((cx, cy - s * .32, cx, cy + s * .38), fill=255, width=lw + 3)
        d.ellipse((cx - s * .08, cy - s * .48, cx + s * .08, cy - s * .32), outline=255, width=lw + 1)
        d.line((cx - s * .2, cy - s * .22, cx + s * .2, cy - s * .22), fill=255, width=lw + 2)
        d.arc((cx - s * .36, cy - s * .05, cx + s * .36, cy + s * .42), 20, 160, fill=255, width=lw + 3)
        for sgn in (-1, 1):
            x, y = cx + sgn * s * .34, cy + s * .24
            d.polygon([(x, y - s * .08), (x + sgn * s * .06, y + s * .02), (x - sgn * s * .06, y + s * .02)], fill=255)
    elif kind == "chirho":
        d.line((cx - s * .3, cy - s * .3, cx + s * .3, cy + s * .3), fill=255, width=lw + 3)
        d.line((cx + s * .3, cy - s * .3, cx - s * .3, cy + s * .3), fill=255, width=lw + 3)
        d.line((cx, cy - s * .45, cx, cy + s * .45), fill=255, width=lw + 3)
        d.arc((cx - s * .02, cy - s * .45, cx + s * .26, cy - s * .15), 270, 90, fill=255, width=lw + 3)
        d.ellipse((cx - s * .5, cy - s * .5, cx + s * .5, cy + s * .5), outline=255, width=lw)
    elif kind == "alphaomega":
        f = font("greek", int(s * .5))
        d.text((cx - s * .22, cy), "Α", font=f, fill=255, anchor="mm")
        d.text((cx + s * .22, cy), "Ω", font=f, fill=255, anchor="mm")
        d.ellipse((cx - s * .5, cy - s * .5, cx + s * .5, cy + s * .5), outline=255, width=lw)
    elif kind == "scroll":
        d.rectangle((cx - s * .32, cy - s * .2, cx + s * .32, cy + s * .2), outline=255, width=lw)
        for sgn in (-1, 1):
            x = cx + sgn * s * .38
            d.ellipse((x - s * .07, cy - s * .26, x + s * .07, cy + s * .26), outline=255, width=lw)
            d.line((x, cy - s * .34, x, cy + s * .34), fill=255, width=lw)
        for i in range(-2, 3):
            d.line((cx - s * .22, cy + i * s * .07, cx + s * .22, cy + i * s * .07), fill=255, width=max(2, lw - 1))
    elif kind == "wreath":  # a laurel wreath
        for sgn in (-1, 1):
            d.arc((cx - s * .4, cy - s * .4, cx + s * .4, cy + s * .4), 100 if sgn < 0 else -80, 260 if sgn < 0 else 80, fill=255, width=lw)
            for i in range(9):
                a = math.radians(110 + i * 18) if sgn < 0 else math.radians(70 - i * 18)
                x, y = cx + s * .4 * math.cos(a), cy + s * .4 * math.sin(a)
                ox, oy = math.cos(a) * s * .07, math.sin(a) * s * .07
                d.ellipse((x + ox - s * .04, y + oy - s * .025, x + ox + s * .04, y + oy + s * .025), fill=255)
                d.ellipse((x - ox * .2 - s * .03, y - oy * .2 - s * .04, x - ox * .2 + s * .03, y - oy * .2 + s * .04), fill=255)
    elif kind == "globe":
        d.ellipse((cx - s * .42, cy - s * .42, cx + s * .42, cy + s * .42), outline=255, width=lw + 1)
        for k in (.15, .3):
            d.ellipse((cx - s * k, cy - s * .42, cx + s * k, cy + s * .42), outline=255, width=max(2, lw - 1))
        d.line((cx, cy - s * .42, cx, cy + s * .42), fill=255, width=max(2, lw - 1))
        for k in (-.24, 0, .24):
            half = math.sqrt(max(0, .42 ** 2 - k ** 2))
            d.line((cx - s * half, cy + s * k, cx + s * half, cy + s * k), fill=255, width=max(2, lw - 1))
    elif kind == "tablets":
        for sgn in (-1, 1):
            x = cx + sgn * s * .2
            d.rounded_rectangle((x - s * .17, cy - s * .38, x + s * .17, cy + s * .38), radius=int(s * .17), outline=255, width=lw + 1)
            for i in range(5):
                d.line((x - s * .1, cy - s * .12 + i * s * .1, x + s * .1, cy - s * .12 + i * s * .1), fill=255, width=max(2, lw - 1))
    elif kind == "harp":
        d.line((cx - s * .28, cy + s * .4, cx - s * .28, cy - s * .38), fill=255, width=lw + 3)
        d.arc((cx - s * .28, cy - s * .46, cx + s * .4, cy + s * .1), 200, 340, fill=255, width=lw + 2)
        d.line((cx - s * .28, cy + s * .4, cx + s * .34, cy - s * .2), fill=255, width=lw + 2)
        for i in range(1, 7):
            x = cx - s * .28 + i * s * .09
            d.line((x, cy - s * .38 + abs(i - 3) * s * .015, x, cy + s * .4 - i * s * .09), fill=255, width=max(2, lw - 1))
    elif kind == "quill":
        d.polygon([(cx + s * .32, cy - s * .44), (cx - s * .02, cy - s * .1), (cx - s * .22, cy + s * .3), (cx + s * .06, cy - s * .02)], fill=255)
        d.line((cx - s * .22, cy + s * .3, cx - s * .32, cy + s * .44), fill=255, width=lw + 1)
        d.ellipse((cx - s * .44, cy + s * .3, cx - s * .16, cy + s * .46), outline=255, width=lw)  # its inkwell
    elif kind == "rosette":
        for i in range(8):
            a = math.pi * i / 4
            x, y = cx + s * .24 * math.cos(a), cy + s * .24 * math.sin(a)
            d.ellipse((x - s * .16, y - s * .16, x + s * .16, y + s * .16), outline=255, width=lw)
        d.ellipse((cx - s * .1, cy - s * .1, cx + s * .1, cy + s * .1), fill=255)
        d.ellipse((cx - s * .46, cy - s * .46, cx + s * .46, cy + s * .46), outline=255, width=lw)
    elif kind == "knot":  # an interlaced square knot
        r = s * .3
        for k in (0, 1):
            pts = [(cx + r * math.cos(math.pi / 4 * (2 * i + k)) * (1.4 if k else 1), cy + r * math.sin(math.pi / 4 * (2 * i + k)) * (1.4 if k else 1)) for i in range(4)]
            d.polygon(pts, outline=255, width=lw + 2)
        d.ellipse((cx - r * .5, cy - r * .5, cx + r * .5, cy + r * .5), outline=255, width=lw + 1)
    elif kind == "compass":  # a compass rose
        for i in range(8):
            a = math.pi * i / 4 - math.pi / 2
            long = s * (.46 if i % 2 == 0 else .3)
            x, y = cx + long * math.cos(a), cy + long * math.sin(a)
            px, py = -math.sin(a) * s * .06, math.cos(a) * s * .06
            d.polygon([(cx + px, cy + py), (x, y), (cx - px, cy - py)], fill=255)
        d.ellipse((cx - s * .34, cy - s * .34, cx + s * .34, cy + s * .34), outline=255, width=lw)
        f = font("cinzel", int(s * .14))
        d.text((cx, cy - s * .5), "N", font=f, fill=255, anchor="mb")
    elif kind == "wheat":
        d.line((cx, cy - s * .2, cx, cy + s * .46), fill=255, width=lw)
        for sgn in (-1, 1):
            d.line((cx, cy + s * .2, cx + sgn * s * .22, cy - s * .3), fill=255, width=lw)
        for x0, y0, x1, y1 in ((cx, cy - s * .2, cx, cy - s * .48), (cx, cy + s * .2, cx - s * .22, cy - s * .3), (cx, cy + s * .2, cx + s * .22, cy - s * .3)):
            for i in range(5):
                t = .35 + i * .14
                x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                d.ellipse((x - s * .055, y - s * .03, x + s * .015, y + s * .03), fill=255)
                d.ellipse((x - s * .015, y - s * .03, x + s * .055, y + s * .03), fill=255)
    elif kind == "lily":  # a fleur-de-lis
        d.polygon([(cx, cy - s * .48), (cx + s * .1, cy - s * .15), (cx, cy + s * .05), (cx - s * .1, cy - s * .15)], fill=255)
        for sgn in (-1, 1):
            d.arc((cx + sgn * s * .02 - s * .3, cy - s * .38, cx + sgn * s * .02 + s * .3, cy + s * .14), 180 if sgn > 0 else 270, 270 if sgn > 0 else 360, fill=255, width=lw + 4)
            d.line((cx + sgn * s * .1, cy + s * .2, cx + sgn * s * .2, cy + s * .44), fill=255, width=lw + 2)
        d.rectangle((cx - s * .22, cy + s * .06, cx + s * .22, cy + s * .14), fill=255)
        d.line((cx, cy + s * .14, cx, cy + s * .44), fill=255, width=lw + 2)
    elif kind == "flame":  # a flame, as a teardrop with its tip drawn up, on a lamp's rim
        d.ellipse((cx - s * .2, cy - s * .06, cx + s * .2, cy + s * .34), fill=255)
        d.polygon([(cx - s * .195, cy + s * .1), (cx + s * .04, cy - s * .5), (cx + s * .195, cy + s * .1)], fill=255)
        d.ellipse((cx - s * .08, cy + s * .1, cx + s * .08, cy + s * .28), fill=0)
        d.polygon([(cx - s * .078, cy + s * .18), (cx + s * .01, cy - s * .08), (cx + s * .078, cy + s * .18)], fill=0)
        d.rectangle((cx - s * .3, cy + s * .4, cx + s * .3, cy + s * .46), fill=255)
    elif kind == "sun":  # a sun rising over a line
        d.pieslice((cx - s * .24, cy - s * .1, cx + s * .24, cy + s * .38), 180, 360, fill=255)
        for i in range(9):
            a = math.pi + math.pi * (i + .5) / 9
            d.line((cx + s * .3 * math.cos(a), cy + s * .14 + s * .3 * math.sin(a), cx + s * .46 * math.cos(a), cy + s * .14 + s * .46 * math.sin(a)), fill=255, width=lw)
        d.line((cx - s * .5, cy + s * .16, cx + s * .5, cy + s * .16), fill=255, width=lw)
    elif kind == "moon":  # a crescent with a star, for evening
        d.ellipse((cx - s * .34, cy - s * .34, cx + s * .34, cy + s * .34), fill=255)
        d.ellipse((cx - s * .2, cy - s * .44, cx + s * .44, cy + s * .2), fill=0)
        _ornament(d, "star", int(cx + s * .22), int(cy + s * .14), int(s * .3))
    elif kind == "key":
        d.ellipse((cx - s * .34, cy - s * .34, cx - s * .02, cy - s * .02), outline=255, width=lw + 2)
        d.line((cx - s * .06, cy - s * .06, cx + s * .36, cy + s * .36), fill=255, width=lw + 2)
        for t in (.62, .78):
            x, y = cx - s * .06 + (s * .42) * t, cy - s * .06 + (s * .42) * t
            d.line((x, y, x + s * .1, y - s * .1), fill=255, width=lw + 2)


def _motif(d, kind, x, y, s):
    """A small motif for an all-over pattern."""
    if kind == "diamond":
        d.polygon([(x, y - s), (x + s * .6, y), (x, y + s), (x - s * .6, y)], outline=255, width=2)
    elif kind == "dot":
        d.ellipse((x - s * .4, y - s * .4, x + s * .4, y + s * .4), fill=255)
    elif kind == "cross":
        d.line((x - s * .5, y, x + s * .5, y), fill=255, width=3)
        d.line((x, y - s * .5, x, y + s * .5), fill=255, width=3)
    elif kind == "star":
        _ornament(d, "star", int(x), int(y), int(s * 1.4))
    elif kind == "lily":
        emblem(d, "lily", x, y, s * 1.6)
    elif kind == "star6":
        emblem(d, "star6", x, y, s * 1.6)


def _line(d, w, text, face, cap, base, room, spacing=.12, cx=None):
    """One line of lettering, centred: capitals of `cap` height, spaced out a little and narrowed to fit `room`.
    Hebrew and Syriac are set right to left (with the shaping that needs libraqm; without it, the line is left out)."""
    from PIL import features
    cx = w / 2 if cx is None else cx
    rtl = face in ("hebrew", "syriac")
    if rtl:
        if not features.check("raqm"):
            return
        f = font(face, int(cap * 1.5))
        width = d.textlength(text, font=f, direction="rtl")
        if width > room:
            f = font(face, int(cap * 1.5 * room / width))
        d.text((cx, base), text, font=f, fill=255, anchor="ms", direction="rtl")
        return
    probe = "Η" if face == "greek" else "H"
    top, bottom = font(face, 1000).getbbox(probe)[1::2]
    size = cap / (bottom - top) * 1000
    f = font(face, int(size))
    adv = [d.textlength(c, font=f) for c in text]
    natural = sum(adv)
    track = cap * spacing
    if natural + track * (len(text) - 1) > room:
        track = max(0, (room - natural) / max(1, len(text) - 1))
        if natural > room:
            f = font(face, int(size * room / natural))
            adv = [d.textlength(c, font=f) for c in text]
            natural = sum(adv)
    x = cx - (natural + track * (len(text) - 1)) / 2
    for c, a in zip(text, adv):
        d.text((x, base), c, font=f, fill=255, anchor="ls")
        x += a + track


def _block(d, w, rows, middle, face, room):
    """Lines of lettering, centred as a block on `middle`. A row is (text, cap height) or (text, cap height, font)."""
    rows = [r if len(r) == 3 else (*r, face) for r in rows]
    heights = [c * (1.5 if f in ("hebrew", "syriac") else 1) for _, c, f in rows]
    total = sum(heights) + sum(h * .6 for h in heights[:-1])
    y = middle - total / 2
    for (text, cap, f), hgt in zip(rows, heights):
        y += hgt
        _line(d, w, text, f, cap, y, room)
        y += hgt * .6
    return middle - total / 2, middle + total / 2


def render(spec, w=900, h=1400):
    """A cover from its spec:

    base       (material, rgb): cloth, linen, buckram, leather or smooth
    stamp      gold, silver, blind or an (r, g, b) ink, for the lettering and ornament
    layout     classic (title, emblem, author), top (title high, a large emblem), label (the title on a coloured
               label), band (on a band across the cover), halfbound (leather spine and corners, cloth sides, a label),
               or pattern (an all-over pattern, the title in a panel clear of it)
    font       goudy, cinzel, fell or fellsc for the lettering; a row can name its own (greek, hebrew, syriac, …)
    title, sub rows of (text, cap height[, font]): the title, and the author or edition near the foot
    border     a border (see `border`); emblem: an emblem (see `emblem`), or None
    accent     the label's, band's or leather's colour; motif: the pattern's (see `_motif`)
    badge      a short line in a small panel above the foot ("WITH STRONG'S NUMBERS")
    """
    import numpy as np
    from PIL import Image, ImageDraw
    kind, rgb = spec["base"]
    img = material(w, h, kind, rgb)
    how = spec.get("stamp", "gold")
    face = spec.get("font", "goudy")
    layout = spec.get("layout", "classic")
    accent = spec.get("accent")
    m, d = _canvas(w, h)
    room = w - 240
    if layout == "halfbound":  # leather on the spine and corners, a gilt fillet where it meets the cloth
        leather = material(w, h, "leather", accent)
        part = Image.new("L", (w, h), 0)
        p = ImageDraw.Draw(part)
        p.rectangle((0, 0, 150, h), fill=255)
        p.polygon([(w, 0), (w - 210, 0), (w, 210)], fill=255)
        p.polygon([(w, h), (w - 210, h), (w, h - 210)], fill=255)
        a = _arr(part)[..., None]
        img = img * (1 - a) + leather * a
        d.line((150, 0, 150, h), fill=255, width=4)
        d.line((w - 210, 0, w, 210), fill=255, width=4)
        d.line((w - 210, h, w, h - 210), fill=255, width=4)
        for y in (180, 360, 1040, 1220):  # bands across the spine
            d.rectangle((18, y, 132, y + 6), fill=255)
            d.rectangle((18, y + 14, 132, y + 17), fill=255)
        room, cx = w - 330, 150 + (w - 150) / 2
    else:
        cx = w / 2
        border(d, spec.get("border", "double"), w, h)
    lab = None
    if layout in ("label", "halfbound"):
        lab = (cx - (w - 330) / 2 - 10, 300, cx + (w - 330) / 2 + 10, 640) if layout == "halfbound" else (130, 290, w - 130, 640)
    elif layout == "band":
        lab = (66, 300, w - 66, 640)
    if layout == "halfbound":  # a second label, lower, for the author or edition
        x0, x1 = cx - (w - 330) / 2 + 40, cx + (w - 330) / 2 - 40
        a = np.zeros((h, w))
        a[1050:1250, int(x0):int(x1)] = 1
        img = img * (1 - a[..., None]) + material(w, h, "leather", accent) * a[..., None]
        d.rectangle((x0 + 10, 1060, x1 - 10, 1240), outline=255, width=2)
    if lab:
        x0, y0, x1, y1 = lab
        a = np.zeros((h, w))
        a[int(y0):int(y1), int(x0):int(x1)] = 1
        img = img * (1 - a[..., None]) + material(w, h, "leather", accent) * a[..., None]
        d.rectangle((x0 + 10, y0 + 10, x1 - 10, y1 - 10), outline=255, width=2)
        if layout == "band":
            d.line((x0, y0, x1, y0), fill=255, width=4)
            d.line((x0, y1, x1, y1), fill=255, width=4)
    if layout == "pattern":  # an all-over pattern, cleared round a panel for the title
        pm, pd = _canvas(w, h)
        for j, y in enumerate(range(110, h - 90, 56)):
            for x in range(110 + (28 if j % 2 else 0), w - 90, 56):
                _motif(pd, spec.get("motif", "diamond"), x, y, 12)
        pd.rounded_rectangle((120, 250, w - 120, 700), radius=40, fill=0)
        pd.rounded_rectangle((200, 1030, w - 200, 1260), radius=30, fill=0)
        d.rounded_rectangle((136, 266, w - 136, 684), radius=30, outline=255, width=4)
        d.rounded_rectangle((214, 1044, w - 214, 1246), radius=22, outline=255, width=3)
        img = stamp(img, _arr(pm), "blind" if how != "blind" else (0, 0, 0))
    mid = {"top": 330, "pattern": 470}.get(layout, 470)
    rows = spec.get("title", [])
    tm, td = _canvas(w, h)
    top, bottom = _block(td, w if layout != "halfbound" else int(cx * 2), rows, mid, face, room if not lab else (lab[2] - lab[0]) - 70)
    if spec.get("emblem"):
        y, s = (820, 360) if layout == "top" else (845, 150) if layout != "pattern" else (0, 0)
        if s:
            emblem(d, spec["emblem"], cx, y, s)
    if spec.get("sub"):
        _block(td, int(cx * 2) if layout == "halfbound" else w, spec["sub"], 1150 if layout == "halfbound" else 1145, face,
               w - 460 if layout in ("pattern", "halfbound") else room)
    if spec.get("badge"):
        bm = int(cx * 2) if layout == "halfbound" else w
        d.line((cx - 150, 1232, cx + 150, 1232), fill=255, width=2)
        _line(td, bm, spec["badge"], face, 20, 1268, room)
    mask = np.maximum(_arr(m), _arr(tm))
    if lab and spec.get("label_stamp"):  # lettering on the label in its own stamp
        inside = np.zeros((h, w))
        inside[int(lab[1]):int(lab[3]), int(lab[0]):int(lab[2])] = 1
        img = stamp(img, mask * inside, spec["label_stamp"])
        mask = mask * (1 - inside)
    return stamp(img, mask, how)


def with_cover(file, info):
    """A module's description with its cover's thumbnail at the start, from CATALOG (tools/covers_catalog), unless
    it has one already or the catalog has none for it."""
    import re
    from covers_catalog import CATALOG
    stem = file.rsplit(".", 1)[0]
    if stem not in CATALOG or re.match(r"\s*<p>\s*<img ", info or ""):
        return info
    return html(render(CATALOG[stem]))[1] + (info or "")


def apply(folder):
    """Puts the cover's thumbnail at the start of the description of each module in `folder` that the catalog has
    one for, replacing one put there before: for modules already built."""
    import re, sqlite3
    from covers_catalog import CATALOG
    for p in sorted(Path(folder).iterdir()):
        stem = p.name.rsplit(".", 1)[0]
        if stem not in CATALOG or p.suffix not in (".bbli", ".cmti", ".dcti", ".lexi", ".refi", ".devi"):
            continue
        db = sqlite3.connect(p)
        (info,) = db.execute("SELECT Information FROM Details").fetchone()
        info = re.sub(r"^\s*<p>\s*<img src=\"data:image/webp;base64,[^\"]*\">\s*</p>", "", info or "")
        db.execute("UPDATE Details SET Information = ?", (html(render(CATALOG[stem]))[1] + info,))
        db.commit()
        db.close()
        print(f"  {p.name}")


if __name__ == "__main__":
    import sys
    if sys.argv[1:2] == ["apply"]:
        for f in sys.argv[2:]:
            apply(f)
    else:
        sys.exit("python3 tools/covers.py apply <modules folder>…")
