# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""The cover of each module the tools build, by file name (without its extension): a spec for tools/covers' `render`.
Books that draw their own (tools/ccel, tools/gutenberg, tools/larkin) aren't here. Related modules are bound alike, as
a set would be: the original-language texts by language, the Talmud by its orders, a module and its "w/ glosses" or
"w/ Strong's" twin with a line saying so."""

STRONGS, GLOSSES = "WITH STRONG’S NUMBERS", "WITH GLOSSES"


def pair(name, spec, badge, also=None):
    """A module and its twin with the same cover and a badge."""
    return {name: spec, also or f"{name}+": {**spec, "badge": badge}}


CATALOG = {}

# English Bibles: each its own binding.
CATALOG |= pair("kjv", dict(base=("leather", (24, 22, 24)), layout="classic", font="fell", border="corners", emblem="cross",
                            title=[("HOLY BIBLE", 82)], sub=[("KING JAMES VERSION", 30), ("1769", 30)]), STRONGS)
CATALOG |= pair("webster", dict(base=("cloth", (36, 52, 86)), layout="classic", border="triple", emblem="quill",
                                title=[("THE HOLY BIBLE", 58)], sub=[("NOAH WEBSTER", 32), ("1833", 24)]), STRONGS)
CATALOG |= pair("bsb", dict(base=("smooth", (232, 226, 214)), layout="top", font="cinzel", border="single", emblem="wheat",
                            stamp=(40, 70, 96), title=[("BEREAN", 64), ("STANDARD BIBLE", 40)]), STRONGS)
CATALOG |= {
    "asv": dict(base=("leather", (30, 44, 74)), layout="classic", border="double", emblem="book",
                title=[("THE HOLY BIBLE", 58)], sub=[("AMERICAN STANDARD VERSION", 26), ("1901", 28)]),
    "rv": dict(base=("cloth", (108, 30, 38)), layout="label", accent=(30, 26, 26), border="single", emblem="crown",
               title=[("THE HOLY", 48), ("BIBLE", 72)], sub=[("REVISED VERSION", 30), ("1885", 28)]),
    "web": dict(base=("linen", (46, 92, 74)), layout="top", font="cinzel", border="single", emblem="globe",
                title=[("WORLD ENGLISH", 50), ("BIBLE", 72)]),
    "darby": dict(base=("leather", (78, 46, 30)), layout="classic", border="beaded", emblem="wreath",
                  title=[("THE HOLY", 46), ("SCRIPTURES", 64)], sub=[("A NEW TRANSLATION", 24), ("J. N. DARBY", 32)]),
    "ylt": dict(base=("cloth", (70, 82, 96)), layout="classic", border="double", emblem="alphaomega",
                title=[("YOUNG’S", 56), ("LITERAL", 56), ("TRANSLATION", 46)], sub=[("ROBERT YOUNG", 32)]),
    "drc": dict(base=("leather", (92, 22, 30)), layout="classic", font="fell", border="corners", emblem="chirho",
                title=[("THE HOLY BIBLE", 56)], sub=[("DOUAY-RHEIMS", 32), ("CHALLONER’S REVISION", 22)]),
    "geneva1599": dict(base=("cloth", (150, 120, 84)), layout="halfbound", accent=(64, 36, 24), font="fell",
                       title=[("THE", 34), ("BIBLE", 76)], sub=[("GENEVA", 40), ("1599", 28)]),
    "tyndale": dict(base=("linen", (170, 146, 108)), layout="halfbound", accent=(52, 34, 26), font="fell",
                    title=[("The Newe", 56, "fraktur"), ("Testament", 76, "fraktur")], sub=[("WILLIAM TYNDALE", 26), ("1525 · 1530", 24)]),
    "rheims1582": dict(base=("cloth", (120, 104, 80)), layout="halfbound", accent=(80, 24, 30), font="fell",
                       title=[("THE NEW", 40), ("TESTAMENT", 52)], sub=[("RHEIMS", 36), ("1582", 28)]),
    "weymouth": dict(base=("buckram", (54, 74, 50)), layout="classic", border="single", emblem="lamp",
                     title=[("THE NEW TESTAMENT", 40), ("IN MODERN SPEECH", 32)], sub=[("R. F. WEYMOUTH", 32)]),
    "mkjv": dict(base=("buckram", (34, 50, 44)), layout="classic", border="double", emblem="dove",
                 title=[("THE HOLY BIBLE", 58)], sub=[("MODERN KING JAMES VERSION", 24), ("JAY P. GREEN", 28)]),
    "brenton": dict(base=("cloth", (88, 82, 48)), layout="classic", border="greek", emblem="scroll",
                    title=[("THE SEPTUAGINT", 50), ("IN ENGLISH", 36)], sub=[("SIR LANCELOT BRENTON", 28), ("1844", 24)]),
    "etheridge": dict(base=("linen", (196, 176, 136)), layout="classic", stamp=(70, 40, 26), border="beaded", emblem="rosette",
                      title=[("THE PESHITTA", 52), ("ܦܫܝܛܬܐ", 40, "syriac")], sub=[("NEW TESTAMENT", 26), ("J. W. ETHERIDGE", 30)]),
    "murdock": dict(base=("linen", (184, 160, 118)), layout="classic", stamp=(60, 30, 30), border="double", emblem="rosette",
                    title=[("THE PESHITTA", 52), ("ܦܫܝܛܬܐ", 40, "syriac")], sub=[("NEW TESTAMENT", 26), ("JAMES MURDOCK", 30)]),
}

# The original-language texts, a set for each language.
GREEK = dict(base=("leather", (22, 40, 70)), layout="classic", border="greek", font="cinzel")
CATALOG |= pair("byz", {**GREEK, "emblem": "alphaomega", "title": [("Η ΚΑΙΝΗ", 54, "greek"), ("ΔΙΑΘΗΚΗ", 54, "greek")],
                        "sub": [("BYZANTINE TEXT", 30), ("2018", 24)]}, GLOSSES)
CATALOG |= pair("beza1598", {**GREEK, "base": ("leather", (60, 26, 30)), "emblem": "chirho",
                             "title": [("Η ΚΑΙΝΗ", 54, "greek"), ("ΔΙΑΘΗΚΗ", 54, "greek")], "sub": [("THEODORE BEZA", 30), ("1598", 24)]}, GLOSSES)
CATALOG |= pair("tr1550", {**GREEK, "base": ("leather", (52, 32, 22)), "emblem": "book",
                           "title": [("Η ΚΑΙΝΗ", 54, "greek"), ("ΔΙΑΘΗΚΗ", 54, "greek")], "sub": [("TEXTUS RECEPTUS", 28), ("STEPHANUS 1550", 24)]}, GLOSSES)
CATALOG |= pair("lxx_brenton", {**GREEK, "base": ("leather", (34, 58, 52)), "emblem": "scroll",
                                "title": [("Η ΠΑΛΑΙΑ", 50, "greek"), ("ΔΙΑΘΗΚΗ", 54, "greek")], "sub": [("THE SEPTUAGINT", 30), ("BRENTON 1844", 24)]}, GLOSSES)
HEBREW = dict(base=("leather", (30, 46, 40)), layout="classic", border="double", font="goudy")
CATALOG |= pair("ginsburg", {**HEBREW, "emblem": "menorah", "title": [("תורה נביאים כתובים", 46, "hebrew")],
                             "sub": [("HEBREW BIBLE", 30), ("GINSBURG 1894", 24)]}, GLOSSES)
CATALOG |= pair("wlc", {**HEBREW, "base": ("leather", (40, 34, 60)), "emblem": "tablets",
                        "title": [("תורה נביאים כתובים", 46, "hebrew")], "sub": [("WESTMINSTER", 30), ("LENINGRAD CODEX", 26)]}, STRONGS)
TARGUM = dict(base=("cloth", (44, 50, 92)), layout="band", accent=(26, 28, 52), border="single", emblem="menorah", font="goudy")
CATALOG |= pair("targum_aramaic", {**TARGUM, "title": [("תרגום", 60, "hebrew"), ("TARGUM", 40)], "sub": [("ONKELOS & JONATHAN", 26), ("ARAMAIC", 24)]}, GLOSSES)
CATALOG |= pair("pseudojonathan_aramaic", {**TARGUM, "base": ("cloth", (70, 44, 84)), "accent": (40, 24, 50),
                                           "title": [("תרגום יונתן", 52, "hebrew"), ("PSEUDO-JONATHAN", 34)], "sub": [("ARAMAIC", 24)]}, GLOSSES)
CATALOG |= {
    "targum_english": {**TARGUM, "title": [("תרגום", 60, "hebrew"), ("THE TARGUMS", 40)], "sub": [("IN ENGLISH", 26), ("J. W. ETHERIDGE", 26)]},
    "pseudojonathan_english": {**TARGUM, "base": ("cloth", (70, 44, 84)), "accent": (40, 24, 50),
                               "title": [("תרגום יונתן", 52, "hebrew"), ("PSEUDO-JONATHAN", 34)], "sub": [("IN ENGLISH", 26), ("J. W. ETHERIDGE", 26)]},
}
LATIN = dict(base=("leather", (112, 20, 24)), layout="classic", border="corners", font="cinzel", emblem="chirho")
CATALOG |= pair("clementine", {**LATIN, "title": [("BIBLIA", 66), ("SACRA", 66)], "sub": [("VULGATA", 30), ("CLEMENTINA", 26)]}, GLOSSES)
CATALOG |= {"latin+": {**LATIN, "base": ("leather", (84, 22, 50)), "badge": GLOSSES,
                       "title": [("BIBLIA", 66), ("SACRA", 66)], "sub": [("VULGATA", 30)]}}
CATALOG |= pair("peshitta", dict(base=("leather", (96, 60, 30)), layout="pattern", motif="diamond", font="goudy",
                                 title=[("ܦܫܝܛܬܐ", 60, "syriac"), ("THE PESHITTA", 40)], sub=[("SYRIAC", 26)]), "WITH GREEK GLOSSES")

# Commentaries.
CATALOG |= {
    "henry": dict(base=("cloth", (40, 70, 44)), layout="classic", border="double", emblem="wreath",
                  title=[("COMMENTARY", 44), ("ON THE WHOLE", 34), ("BIBLE", 64)], sub=[("MATTHEW HENRY", 34)]),
    "clarke": dict(base=("leather", (70, 40, 26)), layout="label", accent=(24, 24, 30), border="single", emblem="lamp",
                   title=[("ADAM CLARKE’S", 38), ("COMMENTARY", 48)], sub=[("ON THE HOLY BIBLE", 28)]),
    "jfb": dict(base=("cloth", (30, 40, 70)), layout="classic", border="triple", emblem="book",
                title=[("A COMMENTARY", 44), ("CRITICAL AND", 30), ("EXPLANATORY", 40)], sub=[("JAMIESON · FAUSSET · BROWN", 22)]),
    "barnes": dict(base=("buckram", (96, 30, 36)), layout="classic", border="rope", emblem="anchor",
                   title=[("NOTES ON THE", 38), ("NEW TESTAMENT", 48)], sub=[("ALBERT BARNES", 34)]),
    "wesley": dict(base=("cloth", (36, 36, 40)), layout="top", border="single", emblem="flame",
                   title=[("EXPLANATORY", 46), ("NOTES", 60)], sub=[("JOHN WESLEY", 34)]),
    "tsk": dict(base=("leather", (64, 30, 60)), layout="pattern", motif="star", font="goudy",
                title=[("THE TREASURY", 44), ("OF SCRIPTURE", 40), ("KNOWLEDGE", 46)], sub=[("R. A. TORREY", 26)]),
    "openbible_xref": dict(base=("smooth", (226, 230, 232)), layout="top", font="cinzel", border="single", emblem="knot",
                           stamp=(30, 70, 110), title=[("CROSS", 60), ("REFERENCES", 44)], sub=[("OPENBIBLE.INFO", 26)]),
}

# Dictionaries, encyclopedias and lexicons.
CATALOG |= {
    "easton": dict(base=("cloth", (150, 120, 70)), layout="classic", stamp=(40, 30, 20), border="double", emblem="quill",
                   title=[("EASTON’S", 52), ("BIBLE", 64), ("DICTIONARY", 44)], sub=[("M. G. EASTON", 30), ("1897", 24)]),
    "smith": dict(base=("cloth", (34, 64, 96)), layout="label", accent=(110, 30, 34), border="single", emblem="scroll",
                  title=[("SMITH’S", 46), ("BIBLE DICTIONARY", 40)], sub=[("WILLIAM SMITH", 32)]),
    "isbe": dict(base=("buckram", (82, 24, 28)), layout="band", accent=(24, 22, 24), border="triple", emblem="globe",
                 title=[("THE INTERNATIONAL", 32), ("STANDARD BIBLE", 34), ("ENCYCLOPAEDIA", 38)], sub=[("JAMES ORR", 30), ("1915", 24)]),
    "nave": dict(base=("cloth", (56, 80, 52)), layout="classic", border="beaded", emblem="tablets",
                 title=[("NAVE’S", 56), ("TOPICAL BIBLE", 44)], sub=[("ORVILLE J. NAVE", 30)]),
    "torrey": dict(base=("linen", (98, 104, 58)), layout="classic", border="corners", emblem="star",
                   title=[("TORREY’S", 52), ("TOPICAL", 48), ("TEXTBOOK", 48)], sub=[("R. A. TORREY", 30)]),
    "hitchcock": dict(base=("cloth", (90, 54, 92)), layout="top", border="double", emblem="scroll",
                      title=[("HITCHCOCK’S", 46), ("BIBLE NAMES", 48)], sub=[("ROSWELL D. HITCHCOCK", 26)]),
    "places": dict(base=("smooth", (222, 210, 180)), layout="top", stamp=(70, 46, 28), border="beaded", emblem="compass",
                   font="cinzel", title=[("BIBLE", 64), ("PLACES", 64)], sub=[("OPENBIBLE.INFO", 26)]),
    "webster1828": dict(base=("cloth", (120, 96, 66)), layout="halfbound", accent=(46, 30, 22), font="fell",
                        title=[("AMERICAN", 38), ("DICTIONARY", 44), ("OF THE ENGLISH", 26), ("LANGUAGE", 38)], sub=[("NOAH WEBSTER", 30), ("1828", 26)]),
    "kjc": dict(base=("leather", (40, 40, 44)), layout="label", accent=(120, 24, 28), border="corners", emblem="key",
                title=[("CONCORDANCE", 42), ("TO THE KING JAMES", 26), ("VERSION", 34)]),
    "strong": dict(base=("cloth", (30, 54, 64)), layout="classic", border="greek", emblem="key",
                   title=[("STRONG’S", 52), ("HEBREW AND GREEK", 30), ("DICTIONARIES", 40)], sub=[("JAMES STRONG", 30), ("1890", 24)]),
    "abbott": {**GREEK, "base": ("leather", (52, 32, 22)), "emblem": "book",
               "title": [("ΛΕΞΙΚΟΝ", 54, "greek"), ("GREEK LEXICON", 36)], "sub": [("G. ABBOTT-SMITH", 28), ("1922", 24)]},
    "bdb_unabridged": {**HEBREW, "base": ("leather", (54, 40, 26)), "emblem": "book",
                       "title": [("מלון", 60, "hebrew"), ("HEBREW LEXICON", 36)], "sub": [("BROWN · DRIVER · BRIGGS", 24), ("1906", 24)]},
}

# Devotionals and maps.
CATALOG |= {
    "daily": dict(base=("linen", (70, 104, 140)), layout="top", border="single", emblem="sun", stamp="silver",
                  title=[("DAILY LIGHT", 52), ("ON THE DAILY PATH", 32)], sub=[("SAMUEL BAGSTER", 28)]),
    "sme": dict(base=("cloth", (30, 34, 62)), layout="top", border="double", emblem="moon",
                title=[("MORNING", 54), ("AND EVENING", 40)], sub=[("C. H. SPURGEON", 32)]),
    "maps": dict(base=("linen", (210, 196, 160)), layout="top", stamp=(80, 50, 30), border="greek", emblem="compass",
                 font="cinzel", title=[("BIBLE", 66), ("MAPS", 66)], sub=[("AND TIMELINES", 24)]),
}

# The Babylonian Talmud: one binding for the set, its cloth's colour by order, each tractate's name in Hebrew and English.
ORDERS = {  # the order, its colour, and its tractates: (file name, Hebrew)
    ("ZERAIM", (54, 82, 40)): [("berakhot", "ברכות")],
    ("MOED", (36, 52, 92)): [("shabbat", "שבת"), ("eruvin", "עירובין"), ("pesachim", "פסחים"), ("yoma", "יומא"),
                              ("sukkah", "סוכה"), ("beitzah", "ביצה"), ("rosh_hashanah", "ראש השנה"), ("taanit", "תענית"),
                              ("megillah", "מגילה"), ("moed_katan", "מועד קטן"), ("chagigah", "חגיגה")],
    ("NASHIM", (100, 30, 40)): [("yevamot", "יבמות"), ("ketubot", "כתובות"), ("nedarim", "נדרים"), ("nazir", "נזיר"),
                                 ("sotah", "סוטה"), ("gittin", "גיטין"), ("kiddushin", "קידושין")],
    ("NEZIKIN", (30, 30, 34)): [("bava_kamma", "בבא קמא"), ("bava_metzia", "בבא מציעא"), ("bava_batra", "בבא בתרא"),
                                 ("sanhedrin", "סנהדרין"), ("makkot", "מכות"), ("shevuot", "שבועות"),
                                 ("avodah_zarah", "עבודה זרה"), ("horayot", "הוריות")],
    ("KODASHIM", (96, 64, 30)): [("zevachim", "זבחים"), ("menachot", "מנחות"), ("chullin", "חולין"), ("bekhorot", "בכורות"),
                                  ("arakhin", "ערכין"), ("temurah", "תמורה"), ("keritot", "כריתות"), ("meilah", "מעילה"),
                                  ("tamid", "תמיד")],
    ("TOHOROT", (60, 76, 84)): [("niddah", "נדה")],
}
for (order, colour), tractates in ORDERS.items():
    for name, hebrew in tractates:
        CATALOG[f"talmud_{name}"] = dict(
            base=("leather", colour), layout="band", accent=(26, 22, 20), border="double", emblem="star6",
            title=[("תלמוד בבלי", 34, "hebrew"), (hebrew, 56, "hebrew"), (name.replace("_", " ").upper(), 36)],
            sub=[("THE BABYLONIAN TALMUD", 22), (f"SEDER {order}", 22)])
