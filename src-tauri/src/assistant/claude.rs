// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Claude Code in print mode, streaming JSON: text arrives as deltas while it is written.

use super::{installed, reading, spawn, stem, stream, Folder, Running, LOOKING, SEARCHING, SYSTEM};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::AppHandle;

const TOOLS: &str = "Use Grep to find the relevant passages and Read only those lines; do not read whole files unless the question needs it. Several Read or Grep calls can go in one turn.";

/// The app's ids for Claude Code's aliases: "claude:sonnet" runs `--model sonnet`.
pub const PREFIX: &str = "claude:";

pub fn find() -> Option<PathBuf> {
    super::find("claude", &[".claude/local/claude"])
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
    let bin = installed(find(), "Claude Code")?;
    let mut cmd = Command::new(bin);
    cmd.current_dir(&cwd).arg("-p").arg(&prompt).args([
        "--model",
        model.strip_prefix(PREFIX).unwrap_or(&model),
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--strict-mcp-config",
    ]);
    // Reads inside the working directory need no permission; anything else would ask, and print
    // mode refuses what it would have to ask for. Pin the mode in case the user's settings bypass it.
    cmd.args([
        "--tools",
        "Read,Grep,Glob",
        "--permission-mode",
        "default",
        "--append-system-prompt",
        &format!("{SYSTEM}\n\n{} {TOOLS}", folder.prompt()),
    ]);
    if let Some(s) = &session {
        cmd.args(["--resume", s]);
    }
    let run = spawn(&mut cmd, &running, &chat_id, "claude")?;
    stream(app, running, chat_id, "Claude", false, run, |a, v| match v.get("type").and_then(|t| t.as_str()) {
        Some("stream_event") => {
            let ev = &v["event"];
            if ev["type"] == "content_block_start" && ev["content_block"]["type"] == "text" {
                a.new_block();
            }
            if ev["type"] == "content_block_delta" && ev["delta"]["type"] == "text_delta" {
                if let Some(t) = ev["delta"]["text"].as_str() {
                    a.push(t);
                }
            }
        }
        // A whole assistant turn; its tool calls say what it is searching.
        Some("assistant") => {
            for c in v["message"]["content"].as_array().into_iter().flatten().filter(|c| c["type"] == "tool_use") {
                let input = &c["input"];
                a.status(match c["name"].as_str() {
                    Some("Read") => reading(input["file_path"].as_str()),
                    Some("Grep") => Some(match input["path"].as_str().and_then(stem) {
                        Some(s) if s != "commentaries" && s != "lexicons" && s != "passage" => format!("Searching {s}"),
                        _ => SEARCHING.into(),
                    }),
                    Some("Glob") => Some(LOOKING.into()),
                    _ => None,
                });
            }
        }
        Some("system") => {
            if let Some(s) = v["session_id"].as_str() {
                a.session_id = Some(s.to_string());
            }
        }
        Some("result") => {
            if let Some(s) = v["session_id"].as_str() {
                a.session_id = Some(s.to_string());
            }
            if v["is_error"].as_bool() == Some(true) {
                a.error = Some(v["result"].as_str().unwrap_or("Claude returned an error").to_string());
            } else if a.text.is_empty() {
                if let Some(r) = v["result"].as_str() {
                    a.text = r.to_string();
                }
            }
        }
        _ => {}
    });
    Ok(())
}
