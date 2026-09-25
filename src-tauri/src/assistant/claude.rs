//! Claude Code in print mode, streaming JSON: text arrives as deltas while it is written.

use super::{emit_status, finish, spawn, stem, Chunk, Done, Folder, Running, SYSTEM};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const TOOLS: &str = "Use Grep to find the relevant passages and Read only those lines; do not read whole files unless the question needs it. Several Read or Grep calls can go in one turn.";

pub fn find() -> Option<PathBuf> {
    super::find("claude", &[".claude/local/claude"])
}

#[allow(clippy::too_many_arguments)]
pub fn ask(app: AppHandle, running: Arc<Running>, cwd: PathBuf, chat_id: String, prompt: String, model: String, session: Option<String>, folder: Folder) -> Result<(), String> {
    let bin = find().ok_or("Claude Code isn't installed, or couldn't be found. Install it and sign in, then try again.")?;
    let mut cmd = Command::new(bin);
    cmd.current_dir(&cwd)
        .arg("-p")
        .arg(&prompt)
        .args(["--model", &model, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--strict-mcp-config"]);
    if let Some(extra) = folder.prompt() {
        // Reads inside the working directory need no permission; anything else
        // would ask, and print mode refuses what it would have to ask for. Pin the mode in case the
        // user's settings bypass it.
        cmd.args(["--tools", "Read,Grep,Glob", "--permission-mode", "default", "--append-system-prompt", &format!("{SYSTEM}\n\n{extra} {TOOLS}")]);
    } else {
        cmd.args(["--tools", "", "--append-system-prompt", SYSTEM]);
    }
    if let Some(s) = &session {
        cmd.args(["--resume", s]);
    }
    let (child, stdout, stderr) = spawn(&mut cmd, &running, &chat_id, "claude")?;

    std::thread::spawn(move || {
        let mut text = String::new();
        let mut session_id = None;
        let mut error = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            match v.get("type").and_then(|t| t.as_str()) {
                Some("stream_event") => {
                    let ev = &v["event"];
                    // Text written after a search is a new block; without a break it runs on from
                    // the text before it ("…notes on John 1:1.Across the commentaries…").
                    if ev["type"] == "content_block_start" && ev["content_block"]["type"] == "text" && !text.is_empty() && !text.ends_with("\n\n") {
                        let sep = if text.ends_with('\n') { "\n" } else { "\n\n" };
                        text.push_str(sep);
                        let _ = app.emit("ask-chunk", Chunk { chat_id: chat_id.clone(), text: sep.to_string() });
                    }
                    if ev["type"] == "content_block_delta" && ev["delta"]["type"] == "text_delta" {
                        if let Some(t) = ev["delta"]["text"].as_str() {
                            text.push_str(t);
                            let _ = app.emit("ask-chunk", Chunk { chat_id: chat_id.clone(), text: t.to_string() });
                        }
                    }
                }
                // A whole assistant turn; its tool calls say what it is searching.
                Some("assistant") => {
                    for c in v["message"]["content"].as_array().into_iter().flatten().filter(|c| c["type"] == "tool_use") {
                        let input = &c["input"];
                        let what = match c["name"].as_str() {
                            Some("Read") => input["file_path"].as_str().and_then(stem).map(|s| format!("Reading {s}")),
                            Some("Grep") => Some(match input["path"].as_str().and_then(stem) {
                                Some(s) if s != "commentaries" && s != "lexicons" && s != "passage" => format!("Searching {s}"),
                                _ => "Searching the library".into(),
                            }),
                            Some("Glob") => Some("Looking through the library".into()),
                            _ => None,
                        };
                        if let Some(t) = what { emit_status(&app, &chat_id, t); }
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
        let ok = finish(child, &running);
        if error.is_none() && !ok && text.is_empty() {
            let msg = stderr.join().unwrap_or_default();
            error = Some(if msg.trim().is_empty() { "Claude stopped without answering".into() } else { msg.trim().to_string() });
        }
        let _ = app.emit("ask-done", Done { chat_id, session_id, text, error });
    });
    Ok(())
}
