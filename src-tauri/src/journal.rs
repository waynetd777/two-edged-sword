// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The journal: Markdown, one file per month (`Me. Journal - 2026-09.md`), so it reads naturally in a Markdown notes app
//! or any editor. Each entry is a `## Title` heading, a hidden `<!-- tes … -->` comment holding
//! its id, dates, verses and tags (recovered from the visible line if an editor drops it), a visible line generated from those, and the body.

use crate::store::write_text_atomic;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub id: String,
    pub title: String,
    /// Local time, "2026-09-23T07:02".
    pub created: String,
    pub updated: String,
    /// References as the app writes them, "John 3:1-8".
    pub verses: Vec<String>,
    pub tags: Vec<String>,
    /// Markdown.
    pub body: String,
}

const MONTHS: [&str; 12] =
    ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

fn month_key(created: &str) -> Option<&str> {
    let k = created.get(0..7)?;
    (k.as_bytes()[4] == b'-' && k[0..4].chars().all(|c| c.is_ascii_digit()) && k[5..7].chars().all(|c| c.is_ascii_digit())).then_some(k)
}

fn esc(v: &str) -> String {
    v.replace('\\', "\\\\").replace('"', "\\\"").replace("--", "\\-\\-").replace('\n', " ")
}

fn unesc(v: &str) -> String {
    v.replace("\\-", "-").replace("\\\"", "\"").replace("\\\\", "\\")
}

/// `key="value"` pairs from the comment.
fn attrs(s: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let b: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < b.len() {
        while i < b.len() && b[i].is_whitespace() {
            i += 1;
        }
        let ks = i;
        while i < b.len() && b[i] != '=' && !b[i].is_whitespace() {
            i += 1;
        }
        let key: String = b[ks..i].iter().collect();
        if i >= b.len() || b[i] != '=' {
            i += 1;
            continue;
        }
        i += 1;
        if i < b.len() && b[i] == '"' {
            i += 1;
            let mut val = String::new();
            while i < b.len() && b[i] != '"' {
                if b[i] == '\\' && i + 1 < b.len() {
                    val.push(b[i]);
                    val.push(b[i + 1]);
                    i += 2;
                    continue;
                }
                val.push(b[i]);
                i += 1;
            }
            i += 1;
            out.push((key, unesc(&val)));
        }
    }
    out
}

fn weekday_line(created: &str) -> String {
    use chrono::{Datelike, NaiveDateTime};
    match NaiveDateTime::parse_from_str(created, "%Y-%m-%dT%H:%M") {
        Ok(dt) => {
            let wd = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                [dt.weekday().num_days_from_monday() as usize];
            format!("{wd} {} {} {} · {}", dt.day(), MONTHS[dt.month0() as usize], dt.year(), dt.format("%H:%M"))
        }
        Err(_) => created.to_string(),
    }
}

/// A line break taken out: verses, tags and the title are one line each in the file.
fn one_line(v: &str) -> String {
    v.replace(['\n', '\r'], " ")
}

/// A body line that would read as our hidden comment, escaped with a backslash (taken off again by
/// `parse_at`), so text written or synced into an entry can't make an entry of its own.
const COMMENT: &str = "<!-- tes ";

