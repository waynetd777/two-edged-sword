//! Reading text out of the modules: chapters, commentary, dictionary and lexicon entries,
//! reference books. The HTML is passed through as e-Sword stores it; the frontend renders it.

use crate::library::{Kind, Library};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Verse {
    pub v: i64,
    pub text: String,
}

pub fn chapter(lib: &Library, bible: &str, book: i64, chapter: i64) -> Result<Vec<Verse>, String> {
    lib.with(Kind::Bible, bible, |c| {
        let mut st = c.prepare_cached("SELECT Verse, Scripture FROM Bible WHERE Book = ?1 AND Chapter = ?2 ORDER BY Verse")?;
        let rows = st.query_map(params![book, chapter], |r| Ok(Verse { v: r.get(0)?, text: r.get::<_, Option<String>>(1)?.unwrap_or_default() }))?;
        rows.collect()
    })
}

#[derive(Deserialize, Serialize, Clone, Copy)]
pub struct Range {
    pub book: i64,
    pub chapter: i64,
    pub from: i64,
    pub to: i64,
}

#[derive(Serialize)]
pub struct Passage {
    pub range: Range,
    pub verses: Vec<Verse>,
}

pub fn passages(lib: &Library, bible: &str, ranges: &[Range]) -> Result<Vec<Passage>, String> {
    lib.with(Kind::Bible, bible, |c| {
        let mut st = c.prepare_cached("SELECT Verse, Scripture FROM Bible WHERE Book = ?1 AND Chapter = ?2 AND Verse BETWEEN ?3 AND ?4 ORDER BY Verse")?;
        let mut out = Vec::new();
        for r in ranges {
            let verses = st
                .query_map(params![r.book, r.chapter, r.from, r.to], |row| Ok(Verse { v: row.get(0)?, text: row.get::<_, Option<String>>(1)?.unwrap_or_default() }))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out.push(Passage { range: *r, verses });
        }
        Ok(out)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentEntry {
    pub chapter_begin: i64,
    pub verse_begin: i64,
    pub chapter_end: i64,
    pub verse_end: i64,
    pub html: String,
}

#[derive(Serialize)]
pub struct Commentary {
    pub verse: Vec<CommentEntry>,
    pub chapter: Option<String>,
    pub book: Option<String>,
}

const COVERS: &str = "Book = ?1 AND (ChapterBegin < ?2 OR (ChapterBegin = ?2 AND VerseBegin <= ?3)) \
     AND (ChapterEnd > ?2 OR (ChapterEnd = ?2 AND (VerseEnd >= ?3 OR VerseEnd = 0)))";

pub fn commentary(lib: &Library, module: &str, book: i64, chapter: i64, verse: i64) -> Result<Commentary, String> {
    lib.with(Kind::Commentary, module, |c| {
        let sql = format!("SELECT ChapterBegin, VerseBegin, ChapterEnd, VerseEnd, Comments FROM VerseCommentary WHERE {COVERS} ORDER BY ChapterBegin, VerseBegin");
        let mut st = c.prepare_cached(&sql)?;
        let verse = st
            .query_map(params![book, chapter, verse], |r| {
                Ok(CommentEntry { chapter_begin: r.get(0)?, verse_begin: r.get(1)?, chapter_end: r.get(2)?, verse_end: r.get(3)?, html: r.get::<_, Option<String>>(4)?.unwrap_or_default() })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let chapter_c = c.query_row("SELECT Comments FROM ChapterCommentary WHERE Book = ?1 AND Chapter = ?2", params![book, chapter], |r| r.get::<_, Option<String>>(0)).optional().unwrap_or(None).flatten();
        let book_c = c.query_row("SELECT Comments FROM BookCommentary WHERE Book = ?1", params![book], |r| r.get::<_, Option<String>>(0)).optional().unwrap_or(None).flatten();
        Ok(Commentary { verse, chapter: chapter_c, book: book_c })
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub id: String,
    pub title: String,
    pub abbrev: String,
    /// The range of the entry that covers the verse, if any.
    pub range: Option<(i64, i64, i64, i64)>,
}

/// Which commentaries have something on this verse, and over what range.
pub fn coverage(lib: &Library, book: i64, chapter: i64, verse: i64) -> Vec<Coverage> {
    lib.of_kind(Kind::Commentary)
        .map(|m| {
            let range = lib
                .with(Kind::Commentary, &m.id, |c| {
                    let sql = format!("SELECT ChapterBegin, VerseBegin, ChapterEnd, VerseEnd FROM VerseCommentary WHERE {COVERS} LIMIT 1");
                    c.query_row(&sql, params![book, chapter, verse], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).optional()
                })
                .ok()
                .flatten();
            Coverage { id: m.id.clone(), title: m.title.clone(), abbrev: m.abbrev.clone(), range }
        })
        .collect()
}

#[derive(Serialize)]
pub struct Article {
    pub module: String,
    pub title: String,
    pub topic: String,
    pub html: String,
}

fn table_for(kind: Kind) -> (&'static str, &'static str) {
    match kind {
        Kind::Lexicon => ("Lexicon", "Definition"),
        Kind::Reference => ("Reference", "Content"),
        _ => ("Dictionary", "Definition"),
    }
}

fn key_col(kind: Kind) -> &'static str {
    if kind == Kind::Reference { "Chapter" } else { "Topic" }
}

pub fn article(lib: &Library, kind: Kind, module: &str, topic: &str) -> Result<Option<Article>, String> {
    let (table, col) = table_for(kind);
    let key = key_col(kind);
    let title = lib.module(kind, module)?.title.clone();
    lib.with(kind, module, |c| {
        c.query_row(&format!("SELECT {key}, {col} FROM {table} WHERE {key} = ?1 COLLATE NOCASE LIMIT 1"), params![topic], |r| {
            Ok(Article { module: module.to_string(), title: title.clone(), topic: r.get(0)?, html: r.get::<_, Option<String>>(1)?.unwrap_or_default() })
        })
        .optional()
    })
}

#[derive(Serialize)]
pub struct TopicHit {
    pub module: String,
    pub title: String,
    pub topic: String,
}

/// Dictionary articles whose title is the word, or starts with "word," (ISBE's "Love, Brotherly").
pub fn find_topics(lib: &Library, word: &str, limit: usize) -> Vec<TopicHit> {
    let mut out = Vec::new();
    for m in lib.of_kind(Kind::Dictionary) {
        let hits = lib.with(Kind::Dictionary, &m.id, |c| {
            let mut st = c.prepare_cached("SELECT Topic FROM Dictionary WHERE Topic = ?1 COLLATE NOCASE OR Topic LIKE ?2 ORDER BY length(Topic) LIMIT ?3")?;
            let rows = st.query_map(params![word, format!("{word},%"), limit as i64], |r| r.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        });
        for t in hits.unwrap_or_default() {
            out.push(TopicHit { module: m.id.clone(), title: m.title.clone(), topic: t });
        }
    }
    out
}

pub fn topics(lib: &Library, kind: Kind, module: &str, prefix: &str, limit: usize) -> Result<Vec<String>, String> {
    let (table, _) = table_for(kind);
    let key = key_col(kind);
    lib.with(kind, module, |c| {
        let mut st = c.prepare(&format!("SELECT {key} FROM {table} WHERE {key} LIKE ?1 ORDER BY {key} COLLATE NOCASE LIMIT ?2"))?;
        let rows = st.query_map(params![format!("{prefix}%"), limit as i64], |r| r.get::<_, String>(0))?;
        rows.collect()
    })
}

/// Reference books keep their chapters in the order they were written into the file.
pub fn reference_titles(lib: &Library, module: &str) -> Result<Vec<String>, String> {
    lib.with(Kind::Reference, module, |c| {
        let mut st = c.prepare("SELECT Chapter FROM Reference ORDER BY rowid")?;
        let rows = st.query_map([], |r| r.get::<_, String>(0))?;
        rows.collect()
    })
}

/// Verses in the Strong's Bible containing the number, counted per book.
pub fn strongs_by_book(lib: &Library, bible: &str, number: &str) -> Result<Vec<(i64, i64)>, String> {
    lib.with(Kind::Bible, bible, |c| {
        let mut st = c.prepare("SELECT Book, count(*) FROM Bible WHERE Scripture LIKE ?1 GROUP BY Book ORDER BY Book")?;
        let rows = st.query_map(params![format!("%<num>{number}</num>%")], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect()
    })
}

#[derive(Serialize)]
pub struct VerseHit {
    pub book: i64,
    pub chapter: i64,
    pub verse: i64,
    pub text: String,
}

pub fn strongs_verses(lib: &Library, bible: &str, number: &str, book: Option<i64>, limit: usize) -> Result<Vec<VerseHit>, String> {
    lib.with(Kind::Bible, bible, |c| {
        let mut st = c.prepare("SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Scripture LIKE ?1 AND (?2 IS NULL OR Book = ?2) ORDER BY Book, Chapter, Verse LIMIT ?3")?;
        let rows = st.query_map(params![format!("%<num>{number}</num>%"), book, limit as i64], |r| Ok(VerseHit { book: r.get(0)?, chapter: r.get(1)?, verse: r.get(2)?, text: r.get::<_, Option<String>>(3)?.unwrap_or_default() }))?;
        rows.collect()
    })
}

/// These run against the e-Sword X library on this Mac and skip themselves where it is absent.
#[cfg(test)]
mod library_tests {
    use super::*;
    use crate::search;

    fn lib() -> Option<Library> {
        let dir = crate::library::default_dir();
        dir.join("kjv.bbli").is_file().then(|| Library::scan(dir))
    }

    #[test]
    fn reads_the_real_modules() {
        let Some(lib) = lib() else { return };
        let ch = chapter(&lib, "kjv", 43, 3).unwrap();
        assert_eq!(ch.len(), 36);
        assert!(ch[15].text.contains("For God so loved the world"));
        assert!(lib.module(Kind::Bible, "kjv+").unwrap().strongs);
        assert!(!lib.module(Kind::Bible, "kjv").unwrap().strongs);

        let c = commentary(&lib, "barnes", 43, 3, 16).unwrap();
        assert!(c.verse.iter().any(|e| e.html.contains("For God so loved")));
        let henry = coverage(&lib, 43, 3, 16).into_iter().find(|c| c.id == "henry").unwrap();
        assert_eq!(henry.range, Some((3, 1, 3, 21)));

        assert!(article(&lib, Kind::Lexicon, "strong", "G25").unwrap().unwrap().html.contains("agap"));
        assert!(find_topics(&lib, "love", 8).iter().any(|t| t.module == "isbe" && t.topic == "Love, Brotherly"));
        let total: i64 = strongs_by_book(&lib, "kjv+", "G25").unwrap().iter().map(|(_, n)| n).sum();
        assert_eq!(total, 109);
    }

    #[test]
    fn searches_the_real_modules() {
        let Some(lib) = lib() else { return };
        let q = search::Query { text: "born again".into(), mode: search::Mode::Phrase, whole_words: true, bible: "kjv".into(), book_from: 1, book_to: 66, strongs_bible: Some("kjv+".into()) };
        let r = search::run(&lib, &q).unwrap();
        assert_eq!(r.bible.count, 3);
        assert!(r.commentaries.iter().any(|m| m.module == "gill" && m.count > 50));
        let q = search::Query { text: "G509".into(), ..q };
        assert_eq!(search::run(&lib, &q).unwrap().bible.count, 13);
    }
}
