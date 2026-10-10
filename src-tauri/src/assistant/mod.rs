// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Ask: runs an AI coding CLI already installed and signed in on this Mac — Claude Code, Codex,
//! Antigravity or GitHub Copilot — non-interactively, and streams its answer back to the window as events. It has no
//! tools, except read-only search in a folder: a reference book's exported files (books.rs) or
//! the library's material on a Bible passage, or the user's journal (study.rs); and in every chat,
//! the app's user guide (help.rs). The model id says which CLI answers.

mod antigravity;
mod claude;
mod codex;
mod copilot;

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const SYSTEM: &str = "You are a careful Bible study assistant inside a personal study app. \
The user's message includes the passage they are reading and, sometimes, excerpts from classic commentaries in their library. \
Answer in plain, warm, well-structured prose. Keep answers focused and reasonably short unless asked for depth. \
Cite Scripture with short references such as John 3:16 or Num 21:8-9 so the app can link them. \
When you mention a Greek or Hebrew word, give the word, a transliteration and its Strong's number (for example G25) if you know it. \
Be honest about uncertainty and where interpreters differ. Do not invent quotations from the commentaries.";

/// Added in a book chat; each CLI appends how to search with its own tools.
const BOOK: &str = "The user is reading a reference book from their library. \
Your working directory holds the whole book as plain text: index.txt lists the chapters, one file per chapter, and its charts are PNG files named in the text as [Chart: …]. \
The message includes the chapter being read, or the part of it being asked about. \
Read a chart's PNG only when the question is about it or turns on it. \
When you draw on the book, say which chapter it comes from.";

/// Added in a passage chat.
const STUDY: &str = "The user's library has been written out for this question, to use only if the question needs it: \
if it asks what commentators, lexicons or dictionaries say, or would be answered better from them, search it; if not (a quick factual question, a follow-up on your own answer), answer directly without opening any files. \
Your working directory holds its material on the passage; index.txt lists the files: the passage in each of their Bibles, \
every commentary's notes that touch it, lexicon entries for its Strong's numbers, and their dictionaries, whole, one file each, articles headed == Topic ==. \
When the question turns on what commentators, lexicons or dictionaries say, answer from these files rather than from memory, \
and name the source for each point (for example: Matthew Henry reads this as …). Compare commentators when they differ. \
If the library has nothing on a point, say so before adding what you know. \
If index.txt lists journal/, those are the user's own journal entries (each file says which verses it is on): their prayers, notes and sermons. Read them when the question is personal, asks what they have written or preached, or would be answered better in the light of it, \
and speak of them as theirs (for example: in your sermon of 11 April 1999 you said …). \
If index.txt lists references/, those are passages in their reference books (such as the Talmud) that cite the verses; use them when the question asks what those books say, and cite the place (for example: Sanhedrin 98b says …). If index.txt lists differences/, those are reviewed places where a translation's meaning differs from the KJV. When the question is about how a translation differs, what it omits or changes, answer from them: the passage's file first, the \"all\" file for questions beyond the passage. Say when a translation or book has not been compared rather than guessing. \
Work quickly: read digest.txt first, it has every commentary's notes on the passage, shortened, in one file, and is enough for most questions. \
Open a full commentary file only for more depth on it, and when you need several files, open them all in the same step rather than one after another.";

/// Added in a journal chat.
const JOURNAL: &str = "The user is asking about their own journal: their prayers, study notes and sermons. \
Your working directory holds the entries the question is about, one file each; index.txt lists them with their dates, the verses each is on and their tags. \
The message may include the entry they have open. \
Search the entries (by word, verse, tag or date) and read the ones that bear on the question before answering, opening several in the same step rather than one after another. \
Speak of them as theirs and say which entry each point comes from, by title and date (for example: in “Grace at work”, 3 March 2026, you wrote …). \
Where their thinking has changed over time, say how. If the journal has nothing on a point, say so.";

