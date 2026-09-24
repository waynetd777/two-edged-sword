//! The library's material on a Bible passage, written out as plain files for Ask to search and
//! read, so answers can come from the user's own commentaries, lexicons and dictionaries rather
//! than from what the model happens to know. One folder per chat (`<data>/ask/studies/<chat id>`):
//!
//!   index.txt                 what is here
//!   passage/<Bible>.txt       the passage in each Bible the page allows
//!   commentaries/<Title>.txt  every commentary's notes that touch the passage
//!   lexicons/<Title>.txt      entries for the Strong's numbers in the passage
//!
//! Dictionaries are too big to copy per chat, so each is written out once, whole, under
//! `dictionaries/` (redone when the module file changes) and the index points there.

use crate::library::{Kind, Library};
use rusqlite::params;
use serde::Deserialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// Bump when the dictionary export's layout changes, so old exports are redone.
const DICT_VERSION: &str = "2";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub book: i64,
    pub chapter: i64,
    /// A verse range; none means the whole chapter.
    pub from: Option<i64>,
    pub to: Option<i64>,
    /// Bible ids whose text may be included (the page leaves out licensed ones when told to).
    pub bibles: Vec<String>,
    /// A Bible with Strong's numbers, for the lexicon entries.
    pub strongs_bible: Option<String>,
    /// A human label for the passage, "John 1:1".
    pub label: String,
}

/// Everything here lives under `<data>/ask`, apart from books.rs's exports.
pub fn root(data: &Path) -> PathBuf {
    data.join("ask")
}

pub fn studies_root(root: &Path) -> PathBuf {
    root.join("studies")
}

pub fn dictionaries_dir(root: &Path) -> PathBuf {
    root.join("dictionaries")
}

pub fn export(lib: &Library, root: &Path, chat_id: &str, req: &Request) -> Result<PathBuf, String> {
    let id: String = chat_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(64).collect();
    if id.is_empty() {
        return Err("bad chat id".into());
    }
    let dest = studies_root(root).join(id);
    // Built aside and swapped in whole, one export of a chat at a time.
    let lock = crate::store::dir_lock(&dest);
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    crate::store::replace_dir(&dest, |dir| {
        for sub in ["passage", "commentaries", "lexicons"] {
            std::fs::create_dir_all(dir.join(sub)).map_err(|e| e.to_string())?;
        }
        let (from, to) = (req.from.unwrap_or(1), req.to.or(req.from).unwrap_or(999));
        let mut index = format!("Material from the user's library on {}.\n\ndigest.txt — start here: every commentary's notes on the passage, shortened, in one file.\n\n", req.label);

        index.push_str("passage/ — the passage in each of their Bibles:\n");
        for b in &req.bibles {
            let Ok(m) = lib.module(Kind::Bible, b) else { continue };
            let verses = verses(lib, b, req.book, req.chapter, from, to).unwrap_or_default();
            if verses.is_empty() {
                continue;
            }
            let file = format!("{}.txt", file_name(&format!("{} {}", m.abbrev, m.title)));
            let body: String = verses.iter().map(|(v, t)| format!("{v} {t}\n")).collect();
            write(&dir.join("passage").join(&file), &format!("{} — {}\n\n{body}", m.title, req.label))?;
            index.push_str(&format!("  {file}\n"));
        }

        index.push_str("\ncommentaries/ — every commentary's notes that touch the passage (with its chapter and book introductions), entries headed == reference ==:\n");
        let mut digest = format!("What each commentary in the library says on {}, the opening of its notes (about {DIGEST_WORDS} words each). The full notes are in commentaries/.\n\n", req.label);
        for m in lib.of_kind(Kind::Commentary) {
            let text = commentary(lib, &m.id, req.book, req.chapter, from, to).unwrap_or_default();
            if text.trim().is_empty() {
                continue;
            }
            let file = format!("{}.txt", file_name(&m.title));
            write(&dir.join("commentaries").join(&file), &format!("{}\n\n{text}", m.title))?;
            let words = text.split_whitespace().count();
            index.push_str(&format!("  {file}  ({words} words)\n"));
            let (short, cut) = shorten(&text, DIGEST_WORDS);
            if !short.is_empty() {
                let more = if cut { format!("\n[continues: commentaries/{file}, {words} words]") } else { String::new() };
                digest.push_str(&format!("######## {}\n{short}{more}\n\n", m.title));
            }
        }
        write(&dir.join("digest.txt"), &digest)?;

        let numbers = req.strongs_bible.as_deref().map(|b| strongs(lib, b, req.book, req.chapter, from, to)).unwrap_or_default();
        if !numbers.is_empty() {
            index.push_str(&format!("\nlexicons/ — entries for the Strong's numbers in the passage ({}), headed == number ==:\n", numbers.iter().cloned().collect::<Vec<_>>().join(" ")));
            for m in lib.of_kind(Kind::Lexicon) {
                let text = lexicon(lib, &m.id, &numbers).unwrap_or_default();
                if text.is_empty() {
                    continue;
                }
                let file = format!("{}.txt", file_name(&m.title));
                write(&dir.join("lexicons").join(&file), &format!("{}\n\n{text}", m.title))?;
                index.push_str(&format!("  {file}\n"));
            }
        }

        let dicts = dictionaries_dir(root);
        let done: Vec<String> = lib.of_kind(Kind::Dictionary).filter(|m| dict_current(&dicts, m)).map(|m| format!("{}.txt", file_name(&m.title))).collect();
        if !done.is_empty() {
            index.push_str(&format!("\nDictionaries, whole, one file each in {}, articles headed == Topic ==:\n", dicts.to_string_lossy()));
            for f in done {
                index.push_str(&format!("  {f}\n"));
            }
        }
        write(&dir.join("index.txt"), &index)
    })?;
    Ok(dest)
}

