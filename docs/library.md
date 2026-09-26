# Library

The app has no library of its own: it reads the modules e-Sword X keeps, where e-Sword keeps
them, and never changes them. (The build scripts below add new ones there.)

```
~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/
```

## The Library screen

Every module and the space it takes, which Bibles appear in the Bible menu (**In picker**), the
default Bible, and the order of commentaries and dictionaries. The search box finds modules by
title, abbreviation or file name; reference books and devotionals open from here. **Rescan**
picks up modules added since the app started.

## Formats

It reads e-Sword X's Mac formats, which are SQLite files:

| Extension | What |
|---|---|
| `.bbli` | Bibles (with Strong's numbers when the module has them) |
| `.cmti` | Commentaries, including the Treasury of Scripture Knowledge |
| `.dcti` | Dictionaries and topical indexes |
| `.lexi` | Lexicons (Strong's, Thayer, BDB and others) |
| `.refi` | Reference books |
| `.devi` | Devotionals |

It does not read the older Windows e-Sword formats (`.bblx`, `.cmtx`, `.dctx`, `.lexx`, `.refx`,
`.topx`), EPUB, plain text or SWORD modules. Bible Support offers many modules in both formats;
take the Mac one.

## Adding modules

- **From e-Sword**: e-Sword X's Download window installs modules straight into the folder
  above.
- **From elsewhere**: copy the file into that folder itself (not a subfolder).

Then press **Rescan** on the Library screen (or reopen the app, which rescans on its own). The
search index and the dictionaries Ask searches update in the background.

## Building modules

Some texts aren't e-Sword downloads, so scripts in `tools/` build them from free sources into
the folder above. Each caches its downloads in `~/Library/Caches/Two-edged Sword/` and puts
everything in the KJV's verse numbering, so it reads and compares beside the KJV. Rescan after.

| Script | Builds | From |
|---|---|---|
| `python3 tools/sefaria/build.py` | Targum (Aramaic and English), Targum Pseudo-Jonathan, and the Babylonian Talmud (a book per tractate, English with the Aramaic, linked to the verses it cites) | Sefaria |
| `python3 tools/vulgate/build.py` | The Clementine Vulgate (1592), with the deuterocanon | The Clementine Vulgate Project |
| `python3 tools/crosswire/build.py` | The Syriac Peshitta NT, Murdock's and Etheridge's English of it, Tyndale (1525/1530), the Geneva Bible (1599), and the Douay-Rheims (Challoner) | CrossWire |
| `python3 tools/wlc/build.py` | WLC+: the Westminster Leningrad Codex word by word, each word with its English, Strong's number and grammar, in the KJV's numbering | Open Scriptures Hebrew Bible (CC BY 4.0), with English from STEPBible's TBESH (CC BY 4.0) |
| `python3 tools/latin/build.py` | Latin+ and Vulg-C+: the two Latin Vulgates word by word, each word with its English meaning, dictionary form and grammar (the first run installs Stanza, about 1 GB, in the cache) | Stanza's PROIEL Latin model and Whitaker's WORDS |
| `python3 tools/targum/build.py` | Targum+ and Ps-Jon+: the Aramaic Targums word by word, each word with English and, where it renders a Hebrew word, that word's Strong's number (run tools/sefaria and tools/wlc first) | WLC+, a commonest-words table and Jastrow's dictionary (Sefaria's digitisation, CC BY-NC) |
| `python3 tools/syriac/build.py` | Peshitta+: the Peshitta NT word by word, each word with its English meaning, dictionary form, root and grammar (run tools/crosswire first) | ETCBC's syrnt and SEDRA |

All are public domain except some Sefaria translations, which are CC-BY-NC, and SEDRA's glosses,
which are for non-commercial use: fine for personal study.

## Free modules worth having

Public domain unless noted. Those marked e-Sword come through e-Sword X's Download window;
Bible Support ([biblesupport.com](https://www.biblesupport.com), free sign-in) has the rest.

**Bibles**

- Young's Literal Translation (e-Sword): very literal, a good second column beside the KJV.
- Brenton's English Septuagint (e-Sword): the Greek Old Testament the apostles quoted.
- Greek NT INT+ (e-Sword): an interlinear with each word's meaning, grammar, and which printed
  editions have it. The best single tool for comparing the Greek behind the KJV and modern
  versions.
- Greek NT TR+, BYZ+ and WH+ (e-Sword): the Textus Receptus, the Byzantine Majority Text and
  Westcott-Hort, with Strong's numbers and grammar.
- Greek OT+ (e-Sword): Rahlfs' Septuagint with Strong's numbers. Hebrew OT+ (e-Sword): the
  Hebrew Old Testament with Strong's numbers; Westminster Leningrad Codex (Bible Support) has
  the vowel points.
- Darby, Webster, Weymouth, the Revised Version, the World English Bible and the Berean Standard
  Bible (e-Sword).

**Commentaries**

- Keil & Delitzsch on the Old Testament (e-Sword).
- Spurgeon's Treasury of David, on the Psalms (e-Sword).
- Robertson's Word Pictures and Vincent's Word Studies (e-Sword): Greek word studies, which suit
  Word Study and Ask.
- The Cambridge Bible for Schools, Bullinger's Companion Bible and MacLaren's Expositions
  (e-Sword); Lange's and Meyer's commentaries (Bible Support).

**Dictionaries**

- Torrey's New Topical Textbook and Hitchcock's Bible Names (e-Sword).
- Webster's 1828 Dictionary (e-Sword): what KJV-era English words meant.

**Books and devotionals**

- Edersheim's Life and Times of Jesus the Messiah (e-Sword).
- The Ante-Nicene Fathers, Calvin's Institutes and Schaff's History of the Christian Church
  (e-Sword).
- Spurgeon's Faith's Checkbook and his sermons (Bible Support).

Leave out copyrighted modules shared without the publisher's permission. Some modern texts (the
Lexham English Bible, Mounce's Greek dictionary) are free but copyrighted, so they are fine for
personal use. Ask treats any module whose description carries a copyright notice as licensed;
see [Ask](ask.md#what-is-sent).

Classics that only exist as EPUB or text (Augustine's Confessions, Pilgrim's Progress, the later
church fathers) would need converting into a `.refi` module first. A `.refi` is a SQLite file with
two tables: `Details (Title, Abbreviation, Information, Version)`, one row, with Version 4; and
`Reference (Chapter, Content)`, one row per chapter in reading order, with an index on `Chapter`.
Chapter names must be unique. Content is HTML: paragraphs, bold and italics, tables, `<ref>Rom
8:28</ref>` for a Bible reference, and images inline as `data:` URLs.
