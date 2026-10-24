# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Where tools/ puts the modules it builds, where it finds the ones it reads, and a writer for
each of e-Sword X's formats (which the app reads as its own); with the downloading, caching and
small text helpers the builders share.

    import sys; from pathlib import Path; sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from modules import LIBRARY, find, module

LIBRARY is the app's own modules folder (TES_LIBRARY, or the older ESWORD_LIBRARY, overrides it).
find(name) looks there, then in e-Sword X's library, then among the modules built into the app,
so a script can read an input from wherever the app would. Output goes to LIBRARY unless a builder is
given another folder (tools/core gives BUNDLED). Inside `with shipping():` find() and chapter_lengths()
read only the built-in modules, so nothing from the user's library or e-Sword X's goes into a module
the app ships.
fetch(url, path) is a cached download: written whole or not at all, retried, and checked against
a sha256 when one is given. CACHES / "<tool>" is where each tool keeps its downloads.
"""
import hashlib, http.client, os, sqlite3, sys, time, unicodedata, urllib.error, urllib.request
from contextlib import contextmanager
from difflib import SequenceMatcher
from pathlib import Path

HOME = Path.home()
# Windows keeps an app's caches and data under %LOCALAPPDATA% and %APPDATA% (store.rs), macOS under ~/Library.
WINDOWS = sys.platform == "win32"
CACHES = Path(os.environ["LOCALAPPDATA"]) / "Two-edged Sword/Caches" if WINDOWS else HOME / "Library/Caches/Two-edged Sword"
APP_DATA = Path(os.environ["APPDATA"]) / "Two-edged Sword" if WINDOWS else HOME / "Library/Application Support/Two-edged Sword"
LIBRARY = Path(os.environ.get("TES_LIBRARY") or os.environ.get("ESWORD_LIBRARY") or APP_DATA / "Modules")
ESWORD = HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support"
BUNDLED = Path(__file__).resolve().parent.parent / "src-tauri/modules"
LIBRARY.mkdir(parents=True, exist_ok=True)
# A private copy of every source the builders download, kept where neither a cleared cache nor a site gone down can
# lose it: the caches' files at the same paths, in OneDrive (or $TES_SOURCES). Never committed or shared, as some
# sources may not be passed on. None (and nothing kept) where there is no OneDrive.
_ONEDRIVE = Path(os.environ.get("OneDrive", HOME / "OneDrive")) if WINDOWS else HOME / "Library/CloudStorage/OneDrive-Personal"
ARCHIVE = (Path(os.environ["TES_SOURCES"]) if os.environ.get("TES_SOURCES")
           else _ONEDRIVE / "Two-edged Sword Sources" if _ONEDRIVE.is_dir() else None)
# What isn't kept: things made, not downloaded, that can be made again (WebKit's cache, Stanza's Python environment, the
# compiled OCR tool and the Rheims scans unzipped, whose zip is kept).
ARCHIVE_SKIP = ("WebKit", "latin/venv", "rheims/ocr", "rheims/vulgatenewtestam00lond")


SEARCH = (LIBRARY, ESWORD, BUNDLED)


def find(name: str) -> Path:
    """The first of LIBRARY, e-Sword's library and the bundled modules to have `name`; else LIBRARY / name.
    Inside shipping(), the bundled modules only (else BUNDLED / name)."""
    for d in SEARCH:
        if (d / name).is_file():
            return d / name
    return SEARCH[0] / name


@contextmanager
def shipping():
    """While a module the app ships is built: find() looks only among the built-in modules, never in the
    user's library or e-Sword X's (whose licence forbids passing its modules on, even their verse counts)."""
    global SEARCH
    old, SEARCH = SEARCH, (BUNDLED,)
    try:
        yield
    finally:
        SEARCH = old


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
    "refi": """CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(50), Information TEXT, Version INT, Graphics BOOL);
        CREATE TABLE Reference (Chapter NVARCHAR(100), Content TEXT);
        CREATE INDEX ChapterIndex ON Reference (Chapter);""",
    "devi": """CREATE TABLE Details (Title NVARCHAR(255), Abbreviation NVARCHAR(50), Information TEXT, Version INT);
        CREATE TABLE Devotional (Month INT, Day INT, Devotion TEXT);
        CREATE INDEX MonthDayIndex ON Devotional (Month, Day);""",
}


def mend_verses(name, verses, fixes):
    """`verses` ({(book, chapter, verse): text}) with `fixes` made: {(book, chapter, verse): [(old, new)]}, each
    checked, so the build stops if a source changes and one no longer applies."""
    for ref, pairs in fixes.items():
        t = verses.get(ref, "")
        for old, new in pairs:
            if old not in t:
                sys.exit(f"{name}: {ref} no longer has {old!r}")
            t = t.replace(old, new)
        verses[ref] = t
    return verses


@contextmanager
def module(file: str, title: str, abbrev: str, info: str, *, ot=True, nt=True, apocrypha=False, strongs=False, rtl=False, into: Path | None = None):
    """Writes the module `file` ("kjv+.bbli") into LIBRARY (or `into`): yields a connection to a new,
    empty module with its Details row; fill its table, and on leaving it replaces any old file
    whole. The flags are for Bibles only. If the block raises, nothing is replaced (and the
    half-written file is removed)."""
    ext = file.rsplit(".", 1)[-1]
    if ext not in SCHEMA:
        raise ValueError(f"unknown module format: {file}")
    from covers import with_cover  # its cover, at the start of its description (tools/covers)
    from history import with_history  # a short history of the work, after its first paragraph (tools/history)
    info = with_history(file, with_cover(file, info))
    p = (into or LIBRARY) / file
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    try:
        db.executescript(SCHEMA[ext])
        if ext == "bbli":
            db.execute("INSERT INTO Details VALUES (?,?,?,1,?,?,?,?,?)", (title, abbrev, info, ot, nt, apocrypha, strongs, rtl))
        elif ext == "refi":
            db.execute("INSERT INTO Details VALUES (?,?,?,1,0)", (title, abbrev, info))
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


def chapter_lengths(name, *, required=True) -> dict:
    """{(book, chapter): verses} of a Bible module: `name` ("kjv.bbli") wherever find() finds it,
    or a path. A module that isn't there stops the build, or is {} if it isn't `required`."""
    p = name if isinstance(name, Path) else find(name)
    if not p.is_file():
        if required:
            sys.exit(f"no {p}")
        print(f"  note: no {p.name}, so its chapter lengths are unknown")
        return {}
    db = sqlite3.connect(f"file:{p}?immutable=1", uri=True)
    try:
        return {(b, ch): n for b, ch, n in db.execute("SELECT Book, Chapter, MAX(Verse) FROM Bible GROUP BY Book, Chapter")}
    finally:
        db.close()


# ---------- downloads ----------

UA = "Two-edged Sword (tools; personal Bible study app)"  # eBible refuses urllib's own


def download(url, *, ua=UA, timeout=120, retries=3) -> bytes:
    """`url`'s body, tried again (after 3s, 6s, …) when the connection fails or the server errs;
    a 4xx other than 429 is raised at once (a caller may take 404 as "there isn't one")."""
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if (e.code < 500 and e.code != 429) or attempt == retries:
                raise
        except (OSError, http.client.HTTPException):
            if attempt == retries:
                raise
        time.sleep(3 * (attempt + 1))
    raise AssertionError("unreachable")


def fetch(url, path, *, sha256=None, log=False, **kw) -> Path:
    """`path`, a cached copy of `url`: downloaded when it's missing, empty or (with `sha256`) not
    the file expected, and written whole (to a .part file, then renamed) so a failed download
    leaves nothing behind. Each is kept in ARCHIVE too, and taken from there when the download
    fails or no longer matches `sha256`; with no copy there, a mismatch stops the build."""
    path = Path(path)
    if path.is_file() and path.stat().st_size and (not sha256 or hashlib.sha256(path.read_bytes()).hexdigest() == sha256):
        keep(path)
        return path
    if log:
        print(f"downloading {url}")
    try:
        data = download(url, **kw)
    except (OSError, http.client.HTTPException) as e:  # urllib's errors are OSErrors
        if restore(path, sha256):
            print(f"  {url}: {e}; using the archived copy")
            return path
        raise
    if sha256 and (got := hashlib.sha256(data).hexdigest()) != sha256:
        if restore(path, sha256):
            print(f"  {url} has changed (sha256 {got}); using the archived copy of the version expected")
            return path
        sys.exit(f"{url}: sha256 {got}, expected {sha256}; the source has changed, so check it and update the hash")
    write_whole(path, data)
    keep(path)
    return path


def _archived(path) -> Path | None:
    """Where ARCHIVE keeps a file of CACHES; None for one it doesn't keep."""
    path = Path(path)
    if ARCHIVE is None or not path.is_relative_to(CACHES):
        return None
    rel = path.relative_to(CACHES).as_posix()
    return None if any(rel == s or rel.startswith(s + "/") for s in ARCHIVE_SKIP) else ARCHIVE / rel


