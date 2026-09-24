//! The journal: Markdown, one file per month (`2026-09.md`), so it reads naturally in Obsidian
//! or any editor. Each entry is a `## Title` heading, a hidden `<!-- tes … -->` comment holding
//! its id, dates, verses and tags, a visible line generated from those, and the body.

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

const MONTHS: [&str; 12] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
        while i < b.len() && b[i].is_whitespace() { i += 1; }
        let ks = i;
        while i < b.len() && b[i] != '=' && !b[i].is_whitespace() { i += 1; }
        let key: String = b[ks..i].iter().collect();
        if i >= b.len() || b[i] != '=' { i += 1; continue; }
        i += 1;
        if i < b.len() && b[i] == '"' {
            i += 1;
            let mut val = String::new();
            while i < b.len() && b[i] != '"' {
                if b[i] == '\\' && i + 1 < b.len() { val.push(b[i]); val.push(b[i + 1]); i += 2; continue; }
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
            let wd = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][dt.weekday().num_days_from_monday() as usize];
            format!("{wd} {} {} {} · {}", dt.day(), MONTHS[dt.month0() as usize], dt.year(), dt.format("%H:%M"))
        }
        Err(_) => created.to_string(),
    }
}

pub fn render_entry(e: &Entry) -> String {
    let mut s = String::new();
    s.push_str(&format!("## {}\n", e.title.replace('\n', " ").trim()));
    s.push_str(&format!(
        "<!-- tes id=\"{}\" created=\"{}\" updated=\"{}\" verses=\"{}\" tags=\"{}\" -->\n",
        esc(&e.id), esc(&e.created), esc(&e.updated), esc(&e.verses.join("|")), esc(&e.tags.join(","))
    ));
    let mut meta = format!("*{}*", weekday_line(&e.created));
    if !e.verses.is_empty() { meta.push_str(&format!(" · {}", e.verses.join(", "))); }
    if !e.tags.is_empty() { meta.push_str(&format!(" · {}", e.tags.iter().map(|t| format!("#{t}")).collect::<Vec<_>>().join(" "))); }
    s.push_str(&meta);
    s.push_str("\n\n");
    s.push_str(e.body.trim_end());
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
    for e in sorted { s.push_str(&render_entry(e)); }
    s
}

/// Where entries start: a "## " heading whose next line is our comment.
fn starts(lines: &[&str]) -> Vec<usize> {
    (0..lines.len()).filter(|&i| lines[i].starts_with("## ") && lines.get(i + 1).is_some_and(|l| l.trim_start().starts_with("<!-- tes "))).collect()
}

/// The entry in lines[i..end]; its id is empty if the comment has lost it.
fn parse_at(lines: &[&str], i: usize, end: usize) -> Entry {
    let title = lines[i][3..].trim().to_string();
    let comment = lines[i + 1].trim().trim_start_matches("<!-- tes ").trim_end_matches("-->");
    let mut e = Entry { id: String::new(), title, created: String::new(), updated: String::new(), verses: vec![], tags: vec![], body: String::new() };
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
    let mut body_start = i + 2;
    // Skip the generated meta line, but only ours: a body's own "*…" line is text.
    if lines.get(body_start).is_some_and(|l| l.starts_with(&format!("*{}*", weekday_line(&e.created)))) { body_start += 1; }
    e.body = lines[body_start.min(end)..end].join("\n").trim().to_string();
    e
}

pub fn parse(text: &str) -> Vec<Entry> {
    let lines: Vec<&str> = text.lines().collect();
    let st = starts(&lines);
    st.iter().enumerate().map(|(n, &i)| parse_at(&lines, i, st.get(n + 1).copied().unwrap_or(lines.len()))).filter(|e| !e.id.is_empty()).collect()
}

/// The month file with entry `id` taken out and, if given, `put` added in date order. Everything
/// else, including what was written in Obsidian (above the first entry, entries the app can't
/// read), is kept as it was. None when nothing is left, so the file can go.
fn splice(text: &str, key: &str, id: &str, put: Option<&Entry>) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();
    let st = starts(&lines);
    let head = lines[..st.first().copied().unwrap_or(lines.len())].join("\n").trim_end().to_string();
    let head = if head.trim().is_empty() { month_heading(key) } else { head };
    let mut chunks: Vec<(String, String)> = Vec::new();
    for (n, &i) in st.iter().enumerate() {
        let end = st.get(n + 1).copied().unwrap_or(lines.len());
        let e = parse_at(&lines, i, end);
        if id.is_empty() || e.id != id { chunks.push((e.created, lines[i..end].join("\n").trim_end().to_string())); }
    }
    if let Some(e) = put {
        let at = chunks.iter().position(|(c, _)| *c > e.created).unwrap_or(chunks.len());
        chunks.insert(at, (e.created.clone(), render_entry(e).trim_end().to_string()));
    }
    if chunks.is_empty() && head == month_heading(key) { return None; }
    let mut s = format!("{head}\n\n");
    for (_, c) in chunks { s.push_str(&c); s.push_str("\n\n"); }
    Some(s)
}