fn escape_body(body: &str) -> String {
    if !body.contains(COMMENT) {
        return body.to_string();
    }
    body.lines()
        .map(|l| {
            let t = l.trim_start();
            if t.starts_with(COMMENT) || t.starts_with(&format!("\\{COMMENT}")) {
                format!("{}\\{t}", &l[..l.len() - t.len()])
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn unescape_body(body: &str) -> String {
    if !body.contains(&format!("\\{COMMENT}")) {
        return body.to_string();
    }
    body.lines()
        .map(|l| {
            let t = l.trim_start();
            match t.strip_prefix('\\') {
                Some(rest) if rest.starts_with(COMMENT) || rest.starts_with(&format!("\\{COMMENT}")) => {
                    format!("{}{rest}", &l[..l.len() - t.len()])
                }
                _ => l.to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn render_entry(e: &Entry) -> String {
    let mut s = String::new();
    let verses: Vec<String> = e.verses.iter().map(|v| one_line(v)).collect();
    let tags: Vec<String> = e.tags.iter().map(|t| one_line(t)).collect();
    s.push_str(&format!("## {}\n", one_line(&e.title).trim()));
    s.push_str(&format!(
        "<!-- tes id=\"{}\" created=\"{}\" updated=\"{}\" verses=\"{}\" tags=\"{}\" -->\n",
        esc(&e.id),
        esc(&e.created),
        esc(&e.updated),
        esc(&verses.join("|")),
        esc(&tags.join(","))
    ));
    let mut meta = format!("*{}*", weekday_line(&one_line(&e.created)));
    if !verses.is_empty() {
        meta.push_str(&format!(" · {}", verses.join(", ")));
    }
    if !tags.is_empty() {
        meta.push_str(&format!(" · {}", tags.iter().map(|t| format!("#{t}")).collect::<Vec<_>>().join(" ")));
    }
    s.push_str(&meta);
    s.push_str("\n\n");
    s.push_str(&escape_body(e.body.trim_end()));
    s.push_str("\n\n");
    s
}

fn month_heading(key: &str) -> String {
    let (y, m) = (&key[0..4], key[5..7].parse::<usize>().unwrap_or(1));
    format!("# {} {}", MONTHS[m.saturating_sub(1).min(11)], y)
}

#[cfg(test)]
pub fn render_month(key: &str, entries: &[Entry]) -> String {
    let mut s = format!("{}\n\n", month_heading(key));
    let mut sorted: Vec<&Entry> = entries.iter().collect();
    sorted.sort_by(|a, b| a.created.cmp(&b.created));
    for e in sorted {
        s.push_str(&render_entry(e));
    }
    s
}

/// The created time, verses and tags from our visible meta line, for an entry whose comment an
/// editor has dropped (waynes-world's rich-text editor does). None for any other line.
fn from_meta_line(line: &str) -> Option<(String, Vec<String>, Vec<String>)> {
    let rest = line.strip_prefix('*')?;
    let (when, after) = rest.split_once('*')?;
    let (date, time) = when.split_once(" · ")?;
    let date = date.split_once(' ')?.1;
    let created =
        chrono::NaiveDateTime::parse_from_str(&format!("{date} {time}"), "%d %B %Y %H:%M").ok()?.format("%Y-%m-%dT%H:%M").to_string();
    if weekday_line(&created) != when {
        return None;
    }
    let (mut verses, mut tags) = (vec![], vec![]);
    for part in after.split(" · ").map(str::trim).filter(|p| !p.is_empty()) {
        if part.starts_with('#') {
            tags = part.split_whitespace().map(|t| t.trim_start_matches('#').to_string()).collect();
        } else {
            verses = part.split(", ").map(String::from).collect();
        }
    }
    Some((created, verses, tags))
}

/// The first line after the heading at `i` that isn't blank: editors may add a blank line there.
fn after_heading(lines: &[&str], i: usize) -> usize {
    (i + 1..lines.len()).find(|&j| !lines[j].trim().is_empty()).unwrap_or(lines.len())
}

fn has_comment(lines: &[&str], i: usize) -> bool {
    lines.get(after_heading(lines, i)).is_some_and(|l| l.trim_start().starts_with(COMMENT))
}

/// Where entries start: a "## " heading whose next line is our comment, or our meta line if the
/// comment has been lost.
fn starts(lines: &[&str]) -> Vec<usize> {
    (0..lines.len())
        .filter(|&i| {
            lines[i].starts_with("## ")
                && (has_comment(lines, i) || lines.get(after_heading(lines, i)).is_some_and(|l| from_meta_line(l).is_some()))
        })
        .collect()
}

/// The entry in lines[i..end]; its id is empty if the comment has lost it.
fn parse_at(lines: &[&str], i: usize, end: usize) -> Entry {
    let title = lines[i][3..].trim().to_string();
    if !has_comment(lines, i) {
        let meta = after_heading(lines, i);
        let (created, verses, tags) = lines.get(meta).and_then(|l| from_meta_line(l)).unwrap_or_default();
        let id = created.replace(['-', ':'], "").replace('T', "-");
        let body = unescape_body(lines[(meta + 1).min(end)..end].join("\n").trim());
        return Entry { id, title, updated: created.clone(), created, verses, tags, body };
    }
    let c = after_heading(lines, i);
    let comment = lines[c].trim().trim_start_matches(COMMENT).trim_end_matches("-->");
    let mut e = Entry {
        id: String::new(),
        title,
        created: String::new(),
        updated: String::new(),
        verses: vec![],
        tags: vec![],
        body: String::new(),
    };
    for (k, v) in attrs(comment) {
        match k.as_str() {
            "id" => e.id = v,
            "created" => e.created = v,
            "updated" => e.updated = v,
            "verses" => e.verses = v.split('|').filter(|s| !s.is_empty()).map(String::from).collect(),
            "tags" => e.tags = v.split(',').filter(|s| !s.is_empty()).map(String::from).collect(),
            _ => {}
        }
    }
    let mut body_start = c + 1;
    // Skip the generated meta line, but only ours: a body's own "*…" line is text.
    let m = after_heading(lines, c);
    if lines.get(m).is_some_and(|l| l.starts_with(&format!("*{}*", weekday_line(&e.created)))) {
        body_start = m + 1;
    }
    e.body = unescape_body(lines[body_start.min(end)..end].join("\n").trim());
    e
}

/// Each entry with the lines it spans. An id already used in the file gets "-2", "-3" after it,
/// so two entries never share one: the id made from the meta line when the comment is lost is
/// only the minute it was written, and a save or delete takes out every entry with its id.
fn entries(lines: &[&str]) -> Vec<(usize, usize, Entry)> {
    let st = starts(lines);
    let mut seen = std::collections::HashSet::new();
    st.iter()
        .enumerate()
        .map(|(n, &i)| {
            let end = st.get(n + 1).copied().unwrap_or(lines.len());
            let mut e = parse_at(lines, i, end);
            if !e.id.is_empty() {
                let base = e.id.clone();
                let mut k = 1;
                while !seen.insert(e.id.clone()) {
                    k += 1;
                    e.id = format!("{base}-{k}");
                }
            }
            (i, end, e)
        })
        .collect()
}

pub fn parse(text: &str) -> Vec<Entry> {
    let lines: Vec<&str> = text.lines().collect();
    entries(&lines).into_iter().map(|(_, _, e)| e).filter(|e| !e.id.is_empty()).collect()
}

/// The month file with entry `id` taken out and, if given, `put` added in date order. Everything
/// else, including what was written in another app (above the first entry, entries the app can't
/// read), is kept as it was. None when nothing is left, so the file can go.
fn splice(text: &str, key: &str, id: &str, put: Option<&Entry>) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();
    let all = entries(&lines);
    let head = lines[..all.first().map_or(lines.len(), |(i, _, _)| *i)].join("\n").trim_end().to_string();
    let head = if head.trim().is_empty() { month_heading(key) } else { head };
    let mut chunks: Vec<(String, String)> = Vec::new();
    for (i, end, e) in all {
        if id.is_empty() || e.id != id {
            chunks.push((e.created, lines[i..end].join("\n").trim_end().to_string()));
        }
    }
    if let Some(e) = put {
        let at = chunks.iter().position(|(c, _)| *c > e.created).unwrap_or(chunks.len());
        chunks.insert(at, (e.created.clone(), render_entry(e).trim_end().to_string()));
    }
    if chunks.is_empty() && head == month_heading(key) {
        return None;
    }
    let mut s = format!("{head}\n\n");
    for (_, c) in chunks {
        s.push_str(&c);
        s.push_str("\n\n");
    }
    Some(s)
}

fn month_path(dir: &Path, key: &str) -> std::path::PathBuf {
    dir.join(format!("Me. Journal - {key}.md"))
}

/// The month files in the folder. A folder not made yet (no entry saved) has none, but one that can't
/// be read is an error: taken for empty, its journal would look deleted.
fn month_files(dir: &Path) -> Result<Vec<(String, std::path::PathBuf)>, String> {
    let mut v = Vec::new();
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && dir.parent().is_some_and(|p| p.is_dir()) => return Ok(v),
        Err(e) => return Err(format!("{}: {e}", dir.display())),
    };
    for f in rd {
        let p = f.map_err(|e| format!("{}: {e}", dir.display()))?.path();
        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
            let key = stem.strip_prefix("Me. Journal - ").unwrap_or("");
            if p.extension().is_some_and(|e| e == "md") && key.len() == 7 && month_key(key).is_some() {
                v.push((key.to_string(), p.clone()));
            }
        }
    }
    v.sort();
    Ok(v)
}

/// A fingerprint of the month files (names, sizes, modified times), cheap enough to poll: it
/// changes whenever one is written, here or in another app. It reads no file, so nothing only in
/// the cloud is downloaded.
pub fn stamp(dir: &Path) -> String {
    month_files(dir)
        .unwrap_or_default()
        .iter()
        .map(|(k, p)| {
            let (len, t) = crate::store::file_stamp(p);
            format!("{k}:{len}:{}", t.as_nanos())
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Which month file each entry was last seen in, per journal folder, so a save needn't read every
/// month (on a cloud drive, reading one only in the cloud downloads it). Filled by `list`, which
/// the app runs again whenever the files change, and kept up by `save` and `delete`.
type Months = std::collections::HashMap<std::path::PathBuf, std::collections::HashMap<String, String>>;
static MONTH_OF: std::sync::Mutex<Option<Months>> = std::sync::Mutex::new(None);

fn month_of(dir: &Path, f: impl FnOnce(&mut std::collections::HashMap<String, String>)) {
    let mut m = MONTH_OF.lock().unwrap_or_else(|e| e.into_inner());
    f(m.get_or_insert_with(Default::default).entry(dir.to_path_buf()).or_default());
}

/// Every entry, newest first. A month file that can't be read (not downloaded from a cloud drive, not
/// UTF-8) is left out and logged, rather than failing the whole journal; saving into it fails, as
/// `read_month` does. An id in two months (a file copied by hand) is listed once, the newer edit.
pub fn list(dir: &Path) -> Result<Vec<Entry>, String> {
    let mut by_id: std::collections::HashMap<String, (Entry, String)> = std::collections::HashMap::new();
    for (k, p) in month_files(dir)? {
        let text = match std::fs::read_to_string(&p) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("journal: couldn't read {}: {e}; left out", p.display());
                continue;
            }
        };
        for e in parse(&text) {
            match by_id.get(&e.id) {
                Some((was, _)) if was.updated >= e.updated => {}
                _ => {
                    by_id.insert(e.id.clone(), (e, k.clone()));
                }
            }
        }
    }
    month_of(dir, |m| *m = by_id.iter().map(|(id, (_, k))| (id.clone(), k.clone())).collect());
    let mut all: Vec<Entry> = by_id.into_values().map(|(e, _)| e).collect();
    all.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| a.id.cmp(&b.id)));
    Ok(all)
}

fn read_month(dir: &Path, key: &str) -> Result<String, String> {
    let p = month_path(dir, key);
    if !p.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))
}

/// A month file keeps the modified time it had: an edit here doesn't make an old month look new
/// (to Finder, a notes app's sort, a backup). A new month file gets the time it's made.
fn write_month(dir: &Path, key: &str, text: Option<String>) -> Result<(), String> {
    let p = month_path(dir, key);
    match text {
        Some(t) => {
            let was = std::fs::metadata(&p).and_then(|m| m.modified()).ok();
            write_text_atomic(&p, &t)?;
            // Only a nicety: the entry is saved either way.
            if let Some(was) = was {
                if let Err(e) = std::fs::File::options().write(true).open(&p).and_then(|f| f.set_modified(was)) {
                    eprintln!("journal: couldn't keep {}'s modified time: {e}", p.display());
                }
            }
            Ok(())
        }
        None if p.exists() => std::fs::remove_file(&p).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

pub fn save(dir: &Path, entry: &Entry) -> Result<(), String> {
    if entry.id.is_empty() {
        return Err("entry has no id".into());
    }
    // The folder itself is made on first use, but not the one it sits in: if that is gone (the
    // vault moved), a fresh empty journal would quietly start there instead.
    if dir.parent().is_some_and(|p| !p.is_dir()) {
        return Err(format!("{} isn't there any more. Choose the journal's folder in Settings.", dir.parent().unwrap().display()));
    }
    let key = month_key(&entry.created).ok_or("entry has no valid date")?.to_string();
    // Saves overlap (one entry's debounce, the next entry's), and each rewrites whole months.
    let lock = crate::store::dir_lock(dir);
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    write_month(dir, &key, splice(&read_month(dir, &key)?, &key, &entry.id, Some(entry)))?;
    // Only once it is safely written, out of whichever month held it before (its date may have
    // changed): the one it was last seen in, or every other month for an entry not seen yet.
    let mut was = None;
    month_of(dir, |m| was = m.get(&entry.id).cloned());
    let (others, known): (Vec<String>, bool) = match was {
        Some(k) if k == key => (vec![], true),
        Some(k) => (vec![k], true),
        None => (month_files(dir)?.into_iter().map(|(k, _)| k).filter(|k| *k != key).collect(), false),
    };
    for k in others {
        let text = match read_month(dir, &k) {
            Ok(t) => t,
            // Looking through every month for a copy: one that can't be read is passed over.
            Err(e) if !known => {
                eprintln!("journal: {e}; not looked in");
                continue;
            }
            Err(e) => return Err(e),
        };
        if parse(&text).iter().any(|e| e.id == entry.id) {
            write_month(dir, &k, splice(&text, &k, &entry.id, None))?;
        }
    }
    // Noted once it is out of the old month, so a failure there leaves it known to be in both.
    month_of(dir, |m| {
        m.insert(entry.id.clone(), key.clone());
    });
    Ok(())
}

/// Copies the journal's month files into a dated folder under `into` (store::backup), so a sync that goes
/// wrong can be undone. Unless `force`, only when the newest backup is more than a day old.
pub fn backup(dir: &Path, into: &Path, force: bool) -> Result<Option<std::path::PathBuf>, String> {
    let lock = crate::store::dir_lock(dir);
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    let files: Vec<std::path::PathBuf> = month_files(dir)?.into_iter().map(|(_, p)| p).collect();
    crate::store::backup(&files, into, force)
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Ok(());
    }
    let lock = crate::store::dir_lock(dir);
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    // Every month, as a copy may be in more than one. One that can't be read is passed over, unless the
    // entry is found in none of the others: then it may be in that one, and isn't known to be deleted.
    let (mut found, mut unread) = (false, None);
    for (k, _) in month_files(dir)? {
        let text = match read_month(dir, &k) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("journal: {e}; not looked in");
                unread = Some(e);
                continue;
            }
        };
        if parse(&text).iter().any(|e| e.id == id) {
            write_month(dir, &k, splice(&text, &k, id, None))?;
            found = true;
        }
    }
    if let (false, Some(e)) = (found, unread) {
        return Err(e);
    }
    month_of(dir, |m| {
        m.remove(id);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Entry {
        Entry {
            id: "20260923-0702".into(),
            title: "Born of the Spirit".into(),
            created: "2026-09-23T07:02".into(),
            updated: "2026-09-23T07:14".into(),
            verses: vec!["John 3:1-8".into(), "John 3:16".into()],
            tags: vec!["new-birth".into()],
            body: "Some **bold** text.\n\n> The wind bloweth\n\n### A heading\n\n- one\n- two".into(),
        }
    }

    #[test]
    fn round_trip() {
        let e = sample();
        let text = render_month("2026-09", std::slice::from_ref(&e));
        assert!(text.starts_with("# September 2026\n"));
        assert!(text.contains("*Wednesday 23 September 2026 · 07:02* · John 3:1-8, John 3:16 · #new-birth"));
        assert_eq!(parse(&text), vec![e]);
    }

    #[test]
    fn survives_losing_its_comment() {
        let e = sample();
        let text = render_month("2026-09", std::slice::from_ref(&e));
        let stripped: String = text.lines().filter(|l| !l.starts_with("<!-- tes ")).map(|l| format!("{l}\n")).collect();
        let got = parse(&stripped);
        assert_eq!(got, vec![Entry { updated: e.created.clone(), ..e.clone() }]);
        // Saving it again writes the comment back.
        let again = splice(&stripped, "2026-09", &e.id, Some(&e)).unwrap();
        assert_eq!(parse(&again), vec![e]);
        let spaced = stripped.replace("## Born of the Spirit\n", "## Born of the Spirit\n\n");
        assert_eq!(parse(&spaced), got);
        let edited = "# September 2026\n\n## Morning prayer\n\n*Friday 25 September 2026 · 02:09* · #prayer\n\nLord, thank You.\n";
        let got = parse(edited);
        assert_eq!(
            (got[0].id.as_str(), got[0].tags.clone(), got[0].body.as_str()),
            ("20260925-0209", vec!["prayer".to_string()], "Lord, thank You.")
        );
        assert_eq!(from_meta_line("*Saturday 5 September 2026 · 06:00* · #prayer").unwrap().0, "2026-09-05T06:00");
    }

    #[test]
    fn entries_without_comments_in_one_minute_stay_apart() {
        let a = sample();
        let b = Entry { title: "Another".into(), body: "Second.".into(), ..sample() };
        let text = render_month("2026-09", &[a, b]);
        let stripped: String = text.lines().filter(|l| !l.starts_with("<!-- tes ")).map(|l| format!("{l}\n")).collect();
        let got = parse(&stripped);
        assert_eq!(got.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), vec!["20260923-0702", "20260923-0702-2"]);
        // Deleting one leaves the other.
        let left = parse(&splice(&stripped, "2026-09", &got[0].id, None).unwrap());
        assert_eq!((left.len(), left[0].body.as_str()), (1, "Second."));
        // Saving the second writes it back under its own id, the first untouched.
        let saved = parse(&splice(&stripped, "2026-09", &got[1].id, Some(&got[1])).unwrap());
        assert_eq!(saved.len(), 2);
        assert!(saved.iter().any(|e| e.body.starts_with("Some **bold**")));
    }

    #[test]
    fn quotes_and_dashes_survive() {
        let mut e = sample();
        e.title = "A \"quoted\" -- title".into();
        e.tags = vec!["a--b".into()];
        let text = render_month("2026-09", std::slice::from_ref(&e));
        assert!(!text.lines().nth(3).unwrap().contains("a--b\""), "comment must not contain --");
        assert_eq!(parse(&text)[0].tags, vec!["a--b".to_string()]);
    }

    #[test]
    fn save_keeps_the_month_file_modified_time() {
        let dir = std::env::temp_dir().join(format!("tes-journal-mtime-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let e = sample();
        save(&dir, &e).unwrap();
        let p = dir.join("Me. Journal - 2026-09.md");
        let old = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
        std::fs::File::options().write(true).open(&p).unwrap().set_modified(old).unwrap();
        save(&dir, &Entry { body: "Changed.".into(), ..e.clone() }).unwrap();
        assert!(std::fs::read_to_string(&p).unwrap().contains("Changed."));
        assert_eq!(std::fs::metadata(&p).unwrap().modified().unwrap(), old);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn backs_up_at_most_daily_unless_forced() {
        let base = std::env::temp_dir().join(format!("tes-journal-backup-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (dir, into) = (base.join("journal"), base.join("backups"));
        std::fs::create_dir_all(&base).unwrap();
        save(&dir, &sample()).unwrap();
        let first = backup(&dir, &into, false).unwrap().expect("a first backup");
        assert!(first.join("Me. Journal - 2026-09.md").exists());
        assert!(backup(&dir, &into, false).unwrap().is_none(), "not again the same day");
        assert!(backup(&dir, &into, true).unwrap().is_some(), "forced");
        for _ in 0..crate::store::BACKUPS_KEPT + 3 {
            backup(&dir, &into, true).unwrap();
        }
        assert_eq!(std::fs::read_dir(&into).unwrap().count(), crate::store::BACKUPS_KEPT);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn save_moves_between_months() {
        let dir = std::env::temp_dir().join(format!("tes-journal-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut e = sample();
        save(&dir, &e).unwrap();
        e.created = "2026-10-01T06:00".into();
        save(&dir, &e).unwrap();
        assert!(!dir.join("Me. Journal - 2026-09.md").exists());
        assert_eq!(list(&dir).unwrap().len(), 1);
        delete(&dir, &e.id).unwrap();
        assert!(list(&dir).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeps_text_written_outside_the_app() {
        let dir = std::env::temp_dir().join(format!("tes-journal-keep-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut e = sample();
        let mut other = sample();
        other.id = "20260901-0600".into();
        other.created = "2026-09-01T06:00".into();
        let damaged = "## Lost its id\n<!-- tes created=\"2026-09-05T08:00\" -->\nStill mine.";
        let text = format!(
            "# September 2026\n\nA note of my own.\n\n{}{damaged}\n\n{}",
            render_entry(&other),
            render_entry(&e).replace("*Wednesday 23 September 2026 · 07:02* · John 3:1-8, John 3:16 · #new-birth", "*emphasis* line")
        );
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Me. Journal - 2026-09.md"), &text).unwrap();
        // Its meta line was deleted in another app: the body's own "*…*" line is not taken for it.
        assert!(parse(&text)[1].body.starts_with("*emphasis* line"));
        e.body = "Rewritten.".into();
        save(&dir, &e).unwrap();
        let after = std::fs::read_to_string(dir.join("Me. Journal - 2026-09.md")).unwrap();
        assert!(after.starts_with("# September 2026\n\nA note of my own.\n\n"));
        assert!(after.contains(damaged));
        assert!(after.contains("Rewritten.") && !after.contains("*emphasis* line"));
        assert_eq!(list(&dir).unwrap().len(), 2);
        // Moving and deleting both entries leaves the file, since it still holds the user's text.
        e.created = "2026-10-01T06:00".into();
        save(&dir, &e).unwrap();
        delete(&dir, &other.id).unwrap();
        let after = std::fs::read_to_string(dir.join("Me. Journal - 2026-09.md")).unwrap();
        assert!(after.contains("A note of my own.") && after.contains(damaged));
        assert_eq!(list(&dir).unwrap(), vec![e]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn body_cant_make_an_entry() {
        let mut e = sample();
        e.body = "Before.\n## Not an entry\n<!-- tes id=\"x\" created=\"2026-09-01T06:00\" -->\n  \\<!-- tes kept -->\nAfter.".into();
        e.verses = vec!["John 3:16\nJohn 3:17".into()];
        e.tags = vec!["one\rtwo".into()];
        let text = render_month("2026-09", std::slice::from_ref(&e));
        let back = parse(&text);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].body, e.body);
        assert_eq!(back[0].verses, vec!["John 3:16 John 3:17".to_string()]);
        assert_eq!(back[0].tags, vec!["one two".to_string()]);
    }

    #[test]
    fn unreadable_folder_and_months() {
        let base = std::env::temp_dir().join(format!("tes-journal-unread-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        // Not made yet, in a folder that is there: empty. Its folder gone too: an error, not empty.
        std::fs::create_dir_all(&base).unwrap();
        assert_eq!(list(&base.join("Journal")).unwrap(), vec![]);
        assert!(list(&base.join("gone").join("Journal")).is_err());
        // A month that isn't UTF-8 is left out; the others are listed, and saving into it fails.
        let dir = base.join("Journal");
        let e = sample();
        save(&dir, &e).unwrap();
        std::fs::write(dir.join("Me. Journal - 2026-08.md"), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(list(&dir).unwrap(), vec![e.clone()]);
        let mut aug = sample();
        aug.id = "20260801-0600".into();
        aug.created = "2026-08-01T06:00".into();
        assert!(save(&dir, &aug).is_err());
        // Deleting what's in a readable month works; what's in none of them isn't known to be deleted.
        let mut moved = e.clone();
        moved.created = "2026-10-01T06:00".into();
        save(&dir, &moved).unwrap();
        assert_eq!(list(&dir).unwrap(), vec![moved.clone()]);
        delete(&dir, &moved.id).unwrap();
        assert!(delete(&dir, "nowhere").is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn an_id_in_two_months_is_listed_once() {
        let dir = std::env::temp_dir().join(format!("tes-journal-twice-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let old = sample();
        let mut newer = sample();
        newer.created = "2026-10-01T06:00".into();
        newer.updated = "2026-10-02T06:00".into();
        std::fs::write(dir.join("Me. Journal - 2026-09.md"), render_month("2026-09", std::slice::from_ref(&old))).unwrap();
        std::fs::write(dir.join("Me. Journal - 2026-10.md"), render_month("2026-10", std::slice::from_ref(&newer))).unwrap();
        assert_eq!(list(&dir).unwrap(), vec![newer]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
