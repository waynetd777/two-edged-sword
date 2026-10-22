# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds maps.refi ("Bible Maps"): maps of the Bible's lands drawn here, a chapter each, with a note on the
period and the places on the map, each with its verses.

    python3 tools/maps/build.py [--only jesus paul exodus tribes] [--pictures FOLDER] [--into PATH]

Writes to src-tauri/modules/ (bundled with the app, as tools/core's modules are; tools/core builds it with the
others), or to --into. --pictures saves each map's picture there too, to look at; --only draws just those.

Sources, all free to use:
  Terrain: Mapzen's Terrain Tiles (https://registry.opendata.aws/terrain-tiles/), Terrarium PNGs, whose data
    for these lands is SRTM and GMTED2010 (U.S. Geological Survey), ETOPO1 (NOAA) and, for Europe, EU-DEM
    (Copernicus): shaded relief, coloured by height.
  Coasts, lakes and rivers: Natural Earth (public domain), the 1:10m GeoJSON of
    https://github.com/nvkelso/natural-earth-vector at a fixed commit. Its modern canals are left out.
  Places: OpenBible.info's Bible geocoding data (CC BY 4.0), as tools/core reads it for places.dcti: each
    place at the site OpenBible thinks likeliest (not one whose coordinates it took from OpenStreetMap,
    whose licence is the ODbL), a solid dot where its confidence is 500 of 1000 or more, a hollow one with
    "?" below that. Names are spelt as the KJV spells them (of the names OpenBible records, the one its KJV
    verses use).
  Labels: EB Garamond (SIL Open Font License), the app's own, from node_modules/@fontsource/eb-garamond.
  Routes and regions: drawn here from the Bible's own lists of places (Paul's journeys from Acts, the
    Exodus from Exodus and Numbers 33), and the regions and tribes placed by hand at their accepted areas;
    boundaries aren't drawn. Where a place or route is disputed, the map says so.

