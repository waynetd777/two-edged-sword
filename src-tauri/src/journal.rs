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

pub fn render_month(key: &str, entries: &[Entry]) -> String {
    let (y, m) = (&key[0..4], key[5..7].parse::<usize>().unwrap_or(1));
    let mut s = format!("# {} {}\n\n", MONTHS[m.saturating_sub(1).min(11)], y);
    let mut sorted: Vec<&Entry> = entries.iter().collect();
    sorted.sort_by(|a, b| a.created.cmp(&b.created));
    for e in sorted { s.push_str(&render_entry(e)); }
    s
}

pub fn parse(text: &str) -> Vec<Entry> {
    let lines: Vec<&str> = text.lines().collect();
    // An entry starts at a "## " heading whose next line is our comment.
    let starts: Vec<usize> = (0..lines.len()).filter(|&i| lines[i].starts_with("## ") && lines.get(i + 1).is_some_and(|l| l.trim_start().starts_with("<!-- tes "))).collect();
    let mut out = Vec::new();
    for (n, &i) in starts.iter().enumerate() {
        let end = starts.get(n + 1).copied().unwrap_or(lines.len());
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
        // Skip the generated meta line.
        if lines.get(body_start).is_some_and(|l| l.starts_with('*')) { body_start += 1; }
        e.body = lines[body_start.min(end)..end].join("\n").trim().to_string();
        if !e.id.is_empty() { out.push(e); }
    }
    out
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

fn rewrite(dir: &Path, key: &str, entries: &[Entry]) -> Result<(), String> {
    let p = dir.join(format!("{key}.md"));
    if entries.is_empty() {
        if p.exists() { std::fs::remove_file(&p).map_err(|e| e.to_string())?; }
        return Ok(());
    }
    write_text_atomic(&p, &render_month(key, entries))
}

pub fn save(dir: &Path, entry: &Entry) -> Result<(), String> {
    let key = month_key(&entry.created).ok_or("entry has no valid date")?.to_string();
    // Take it out of whichever month file holds it now (its date may have changed).
    for (k, p) in month_files(dir) {
        let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
        let entries = parse(&text);
        if k != key && entries.iter().any(|e| e.id == entry.id) {
            let rest: Vec<Entry> = entries.into_iter().filter(|e| e.id != entry.id).collect();
            rewrite(dir, &k, &rest)?;
        }
    }
    let p = dir.join(format!("{key}.md"));
    let mut entries = if p.exists() { parse(&std::fs::read_to_string(&p).map_err(|e| e.to_string())?) } else { vec![] };
    match entries.iter_mut().find(|e| e.id == entry.id) {
        Some(e) => *e = entry.clone(),
        None => entries.push(entry.clone()),
    }
    rewrite(dir, &key, &entries)
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    for (k, p) in month_files(dir) {
        let entries = parse(&std::fs::read_to_string(&p).map_err(|e| e.to_string())?);
        if entries.iter().any(|e| e.id == id) {
            let rest: Vec<Entry> = entries.into_iter().filter(|e| e.id != id).collect();
            rewrite(dir, &k, &rest)?;
        }
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
}
