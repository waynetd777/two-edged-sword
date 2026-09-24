# Library

The app has no library of its own: it reads the modules e-Sword X keeps, where e-Sword keeps
them, and never changes them.

```
~/Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support/
```

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
take the Mac one. (The Windows Westminster Leningrad Codex `.bblx`, for example, has the same
Hebrew text as the `.bbli`, stored less compactly and padded with empty New Testament rows.)

## Adding modules

- **From e-Sword**: e-Sword X's Download window installs modules straight into the folder
  above.
- **From elsewhere**: copy the file into that folder itself (not a subfolder).

Then **Library › Rescan**, and the new modules appear. The search index and the dictionaries Ask
searches update on their own in the background.

## Free modules worth having

Public domain unless noted. Those marked e-Sword come through e-Sword X's Download window;
Bible Support ([biblesupport.com](https://www.biblesupport.com), free sign-in) has the rest.

**Bibles**

- Young's Literal Translation (e-Sword): very literal, a good second column beside the KJV.
- Brenton's English Septuagint (e-Sword): the Greek Old Testament the apostles quoted.
- Geneva Bible 1587 (Bible Support, Mac module): the Reformers' Bible.
- Westminster Leningrad Codex (Bible Support): the Hebrew Old Testament.
- Westcott-Hort Greek New Testament with Strong's and parsing (Bible Support, `iwh+p.bbli`).
- Darby, Webster, Weymouth, the Revised Version, Douay-Rheims, the World English Bible and the
  Berean Standard Bible (e-Sword); Tyndale, Coverdale and other early English Bibles (Bible
  Support; check each has a Mac file).

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

Leave out copyrighted modules offered without the publisher's permission. Some modern texts are
free but still copyrighted (the Lexham English Bible, Mounce's Greek dictionary); they are fine
for personal use, and Ask treats any module whose description carries a copyright notice as
licensed.

Classics that only exist as EPUB or text (Augustine's Confessions, Pilgrim's Progress, the later
church fathers) would need converting into a `.refi` module first.