Each map is a WebP picture inside its chapter (e-Sword's maps are pictures in a reference book too), and
the app shows the book on the Library's Maps card. Downloads are cached in ~/Library/Caches/Two-edged
Sword/maps.
"""
import base64, html, io, json, math, re, sqlite3, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from books import BOOKS  # noqa: E402
from modules import BUNDLED, CACHES, fetch, module  # noqa: E402

CACHE = CACHES / "maps"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/{}.geojson"
TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
GEO = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/7eb18a5ee62f27b9b93bd6689ea272d76dd23b8f/data/{}.jsonl"
FONTS = ROOT / "node_modules/@fontsource/eb-garamond/files"
WIDTH = 3600  # the picture's width: sharp full screen, with room to zoom in
SCALE = 2  # drawn at twice that and reduced, for smooth lines and lettering
K = SCALE * WIDTH / 2000  # sizes below are for a 2000-pixel map
TYPE = 1.6  # lettering and marks larger than that, to read with the whole map on the screen (zoom in for detail)
BOOK_ABBR = [b[2] for b in BOOKS]
OSIS = {b[1]: i + 1 for i, b in enumerate(BOOKS)}

# Colours: an atlas's, warm and quiet, readable on the app's light and dark pages alike.
SEA = (200, 218, 222)
LAKE = (182, 208, 216)
WATER_LINE = (96, 138, 156)
RIVER = (104, 148, 170)
HEIGHTS = [(-450, (205, 205, 166)), (0, (214, 212, 170)), (200, (224, 216, 172)), (500, (226, 210, 160)),
           (900, (214, 192, 142)), (1500, (196, 168, 122)), (2500, (170, 142, 104)), (4000, (150, 128, 100))]
INK = (58, 40, 24)
DOT = (122, 40, 24)
REGION = (120, 88, 56)
SEA_INK = (60, 98, 116)
ROUTE = (160, 40, 28)
HALO = (240, 232, 208)


def font(size, style="400-normal"):
    return ImageFont.truetype(str(FONTS / f"eb-garamond-latin-{style}.woff"), int(size * K * TYPE))


# ---------- the maps ----------

# Each map: its area (west, south, east, north), the places on it (OpenBible ids, or a rule), the regions and
# seas named by hand (name, lon, lat, size, letter spacing), routes (a list of places in order), and its note.
MAPS = [
    {
        "id": "jesus", "title": "The Land in the Time of Jesus",
        "bbox": (34.2, 30.95, 36.45, 33.45),
        "places": {"books": range(40, 45), "min_verses": 1},
        "regions": [("GALILEE", 35.33, 32.86, 17), ("SAMARIA", 35.22, 32.27, 17), ("JUDÆA", 35.05, 31.62, 17),
                    ("PERÆA", 35.73, 31.95, 15), ("DECAPOLIS", 35.95, 32.55, 15), ("IDUMÆA", 34.85, 31.2, 14),
                    ("PHŒNICIA", 35.28, 33.32, 13), ("TRACHONITIS", 36.2, 33.0, 12), ("ITURÆA", 35.85, 33.25, 12)],
        "seas": [("The Great Sea", 34.45, 32.6, 18, True), ("Sea of Galilee", 35.59, 32.82, 11, False),
                 ("Salt Sea", 35.5, 31.48, 12, False), ("Jordan", 35.6, 32.3, 11, False)],
        "note": "Palestine under the Herods and the Roman governors: Galilee and Peræa under Herod Antipas, Judæa and "
                "Samaria under the prefects, the Decapolis a league of Greek cities. The places are those the Gospels and "
                "Acts name; a hollow dot is a site OpenBible.info is less sure of.",
    },
    {
        "id": "paul", "title": "The Journeys of Paul",
        "bbox": (11.5, 30.8, 37.2, 42.2),
        "corner": "bottom-left", "scale": "top-right",  # Italy is at the top left, Judæa at the bottom right
        "places": {"route_only": True},
        "routes": [
            ("First journey (Acts 13–14)", (160, 40, 28), [
                "Antioch 1", "Seleucia", "Salamis", "Paphos", "Perga", "Antioch 2", "Iconium", "Lystra", "Derbe", "Lystra",
                "Iconium", "Antioch 2", "Perga", "Attalia", "Antioch 1"]),
            ("Second journey (Acts 15:36–18:22)", (34, 86, 140), [
                "Antioch 1", "Tarsus", "Derbe", "Lystra", "Iconium", "Troas", "Samothrace", "Neapolis", "Philippi",
                "Amphipolis", "Apollonia", "Thessalonica", "Berea", "Athens", "Corinth", "Cenchreae", "Ephesus",
                "Caesarea", "Jerusalem", "Antioch 1"]),
            ("Third journey (Acts 18:23–21:17)", (46, 120, 60), [
                "Antioch 1", "Tarsus", "Derbe", "Iconium", "Antioch 2", "Ephesus", "Troas", "Philippi", "Thessalonica",
                "Berea", "Corinth", "Berea", "Thessalonica", "Philippi", "Troas", "Assos", "Mitylene", "Chios", "Samos",
                "Miletus", "Cos", "Rhodes 1", "Patara", "Tyre", "Ptolemais", "Caesarea", "Jerusalem"]),
            ("To Rome (Acts 27–28)", (120, 60, 140), [
                "Caesarea", "Sidon", "Myra", "Cnidus", "Fair Havens", "Malta", "Syracuse", "Rhegium", "Puteoli",
                "Forum of Appius", "Three Taverns", "Rome"]),
        ],
        "regions": [("MACEDONIA", 22.6, 40.75, 14), ("ACHAIA", 22.2, 37.65, 14), ("ASIA", 28.6, 38.9, 15),
                    ("GALATIA", 32.4, 39.4, 14), ("CILICIA", 34.9, 37.15, 12), ("SYRIA", 36.6, 34.6, 13),
                    ("CYPRUS", 33.3, 35.35, 11), ("CRETE", 24.8, 34.95, 11), ("ITALY", 15.3, 41.1, 15),
                    ("JUDÆA", 35.05, 31.45, 11), ("PAMPHYLIA", 31.0, 37.15, 11), ("LYCAONIA", 33.2, 37.85, 11)],
        "seas": [("The Great Sea", 21.0, 33.6, 22, True), ("Ægean Sea", 25.0, 38.6, 14, True),
                 ("Adriatic Sea", 16.2, 42.0, 13, True)],
        "note": "Paul's three journeys and his voyage to Rome, from the places Acts names in order. Where Acts gives "
                "only a region (\"through Phrygia and Galatia\") the line runs between the towns either side, so the roads "
                "he took between them are a guess; the sea routes follow the coasts Acts describes.",
    },
    {
        "id": "exodus", "title": "The Exodus",
        "bbox": (29.6, 27.4, 36.3, 32.2),
        "places": {"named": ["Rameses", "Succoth 2", "Pithom", "Etham", "Pi-hahiroth", "Marah", "Elim", "Sin",
                             "Rephidim", "Mount Sinai", "Kadesh-barnea", "Ezion-geber", "Mount Hor 1", "Mount Nebo",
                             "Jericho 1", "Heshbon", "Dibon 1", "Hebron", "Beersheba 1", "Gaza", "Memphis", "Zoan", "Heliopolis"]},
        "routes": [("The traditional route", (160, 40, 28), [
            "Rameses", "Succoth 2", "Etham", "Pi-hahiroth", "Marah", "Elim", "Sin", "Rephidim", "Mount Sinai",
            "Ezion-geber", "Kadesh-barnea", "Mount Hor 1", "Mount Nebo"])],
        "regions": [("EGYPT", 30.6, 29.4, 18), ("GOSHEN", 31.75, 30.75, 12), ("WILDERNESS OF SHUR", 33.0, 30.75, 11),
                    ("WILDERNESS OF PARAN", 34.25, 30.0, 11), ("EDOM", 35.6, 30.5, 13), ("MOAB", 35.85, 31.35, 13),
                    ("MIDIAN", 35.5, 28.3, 13), ("CANAAN", 35.0, 31.75, 14), ("SINAI", 33.75, 28.9, 13)],
        "seas": [("The Great Sea", 32.6, 31.85, 17, True), ("Red Sea", 33.9, 27.55, 15, True),
                 ("Gulf of Suez", 32.75, 29.0, 10, False), ("Gulf of Aqaba", 34.7, 28.5, 10, False), ("Salt Sea", 35.5, 31.45, 10, False),
                 ("Nile", 31.05, 28.6, 11, False)],
        "note": "The route of the Exodus and most of its stations are disputed. This map follows the traditional route, "
                "south through Sinai to Jebel Musa as Mount Sinai, then north to Kadesh-barnea and round Edom to the plains "
                "of Moab (Numbers 33). Other proposals put the crossing farther north, by the Mediterranean, and Mount "
                "Sinai in the north of the peninsula or in Midian, east of the Gulf of Aqaba.",
    },
    {
        "id": "tribes", "title": "The Tribal Lands of Israel",
        "bbox": (34.2, 30.85, 36.55, 33.45),
        "places": {"named": ["Dan", "Hazor 1", "Kedesh 1", "Megiddo", "Jezreel 2", "Shechem", "Shiloh", "Bethel 1", "Gilgal 1",
                             "Jericho 1", "Jerusalem", "Gibeon", "Hebron", "Beersheba 1", "Gaza", "Ashkelon", "Ashdod", "Ekron",
                             "Gath 1", "Joppa", "Ramoth-gilead", "Mahanaim", "Bezer", "Golan", "Heshbon", "Dibon 1", "Acco",
                             "Tyre", "Sidon", "Bethlehem 1", "Dor", "Beth-shan", "Aroer 1", "Rabbah 1", "Kadesh-barnea"]},
        "regions": [("ASHER", 35.18, 33.0, 15), ("NAPHTALI", 35.55, 33.02, 15), ("ZEBULUN", 35.27, 32.76, 14),
                    ("ISSACHAR", 35.45, 32.58, 14), ("MANASSEH", 35.17, 32.37, 14), ("MANASSEH", 35.95, 32.75, 14),
                    ("EPHRAIM", 35.25, 32.11, 14), ("DAN", 34.85, 31.92, 13), ("DAN", 35.62, 33.28, 12),
                    ("BENJAMIN", 35.33, 31.86, 12), ("JUDAH", 35.0, 31.45, 17), ("SIMEON", 34.75, 31.17, 13),
                    ("REUBEN", 35.78, 31.62, 14), ("GAD", 35.78, 32.08, 14), ("PHILISTIA", 34.45, 31.6, 11)],
        "seas": [("The Great Sea", 34.42, 32.6, 18, True), ("Sea of Chinnereth", 35.59, 32.82, 10, False),
                 ("Salt Sea", 35.5, 31.48, 12, False), ("Jordan", 35.58, 32.3, 11, False)],
        "note": "The lands the tribes were given (Joshua 13–19), each name at the middle of its territory; the borders aren't "
                "drawn, as Joshua gives them by towns, many of them not now known. Dan is shown twice: its first lot, by "
                "the Philistines, and the north it moved to (Judges 18). Bezer, Ramoth-gilead, Golan, Kedesh, Shechem and "
                "Hebron were the cities of refuge (Joshua 20).",
    },
]


# ---------- data ----------

def get(url, name):
    return fetch(url, CACHE / name, log=not name.startswith("terrarium"), timeout=300)


def geojson(name):
    return json.loads(get(NE.format(name), f"{name}.geojson").read_text())


def jsonl(name):
    return [json.loads(x) for x in get(GEO.format(name), f"{name}.jsonl").read_text().splitlines() if x.strip()]


# The kinds of place a map marks with a dot: not regions, rivers or seas (named on the map by hand), nor gates,
# pools and buildings within a city.
KINDS = {"settlement", "mountain", "hill", "campsite", "island", "spring", "well", "mountain range", "promontory"}


def places():
    """{OpenBible id ("Capernaum"): {name (the KJV's), lon, lat, sure, refs}} for every place with a site."""
    ancient, modern = jsonl("ancient"), {m["id"]: m for m in jsonl("modern")}
    by_id = {a["id"]: a for a in ancient}
    kjv = sqlite3.connect(f"file:{BUNDLED / 'kjv.bbli'}?immutable=1", uri=True)

    def verse(osis):
        b, c, v = osis.split(".")[:3]
        r = kjv.execute("SELECT Scripture FROM Bible WHERE Book=? AND Chapter=? AND Verse=?", (OSIS.get(b), c, v)).fetchone()
        return re.sub(r"<[^>]+>", "", r[0]) if r else ""

    def site(a, depth=0):
        ids = sorted((i for i in a.get("identifications", []) if (i.get("score") or {}).get("time_total", 0) > 0),
                     key=lambda i: -i["score"]["time_total"])
        for i in ids:
            if i.get("id_source") == "modern" and i["id"] in modern:
                m = modern[i["id"]]
                if (m.get("coordinates_source") or {}).get("type") == "osm" or not m.get("lonlat"):
                    continue
                lon, lat = map(float, m["lonlat"].split(","))
                return lon, lat, i["score"]["time_total"]
            if i.get("id_source") == "ancient" and depth < 2 and i["id"] in by_id:  # "another name for X"
                s = site(by_id[i["id"]], depth + 1)
                if s:
                    return s[0], s[1], min(s[2], i["score"]["time_total"])
        return None

    out = {}
    for a in ancient:
        s = site(a)
        if not s:
            continue
        names = list((a.get("translation_name_counts") or {}).keys()) or [a["friendly_id"]]
        texts = " ".join(verse(v["osis"]) for v in a.get("verses", [])[:12])
        kjv_name = max(names, key=lambda n: (texts.count(n), (a.get("translation_name_counts") or {}).get(n, 0)))
        refs = [v["osis"] for v in a.get("verses", [])]
        out[a["friendly_id"]] = {"name": kjv_name, "lon": s[0], "lat": s[1], "sure": s[2] >= 500, "refs": refs,
                                 "kind": bool(set(a.get("types") or []) & KINDS),
                                 "books": {OSIS.get(r.split(".")[0]) for r in refs}}
    return out


# ---------- drawing ----------

class Frame:
    """The map's projection: longitude scaled by the cosine of the middle latitude (true to scale at the middle)."""
    def __init__(self, bbox, width):
        self.w0, self.s0, self.e0, self.n0 = bbox
        self.k = math.cos(math.radians((self.s0 + self.n0) / 2))
        self.W = width * SCALE
        self.H = int(round(self.W * (self.n0 - self.s0) / ((self.e0 - self.w0) * self.k)))

    def xy(self, lon, lat):
        return (lon - self.w0) / (self.e0 - self.w0) * self.W, (self.n0 - lat) / (self.n0 - self.s0) * self.H

    def lonlat(self):
        xs = np.linspace(self.w0, self.e0, self.W // SCALE)
        ys = np.linspace(self.n0, self.s0, self.H // SCALE)
        return np.meshgrid(xs, ys)


def elevation(fr):
    """Heights in metres on the frame's grid (at the picture's size), from Terrarium tiles at a zoom near its scale."""
    px_per_deg = (fr.W // SCALE) / (fr.e0 - fr.w0)
    z = max(3, min(12, int(math.ceil(math.log2(px_per_deg * 360 / 256)))))
    n = 2 ** z

    def tile_xy(lon, lat):
        x = (lon + 180) / 360 * n
        y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
        return x, y
    x0, y0 = tile_xy(fr.w0, fr.n0)
    x1, y1 = tile_xy(fr.e0, fr.s0)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    want = [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    with ThreadPoolExecutor(16) as pool:  # hundreds of tiles for a detailed map
        paths = dict(zip(want, pool.map(lambda t: get(TILES.format(z=z, x=t[0], y=t[1]), f"terrarium-{z}-{t[0]}-{t[1]}.png"), want)))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            a = np.asarray(Image.open(paths[(tx, ty)]).convert("RGB"), dtype=np.float32)
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    lon, lat = fr.lonlat()
    px = ((lon + 180) / 360 * n - tx0) * 256
    py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - ty0) * 256
    x0i, y0i = np.clip(np.floor(px).astype(int), 0, mosaic.shape[1] - 2), np.clip(np.floor(py).astype(int), 0, mosaic.shape[0] - 2)
    fx, fy = px - x0i, py - y0i
    top = mosaic[y0i, x0i] * (1 - fx) + mosaic[y0i, x0i + 1] * fx
    bottom = mosaic[y0i + 1, x0i] * (1 - fx) + mosaic[y0i + 1, x0i + 1] * fx
    return top * (1 - fy) + bottom * fy, z


def hillshade(elev, fr):
    """Light from the north-west, the heights exaggerated a little so low hills show."""
    cell_x = (fr.e0 - fr.w0) / (fr.W // SCALE) * 111320 * fr.k
    cell_y = (fr.n0 - fr.s0) / (fr.H // SCALE) * 110540
    exaggerate = 2.5 if (fr.e0 - fr.w0) < 4 else 6
    gy, gx = np.gradient(elev * exaggerate, cell_y, cell_x)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1)


def colour(elev):
    hs = [h for h, _ in HEIGHTS]
    cs = np.array([c for _, c in HEIGHTS], dtype=np.float32)
    out = np.zeros(elev.shape + (3,), dtype=np.float32)
    for k in range(3):
        out[..., k] = np.interp(elev, hs, cs[:, k])
    return out


def rings(geom):
    t, c = geom["type"], geom["coordinates"]
    polys = [c] if t == "Polygon" else c if t == "MultiPolygon" else []
    return polys


def lines(geom):
    t, c = geom["type"], geom["coordinates"]
    return [c] if t == "LineString" else c if t == "MultiLineString" else []


def near(coords, fr, pad=0.5):
    """Whether a ring or line's extent meets the frame's."""
    a = np.asarray(coords, dtype=np.float64)
    return a[:, 0].min() <= fr.e0 + pad and a[:, 0].max() >= fr.w0 - pad and a[:, 1].min() <= fr.n0 + pad and a[:, 1].max() >= fr.s0 - pad


def mask(fr, layer, kind="land"):
    """The frame's land (or lakes) as a picture-sized mask, from Natural Earth's polygons."""
    m = Image.new("L", (fr.W // SCALE, fr.H // SCALE), 0)
    d = ImageDraw.Draw(m)
    for f in layer["features"]:
        for poly in rings(f["geometry"]):
            if not near(poly[0], fr):
                continue
            d.polygon([tuple(v / SCALE for v in fr.xy(x, y)) for x, y in poly[0]], fill=255)
            for hole in poly[1:]:
                d.polygon([tuple(v / SCALE for v in fr.xy(x, y)) for x, y in hole], fill=0)
    return np.asarray(m, dtype=np.float32) / 255


def relief(fr, land, lakes):
    elev, z = elevation(fr)
    shade = hillshade(elev, fr)
    base = colour(np.where(land > 0.5, elev, 0))
    lit = base * (0.62 + 0.5 * shade[..., None])
    sea = np.array(SEA, dtype=np.float32)
    rgb = lit * land[..., None] + sea * (1 - land[..., None])
    rgb = rgb * (1 - lakes[..., None]) + np.array(LAKE, dtype=np.float32) * lakes[..., None]
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    return img.resize((fr.W, fr.H), Image.LANCZOS), z


class Labels:
    """Placed labels' boxes, so none overlaps another or a dot."""
    def __init__(self):
        self.boxes = []

    def free(self, box):
        x0, y0, x1, y1 = box
        return all(x1 < b[0] or x0 > b[2] or y1 < b[1] or y0 > b[3] for b in self.boxes)

    def take(self, box):
        self.boxes.append(box)


def text(d, xy, s, f, fill, halo=True, anchor="la", spacing=0):
    if spacing:
        s = (" " * 0).join(s)
        x, y = xy
        widths = [d.textlength(ch, font=f) + spacing * K * TYPE for ch in s]
        total = sum(widths) - spacing * K * TYPE
        if anchor[0] == "m":
            x -= total / 2
        for ch, w in zip(s, widths):
            d.text((x, y), ch, font=f, fill=fill, anchor="l" + anchor[1], stroke_width=int(3 * K * TYPE) if halo else 0, stroke_fill=HALO)
            x += w
        return
    d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=int(3 * K * TYPE) if halo else 0, stroke_fill=HALO)


def text_box(d, xy, s, f, anchor, spacing=0):
    if spacing:
        w = sum(d.textlength(ch, font=f) + spacing * K * TYPE for ch in s) - spacing * K * TYPE
        h = f.size
        x, y = xy
        x0 = x - w / 2 if anchor[0] == "m" else x
        return (x0, y - h / 2, x0 + w, y + h / 2)
    return d.textbbox(xy, s, font=f, anchor=anchor)


def scale_bar(d, fr, where="bottom-right"):
    km_per_px = (fr.e0 - fr.w0) * 111.32 * fr.k / fr.W
    target = fr.W * 0.18 * km_per_px
    step = next(s for s in (5, 10, 20, 25, 50, 100, 200, 250, 500, 1000) if s >= target / 1.5)
    L = step / km_per_px
    x, y = fr.W - 70 * K * TYPE - L, (fr.H - 70 * K * TYPE) if where == "bottom-right" else 90 * K * TYPE
    d.rectangle((x - 14 * K * TYPE, y - 34 * K * TYPE, x + L + 14 * K * TYPE, y + 30 * K * TYPE), fill=HALO + (200,))
    for k in range(4):
        d.rectangle((x + k * L / 4, y, x + (k + 1) * L / 4, y + 6 * K * TYPE), fill=INK if k % 2 == 0 else (250, 246, 232), outline=INK)
    f = font(12)
    d.text((x, y - 6 * K * TYPE), "0", font=f, fill=INK, anchor="mb")
    d.text((x + L, y - 6 * K * TYPE), f"{step} km", font=f, fill=INK, anchor="mb")
    miles = step * 0.621371
    d.text((x + L / 2, y + 22 * K * TYPE), f"{step} km is {miles:.0f} miles", font=font(11, "400-italic"), fill=INK, anchor="mm")


def draw(m, P, layers, out_dir=None):
    fr = Frame(m["bbox"], WIDTH)
    land, lakes = mask(fr, layers["land"]), mask(fr, layers["lakes"])
    img, z = relief(fr, land, lakes)
    img = img.convert("RGBA")
    over = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    # Coasts and lake shores.
    for layer in (layers["land"], layers["lakes"]):
        for f in layer["features"]:
            for poly in rings(f["geometry"]):
                for ring in poly:
                    if near(ring, fr):
                        d.line([fr.xy(x, y) for x, y in ring], fill=WATER_LINE + (255,), width=int(1.6 * K * TYPE), joint="curve")
    # Rivers, but not the modern canals, nor the lines Natural Earth draws through lakes.
    for f in layers["rivers"]["features"]:
        if not f["geometry"] or re.search(r"Canal", f["properties"].get("name") or "") or "Lake" in (f["properties"].get("featurecla") or ""):
            continue
        for ln in lines(f["geometry"]):
            if near(ln, fr, 0.5):
                d.line([fr.xy(x, y) for x, y in ln], fill=RIVER + (255,), width=int(2.2 * K * TYPE), joint="curve")
    labels = Labels()
    # The places.
    spec = m["places"]
    want = []
    if "books" in spec:
        want = [k for k, p in P.items() if p["kind"] and p["books"] & set(spec["books"]) and fr.w0 < p["lon"] < fr.e0 and fr.s0 < p["lat"] < fr.n0]
    want += [k for k in spec.get("named", []) if k in P]
    route_ids = [k for _, _, stops in m.get("routes", []) for k in stops]
    want += [k for k in route_ids if k in P]
    missing = [k for k in spec.get("named", []) + route_ids if k not in P]
    if missing:
        print(f"  {m['id']}: no site for {sorted(set(missing))}")
    want = list(dict.fromkeys(want))
    # Within a city's own ground (Zion, the Sheep Gate in Jerusalem), only the city.
    cities = [k for k in want if len(P[k]["refs"]) >= 150]
    def inside(k):
        return any(c != k and abs(P[k]["lon"] - P[c]["lon"]) * 111 * fr.k < 1.5 and abs(P[k]["lat"] - P[c]["lat"]) * 111 < 1.5 for c in cities)
    want = [k for k in want if not inside(k) or k in spec.get("named", []) + route_ids]
    # Routes, under the dots.
    for name, col, stops in m.get("routes", []):
        pts = [fr.xy(P[k]["lon"], P[k]["lat"]) for k in stops if k in P]
        d.line(pts, fill=col + (230,), width=int(3 * K * TYPE), joint="curve")
        for a, b in zip(pts, pts[1:]):  # an arrowhead halfway along each leg
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            s = 9 * K * TYPE
            d.polygon([(mx + s * math.cos(ang), my + s * math.sin(ang)),
                       (mx + s * math.cos(ang + 2.5), my + s * math.sin(ang + 2.5)),
                       (mx + s * math.cos(ang - 2.5), my + s * math.sin(ang - 2.5))], fill=col + (255,))
    # Regions and seas first: they keep their places; the towns' labels fit round them.
    for name, lon, lat, size in m.get("regions", []):
        f = font(size, "500-normal")
        xy = fr.xy(lon, lat)
        text(d, xy, name, f, REGION + (255,), anchor="mm", spacing=size * 0.35)
        labels.take(text_box(d, xy, name, f, "mm", spacing=size * 0.35))
    for name, lon, lat, size, big in m.get("seas", []):
        f = font(size, "400-italic")
        xy = fr.xy(lon, lat)
        text(d, xy, name, f, SEA_INK + (255,), halo=False, anchor="mm", spacing=size * 0.2 if big else 0)
        labels.take(text_box(d, xy, name, f, "mm", spacing=size * 0.2 if big else 0))
    # Dots, then names: the most-mentioned first, beside the dot wherever there's room.
    chosen = set(spec.get("named", []) + route_ids)  # a map's own places are named before the rest
    order = sorted(want, key=lambda k: (k not in chosen, -len(P[k]["refs"])))
    r = 5.5 * K * TYPE
    for k in order:
        x, y = fr.xy(P[k]["lon"], P[k]["lat"])
        labels.take((x - r, y - r, x + r, y + r))
    shown, unlabelled = [], []
    for k in order:
        p = P[k]
        x, y = fr.xy(p["lon"], p["lat"])
        if p["sure"]:
            d.ellipse((x - r, y - r, x + r, y + r), fill=DOT + (255,), outline=HALO + (255,), width=int(1.5 * K))
        else:
            d.ellipse((x - r, y - r, x + r, y + r), fill=HALO + (255,), outline=DOT + (255,), width=int(2 * K))
        big = len(p["refs"]) >= 40
        f = font(18 if big else 14, "600-normal" if big else "500-normal")
        name = p["name"] + ("" if p["sure"] else "?")
        spots = (("lm", 1, 0), ("rm", -1, 0), ("mb", 0, -1), ("mt", 0, 1), ("lb", 0.7, -0.7), ("rt", -0.7, 0.7), ("rb", -0.7, -0.7), ("lt", 0.7, 0.7))
        for anchor, dx, dy, far in [(*a, 1) for a in spots] + [(*a, 2.6) for a in spots]:  # beside the dot, else a little off
            xy = (x + dx * far * (r + 4 * K * TYPE), y + dy * far * (r + 3 * K * TYPE))
            box = d.textbbox(xy, name, font=f, anchor=anchor)
            if box[0] > 8 and box[2] < fr.W - 8 and box[1] > 8 and box[3] < fr.H - 8 and labels.free(box):
                text(d, xy, name, f, INK + (255,), anchor=anchor)
                labels.take(box)
                break
        else:
            unlabelled.append(p["name"])
        shown.append(k)
    if unlabelled:
        print(f"  {m['id']}: no room to name {len(unlabelled)}: {', '.join(unlabelled[:12])}")
    # Title, key and scale.
    tf = font(30, "600-normal")
    top = 44 * K * TYPE
    if m.get("corner") == "bottom-left":  # the title and key above the scale's line, at the bottom
        top = fr.H - (120 + 26 * len(m.get("routes", []))) * K * TYPE
    tb = d.textbbox((50 * K * TYPE, top), m["title"], font=tf, anchor="lt")
    d.rectangle((tb[0] - 18 * K * TYPE, tb[1] - 14 * K * TYPE, tb[2] + 18 * K * TYPE, tb[3] + 16 * K * TYPE), fill=HALO + (225,), outline=INK + (255,), width=int(K))
    d.text((50 * K * TYPE, top), m["title"], font=tf, fill=INK + (255,), anchor="lt")
    if m.get("routes"):
        kf = font(14, "500-normal")
        y = tb[3] + 40 * K * TYPE
        w = max(d.textlength(n, font=kf) for n, _, _ in m["routes"]) + 70 * K * TYPE
        d.rectangle((tb[0] - 18 * K * TYPE, y - 16 * K * TYPE, tb[0] + w, y + len(m["routes"]) * 26 * K * TYPE), fill=HALO + (225,), outline=INK + (255,), width=int(K))
        for name, col, _ in m["routes"]:
            d.line((tb[0], y + 4 * K * TYPE, tb[0] + 40 * K * TYPE, y + 4 * K * TYPE), fill=col + (255,), width=int(3 * K * TYPE))
            d.text((tb[0] + 50 * K * TYPE, y + 4 * K * TYPE), name, font=kf, fill=INK + (255,), anchor="lm")
            y += 26 * K * TYPE
    scale_bar(d, fr, m.get("scale", "bottom-right"))
    credit = "Places: OpenBible.info (CC BY) · Terrain: SRTM, GMTED (USGS), ETOPO1 (NOAA), EU-DEM (Copernicus), via Mapzen · Coasts: Natural Earth"
    d.text((fr.W - 16 * K * TYPE, fr.H - 12 * K * TYPE), credit, font=font(9, "400-italic"), fill=INK + (200,), anchor="rb")
    img = Image.alpha_composite(img, over).convert("RGB").resize((fr.W // SCALE, fr.H // SCALE), Image.LANCZOS)
    if out_dir:
        img.save(Path(out_dir) / f"{m['id']}.webp", "WEBP", quality=82, method=6)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=82, method=6)
    return buf.getvalue(), shown, z


def osis_ref(o):
    b, c, v = (o.split(".") + ["", ""])[:3]
    return f"{BOOK_ABBR[OSIS[b] - 1]} {c}:{v}" if b in OSIS and c and v else None


def chapter(m, webp, shown, P):
    items = []
    for k in sorted(shown, key=lambda k: P[k]["name"]):
        p = P[k]
        refs = [r for r in (osis_ref(o) for o in p["refs"]) if r]
        more = f" and {len(refs) - 3} more" if len(refs) > 3 else ""
        items.append(f"<b>{html.escape(p['name'])}</b>{'' if p['sure'] else ' (site uncertain)'}: "
                     + ", ".join(f"<ref>{r}</ref>" for r in refs[:3]) + more)
    return (f'<p><img src="data:image/webp;base64,{base64.b64encode(webp).decode()}"></p>'
            f"<p>{html.escape(m['note'])}</p><p><b>On this map:</b></p>" + "".join(f"<p>{x}</p>" for x in items))


def main():
    args = sys.argv[1:]
    build(into=Path(args[args.index("--into") + 1]) if "--into" in args else BUNDLED,
          only=args[args.index("--only") + 1:] if "--only" in args else None,
          pictures=args[args.index("--pictures") + 1] if "--pictures" in args else None)


def build(into=BUNDLED, only=None, pictures=None):
    """Writes maps.refi into `into`; with `only`, draws just those maps (to `pictures`, a folder) and writes nothing."""
    out_dir = pictures
    layers = {"land": geojson("ne_10m_land"), "lakes": geojson("ne_10m_lakes"), "rivers": geojson("ne_10m_rivers_lake_centerlines")}
    # Natural Earth has the Dead Sea twice: its whole shore, with the southern basin (as it was), and its northern basin now.
    layers["lakes"]["features"] = [f for f in layers["lakes"]["features"]
                                   if not (f["properties"].get("name") == "Dead Sea" and f["properties"].get("scalerank") != 3)]
    P = places()
    rows = []
    for n, m in enumerate(MAPS, 1):
        if only and m["id"] not in only:
            continue
        webp, shown, z = draw(m, P, layers, out_dir)
        rows.append((f"{n}. {m['title']}", chapter(m, webp, shown, P)))
        print(f"  {m['id']}: {len(shown)} places, zoom {z}, {len(webp) / 1e3:.0f} KB")
    if only:
        return
    info = ("<p>Maps of the Bible's lands, drawn for Two-edged Sword: the land in the time of Jesus, Paul's journeys, the "
            "Exodus and the tribes, each with a note on its period and the places on it, with their verses.</p>"
            "<p>Places: OpenBible.info's Bible geocoding data, CC BY 4.0 (https://www.openbible.info/geo/), at the site it "
            "thinks likeliest; a hollow dot and a question mark where it is less sure. Names as the KJV spells them. "
            "Terrain: Mapzen's Terrain Tiles (SRTM and GMTED2010, U.S. Geological Survey; ETOPO1, NOAA; EU-DEM, "
            "Copernicus). Coasts, lakes and rivers: Natural Earth (public domain). Lettering: EB Garamond (SIL OFL). "
            "Built by Two-edged Sword's tools/maps.</p>")
    with module("maps.refi", "Bible Maps", "Maps", info, into=into) as db:
        db.executemany("INSERT INTO Reference VALUES (?,?)", rows)
    print(f"maps.refi: {len(rows)} maps, {(into / 'maps.refi').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
