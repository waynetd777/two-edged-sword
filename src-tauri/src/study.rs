//! The library's material on a Bible passage, written out as plain files for Ask to search and
//! read, so answers can come from the user's own commentaries, lexicons and dictionaries rather
//! than from what the model happens to know. One folder per chat (`<data>/ask/studies/<chat id>`):
//!
//!   index.txt                 what is here
//!   passage/<Bible>.txt       the passage in each Bible the page allows
//!   commentaries/<Title>.txt  every commentary's notes that touch the passage
//!   lexicons/<Title>.txt      entries for the Strong's numbers in the passage
//!   dictionaries/<Title>.txt  each dictionary, whole
//!
//! Dictionaries are too big to copy per chat, so each is written out once, whole, under
//! `<data>/ask/dictionaries/` (redone when the module file changes) and hard-linked into the
//! chat's folder, so the assistant needs no other folder and sees only the ones allowed.

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
    /// The user's journal entries on the passage, when they have chosen to include them.
    #[serde(default)]
    pub journal: Vec<JournalNote>,
    /// Module ids to leave out: licensed ones, when the user hasn't allowed sending them.
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Deserialize)]
pub struct JournalNote {
    pub title: String,
    /// "2026-09-23T07:02"
    pub created: String,
    pub verses: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Markdown.
    pub body: String,
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
        for sub in ["passage", "differences", "commentaries", "references", "lexicons", "journal", "dictionaries"] {
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

        differences(lib, root, req, from, to, &dir.join("differences"), &mut index)?;

        index.push_str("\ncommentaries/ — every commentary's notes that touch the passage (with its chapter and book introductions), entries headed == reference ==:\n");
        let mut digest = format!("What each commentary in the library says on {}, the opening of its notes (about {DIGEST_WORDS} words each). The full notes are in commentaries/.\n\n", req.label);
        for m in lib.of_kind(Kind::Commentary).filter(|m| !req.exclude.contains(&m.id)) {
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

        cited_in_books(lib, req, from, to, &dir.join("references"), &mut index)?;

        let numbers = req.strongs_bible.as_deref().map(|b| strongs(lib, b, req.book, req.chapter, from, to)).unwrap_or_default();
        if !numbers.is_empty() {
            index.push_str(&format!("\nlexicons/ — entries for the Strong's numbers in the passage ({}), headed == number ==:\n", numbers.iter().cloned().collect::<Vec<_>>().join(" ")));
            for m in lib.of_kind(Kind::Lexicon).filter(|m| !req.exclude.contains(&m.id)) {
                let text = lexicon(lib, &m.id, &numbers).unwrap_or_default();
                if text.is_empty() {
                    continue;
                }
                let file = format!("{}.txt", file_name(&m.title));
                write(&dir.join("lexicons").join(&file), &format!("{}\n\n{text}", m.title))?;
                index.push_str(&format!("  {file}\n"));
            }
        }

        if !req.journal.is_empty() {
            index.push_str("\njournal/ — the user's own journal entries (their prayers, study notes and sermons), one file each, dated:\n");
            write_journal(&dir.join("journal"), &req.journal, &mut index)?;
        }

        let dicts = dictionaries_dir(root);
        let done: Vec<String> = lib.of_kind(Kind::Dictionary).filter(|m| !req.exclude.contains(&m.id) && dict_current(&dicts, m)).map(|m| format!("{}.txt", file_name(&m.title)))
            .filter(|f| std::fs::hard_link(dicts.join(f), dir.join("dictionaries").join(f)).inspect_err(|e| eprintln!("dictionary link {f}: {e}")).is_ok())
            .collect();
        if !done.is_empty() {
            index.push_str("\ndictionaries/ — their dictionaries, whole, one file each, articles headed == Topic ==:\n");
            for f in done {
                index.push_str(&format!("  {f}\n"));
            }
        }
        write(&dir.join("index.txt"), &index)
    })?;
    Ok(dest)
}