/// Added in every chat: the app's own user guide, which help::write_guides puts in the working directory.
const HELP: &str = "The working directory also has help/, this app's user guide (the app is Two-edged Sword): help/index.txt lists its files and their sections. \
When the question is about the app itself (how to do something in it, what a feature or setting does, where to find it), search help/ and answer from it, \
naming the screens, buttons, menus and keys as it does. If the guide doesn't describe something, say so rather than guessing how the app works.";

/// A chat with no folder of its own (Compare, Word Study, search results) can still search the guide.
const APP: &str = "The message has what the user is looking at; answer from it and what you know.";

/// Where an answer may search: nowhere, a book, the library's material on a passage, or the journal.
pub enum Folder {
    None,
    Book(PathBuf),
    Study(PathBuf),
    Journal(PathBuf),
}

impl Folder {
    fn dir(&self) -> Option<&PathBuf> {
        match self {
            Folder::None => None,
            Folder::Book(d) | Folder::Study(d) | Folder::Journal(d) => Some(d),
        }
    }
    /// What to add to the system prompt; each CLI appends how to search with its own tools. Every
    /// chat has the guide to search, so every chat gets the read-only search tools.
    fn prompt(&self) -> String {
        let what = match self {
            Folder::None => APP,
            Folder::Book(_) => BOOK,
            Folder::Study(_) => STUDY,
            Folder::Journal(_) => JOURNAL,
        };
        format!("{what} {HELP}")
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Chunk {
    chat_id: String,
    text: String,
}

/// What it is doing while it searches, shown in place of "Thinking…": "Reading Matthew Henry's Commentary".
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Status {
    chat_id: String,
    text: String,
}

/// What the CLI is doing, from a tool it calls: reading a file, searching, or listing files.
const SEARCHING: &str = "Searching the library";
const LOOKING: &str = "Looking through the library";

fn reading(path: Option<&str>) -> Option<String> {
    path.and_then(stem).map(|f| format!("Reading {f}"))
}

/// A file the model opens, named as the user would: "Matthew Henry's Commentary on the Whole Bible".
fn stem(path: &str) -> Option<String> {
    if path == "help" || path.ends_with("/help") || path.contains("help/") {
        return Some("the help".into());
    }
    let name = path.rsplit('/').next()?;
    let name = name.strip_suffix(".txt").unwrap_or(name);
    (!name.is_empty() && name != "index").then(|| name.to_string())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Done {
    chat_id: String,
    session_id: Option<String>,
    text: String,
    error: Option<String>,
}

/// The CLIs answering now, by chat id and process id. Each leads its own process group, so a
/// signal to the group also ends whatever it started (node, rg, a shell).
#[derive(Default)]
pub struct Running {
    children: Mutex<Vec<(String, u32)>>,
}

impl Running {
    fn remove(&self, pid: u32) {
        if let Ok(mut ch) = self.children.lock() {
            ch.retain(|(_, p)| *p != pid);
        }
    }
    /// On quit: nothing is left running once the app has gone.
    pub fn kill_all(&self) {
        if let Ok(ch) = self.children.lock() {
            for (_, pid) in ch.iter() {
                kill_group(*pid);
            }
        }
    }
}

fn kill_group(pid: u32) {
    // SAFETY: kill(2) takes no pointers; a negative pid addresses the process group.
    unsafe {
        libc::kill(-(pid as libc::pid_t), libc::SIGTERM);
    }
}

/// Starts the CLI in its own process group and registers it. Its stderr is read on a thread
/// from the start (a full pipe would stall it); join that for the text when it fails.
fn spawn(
    cmd: &mut Command,
    running: &Running,
    chat_id: &str,
    name: &str,
) -> Result<(Child, ChildStdout, std::thread::JoinHandle<String>), String> {
    use std::os::unix::process::CommandExt;
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).process_group(0);
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start {name}: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();
    let err = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(mut e) = stderr {
            let _ = std::io::Read::read_to_string(&mut e, &mut s);
        }
        s
    });
    if let Ok(mut ch) = running.children.lock() {
        ch.push((chat_id.to_string(), child.id()));
    }
    Ok((child, stdout, err))
}