fn month_files(dir: &Path) -> Vec<(String, std::path::PathBuf)> {
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for f in rd.flatten() {
            let p = f.path();
            if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                if p.extension().is_some_and(|e| e == "md") && stem.len() == 7 && month_key(stem).is_some() {
                    v.push((stem.to_string(), p.clone()));
                }
            }
        }
    }
    v.sort();
    v
}

pub fn list(dir: &Path) -> Result<Vec<Entry>, String> {
    let mut all = Vec::new();
    for (_, p) in month_files(dir) {
        let text = std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))?;
        all.extend(parse(&text));
    }
    all.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(all)
}

fn read_month(dir: &Path, key: &str) -> Result<String, String> {
    let p = dir.join(format!("{key}.md"));
    if !p.exists() { return Ok(String::new()); }
    std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))
}

fn write_month(dir: &Path, key: &str, text: Option<String>) -> Result<(), String> {
    let p = dir.join(format!("{key}.md"));
    match text {
        Some(t) => write_text_atomic(&p, &t),
        None if p.exists() => std::fs::remove_file(&p).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

pub fn save(dir: &Path, entry: &Entry) -> Result<(), String> {
    if entry.id.is_empty() { return Err("entry has no id".into()); }
    let key = month_key(&entry.created).ok_or("entry has no valid date")?.to_string();
    write_month(dir, &key, splice(&read_month(dir, &key)?, &key, &entry.id, Some(entry)))?;
    // Only once it is safely written, out of whichever month held it before (its date may have changed).
    for (k, _) in month_files(dir).into_iter().filter(|(k, _)| *k != key) {
        let text = read_month(dir, &k)?;
        if parse(&text).iter().any(|e| e.id == entry.id) { write_month(dir, &k, splice(&text, &k, &entry.id, None))?; }
    }
    Ok(())
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    if id.is_empty() { return Ok(()); }
    for (k, _) in month_files(dir) {
        let text = read_month(dir, &k)?;
        if parse(&text).iter().any(|e| e.id == id) { write_month(dir, &k, splice(&text, &k, id, None))?; }
    }
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
        let text = render_month("2026-09", &[e.clone()]);
        assert!(text.starts_with("# September 2026\n"));
        assert!(text.contains("*Wednesday 23 September 2026 · 07:02* · John 3:1-8, John 3:16 · #new-birth"));
        assert_eq!(parse(&text), vec![e]);
    }

    #[test]
    fn quotes_and_dashes_survive() {
        let mut e = sample();
        e.title = "A \"quoted\" -- title".into();
        e.tags = vec!["a--b".into()];
        let text = render_month("2026-09", &[e.clone()]);
        assert!(!text.lines().nth(3).unwrap().contains("a--b\""), "comment must not contain --");
        assert_eq!(parse(&text)[0].tags, vec!["a--b".to_string()]);
    }

    #[test]
    fn save_moves_between_months() {
        let dir = std::env::temp_dir().join(format!("tes-journal-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut e = sample();
        save(&dir, &e).unwrap();
        e.created = "2026-10-01T06:00".into();
        save(&dir, &e).unwrap();
        assert!(!dir.join("2026-09.md").exists());
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
        let text = format!("# September 2026\n\nA note of my own.\n\n{}{damaged}\n\n{}", render_entry(&other), render_entry(&e).replace("*Wednesday 23 September 2026 · 07:02* · John 3:1-8, John 3:16 · #new-birth", "*emphasis* line"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("2026-09.md"), &text).unwrap();
        // Its meta line was deleted in Obsidian: the body's own "*…*" line is not taken for it.
        assert!(parse(&text)[1].body.starts_with("*emphasis* line"));
        e.body = "Rewritten.".into();
        save(&dir, &e).unwrap();
        let after = std::fs::read_to_string(dir.join("2026-09.md")).unwrap();
        assert!(after.starts_with("# September 2026\n\nA note of my own.\n\n"));
        assert!(after.contains(damaged));
        assert!(after.contains("Rewritten.") && !after.contains("*emphasis* line"));
        assert_eq!(list(&dir).unwrap().len(), 2);
        // Moving and deleting both entries leaves the file, since it still holds the user's text.
        e.created = "2026-10-01T06:00".into();
        save(&dir, &e).unwrap();
        delete(&dir, &other.id).unwrap();
        let after = std::fs::read_to_string(dir.join("2026-09.md")).unwrap();
        assert!(after.contains("A note of my own.") && after.contains(damaged));
        assert_eq!(list(&dir).unwrap(), vec![e]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
