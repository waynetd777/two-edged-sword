// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The library: every module is a SQLite file in e-Sword X's formats, opened read-only and
//! immutable so nothing we do can change it or take a lock e-Sword would notice. Modules come
//! from three folders (`Source`), and the first to have a module wins, but for a module the user
//! has chosen e-Sword's copy of; a folder that isn't there is skipped.

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Bible,
    Commentary,
    Dictionary,
    Lexicon,
    Reference,
    Devotional,
}

impl Kind {
    fn from_ext(ext: &str) -> Option<Kind> {
        match ext {
            "bbli" => Some(Kind::Bible),
            "cmti" => Some(Kind::Commentary),
            "dcti" => Some(Kind::Dictionary),
            "lexi" => Some(Kind::Lexicon),
            "refi" => Some(Kind::Reference),
            "devi" => Some(Kind::Devotional),
            _ => None,
        }
    }

    /// The kind as the frontend names it ("bible"), for a module's key.
    fn name(self) -> &'static str {
        match self {
            Kind::Bible => "bible",
            Kind::Commentary => "commentary",
            Kind::Dictionary => "dictionary",
            Kind::Lexicon => "lexicon",
            Kind::Reference => "reference",
            Kind::Devotional => "devotional",
        }
    }
}

/// A module's key in Settings › eswordCopies: "commentary:wesley".
pub fn key(kind: Kind, id: &str) -> String {
    format!("{}:{id}", kind.name())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfo {
    /// The file name without its extension ("kjv+"), unique within a kind.
    pub id: String,
    pub kind: Kind,
    pub title: String,
    pub abbrev: String,
    /// e-Sword's own description, HTML.
    pub info: String,
    /// Bibles only: the text carries Strong's numbers (`<num>G25</num>`, or LXX+'s `<tvm>25[N-NSM]</tvm>`).
    pub strongs: bool,
    /// Bibles only: the text reads right to left (Hebrew, Arabic, …).
    pub rtl: bool,
    /// Bibles: what it has beyond plain text, for the library ("Strong's numbers", "Glosses", …).
    /// Reference books: "Maps" for a book of maps or timelines.
    pub features: Vec<&'static str>,
    /// The file's size in bytes.
    pub size: u64,
    /// Which folder it was read from.
    pub source: Source,
    /// Every folder that has it, in reading order: two when e-Sword's library has one of the app's
    /// modules (the user chooses which is read).
    pub copies: Vec<Source>,
    #[serde(skip)]
    pub path: PathBuf,
}

/// Where a module was found, in the order the folders are read.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// The app's own modules folder: what `tools/` builds, and what the user copies in.
    App,
    /// e-Sword X's library, when e-Sword is installed and reading it is on.
    Esword,
    /// The modules inside the app bundle, so it works with nothing installed.
    Bundled,
}

pub struct Library {
    /// The folders read, in order, whether or not each exists.
    pub dirs: Vec<(Source, PathBuf)>,
    pub modules: Vec<ModuleInfo>,
    /// Idle connections per module. A query takes one out (or opens another) and puts it back,
    /// so a long export or index build on one module never holds up reading another, or the same one.
    conns: Mutex<HashMap<String, Vec<Connection>>>,
}

