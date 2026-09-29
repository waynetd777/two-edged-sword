// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Antigravity CLI (`agy -p --output-format stream-json`), Google's successor to Gemini CLI.
//! It has no flag to limit its tools, and some it would use unasked (web search); but a custom
//! agent's `tools` list is enforced, so each run writes one into its working folder
//! (`.agents/agents/tes-ask.md`) with only the read and search tools. Reads outside the folder, commands and web pages still need permission, which print
//! mode can't ask for, so they are refused. Model ids carry an "agy:" prefix, since it also
//! offers Claude models.

use super::{emit_status, finish, spawn, stem, Chunk, Done, Folder, Model, Running, SYSTEM};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub const PREFIX: &str = "agy:";
const AGENT: &str = "tes-ask";
const TOOLS: &str = "Search with grep_search, find files with find_by_name, and open them with view_file, several at once where you can. Read nothing outside this folder.";

pub fn find() -> Option<PathBuf> {
    super::find("agy", &[])
}

/// The models the signed-in account offers (`agy models`: id, tab, name). Empty when it isn't
/// signed in, so the app offers none.
pub fn models() -> Vec<Model> {
    let Some(bin) = find() else { return Vec::new() };
    let Ok(out) = Command::new(bin).arg("models").output() else { return Vec::new() };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.split_once('\t'))
        .map(|(id, name)| Model { id: format!("{PREFIX}{}", id.trim()), name: name.trim().to_string() })
        .collect()
}

/// The agent the run uses: its tools, and the instructions as its system prompt.
fn write_agent(cwd: &Path, folder: &Folder) -> Result<(), String> {
    let tools = "\n  - view_file\n  - grep_search\n  - find_by_name\n  - list_dir";
    let instructions = format!("{SYSTEM}\n\n{} {TOOLS}", folder.prompt());
    let dir = cwd.join(".agents").join("agents");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let md = format!("---\nname: {AGENT}\ndescription: Two-edged Sword's Ask, read-only\nmainAgent: true\ninheritMcp: false\ntools:{tools}\n---\n# Instructions\n{instructions}\n");
    std::fs::write(dir.join(format!("{AGENT}.md")), md).map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
pub fn ask(
    app: AppHandle,
    running: Arc<Running>,
    cwd: PathBuf,
    chat_id: String,
    prompt: String,
    model: String,
    session: Option<String>,
    folder: Folder,
) -> Result<(), String> {
    let bin = find().ok_or("Antigravity CLI isn't installed, or couldn't be found. Install it and sign in, then try again.")?;
    write_agent(&cwd, &folder)?;
    let mut cmd = Command::new(bin);
    cmd.current_dir(&cwd).arg("-p").arg(&prompt).args([
        "--agent",
        AGENT,
        "--model",
        model.strip_prefix(PREFIX).unwrap_or(&model),
        "--sandbox",
        "--disable-slash-commands",
        "--output-format",
        "stream-json",
    ]);
    if let Some(s) = &session {
        cmd.args(["--conversation", s]);
    }
    let (child, stdout, stderr) = spawn(&mut cmd, &running, &chat_id, "agy")?;

    std::thread::spawn(move || {
        let mut text = String::new();
        let mut session_id = None;
        let mut error = None;
        let mut step = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            match v["event"].as_str() {
                Some("step_update") => {
                    let s = &v["step_update"];
                    if let Some(c) = s["conversation_id"].as_str() {
                        session_id = Some(c.to_string());
                    }
                    match s["step_type"].as_str() {
                        Some("agent_response") => {
                            let Some(t) = s["text_delta"].as_str().filter(|t| !t.is_empty()) else { continue };
                            // A reply after a search is a new block; without a break it runs on from the one before.
                            if step.is_some() && step != s["step_index"].as_i64() && !text.is_empty() && !text.ends_with("\n\n") {
                                let sep = if text.ends_with('\n') { "\n" } else { "\n\n" };
                                text.push_str(sep);
                                let _ = app.emit("ask-chunk", Chunk { chat_id: chat_id.clone(), text: sep.to_string() });
                            }
                            step = s["step_index"].as_i64();
                            text.push_str(t);
                            let _ = app.emit("ask-chunk", Chunk { chat_id: chat_id.clone(), text: t.to_string() });
                        }
                        Some("tool") if s["state"] == "ACTIVE" => {
                            let p = &s["tool_info"]["parameters"];
                            let what = match s["tool_name"].as_str() {
                                Some("view_file") => p["AbsolutePath"].as_str().and_then(stem).map(|f| format!("Reading {f}")),
                                Some("grep_search") => Some("Searching the library".to_string()),
                                Some("find_by_name") | Some("list_dir") => Some("Looking through the library".to_string()),
                                _ => None,
                            };
                            if let Some(t) = what {
                                emit_status(&app, &chat_id, t);
                            }
                        }
                        _ => {}
                    }
                }
                Some("result") => {
                    let r = &v["result"];
                    if let Some(c) = r["conversation_id"].as_str() {
                        session_id = Some(c.to_string());
                    }
                    if text.is_empty() {
                        if let Some(t) = r["response"].as_str() {
                            text = t.to_string();
                        }
                    }
                    // A refused action (a read outside the folder, a command) ends the turn with no answer.
                    let denied: Vec<&str> =
                        r["denied_actions"].as_array().into_iter().flatten().filter_map(|d| d["display_name"].as_str()).collect();
                    if text.trim().is_empty() && !denied.is_empty() {
                        error = Some(format!("Antigravity stopped without answering: it tried something Ask doesn't allow ({}). Try asking again, or another model.", denied.join(", ")));
                    } else if r["status"].as_str().is_some_and(|s| s != "SUCCESS") && text.is_empty() {
                        error = Some(format!("Antigravity returned an error ({})", r["status"].as_str().unwrap_or("")));
                    }
                }
                _ => {}
            }
        }
        let ok = finish(child, &running);
        if error.is_none() && text.trim().is_empty() {
            let msg = stderr.join().unwrap_or_default();
            error = Some(if msg.trim().is_empty() || ok { "Antigravity stopped without answering".into() } else { msg.trim().to_string() });
        }
        let _ = app.emit("ask-done", Done { chat_id, session_id, text, error });
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_lists_only_read_tools() {
        let dir = std::env::temp_dir().join(format!("tes-agy-{}", std::process::id()));
        write_agent(&dir, &Folder::Study(dir.clone())).unwrap();
        let md = std::fs::read_to_string(dir.join(".agents/agents/tes-ask.md")).unwrap();
        assert!(md.contains("tools:\n  - view_file\n  - grep_search\n  - find_by_name\n  - list_dir\n---"));
        assert!(!md.contains("search_web") && !md.contains("run_command"));
        if let Ok(keep) = std::env::var("TES_AGY_KEEP") {
            write_agent(Path::new(&keep), &Folder::Study(PathBuf::from(&keep))).unwrap();
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
