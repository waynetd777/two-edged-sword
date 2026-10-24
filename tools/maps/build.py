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
    boundaries aren't drawn. Where the Bible gives no road (Abraham's, the exiles'), the line follows the
    usual way along the Euphrates and round the desert. Where a place or route is disputed, the map says so.
  City plans (Jerusalem): drawn as contours and height tints, the terrain being too coarse this close for
    shading; Jerusalem's gates and walls, which OpenBible.info doesn't place, set by hand after one usual
    reconstruction and marked as uncertain.

Each map is a WebP picture inside its chapter (e-Sword's maps are pictures in a reference book too), and
the app shows the book on the Library's Maps card. The picture carries an HTML image map (usemap, <map>, an
<area> on each place's dot with its name, data-sure, data-label and data-refs, its verses), from which the app
makes each place clickable, for its verses; e-Sword and other readers just ignore it. Downloads are cached in ~/Library/Caches/Two-edged
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
# seas named by hand (name, lon, lat, size, letter spacing), routes (a list of places in order; a (lon, lat) pair is a
# bend in the road between them, along a river or round a desert, with no dot), and its note. A city plan may also
# place by hand what OpenBible.info can't ("placed": its id and a site, drawn as uncertain), give the KJV's name where
# OpenBible records another ("names"), and draw walls (a closed line, in the key).
MAPS = [
    {
        "id": "patriarchs", "title": "The Patriarchs in the Ancient Near East",
        "bbox": (29.4, 28.6, 50.0, 38.6),
        "places": {"named": ["Ur 1", "Haran", "Shechem", "Bethel 1", "Hebron", "Beersheba 1", "Gerar", "Damascus", "Babylon 1",
                             "Nineveh", "Erech", "Accad", "Calah", "Asshur", "Heliopolis", "Sodom", "Mahanaim",
                             "Kadesh-barnea", "Bethlehem 1"]},
        "routes": [
            ("Abraham (Genesis 11:31–13:18)", (160, 40, 28), [
                "Ur 1", (45.3, 31.3), (44.9, 32.0), (44.3, 32.6), (43.7, 33.35), (42.8, 33.65), (41.95, 34.45), (40.9, 34.45),
                (40.15, 35.33), (39.0, 35.95), "Haran", "Shechem", "Bethel 1", (34.6, 30.9), (31.7, 30.7), (34.7, 31.0),
                "Bethel 1", "Hebron"]),
            ("Jacob (Genesis 28–35)", (34, 86, 140), [
                "Beersheba 1", "Bethel 1", "Haran", "Mahanaim", "Shechem", "Bethel 1", "Bethlehem 1", "Hebron"]),
        ],
        "regions": [("CHALDÆA", 45.6, 31.55, 13), ("SHINAR", 44.4, 33.3, 13), ("MESOPOTAMIA", 40.4, 36.1, 13),
                    ("ASSYRIA", 43.6, 36.8, 13), ("ELAM", 47.8, 32.9, 13), ("ARAM", 37.4, 34.6, 12), ("CANAAN", 34.2, 31.9, 12),
                    ("EGYPT", 30.3, 29.95, 16), ("ARABIA", 40.5, 30.6, 15)],
        "seas": [("The Great Sea", 31.8, 33.4, 18, True), ("Persian Gulf", 49.4, 29.15, 11, False), ("Euphrates", 41.8, 34.1, 11, False),
                 ("Tigris", 45.0, 33.6, 11, False), ("Nile", 31.2, 28.95, 10, False)],
        "note": "Abraham's road from Ur of the Chaldees to Haran and on to Canaan, down to Egypt in the famine and back to "
                "Bethel and Hebron (Genesis 11–13); and Jacob's, from Beer-sheba to Haran and home by the Jabbok to Shechem, "
                "Bethel and Hebron (Genesis 28–35). The road from Ur follows the Euphrates, as the trade routes did, so "
                "the line is a guess between the places Genesis names. Ur is taken to be Tell el-Muqayyar in southern Iraq; "
                "some put Abraham's Ur in the north, near Haran. Sodom's site, by the south end of the Salt Sea, is uncertain.",
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
                             "Tyre", "Bethlehem 1", "Dor", "Beth-shan", "Aroer 1", "Rabbah 1"]},
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
    {
        "id": "david", "title": "The Kingdom of David and Solomon",
        "bbox": (33.7, 29.15, 38.85, 36.15),
        "places": {"named": ["Jerusalem", "Hebron", "Bethlehem 1", "Gibeah 1", "Ziklag", "Gath 1", "Gaza", "Gezer", "Megiddo",
                             "Hazor 1", "Dan", "Beersheba 1", "Mahanaim", "Rabbah 1", "Damascus", "Hamath 1", "Tiphsah 1",
                             "Tadmor", "Ezion-geber", "Tyre", "Sidon", "Bozrah 1", "Medeba", "Mount Gilboa", "Joppa"]},
        "regions": [("ISRAEL", 35.0, 32.3, 15), ("JUDAH", 35.0, 30.95, 15), ("PHILISTIA", 34.3, 31.35, 11),
                    ("PHŒNICIA", 35.55, 33.75, 12), ("SYRIA", 36.75, 33.15, 14), ("ZOBAH", 36.65, 34.2, 13),
                    ("HAMATH", 37.2, 35.45, 13), ("AMMON", 36.35, 31.95, 13), ("MOAB", 36.0, 31.3, 13),
                    ("EDOM", 35.75, 30.35, 13), ("ARABIA", 37.9, 31.2, 15)],
        "seas": [("The Great Sea", 34.4, 34.2, 18, True), ("Salt Sea", 35.5, 31.48, 9, False),
                 ("Red Sea", 34.95, 29.22, 9, False), ("Euphrates", 38.55, 35.6, 11, False)],
        "note": "David took Jerusalem for his capital and subdued the peoples round Israel: the Philistines, Moab, the Syrians "
                "of Zobah and Damascus, Edom, and Ammon at Rabbah, while Hamath sent him gifts and Hiram of Tyre was his ally "
                "(2 Samuel 5, 8, 10–12). Solomon ruled \"from Tiphsah even to Azzah\" (1 Kings 4:24), built Gezer, Hazor and "
                "Megiddo, kept a fleet at Ezion-geber and built Tadmor in the wilderness (1 Kings 9; 2 Chronicles 8:4). No "
                "borders are drawn: how much of this was ruled, and how much only paid tribute, is debated, and some read "
                "Tadmor as Tamar, south of the Salt Sea (1 Kings 9:18).",
    },
    {
        "id": "divided", "title": "The Divided Kingdoms of Israel and Judah",
        "bbox": (34.1, 30.55, 36.85, 33.8),
        "places": {"named": ["Samaria 1", "Tirzah", "Shechem", "Bethel 1", "Dan", "Jezreel 2", "Megiddo", "Penuel",
                             "Ramoth-gilead", "Jerusalem", "Hebron", "Lachish", "Beersheba 1", "Gaza", "Ashdod", "Ashkelon",
                             "Ekron", "Gath 1", "Tyre", "Sidon", "Damascus", "Rabbah 1", "Dibon 1", "Kir-hareseth", "Bozrah 1",
                             "Mizpah 3", "Joppa", "Hazor 1", "Mount Carmel", "Abel-beth-maacah", "Tekoa", "Jabesh-gilead"]},
        "regions": [("ISRAEL", 35.4, 32.7, 17), ("JUDAH", 34.98, 31.32, 17), ("PHILISTIA", 34.42, 31.42, 11),
                    ("PHŒNICIA", 35.38, 33.4, 12), ("SYRIA", 36.3, 33.25, 15), ("GILEAD", 35.85, 32.25, 12),
                    ("AMMON", 36.3, 31.85, 13), ("MOAB", 35.95, 31.2, 14), ("EDOM", 35.75, 30.75, 13)],
        "seas": [("The Great Sea", 34.42, 32.75, 18, True), ("Sea of Chinnereth", 35.59, 32.82, 9, False),
                 ("Salt Sea", 35.5, 31.48, 11, False), ("Jordan", 35.58, 32.3, 11, False)],
        "note": "After Solomon the ten tribes made Jeroboam king, and the kingdom split (1 Kings 12): Israel in the north, its "
                "capital at Shechem, then Tirzah, then Samaria, with Jeroboam's calves at Dan and Beth-el; Judah in the south, "
                "with Benjamin, under David's line at Jerusalem. Their neighbours were Syria at Damascus, the Philistine "
                "cities, Tyre and Sidon, Ammon, Moab (whose king Mesha set up his stone at Dibon) and Edom. The border between "
                "the kingdoms moved with their wars, near Beth-el and Mizpah, so it isn't drawn.",
    },
    {
        "id": "assyria", "title": "The Assyrian Empire and the Exile of Israel",
        "bbox": (29.4, 28.9, 50.0, 39.2),
        "places": {"named": ["Nineveh", "Calah", "Asshur", "Haran", "Carchemish", "Arpad", "Hamath 1", "Damascus", "Samaria 1",
                             "Jerusalem", "Lachish", "Babylon 1", "Cuth", "Halah", "Tyre", "Sidon", "Arvad", "Ashdod", "Memphis",
                             "Zoan", "Susa", "Sepharvaim"]},
        "routes": [("Israel taken into Assyria (2 Kings 15:29; 17:6)", (160, 40, 28), [
            "Samaria 1", "Damascus", "Hamath 1", "Arpad", "Carchemish", "Haran", (40.04, 36.83), (41.6, 36.6), "Halah"])],
        "regions": [("ASSYRIA", 43.9, 35.6, 16), ("ARMENIA", 43.0, 38.6, 13), ("MEDIA", 47.6, 35.6, 14), ("ELAM", 47.9, 32.6, 13),
                    ("CHALDÆA", 45.4, 31.4, 13), ("SYRIA", 37.4, 34.2, 12), ("EGYPT", 30.3, 29.95, 16), ("ARABIA", 40.5, 30.8, 15),
                    ("CAPPADOCIA", 35.2, 38.7, 12)],
        "seas": [("The Great Sea", 31.8, 33.4, 18, True), ("Euphrates", 41.6, 34.1, 11, False), ("Tigris", 44.9, 33.7, 11, False), ("Habor", 40.85, 35.9, 10, False),
                 ("Nile", 31.2, 29.15, 10, False)],
        "note": "Assyria, ruled from Calah and then Nineveh, took Damascus and the north of Israel under Tiglath-pileser "
                "(2 Kings 15:29; 16:9), and Samaria fell to Shalmaneser and Sargon in 722 BC. Israel was carried away \"in "
                "Halah and in Habor by the river of Gozan, and in the cities of the Medes\" (2 Kings 17:6), and people from "
                "Babylon, Cuthah, Hamath and Sepharvaim were settled in Samaria (17:24). Sennacherib took Lachish and the "
                "cities of Judah but not Jerusalem (2 Kings 18–19). The road east is a guess: the line follows the trade "
                "route by Carchemish and Haran to Gozan (Tell Halaf, which OpenBible.info doesn't place), on the Habor. "
                "Sepharvaim's site is uncertain; some put it in Babylonia, not Syria.",
    },
    {
        "id": "babylon", "title": "The Babylonian Empire and the Exile of Judah",
        "bbox": (29.4, 28.6, 50.0, 38.4),
        "places": {"named": ["Babylon 1", "Carchemish", "Riblah 1", "Jerusalem", "Lachish", "Mizpah 3", "Tyre", "Sidon", "Damascus",
                             "Hamath 1", "Haran", "Nineveh", "Susa", "Ur 1", "Erech", "Tel-abib", "Tahpanhes", "Memphis", "Rabbah 1", "Bozrah 1", "Ecbatana"]},
        "routes": [
            ("Judah taken to Babylon (2 Kings 25)", (160, 40, 28), [
                "Jerusalem", "Riblah 1", "Hamath 1", (37.15, 36.2), (38.2, 36.2), (39.0, 35.95), (40.15, 35.33), (40.9, 34.45),
                (41.95, 34.45), (42.8, 33.65), (43.7, 33.35), "Babylon 1"]),
            ("The remnant into Egypt (Jeremiah 41–43)", (34, 86, 140), ["Mizpah 3", (34.6, 31.15), (33.2, 31.05), "Tahpanhes"]),
        ],
        "regions": [("CHALDÆA", 45.2, 31.5, 15), ("ASSYRIA", 43.6, 36.8, 13), ("MEDIA", 47.6, 35.3, 14), ("ELAM", 47.9, 32.6, 13),
                    ("SYRIA", 37.4, 34.2, 12), ("EGYPT", 30.3, 29.95, 16), ("ARABIA", 40.5, 30.4, 15), ("EDOM", 35.8, 30.1, 11),
                    ("JUDAH", 35.0, 31.05, 11)],
        "seas": [("The Great Sea", 31.8, 33.4, 18, True), ("Persian Gulf", 49.4, 29.15, 11, False),
                 ("Euphrates", 41.6, 34.1, 11, False), ("Tigris", 44.9, 33.7, 11, False), ("Chebar", 45.0, 31.85, 9, False),
                 ("Nile", 31.2, 29.15, 10, False)],
        "note": "Nebuchadnezzar beat Egypt at Carchemish (Jeremiah 46:2), took Jerusalem in 597 BC and carried Jehoiachin and "
                "the craftsmen to Babylon, and in 586 BC burnt the city and the temple; Zedekiah was judged at Riblah "
                "(2 Kings 24–25). Ezekiel lived among the exiles at Tel-abib by the river Chebar. After Gedaliah was killed at "
                "Mizpah the rest fled to Tahpanhes in Egypt, taking Jeremiah with them (Jeremiah 41–43). The exiles' road "
                "isn't given: the line follows the way round the desert, up through Syria and down the Euphrates.",
    },
    {
        "id": "persia", "title": "The Persian Empire and the Return",
        "bbox": (24.0, 26.5, 56.0, 42.6),
        "scale": "top-right",  # the Persian Gulf is at the bottom right
        "places": {"named": ["Susa", "Ecbatana", "Babylon 1", "Jerusalem", "Samaria 1", "Damascus", "Tyre", "Sardis", "Memphis",
                             "Haran", "Nineveh", "Ur 1", "Tema", "Carchemish", "Hamath 1"]},
        "routes": [("The return from Babylon (Ezra 1–2; 7–8)", (160, 40, 28), [
            "Babylon 1", (43.7, 33.35), (42.8, 33.65), (41.95, 34.45), (40.9, 34.45), (40.15, 35.33), (39.0, 35.95), (38.2, 36.2),
            (37.15, 36.2), "Hamath 1", "Damascus", "Jerusalem"])],
        "regions": [("PERSIA", 52.6, 30.2, 17), ("MEDIA", 48.9, 35.6, 16), ("ELAM", 48.6, 31.8, 13), ("BABYLON", 44.6, 31.3, 14),
                    ("ASSYRIA", 43.4, 36.9, 13), ("ARMENIA", 43.5, 39.4, 13), ("CAPPADOCIA", 35.2, 38.9, 13), ("LYDIA", 28.6, 38.9, 13),
                    ("BEYOND THE RIVER", 37.9, 33.0, 11), ("EGYPT", 29.6, 28.0, 17), ("ARABIA", 41.5, 29.3, 17)],
        "seas": [("The Great Sea", 30.0, 33.6, 20, True), ("Persian Gulf", 51.0, 27.6, 12, False), ("Caspian Sea", 51.0, 39.8, 12, False),
                 ("Red Sea", 35.0, 26.9, 11, False), ("Euphrates", 41.6, 34.1, 11, False), ("Tigris", 44.9, 33.7, 11, False)],
        "note": "Cyrus took Babylon in 539 BC and let the Jews go home to build the temple (Ezra 1); the decree was found at "
                "Achmetha, Ecbatana in Media (Ezra 6:2). Ezra came up from the river of Ahava by Babylon (Ezra 7–8), and "
                "Nehemiah from Shushan the palace, where Esther was queen (Nehemiah 1–2; Esther 1). The empire ran \"from "
                "India even unto Ethiopia\" (Esther 1:1), farther than this map. Jerusalem was in the province Beyond the "
                "River (Ezra 4:10). The route isn't given: the line follows the Euphrates and the road south through Syria, "
                "the usual way round the desert. No borders are drawn.",
    },
    {
        "id": "jerusalem-ot", "title": "Jerusalem in the Old Testament",
        "bbox": (35.2235, 31.7655, 35.2475, 31.7835),
        # A city plan. OpenBible.info sets Jerusalem's gates at the city's middle, their sites not being known, so they
        # are placed here by hand on the wall, after the usual reading of Nehemiah 3 and 12, and drawn as uncertain.
        "places": {"named": ["City of David", "Ophel", "Gihon 2", "Siloam", "En-rogel", "Mount Moriah", "Topheth",
                             "Mount of Olives", "Broad Wall", "Tower of Hananel"]},
        "placed": {"Sheep Gate": (35.2362, 31.7806), "Tower of the Hundred": (35.2352, 31.7808), "Fish Gate": (35.2336, 31.7792),
                   "Gate of Yeshanah": (35.2330, 31.7781), "Ephraim Gate": (35.2325, 31.7770),
                   "Tower of the Ovens": (35.2298, 31.7764), "Valley Gate": (35.2280, 31.7740), "Dung Gate": (35.2312, 31.7700),
                   "Fountain Gate": (35.2343, 31.7699), "Water Gate": (35.2370, 31.7735), "Horse Gate": (35.2366, 31.7763),
                   "East Gate": (35.2369, 31.7782), "Muster Gate": (35.2368, 31.7797)},
        "names": {"Tower of the Ovens": "Tower of the Furnaces", "Tower of the Hundred": "Tower of Meah",
                  "Muster Gate": "Gate Miphkad", "Siloam": "Pool of Siloah"},
        "walls": [("The wall in Nehemiah's day (one reconstruction)", (110, 78, 48), [
            (35.2362, 31.7806), (35.2352, 31.7808), (35.2343, 31.7801), (35.2336, 31.7792), (35.2330, 31.7781), (35.2325, 31.7770),
            (35.2319, 31.7761), (35.2298, 31.7764), (35.2280, 31.7762), (35.2280, 31.7740), (35.2288, 31.7718), (35.2312, 31.7700),
            (35.2343, 31.7699), (35.2358, 31.7702), (35.2368, 31.7718), (35.2370, 31.7735), (35.2367, 31.7750), (35.2366, 31.7763), (35.2369, 31.7782),
            (35.2368, 31.7797)])],
        "routes": [("Hezekiah's tunnel (2 Kings 20:20)", (34, 86, 140), [
            "Gihon 2", (35.2357, 31.7726), (35.2360, 31.7716), (35.2353, 31.7712), "Siloam"])],
        "regions": [],
        "seas": [("Brook Kidron", 35.2392, 31.7745, 13, False), ("Valley of the Son of Hinnom", 35.2283, 31.7685, 13, False)],
        "note": "Jerusalem was first a small city on the ridge between the Kidron and the valley of Hinnom: the Jebusites' "
                "stronghold of Zion that David took and called the city of David (2 Samuel 5:7), with the spring Gihon below "
                "it. Solomon built the temple to the north, on mount Moriah (2 Chronicles 3:1), and by Hezekiah's day the "
                "city had spread to the western hill, where his broad wall was found (Isaiah 22:10; Nehemiah 3:8); his "
                "tunnel took Gihon's water to the pool of Siloah. The wall and its gates are drawn as many reconstructions "
                "of Nehemiah 3 and 12:31–40 have them, the gates in the order Nehemiah gives; their sites are not known, "
                "so each is marked as uncertain. Others put Nehemiah's smaller wall round the city of David and the temple "
                "only, leaving the western hill outside. The hill now called Mount Zion, in the south-west, took the name "
                "later; the Zion of David's day was the city of David.",
    },
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
        "id": "ministry", "title": "The Ministry of Jesus",
        "bbox": (34.85, 31.62, 36.05, 33.62),
        "places": {"named": ["Nazareth", "Cana", "Capernaum", "Bethsaida 1", "Chorazin", "Magdala", "Tiberias", "Nain",
                             "Caesarea Philippi", "Sychar", "Jericho 1", "Bethany 1", "Jerusalem", "Bethlehem 1", "Ephraim 1",
                             "Aenon", "Bethany 2", "Tyre", "Sidon", "Mount Tabor", "Mount Gerizim", "Caesarea"]},
        "routes": [
            ("Galilee to Caesarea Philippi (Matthew 4:13; Mark 8–9)", (34, 86, 140), [
                "Nazareth", "Capernaum", "Bethsaida 1", "Caesarea Philippi", "Capernaum"]),
            ("Through Samaria (John 4)", (46, 120, 60), ["Jerusalem", "Sychar", "Cana"]),
            ("The last journey to Jerusalem (Mark 10–11)", (160, 40, 28), [
                "Capernaum", (35.6, 32.6), (35.62, 32.15), "Jericho 1", "Bethany 1", "Jerusalem"]),
        ],
        "regions": [("GALILEE", 35.33, 32.95, 16), ("SAMARIA", 35.12, 32.32, 16), ("JUDÆA", 35.05, 31.75, 15),
                    ("PERÆA", 35.78, 31.95, 14), ("DECAPOLIS", 35.82, 32.55, 13), ("PHŒNICIA", 35.15, 33.45, 12),
                    ("ITURÆA", 35.85, 33.42, 12)],
        "seas": [("The Great Sea", 34.98, 32.95, 16, True), ("Sea of Galilee", 35.59, 32.82, 10, False),
                 ("Salt Sea", 35.5, 31.68, 11, False), ("Jordan", 35.58, 32.3, 11, False)],
        "note": "The Gospels don't give Jesus' travels as one journey, so these are three of them: from Nazareth to Capernaum, "
                "his home in Galilee, and north to Caesarea Philippi (Matthew 4:13; Mark 8:22–9:33); from Judæa through "
                "Samaria by Jacob's well at Sychar to Cana (John 4); and the last journey, from Galilee \"by the farther side "
                "of Jordan\" to Jericho, Bethany and Jerusalem (Mark 10:1, 46; 11:1). Luke tells that journey by Samaria "
                "instead (Luke 9:51–56; 17:11), and the roads between the towns are a guess. Bethabara, where John baptized "
                "(John 1:28), and Aenon are uncertain.",
    },
    {
        "id": "jerusalem-nt", "title": "Jerusalem in the Time of Jesus",
        "bbox": (35.2215, 31.7655, 35.2525, 31.7858),
        "places": {"named": ["Bethesda", "Siloam", "Gethsemane", "Mount of Olives", "Golgotha", "Gabbatha", "Akeldama",
                             "Bethphage", "Topheth"]},
        "placed": {"Sheep Gate": (35.2362, 31.7810), "Solomon’s Portico": (35.2366, 31.7787), "Beautiful Gate": (35.2358, 31.7781)},
        "names": {"Sheep Gate": "Sheep Market", "Solomon’s Portico": "Solomon's Porch", "Akeldama": "Aceldama", "Beautiful Gate": "Beautiful Gate",
                  "Siloam": "Pool of Siloam"},
        "walls": [
            ("The city's walls (one reconstruction)", (110, 78, 48), [
                (35.2278, 31.7765), (35.2300, 31.7766), (35.2305, 31.7785), (35.2325, 31.7796), (35.2341, 31.7810),
                (35.2367, 31.7802), (35.2366, 31.7762), (35.2367, 31.7750), (35.2370, 31.7735), (35.2368, 31.7718),
                (35.2358, 31.7702), (35.2343, 31.7695), (35.2312, 31.7695), (35.2288, 31.7712), (35.2278, 31.7740)]),
            ("The temple's courts, as Herod built them", (150, 110, 40), [
                (35.2341, 31.7810), (35.2367, 31.7802), (35.2366, 31.7762), (35.2343, 31.7761)]),
        ],
        "regions": [("THE TEMPLE", 35.2353, 31.7793, 11), ("UPPER CITY", 35.2302, 31.7742, 11), ("LOWER CITY", 35.2346, 31.7728, 9),
                    ("ANTONIA", 35.2338, 31.7817, 9)],
        "seas": [("Brook Cedron", 35.2392, 31.7745, 13, False), ("Valley of Hinnom", 35.2283, 31.7685, 13, False)],
        "note": "Jerusalem as Herod the Great rebuilt it: the temple on its great platform, the fortress of Antonia at its "
                "north-west corner (the \"castle\" of Acts 21:34), and Herod's palace on the western hill. The walls are "
                "drawn as one reconstruction has them: the first wall round the upper and lower cities, and the second "
                "taking in the quarter to the north, with Golgotha outside it (John 19:20; Hebrews 13:12). The line of the "
                "second wall is disputed, and with it where Golgotha was: the map follows the traditional site, the Church "
                "of the Holy Sepulchre; others put it north of the city, at the Garden Tomb. Gabbatha, where Pilate judged "
                "Jesus (John 19:13), is put at Herod's palace; some put it at Antonia. The pool of Bethesda by the sheep "
                "market (John 5:2) and the pool of Siloam (John 9:7) are both known. The third wall, to the north, was built "
                "after Jesus' day and isn't drawn.",
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
        "id": "churches", "title": "The Seven Churches of Revelation",
        "bbox": (25.9, 37.05, 29.75, 39.85),
        "scale": "top-right",
        "places": {"named": ["Patmos", "Miletus", "Colossae", "Hierapolis", "Troas"]},
        "routes": [("The order of the letters (Revelation 2–3)", (160, 40, 28), [
            "Ephesus", "Smyrna", "Pergamum", "Thyatira", "Sardis", "Philadelphia", "Laodicea"])],
        "regions": [("ASIA", 28.3, 38.75, 18), ("MYSIA", 27.9, 39.55, 12), ("LYDIA", 28.2, 38.15, 12), ("PHRYGIA", 29.4, 38.6, 12),
                    ("CARIA", 28.2, 37.45, 12)],
        "seas": [("Ægean Sea", 26.25, 38.6, 15, True), ("Icarian Sea", 26.9, 37.2, 10, False)],
        "note": "The seven churches John wrote to from Patmos (Revelation 1:9–11), in the province of Asia. The letters go in "
                "the order a messenger would take them round by road: north from Ephesus to Smyrna and Pergamos, then "
                "south-east by Thyatira, Sardis and Philadelphia to Laodicea; the line between them follows that order, "
                "not the roads themselves. Colosse and Hierapolis, near Laodicea, had churches too (Colossians 4:13).",
    },
    {
        "id": "rome", "title": "The Roman Empire in the New Testament",
        "bbox": (-9.5, 27.6, 46.5, 48.5),
        "scale": "top-right",  # Judæa is at the bottom right
        "places": {"named": ["Rome", "Corinth", "Athens", "Alexandria", "Antioch 1", "Jerusalem", "Ephesus", "Cyrene", "Puteoli",
                             "Tarsus", "Damascus", "Thessalonica", "Philippi", "Caesarea", "Malta", "Syracuse", "Nicopolis",
                             "Babylon 1", "Patmos", "Troas", "Antioch 2"]},
        "regions": [("ITALY", 15.9, 40.5, 15), ("SPAIN", -4.4, 40.2, 18), ("GAUL", 2.5, 45.2, 18), ("AFRICA", 9.0, 33.5, 16),
                    ("LIBYA", 21.0, 31.3, 14), ("EGYPT", 29.8, 29.6, 16), ("JUDÆA", 35.0, 31.0, 11), ("SYRIA", 38.3, 34.8, 13),
                    ("ASIA", 28.6, 38.9, 13), ("GALATIA", 32.9, 39.3, 12), ("CAPPADOCIA", 35.6, 38.4, 12), ("PONTUS", 37.4, 40.6, 12),
                    ("BITHYNIA", 30.8, 40.6, 12), ("MACEDONIA", 21.4, 41.0, 12), ("ACHAIA", 21.6, 37.2, 12),
                    ("ILLYRICUM", 17.8, 43.4, 12), ("ARABIA", 40.5, 30.5, 14), ("MESOPOTAMIA", 41.5, 36.3, 12),
                    ("CRETE", 24.9, 34.95, 10), ("CYPRUS", 33.2, 35.4, 10)],
        "seas": [("The Great Sea", 18.0, 34.0, 22, True), ("Adriatic Sea", 16.8, 42.4, 11, False),
                 ("Ægean Sea", 25.0, 39.6, 11, False)],
        "note": "The Roman world of the New Testament, about AD 60: Rome, where Paul was taken (Acts 28); the provinces of "
                "Acts and the letters; Spain, where he hoped to go (Romans 15:24); the peoples at Pentecost, from Mesopotamia "
                "to Libya and Rome (Acts 2:9–11); and the churches Peter wrote to in Pontus, Galatia, Cappadocia, Asia and "
                "Bithynia (1 Peter 1:1). No borders are drawn: the provinces were redrawn more than once.",
    },
]


