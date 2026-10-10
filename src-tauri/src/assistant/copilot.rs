// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! GitHub Copilot CLI (`copilot -p --output-format json --stream on`). Only its read and search
//! tools exist (`--available-tools=view,grep,glob`; an empty list would mean every tool, web_fetch included); reading
//! outside the folder needs permission, which prompt mode can't ask for, so it is refused and the
//! answer carries on without it. Its built-in GitHub MCP server and the user's instruction files
//! are left out. It lists no models, so the app offers "auto" and Copilot routes to whatever the
//! account allows. It takes no system prompt, so the instructions open the first message.

use super::{installed, reading, spawn, stream, Folder, Model, Running, LOOKING, SEARCHING, SYSTEM};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::AppHandle;

pub const PREFIX: &str = "copilot:";
const TOOLS: &str =
    "Search with grep, find files with glob, and open them with view, several at once where you can. Read nothing outside this folder.";

pub fn find() -> Option<PathBuf> {
    super::find("copilot", &[])
}

pub fn models() -> Vec<Model> {
    vec![Model { id: format!("{PREFIX}auto"), name: "Copilot (Auto)".into() }]
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
    let bin = installed(find(), "GitHub Copilot CLI")?;
    let (tools, extra) = (["view", "grep", "glob"], format!("{} {TOOLS}", folder.prompt()));
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
    let run = spawn(&mut cmd, &running, &chat_id, "copilot")?;
    // A reply after a search is a new message.
    let mut message = None;
    stream(app, running, chat_id, "Copilot", true, run, move |a, v| {
        let d = &v["data"];
        match v["type"].as_str() {
            Some("assistant.message_delta") => {
                let Some(t) = d["deltaContent"].as_str().filter(|t| !t.is_empty()) else { return };
                let id = d["messageId"].as_str().map(str::to_string);
                if message.is_some() && message != id {
                    a.new_block();
                }
                message = id;
                a.push(t);
            }
            Some("tool.execution_start") => a.status(match d["toolName"].as_str() {
                Some("view") => reading(d["arguments"]["path"].as_str()),
                Some("grep") => Some(SEARCHING.into()),
                Some("glob") => Some(LOOKING.into()),
                _ => None,
            }),
            Some("session.error") => a.error = Some(d["message"].as_str().unwrap_or("Copilot returned an error").to_string()),
            Some("result") => {
                if let Some(s) = v["sessionId"].as_str() {
                    a.session_id = Some(s.to_string());
                }
            }
            _ => {}
        }
    });
    Ok(())
}
