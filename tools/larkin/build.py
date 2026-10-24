# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds Clarence Larkin's books, with their charts, from the Internet Archive's scans of the printed books:

  larkin_dispensational_truth.refi   Dispensational Truth, or God's Plan and Purpose in the Ages (revised, 1920)
  larkin_revelation.refi             The Book of Revelation (1919), its charts printed sideways turned to read
  larkin_daniel.refi                 The Book of Daniel (1929)
  larkin_second_coming.refi          The Second Coming of Christ (1918), from a later reprint
  larkin_spirit_world.refi           The Spirit World (1921)
  larkin_rightly_dividing.refi       Rightly Dividing the Word (1921), from a later printing

    python3 tools/larkin/build.py [dispensational_truth revelation daniel second_coming spirit_world rightly_dividing]

Larkin (1850–1924) published his books himself, from 1918; they are public domain (published in the United States
before 1930, and their author dead more than 70 years). The charts are the heart of them, so each page that has a
chart or picture is kept as a picture at its place in the text, and a chart printed across two facing pages is
joined back into one; the app's picture viewer enlarges them. The pages were found by eye from the scans (CHARTS,
SPREADS below), as the OCR doesn't mark where the pictures are.

The text is the Archive's OCR (its hOCR: every line with its place and size on the page), in its reading order:
running heads and page numbers are dropped, and on a page with a chart, so are the chart's own labels (short lines,
or lone ones, that aren't the page's text). A line in larger type at a chapter's start is its heading. Words broken
at a line's end are joined. Bible references written in the text ("Matt. 12:40") are linked where each is a real
verse (tools/core's link_plain_refs). Lines and paragraphs the OCR misread past use are left out (garbled), and
fixes/<book>.json, a proofreading of the built text, drops the junk that's left and puts misread words right; each
of its fixes was accepted only where another scanned copy's OCR reads it that way, it changes a few letters, or it
takes out only junk or a running head. Other misreadings are left as they are, and a chart's text is in the picture
only, so it can't be searched.

Sources: the Archive's item (archive.org/details/<id>), its hOCR and its page images (<id>_jp2.zip), each checked
against its sha256, as the Archive's files have no versions. Downloads are cached in
~/Library/Caches/Two-edged Sword/larkin, and so are the pictures once drawn (pictures/): one is drawn again only when
what it's drawn from changes (its scans, leaves, turning or other copies, or the code that draws pictures). Writes to
the app's modules folder, or to `into`.
"""
import base64, io, json, re, statistics, sys, zipfile
import xml.etree.ElementTree as ET
from html import escape, unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import CACHES, fetch, module  # noqa: E402
import covers  # noqa: E402

CACHE = CACHES / "larkin"
FIXES = Path(__file__).resolve().parent / "fixes"  # the proofreading: per book, paragraphs to drop and misreadings put right
NS = "{http://www.w3.org/1999/xhtml}"
ARCHIVE = "https://archive.org/download/{id}/{id}{suffix}"


def pages(*spans):
    """Leaf numbers from (first, last) pairs and single leaves."""
    out = []
    for s in spans:
        out += list(range(s[0], s[1] + 1)) if isinstance(s, tuple) else [s]
    return out


BOOKS = {
    "dispensational_truth": dict(
        id="dispensationaltr0000lark",
        hocr="f9743a4645a97217e96040866e42fe6967ed49a59a34d2c70066fcf7778a41f5",
        jp2="1207c47210912f92a25bcb27c9a4737e242fd19640a8c5c855f8e94c92537877",
        title="Dispensational Truth", abbrev="Larkin DT",
        cover=("dispensationaltr0000clar", 1),  # that copy's cover has no library label on it
        about="Clarence Larkin's Dispensational Truth, or God's Plan and Purpose in the Ages (revised and enlarged "
              "edition, 1920), with its charts: the ages and dispensations of Scripture set out in large drawings, "
              "from the Creation to the New Heavens and the New Earth.",
        # Leaves (the Archive's page images, numbered from 0) the book runs over: from the Foreword to the last
        # chapter's end, before the publisher's list of the author's other books.
        first=11, last=270,
        # Other scans of the same edition (other copies of the book), whose two-page charts may show more of what
        # the binding hides: each with its hOCR-less page images and, for each two-page chart's left leaf here, its
        # left leaf there (found by matching the pages' thumbnails).
        copies=[
            dict(id="dispensationaltr0000clar", jp2="8d1a452915af1d2f98f1e6deb4a08d4260d27813fdcd0705dccc2e30cb1ea2ff",
                 leaves={14: 16, 18: 22, 22: 28, 34: 42, 38: 48, 42: 54, 46: 60, 56: 72, 60: 78, 72: 92, 74: 96, 92: 116,
                         94: 120, 104: 132, 110: 140, 114: 146, 116: 150, 122: 158, 128: 166, 130: 170, 134: 176, 138: 182,
                         140: 186, 144: 192, 152: 202, 156: 208, 158: 212, 172: 228, 178: 236, 184: 244, 198: 260, 200: 264,
                         208: 274, 216: 284, 228: 298, 232: 304, 236: 310, 244: 320, 246: 324, 250: 330, 260: 342, 264: 348}),
            dict(id="dispensationaltr0000clar_o0h0", jp2="8f6867fdc25e6e75a3afa7f10938aa484751d7dc17b978a373e6243121ed0615",
                 leaves={14: 16, 18: 20, 22: 24, **{n: n for n in (34, 38, 42, 46, 56, 60, 72, 74, 92, 94, 104, 110, 114,
                         116, 122, 128, 130, 134, 138, 140, 144, 152, 156, 158, 172, 178, 184, 198, 200, 208, 216, 228,
                         232, 236, 244, 246, 250, 260, 264)}}),
        ],
        # A chart across two facing pages: its left leaf, the right one being the next.
        spreads=[14, 18, 22, 34, 38, 42, 46, 56, 60, 72, 74, 92, 94, 104, 110, 114, 116, 122, 128, 130, 134, 138, 140,
                 144, 152, 156, 158, 172, 178, 184, 198, 200, 208, 216, 228, 232, 236, 244, 246, 250, 260, 264],
        # Charts printed on the pages before the chapter they belong to (their titles name it): each is put after
        # that chapter's heading instead. By the left leaf of a two-page chart.
        ahead={14, 18, 34, 116, 130, 158, 198, 200},
        # A leaf with a chart or a picture on it, among its text.
        charts=pages(24, 28, 30, 32, 40, 45, 49, 50, 51, 52, 54, 58, 63, 65, 66, 67, 68, 69, 70, 71, 78, 83, 90, 102,
                     112, 113, 118, 127, 137, 163, 164, 166, 169, 170, 176, 182, 183, 186, 187, 189, 190, 191, 192, 193,
                     195, 196, 197, 203, 207, 222, 223, 226, 227, 235, 238, 239, 240, 241, 255, 256, 268),
        # Each chapter: the leaf its heading is on, and its heading's words as the OCR read them (the start of the
        # line in larger type), and its title.
        chapters=[
            (11, "FOREWORD", "Foreword"),
            (12, "THE PROPHETIC WORD", "1. The Prophetic Word"),
            (16, "PRE", "2. Pre-Millennialism"),
            (20, "MOUNTAIN PEAKS OF PROPHECY", "3. Mountain Peaks of Prophecy"),
            (24, "THE SECOND COMING OF CHRIST", "4. The Second Coming of Christ"),
            (37, "RIGHTLY DIVIDING THE WORD", "5. Rightly Dividing the Word"),
            (76, "THE PRESENT EVIL WORLD", "6. The Present Evil World"),
            (78, "THE DISPENSATIONAL WORK", "7. The Dispensational Work of the Lord Jesus Christ"),
            (85, "THE DISPENSATIONAL WORK", "8. The Dispensational Work of the Holy Spirit"),
            (91, "THE JEWS", "9. The Jews"),
            (103, "THE GENTILES", "10. The Gentiles"),
            (118, "THE CHURCH", "11. The Church"),
            (132, "THE KING", "12. The King"),
            (137, "THE KINGDOM", "13. The Kingdom"),
            (160, "THE SPIRIT WORLD", "14. The Spirit World"),
            (164, "SPIRITISM", "15. Spiritism"),
            (167, "THE RESURRECTION", "16. The Resurrection"),
            (171, "THE JUDGMENTS", "17. The Judgments"),
            (177, "SATAN", "18. Satan"),
            (183, "ANTICHRIST", "19. The Antichrist"),  # "THE" is read as a line of its own
            (193, "THE SATANIC TRINITY", "20. The Satanic Trinity"),
            (196, "THE FOUR GOSPELS", "21. The Four Gospels"),
            (202, "THE SEVEN CHURCHES", "22. The Seven Churches"),
            (207, "THE TRIBULATION", "23. The Tribulation"),
            (218, "BABYLON THE GREAT", "24. Babylon the Great"),
            (222, "RENOVATION OF THE EARTH", "25. Renovation of the Earth"),
            (227, "THE COVENANTS", "26. The Covenants"),
            (231, "THE MYSTERIES", "27. The Mysteries"),
            (235, "TYPES AND ANTI", "28. Types and Anti-Types"),
            (239, "THE THREE TREES", "29. The Three Trees to Which Israel Is Compared in the Scriptures"),
            (243, "THE FEASTS OF THE LORD", "30. The Feasts of the Lord"),
            (249, "THE OFFERINGS", "31. The Offerings"),
            (254, "DISPENSATIONAL TEACHING", "32. The Dispensational Teaching of the Great Pyramid"),
            (263, "SCRIPTURE NUMERICS", "33. Scripture Numerics"),
            (267, "THE SIGNS OF THE TIMES", "34. The Signs of the Times"),
        ],
    ),
    "revelation": dict(
        id="bookofrevelation00lark",
        hocr="6c1170959c81c89892aa4f487bb3ca233d7fc259ba39b82c208e0755c9c01e0b",
        jp2="2c6d39444038487d460e6b9b4d036a879f2271fdb88eb79fb8cae1713744bf28",
        title="The Book of Revelation", abbrev="Larkin Rev",
        cover=("bookofrevelation00lark", 1),
        about="Clarence Larkin's The Book of Revelation: A Study of the Last Prophetic Book of Holy Scripture (1919), "
              "with its charts: the book read as a whole, from \"the things which thou hast seen\" to the New Heaven "
              "and the New Earth.",
        first=15, last=240,
        # A later scan of another copy, for what its two-page charts show at the binding (its pages are numbered alike).
        copies=[dict(id="bookofrevelation0000clar_c9f4", jp2="de8abe0b253272af86ae1b3d1b1d8fece8cb003975c6142cb7e61c43ae9f691d",
                     leaves={20: 20, 72: 72})],
        spreads=[20, 72],
        # Two-page charts printed between paragraphs of text, which is kept (other two-page charts fill their pages).
        spread_text={72},
        charts=[18, 27, 32, 41, 52, 58, 59, 61, 64, 66, 68, 69, 77, 79, 81, 82, 83, 84, 88, 89, 90, 95, 96, 99, 101, 104, 106, 115, 121, 129, 132, 134, 135, 136, 138, 141, 145, 147, 149, 151, 153, 154, 158, 160, 161, 162, 164, 167, 171, 174, 175, 186, 188, 189, 207, 208, 211, 215, 226, 234, 240],
        # The picture facing the title page and the two-page chart after it: the Introduction's, not the Foreword's.
        ahead={18, 20},
        # Charts printed sideways on the page, turned to read (a quarter turn clockwise).
        sideways=[18, 27, 32, 41, 52, 59, 61, 69, 77, 101, 132, 149, 153, 167, 174, 186, 207, 208, 211, 215, 226, 234],
        chapters=[
            (15, "FOREWORD", "Foreword"),
            (23, "THE BOOK OF REVELATION", "Introduction: The Title, the Blessing, the Salutation"),
            (30, "THE THINGS WHICH THOU HAST SEEN", "1. The Things Which Thou Hast Seen"),
            (40, "THE THINGS WHICH ARE", "2. The Things Which Are: the Seven Churches"),
            (54, "THE THINGS WHICH SHA", "3. The Things Which Shall Be Hereafter"),
            (79, "THE SEVEN SEALS", "4. The Seven Seals"),
            (91, "THE INTERVAL BETWEEN THE SIXTH", "5. The Interval Between the Sixth and Seventh Seals"),
            (96, "THE SEVEN TRUMPETS", "6. The Seven Trumpets"),
            (106, "THE INTERVAL BETWEEN THE SIXTH", "7. The Interval Between the Sixth and Seventh Trumpets"),
            (115, "THE MIDDLE OF THE WEEK", "8. The Middle of the Week: the Seven Personages"),
            (164, "THE SEVEN LAST PLAGUES", "9. The Seven Last Plagues, or Vial Judgments"),
            (175, "THE SEVEN DOOMS", "10. The Seven Dooms"),
            (225, "THE SEVEN NEW THINGS", "11. The Seven New Things"),
            (239, "THE AGES OF THE AGES", "12. The Ages of the Ages"),
        ],
    ),
    "daniel": dict(
        id="bookofdaniel00lark",
        hocr="a120e2a6c11c2f7b7d66a53f779c236ac907299e335f257f148498d5e692b2ab",
        jp2="4b509949366b188783508c9b35c9029eef239000f0ab9dc685c9534097502c7e",
        title="The Book of Daniel", abbrev="Larkin Dan",
        cover=("bookofdaniel00lark", 1),
        about="Clarence Larkin's The Book of Daniel (1929), published after his death, with its charts: the book "
              "expounded chapter by chapter, its history and its prophecy of the times of the Gentiles.",
        first=15, last=293,
        spreads=[20, 136, 192],
        charts=[116, 156, 157, 167, 224, 225, 229],
        tables={224, 225},  # comparing Daniel, Matthew 24 and Revelation: pictures, with the prose under them
        sideways=[116, 229],
        # The blank backs of the fold-out chart (the OCR read what shows through), and the pages announcing the two
        # divisions of the exposition.
        skip={19, 22, 35, 133},
        # "Daniel and Revelation Compared" opens the prophetical chapters; "Daniel's Seventieth Week" is chapter 9's.
        ahead={136, 192},
        chapters=[
            (15, "INTRODUCTION", "Introduction"),
            (23, "THE PROPHETIC WORD", "The Prophetic Word"),
            (28, "THE BOOK OF DANIEL", "The Book of Daniel"),
            (37, "CHAPTER ONE", "1. The Beginning of Gentile Dominion"),
            (46, "CHAPTER TWO", "2. Nebuchadnezzar's Dream"),
            (74, "CHAPTER THREE", "3. The Golden Image"),
            (87, "CHAPTER FOUR", "4. The Tree Dream"),
            (96, "CHAPTER FIVE", "5. The Fall of Babylon"),
            (124, "CHAPTER SIX", "6. The Lions' Den"),
            (139, "CHAPTER SEVEN", "7. The Four Wild Beasts"),
            (177, "CHAPTER EIGHT", "8. The Ram and the He-Goat"),
            (195, "CHAPTER NINE", "9. The Seventy Weeks"),
            (243, "THE SCRIPTURE OF TRUTH", "10–12. The Scripture of Truth"),
            (245, "PART ONE", "10–12, Part 1: The Relation of Supernatural Beings to the Earth"),
            (254, "PART TWO", "10–12, Part 2: The Pre-written History of the Kings of the North and the South"),
            (272, "PART THREE", "10–12, Part 3: The Time of the End"),
        ],
    ),
    "second_coming": dict(
        id="secondcomingofch0000clar",
        hocr="d7ec45bc64c7baca7d485052651d2fc705c07c005170fa997bf806bfcaf7215b",
        jp2="ad40a345e19cbe098d181bd553e4f52f52383a303ccc01a67f2bca5310abd60d",
        title="The Second Coming of Christ", abbrev="Larkin SC",
        cover=("secondcomingofch0000clar", 1),
        about="Clarence Larkin's The Second Coming of Christ (1918), with its charts: a short pamphlet on the Lord's "
              "return, its stages, the resurrections and judgments, and the signs of the times.",
        # From the frontispiece (the Ascension) to the poem that ends the book, before the publisher's list. The only scan
        # is of a later reprint by Larkin's estate; its fixes were checked against a second OCR of the same pages.
        first=4, last=73,
        spreads=[38],  # Chart No. 4, The Stages of the Second Coming
        charts=[4, 6, 8, 19, 22, 23, 24, 32, 34, 36, 40, 43, 45, 47, 48, 50, 52, 54, 56, 58, 60, 63, 64, 65, 66, 71],
        # Pages of text with a small picture or table on them: pictured, but read as text pages (their one-line headings
        # and short lines kept, which a chart's page takes for its labels).
        figures={23, 24, 32, 45, 47, 58, 63, 64, 66, 71},
        sideways=[6, 8, 40, 43, 48, 50, 52, 54, 56, 60, 65],
        # The frontispiece goes under the Foreword's heading; Chart No. 1 and the charts of the Resurrections and of the
        # Church and the Kingdom, printed before their chapters, under theirs.
        ahead={4, 6, 40, 48},
        chapters=[
            (5, "FOREWORD", "Foreword"),
            (7, "THE SECOND COMING OF CHRIST", "1. The Second Coming of Christ"),
            (33, "THE TRANSFIGURATION", "2. The Transfiguration"),
            (35, "THE SPIRIT WORLD", "3. The Spirit World"),
            (41, "THE RESURRECTIONS", "4. The Resurrections"),
            (42, "THE IMMINENCY", "5. The Imminency of the Second Coming"),
            (46, "THE HISTORY OF THE DOCTRINE", "6. The History of the Doctrine"),
            (49, "THE CHURCH VERSUS", "7. The Church Versus the Kingdom"),
            (59, "IS THE WORLD TO BE CONVERTED", "8. Is the World to Be Converted Before Christ Comes?"),
            (67, "THE SIGNS OF THE TIMES", "9. The Signs of the Times"),
            (72, "HE SHALL COME", "10. Poem: He Shall Come"),
        ],
    ),
    "spirit_world": dict(
        id="rare1921christia0000unse",
        hocr="b3f49e8e122daab8eb037654bbd054270fc2f0b766fc389711783d9ba9cddb90",
        jp2="435533124dd89f832968e9d3197191d090059bf85dac870593729fe783d3bc23",
        title="The Spirit World", abbrev="Larkin SW",
        cover=("rare1921christia0000unse", 1),
        about="Clarence Larkin's The Spirit World (1921), with its charts and pictures: what the Scriptures reveal of "
              "angels, Satan and demons, the Underworld, the intermediate state, the resurrection and the judgments.",
        # From the frontispiece ("The Ministry of Angels") to the end of the last chapter, before the publisher's list
        # of the author's other books.
        first=8, last=174,
        spreads=[],
        charts=[8, 16, 18, 20, 25, 26, 29, 31, 33, 35, 38, 40, 44, 47, 49, 54, 57, 65, 73, 80, 82, 84, 86, 88, 90, 92, 94,
                96, 98, 100, 104, 107, 112, 114, 125, 127, 131, 134, 137, 139, 141, 147, 162, 164, 167, 170],
        sideways=[16, 25, 57, 73, 82, 88, 90, 104, 112, 127, 141, 147, 162, 164, 167, 170],
        # The title page, copyright, dedication and contents; and the two charts whose verses (Ezek. 1:4-14, Rev. 4:6-8)
        # are printed as part of them.
        skip={9, 10, 11, 12, 13, 14, 18, 20},
        # The frontispiece goes with the Foreword; "The Prophetic Earth", facing page 1, opens chapter 1.
        ahead={8, 16},
        chapters=[
            (15, "PO VV OUR", "Foreword"),  # "FOREWORD", in spaced capitals, as the OCR reads it
            (17, "THE SPIRIT WORLD", "1. The Spirit World"),
            (21, "THE TRI", "2. The Tri-Unity of God"),
            (24, "SATAN", "3. Satan"),
            (39, "THE FALLEN ANGELS", "4. The Fallen Angels"),
            (53, "DEMONISM", "5. Demonism"),
            (63, "THE UNDERWORLD", "6. The Underworld"),
            (77, "THE SPIRITS IN PRISON", "7. The Spirits in Prison"),
            (81, "NATURAL LAW", "8. Natural Law in the Spirit World"),
            (89, "THE RELATION OF THE SPIRIT WOR", "9. The Relation of the Spirit World to the Natural World"),
            (99, "MAN", "10. Man's Relation to the Spirit World"),
            (106, "SOUL SLEEP", "11. Soul Sleep"),
            (113, "THE INTERMEDIATE STATE", "12. The Intermediate State"),
            (121, "RECOGNITION AND RELATIONSHIP", "13. Recognition and Relationship in the Spirit World"),
            (124, "THE FINAL STATE", "14. The Final State"),
            (130, "THE ABOLITION OF DEATH", "15. The Abolition of Death"),
            (135, "SPIRIT TRANSFORMATION", "16. Spirit Transformation"),
            (145, "THE RESURRECTION", "17. The Resurrection"),
            (152, "THE RESURRECTION BODY", "18. The Resurrection Body"),
            (160, "THE JUDGMENTS", "19. The Judgments"),
        ],
    ),
    "rightly_dividing": dict(
        id="bwb_W9-CVU-096",
        hocr="fb238864d54425dd58d5deff5bf15a9fa617027138a04e152e7122515451365b",
        jp2="00e75da99bc7c04eecb15c13e8ce0778d909198640eeb183b65b509709264528",
        title="Rightly Dividing the Word", abbrev="Larkin RDW",
        cover=("bwb_W9-CVU-096", 1),
        about="Clarence Larkin's Rightly Dividing the Word (1921), with its charts: the fundamental doctrines of the "
              "faith set out in contrasts, as Law and Grace, Faith and Works, Standing and State, from the Ages and "
              "Dispensations to Heaven and Hell and the Palace Beautiful.",
        # From the frontispiece ("The Light of Prophecy") and the Foreword to the last chapter's end, before the
        # publisher's list of the author's other books. The book has no charts across two pages.
        first=6, last=342,
        spreads=[],
        charts=[6, 14, 16, 18, 20, 22, 25, 26, 28, 38, 42, 50, 52, 56, 66, 68, 72, 76, 78, 80, 82, 96, 98, 102, 107, 110,
                116, 120, 122, 126, 132, 136, 138, 150, 158, 160, 162, 172, 186, 204, 206, 211, 216, 218, 220, 224, 225,
                226, 227, 230, 235, 244, 254, 258, 264, 274, 282, 286, 288, 308, 321, 326, 327, 329, 335],
        # Pages of text with a small picture under it: pictured, but read as text pages (their one-line headings kept).
        figures={107, 120, 186, 204, 211, 274, 286, 326},
        sideways=[14, 16, 18, 20, 22, 25, 26, 28, 38, 42, 50, 52, 56, 66, 68, 72, 76, 78, 80, 82, 102, 110, 122, 126, 136,
                  138, 150, 158, 160, 162, 172, 206, 218, 230, 235, 258, 264, 282, 308, 327],
        # The title page, its back, the dedication, the contents, and the blank back of the leopard's plate; and the four
        # trees of the Two Natures, pictured with their captions, which aren't text of the page.
        skip={7, 8, 9, 11, 12, 224, 225, 226, 227, 236},
        # The frontispiece goes under the Foreword; the others are charts printed on the page before their chapter.
        ahead={6, 18, 56, 72, 76, 218, 327},
        chapters=[
            (10, "FOREWORD", "Foreword"),
            (13, "RIGHTLY DIVIDING", "1. Rightly Dividing the Word"),
            (19, "AGES AND DISPENSATIONS", "2. Ages and Dispensations"),
            (41, "JEW AND GENTILE", "3. Jew and Gentile"),
            (57, "CHURCH AND KINGDOM", "4. Church and Kingdom"),
            (73, "THE FOUR GOSPELS", "5. The Four Gospels"),
            (77, "THE TWO ADVENTS", "6. The Two Advents"),
            (95, "THE SPIRIT WORLD", "7. The Spirit World"),
            (108, "SATAN", "8. Satan"),
            (115, "THE SATANIC TRINITY", "9. The Satanic Trinity"),
            (121, "THE “MYSTERY OF GODLINESS”", "10. The \"Mystery of Godliness\" and the \"Mystery of Iniquity\""),
            (141, "RESURRECTION OF JESUS", "11. The Resurrection of Jesus"),
            (149, "THE RESURRECTIONS", "12. The Resurrections"),
            (157, "THE JUDGMENTS", "13. The Judgments"),
            (170, "THE TWO ADAMS", "14. The Two Adams"),
            (187, "ATONEMENT AND REDEMPTION", "15. Atonement and Redemption"),
            (196, "SIN AND SALVATION", "16. Sin and Salvation"),
            (205, "LAW AND GRACE", "17. Law and Grace"),
            (212, "FAITH AND WORKS", "18. Faith and Works"),
            (219, "THE TWO NATURES", "19. The Two Natures"),
            (229, "STANDING AND STATE", "20. Standing and State"),
            (234, "REGENERATION AND BAPTISM", "21. Regeneration and Baptism"),
            (246, "ELECTION AND FREE", "22. Election and Free-will"),
            (252, "THE RECIPROCAL INDWELLING", "23. The Reciprocal Indwelling of Christ and the Believer"),
            (262, "THE THREEFOLD WORK", "24. The Threefold Work of Christ"),
            (275, "CHRIST OUR PASSOVER", "25. Christ Our Passover"),
            (287, "HEAVEN AND HELL", "26. Heaven and Hell"),
            (306, ": XXVII JUDAISM", "27. Judaism and Christianity"),  # its number read as part of the heading
            (320, "THE CIRCLES OF THE", "28. The Circles of the Christian Life"),
            (328, "PALACE BEAUTIFUL", "29. Palace Beautiful, or the Christian Life Under the Similitude of a Palace"),
        ],
    ),
}


def box(title):
    return tuple(int(x) for x in re.search(r"bbox (\d+) (\d+) (\d+) (\d+)", title).groups())


def read_hocr(path):
    """[(width, height, [paragraph: [line: (box, x_size, text)]])] for each leaf, in the OCR's reading order."""
    out = []
    for pg in ET.parse(path).getroot().iter(NS + "div"):
        if pg.get("class") != "ocr_page":
            continue
        pars = []
        for p in pg.iter(NS + "p"):
            lines = []
            for line in p:
                if not (line.get("class") or "").startswith("ocr_"):
                    continue
                size = re.search(r"x_size ([\d.]+)", line.get("title"))
                words = ["".join(w.itertext()).strip() for w in line if w.get("class") == "ocrx_word"]
                text = " ".join(w for w in words if w)
                if text:
                    lines.append((box(line.get("title")), float(size[1]) if size else 0.0, text))
            if lines:
                pars.append(lines)
        out.append((*box(pg.get("title"))[2:], pars))
    return out


def joined(lines):
    """A paragraph's lines as one text: a word broken at a line's end ("disper-" "sion") joined."""
    s = ""
    for _, _, t in lines:
        if s.endswith("-") and t[:1].islower():
            s = s[:-1] + t
        else:
            s = f"{s} {t}" if s else t
    return re.sub(r"\s+", " ", s).strip()


def junk(text):
    """Whether a paragraph is the OCR's reading of a drawing, not words: mostly symbols, or, short, with no word in it
    ("lilllliil", "sl'i^lflf'^", "■iijX")."""
    chars = re.sub(r"\s", "", text)
    if not chars:
        return True
    letters = sum(c.isalnum() for c in chars)
    odd = len(re.findall(r"[^\w.,;:!?'\"“”‘’()\[\]\-—–&*/]", chars))
    if letters / len(chars) < 0.5 or odd / len(chars) > 0.08:
        return True
    words = re.findall(r"\b(?:[A-Z]?[a-z]{2,}|[A-Z]{3,})\b", text)
    real = [w for w in words if re.search(r"[aeouyAEOUY]|[^ilI]i|i[^ilI]", w)]  # not a run of strokes ("lilllliil")
    return len(text) < 40 and not real


def english():
    """A list of English words, lower case: the system's (macOS's /usr/share/dict/words), or none."""
    try:
        return {w.strip().lower() for w in open("/usr/share/dict/words", encoding="utf-8")}
    except OSError:
        return set()


def known_words(hocr, leaves):
    """Words to trust a line of OCR by: English words, and the book's own that it uses more than once (its names,
    Nebuchadnezzar and Jehoiakim); a misreading is seldom read the same way twice."""
    from collections import Counter
    n = Counter(w.lower() for leaf in leaves for p in hocr[leaf][2] for _, _, line in p for w in re.findall(r"[A-Za-z]{3,}", line))
    return english() | {w for w, k in n.items() if k >= 2}


TWO = set("am an as at be by do go he if in is it me my no of oh on or so to up us we ye lo".split())  # real two-letter words


def known_word(w, known):
    """Whether a lower-case word is known, or is one with an ending the dictionary leaves off ("fumes", "opposeth")."""
    return w in known or any(w.endswith(s) and len(w) > len(s) + 1 and {w[:-len(s)], w[:-len(s)] + "e"} & known
                             for s in ("s", "es", "ed", "d", "ing", "eth", "th", "est", "st", "ly", "'s", "’s"))


def garbled(line, known):
    """Whether a line (or a paragraph) of OCR is mostly misread. Either of three or more words of three letters, fewer
    than a third are known ("pol aires poner, ¢ ecm sen an eer take us b"; a line of names, "Hivites, Perizzites,
    Girgashites…", has some); or of five or more words, fewer than 60% are real ones ("= oii wath. ae ar yerres? a
    ae"), not counting numbers and references, signs, initials ("B. C."), abbreviations ("Thess."), a word broken at
    the line's end, or a capitalised name."""
    words = [w.lower() for w in re.findall(r"[A-Za-z]{3,}", line)]
    if len(words) >= 3 and sum(w in known for w in words) < len(words) / 3:
        return True
    good = bad = 0
    for t in re.split(r"[\s—–]+", line):
        t = t.strip("_*()[]—–“”\"‘’'")
        if not t:
            continue
        if re.fullmatch(r"[(\[]?\d+[:\d\-–,;.)\]]*|[—–\-]+|[&+=×]|[^\w\s]+|[A-Z][a-z]{1,4}\.|[A-Z][.:]|[A-Z]\.[A-Z]\.?|\S*[a-z]-"
                        r"|[(\[“\"‘']*[A-Z][a-z]{4,}[)\]\"”’'.,;:!?]*", t):
            continue
        w = re.sub(r"^[(\[\"“‘']+|[)\]\"”’'.,;:!?]+$", "", t)
        real = w in ("a", "A", "I", "O") or (
            re.fullmatch(r"[A-Za-z]{2,}(?:['’-][A-Za-z]+)*", w) is not None and (len(w) > 2 or w.lower() in TWO)
            and all(known_word(p.lower(), known) for p in re.split(r"['’-]", w) if len(p) > 2))
        good, bad = good + real, bad + (not real)
    return good + bad >= 5 and good < (good + bad) * 0.6


def vocabulary(hocr, leaves):
    """The words the book uses: those read on its pages of text (`leaves`, not its charts), lower case."""
    from collections import Counter
    n = Counter(w.lower() for leaf in leaves for p in hocr[leaf][2] for _, _, line in p for w in re.findall(r"[A-Za-z]{2,}", line))
    return set(n)


def wordy(text, vocab):
    """The share of a paragraph's words that the book uses elsewhere (1 for one with no words to judge): words of
    three letters or more count for it, a stray letter (not "a" or "I") against it, two-letter words not at all."""
    tokens = re.findall(r"[A-Za-z]+", text)
    good = sum(len(w) >= 3 and w.lower() in vocab for w in tokens)
    bad = sum(len(w) >= 3 and w.lower() not in vocab for w in tokens) + sum(len(w) == 1 and w not in "aAI" for w in tokens)
    return good / (good + bad) if good + bad else 1.0


def running(text, heads):
    """Whether a line in capitals is a running head with its page number misread ("GENTILE DOMINION Zo", the end of
    "THE BEGINNING OF GENTILE DOMINION"): most of its letters are a run of a title's (not a heading of the text's own
    at the top of a page, "THE SERMON ON THE MOUNT")."""
    from difflib import SequenceMatcher
    if sum(map(str.isupper, text)) < 0.7 * sum(map(str.isalpha, text)):
        return False
    s = re.sub(r"[^A-Z]", "", text.upper())
    for h in heads:
        h = re.sub(r"[^A-Z]", "", h.upper())
        m = SequenceMatcher(None, s, h, autojunk=False).find_longest_match(0, len(s), 0, len(h))
        if m.size >= 8 and m.size >= 0.8 * len(s) - 4:
            return True
    return False


def paragraphs(W, H, pars, chart, start=None, vocab=None, known=None, heads=(), table=False):
    """A leaf's paragraphs as (is a heading, text): no running head or page number, nothing the OCR made of a
    drawing (junk), and on a chart's leaf only its text, not the chart's labels; there a line in large type is a
    heading only if it's the chapter's that starts on the leaf (`start`, its first words). `heads` are the book's
    title and its chapters', as its running heads print them. On a page that's a table (`table`), only its prose is
    kept, not the table's rows."""
    def opens(text):  # whether it's the heading of the chapter starting here
        bare = re.sub(r"^[IVXLlNn1|]{1,6}\.?(\s*\|)?\s+", "", text.upper()).replace(" ", "")
        return bool(start) and bare.startswith(start.replace(" ", ""))

    sizes = [size for p in pars for _, size, _ in p if size]
    body = statistics.median(sizes) if sizes else 0
    out = []
    for p in pars:
        # A running head read as the first line of the paragraph under it ("118 THE BOOK OF DANIEL writers of…").
        if len(p) > 1 and p[0][0][3] < H * 0.1 and len(p[0][2]) < 50 and re.search(r"^\d{1,3}\s|\s\d{1,3}$", p[0][2]):
            p = p[1:]
        # The page number read as the last line of the paragraph over it (a chapter's first page has it at the foot,
        # in the middle: "…who stands for" "1").
        while len(p) > 1 and p[-1][0][1] > H * 0.85 and p[-1][0][2] - p[-1][0][0] < W * 0.06 and re.fullmatch(r"\W?\d{1,3}\W?", p[-1][2]):
            p = p[:-1]
        if known:
            p = [line for line in p if not garbled(line[2], known)] or p[:0]
            if not p:
                continue
        top, bottom = p[0][0][1], p[-1][0][3]
        text = joined(p)
        if not re.search(r"[A-Za-z]{2}", text) or (known and garbled(text, known)):
            continue  # a page number, a speck, a paragraph of misreadings
        heading = body and statistics.median(size for _, size, _ in p) >= 1.4 * body and len(text) < 90
        if bottom < H * 0.07 and len(text) < 80 and not heading:
            continue  # the running head (a part's heading at the very top of a page isn't one)
        if bottom < H * 0.11 and len(text) < 70 and not heading and not opens(text) and (
                re.search(r"^\d{1,3}\s|\s\d{1,3}$", text) or running(text, heads)):
            continue  # a running head, lower on a tall page: with its page number ("266 THE BOOK OF DANIEL") or in
            # capitals with the number misread ("GENTILE DOMINION Zo")
        if top > H * 0.93 and len(text) < 12:
            continue  # the page number
        if not opens(text) and (junk(text) or (vocab and wordy(text, vocab) < (0.6 if chart else 0.3))):
            continue  # the OCR's reading of a drawing, or of a chart's lettering
        if chart and heading:
            heading = opens(text)
        widths = [b[2] - b[0] for b, _, _ in p]
        if chart and not heading and (len(p) < 2 or statistics.median(widths) < W * 0.3):
            continue  # a chart's label
        words = re.findall(r"[A-Za-z]+", text)
        if table and not heading and sum(w[0].islower() for w in words) < 0.4 * len(words):
            continue  # a row of a table drawn on the page, read across its columns ("FIRST HALF MIDDLE LAST HALF")
        out.append((bool(heading), text))
    return out


def carried(prev, text):
    """Whether a page's first paragraph, `text`, carries on the sentence that `prev` stops in the middle of: `prev` is
    a paragraph (not a heading or a signature) ending in a letter, ";" or "-" (not a comma, nor a dash, which comes
    before a quotation, nor a stray " ;"), and `text` doesn't open with a heading in capitals ("THE STONE. THE …")."""
    return (len(prev) > 80 and re.search(r"[A-Za-z;-]$", prev) is not None and not re.search(r"\s;$", prev)
            and not re.match(r"[“\"‘']?[A-Z][A-Z’'\- ]{2,40}\.(\s|$)", text))


def linked(s, link_plain_refs, passage_refs):
    """Bible references in Larkin's text as links. He writes them "Gen. 1: 26-28" (a space after the colon), "I Cor.
    2:11-14" (the book's number in Roman), and runs on to another chapter of the same book after a semicolon ("Rev.
    19:11-21; 20:1-3"): each is put in the form tools/core's link_plain_refs reads, and a further chapter is linked
    in the book before it, where it is a real verse."""
    s = re.sub(r"\b([A-Z][a-z]{1,12})\.(?=\d)", r"\1. ", s)  # "Rev.12:7-9"
    s = re.sub(r"(?<=\d)\s*:\s*(?=\d)", ":", s)  # "Gen. 1 : 26-28", "19: 11"
    s = re.sub(r"\b(III|II|I) (?=(?:Sam|Kings|Kgs|Chron|Cor|Thess|Tim|Pet|John)[a-z]*\.? \d)", lambda m: f"{len(m[1])} ", s)
    s = link_plain_refs(s)
    def more(m):
        r = passage_refs(f"{m[2]} {m[4]}")
        return f"{m[1]}{m[3]}{r[0]}" if r else m[0]
    for _ in range(6):  # a run of chapters, one at a time
        s2 = re.sub(r"(<ref>(\w+) [^<]*</ref>)([;,] ?)(\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?)(?![\d:])", more, s)
        if s2 == s:
            break
        s = s2
    return s


def paper(im):
    """The part of a scan that is the page: the dark board round it cut away (rows and columns mostly dark)."""
    import numpy as np
    ink = np.asarray(im) < 160
    h, w = ink.shape
    cols, rows = ink.mean(0), ink.mean(1)
    left = next((x for x in range(w // 4) if cols[x] < 0.5), 0)
    right = w - next((x for x in range(w // 4) if cols[w - 1 - x] < 0.5), 0)
    top = next((y for y in range(h // 4) if rows[y] < 0.5), 0)
    bottom = h - next((y for y in range(h // 4) if rows[h - 1 - y] < 0.5), 0)
    return im.crop((left, top, right, bottom))


def printed(im, pad=40):
    """A page cut to what's printed on it, with a margin of `pad`: its blank margins gone (specks aside)."""
    import numpy as np
    ink = np.asarray(im) < 160
    used_c = np.where(ink.mean(0) > 0.003)[0]
    used_r = np.where(ink.mean(1) > 0.003)[0]
    if not len(used_c) or not len(used_r):
        return im
    return im.crop((max(0, used_c[0] - pad), max(0, used_r[0] - pad),
                    min(im.width, used_c[-1] + pad), min(im.height, used_r[-1] + pad)))


def seam_offset(left, right, strip=240, most=120, near=0):
    """How far down to move the right half of a chart across two pages so its lines meet the left half's: the
    shift, within `most` pixels of `near`, at which the rows of ink at the two edges of the binding agree best."""
    import numpy as np
    a = (np.asarray(left)[:, -strip:] < 160).mean(1)
    b = (np.asarray(right)[:, :strip] < 160).mean(1)
    a, b = a - a.mean(), b - b.mean()
    def agree(dy):
        if dy >= 0:
            n = min(len(a) - dy, len(b))
            return float((a[dy:dy + n] * b[:n]).sum())
        n = min(len(a), len(b) + dy)
        return float((a[:n] * b[-dy:-dy + n]).sum())
    return max(range(near - most, near + most + 1), key=agree)


def level(im):
    """A scan turned level: by the angle, within 2°, at which its rows of ink are most sharply divided (found on a
    quarter-size copy, in steps of 0.05°)."""
    import numpy as np
    from PIL import Image
    small = im.resize((im.width // 4, im.height // 4))
    ink = Image.fromarray(((np.asarray(small) < 160) * 255).astype(np.uint8))
    def sharpness(d):
        rows = np.asarray(ink.rotate(d, resample=Image.BILINEAR, fillcolor=0), dtype=np.float32).sum(1)
        return float(((rows[1:] - rows[:-1]) ** 2).sum())
    d = max(np.arange(-2, 2.001, 0.05), key=sharpness)
    return im.rotate(float(d), resample=Image.BICUBIC, fillcolor=255) if abs(d) > 0.02 else im


def rules(im, side, strip=120):
    """Where ruled lines meet a half's inner edge: the middle row of each run of rows that are mostly ink across
    the `strip` of columns at that `side`."""
    import numpy as np
    a = np.asarray(im)
    band = a[:, -strip:] if side == "right" else a[:, :strip]
    on = (band < 128).mean(1) > 0.6
    out, start = [], None
    for y, v in enumerate(on):
        if v and start is None:
            start = y
        elif not v and start is not None:
            if y - start < 25:  # a rule, not a solid block
                out.append((start + y - 1) / 2)
            start = None
    return np.array(out)


def nudged(left_rules, right_rules, dy, most=30):
    """`dy`, or a shift within `most` pixels of it at which at least three more of the ruled lines at the binding
    meet (within 3 pixels); the border fixes the place, the rules only refine it."""
    import numpy as np
    if not len(left_rules) or not len(right_rules):
        return dy
    def meet(d):
        return int((np.abs(left_rules[:, None] - (right_rules[None, :] + d)).min(0) <= 3).sum())
    best = max(range(dy - most, dy + most + 1), key=lambda d: (meet(d), -abs(d - dy)))
    return best if meet(best) >= meet(dy) + 3 else dy


def fitted(base, other):
    """Where `other` (the same page in another copy, scanned at its own size and place) lies on `base`: the scale and
    offset (s, dx, dy) at which its ink best covers base's, searched over scales within 8% on quarter-size copies
    by cross-correlation, then refined at half size."""
    import numpy as np
    from PIL import Image
    def ink(im, f):
        return (np.asarray(im.resize((im.width // f, im.height // f))) < 128).astype(np.float32)
    def best_at(f, scales):
        a = ink(base, f)
        A = np.fft.rfft2(a - a.mean(), s=(a.shape[0] * 2, a.shape[1] * 2))
        top = (-np.inf, 1.0, 0, 0)
        for sc in scales:
            o = other.resize((max(1, round(other.width * sc)), max(1, round(other.height * sc))))
            b = ink(o, f)
            B = np.fft.rfft2(b - b.mean(), s=A.shape[:1] + (a.shape[1] * 2,))
            c = np.fft.irfft2(A * np.conj(B), s=(a.shape[0] * 2, a.shape[1] * 2))
            y, x = np.unravel_index(np.argmax(c), c.shape)
            v = c[y, x] / (np.sqrt((b * b).sum()) + 1e-6)
            if v > top[0]:
                h2, w2 = c.shape
                top = (v, sc, (x if x < w2 // 2 else x - w2) * f, (y if y < h2 // 2 else y - h2) * f)
        return top
    _, sc, _, _ = best_at(4, np.arange(0.92, 1.0801, 0.004))
    _, sc, dx, dy = best_at(2, np.arange(sc - 0.004, sc + 0.0041, 0.001))
    return sc, dx, dy


def extended(base, others, side):
    """A half of a two-page chart from whichever copy reaches furthest towards the binding (`side` is where the
    binding is): another copy's is fitted onto this one's (fitted) and used instead, in the same place, so it
    still meets the other half as this one's would."""
    from PIL import Image
    def bbox(im):  # what's printed on a page: (left, top, right, bottom)
        import numpy as np
        ink = np.asarray(im) < 128
        c, r = np.where(ink.mean(0) > 0.003)[0], np.where(ink.mean(1) > 0.003)[0]
        return (c[0], r[0], c[-1], r[-1]) if len(c) and len(r) else (0, 0, im.width, im.height)
    have = bbox(base)
    best = None
    for other in others:
        sc, dx, dy = fitted(base, other)
        o = other.resize((round(other.width * sc), round(other.height * sc)), Image.LANCZOS)
        gain = (dx + o.width - base.width) if side == "right" else -dx
        # Only a copy that has all this one's print (its top, bottom and outer edge) as well as more at the binding.
        x0, y0, x1, y1 = bbox(o)
        x0, y0, x1, y1 = x0 + dx, y0 + dy, x1 + dx, y1 + dy
        covers = y0 <= have[1] + 15 and y1 >= have[3] - 15 and (x0 <= have[0] + 15 if side == "right" else x1 >= have[2] - 15)
        if gain > 15 and covers and (best is None or gain > best[0]):
            best = (gain, o, dx, dy)
    if best is None:
        return base, 0
    gain, o, dx, dy = best
    x0 = min(0, dx)
    out = Image.new("L", (max(base.width, dx + o.width) - x0, base.height), 255)
    # The other copy's half on its own (laid over this one's, the two never quite agree near the binding, where
    # the pages curve, and the print doubles), placed where this one's would be.
    out.paste(o, (dx - x0, dy))
    return out, gain


def frame(im):
    """The rows of a chart's border, top and bottom (ruled lines across most of the page's width), each None where
    there's none; the scan's own edge (its outermost 1%) isn't taken for one."""
    import numpy as np
    ink = (np.asarray(im) < 128).mean(1)
    h = im.height
    rows = np.where(ink > 0.4)[0]
    top = rows[(rows > h * 0.01) & (rows < h * 0.25)]
    bottom = rows[(rows > h * 0.75) & (rows < h * 0.99)]
    return (int(top[0]) if len(top) else None), (int(bottom[-1]) if len(bottom) else None)


def picture(z, names, leaves, width, others=(), turn=False):
    """A page's image, or a chart across two pages joined back into one, as a WebP picture `width` wide: grey, the
    paper made white, cut to what's printed. The two pages of a chart weren't always scanned alike (a little larger,
    or turned), so each half is levelled and the right one fitted to the left by the chart's border; what the
    binding hid is lost."""
    from PIL import Image, ImageOps
    # The paper white, so the print showing through from the page's other side goes; the ink black.
    levels = [0 if v < 50 else 255 if v > 200 else round((v - 50) * 255 / 150) for v in range(256)]
    def page(zf, ns, leaf):
        im = paper(ImageOps.autocontrast(Image.open(io.BytesIO(zf.read(ns[leaf]))).convert("L"), cutoff=(1, 2)).point(levels))
        return im.rotate(-90, expand=True) if turn else im  # a chart printed sideways, turned to read
    ims = [page(z, names, leaf) for leaf in leaves]
    if len(ims) == 2:
        left, right = level(ims[0]), level(ims[1])
        # Where another copy shows more of a half at the binding, that part is added from it.
        left, _ = extended(left, [level(page(zf, ns, leaf)) for zf, ns, leaf in others], "right")
        right, _ = extended(right, [level(page(zf, ns, leaf + 1)) for zf, ns, leaf in others], "left")
        (lt, lb), (rt, rb) = frame(left), frame(right)
        if lt is not None and rt is not None:
            # By the border: scaled only where both bottoms are found too and the borders' heights nearly agree,
            # then moved a little further (within 30 pixels) where that makes clearly more ruled lines meet.
            k = 1.0
            if lb is not None and rb is not None and abs((rb - rt) / (lb - lt) - 1) < 0.03:
                k = (lb - lt) / (rb - rt)
                right = right.resize((round(right.width * k), round(right.height * k)), Image.LANCZOS)
            dy = lt - round(rt * k)
            dy = nudged(rules(left, "right"), rules(right, "left"), dy)
        else:
            dy = seam_offset(left, right)
        top = min(0, dy)
        out = Image.new("L", (left.width + right.width, max(left.height, dy + right.height) - top), 255)
        out.paste(left, (0, -top))
        out.paste(right, (left.width, dy - top))
    else:
        out = level(ims[0])  # some pages were scanned a little turned
    out = printed(out)
    out = out.resize((width, round(out.height * width / out.width)), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "WEBP", quality=70, method=6)
    return f'<p><img src="data:image/webp;base64,{base64.b64encode(buf.getvalue()).decode()}"></p>'


def _jp2(item_id):
    """The sha256 of an item's page images, from the book or copy it's listed as."""
    return next(x["jp2"] for x in [*BOOKS.values(), *(c for v in BOOKS.values() for c in v.get("copies", []))]
                if x.get("id") == item_id)


def _page(item_id, leaf):
    z, names = _zip(item_id, _jp2(item_id))
    from PIL import Image
    return Image.open(io.BytesIO(z.read(names[leaf]))).convert("RGB")


def scanned_cover(item_id, leaf):
    """The book's front cover, in colour, cut from its scan: the board round the book in the scan (rows and columns
    mostly dark at the edges) taken off."""
    import numpy as np
    im = _page(item_id, leaf)
    dark = np.asarray(im.convert("L")) < 60
    h, w = dark.shape
    cols, rows = dark.mean(0), dark.mean(1)
    x0 = next((x for x in range(w // 4) if cols[x] < 0.5), 0)
    x1 = w - next((x for x in range(w // 4) if cols[w - 1 - x] < 0.5), 0)
    y0 = next((y for y in range(h // 4) if rows[y] < 0.5), 0)
    y1 = h - next((y for y in range(h // 4) if rows[h - 1 - y] < 0.5), 0)
    return im.crop((x0, y0, x1, y1))


# The covers drawn afresh from the scans, as the books looked new (tools/covers): the scans' covers are faded, stained
# and worn. Each has the cloth's colour, the lettering in the nearest free typeface set where the scan has it (in pixels
# of a cover 1400 high), and the printed emblems cut from the scan and cleaned.
def _cover_daniel():
    w, h = 855, 1400
    return covers.gold(covers.cloth(w, h, (132, 24, 36)), covers.words(w, h, [("THE BOOK OF", "goudy", 56, 257, 696, 428),
                                                            ("DANIEL", "goudy", 112, 416, 700, 428),
                                                                            ("CLARENCE LARKIN", "goudy", 30, 1180, 420, 428)]))


def _cover_revelation():
    w, h = 873, 1400
    scan = scanned_cover("bookofrevelation00lark", 1)
    k = scan.height / 1400
    seal = covers.printed(scan, tuple(int(v * k) for v in (270, 420, 610, 745)), (270, 420, 610, 745), w, h)
    words = covers.words(w, h, [("The", "fraktur", None, 290, 135, w / 2), ("Book of Revelation", "fraktur", None, 382, 640, w / 2),
                          ("Illustrated", "fraktur", None, 787, 160, w / 2), ("Clarence Larkin", "fraktur", None, 1162, 370, w / 2)])
    import numpy as np
    return covers.ink(covers.cloth(w, h, (62, 122, 112)), np.maximum(words, seal), (16, 22, 22))


def _cover_dispensational_truth():
    import numpy as np
    from PIL import Image, ImageDraw
    w, h = 1366, 1400
    cx, o, i = w // 2, 100, 132  # the outer rule's inset, and the two panels'
    rules = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(rules)
    d.rectangle((o, o + 10, w - o, h - o - 10), outline=255, width=8)
    d.rectangle((i, i + 10, w - i, 540), outline=255, width=6)
    d.rectangle((i, 566, w - i, h - i - 10), outline=255, width=6)
    box = (cx - 129, 508, cx + 130, 769)
    d.rectangle(box, fill=0)
    # The ornament from the copy whose print of it is sharpest.
    ornament = covers.printed(_page("dispensationaltr0000lark", 1), (1335, 1306, 2034, 1995), box, w, h)
    words = covers.words(w, h, [("DISPENSATIONAL", "goudy", 92, 324, 1052, cx), ("TRUTH", "goudy", 86, 459, 478, cx),
                          ("CLARENCE LARKIN", "goudy", 32, 1135, 500, cx)])
    return covers.ink(covers.cloth(w, h, (110, 44, 52)), np.maximum.reduce([np.asarray(rules, float) / 255, ornament, words]), (26, 12, 14))


def _cover_second_coming():
    """A paper cover printed in blue: the title in black letter between two engravings, cut from the scan and cleaned."""
    import numpy as np
    from PIL import Image, ImageDraw
    w, h = 884, 1400
    scan = scanned_cover("secondcomingofch0000clar", 1)
    k = scan.height / 1400
    paper = float(np.median(np.asarray(scan.convert("L").crop(tuple(int(v * k) for v in (130, 940, 300, 1020))))))
    cut = lambda box: covers.printed(scan, tuple(int(v * k) for v in box), box, w, h, paper - 30)
    rules = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(rules)
    d.rectangle((86, 106, w - 86, h - 86), outline=255, width=6)
    d.rectangle((100, 120, w - 100, h - 100), outline=255, width=2)
    d.line((100, 372, w - 100, 372), fill=255, width=4)
    d.line((100, 1046, w - 100, 1046), fill=255, width=4)
    words = covers.words(w, h, [("The", "fraktur", None, 492, 150, w / 2), ("Second Coming", "fraktur", None, 592, 560, w / 2),
                                ("of Christ", "fraktur", None, 682, 330, w / 2), ("By", "fraktur", None, 738, 40, w / 2),
                                ("Clarence Larkin", "fraktur", None, 800, 400, w / 2),
                                ("Author and Publisher of", "fraktur", None, 836, 220, w / 2),
                                ("“Dispensational Truth”", "fraktur", None, 880, 270, w / 2)])
    art = np.maximum(cut((104, 124, w - 104, 368)), cut((104, 1050, w - 104, h - 104)))
    return covers.ink(covers.material(w, h, "smooth", (156, 182, 206)),
                      np.maximum.reduce([np.asarray(rules, float) / 255, words, art]), (28, 34, 96))


def _cover_spirit_world():
    """Brown cloth with a double rule round it, the title and author printed in black."""
    import numpy as np
    from PIL import Image, ImageDraw
    w, h = 894, 1400
    rules = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(rules)
    d.rectangle((80, 130, w - 80, h - 140), outline=255, width=7)
    d.rectangle((104, 154, w - 104, h - 164), outline=255, width=4)
    words = covers.words(w, h, [("The", "fraktur", None, 268, 66, w / 2), ("Spirit World", "goudy", None, 384, 536, w / 2),
                                ("CLARENCE LARKIN", "goudy", 22, 1134, 360, w / 2)])
    return covers.ink(covers.cloth(w, h, (146, 74, 46)), np.maximum(np.asarray(rules, float) / 255, words), (28, 18, 16))


def _cover_rightly_dividing():
    """Red cloth with a double rule round it, the title and author printed in black, and the ornament under the title
    cut from the scan and cleaned."""
    import numpy as np
    from PIL import Image, ImageDraw
    w, h = 870, 1400
    cx = w // 2
    scan = scanned_cover("bwb_W9-CVU-096", 1)
    k = scan.height / 1400
    src = (184, 378, 626, 572)  # the ornament, in the scan (as a cover 1400 high), round its centre at x 405
    ornament = covers.printed(scan, tuple(int(v * k) for v in src), (cx - 221, 378, cx + 221, 572), w, h, channel="R")
    rules = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(rules)
    d.rectangle((cx - 322, 130, cx + 322, 1236), outline=255, width=6)
    d.rectangle((cx - 306, 146, cx + 306, 1220), outline=255, width=3)
    words = covers.words(w, h, [("Rightly Dividing", "goudy", None, 240, 556, cx), ("The Word", "goudy", None, 344, 360, cx),
                                ("CLARENCE LARKIN", "goudy", 20, 636, 342, cx)])
    return covers.ink(covers.cloth(w, h, (124, 34, 34)), np.maximum.reduce([np.asarray(rules, float) / 255, words, ornament]), (26, 12, 12))


COVERS = {"daniel": _cover_daniel, "second_coming": _cover_second_coming, "spirit_world": _cover_spirit_world, "rightly_dividing": _cover_rightly_dividing, "revelation": _cover_revelation, "dispensational_truth": _cover_dispensational_truth}


def cover(name, b):
    """The book's cover, drawn afresh (COVERS) or else cut from its scan (`cover`: an item and leaf)."""
    if name in COVERS:
        return covers.html(COVERS[name]())
    return covers.html(scanned_cover(*b["cover"])) if b.get("cover") else ("", "")


_zips = {}


def _zip(item_id, sha):
    """An item's page images, opened once per process."""
    if item_id not in _zips:
        zf = zipfile.ZipFile(fetch(ARCHIVE.format(id=item_id, suffix="_jp2.zip"), CACHE / f"{item_id}_jp2.zip", sha256=sha))
        _zips[item_id] = (zf, sorted(n for n in zf.namelist() if n.endswith(".jp2")))
    return _zips[item_id]


# What a picture is made by: when any of it changes, every picture is drawn again.
DRAWING = (paper, printed, seam_offset, level, rules, nudged, fitted, extended, frame, picture)


def _key(name, leaf):
    """What one picture depends on: the code that draws pictures, the scans (by their hashes) and the leaves, width,
    turning and other copies it's drawn from."""
    import hashlib, inspect
    b = BOOKS[name]
    spread = leaf in b["spreads"]
    parts = ["".join(inspect.getsource(f) for f in DRAWING), b["jp2"], str(leaf), str(spread),
             str(leaf in b.get("sideways", ()))]
    if spread:
        parts += [f"{c['jp2']}:{c['leaves'][leaf]}" for c in b.get("copies", []) if leaf in c["leaves"]]
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:16]


def _render(job):
    """One picture of a book, in a worker process: drawn (picture), or the one drawn before with the same _key,
    kept in ~/Library/Caches/Two-edged Sword/larkin/pictures."""
    name, leaf = job
    b = BOOKS[name]
    kept = CACHE / "pictures" / f"{name}-{leaf}-{_key(name, leaf)}.html"
    if kept.is_file():
        return leaf, kept.read_text(encoding="utf-8")
    z, names = _zip(b["id"], b["jp2"])
    if leaf in b["spreads"]:
        others = [(*_zip(c["id"], c["jp2"]), c["leaves"][leaf]) for c in b.get("copies", []) if leaf in c["leaves"]]
        html = picture(z, names, [leaf, leaf + 1], 2800, others)
    else:
        html = picture(z, names, [leaf], 1600, turn=leaf in b.get("sideways", ()))
    kept.parent.mkdir(parents=True, exist_ok=True)
    for old in kept.parent.glob(f"{name}-{leaf}-*.html"):  # an older drawing of it
        old.unlink()
    tmp = kept.with_suffix(".part")
    tmp.write_text(html, encoding="utf-8")
    tmp.replace(kept)
    return leaf, html


def build(name, into=None):
    from core.build import link_plain_refs, passage_refs
    b = BOOKS[name]
    hocr = read_hocr(fetch(ARCHIVE.format(id=b["id"], suffix="_hocr.html"), CACHE / f"{b['id']}_hocr.html", sha256=b["hocr"]))
    # The pictures first, on every core: fitting the other copies' halves of the two-page charts is slow.
    import os
    from concurrent.futures import ProcessPoolExecutor
    _zip(b["id"], b["jp2"])
    for c in b.get("copies", []):
        _zip(c["id"], c["jp2"])  # downloaded here, once, not by each worker
    jobs = [(name, leaf) for leaf in range(b["first"], b["last"] + 1) if leaf in b["spreads"] or leaf in b["charts"]]
    todo = [j for j in jobs if not (CACHE / "pictures" / f"{name}-{j[1]}-{_key(*j)}.html").is_file()]
    print(f"  {len(jobs) - len(todo)} pictures as drawn before, {len(todo)} to draw")
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 2) - 1)) as pool:
        drawn = dict(pool.map(_render, jobs))
    spreads = set(b["spreads"]) | {n + 1 for n in b["spreads"]}
    starts = {leaf: (words, title) for leaf, words, title in b["chapters"]}
    heads = [b["title"], *(re.sub(r"^[\d–, ]+(Part \d+)?[.:]\s*", "", title) for _, _, title in b["chapters"])]
    text_leaves = [n for n in range(b["first"], b["last"] + 1) if n not in b["charts"] and n not in spreads]
    vocab = vocabulary(hocr, text_leaves)
    known = known_words(hocr, text_leaves)
    rows, cur, title, pictures, ahead = [], [], None, 0, []

    fixes = json.loads(FIXES.joinpath(f"{name}.json").read_text(encoding="utf-8")) if FIXES.joinpath(f"{name}.json").is_file() else {}
    unused = []

    def finish(title, paras):
        """A chapter's paragraphs as they'll be shown: proofread, then with their Bible references linked. A paragraph
        of misreadings made only once its pieces were joined ("= oii wath." + "yerres? a ae") is dropped, and so are
        those the proofreading found (FIXES), whose misread words are put right."""
        f = fixes.get(title, {})
        drop, todo = list(f.get("drop", [])), [tuple(x) for x in f.get("fix", [])]
        out = []
        for h in paras:
            if h.startswith("<p><img"):
                out.append(h)
                continue
            bold = h.startswith("<p><b>")
            text = unescape(h[6:-8] if bold else h[3:-4])
            if any(text.startswith(d) for d in drop):
                drop = [d for d in drop if not text.startswith(d)]
                continue
            for wrong, right in [x for x in todo if x[0] in text]:
                text = text.replace(wrong, right, 1)
                todo.remove((wrong, right))
            text = re.sub(r"\s{2,}", " ", text).strip()
            if not text or (not bold and garbled(text, known)):
                continue
            out.append(f"<p><b>{escape(text)}</b></p>" if bold else f"<p>{linked(escape(text), link_plain_refs, passage_refs)}</p>")
        unused.extend(f"{title}: {x}" for x in drop + [w for w, _ in todo])
        return "".join(out)
    for leaf in range(b["first"], b["last"] + 1):
        # A picture on the page a chapter starts on goes after that chapter's heading (held till it's read).
        held = []
        dest = ahead if leaf in b.get("ahead", ()) else held if leaf in starts else cur
        if leaf in drawn:
            dest.append(drawn[leaf])
            pictures += 1
        if leaf in b.get("skip", ()):
            cur += held
            continue  # a page of its own between parts ("Second Division, Prophetical, Chapters 7 to 12")
        texted = leaf in b.get("spread_text", ()) or leaf - 1 in b.get("spread_text", ())
        if leaf in spreads and not texted:
            cur += held
            continue  # a two-page chart's text is in the picture
        W, H, pars = hocr[leaf]
        on = starts.get(leaf)
        # A page of text with a small picture on it (`figures`) is pictured, but its text is read as a text page's.
        chart = (leaf in b["charts"] and leaf not in b.get("figures", ())) or leaf in spreads
        for k, (heading, text) in enumerate(paragraphs(W, H, pars, chart, on and on[0], vocab, known, heads,
                                                         leaf in b.get("tables", ()))):
            start = starts.get(leaf)
            # "IX THE JEWS", "Il PRE - …", "n. The Things Which Are": the chapter's number as the OCR read it set aside.
            bare = re.sub(r"^[IVXLlNn1|]{1,6}\.?(\s*\|)?\s+", "", text.upper()).replace(" ", "")
            # A chapter's heading, or a page's first paragraphs where its heading is in the text's own type (a Foreword).
            if (heading or k < 3) and start and bare.startswith(start[0].replace(" ", "")):
                if title:
                    rows.append((title, finish(title, cur)))
                title, cur = start[1], [f"<p><b>{escape(start[1])}</b></p>", *ahead, *held]
                ahead, held = [], []
                starts.pop(leaf)
                continue
            if heading and len(text) < 4:
                continue  # a word of a heading read on its own ("THE")
            if heading and title and re.sub(r"\W", "", title.split(" ", 1)[-1].split(": ")[-1].lower()) == re.sub(r"\W", "", text.lower()):
                continue  # the chapter's title under its "CHAPTER ONE", which its heading already says
            if heading:
                cur.append(f"<p><b>{escape(text)}</b></p>")
            elif (last := next((i for i in range(len(cur) - 1, -1, -1) if not cur[i].startswith(("<p><img", "<p>*"))), None)) is not None \
                    and cur[last].startswith("<p>") and not cur[last].startswith("<p><b>") and (text[:1].islower() or (
                        k == 0 and not chart and carried(unescape(cur[last][3:-4]), text))):
                # A sentence carried over a column or a page ("ce," "and so…"), or a page's first paragraph where the one
                # before stops without a stop or a comma ("…who stands for" "Daniel's People"; not after a dash, which
                # comes before a quotation, nor on a chart's page, where it's a label): joined to its paragraph, over a
                # page's picture or footnote put between them (which then follows the paragraph).
                prev = cur[last][3:-4]
                joint = prev[:-1] if prev.endswith("-") else prev + " "
                cur[last] = f"<p>{joint}{escape(text)}</p>"
            else:
                cur.append(f"<p>{escape(text)}</p>")
        cur += held  # a chapter's page whose heading wasn't found keeps its picture where it is
    rows.append((title, finish(title, cur)))
    front, thumb = cover(name, b)
    if front:
        rows[0] = (rows[0][0], front + rows[0][1])
    if unused:
        print(f"  {len(unused)} of the proofreading's fixes no longer match:\n    " + "\n    ".join(unused))
    missed = [t for _, t in starts.values()]
    if missed:
        sys.exit(f"{name}: chapter headings not found: {', '.join(missed)}")
    refs = sum(h.count("<ref") for _, h in rows)
    info = (f"{thumb}<p>{escape(b['about'])}</p><p>From the Internet Archive's scan (archive.org/details/{b['id']}), public "
            f"domain. The text is the scan's OCR, so some words are misread; each page with a chart is kept as a "
            f"picture. {len(rows)} chapters, {pictures} pictures, {refs} Bible references linked. "
            "Built by Two-edged Sword's tools/larkin.</p>"
            "<p>About the charts: they are photographs of the printed book, so the paper's texture and some print "
            "showing through from the other side remain. "
            + ("Charts printed sideways on the page are turned to read. " if b.get("sideways") else "")
            + "The largest charts were printed across two facing pages; each is joined back into one picture, but a "
            "narrow strip down the middle was hidden in the binding when the book was scanned, so letters and lines "
            "there are cut or missing. Where another scanned copy of the book shows more of that strip, its half of "
            "the chart is used instead. Click a chart to enlarge it.</p>")
    with module(f"larkin_{name}.refi", b["title"], b["abbrev"], info, into=into) as db:
        db.executemany("INSERT INTO Reference VALUES (?,?)", rows)
    print(f"larkin_{name}.refi: {len(rows)} chapters, {pictures} pictures, {refs} references linked")


def main(into=None, names=None):
    """Writes the books named (all, by default) to the app's modules folder, or to `into`."""
    names = names or sys.argv[1:] or list(BOOKS)
    for n in names:
        if n not in BOOKS:
            sys.exit(f"unknown book {n}; one of {', '.join(BOOKS)}")
        build(n, into)


if __name__ == "__main__":
    main()
