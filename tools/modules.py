"""Where tools/ puts the modules it builds, where it finds the ones it reads, and a writer for
each of e-Sword X's formats (which the app reads as its own).

    import sys; from pathlib import Path; sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from modules import LIBRARY, find, module

LIBRARY is the app's own modules folder (TES_LIBRARY, or the older ESWORD_LIBRARY, overrides it).
find(name) looks there, then in e-Sword X's library, then among the modules built into the app,
so a script can read an input from wherever the app would. Output always goes to LIBRARY.
"""
import os, sqlite3
from contextlib import contextmanager
from pathlib import Path

HOME = Path.home()
LIBRARY = Path(os.environ.get("TES_LIBRARY") or os.environ.get("ESWORD_LIBRARY") or HOME / "Library/Application Support/Two-edged Sword/Modules")
ESWORD = HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support"
BUNDLED = Path(__file__).resolve().parent.parent / "src-tauri/modules"
LIBRARY.mkdir(parents=True, exist_ok=True)


def find(name: str) -> Path:
    """The first of LIBRARY, e-Sword's library and the bundled modules to have `name`; else LIBRARY / name."""
    for d in (LIBRARY, ESWORD, BUNDLED):
        if (d / name).is_file():
            return d / name
    return LIBRARY / name


SCHEMA = {
    "bbli": """CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""",
    "cmti": """CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(50), Information TEXT, Version INT);
        CREATE TABLE BookCommentary (Book INT, Comments TEXT);
        CREATE INDEX BookIndex ON BookCommentary (Book);
        CREATE TABLE ChapterCommentary (Book INT, Chapter INT, Comments TEXT);
        CREATE INDEX BookChapterIndex ON ChapterCommentary (Book, Chapter);
        CREATE TABLE VerseCommentary (Book INT, ChapterBegin INT, VerseBegin INT, ChapterEnd INT, VerseEnd INT, Comments TEXT);
        CREATE INDEX BookChapterVerseIndex ON VerseCommentary (Book, ChapterBegin, VerseBegin);""",
    "dcti": """CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(50), Information TEXT, Version INT);
        CREATE TABLE Dictionary (Topic NVARCHAR(100), Definition TEXT);
        CREATE INDEX TopicIndex ON Dictionary (Topic);""",
    "lexi": """CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(20), Information TEXT, Version INT);
        CREATE TABLE Lexicon (Topic NVARCHAR(100), Definition TEXT);
        CREATE INDEX TopicIndex ON Lexicon (Topic);""",
    "refi": """CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(50), Information TEXT, Version INT);
        CREATE TABLE Reference (Chapter NVARCHAR(100), Content TEXT);
        CREATE INDEX ChapterIndex ON Reference (Chapter);""",
    "devi": """CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(50), Information TEXT, Version INT);
        CREATE TABLE Devotional (Month INT, Day INT, Devotion TEXT);
        CREATE INDEX MonthDayIndex ON Devotional (Month, Day);""",
}


@contextmanager
def module(file: str, title: str, abbrev: str, info: str, *, ot=True, nt=True, apocrypha=False, strongs=False, rtl=False, into: Path | None = None):
    """Writes the module `file` ("kjv+.bbli") into LIBRARY (or `into`): yields a connection to a new,
    empty module with its Details row; fill its table, and on leaving it replaces any old file
    whole. The flags are for Bibles only. If the block raises, nothing is replaced."""
    ext = file.rsplit(".", 1)[-1]
    if ext not in SCHEMA:
        raise ValueError(f"unknown module format: {file}")
    p = (into or LIBRARY) / file
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    try:
        db.executescript(SCHEMA[ext])
        if ext == "bbli":
            db.execute("INSERT INTO Details VALUES (?,?,?,1,?,?,?,?,?)", (title, abbrev, info, ot, nt, apocrypha, strongs, rtl))
        else:
            db.execute("INSERT INTO Details VALUES (?,?,?,1)", (title, abbrev, info))
        yield db
        db.commit()
    except BaseException:
        db.close()
        tmp.unlink(missing_ok=True)
        raise
    db.close()
    tmp.replace(p)