# ---------- data ----------

def get(url, name):
    return fetch(url, CACHE / name, log=not name.startswith("terrarium"), timeout=300)


def geojson(name):
    return json.loads(get(NE.format(name), f"{name}.geojson").read_text(encoding="utf-8"))


def jsonl(name):
    return [json.loads(x) for x in get(GEO.format(name), f"{name}.jsonl").read_text(encoding="utf-8").splitlines() if x.strip()]


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
        kjv_name = kjv_name[0].upper() + kjv_name[1:]  # "city of David", as a name on the map
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
    z = max(3, min(15, int(math.ceil(math.log2(px_per_deg * 360 / 256)))))  # 15 for a city plan
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
    exaggerate = 2 if (fr.e0 - fr.w0) < 0.2 else 2.5 if (fr.e0 - fr.w0) < 4 else 6
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


def blur(a, sigma):
    """A Gaussian blur of a grid of heights, a row and then a column at a time."""
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.pad(a, r, mode="edge")
    a = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, a).astype(np.float32)


def relief(fr, land, lakes):
    elev, z = elevation(fr)
    if fr.e0 - fr.w0 < 0.2:
        # A city plan: the terrain, 30 to 90 metres between heights, is grainy this close, so it's smoothed and drawn
        # as an atlas draws a town: a flat tint for every 10 metres of height and a contour line between them (every
        # 50 metres darker), its few tens of metres spread over the colours, and only a little shading.
        elev = blur(elev, fr.W / SCALE / 90)
        band = np.floor(elev / 10)
        lo, hi = np.percentile(band, 2), np.percentile(band, 98)
        base = colour((band - lo) / max(hi - lo, 1) * 1100)
        shade = 0.55 + 0.45 * hillshade(elev, fr)
        edge = np.zeros(band.shape, dtype=bool)
        edge[:-1, :] |= band[:-1, :] != band[1:, :]
        edge[:, :-1] |= band[:, :-1] != band[:, 1:]
        five = np.zeros(band.shape, dtype=bool)
        b50 = np.floor(elev / 50)
        five[:-1, :] |= b50[:-1, :] != b50[1:, :]
        five[:, :-1] |= b50[:, :-1] != b50[:, 1:]
        lit = base * (0.62 + 0.5 * shade[..., None])
        line = np.array(INK, dtype=np.float32)
        lit[edge] = lit[edge] * 0.75 + line * 0.25
        lit[five] = lit[five] * 0.5 + line * 0.5
        img = Image.fromarray(np.clip(lit, 0, 255).astype(np.uint8))
        return img.resize((fr.W, fr.H), Image.LANCZOS), z
    else:
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
    step = next(s for s in (0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000) if s >= target / 1.5)
    L = step / km_per_px
    x, y = fr.W - 70 * K * TYPE - L, (fr.H - 70 * K * TYPE) if where == "bottom-right" else 90 * K * TYPE
    d.rectangle((x - 14 * K * TYPE, y - 34 * K * TYPE, x + L + 14 * K * TYPE, y + 30 * K * TYPE), fill=HALO + (200,))
    for k in range(4):
        d.rectangle((x + k * L / 4, y, x + (k + 1) * L / 4, y + 6 * K * TYPE), fill=INK if k % 2 == 0 else (250, 246, 232), outline=INK)
    f = font(12)
    d.text((x, y - 6 * K * TYPE), "0", font=f, fill=INK, anchor="mb")
    span = f"{step * 1000:.0f} m" if step < 1 else f"{step} km"  # metres and yards for a city plan
    d.text((x + L, y - 6 * K * TYPE), span, font=f, fill=INK, anchor="mb")
    other = f"{step * 1093.61:.0f} yards" if step < 1 else f"{step * 0.621371:.0f} miles"
    d.text((x + L / 2, y + 22 * K * TYPE), f"{span} is {other}", font=font(11, "400-italic"), fill=INK, anchor="mm")


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
    named = spec.get("named", []) + list(m.get("placed", {}))
    want = []
    if "books" in spec:
        want = [k for k, p in P.items() if p["kind"] and p["books"] & set(spec["books"]) and fr.w0 < p["lon"] < fr.e0 and fr.s0 < p["lat"] < fr.n0]
    outside = [k for k in named if k in P and not (fr.w0 < P[k]["lon"] < fr.e0 and fr.s0 < P[k]["lat"] < fr.n0)]
    if outside:
        print(f"  {m['id']}: outside the map, left off: {', '.join(outside)}")
    want += [k for k in named if k in P and k not in outside]
    route_ids = [k for _, _, stops in m.get("routes", []) for k in stops if isinstance(k, str)]
    want += [k for k in route_ids if k in P]
    missing = [k for k in named + route_ids if k not in P]
    if missing:
        print(f"  {m['id']}: no site for {sorted(set(missing))}")
    want = list(dict.fromkeys(want))
    # Within a city's own ground (Zion, the Sheep Gate in Jerusalem), only the city.
    cities = [k for k in want if len(P[k]["refs"]) >= 150]
    def inside(k):
        return any(c != k and abs(P[k]["lon"] - P[c]["lon"]) * 111 * fr.k < 1.5 and abs(P[k]["lat"] - P[c]["lat"]) * 111 < 1.5 for c in cities)
    want = [k for k in want if not inside(k) or k in named + route_ids]
    # Routes, under the dots.
    for name, col, stops in m.get("routes", []):
        pts = [fr.xy(*k) if isinstance(k, tuple) else fr.xy(P[k]["lon"], P[k]["lat"]) for k in stops if isinstance(k, tuple) or k in P]
        d.line(pts, fill=col + (230,), width=int(3 * K * TYPE), joint="curve")
        for a, b in zip(pts, pts[1:]):  # an arrowhead halfway along each leg
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            s = 9 * K * TYPE
            d.polygon([(mx + s * math.cos(ang), my + s * math.sin(ang)),
                       (mx + s * math.cos(ang + 2.5), my + s * math.sin(ang + 2.5)),
                       (mx + s * math.cos(ang - 2.5), my + s * math.sin(ang - 2.5))], fill=col + (255,))
    # A city's walls, as one reconstruction draws them.
    for _, col, pts in m.get("walls", []):
        xy = [fr.xy(*q) for q in pts]
        d.line(xy + xy[:1], fill=col + (255,), width=int(4 * K * TYPE), joint="curve")
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
    chosen = set(named + route_ids)  # a map's own places are named before the rest
    order = sorted(want, key=lambda k: (k not in chosen, -len(P[k]["refs"])))
    r = 5.5 * K * TYPE
    for k in order:
        x, y = fr.xy(P[k]["lon"], P[k]["lat"])
        labels.take((x - r, y - r, x + r, y + r))
    shown, unlabelled, at = [], [], {}
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
            box = None
        shown.append(k)
        at[k] = (x, y, box)  # for the picture's image map, in the drawing's pixels
    if unlabelled:
        print(f"  {m['id']}: no room to name {len(unlabelled)}: {', '.join(unlabelled[:12])}")
    # Title, key and scale.
    tf = font(30, "600-normal")
    top = 44 * K * TYPE
    if m.get("corner") == "bottom-left":  # the title and key above the scale's line, at the bottom
        top = fr.H - (120 + 26 * len(m.get("routes", []) + m.get("walls", []))) * K * TYPE
    tb = d.textbbox((50 * K * TYPE, top), m["title"], font=tf, anchor="lt")
    d.rectangle((tb[0] - 18 * K * TYPE, tb[1] - 14 * K * TYPE, tb[2] + 18 * K * TYPE, tb[3] + 16 * K * TYPE), fill=HALO + (225,), outline=INK + (255,), width=int(K))
    d.text((50 * K * TYPE, top), m["title"], font=tf, fill=INK + (255,), anchor="lt")
    keyed = m.get("routes", []) + m.get("walls", [])
    if keyed:
        kf = font(14, "500-normal")
        y = tb[3] + 40 * K * TYPE
        w = max(d.textlength(n, font=kf) for n, _, _ in keyed) + 70 * K * TYPE
        d.rectangle((tb[0] - 18 * K * TYPE, y - 16 * K * TYPE, tb[0] + w, y + len(keyed) * 26 * K * TYPE), fill=HALO + (225,), outline=INK + (255,), width=int(K))
        for name, col, _ in keyed:
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
    return buf.getvalue(), shown, z, {k: (x / SCALE, y / SCALE, box and [round(c / SCALE) for c in box]) for k, (x, y, box) in at.items()}