/// Where e-Sword X keeps its modules.
pub fn esword_dir() -> PathBuf {
    crate::store::home().join("Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
}

/// The app's own modules folder.
pub fn app_dir() -> PathBuf {
    crate::store::data_dir().join("Modules")
}

/// The modules in the app bundle (Contents/Resources/modules); in a debug build, the ones
/// `make core` builds into src-tauri/modules.
pub fn bundled_dir() -> PathBuf {
    crate::store::bundled("modules")
}

/// For tests against the modules on this Mac: every folder, if one of them has `file`.
#[cfg(test)]
pub fn local(file: &str) -> Option<Library> {
    let dirs = dirs(true);
    dirs.iter().any(|(_, d)| d.join(file).is_file()).then(|| Library::scan(dirs))
}

/// The folders to read, in order: the app's own modules before e-Sword's copies of them.
pub fn dirs(esword: bool) -> Vec<(Source, PathBuf)> {
    let mut d = vec![(Source::App, app_dir()), (Source::Bundled, bundled_dir())];
    if esword {
        d.push((Source::Esword, esword_dir()));
    }
    d
}

pub fn open_readonly(path: &Path) -> rusqlite::Result<Connection> {
    // immutable=1: SQLite assumes nobody changes the file, so it never creates a journal or
    // takes a lock. e-Sword only ever reads its modules, so that holds.
    let uri = format!("file:{}?immutable=1", url_escape(&path.to_string_lossy()));
    Connection::open_with_flags(uri, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI | OpenFlags::SQLITE_OPEN_NO_MUTEX)
}

fn url_escape(p: &str) -> String {
    let mut out = String::with_capacity(p.len());
    for ch in p.chars() {
        match ch {
            ' ' => out.push_str("%20"),
            '?' => out.push_str("%3f"),
            '#' => out.push_str("%23"),
            '%' => out.push_str("%25"),
            '+' => out.push_str("%2b"),
            _ => out.push(ch),
        }
    }
    out
}

impl Library {
    #[cfg(test)]
    pub fn scan(dirs: Vec<(Source, PathBuf)>) -> Library {
        Library::scan_choosing(dirs, &HashSet::new())
    }

    /// As `scan`, but a module whose key (`key`) is in `esword_copies` is read from e-Sword's
    /// library when that has it too.
    pub fn scan_choosing(dirs: Vec<(Source, PathBuf)>, esword_copies: &HashSet<String>) -> Library {
        let mut modules: Vec<ModuleInfo> = Vec::new();
        for (source, dir) in &dirs {
            // A folder that isn't there (no e-Sword, nothing built yet) has nothing to add.
            let Ok(rd) = std::fs::read_dir(dir) else { continue };
            let mut entries: Vec<_> = rd.flatten().map(|e| e.path()).collect();
            entries.sort();
            for path in entries {
                let (Some(stem), Some(ext)) = (path.file_stem().and_then(|s| s.to_str()), path.extension().and_then(|s| s.to_str())) else {
                    continue;
                };
                let Some(kind) = Kind::from_ext(&ext.to_ascii_lowercase()) else { continue };
                let had = modules.iter().position(|m| m.kind == kind && m.id == stem);
                if let Some(i) = had {
                    modules[i].copies.push(*source);
                    if !(*source == Source::Esword && esword_copies.contains(&key(kind, stem))) {
                        continue;
                    }
                }
                match read_details(&path, kind) {
                    Ok((title, abbrev, info, strongs, rtl, features)) => {
                        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                        let copies = had.map(|i| modules[i].copies.clone()).unwrap_or_else(|| vec![*source]);
                        let m = ModuleInfo {
                            id: stem.to_string(),
                            kind,
                            title,
                            abbrev,
                            info,
                            strongs,
                            rtl,
                            features,
                            size,
                            source: *source,
                            copies,
                            path,
                        };
                        match had {
                            Some(i) => modules[i] = m,
                            None => modules.push(m),
                        }
                    }
                    Err(err) => eprintln!("skipping {}: {err}", path.display()),
                }
            }
        }
        modules.sort_by_key(|m| m.title.to_lowercase());
        Library { dirs, modules, conns: Mutex::new(HashMap::new()) }
    }

    pub fn module(&self, kind: Kind, id: &str) -> Result<&ModuleInfo, String> {
        self.modules.iter().find(|m| m.kind == kind && m.id == id).ok_or_else(|| format!("no {kind:?} module called {id}"))
    }

    pub fn of_kind(&self, kind: Kind) -> impl Iterator<Item = &ModuleInfo> {
        self.modules.iter().filter(move |m| m.kind == kind)
    }

    /// Runs `f` on one of the module's cached connections, without holding any lock meanwhile.
    pub fn with<T>(&self, kind: Kind, id: &str, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
        let m = self.module(kind, id)?;
        let key = format!("{kind:?}/{id}");
        let idle = self.conns.lock().map_err(|e| e.to_string())?.get_mut(&key).and_then(Vec::pop);
        let c = match idle {
            Some(c) => c,
            None => open_readonly(&m.path).map_err(|e| e.to_string())?,
        };
        let r = f(&c).map_err(|e| e.to_string());
        if let Ok(mut conns) = self.conns.lock() {
            let pool = conns.entry(key).or_default();
            if pool.len() < 4 {
                pool.push(c);
            }
        }
        r
    }
}

/// A book of maps by its title ("English Standard Version Maps", "Smith Bible Atlas"), for one e-Sword hasn't starred.
fn is_maps_title(title: &str) -> bool {
    let t = title.to_lowercase();
    t.split(|c: char| !c.is_alphanumeric()).any(|w| matches!(w, "map" | "maps" | "atlas"))
}

/// (title, abbreviation, information, has Strong's numbers, right to left, features).
type Details = (String, String, String, bool, bool, Vec<&'static str>);

fn read_details(path: &Path, kind: Kind) -> rusqlite::Result<Details> {
    let c = open_readonly(path)?;
    let (title, abbrev, info): (String, String, String) =
        c.query_row("SELECT Title, Abbreviation, Information FROM Details LIMIT 1", [], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        })?;
    // e-Sword's graphical books are titled "* Classic Bible Maps" so they sort first there.
    let starred = title.trim_start().starts_with('*');
    let title = title.trim_start_matches(|c: char| c == '*' || c.is_whitespace()).to_string();
    let strongs = kind == Kind::Bible
        && c.query_row("SELECT 1 FROM Bible WHERE ((Book = 43 AND Chapter = 3) OR (Book = 1 AND Chapter = 1)) AND (Scripture LIKE '%<num>%' OR Scripture GLOB '*<tvm>[0-9]*') LIMIT 1", [], |_| Ok(())).optional()?.is_some();
    // e-Sword's RightToLeft flag where the module sets it; otherwise the script of its first verse.
    let rtl = kind == Kind::Bible
        && (c.query_row("SELECT RightToLeft FROM Details LIMIT 1", [], |r| r.get::<_, Option<bool>>(0)).ok().flatten().unwrap_or(false)
            || c.query_row("SELECT Scripture FROM Bible ORDER BY Book, Chapter, Verse LIMIT 1", [], |r| r.get::<_, Option<String>>(0))
                .optional()?
                .flatten()
                .is_some_and(|t| is_rtl_text(&t)));
    let features = match kind {
        Kind::Bible => bible_features(&c, strongs)?,
        Kind::Reference if starred || is_maps_title(&title) => vec!["Maps"],
        _ => Vec::new(),
    };
    Ok((title, abbrev, info, strongs, rtl, features))
}

/// What a Bible has beyond plain text, judged from a few chapters (Gen 1, Psa 23, Mat 5, Joh 3) and which books it has.
fn bible_features(c: &Connection, strongs: bool) -> rusqlite::Result<Vec<&'static str>> {
    let sample: String = c.query_row(
        "SELECT group_concat(Scripture, ' ') FROM Bible WHERE (Book = 1 AND Chapter = 1) OR (Book = 19 AND Chapter = 23) OR (Book = 40 AND Chapter = 5) OR (Book = 43 AND Chapter = 3)",
        [], |r| r.get::<_, Option<String>>(0),
    )?.unwrap_or_default().to_ascii_lowercase();
    let has = |sql: &str| c.query_row(sql, [], |_| Ok(())).optional().map(|r| r.is_some());
    let notes = sample.contains("<not>")
        || has("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Notes'")? && has("SELECT 1 FROM Notes LIMIT 1")?;
    let (ot, nt) =
        (has("SELECT 1 FROM Bible WHERE Book BETWEEN 1 AND 39 LIMIT 1")?, has("SELECT 1 FROM Bible WHERE Book BETWEEN 40 AND 66 LIMIT 1")?);
    let mut f = Vec::new();
    if strongs {
        f.push("Strong's numbers");
    }
    if sample.contains("<tvm>") {
        f.push("Grammar");
    }
    if sample.contains("<gra>") {
        f.push("Glosses");
    }
    if notes {
        f.push("Notes");
    }
    if sample.contains("<red>") {
        f.push("Words of Jesus in red");
    }
    if has("SELECT 1 FROM Bible WHERE Book > 66 LIMIT 1")? {
        f.push("Apocrypha");
    }
    if ot && !nt {
        f.push("Old Testament only");
    }
    if nt && !ot {
        f.push("New Testament only");
    }
    Ok(f)
}