/// Waits for the CLI to exit (no lock held, so Stop is never kept waiting) and unregisters it;
/// true if it succeeded.
fn finish(mut child: Child, running: &Running) -> bool {
    let ok = child.wait().is_ok_and(|s| s.success());
    running.remove(child.id());
    ok
}

/// An answer as it streams in: its text, sent to the window as it grows; the session to resume
/// it by; and the error, if it failed.
struct Answer {
    app: AppHandle,
    chat_id: String,
    text: String,
    session_id: Option<String>,
    error: Option<String>,
}

impl Answer {
    fn send(&self, t: &str) {
        let _ = self.app.emit("ask-chunk", Chunk { chat_id: self.chat_id.clone(), text: t.to_string() });
    }
    /// Text that follows on.
    fn push(&mut self, t: &str) {
        self.text.push_str(t);
        self.send(t);
    }
    /// A new block of text, written after a search: without a break it runs on from the text
    /// before it ("…notes on John 1:1.Across the commentaries…").
    fn new_block(&mut self) {
        if !self.text.is_empty() && !self.text.ends_with("\n\n") {
            let sep = if self.text.ends_with('\n') { "\n" } else { "\n\n" };
            self.push(sep);
        }
    }
    /// What it is doing, shown in place of "Thinking…".
    fn status(&self, text: Option<String>) {
        if let Some(text) = text {
            let _ = self.app.emit("ask-status", Status { chat_id: self.chat_id.clone(), text });
        }
    }
}

/// The CLI's lines read as JSON on a thread of their own, each handed to `on`, then ask-done sent.
/// `name` is the CLI as the user knows it. With `forgive`, an error only counts when no answer
/// came (Codex and Copilot also report trouble they recover from); and an answer that ends with
/// neither text nor an error says it stopped, with what the CLI said if it failed.
fn stream(
    app: AppHandle,
    running: Arc<Running>,
    chat_id: String,
    name: &'static str,
    forgive: bool,
    (child, stdout, stderr): (Child, ChildStdout, std::thread::JoinHandle<String>),
    mut on: impl FnMut(&mut Answer, serde_json::Value) + Send + 'static,
) {
    std::thread::spawn(move || {
        let mut a = Answer { app, chat_id, text: String::new(), session_id: None, error: None };
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            on(&mut a, v);
        }
        if forgive && !a.text.trim().is_empty() {
            a.error = None;
        }
        let ok = finish(child, &running);
        if a.error.is_none() && a.text.trim().is_empty() {
            let msg = stderr.join().unwrap_or_default();
            a.error = Some(if ok || msg.trim().is_empty() { format!("{name} stopped without answering") } else { msg.trim().to_string() });
        }
        let Answer { app, chat_id, text, session_id, error } = a;
        let _ = app.emit("ask-done", Done { chat_id, session_id, text, error });
    });
}

/// The CLI's path, or what to tell the user when it isn't there.
fn installed(bin: Option<PathBuf>, what: &str) -> Result<PathBuf, String> {
    bin.ok_or_else(|| format!("{what} isn't installed, or couldn't be found. Install it and sign in, then try again."))
}

#[derive(Serialize)]
pub struct Model {
    id: String,
    name: String,
}

#[derive(Serialize)]
pub struct Cli {
    path: Option<String>,
    version: Option<String>,
    /// Codex and Antigravity: the models the signed-in account offers. Claude's are fixed in the app.
    models: Vec<Model>,
}

#[derive(Serialize)]
pub struct CliStatus {
    claude: Cli,
    codex: Cli,
    antigravity: Cli,
    copilot: Cli,
}

/// How long asking a login shell, or a CLI its version or models, may take: a profile that hangs
/// mustn't hold Ask up for ever.
const ASK_SHELL: Duration = Duration::from_secs(10);