def own(m, P):
    """The places as this map has them: those it puts by hand ("placed": a city's gates, which OpenBible.info sets at
    the city's middle), drawn as uncertain, and names the KJV gives that OpenBible doesn't record ("names")."""
    P = dict(P)
    for k, (lon, lat) in m.get("placed", {}).items():
        P[k] = {**P[k], "lon": lon, "lat": lat, "sure": False}
    for k, name in m.get("names", {}).items():
        P[k] = {**P[k], "name": name}
    return P


def osis_ref(o):
    b, c, v = (o.split(".") + ["", ""])[:3]
    return f"{BOOK_ABBR[OSIS[b] - 1]} {c}:{v}" if b in OSIS and c and v else None


# A place's hit-target in the image map, a little larger than its dot (5.5 * K * TYPE at the drawing's size).
HIT = round(5.5 * K * TYPE / SCALE * 1.8)


def image_map(m, at, P):
    """The picture's places as an HTML image map: a circle on each dot, in the saved picture's pixels, with the
    place's name, whether its site is sure, all its verses (data-refs, "Gen 12:8;Josh 7:2") and the box of its
    name on the map (data-label, "x0,y0,x1,y1"), for the app to make each place clickable."""
    areas = []
    for k, (x, y, box) in at.items():
        p = P[k]
        refs = ";".join(r for r in (osis_ref(o) for o in p["refs"]) if r)
        name = html.escape(p["name"], quote=True)
        label = f' data-label="{",".join(map(str, box))}"' if box else ""
        areas.append(f'<area shape="circle" coords="{round(x)},{round(y)},{HIT}" alt="{name}" title="{name}" '
                     f'data-sure="{1 if p["sure"] else 0}"{label} data-refs="{refs}">')
    return f'<map name="m-{m["id"]}">' + "".join(areas) + "</map>"