/// Words of each commentary in digest.txt: enough for its reading of the verse, and the
/// whole digest stays one Read (18 commentaries is about 10k tokens).
const DIGEST_WORDS: usize = 400;

/// The opening of a commentary's notes on the passage (not its introductions), whole paragraphs
/// up to about `max` words; true if anything was left out.
fn shorten(text: &str, max: usize) -> (String, bool) {
    let notes = text.split("== Introduction to ").next().unwrap_or("");
    let mut out: Vec<String> = Vec::new();
    let mut n = 0;
    for para in notes.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
        let w = para.split_whitespace().count();
        if n + w <= max || para.starts_with("== ") {
            out.push(para.to_string());
            n += if para.starts_with("== ") { 0 } else { w };
        } else {
            let left = max.saturating_sub(n);
            if left >= 40 {
                out.push(format!("{} …", para.split_whitespace().take(left).collect::<Vec<_>>().join(" ")));
            }
            return (trim_headings(out).join("\n"), true);
        }
    }
    (trim_headings(out).join("\n"), notes.len() < text.len())
}

/// A heading with nothing under it is dropped.
fn trim_headings(mut v: Vec<String>) -> Vec<String> {
    while v.last().is_some_and(|p| p.starts_with("== ")) {
        v.pop();
    }
    v
}

fn write(path: &Path, s: &str) -> Result<(), String> {
    std::fs::write(path, s).map_err(|e| e.to_string())
}

/// Paragraphs on their own lines, and Strong's numbers shown as "[G25]" so they survive
/// being turned into plain text.
fn text(html: &str) -> String {
    crate::books::paragraphs(&html.replace("<num>", " [").replace("</num>", "]"))
}

fn verses(lib: &Library, bible: &str, book: i64, chapter: i64, from: i64, to: i64) -> Result<Vec<(i64, String)>, String> {
    lib.with(Kind::Bible, bible, |c| {
        let mut st = c.prepare_cached("SELECT Verse, Scripture FROM Bible WHERE Book = ?1 AND Chapter = ?2 AND Verse BETWEEN ?3 AND ?4 ORDER BY Verse")?;
        let rows = st.query_map(params![book, chapter, from, to], |r| Ok((r.get::<_, i64>(0)?, text(&r.get::<_, Option<String>>(1)?.unwrap_or_default()).replace("\n\n", " "))))?;
        rows.collect()
    })
}

/// Entries whose range overlaps chapter:from–to (VerseEnd 0 runs to the end of its chapter),
/// then the chapter's and the book's introductions.
fn commentary(lib: &Library, module: &str, book: i64, chapter: i64, from: i64, to: i64) -> Result<String, String> {
    lib.with(Kind::Commentary, module, |c| {
        let mut out = String::new();
        let mut st = c.prepare_cached(
            "SELECT ChapterBegin, VerseBegin, ChapterEnd, VerseEnd, Comments FROM VerseCommentary WHERE Book = ?1 \
             AND (ChapterBegin < ?2 OR (ChapterBegin = ?2 AND VerseBegin <= ?4)) \
             AND (ChapterEnd > ?2 OR (ChapterEnd = ?2 AND (VerseEnd >= ?3 OR VerseEnd = 0))) ORDER BY ChapterBegin, VerseBegin",
        )?;
        let rows = st.query_map(params![book, chapter, from, to], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?, r.get::<_, Option<String>>(4)?.unwrap_or_default())))?;
        for row in rows {
            let (cb, vb, ce, ve, html) = row?;
            let t = text(&html);
            if t.trim().is_empty() {
                continue;
            }
            let end = if ve == 0 { format!("{ce}") } else if ce == cb { format!("{ve}") } else { format!("{ce}:{ve}") };
            let range = if (ce, ve) == (cb, vb) { format!("{cb}:{vb}") } else { format!("{cb}:{vb}-{end}") };
            out.push_str(&format!("== {range} ==\n{}\n\n", t.trim()));
        }
        let intro = |sql: &str, p: &[&dyn rusqlite::ToSql]| c.query_row(sql, p, |r| r.get::<_, Option<String>>(0)).ok().flatten().map(|h| text(&h)).filter(|t| !t.trim().is_empty());
        if let Some(t) = intro("SELECT Comments FROM ChapterCommentary WHERE Book = ?1 AND Chapter = ?2", &[&book, &chapter]) {
            out.push_str(&format!("== Introduction to chapter {chapter} ==\n{}\n\n", t.trim()));
        }
        if let Some(t) = intro("SELECT Comments FROM BookCommentary WHERE Book = ?1", &[&book]) {
            out.push_str(&format!("== Introduction to the book ==\n{}\n\n", t.trim()));
        }
        Ok(out)
    })
}