def keep(path):
    """Copies a downloaded file from CACHES into ARCHIVE, unless it's there already. A different copy there before (the
    source has changed) is kept beside it, dated, not replaced."""
    import shutil
    a = _archived(path)
    if a is None or not Path(path).is_file():
        return
    size = Path(path).stat().st_size
    if a.is_file():
        if a.stat().st_size == size:
            return
        a.rename(a.with_name(f"{a.name}.{time.strftime('%Y-%m-%d', time.localtime(a.stat().st_mtime))}"))
    a.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, a.with_name(a.name + ".part"))
    a.with_name(a.name + ".part").replace(a)


def restore(path, sha256=None) -> bool:
    """Copies a file back into CACHES from ARCHIVE, the copy with `sha256` if given (the newest, or one of the dated
    ones the source has had); whether there was one."""
    import shutil
    a = _archived(path)
    if a is None:
        return False
    for c in [a, *sorted(a.parent.glob(a.name + ".*-*-*"), reverse=True)] if a.parent.is_dir() else []:
        if c.is_file() and (not sha256 or hashlib.sha256(c.read_bytes()).hexdigest() == sha256):
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(c, path)
            return True
    return False


def archive_all():
    """Keeps every file now in CACHES (but ARCHIVE_SKIP's) in ARCHIVE: for sources downloaded before it existed."""
    if ARCHIVE is None:
        sys.exit("no archive: no OneDrive folder, and $TES_SOURCES isn't set")
    n = 0
    for p in sorted(CACHES.rglob("*")):
        if p.is_file() and not p.name.endswith(".part") and _archived(p) is not None:
            a = _archived(p)
            if not (a.is_file() and a.stat().st_size == p.stat().st_size):
                keep(p)
                n += 1
    print(f"{n} files kept in {ARCHIVE}")


