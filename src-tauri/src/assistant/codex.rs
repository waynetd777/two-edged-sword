// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Codex (`codex exec --json`): messages arrive whole, not as deltas, so the answer is sent once, at the end.
//! The user's own Codex config (MCP servers, hooks, rules) is left out; sign-in still comes from
//! ~/.codex. Runs in the read-only sandbox.

use super::{installed, reading, spawn, stream, Folder, Model, Running, SEARCHING, SYSTEM};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::AppHandle;

const TOOLS: &str = "Search with rg and print only the relevant lines, covering several files in one command where you can; do not read whole files unless the question needs it. Read nothing outside the folders named here.";

pub fn find() -> Option<PathBuf> {
    super::find("codex", &[])
}

/// The models the Codex CLI would offer in its picker, from the list it caches for the
/// signed-in account. Empty if Codex has never run, so the app shows nothing to choose.
pub fn models() -> Vec<Model> {
    let Ok(s) = std::fs::read_to_string(crate::store::home().join(".codex/models_cache.json")) else { return Vec::new() };
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
    let bin = installed(find(), "Codex")?;
    let instructions = format!("{SYSTEM}\n\n{} {TOOLS}", folder.prompt());
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
    cmd.arg(&prompt);
    let run = spawn(&mut cmd, &running, &chat_id, "codex")?;
    stream(app, running, chat_id, "Codex", true, run, |a, v| match v["type"].as_str() {
        Some("thread.started") => {
            if let Some(s) = v["thread_id"].as_str() {
                a.session_id = Some(s.to_string());
            }
        }
        // A shell command it runs to search: name the file it reads, if one is named.
        Some("item.started") if v["item"]["type"] == "command_execution" => {
            let cmd = v["item"]["command"].as_str().unwrap_or("");
            let file = cmd.split(['\'', '"']).find(|p| p.ends_with(".txt"));
            a.status(reading(file).or_else(|| Some(SEARCHING.into())));
        }
        // When it searches first, earlier messages are progress notes ("I'll read index.txt…");
        // the answer is the last one, sent with ask-done.
        Some("item.completed") if v["item"]["type"] == "agent_message" => {
            if let Some(t) = v["item"]["text"].as_str() {
                a.text = t.to_string();
            }
        }
        Some("turn.failed") => a.error = Some(v["error"]["message"].as_str().unwrap_or("Codex returned an error").to_string()),
        Some("error") => a.error = Some(v["message"].as_str().unwrap_or("Codex returned an error").to_string()),
        _ => {}
    });
    Ok(())
}