/// Passages in reference books that cite the passage's verses, from a book's VerseLinks table
/// (tools/sefaria gives each Talmud tractate one; e-Sword's own books have none): one file per book.
fn cited_in_books(lib: &Library, req: &Request, from: i64, to: i64, dir: &Path, index: &mut String) -> Result<(), String> {
    let mut listed = false;
    for m in lib.of_kind(Kind::Reference).filter(|m| !req.exclude.contains(&m.id)) {
        let rows = lib.with(Kind::Reference, &m.id, |c| {
            let mut st = c.prepare("SELECT Verse, Segment, Excerpt FROM VerseLinks WHERE Book = ?1 AND Chapter = ?2 AND Verse BETWEEN ?3 AND ?4 ORDER BY Verse, rowid")?;
            let rows = st.query_map(params![req.book, req.chapter, from, to], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        });
        let Ok(rows) = rows else { continue };
        if rows.is_empty() {
            continue;
        }
        if !listed {
            index.push_str("\nreferences/ — passages in their reference books (such as the Talmud) that cite these verses, each headed == verse · place ==, with a passage either side for context:\n");
            listed = true;
        }
        let body: String = rows.iter().map(|(v, seg, text)| format!("== {}:{v} · {} {seg} ==\n{text}\n\n", req.chapter, m.abbrev)).collect();
        let file = format!("{}.txt", file_name(&m.title));
        write(&dir.join(&file), &format!("{} — passages citing {}\n\n{body}", m.title, req.label))?;
        index.push_str(&format!("  {file}  ({} passages)\n", rows.len()));
    }
    Ok(())
}

/// e-Sword's book numbers, from 1.
const BOOKS: [&str; 66] = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"];

/// Where each translation's meaning differs from the KJV, from the reviewed `variances-<module>.json`
/// files beside the app's other data (tools/variances/ builds them): the passage's, and the whole list.
fn differences(lib: &Library, root: &Path, req: &Request, from: i64, to: i64, dir: &Path, index: &mut String) -> Result<(), String> {
    let data = root.parent().unwrap_or(root);
    let mut listed = false;
    for m in lib.of_kind(Kind::Bible) {
        let name: String = m.id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
        let Ok(text) = std::fs::read_to_string(data.join(format!("variances-{name}.json"))) else { continue };
        let Ok(doc) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
        let base = doc["base"].as_str().unwrap_or("kjv").to_uppercase();
        let records = doc["records"].as_array().cloned().unwrap_or_default();
        let line = |r: &serde_json::Value| {
            let n = |k: &str| r[k].as_i64().unwrap_or(0);
            let s = |k: &str| r[k].as_str().unwrap_or("");
            let book = BOOKS.get((n("book") - 1).max(0) as usize).copied().unwrap_or("?");
            format!("{book} {}:{} [{}, {}] {}\n  {}\n", n("chapter"), n("verse"), s("kind"), s("weight"), s("change"), s("note"))
        };
        let here: String = records.iter().filter(|r| r["book"].as_i64() == Some(req.book) && r["chapter"].as_i64() == Some(req.chapter) && (from..=to).contains(&r["verse"].as_i64().unwrap_or(0))).map(line).collect();
        let all: String = records.iter().map(line).collect();
        if !listed {
            index.push_str("\ndifferences/ — reviewed places where a translation's meaning differs from the KJV (omitted verses and phrases, changed names of God and Christ, doctrinal words), with the manuscript reason. Only reviewed books are covered; a translation with no file has not been compared:\n");
            listed = true;
        }
        let file = format!("{}.txt", file_name(&format!("{} vs {base}", m.abbrev)));
        let head = format!("{} compared with the {base} ({} differences in all, reviewed {}).\n\n", m.title, records.len(), doc["updated"].as_str().unwrap_or("?"));
        let body = if here.is_empty() { format!("None recorded in {}.\n", req.label) } else { here };
        write(&dir.join(&file), &format!("{head}In {}:\n\n{body}", req.label))?;
        let whole = format!("{}.txt", file_name(&format!("{} vs {base} - all", m.abbrev)));
        write(&dir.join(&whole), &format!("{head}{all}"))?;
        index.push_str(&format!("  {file}  (in this passage)\n  {whole}  (every book reviewed so far)\n"));
    }
    Ok(())
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

/// One file per entry in `dir`, each listed in `index` with its date, verses and length.
fn write_journal(dir: &Path, notes: &[JournalNote], index: &mut String) -> Result<(), String> {
    let mut used = std::collections::HashSet::new();
    for (i, e) in notes.iter().enumerate() {
        let date = e.created.get(..10).unwrap_or("");
        let mut file = format!("{}.md", file_name(&format!("{date} {}", e.title)));
        if !used.insert(file.clone()) { file = format!("{}.md", file_name(&format!("{date} {} {}", e.title, i + 1))); used.insert(file.clone()); }
        let on = if e.verses.is_empty() { String::new() } else { format!(" · on {}", e.verses.join(", ")) };
        let tags = if e.tags.is_empty() { String::new() } else { format!(" · #{}", e.tags.join(" #")) };
        write(&dir.join(&file), &format!("{}\n{date}{on}{tags}\n\n{}\n", e.title, e.body))?;
        index.push_str(&format!("  {file}  ({} words{on}{tags})\n", e.body.split_whitespace().count()));
    }
    Ok(())
}

/// Journal chats' folders: `<data>/ask/journal/<chat id>`.
pub fn journal_root(root: &Path) -> PathBuf {
    root.join("journal")
}

/// The user's journal entries written out for a chat that asks about them; returns the folder.
/// `label` says what they are: "the whole journal", "entries tagged #prayer".
pub fn export_journal(root: &Path, chat_id: &str, label: &str, notes: &[JournalNote]) -> Result<PathBuf, String> {
    let id: String = chat_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(64).collect();
    if id.is_empty() {
        return Err("bad chat id".into());
    }
    let dest = journal_root(root).join(id);
    let lock = crate::store::dir_lock(&dest);
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    crate::store::replace_dir(&dest, |dir| {
        let mut index = format!("The user's journal: {label}, {} entries, newest first, one file each (date, the verses it is on, tags, word count):\n", notes.len());
        write_journal(dir, notes, &mut index)?;
        write(&dir.join("index.txt"), &index)?;
        Ok(dest.clone())
    })
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

/// Study and journal folders of chats not asked in for 60 days (`ask` touches them); the chat
/// itself may be long gone.
pub fn prune(root: &Path) {
    let old = std::time::SystemTime::now() - std::time::Duration::from_secs(60 * 86400);
    for e in [studies_root(root), journal_root(root)].iter().filter_map(|d| std::fs::read_dir(d).ok()).flat_map(|rd| rd.flatten()) {
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


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn journal_export_lists_each_entry() {
        let root = std::env::temp_dir().join(format!("tes-ask-journal-{}", std::process::id()));
        let note = |t: &str, tags: &[&str]| JournalNote { title: t.into(), created: "2026-09-01T07:00".into(), verses: vec!["John 3:16".into()], tags: tags.iter().map(|s| s.to_string()).collect(), body: "So loved.".into() };
        let dir = export_journal(&root, "chat-1", "the whole journal", &[note("Love", &["prayer"]), note("Love", &[])]).unwrap();
        let index = std::fs::read_to_string(dir.join("index.txt")).unwrap();
        assert!(index.contains("2 entries"));
        assert!(index.contains("2026-09-01 Love.md  (2 words · on John 3:16 · #prayer)"));
        // Same date and title: the second gets its own file.
        assert!(dir.join("2026-09-01 Love 2.md").exists());
        assert!(export_journal(&root, "../", "x", &[]).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    /// Against the e-Sword X library on this Mac, with tools/sefaria's Talmud; skips itself without them.
    #[test]
    fn talmud_passages_citing_a_verse() {
        let dir = crate::library::default_dir();
        if !dir.join("talmud_sanhedrin.refi").is_file() { return; }
        let lib = Library::scan(dir);
        let out = std::env::temp_dir().join(format!("tes-ask-cited-{}", std::process::id()));
        std::fs::create_dir_all(&out).unwrap();
        let req = Request { book: 1, chapter: 49, from: Some(10), to: Some(10), bibles: vec![], strongs_bible: None, label: "Genesis 49:10".into(), journal: vec![], exclude: vec![] };
        let mut index = String::new();
        cited_in_books(&lib, &req, 10, 10, &out, &mut index).unwrap();
        let text = std::fs::read_to_string(out.join("Talmud_ Sanhedrin.txt")).or_else(|_| std::fs::read_to_string(std::fs::read_dir(&out).unwrap().flatten().find(|e| e.file_name().to_string_lossy().contains("Sanhedrin")).unwrap().path())).unwrap();
        assert!(text.contains("== 49:10 · Sanhedrin 98b"), "{text}");
        assert!(index.contains("references/"));
        let _ = std::fs::remove_dir_all(&out);
    }

    /// Against the e-Sword X library on this Mac; skips itself where it is absent.
    #[test]
    fn differences_list_the_passage_and_the_whole_file() {
        let dir = crate::library::default_dir();
        if !dir.join("kjv.bbli").is_file() { return; }
        let lib = Library::scan(dir);
        let data = std::env::temp_dir().join(format!("tes-ask-diff-{}", std::process::id()));
        let (root, out) = (data.join("ask"), data.join("out"));
        std::fs::create_dir_all(&out).unwrap();
        let rec = |b: i64, c: i64, v: i64, change: &str| serde_json::json!({"book": b, "chapter": c, "verse": v, "kind": "deity", "weight": "major", "change": change, "note": "Why."});
        let doc = serde_json::json!({"module": "kjv", "base": "kjv", "updated": "2026-09-25", "records": [rec(43, 3, 16, "In John"), rec(51, 1, 14, "In Colossians")]});
        std::fs::write(data.join("variances-kjv.json"), doc.to_string()).unwrap();
        let req = Request { book: 43, chapter: 3, from: None, to: None, bibles: vec![], strongs_bible: None, label: "John 3".into(), journal: vec![], exclude: vec![] };
        let mut index = String::new();
        differences(&lib, &root, &req, 1, 999, &out, &mut index).unwrap();
        let file = |name: &str| std::fs::read_to_string(std::fs::read_dir(&out).unwrap().flatten().find(|e| e.file_name().to_string_lossy().ends_with(name)).unwrap().path()).unwrap();
        let here = file("KJV.txt");
        assert!(here.contains("John 3:16 [deity, major] In John") && !here.contains("Colossians"));
        assert!(file("all.txt").contains("Colossians 1:14"));
        assert!(index.contains("differences/"));
        let _ = std::fs::remove_dir_all(&data);
    }

    /// Against the e-Sword X library on this Mac; skips itself where it is absent.
    #[test]
    fn export_links_dictionaries_and_leaves_out_excluded() {
        let dir = crate::library::default_dir();
        if !dir.join("kjv.bbli").is_file() { return; }
        let lib = Library::scan(dir);
        let root = std::env::temp_dir().join(format!("tes-ask-study-{}", std::process::id()));
        export_dictionaries(&lib, &root);
        let comm: Vec<_> = lib.of_kind(Kind::Commentary).collect();
        let dicts: Vec<_> = lib.of_kind(Kind::Dictionary).collect();
        let (Some(c), Some(d)) = (comm.first(), dicts.first()) else { return };
        let req = |exclude: Vec<String>| Request { book: 43, chapter: 3, from: Some(16), to: Some(16), bibles: vec!["kjv".into()], strongs_bible: None, label: "John 3:16".into(), journal: vec![], exclude };
        let all = export(&lib, &root, "all", &req(vec![])).unwrap();
        let fewer = export(&lib, &root, "fewer", &req(vec![c.id.clone(), d.id.clone()])).unwrap();
        let count = |p: PathBuf| std::fs::read_dir(p).map(|r| r.count()).unwrap_or(0);
        assert!(count(all.join("dictionaries")) > 0, "dictionaries linked into the chat's folder");
        assert_eq!(count(fewer.join("dictionaries")), count(all.join("dictionaries")) - 1);
        let index = std::fs::read_to_string(fewer.join("index.txt")).unwrap();
        assert!(!index.contains(&format!("{}.txt", file_name(&d.title))));
        assert!(!std::fs::read_to_string(fewer.join("digest.txt")).unwrap().contains(&format!("######## {}\n", c.title)));
        let _ = std::fs::remove_dir_all(&root);
    }
}