/// Whether most of the letters outside markup are in a right-to-left script (Hebrew, Syriac, Arabic, …).
fn is_rtl_text(html: &str) -> bool {
    let (mut rtl, mut ltr, mut tag) = (0, 0, false);
    for ch in html.chars() {
        match ch {
            '<' => tag = true,
            '>' => tag = false,
            _ if tag || !ch.is_alphabetic() => {}
            '\u{0590}'..='\u{08FF}' | '\u{FB1D}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}' => rtl += 1,
            _ => ltr += 1,
        }
    }
    rtl > ltr
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_uri_characters() {
        assert_eq!(url_escape("/a b/kjv+.bbli"), "/a%20b/kjv%2b.bbli");
        assert_eq!(url_escape("/x?y#z%"), "/x%3fy%23z%25");
    }

    #[test]
    fn maps_titles() {
        assert!(is_maps_title("English Standard Version Maps"));
        assert!(is_maps_title("Smith Bible Atlas"));
        assert!(!is_maps_title("Dispensational Truth Charts (Clarence Larkin)"));
        assert!(!is_maps_title("Mapping the Mind"));
    }

    #[test]
    fn right_to_left_text() {
        assert!(is_rtl_text("בְּרֵאשִׁית<num>H7225</num> בָּרָא"));
        assert!(!is_rtl_text("In the beginning<num>H7225</num>"));
        assert!(!is_rtl_text("Βίβλος γενέσεως"));
    }

    #[test]
    fn chooses_which_copy() {
        let root = std::env::temp_dir().join(format!("tes-copies-{}", std::process::id()));
        let (app, esword) = (root.join("app"), root.join("esword"));
        for (dir, title) in [(&app, "Ours"), (&esword, "e-Sword")] {
            std::fs::create_dir_all(dir).unwrap();
            let c = Connection::open(dir.join("wesley.cmti")).unwrap();
            c.execute_batch(&format!(
                "CREATE TABLE Details (Title, Abbreviation, Information, Version); INSERT INTO Details VALUES ('{title}', 'W', '', 1);"
            ))
            .unwrap();
        }
        let dirs = || vec![(Source::Bundled, app.clone()), (Source::Esword, esword.clone())];
        let ours = Library::scan(dirs());
        assert_eq!((ours.modules.len(), ours.modules[0].title.as_str()), (1, "Ours"));
        assert_eq!(ours.modules[0].copies, vec![Source::Bundled, Source::Esword]);
        let theirs = Library::scan_choosing(dirs(), &HashSet::from([key(Kind::Commentary, "wesley")]));
        assert_eq!((theirs.modules.len(), theirs.modules[0].title.as_str(), theirs.modules[0].source), (1, "e-Sword", Source::Esword));
        assert_eq!(theirs.modules[0].copies, vec![Source::Bundled, Source::Esword]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn kinds_from_extensions() {
        assert_eq!(Kind::from_ext("bbli"), Some(Kind::Bible));
        assert_eq!(Kind::from_ext("refi"), Some(Kind::Reference));
        assert_eq!(Kind::from_ext("devi"), Some(Kind::Devotional));
        assert_eq!(Kind::from_ext("dzip"), None);
    }
}