/// A GUI app does not get the login shell's PATH, so look where installers put `name`, then
/// fall back to asking a login shell. What is found is remembered (while it is still there), so
/// the shell isn't asked again on every question; what isn't is looked for again next time.
fn find(name: &str, extra: &[&str]) -> Option<PathBuf> {
    static FOUND: Mutex<Vec<(String, PathBuf)>> = Mutex::new(Vec::new());
    let known = FOUND.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(n, _)| n == name).map(|(_, p)| p.clone());
    if let Some(p) = known.filter(|p| p.is_file()) {
        return Some(p);
    }
    let found = look_for(name, extra)?;
    let mut f = FOUND.lock().unwrap_or_else(|e| e.into_inner());
    f.retain(|(n, _)| n != name);
    f.push((name.to_string(), found.clone()));
    Some(found)
}

fn look_for(name: &str, extra: &[&str]) -> Option<PathBuf> {
    let home = crate::store::home();
    let mut places = vec![home.join(".local/bin").join(name)];
    places.extend(extra.iter().map(|p| home.join(p)));
    places.extend([PathBuf::from("/opt/homebrew/bin").join(name), PathBuf::from("/usr/local/bin").join(name)]);
    if let Some(p) = places.into_iter().find(|p| p.is_file()) {
        return Some(p);
    }
    let out = crate::process::output_within(Command::new("/bin/zsh").args(["-lc", &format!("command -v {name}")]), ASK_SHELL).ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!s.is_empty() && PathBuf::from(&s).is_file()).then(|| PathBuf::from(s))
}

fn version(bin: &PathBuf) -> Option<String> {
    let out = crate::process::output_within(Command::new(bin).arg("--version"), ASK_SHELL).ok()?;
    // The first line only: Copilot adds "Run 'copilot update' to check for updates."
    String::from_utf8_lossy(&out.stdout).lines().map(str::trim).find(|l| !l.is_empty()).map(|l| l.trim_end_matches('.').to_string())
}

pub fn status() -> CliStatus {
    let cli = |bin: Option<PathBuf>, models: Vec<Model>| Cli {
        version: bin.as_ref().and_then(version),
        models: if bin.is_some() { models } else { Vec::new() },
        path: bin.map(|p| p.to_string_lossy().to_string()),
    };
    CliStatus {
        claude: cli(claude::find(), Vec::new()),
        codex: cli(codex::find(), codex::models()),
        antigravity: cli(antigravity::find(), antigravity::models()),
        copilot: cli(copilot::find(), copilot::models()),
    }
}

/// Outside a folder chat each CLI gets its own working folder under `data` (Claude Code files
/// its sessions by working directory, so Claude's stays "claude").
#[allow(clippy::too_many_arguments)]
pub fn ask(
    app: AppHandle,
    running: Arc<Running>,
    data: &std::path::Path,
    folder: Folder,
    chat_id: String,
    prompt: String,
    model: String,
    session: Option<String>,
) -> Result<(), String> {
    // "agy:…" is Antigravity (which offers Claude models too), "copilot:…" Copilot, "claude:…" (and the older pinned "claude-…") Claude Code, the rest Codex.
    let cli = if model.starts_with(antigravity::PREFIX) {
        "agy"
    } else if model.starts_with(copilot::PREFIX) {
        "copilot"
    } else if model.starts_with(claude::PREFIX) || model.starts_with("claude-") {
        "claude"
    } else {
        "codex"
    };
    let cwd = folder.dir().cloned().unwrap_or_else(|| data.join(cli));
    std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
    crate::help::write_guides(&cwd).map_err(|e| e.to_string())?;
    match cli {
        "agy" => antigravity::ask(app, running, cwd, chat_id, prompt, model, session, folder),
        "copilot" => copilot::ask(app, running, cwd, chat_id, prompt, model, session, folder),
        "claude" => claude::ask(app, running, cwd, chat_id, prompt, model, session, folder),
        _ => codex::ask(app, running, cwd, chat_id, prompt, model, session, folder),
    }
}

pub fn cancel(running: &Running, chat_id: &str) {
    if let Ok(ch) = running.children.lock() {
        for (_, pid) in ch.iter().filter(|(id, _)| id == chat_id) {
            kill_group(*pid);
        }
    }
}
