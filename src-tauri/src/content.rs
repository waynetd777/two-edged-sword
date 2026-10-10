// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

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
        let rows =
            st.query_map(params![book, chapter], |r| Ok(Verse { v: r.get(0)?, text: r.get::<_, Option<String>>(1)?.unwrap_or_default() }))?;
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
        let mut st = c.prepare_cached(
            "SELECT Verse, Scripture FROM Bible WHERE Book = ?1 AND Chapter = ?2 AND Verse BETWEEN ?3 AND ?4 ORDER BY Verse",
        )?;
        let mut out = Vec::new();
        for r in ranges {
            let verses = st
                .query_map(params![r.book, r.chapter, r.from, r.to], |row| {
                    Ok(Verse { v: row.get(0)?, text: row.get::<_, Option<String>>(1)?.unwrap_or_default() })
                })?
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

/// Commentary entries whose range overlaps verses ?3–?4 of book ?1, chapter ?2 (VerseEnd 0 runs
/// to the end of its chapter); for one verse, ?3 and ?4 are the same.
pub const OVERLAPS: &str = "Book = ?1 AND (ChapterBegin < ?2 OR (ChapterBegin = ?2 AND VerseBegin <= ?4)) \
     AND (ChapterEnd > ?2 OR (ChapterEnd = ?2 AND (VerseEnd >= ?3 OR VerseEnd = 0)))";

/// The LIKE pattern for verses tagged with a Strong's number.
pub fn num_like(number: &str) -> String {
    format!("%<num>{number}</num>%")
}

/// A chapter's or book's introduction, None where the module has none (or no table for them).
fn intro(r: rusqlite::Result<Option<Option<String>>>) -> rusqlite::Result<Option<String>> {
    match r {
        Ok(v) => Ok(v.flatten()),
        Err(e) if e.to_string().contains("no such table") => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn commentary(lib: &Library, module: &str, book: i64, chapter: i64, verse: i64) -> Result<Commentary, String> {
    lib.with(Kind::Commentary, module, |c| {
        let sql = format!("SELECT ChapterBegin, VerseBegin, ChapterEnd, VerseEnd, Comments FROM VerseCommentary WHERE {OVERLAPS} ORDER BY ChapterBegin, VerseBegin");
        let mut st = c.prepare_cached(&sql)?;
        let verse = st
            .query_map(params![book, chapter, verse, verse], |r| {
                Ok(CommentEntry { chapter_begin: r.get(0)?, verse_begin: r.get(1)?, chapter_end: r.get(2)?, verse_end: r.get(3)?, html: r.get::<_, Option<String>>(4)?.unwrap_or_default() })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let chapter_c = intro(c.query_row("SELECT Comments FROM ChapterCommentary WHERE Book = ?1 AND Chapter = ?2", params![book, chapter], |r| r.get::<_, Option<String>>(0)).optional())?;
        let book_c = intro(c.query_row("SELECT Comments FROM BookCommentary WHERE Book = ?1", params![book], |r| r.get::<_, Option<String>>(0)).optional())?;
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

/// Verses per chapter, for splitting reading plans into days of similar length.
pub fn chapter_sizes(lib: &Library, bible: &str) -> Result<Vec<(i64, i64, i64)>, String> {
    lib.with(Kind::Bible, bible, |c| {
        let mut st =
            c.prepare("SELECT Book, Chapter, count(*) FROM Bible WHERE Book >= 1 GROUP BY Book, Chapter ORDER BY Book, Chapter")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.collect()
    })
}

/// (book, chapter begin, verse begin, chapter end, verse end).
pub type VerseRange = (i64, i64, i64, i64, i64);

/// Every verse range a commentary comments on, in order (F. B. Meyer's daily readings).
pub fn commentary_ranges(lib: &Library, module: &str) -> Result<Vec<VerseRange>, String> {
    lib.with(Kind::Commentary, module, |c| {
        let mut st = c.prepare(
            "SELECT Book, ChapterBegin, VerseBegin, ChapterEnd, VerseEnd FROM VerseCommentary ORDER BY Book, ChapterBegin, VerseBegin",
        )?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?;
        rows.collect()
    })
}

/// Which commentaries have something on this verse, and over what range.
pub fn coverage(lib: &Library, book: i64, chapter: i64, verse: i64) -> Vec<Coverage> {
    lib.of_kind(Kind::Commentary)
        .map(|m| {
            let range = lib
                .with(Kind::Commentary, &m.id, |c| {
                    let sql =
                        format!("SELECT ChapterBegin, VerseBegin, ChapterEnd, VerseEnd FROM VerseCommentary WHERE {OVERLAPS} LIMIT 1");
                    c.query_row(&sql, params![book, chapter, verse, verse], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).optional()
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
    if kind == Kind::Reference {
        "Chapter"
    } else {
        "Topic"
    }
}

pub fn article(lib: &Library, kind: Kind, module: &str, topic: &str) -> Result<Option<Article>, String> {
    let (table, col) = table_for(kind);
    let key = key_col(kind);
    let title = lib.module(kind, module)?.title.clone();
    lib.with(kind, module, |c| {
        c.query_row(&format!("SELECT {key}, {col} FROM {table} WHERE {key} = ?1 COLLATE NOCASE LIMIT 1"), params![topic], |r| {
            Ok(Article {
                module: module.to_string(),
                title: title.clone(),
                topic: r.get(0)?,
                html: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
            })
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
            let mut st = c.prepare_cached(
                "SELECT Topic FROM Dictionary WHERE Topic = ?1 COLLATE NOCASE OR Topic LIKE ?2 ORDER BY length(Topic) LIMIT ?3",
            )?;
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
        let rows = st.query_map(params![num_like(number)], |r| Ok((r.get(0)?, r.get(1)?)))?;
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
        let rows = st.query_map(params![num_like(number), book, limit as i64], |r| Ok(VerseHit { book: r.get(0)?, chapter: r.get(1)?, verse: r.get(2)?, text: r.get::<_, Option<String>>(3)?.unwrap_or_default() }))?;
        rows.collect()
    })
}

const MONTHS: [&str; 12] =
    ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/// A devotional's day as a title: "September 24". Month 13 is how one module files a December day.
fn day_title(month: i64, day: i64) -> String {
    format!("{} {day}", MONTHS[(month.clamp(1, 13) as usize - 1).min(11)])
}

fn title_day(title: &str) -> Option<(i64, i64)> {
    let (m, d) = title.trim().rsplit_once(' ')?;
    let month = MONTHS.iter().position(|x| x.eq_ignore_ascii_case(m))? as i64 + 1;
    Some((month, d.parse().ok()?))
}

/// A devotional's days, in calendar order, as titles.
pub fn devotion_titles(lib: &Library, module: &str) -> Result<Vec<String>, String> {
    let mut days = lib.with(Kind::Devotional, module, |c| {
        let mut st = c.prepare("SELECT DISTINCT Month, Day FROM Devotional")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
    })?;
    for d in days.iter_mut() {
        if d.0 == 13 {
            d.0 = 12;
        }
    }
    days.sort();
    days.dedup();
    Ok(days.into_iter().map(|(m, d)| day_title(m, d)).collect())
}

/// The reading for a day ("September 24"). A missing 29 February falls back to the 28th.
pub fn devotion(lib: &Library, module: &str, title: &str) -> Result<Option<String>, String> {
    let Some((m, d)) = title_day(title) else { return Ok(None) };
    let mut tries = vec![(m, d)];
    if m == 12 {
        tries.push((13, d));
    }
    if m == 2 && d == 29 {
        tries.push((2, 28));
    }
    lib.with(Kind::Devotional, module, |c| {
        for (m, d) in tries {
            let html: Option<String> =
                c.query_row("SELECT Devotion FROM Devotional WHERE Month = ?1 AND Day = ?2", params![m, d], |r| r.get(0)).optional()?;
            if html.is_some() {
                return Ok(html);
            }
        }
        Ok(None)
    })
}

/// A Strong's number an English word stands for in a Strong's Bible, how often, and in which forms.
#[derive(Serialize, Debug)]
pub struct WordNumber {
    pub num: String,
    pub count: i64,
    /// The English forms carrying it, most frequent first: [("love", 74), ("loved", 38)].
    pub forms: Vec<(String, i64)>,
}

/// Does a word in the text count as the searched word? The word itself, or it with a short ending
/// ("love" finds loved, loveth, lovest, lover), but not a longer word that merely starts the same.
fn is_form(w: &str, q: &str) -> bool {
    w == q || (w.starts_with(q) && w.len() <= q.len() + 4 && q.len() >= 3)
}

/// The Strong's numbers a word translates. In a Strong's Bible each group of words is followed by
/// the number(s) it renders ("loved<num>G25</num>"), so count the numbers after groups holding the word.
pub fn strongs_for_word(lib: &Library, bible: &str, word: &str) -> Result<Vec<WordNumber>, String> {
    let q = word.trim().to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let rows = lib.with(Kind::Bible, bible, |c| {
        let mut st = c.prepare("SELECT Scripture FROM Bible WHERE Scripture LIKE ?1")?;
        let rows = st.query_map(params![format!("%{q}%")], |r| r.get::<_, Option<String>>(0))?;
        rows.map(|r| r.map(|s| s.unwrap_or_default())).collect::<rusqlite::Result<Vec<_>>>()
    })?;
    let mut counts: std::collections::HashMap<String, (i64, std::collections::HashMap<String, i64>)> = Default::default();
    for s in rows {
        let mut words: Vec<String> = vec![];
        let mut nums: Vec<String> = vec![];
        let mut flush = |words: &mut Vec<String>, nums: &mut Vec<String>| {
            for w in words.iter().filter(|w| is_form(w, &q)) {
                for n in nums.iter() {
                    let e = counts.entry(n.clone()).or_default();
                    e.0 += 1;
                    *e.1.entry(w.clone()).or_default() += 1;
                }
            }
            words.clear();
            nums.clear();
        };
        let mut rest = s.as_str();
        while !rest.is_empty() {
            if let Some(r) = rest.strip_prefix("<num>") {
                let end = r.find("</num>").unwrap_or(r.len());
                nums.push(r[..end].trim().to_string());
                rest = r.get(end + 6..).unwrap_or("");
            } else if rest.starts_with('<') {
                rest = rest.find('>').map(|e| &rest[e + 1..]).unwrap_or("");
            } else {
                let end = rest.find('<').unwrap_or(rest.len());
                for w in rest[..end].split(|c: char| !(c.is_alphabetic() || c == '\'')).filter(|w| !w.is_empty()) {
                    if !nums.is_empty() {
                        flush(&mut words, &mut nums);
                    }
                    words.push(w.trim_end_matches('\'').to_lowercase());
                }
                rest = &rest[end..];
            }
        }
        flush(&mut words, &mut nums);
    }
    let mut out: Vec<WordNumber> = counts
        .into_iter()
        .map(|(num, (count, forms))| {
            let mut forms: Vec<(String, i64)> = forms.into_iter().collect();
            forms.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
            WordNumber { num, count, forms }
        })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then(a.num.cmp(&b.num)));
    out.truncate(40);
    Ok(out)
}

/// A lexicon entry whose transliteration matches: "agape" finds agapaō (G25) and agapē (G26).
#[derive(Serialize, Debug)]
pub struct TranslitHit {
    pub num: String,
    pub word: String,
    pub translit: String,
}

/// Lower-case ASCII letters only, accents taken off: "agapáō" → "agapao", "ʼĕlôhîym" → "elohiym".
fn fold(s: &str) -> String {
    s.chars()
        .flat_map(|c| c.to_lowercase())
        .filter_map(|c| {
            let b = match c {
                'a'..='z' => c,
                'à'..='å' | 'ā' | 'ă' | 'ą' | 'ǎ' => 'a',
                'è'..='ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' => 'e',
                'ì'..='ï' | 'ī' | 'ĭ' | 'į' | 'ǐ' => 'i',
                'ò'..='ö' | 'ø' | 'ō' | 'ŏ' | 'ő' | 'ǒ' => 'o',
                'ù'..='ü' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ǔ' => 'u',
                'ý' | 'ÿ' | 'ŷ' => 'y',
                'ç' | 'ć' | 'č' => 'c',
                'ñ' | 'ń' | 'ň' => 'n',
                'š' | 'ś' | 'ş' => 's',
                'ž' | 'ź' | 'ż' => 'z',
                'ḥ' => 'h',
                'ṭ' => 't',
                'ṣ' => 's',
                'ḳ' | 'ḵ' => 'k',
                _ => return None,
            };
            Some(b)
        })
        .collect()
}

pub fn translit_search(lib: &Library, lexicon: &str, query: &str, limit: usize) -> Result<Vec<TranslitHit>, String> {
    let q = fold(query);
    if q.len() < 2 {
        return Ok(vec![]);
    }
    let rows = lib.with(Kind::Lexicon, lexicon, |c| {
        let mut st = c.prepare("SELECT Topic, Definition FROM Lexicon")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default())))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
    })?;
    let para = |html: &str, i: usize| html.split("</p>").nth(i).map(crate::search::plain).map(|s| s.trim().to_string()).unwrap_or_default();
    let mut exact = vec![];
    let mut starts = vec![];
    for (num, html) in rows {
        let translit = para(&html, 1);
        let f = fold(&translit);
        if f.is_empty() {
            continue;
        }
        let hit = TranslitHit { num, word: para(&html, 0), translit };
        if f == q {
            exact.push(hit)
        } else if f.starts_with(&q) {
            starts.push(hit)
        }
    }
    starts.sort_by_key(|h| h.translit.chars().count());
    exact.extend(starts);
    exact.truncate(limit);
    Ok(exact)
}

/// These run against the modules on this Mac and skip themselves where they are absent.
#[cfg(test)]
mod library_tests {
    use super::*;
    use crate::search;

    fn lib() -> Option<Library> {
        crate::library::local("kjv.bbli")
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

        let love = strongs_for_word(&lib, "kjv+", "love").unwrap();
        let nums: Vec<&str> = love.iter().take(6).map(|w| w.num.as_str()).collect();
        assert!(nums.contains(&"G25") && nums.contains(&"G26") && nums.contains(&"H157"), "{nums:?}");
        assert!(love.iter().find(|w| w.num == "G25").unwrap().forms.iter().any(|(f, _)| f == "loved"));
        let days = devotion_titles(&lib, "gordon").unwrap();
        assert_eq!(days.first().map(String::as_str), Some("January 1"));
        assert!(days.contains(&"December 3".to_string()) && days.len() == 365, "{}", days.len());
        assert!(devotion(&lib, "gordon", "December 3").unwrap().unwrap().contains("NEVER FAILS"));
        assert!(devotion(&lib, "gordon", "February 29").unwrap().is_some());
        assert!(devotion(&lib, "spurgeon", "September 24").unwrap().unwrap().contains("Ezr 8:22"));
        let agape = translit_search(&lib, "strong", "agape", 10).unwrap();
        assert!(agape.iter().any(|h| h.num == "G26"), "{agape:?}");
    }

    /// The built-in modules alone (`make core`), as a Mac without e-Sword X sees them.
    #[test]
    fn the_built_in_modules_alone() {
        let dir = crate::library::bundled_dir();
        if !dir.join("kjv+.bbli").is_file() {
            return;
        }
        let lib = Library::scan(vec![(crate::library::Source::Bundled, dir)]);
        let ch = chapter(&lib, "kjv", 43, 3).unwrap();
        assert_eq!(ch.len(), 36);
        assert!(ch[15].text.contains("<red>For God so loved the world"), "{}", ch[15].text);
        // Spaces kept where the source's markup closed ("\nd LORD\nd* is"), and split words joined.
        assert!(chapter(&lib, "kjv", 19, 23).unwrap()[0].text.contains("The LORD <i>is</i> my shepherd"));
        assert!(chapter(&lib, "kjv", 44, 4).unwrap()[15].text.contains("we cannot deny"));
        assert!(chapter(&lib, "kjv", 46, 4).unwrap()[16].text.contains("every where in every church"));
        assert!(article(&lib, Kind::Lexicon, "strong", "H323").unwrap().unwrap().html.contains("<i>governor</i> <i>of a</i>"));
        assert!(lib.module(Kind::Bible, "kjv+").unwrap().strongs);
        assert!(!lib.module(Kind::Bible, "kjv").unwrap().strongs);
        assert!(article(&lib, Kind::Lexicon, "strong", "G25").unwrap().unwrap().html.contains("<lat>agap"));
        assert!(article(&lib, Kind::Lexicon, "kjc", "G25").unwrap().unwrap().html.contains("<b>love, "));
        let tsk = commentary(&lib, "tsk", 43, 3, 16).unwrap();
        assert!(tsk.verse.iter().any(|e| e.html.contains("<ref>1Jn 4:9-10</ref>")));
        let love = strongs_for_word(&lib, "kjv+", "love").unwrap();
        assert!(love.iter().take(6).any(|w| w.num == "G25"));
        let agape = translit_search(&lib, "strong", "agape", 10).unwrap();
        assert!(agape.iter().any(|h| h.num == "G26"), "{agape:?}");
        // "Bethel" finds the KJV's "Beth-el", and "beth-el" the same verses.
        let q = |text: &str| search::Query {
            text: text.into(),
            mode: search::Mode::Phrase,
            whole_words: true,
            bible: "kjv".into(),
            book_from: 1,
            book_to: 66,
            strongs_bible: None,
        };
        let bethel = search::run(&lib, None, &q("Bethel")).unwrap().bible.count;
        assert!(bethel >= 55, "{bethel}"); // 59: its 66 in 59 verses
        assert_eq!(search::run(&lib, None, &q("beth-el")).unwrap().bible.count, bethel);
        assert!(lib.modules.iter().all(|m| m.source == crate::library::Source::Bundled && !m.info.contains("Meyers")));
    }

    #[test]
    fn searches_the_real_modules() {
        let Some(lib) = lib().map(std::sync::Arc::new) else { return };
        let q = search::Query {
            text: "born again".into(),
            mode: search::Mode::Phrase,
            whole_words: true,
            bible: "kjv".into(),
            book_from: 1,
            book_to: 66,
            strongs_bible: Some("kjv+".into()),
        };
        let r = search::run(&lib, None, &q).unwrap();
        assert_eq!(r.bible.count, 3);
        assert!(r.commentaries.iter().any(|m| m.module == "gill" && m.count > 50));
        // The same through a freshly built index.
        let ix = crate::index::Index::new(std::env::temp_dir().join(format!("tes-index-{}.sqlite", std::process::id())));
        ix.update(lib.clone()).unwrap();
        let r2 = search::run(&lib, Some(&ix), &q).unwrap();
        assert_eq!(r2.bible.count, 3);
        // With the index, totals are the index's matches, which also take a phrase across
        // punctuation ("born. Again"); the text check doesn't. They agree to within a few percent.
        for m in &r.commentaries {
            let m2 = r2.commentaries.iter().find(|x| x.module == m.module).unwrap();
            assert!(m2.count >= m.count && m2.count - m.count <= 2.max(m.count / 25), "{}: {} vs {}", m.module, m.count, m2.count);
        }
        let t = std::time::Instant::now();
        search::run(&lib, Some(&ix), &q).unwrap();
        eprintln!("indexed search took {:?}", t.elapsed());
        let _ = std::fs::remove_file(&ix.path);
        let q = search::Query { text: "G509".into(), ..q };
        assert_eq!(search::run(&lib, None, &q).unwrap().bible.count, 13);
    }
}
