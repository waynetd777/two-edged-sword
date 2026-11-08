// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Sync with the desktop app (src/phoneSync.ts; the desktop's sync.rs answers): pairing with the code
//! the computer's Settings shows, and each request after that, encrypted with the key pairing agreed
//! (sync_crypto.rs, the desktop's own file).

use crate::sync_crypto as crypto;
use std::io::Read;
use std::time::Duration;

fn agent(read: u64) -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(4)).timeout_read(Duration::from_secs(read)).build()
}

/// The error a desktop sent ({"error": "..."}), or the network's.
fn sync_error(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(401, _) => "not paired".into(),
        // A computer with the app from before sync was encrypted.
        ureq::Error::Status(404, _) => "Two-edged Sword on the computer needs updating before this device can sync with it.".into(),
        // One that needs the user (the computer couldn't save its journal) starts with "!", for
        // phoneSync.ts to show as such.
        ureq::Error::Status(_, r) => r
            .into_string()
            .ok()
            .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
            .and_then(|v| v["error"].as_str().map(|e| if v["red"] == true { format!("!{e}") } else { e.to_string() }))
            .unwrap_or_else(|| "The computer couldn't sync.".into()),
        ureq::Error::Transport(t) => t.to_string(),
    }
}

fn send(req: ureq::Request, body: &str) -> Result<String, String> {
    let mut text = String::new();
    // Read as a stream: into_string stops at 10 MB, and a sync carries the whole journal.
    req.set("Content-Type", "application/json")
        .send_string(body)
        .map_err(sync_error)?
        .into_reader()
        .take(64_000_000)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    Ok(text)
}

fn json(text: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str(text).map_err(|e| e.to_string())
}

/// Pairs with the computer at `url` using the code its Settings shows: agrees a key with it, and checks
/// the computer has the same one before answering it. Answers {id, key, name}.
#[tauri::command(async)]
pub fn sync_pair(url: String, code: String, name: String) -> Result<serde_json::Value, String> {
    let (state, msg) = crypto::phone_start(&code);
    let r = json(&send(agent(15).post(&format!("{url}/pair/start")), &serde_json::json!({ "msg": msg }).to_string())?)?;
    let (Some(session), Some(theirs)) = (r["session"].as_str(), r["msg"].as_str()) else {
        return Err("That isn't Two-edged Sword, or it's an older version. Update it on the computer.".into());
    };
    // A message that isn't SPAKE2's is the same to the user as a wrong code.
    let shared = crypto::phone_finish(state, &msg, theirs)
        .map_err(|_| "That code isn't the one shown on the computer, or it has expired.".to_string())?;
    let body = serde_json::json!({ "session": session, "proof": shared.phone_proof(), "name": name });
    let r = json(&send(agent(15).post(&format!("{url}/pair/finish")), &body.to_string())?)?;
    // The computer proves it has the key too: otherwise something else answered.
    if !r["proof"].as_str().is_some_and(|p| shared.check_computer(p)) {
        return Err("The computer couldn't be checked, so it wasn't paired. Try again.".into());
    }
    let id = r["id"].as_str().ok_or("The computer couldn't pair.")?;
    Ok(serde_json::json!({ "id": id, "key": crypto::hex(&shared.key), "name": r["name"] }))
}

/// One encrypted request to the paired computer (/hello, which only proves it's the one paired with,
/// or /sync); answers what it sent back, checked and decrypted. `ctr` is higher on every call.
#[tauri::command(async)]
pub fn sync_call(
    url: String,
    id: String,
    key: String,
    ctr: u64,
    path: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if path != "/hello" && path != "/sync" {
        return Err("bad path".into());
    }
    let key = crypto::unhex(&key).filter(|k| k.len() == 32).ok_or("not paired")?;
    let sealed =
        crypto::seal(&key, &crypto::request_aad(&id, &path), serde_json::json!({ "ctr": ctr, "body": body }).to_string().as_bytes())?;
    // A sync can wait while the computer writes its journal (its sync.rs waits up to 135 seconds).
    let read = if path == "/sync" { 150 } else { 6 };
    let text = send(agent(read).post(&format!("{url}{path}")).set("X-Tes-Device", &id), &sealed)?;
    let plain = crypto::open(&key, &crypto::reply_aad(&id, &path, ctr), &text)
        .map_err(|_| "The answer didn't come from the computer this device is paired with.".to_string())?;
    serde_json::from_slice(&plain).map_err(|e| e.to_string())
}
