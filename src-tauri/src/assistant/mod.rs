//! Ask: runs an AI coding CLI already installed and signed in on this Mac — Claude Code, Codex,
//! Antigravity or GitHub Copilot — non-interactively, and streams its answer back to the window as events. It has no
//! tools, except read-only search in a folder: a reference book's exported files (books.rs) or
//! the library's material on a Bible passage, or the user's journal (study.rs). The model id says which CLI answers.

mod antigravity;
mod claude;
mod codex;
mod copilot;

use serde::Serialize;
use std::path::PathBuf;
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::Mutex;

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
Work quickly: read digest.txt first, it has every commentary's notes on the passage, shortened, in one file, and is enough for most questions. \
Open a full commentary file only for more depth on it, and when you need several files, open them all in the same step rather than one after another.";

/// Added in a journal chat.
const JOURNAL: &str = "The user is asking about their own journal: their prayers, study notes and sermons. \
Your working directory holds the entries the question is about, one file each; index.txt lists them with their dates, the verses each is on and their tags. \
The message may include the entry they have open. \
Search the entries (by word, verse, tag or date) and read the ones that bear on the question before answering, opening several in the same step rather than one after another. \
Speak of them as theirs and say which entry each point comes from, by title and date (for example: in “Grace at work”, 3 March 2026, you wrote …). \
Where their thinking has changed over time, say how. If the journal has nothing on a point, say so.";

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
    /// What to add to the system prompt; each CLI appends how to search with its own tools.
    fn prompt(&self) -> Option<String> {
        match self {
            Folder::None => None,
            Folder::Book(_) => Some(BOOK.to_string()),
            Folder::Study(_) => Some(STUDY.to_string()),
            Folder::Journal(_) => Some(JOURNAL.to_string()),
        }
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

fn emit_status(app: &tauri::AppHandle, chat_id: &str, text: String) {
    use tauri::Emitter;
    let _ = app.emit("ask-status", Status { chat_id: chat_id.to_string(), text });
}

/// A file the model opens, named as the user would: "Matthew Henry's Commentary on the Whole Bible".
fn stem(path: &str) -> Option<String> {
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
        if let Ok(mut ch) = self.children.lock() { ch.retain(|(_, p)| *p != pid); }
    }
    /// On quit: nothing is left running once the app has gone.
    pub fn kill_all(&self) {
        if let Ok(ch) = self.children.lock() {
            for (_, pid) in ch.iter() { kill_group(*pid); }
        }
    }
}

fn kill_group(pid: u32) {
    // SAFETY: kill(2) takes no pointers; a negative pid addresses the process group.
    unsafe { libc::kill(-(pid as libc::pid_t), libc::SIGTERM); }
}

/// Starts the CLI in its own process group and registers it. Its stderr is read on a thread
/// from the start (a full pipe would stall it); join that for the text when it fails.
fn spawn(cmd: &mut Command, running: &Running, chat_id: &str, name: &str) -> Result<(Child, ChildStdout, std::thread::JoinHandle<String>), String> {
    use std::os::unix::process::CommandExt;
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).process_group(0);
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start {name}: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();
    let err = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(mut e) = stderr { let _ = std::io::Read::read_to_string(&mut e, &mut s); }
        s
    });
    if let Ok(mut ch) = running.children.lock() { ch.push((chat_id.to_string(), child.id())); }
    Ok((child, stdout, err))
}

/// Waits for the CLI to exit (no lock held, so Stop is never kept waiting) and unregisters it;
/// true if it succeeded.
fn finish(mut child: Child, running: &Running) -> bool {
    let ok = child.wait().is_ok_and(|s| s.success());
    running.remove(child.id());
    ok
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

/// A GUI app does not get the login shell's PATH, so look where installers put `name`, then
/// fall back to asking a login shell.
fn find(name: &str, extra: &[&str]) -> Option<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut places: Vec<String> = vec![format!("{home}/.local/bin/{name}")];
    places.extend(extra.iter().map(|p| format!("{home}/{p}")));
    places.extend([format!("/opt/homebrew/bin/{name}"), format!("/usr/local/bin/{name}")]);
    for p in places {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    let out = Command::new("/bin/zsh").args(["-lc", &format!("command -v {name}")]).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!s.is_empty() && PathBuf::from(&s).is_file()).then(|| PathBuf::from(s))
}

fn version(bin: &PathBuf) -> Option<String> {
    let out = Command::new(bin).arg("--version").output().ok()?;
    // The first line only: Copilot adds "Run 'copilot update' to check for updates."
    String::from_utf8_lossy(&out.stdout).lines().map(str::trim).find(|l| !l.is_empty()).map(|l| l.trim_end_matches('.').to_string())
}

pub fn status() -> CliStatus {
    let cli = |bin: Option<PathBuf>, models: Vec<Model>| Cli {
        version: bin.as_ref().and_then(version),
        models: if bin.is_some() { models } else { Vec::new() },
        path: bin.map(|p| p.to_string_lossy().to_string()),
    };
    CliStatus { claude: cli(claude::find(), Vec::new()), codex: cli(codex::find(), codex::models()), antigravity: cli(antigravity::find(), antigravity::models()), copilot: cli(copilot::find(), copilot::models()) }
}

/// Outside a folder chat each CLI gets its own working folder under `data` (Claude Code files
/// its sessions by working directory, so Claude's stays "claude").
#[allow(clippy::too_many_arguments)]
pub fn ask(app: tauri::AppHandle, running: std::sync::Arc<Running>, data: &std::path::Path, folder: Folder, chat_id: String, prompt: String, model: String, session: Option<String>) -> Result<(), String> {
    // "agy:…" is Antigravity (which offers Claude models too), "copilot:…" Copilot, "claude…" Claude Code, the rest Codex.
    let cli = if model.starts_with(antigravity::PREFIX) { "agy" } else if model.starts_with(copilot::PREFIX) { "copilot" } else if model.starts_with("claude") { "claude" } else { "codex" };
    let cwd = folder.dir().cloned().unwrap_or_else(|| data.join(cli));
    std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
    match cli {
        "agy" => antigravity::ask(app, running, cwd, chat_id, prompt, model, session, folder),
        "copilot" => copilot::ask(app, running, cwd, chat_id, prompt, model, session, folder),
        "claude" => claude::ask(app, running, cwd, chat_id, prompt, model, session, folder),
        _ => codex::ask(app, running, cwd, chat_id, prompt, model, session, folder),
    }
}

pub fn cancel(running: &Running, chat_id: &str) {
    if let Ok(ch) = running.children.lock() {
        for (_, pid) in ch.iter().filter(|(id, _)| id == chat_id) { kill_group(*pid); }
    }
}
