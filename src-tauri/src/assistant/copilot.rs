//! GitHub Copilot CLI (`copilot -p --output-format json --stream on`). Only its read and search
//! tools exist in a folder chat (`--available-tools=view,grep,glob`), and outside one only `view`,
//! in an empty working folder (an empty list would mean every tool, web_fetch included); reading
//! outside the folder needs permission, which prompt mode can't ask for, so it is refused and the
//! answer carries on without it. Its built-in GitHub MCP server and the user's instruction files
//! are left out. It lists no models, so the app offers "auto" and Copilot routes to whatever the
//! account allows. It takes no system prompt, so the instructions open the first message.

use super::{emit_status, finish, spawn, stem, Chunk, Done, Folder, Model, Running, SYSTEM};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub const PREFIX: &str = "copilot:";
const TOOLS: &str = "Search with grep, find files with glob, and open them with view, several at once where you can. Read nothing outside this folder.";
const NO_TOOLS: &str = "Answer from the message alone.";

pub fn find() -> Option<PathBuf> {
    super::find("copilot", &[])
}

pub fn models() -> Vec<Model> {
    vec![Model { id: format!("{PREFIX}auto"), name: "Copilot (Auto)".into() }]
}

#[allow(clippy::too_many_arguments)]
pub fn ask(app: AppHandle, running: Arc<Running>, cwd: PathBuf, chat_id: String, prompt: String, model: String, session: Option<String>, folder: Folder) -> Result<(), String> {
    let bin = find().ok_or("GitHub Copilot CLI isn't installed, or couldn't be found. Install it and sign in, then try again.")?;
    let (tools, extra) = match folder.prompt() {
        Some(extra) => (vec!["view", "grep", "glob"], format!("{extra} {TOOLS}")),
        None => (vec!["view"], NO_TOOLS.to_string()),
    };
    // A follow-up resumes the session, which has the instructions already.
    let prompt = if session.is_some() { prompt } else { format!("<instructions>\n{SYSTEM}\n\n{extra}\n</instructions>\n\n{prompt}") };
    let mut cmd = Command::new(bin);
    cmd.current_dir(&cwd)
        .arg("-p")
        .arg(&prompt)
        .args(["--model", model.strip_prefix(PREFIX).unwrap_or(&model), "--output-format", "json", "--stream", "on"])
        .args(["--no-custom-instructions", "--disable-builtin-mcps", "--no-auto-update", "--disallow-temp-dir"]);
    cmd.arg(format!("--available-tools={}", tools.join(",")));
    if let Some(s) = &session {
        cmd.arg(format!("--resume={s}"));
    }
    let (child, stdout, stderr) = spawn(&mut cmd, &running, &chat_id, "copilot")?;

    std::thread::spawn(move || {
        let mut text = String::new();
        let mut session_id = None;
        let mut error = None;
        let mut message = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            let d = &v["data"];
            match v["type"].as_str() {
                Some("assistant.message_delta") => {
                    let Some(t) = d["deltaContent"].as_str().filter(|t| !t.is_empty()) else { continue };
                    // A reply after a search is a new message; without a break it runs on from the one before.
                    let id = d["messageId"].as_str().map(str::to_string);
                    if message.is_some() && message != id && !text.is_empty() && !text.ends_with("\n\n") {
                        let sep = if text.ends_with('\n') { "\n" } else { "\n\n" };
                        text.push_str(sep);
                        let _ = app.emit("ask-chunk", Chunk { chat_id: chat_id.clone(), text: sep.to_string() });
                    }
                    message = id;
                    text.push_str(t);
                    let _ = app.emit("ask-chunk", Chunk { chat_id: chat_id.clone(), text: t.to_string() });
                }
                Some("tool.execution_start") => {
                    let what = match d["toolName"].as_str() {
                        Some("view") => d["arguments"]["path"].as_str().and_then(stem).map(|f| format!("Reading {f}")),
                        Some("grep") => Some("Searching the library".to_string()),
                        Some("glob") => Some("Looking through the library".to_string()),
                        _ => None,
                    };
                    if let Some(t) = what { emit_status(&app, &chat_id, t); }
                }
                Some("session.error") => error = Some(d["message"].as_str().unwrap_or("Copilot returned an error").to_string()),
                Some("result") => {
                    if let Some(s) = v["sessionId"].as_str() { session_id = Some(s.to_string()); }
                }
                _ => {}
            }
        }
        if !text.is_empty() {
            error = None;
        }
        let ok = finish(child, &running);
        if error.is_none() && text.trim().is_empty() {
            let msg = stderr.join().unwrap_or_default();
            error = Some(if msg.trim().is_empty() || ok { "Copilot stopped without answering".into() } else { msg.trim().to_string() });
        }
        let _ = app.emit("ask-done", Done { chat_id, session_id, text, error });
    });
    Ok(())
}
