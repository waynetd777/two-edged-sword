//! Search across the Bible, commentaries and dictionaries. SQLite's LIKE finds candidate rows;
//! the match rules (phrase, all or any words, whole words) are applied here to the plain text,
//! so markup such as `<red>` or Strong's numbers never splits or fakes a match.

use crate::library::{Kind, Library};
use rusqlite::params_from_iter;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Phrase,
    All,
    Any,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Query {
    pub text: String,
    pub mode: Mode,
    pub whole_words: bool,
    pub bible: String,
    /// Book range, inclusive (1–66).
    pub book_from: i64,
    pub book_to: i64,
    /// A Strong's number search ("G509") runs against this Bible.
    pub strongs_bible: Option<String>,
}

#[derive(Serialize)]
pub struct VerseMatch {
    pub book: i64,
    pub chapter: i64,
    pub verse: i64,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentMatch {
    pub book: i64,
    pub chapter_begin: i64,
    pub verse_begin: i64,
    pub chapter_end: i64,
    pub verse_end: i64,
    pub snippet: String,
}

#[derive(Serialize)]
pub struct ModuleMatches<T> {
    pub module: String,
    pub title: String,
    pub abbrev: String,
    pub count: usize,
    pub hits: Vec<T>,
}

#[derive(Serialize)]
pub struct Results {
    pub bible: ModuleMatches<VerseMatch>,
    pub commentaries: Vec<ModuleMatches<CommentMatch>>,
    pub dictionaries: Vec<ModuleMatches<String>>,
    /// True when the query was a Strong's number.
    pub strongs: bool,
}

const MAX_VERSES: usize = 500;
const MAX_COMMENT_HITS: usize = 50;
const MAX_TOPICS: usize = 60;

/// Plain text: tags removed, Strong's numbers dropped, common entities decoded. Case is kept;
/// matching lower-cases with `lower`.
pub fn plain(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut chars = html.char_indices().peekable();
    while let Some((i, ch)) = chars.next() {
        if ch == '<' {
            // Skip a <num>…</num> run entirely: the number is not part of the text.
            if html[i..].starts_with("<num>") {
                if let Some(end) = html[i..].find("</num>") {
                    let stop = i + end + 6;
                    while let Some(&(j, _)) = chars.peek() {
                        if j >= stop { break; }
                        chars.next();
                    }
                    continue;
                }
            }
            let tag_end = html[i..].find('>').map(|e| i + e);
            let is_block = html[i..].starts_with("<p") || html[i..].starts_with("</p") || html[i..].starts_with("<br");
            if let Some(stop) = tag_end {
                while let Some(&(j, _)) = chars.peek() {
                    if j > stop { break; }
                    chars.next();
                }
                if is_block { out.push(' '); }
                continue;
            }
        }
        if ch == '&' {
            if let Some(semi) = html[i..].find(';').filter(|&s| s <= 8) {
                let ent = &html[i + 1..i + semi];
                let decoded = match ent {
                    "amp" => Some('&'),
                    "quot" | "#147" | "#148" => Some('"'),
                    "#146" | "#145" | "apos" => Some('\''),
                    "nbsp" => Some(' '),
                    "mdash" => Some('—'),
                    "ndash" => Some('–'),
                    "hellip" => Some('…'),
                    "lsquo" | "rsquo" => Some('’'),
                    "ldquo" => Some('“'),
                    "rdquo" => Some('”'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    _ => ent.strip_prefix('#').and_then(|n| n.parse::<u32>().ok()).and_then(char::from_u32),
                };
                if let Some(d) = decoded {
                    out.push(d);
                    while let Some(&(j, _)) = chars.peek() {
                        if j > i + semi { break; }
                        chars.next();
                    }
                    continue;
                }
            }
        }
        out.push(ch);
    }
    out
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '\''
}

fn find_term(hay: &str, term: &str, whole: bool) -> Option<usize> {
    let mut start = 0;
    while let Some(pos) = hay[start..].find(term) {
        let at = start + pos;
        if !whole {
            return Some(at);
        }
        let before = hay[..at].chars().next_back();
        let after = hay[at + term.len()..].chars().next();
        if !before.is_some_and(is_word_char) && !after.is_some_and(is_word_char) {
            return Some(at);
        }
        start = at + term.len().max(1);
        if start >= hay.len() { break; }
    }
    None
}

/// Lower case by Unicode rules, a character at a time (the query is lowered the same way). For
/// non-ASCII text, also where each byte of the result came from in `s`, as lowering can change
/// lengths ("İ" is two characters lowered).
pub fn lower(s: &str) -> (String, Option<Vec<usize>>) {
    if s.is_ascii() { return (s.to_ascii_lowercase(), None); }
    let (mut out, mut same) = (String::with_capacity(s.len()), true);
    for c in s.chars() {
        let n = out.len();
        out.extend(c.to_lowercase());
        same &= out.len() - n == c.len_utf8();
    }
    if same { return (out, None); }
    let (mut out, mut map) = (String::with_capacity(s.len()), Vec::with_capacity(s.len()));
    for (i, c) in s.char_indices() {
        for l in c.to_lowercase() {
            out.push(l);
            map.resize(out.len(), i);
        }
    }
    (out, Some(map))
}

/// Where the first match starts in `plain_text`, if it matches the query (terms already lowered).
pub fn matches(plain_text: &str, terms: &[String], phrase: &str, mode: Mode, whole: bool) -> Option<usize> {
    // An ASCII query can only match ASCII letters, so the (much quicker) ASCII lowering does.
    let (lowered, map) = if phrase.is_ascii() && terms.iter().all(|t| t.is_ascii()) { (plain_text.to_ascii_lowercase(), None) } else { lower(plain_text) };
    let at = find_lowered(&lowered, terms, phrase, mode, whole)?;
    Some(map.map_or(at, |m| m.get(at).copied().unwrap_or(plain_text.len())))
}

fn find_lowered(plain_text: &str, terms: &[String], phrase: &str, mode: Mode, whole: bool) -> Option<usize> {
    match mode {
        Mode::Phrase => find_term(plain_text, phrase, whole),
        Mode::All => {
            let mut first = None;
            for t in terms {
                let p = find_term(plain_text, t, whole)?;
                first = Some(first.map_or(p, |f: usize| f.min(p)));
            }
            first
        }
        Mode::Any => terms.iter().filter_map(|t| find_term(plain_text, t, whole)).min(),
    }
}

fn snippet(text: &str, at: usize) -> String {
    let start = text[..at].char_indices().rev().nth(140).map(|(i, _)| i).unwrap_or(0);
    let end = text[at..].char_indices().nth(220).map(|(i, _)| at + i).unwrap_or(text.len());
    let mut s = String::new();
    if start > 0 { s.push('…'); }
    s.push_str(text[start..end].trim());
    if end < text.len() { s.push('…'); }
    s
}

/// SQL LIKE conditions that narrow the candidates: every term for phrase/all, any for "any".
/// LIKE ignores case only for ASCII, so a word with other letters can't narrow them: it is left
/// to `matches`, and for "any" nothing narrows at all.
fn like_clause(col: &str, terms: &[String], phrase: &str, mode: Mode) -> (String, Vec<String>) {
    let words: Vec<&str> = match mode {
        Mode::Phrase => phrase.split_whitespace().collect(),
        _ => terms.iter().map(String::as_str).collect(),
    };
    if mode == Mode::Any && words.iter().any(|w| !w.is_ascii()) {
        return ("1".into(), vec![]);
    }
    let pats: Vec<String> = words.iter().filter(|w| w.is_ascii()).map(|w| format!("%{w}%")).collect();
    if pats.is_empty() {
        return ("1".into(), vec![]);
    }
    let joiner = if mode == Mode::Any { " OR " } else { " AND " };
    let clause = pats.iter().map(|_| format!("{col} LIKE ?")).collect::<Vec<_>>().join(joiner);
    (format!("({clause})"), pats)
}

pub fn run(lib: &Library, index: Option<&crate::index::Index>, q: &Query) -> Result<Results, String> {
    let raw = q.text.trim();
    let strongs_num = {
        let up = raw.to_ascii_uppercase();
        let ok = up.len() >= 2 && (up.starts_with('G') || up.starts_with('H')) && up[1..].chars().all(|c| c.is_ascii_digit());
        ok.then_some(up)
    };
    if let Some(num) = strongs_num {
        let bible = q.strongs_bible.clone().unwrap_or_else(|| q.bible.clone());
        let m = lib.module(Kind::Bible, &bible)?.clone();
        let hits = lib.with(Kind::Bible, &bible, |c| {
            let mut st = c.prepare("SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Scripture LIKE ?1 AND Book BETWEEN ?2 AND ?3 ORDER BY Book, Chapter, Verse")?;
            let rows = st.query_map(rusqlite::params![format!("%<num>{num}</num>%"), q.book_from, q.book_to], |r| Ok(VerseMatch { book: r.get(0)?, chapter: r.get(1)?, verse: r.get(2)?, text: r.get(3)? }))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })?;
        let count = hits.len();
        return Ok(Results {
            bible: ModuleMatches { module: m.id, title: m.title, abbrev: m.abbrev, count, hits: hits.into_iter().take(MAX_VERSES).collect() },
            commentaries: vec![],
            dictionaries: vec![],
            strongs: true,
        });
    }

    let phrase = lower(raw).0.split_whitespace().collect::<Vec<_>>().join(" ");
    let terms: Vec<String> = phrase.split_whitespace().map(|s| s.to_string()).collect();
    if terms.is_empty() {
        return Err("Type something to search for".into());
    }

    // Bible
    let bm = lib.module(Kind::Bible, &q.bible)?.clone();
    let (clause, pats) = like_clause("Scripture", &terms, &phrase, q.mode);
    let mut verse_hits = Vec::new();
    lib.with(Kind::Bible, &q.bible, |c| {
        let sql = format!("SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Book BETWEEN {} AND {} AND {clause} ORDER BY Book, Chapter, Verse", q.book_from, q.book_to);
        let mut st = c.prepare(&sql)?;
        let mut rows = st.query(params_from_iter(pats.iter()))?;
        while let Some(r) = rows.next()? {
            let text: String = r.get::<_, Option<String>>(3)?.unwrap_or_default();
            if matches(&plain(&text), &terms, &phrase, q.mode, q.whole_words).is_some() {
                verse_hits.push(VerseMatch { book: r.get(0)?, chapter: r.get(1)?, verse: r.get(2)?, text });
            }
        }
        Ok(())
    })?;
    let bible = ModuleMatches { module: bm.id, title: bm.title, abbrev: bm.abbrev, count: verse_hits.len(), hits: verse_hits.into_iter().take(MAX_VERSES).collect() };

    // Commentaries (TSK is a list of references, not prose: leave it out)
    let mut commentaries = Vec::new();
    for m in lib.of_kind(Kind::Commentary).filter(|m| m.id != "tsk") {
        let mut hits = Vec::new();
        let mut count = 0;
        let cols = "Book, ChapterBegin, VerseBegin, ChapterEnd, VerseEnd, Comments";
        let range = format!("Book BETWEEN {} AND {}", q.book_from, q.book_to);
        let exact = candidate_rows(lib, index, Kind::Commentary, &m.id, "VerseCommentary", cols, "Comments", &range, "Book, ChapterBegin, VerseBegin", &terms, &phrase, q, MAX_COMMENT_HITS, |r| {
            let html: String = r.get::<_, Option<String>>(5)?.unwrap_or_default();
            let p = plain(&html);
            if let Some(at) = matches(&p, &terms, &phrase, q.mode, q.whole_words) {
                count += 1;
                if hits.len() < MAX_COMMENT_HITS {
                    hits.push(CommentMatch { book: r.get(0)?, chapter_begin: r.get(1)?, verse_begin: r.get(2)?, chapter_end: r.get(3)?, verse_end: r.get(4)?, snippet: snippet(&p, at) });
                }
            }
            Ok(())
        });
        if let Ok(Some(n)) = exact { count = n; }
        if count > 0 {
            commentaries.push(ModuleMatches { module: m.id.clone(), title: m.title.clone(), abbrev: m.abbrev.clone(), count, hits });
        }
    }
    commentaries.sort_by(|a, b| b.count.cmp(&a.count));

    // Dictionaries (the whole library, not limited by book range)
    let mut dictionaries = Vec::new();
    for m in lib.of_kind(Kind::Dictionary) {
        let mut topics = Vec::new();
        let mut count = 0;
        let exact = candidate_rows(lib, index, Kind::Dictionary, &m.id, "Dictionary", "Topic, Definition", "Definition", "1", "Topic COLLATE NOCASE", &terms, &phrase, q, MAX_TOPICS, |r| {
            let def: String = r.get::<_, Option<String>>(1)?.unwrap_or_default();
            if matches(&plain(&def), &terms, &phrase, q.mode, q.whole_words).is_some() {
                count += 1;
                if topics.len() < MAX_TOPICS { topics.push(r.get::<_, String>(0)?); }
            }
            Ok(())
        });
        if let Ok(Some(n)) = exact { count = n; }
        if count > 0 {
            dictionaries.push(ModuleMatches { module: m.id.clone(), title: m.title.clone(), abbrev: m.abbrev.clone(), count, hits: topics });
        }
    }
    dictionaries.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(Results { bible, commentaries, dictionaries, strongs: false })
}

/// Feeds `f` the rows of the module that could match. With the index (a whole-word search on an
/// indexed module) its matches are already exact, so they are counted in SQL and only the first
/// `limit` rows, the ones shown, are loaded and passed on; the count is returned. Without it, `f`
/// gets every row LIKE finds and does its own counting, and None is returned.
#[allow(clippy::too_many_arguments)]
fn candidate_rows(
    lib: &Library,
    index: Option<&crate::index::Index>,
    kind: Kind,
    id: &str,
    table: &str,
    cols: &str,
    text_col: &str,
    filter: &str,
    order: &str,
    terms: &[String],
    phrase: &str,
    q: &Query,
    limit: usize,
    mut f: impl FnMut(&rusqlite::Row) -> rusqlite::Result<()>,
) -> Result<Option<usize>, String> {
    if let Some(ix) = index.filter(|ix| q.whole_words && ix.is_ready(kind, id)) {
        let ids = ix.candidates(kind, id, &crate::index::fts_query(terms, phrase, q.mode))?;
        if ids.is_empty() {
            return Ok(Some(0));
        }
        let list = ids.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",");
        return lib.with(kind, id, |c| {
            let n: i64 = c.query_row(&format!("SELECT count(*) FROM {table} WHERE rowid IN ({list}) AND {filter}"), [], |r| r.get(0))?;
            // A few more than shown, in case the text check below turns one down.
            let sql = format!("SELECT {cols} FROM {table} WHERE rowid IN ({list}) AND {filter} ORDER BY {order} LIMIT {}", limit + 10);
            let mut st = c.prepare(&sql)?;
            let mut rows = st.query([])?;
            while let Some(r) = rows.next()? { f(r)?; }
            Ok(Some(n as usize))
        });
    }
    let (clause, pats) = like_clause(text_col, terms, phrase, q.mode);
    lib.with(kind, id, |c| {
        let sql = format!("SELECT {cols} FROM {table} WHERE {filter} AND {clause} ORDER BY {order}");
        let mut st = c.prepare(&sql)?;
        let mut rows = st.query(params_from_iter(pats.iter()))?;
        while let Some(r) = rows.next()? { f(r)?; }
        Ok(None)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_strips_markup_and_numbers() {
        let s = "<red>For</red><num>G1063</num> <red>God</red><num>G2316</num> so &#147;loved&#148;<p>x</p>";
        assert_eq!(plain(s), "For God so \"loved\" x ");
    }

    #[test]
    fn whole_words() {
        let t = "he was born again, and again";
        assert_eq!(find_term(t, "born again", true), Some(7));
        assert_eq!(find_term("reborn again", "born again", true), None);
        assert_eq!(find_term("reborn again", "born again", false), Some(2));
    }

    #[test]
    fn unicode_case_and_offsets() {
        let terms = vec!["élie".to_string()];
        let t = "İ saw ÉLIE";
        let at = matches(t, &terms, "élie", Mode::Any, true).unwrap();
        assert_eq!(&t[at..], "ÉLIE");
        assert_eq!(like_clause("c", &terms, "élie", Mode::Any).0, "1");
        let both = vec!["saw".to_string(), "élie".to_string()];
        assert_eq!(like_clause("c", &both, "saw élie", Mode::All), ("(c LIKE ?)".to_string(), vec!["%saw%".to_string()]));
    }

    #[test]
    fn modes() {
        let terms = vec!["born".to_string(), "spirit".to_string()];
        let t = "that which is born of the spirit";
        assert!(matches(t, &terms, "born spirit", Mode::All, true).is_some());
        assert!(matches(t, &terms, "born spirit", Mode::Phrase, true).is_none());
        assert!(matches("born", &terms, "born spirit", Mode::Any, true).is_some());
        assert!(matches("born", &terms, "born spirit", Mode::All, true).is_none());
    }
}

