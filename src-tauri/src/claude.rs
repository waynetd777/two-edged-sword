//! Ask Claude: runs the Claude Code CLI already installed and signed in on this Mac, in print
//! mode, and streams its answer back to the window as events. It has no tools, except in a chat
//! about a reference book, where it may search and read the book's exported files (see books.rs).

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// A GUI app does not get the login shell's PATH, so look where installers put `claude`,
/// then fall back to asking a login shell.
pub fn find() -> Option<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    for p in [format!("{home}/.local/bin/claude"), format!("{home}/.claude/local/claude"), "/opt/homebrew/bin/claude".into(), "/usr/local/bin/claude".into()] {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    let out = Command::new("/bin/zsh").args(["-lc", "command -v claude"]).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!s.is_empty() && PathBuf::from(&s).is_file()).then(|| PathBuf::from(s))
}

#[derive(Serialize)]
pub struct Status {
    pub path: Option<String>,
    pub version: Option<String>,
}

pub fn status() -> Status {
    let path = find();
    let version = path.as_ref().and_then(|p| Command::new(p).arg("--version").output().ok()).map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).filter(|s| !s.is_empty());
    Status { path: path.map(|p| p.to_string_lossy().to_string()), version }
}

const SYSTEM: &str = "You are a careful Bible study assistant inside a personal study app. \
The user's message includes the passage they are reading and, sometimes, excerpts from classic commentaries in their library. \
Answer in plain, warm, well-structured prose. Keep answers focused and reasonably short unless asked for depth. \
Cite Scripture with short references such as John 3:16 or Num 21:8-9 so the app can link them. \
When you mention a Greek or Hebrew word, give the word, a transliteration and its Strong's number (for example G25) if you know it. \
Be honest about uncertainty and where interpreters differ. Do not invent quotations from the commentaries.";

const BOOK: &str = "The user is reading a reference book from their library. \
Your working directory holds the whole book as plain text: index.txt lists the chapters, one file per chapter, and its charts are PNG files named in the text as [Chart: …]. \
The message includes the chapter being read, or the part of it being asked about. \
When the answer needs more of the book, use Grep to find the relevant passages and Read only those lines; do not read whole chapters or the whole book unless the question needs it. \
Read a chart's PNG only when the question is about it or turns on it. \
When you draw on the book, say which chapter it comes from.";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Chunk {
    chat_id: String,
    text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Done {
    chat_id: String,
    session_id: Option<String>,
    text: String,
    error: Option<String>,
}

#[derive(Default)]
pub struct Running {
    pub children: Mutex<Vec<(String, Arc<Mutex<Child>>)>>,
}

#[allow(clippy::too_many_arguments)]
pub fn ask(app: AppHandle, running: Arc<Running>, cwd: PathBuf, chat_id: String, prompt: String, model: String, session: Option<String>, book: bool) -> Result<(), String> {
    let bin = find().ok_or("Claude Code isn't installed, or couldn't be found. Install it and sign in, then try again.")?;
    std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(bin);
    cmd.current_dir(&cwd)
        .arg("-p")
        .arg(&prompt)
        .args(["--model", &model, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--strict-mcp-config"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if book {
        // Reads inside the working directory need no permission; anything else would ask, and print
        // mode refuses what it would have to ask for. Pin the mode in case the user's settings bypass it.
        cmd.args(["--tools", "Read,Grep,Glob", "--permission-mode", "default", "--append-system-prompt", &format!("{SYSTEM}\n\n{BOOK}")]);
    } else {
        cmd.args(["--tools", "", "--append-system-prompt", SYSTEM]);
    }
    if let Some(s) = &session {
        cmd.args(["--resume", s]);
    }
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start claude: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    running.children.lock().map_err(|e| e.to_string())?.push((chat_id.clone(), child.clone()));

    std::thread::spawn(move || {
        let mut text = String::new();
        let mut session_id = None;
        let mut error = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            match v.get("type").and_then(|t| t.as_str()) {
                Some("stream_event") => {
                    let ev = &v["event"];
                    if ev["type"] == "content_block_delta" && ev["delta"]["type"] == "text_delta" {
                        if let Some(t) = ev["delta"]["text"].as_str() {
                            text.push_str(t);
                            let _ = app.emit("ask-chunk", Chunk { chat_id: chat_id.clone(), text: t.to_string() });
                        }
                    }
                }
                Some("system") => {
                    if let Some(s) = v["session_id"].as_str() { session_id = Some(s.to_string()); }
                }
                Some("result") => {
                    if let Some(s) = v["session_id"].as_str() { session_id = Some(s.to_string()); }
                    if v["is_error"].as_bool() == Some(true) {
                        error = Some(v["result"].as_str().unwrap_or("Claude returned an error").to_string());
                    } else if text.is_empty() {
                        if let Some(r) = v["result"].as_str() { text = r.to_string(); }
                    }
                }
                _ => {}
            }
        }
        let status = child.lock().ok().and_then(|mut c| c.wait().ok());
        if error.is_none() && !status.is_some_and(|s| s.success()) && text.is_empty() {
            let mut msg = String::new();
            if let Some(mut e) = stderr { let _ = std::io::Read::read_to_string(&mut e, &mut msg); }
            error = Some(if msg.trim().is_empty() { "Claude stopped without answering".into() } else { msg.trim().to_string() });
        }
        if let Ok(mut ch) = running.children.lock() { ch.retain(|(id, _)| id != &chat_id); }
        let _ = app.emit("ask-done", Done { chat_id, session_id, text, error });
    });
    Ok(())
}

pub fn cancel(running: &Running, chat_id: &str) {
    if let Ok(ch) = running.children.lock() {
        for (id, c) in ch.iter() {
            if id == chat_id {
                if let Ok(mut c) = c.lock() { let _ = c.kill(); }
            }
        }
    }
}