def chapter(m, webp, shown, P, at):
    items = []
    for k in sorted(shown, key=lambda k: P[k]["name"]):
        p = P[k]
        refs = [r for r in (osis_ref(o) for o in p["refs"]) if r]
        more = f" and {len(refs) - 3} more" if len(refs) > 3 else ""
        items.append(f"<b>{html.escape(p['name'])}</b>{'' if p['sure'] else ' (site uncertain)'}: "
                     + ", ".join(f"<ref>{r}</ref>" for r in refs[:3]) + more)
    return (f'<p><img src="data:image/webp;base64,{base64.b64encode(webp).decode()}" usemap="#m-{m["id"]}">'
            f"{image_map(m, at, P)}</p>"
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
        Pm = own(m, P)
        webp, shown, z, at = draw(m, Pm, layers, out_dir)
        rows.append((f"{n}. {m['title']}", chapter(m, webp, shown, Pm, at)))
        print(f"  {m['id']}: {len(shown)} places, zoom {z}, {len(webp) / 1e3:.0f} KB")
    if only:
        return
    info = ("<p>Maps of the Bible's lands, drawn for Two-edged Sword: the patriarchs, the Exodus, the tribes, David and "
            "Solomon's kingdom, the divided kingdoms, the Assyrian, Babylonian and Persian empires, Jerusalem in the Old "
            "Testament and in Jesus' day, the land in the time of Jesus and his ministry, Paul's journeys, the seven "
            "churches of Revelation and the Roman Empire, each with a note on its period and the places on it, with their "
            "verses.</p>"
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