fn strongs(lib: &Library, bible: &str, book: i64, chapter: i64, from: i64, to: i64) -> BTreeSet<String> {
    let raw = lib
        .with(Kind::Bible, bible, |c| {
            let mut st = c.prepare_cached("SELECT Scripture FROM Bible WHERE Book = ?1 AND Chapter = ?2 AND Verse BETWEEN ?3 AND ?4")?;
            let rows = st.query_map(params![book, chapter, from, to], |r| r.get::<_, Option<String>>(0))?;
            rows.map(|r| r.map(|s| s.unwrap_or_default())).collect::<rusqlite::Result<Vec<_>>>()
        })
        .unwrap_or_default();
    let mut out = BTreeSet::new();
    for s in raw {
        for part in s.split("<num>").skip(1) {
            let n = part.split("</num>").next().unwrap_or("").trim();
            if n.len() > 1 && (n.starts_with('G') || n.starts_with('H')) && n[1..].chars().all(|c| c.is_ascii_digit()) {
                out.insert(n.to_string());
            }
        }
    }
    out
}

fn lexicon(lib: &Library, module: &str, numbers: &BTreeSet<String>) -> Result<String, String> {
    lib.with(Kind::Lexicon, module, |c| {
        let mut st = c.prepare_cached("SELECT Definition FROM Lexicon WHERE Topic = ?1 LIMIT 1")?;
        let mut out = String::new();
        for n in numbers {
            if let Ok(Some(h)) = st.query_row(params![n], |r| r.get::<_, Option<String>>(0)) {
                let t = text(&h);
                if !t.trim().is_empty() {
                    out.push_str(&format!("== {n} ==\n{}\n\n", t.trim()));
                }
            }
        }
        Ok(out)
    })
}

/// A marker beside each export: the version and the module file's size and modified time.
fn dict_stamp(m: &crate::library::ModuleInfo) -> String {
    let meta = std::fs::metadata(&m.path).ok();
    let len = meta.as_ref().map(|x| x.len()).unwrap_or(0);
    let mtime = meta.and_then(|x| x.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    format!("{DICT_VERSION} {len} {mtime}")
}

fn dict_current(dir: &Path, m: &crate::library::ModuleInfo) -> bool {
    std::fs::read_to_string(dir.join(format!(".{}.done", file_name(&m.title)))).ok() == Some(dict_stamp(m))
}

/// Writes out every dictionary that isn't already, whole. Slow the first time (tens of MB of
/// text), so it runs in the background at start and after a rescan.
pub fn export_dictionaries(lib: &Library, root: &Path) {
    let dir = dictionaries_dir(root);
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    for m in lib.of_kind(Kind::Dictionary) {
        if dict_current(&dir, m) {
            continue;
        }
        let name = file_name(&m.title);
        let body = lib.with(Kind::Dictionary, &m.id, |c| {
            let mut st = c.prepare("SELECT Topic, Definition FROM Dictionary ORDER BY Topic COLLATE NOCASE")?;
            let mut out = format!("{}\n\n", m.title);
            let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default())))?;
            for row in rows {
                let (topic, html) = row?;
                out.push_str(&format!("== {topic} ==\n{}\n\n", text(&html).trim()));
            }
            Ok(out)
        });
        match body {
            Ok(b) => {
                if std::fs::write(dir.join(format!("{name}.txt")), b).is_ok() {
                    let _ = std::fs::write(dir.join(format!(".{name}.done")), dict_stamp(m));
                }
            }
            Err(e) => eprintln!("dictionary export {}: {e}", m.id),
        }
    }
}

/// Study folders of chats not touched for 60 days; the chat itself may be long gone.
pub fn prune(root: &Path) {
    let Ok(rd) = std::fs::read_dir(studies_root(root)) else { return };
    let old = std::time::SystemTime::now() - std::time::Duration::from_secs(60 * 86400);
    for e in rd.flatten() {
        if e.metadata().and_then(|m| m.modified()).is_ok_and(|t| t < old) {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

fn file_name(s: &str) -> String {
    let t: String = s.chars().map(|c| if c.is_alphanumeric() || " -_',.()&+".contains(c) { c } else { ' ' }).collect();
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    let t: String = t.chars().take(80).collect();
    let t = t.trim_matches(|c: char| c == '.' || c == ' ').to_string();
    if t.is_empty() { "untitled".into() } else { t }
}

