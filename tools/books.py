# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""The 66 books in e-Sword's order (book n is BOOKS[n - 1]), under the names the sources use.

    from books import BOOKS, OSIS, USFM, NAMES
    OSIS.index("Matt") + 1   # 40

BOOKS holds each book's (USFM code, OSIS name, e-Sword's abbreviation as in src/bible.ts, SWORD's
name); USFM, OSIS, ABBR and SWORD are those columns, NAMES the books' English names ("1 Corinthians").
"""

BOOKS = [tuple(b.split(":")) for b in (
    "GEN:Gen:Gen:Genesis EXO:Exod:Exo:Exodus LEV:Lev:Lev:Leviticus NUM:Num:Num:Numbers DEU:Deut:Deu:Deuteronomy "
    "JOS:Josh:Jos:Joshua JDG:Judg:Jdg:Judges RUT:Ruth:Rut:Ruth 1SA:1Sam:1Sa:I_Samuel 2SA:2Sam:2Sa:II_Samuel "
    "1KI:1Kgs:1Ki:I_Kings 2KI:2Kgs:2Ki:II_Kings 1CH:1Chr:1Ch:I_Chronicles 2CH:2Chr:2Ch:II_Chronicles EZR:Ezra:Ezr:Ezra "
    "NEH:Neh:Neh:Nehemiah EST:Esth:Est:Esther JOB:Job:Job:Job PSA:Ps:Psa:Psalms PRO:Prov:Pro:Proverbs "
    "ECC:Eccl:Ecc:Ecclesiastes SNG:Song:Son:Song_of_Solomon ISA:Isa:Isa:Isaiah JER:Jer:Jer:Jeremiah LAM:Lam:Lam:Lamentations "
    "EZK:Ezek:Eze:Ezekiel DAN:Dan:Dan:Daniel HOS:Hos:Hos:Hosea JOL:Joel:Joe:Joel AMO:Amos:Amo:Amos OBA:Obad:Oba:Obadiah "
    "JON:Jonah:Jon:Jonah MIC:Mic:Mic:Micah NAM:Nah:Nah:Nahum HAB:Hab:Hab:Habakkuk ZEP:Zeph:Zep:Zephaniah HAG:Hag:Hag:Haggai "
    "ZEC:Zech:Zec:Zechariah MAL:Mal:Mal:Malachi MAT:Matt:Mat:Matthew MRK:Mark:Mar:Mark LUK:Luke:Luk:Luke JHN:John:Joh:John "
    "ACT:Acts:Act:Acts ROM:Rom:Rom:Romans 1CO:1Cor:1Co:I_Corinthians 2CO:2Cor:2Co:II_Corinthians GAL:Gal:Gal:Galatians "
    "EPH:Eph:Eph:Ephesians PHP:Phil:Php:Philippians COL:Col:Col:Colossians 1TH:1Thess:1Th:I_Thessalonians "
    "2TH:2Thess:2Th:II_Thessalonians 1TI:1Tim:1Ti:I_Timothy 2TI:2Tim:2Ti:II_Timothy TIT:Titus:Tit:Titus PHM:Phlm:Phm:Philemon "
    "HEB:Heb:Heb:Hebrews JAS:Jas:Jas:James 1PE:1Pet:1Pe:I_Peter 2PE:2Pet:2Pe:II_Peter 1JN:1John:1Jn:I_John "
    "2JN:2John:2Jn:II_John 3JN:3John:3Jn:III_John JUD:Jude:Jud:Jude REV:Rev:Rev:Revelation_of_John").split()]
USFM, OSIS, ABBR, SWORD = ([b[i] for b in BOOKS] for i in range(4))
NAMES = ["Revelation" if n == "Revelation_of_John" else
         n.replace("_", " ").replace("III ", "3 ").replace("II ", "2 ").replace("I ", "1 ") for n in SWORD]
