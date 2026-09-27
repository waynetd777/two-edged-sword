# Library

The app reads the modules you have in e-Sword X, where e-Sword keeps them, and never changes
them:

```
~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/
```

## The Library screen

- Every module, with its size and features. The ⓘ beside one shows its description.
- **In picker** chooses which Bibles appear in the Bible menu.
- Set the default Bible, and the order of commentaries and dictionaries.
- **Rescan** picks up modules added since the app started.

## Formats

The app reads e-Sword X's Mac formats:

| Extension | What |
|---|---|
| `.bbli` | Bibles |
| `.cmti` | Commentaries |
| `.dcti` | Dictionaries |
| `.lexi` | Lexicons |
| `.refi` | Reference books |
| `.devi` | Devotionals |

It doesn't read the Windows formats (`.bblx`, `.cmtx` and so on), EPUB or SWORD modules. Where a
module comes in both, take the Mac one.

## Adding modules

- **From e-Sword**: e-Sword X's Download window installs them in the folder above.
- **From elsewhere**: copy the file into that folder (not a subfolder).

Then press **Rescan**.

## Building modules

Some texts aren't e-Sword downloads. Scripts in `tools/` build them from free sources, numbered
like the KJV so they compare beside it. Run the one you want, then press **Rescan**.

| Script | Builds | Run first | From |
|---|---|---|---|
| `tools/crosswire/build.py` | Syriac Peshitta NT, Murdock, Etheridge, Tyndale, Geneva 1599, Douay-Rheims | | CrossWire |
| `tools/sefaria/build.py` | Targum, Targum Pseudo-Jonathan, the Babylonian Talmud | | Sefaria |
| `tools/vulgate/build.py` | Clementine Vulgate (1592) | | Clementine Vulgate Project |
| `tools/wlc/build.py` | WLC+: the Hebrew Old Testament word by word | | Open Scriptures, STEPBible |
| `tools/ginsburg/build.py` | Ginsburg's Hebrew Bible (1894) | wlc | ahembd/Ginsburg_Hebrew_Bible |
| `tools/ginsburg/plus.py` | Ginsburg+, word by word | ginsburg | WLC+ |
| `tools/beza/build.py` | Beza's Greek New Testament (1598) | | textus-receptus.com |
| `tools/beza/plus.py` | Beza 1598+, word by word | beza | TR+, INT+, STEPBible |
| `tools/lxx/build.py` | Brenton's Greek Septuagint, with the Apocrypha | | eBible.org |
| `tools/lxx/plus.py` | LXX-Brenton+, word by word | lxx | Greek OT+, STEPBible |
| `tools/latin/build.py` | Latin+ and Vulg-C+, word by word (downloads about 1 GB) | | Stanza, Whitaker's WORDS |
| `tools/targum/build.py` | Targum+ and Ps-Jon+, word by word | sefaria, wlc | WLC+, Jastrow |
| `tools/syriac/build.py` | Peshitta+, word by word | crosswire | ETCBC, SEDRA |
| `tools/rheims/build.py` | The Rheims New Testament (1582) | crosswire | Bible Support file 11077, in ~/Downloads |

Run each with `python3`. Downloads are cached in `~/Library/Caches/Two-edged Sword/`.

All are public domain or openly licensed, except some Sefaria translations and SEDRA's glosses,
which are for non-commercial use. That's fine for personal study.

## Free modules worth having

These are public domain. Those marked e-Sword come from e-Sword X's Download window; the rest are
on [Bible Support](https://www.biblesupport.com) (free sign-in).

**Bibles**

- Young's Literal Translation (e-Sword): very literal, a good second column beside the KJV.
- Brenton's English Septuagint (e-Sword): the Greek Old Testament the apostles quoted.
- Greek NT INT+ (e-Sword): the best single tool for the Greek behind the KJV and modern versions.
- Greek NT TR+, BYZ+ and WH+ (e-Sword): three Greek texts with Strong's numbers and grammar.
- Greek OT+ and Hebrew OT+ (e-Sword): the Old Testament in Greek and Hebrew, with Strong's
  numbers.
- Darby, Webster, Weymouth, the Revised Version, the World English Bible and the Berean Standard
  Bible (e-Sword).

**Commentaries**

- Keil & Delitzsch on the Old Testament, and Spurgeon's Treasury of David on the Psalms
  (e-Sword).
- Robertson's Word Pictures and Vincent's Word Studies (e-Sword): Greek word studies.
- The Cambridge Bible, Bullinger's Companion Bible and MacLaren's Expositions (e-Sword); Lange and
  Meyer (Bible Support).

**Dictionaries**

- Torrey's Topical Textbook and Hitchcock's Bible Names (e-Sword).
- Webster's 1828 Dictionary (e-Sword): what KJV-era English words meant.

**Books and devotionals**

- Edersheim's Life and Times of Jesus the Messiah, the Ante-Nicene Fathers, Calvin's Institutes
  and Schaff's History of the Christian Church (e-Sword).
- Spurgeon's Faith's Checkbook and his sermons (Bible Support).

Avoid copyrighted modules shared without the publisher's permission. Books that exist only as
EPUB or text need converting to a `.refi` first ([Development](development.md#reference-book-format)).
