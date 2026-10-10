// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! A reference book written out as plain files, for Ask to search and read on demand instead of
//! carrying the whole book in its prompt: `index.txt`, one `NN Title.txt` per chapter with
//! paragraphs on their own lines, and each chart as `NN-imgK.png` where the text says
//! `[Chart: NN-imgK.png]`.

use crate::content;
use crate::library::{Kind, Library};
use crate::search::plain;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Bump when the layout of the files changes, so old exports are redone.
const VERSION: &str = "1";

#[derive(Serialize)]
pub struct Export {
    pub dir: String,
    /// The chapter files, in the book's order (the same order as `reference_titles`).
    pub files: Vec<String>,
}

pub fn export(lib: &Library, root: &Path, module: &str, kind: Kind) -> Result<Export, String> {
    let devotional = kind == Kind::Devotional;
    let dir = root.join(if devotional { format!("devotional-{}", sanitize(module, 80)) } else { sanitize(module, 80) });
    let titles = if devotional { content::devotion_titles(lib, module)? } else { content::reference_titles(lib, module)? };
    let files: Vec<String> = titles.iter().enumerate().map(|(i, t)| format!("{:02} {}.txt", i + 1, sanitize(t, 60))).collect();
    let chapter = if devotional { "Days" } else { "Chapters" };
    let lock = crate::store::dir_lock(&dir);
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    // The module file's size and date too, so a book e-Sword has updated is exported again.
    let (len, mtime) = crate::store::file_stamp(&lib.module(kind, module)?.path);
    let stamp = format!("{VERSION} {len} {}", mtime.as_secs());
    if std::fs::read_to_string(dir.join(".complete")).ok() == Some(stamp.clone()) {
        return Ok(Export { dir: dir.to_string_lossy().into(), files });
    }
    let book: Vec<(String, String)> = if devotional {
        titles.iter().map(|t| Ok((t.clone(), content::devotion(lib, module, t)?.unwrap_or_default()))).collect::<Result<_, String>>()?
    } else {
        lib.with(Kind::Reference, module, |c| {
            let mut st = c.prepare("SELECT Chapter, Content FROM Reference ORDER BY rowid")?;
            let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default())))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })?
    };
    // Written aside and swapped in whole, .complete last, so it only ever marks a whole export.
    crate::store::replace_dir(&dir, |tmp| {
        let mut index = format!("{chapter} of this book, one file each. Charts are PNG files named in the text as [Chart: …].\n\n");
        for (i, (title, html)) in book.iter().enumerate() {
            let (text, images) = to_text(html, i + 1);
            for (name, bytes) in images {
                std::fs::write(tmp.join(name), bytes).map_err(|e| e.to_string())?;
            }
            let file = &files[i];
            std::fs::write(tmp.join(file), format!("{title}\n\n{text}\n")).map_err(|e| e.to_string())?;
            index.push_str(&format!("{file}  ({} words)\n", text.split_whitespace().count()));
        }
        std::fs::write(tmp.join("index.txt"), index).map_err(|e| e.to_string())?;
        std::fs::write(tmp.join(".complete"), &stamp).map_err(|e| e.to_string())
    })?;
    Ok(Export { dir: dir.to_string_lossy().into(), files })
}

/// Paragraphs on their own lines; images taken out and replaced by a pointer to their file.
fn to_text(html: &str, chapter: usize) -> (String, Vec<(String, Vec<u8>)>) {
    const PARA: char = '\u{1}';
    let mut images = Vec::new();
    let mut s = String::with_capacity(html.len());
    let mut rest = html;
    while let Some(at) = rest.find("<img") {
        s.push_str(&rest[..at]);
        let end = rest[at..].find('>').map(|e| at + e + 1).unwrap_or(rest.len());
        let tag = &rest[at..end];
        if let Some((ext, data)) = data_uri(tag) {
            if let Some(bytes) = base64(data) {
                let name = format!("{chapter:02}-img{}.{ext}", images.len() + 1);
                s.push_str(&format!("{PARA}[Chart: {name}]{PARA}"));
                images.push((name, bytes));
            }
        }
        rest = &rest[end..];
    }
    s.push_str(rest);
    (paragraphs(&s), images)
}

/// Plain text with each paragraph (or line break, heading, list item, table row) on its own
/// line, blank lines between, so it can be searched and read a paragraph at a time.
pub fn paragraphs(html: &str) -> String {
    const PARA: char = '\u{1}';
    let mut s = html.to_string();
    for pat in ["</p>", "</P>", "<br>", "<br/>", "<br />", "<BR>", "</tr>", "</h1>", "</h2>", "</h3>", "</li>"] {
        s = s.replace(pat, &format!("{pat}{PARA}"));
    }
    let text = plain(&s);
    let paras: Vec<String> =
        text.split(PARA).map(|p| p.split_whitespace().collect::<Vec<_>>().join(" ")).filter(|p| !p.is_empty()).collect();
    paras.join("\n\n")
}

fn data_uri(tag: &str) -> Option<(&str, &str)> {
    let start = tag.find("data:image/")? + "data:image/".len();
    let semi = tag[start..].find(";base64,")? + start;
    let ext = match &tag[start..semi] {
        "jpeg" | "jpg" => "jpg",
        "gif" => "gif",
        "bmp" => "bmp",
        _ => "png",
    };
    let data = &tag[semi + 8..];
    let end = data.find(['"', '\'']).unwrap_or(data.len());
    Some((ext, &data[..end]))
}

fn base64(s: &str) -> Option<Vec<u8>> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        } as u32)
    };
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0);
    for &c in s.as_bytes() {
        if c == b'=' {
            break;
        }
        if c.is_ascii_whitespace() {
            continue;
        }
        acc = (acc << 6) | val(c)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/// A title as a file name: no path separators or control characters, not too long.
fn sanitize(s: &str, max: usize) -> String {
    crate::store::file_name(s, max, " -_',.()&")
}

pub fn root(data: &Path) -> PathBuf {
    data.join("books")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_base64() {
        assert_eq!(base64("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(base64("aGk").unwrap(), b"hi");
    }

    #[test]
    fn text_keeps_paragraphs_and_points_at_images() {
        let (t, imgs) = to_text("<p>One <b>two</b></p><p><img src=\"data:image/png;base64,aGk=\"></p><p>Three</p>", 4);
        assert_eq!(t, "One two\n\n[Chart: 04-img1.png]\n\nThree");
        assert_eq!(imgs, vec![("04-img1.png".to_string(), b"hi".to_vec())]);
    }

    #[test]
    fn sanitizes_titles() {
        assert_eq!(sanitize("The Ages/Dispensations: 1", 60), "The Ages Dispensations 1");
        assert_eq!(sanitize("///", 60), "untitled");
    }
}