def write_whole(path, data) -> Path:
    """Writes `data` (str, as UTF-8, or bytes) to `path` whole: to a .part file, then renamed over it."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    if isinstance(data, str):
        tmp.write_text(data, encoding="utf-8")
    else:
        tmp.write_bytes(data)
    tmp.replace(path)
    return path


# ---------- text ----------

FINAL = str.maketrans("ךםןףץ", "כמנפצ")


def hebrew_consonants(w, finals=False) -> str:
    """A Hebrew word's letters only (no vowels, accents or marks), final forms written as the
    others (ם as מ) unless `finals`."""
    t = "".join(ch for ch in unicodedata.normalize("NFD", w) if "\u05d0" <= ch <= "\u05ea")
    return t if finals else t.translate(FINAL)


def greek_key(w, nu_from=2) -> str:
    """A Greek word for comparing editions: Greek letters only, no accents, breathings or case, σ
    for ς, and no closing movable ν after ε or ι in a key of at least `nu_from` letters (ἐστιν, ἐστι)."""
    t = unicodedata.normalize("NFD", w.lower())
    t = "".join(ch for ch in t if "α" <= ch <= "ω" or ch == "ς").replace("ς", "σ")
    if len(t) >= nu_from and t.endswith("ν") and t[-2:-1] in ("ε", "ι"):
        t = t[:-1]
    return t


def similar(a, b) -> float:
    """How alike two sequences are, 0 to 1 (difflib's ratio)."""
    return SequenceMatcher(None, a, b).ratio()


if __name__ == "__main__":
    if sys.argv[1:] == ["archive"]:
        archive_all()  # python3 tools/modules.py archive
    else:
        sys.exit("python3 tools/modules.py archive: keeps every downloaded source in the caches in the archive")
