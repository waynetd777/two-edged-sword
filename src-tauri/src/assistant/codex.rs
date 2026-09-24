//! Codex (`codex exec --json`): messages arrive whole, not as deltas, so the answer is sent once, at the end.
//! The user's own Codex config (MCP servers, hooks, rules) is left out; sign-in still comes from
//! ~/.codex. Runs in the read-only sandbox.

use super::{emit_status, stem, Done, Folder, Model, Running, SYSTEM};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

const TOOLS: &str = "Search with rg and print only the relevant lines, covering several files in one command where you can; do not read whole files unless the question needs it. Read nothing outside the folders named here.";
const NO_TOOLS: &str = "Answer from the message alone; do not run commands.";

pub fn find() -> Option<PathBuf> {
    super::find("codex", &[])
}

/// The models the Codex CLI would offer in its picker, from the list it caches for the
/// signed-in account. Empty if Codex has never run, so the app shows nothing to choose.
pub fn models() -> Vec<Model> {
    let home = std::env::var("HOME").unwrap_or_default();
    let Ok(s) = std::fs::read_to_string(format!("{home}/.codex/models_cache.json")) else { return Vec::new() };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) else { return Vec::new() };
    let mut ms: Vec<(i64, Model)> = v["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|m| m["visibility"] == "list")
        .filter_map(|m| {
            let id = m["slug"].as_str()?.to_string();
            let name = m["display_name"].as_str().unwrap_or(&id).to_string();
            Some((m["priority"].as_i64().unwrap_or(i64::MAX), Model { id, name }))
        })
        .collect();
    ms.sort_by_key(|(p, _)| *p);
    ms.into_iter().map(|(_, m)| m).collect()
}

#[allow(clippy::too_many_arguments)]
pub fn ask(app: AppHandle, running: Arc<Running>, cwd: PathBuf, chat_id: String, prompt: String, model: String, session: Option<String>, folder: Folder) -> Result<(), String> {
    let bin = find().ok_or("Codex isn't installed, or couldn't be found. Install it and sign in, then try again.")?;
    let instructions = match folder.prompt() { Some(extra) => format!("{SYSTEM}\n\n{extra} {TOOLS}"), None => format!("{SYSTEM}\n\n{NO_TOOLS}") };
    // -c values are TOML; a JSON string is a valid TOML basic string.
    let instructions = format!("developer_instructions={}", serde_json::to_string(&instructions).map_err(|e| e.to_string())?);
    let mut cmd = Command::new(bin);
    cmd.current_dir(&cwd).arg("exec");
    if session.is_some() {
        cmd.arg("resume");
    }
    cmd.args(["--json", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "-m", &model])
        .args(["-c", "sandbox_mode=\"read-only\"", "-c", &instructions])
        .arg("--");
    if let Some(s) = &session {
        cmd.arg(s);
    }
    cmd.arg(&prompt).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start codex: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    running.add(&chat_id, child.clone());

    std::thread::spawn(move || {
        let mut text = String::new();
        let mut session_id = None;
        let mut error = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            match v["type"].as_str() {
                Some("thread.started") => {
                    if let Some(s) = v["thread_id"].as_str() { session_id = Some(s.to_string()); }
                }
                // A shell command it runs to search: name the file it reads, if one is named.
                Some("item.started") if v["item"]["type"] == "command_execution" => {
                    let cmd = v["item"]["command"].as_str().unwrap_or("");
                    let file = cmd.split(['\'', '"']).find(|p| p.ends_with(".txt")).and_then(stem);
                    emit_status(&app, &chat_id, file.map(|f| format!("Reading {f}")).unwrap_or_else(|| "Searching the library".into()));
                }
                // When it searches first, earlier messages are progress notes ("I'll read index.txt…");
                // the answer is the last one, sent with ask-done.
                Some("item.completed") if v["item"]["type"] == "agent_message" => {
                    if let Some(t) = v["item"]["text"].as_str() { text = t.to_string(); }
                }
                Some("turn.failed") => error = Some(v["error"]["message"].as_str().unwrap_or("Codex returned an error").to_string()),
                Some("error") => error = Some(v["message"].as_str().unwrap_or("Codex returned an error").to_string()),
                _ => {}
            }
        }
        // Codex also reports transient trouble (a dropped stream it then reconnects) as errors,
        // so one only counts when no answer came.
        if !text.is_empty() {
            error = None;
        }
        let status = child.lock().ok().and_then(|mut c| c.wait().ok());
        if error.is_none() && !status.is_some_and(|s| s.success()) && text.is_empty() {
            let mut msg = String::new();
            if let Some(mut e) = stderr { let _ = std::io::Read::read_to_string(&mut e, &mut msg); }
            error = Some(if msg.trim().is_empty() { "Codex stopped without answering".into() } else { msg.trim().to_string() });
        }
        running.remove(&chat_id);
        let _ = app.emit("ask-done", Done { chat_id, session_id, text, error });
    });
    Ok(())
}
