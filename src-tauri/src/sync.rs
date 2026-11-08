// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Sync with the phone app: a small HTTP server on the home network, announced over Bonjour as
//! `_tes-sync._tcp`, that the phones and tablets paired with this computer sync through. What's synced
//! (bookmarks, highlights, plans, Recent, the place in each book) is merged by the page (src/sync.ts,
//! syncHub.ts), which owns it: a request is passed to it as an event, and its answer goes back.
//!
//! Pairing: Settings shows a six-digit code for ten minutes; a device that sends it gets a token of its
//! own, kept in sync-devices.json, and sends that with every sync. Forgetting a device drops its token.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const SERVICE: &str = "_tes-sync._tcp.local.";
/// The port asked for first, so a firewall rule stays put; any free one if it's taken.
const PORT: u16 = 47615;

#[derive(Serialize, Deserialize, Clone)]
pub struct Device {
    pub id: String,
    pub name: String,
    token: String,
    pub paired: u64,
    pub seen: u64,
}

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    id: String,
    name: String,
    paired: u64,
    seen: u64,
}

#[derive(Default)]
pub struct Sync {
    data: Mutex<Option<PathBuf>>,
    /// The pairing code shown in Settings, and until when (ms).
    code: Mutex<Option<(String, u64)>>,
    /// Requests waiting for the page's merge, by number.
    waiting: Mutex<HashMap<u64, mpsc::Sender<serde_json::Value>>>,
    next: Mutex<u64>,
    port: Mutex<u16>,
    /// Kept so the Bonjour announcement lasts as long as the app.
    mdns: Mutex<Option<mdns_sd::ServiceDaemon>>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn random_hex(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    let _ = getrandom::fill(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// This computer's address on the home network, for typing into a phone that doesn't find it: the one
/// a connection out would use (connecting a UDP socket sends nothing).
pub fn local_ip() -> String {
    std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| s.connect("192.0.2.1:9").and_then(|_| s.local_addr()))
        .map(|a| a.ip().to_string())
        .unwrap_or_default()
}

/// This computer's name as people know it ("Wayne's MacBook Air").
pub fn computer_name() -> String {
    #[cfg(target_os = "macos")]
    if let Ok(o) = std::process::Command::new("scutil").args(["--get", "ComputerName"]).output() {
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if !s.is_empty() {
            return s;
        }
    }
    std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "Two-edged Sword".into())
}

impl Sync {
    fn devices_path(&self) -> Option<PathBuf> {
        self.data.lock().unwrap().as_ref().map(|d| d.join("sync-devices.json"))
    }

    pub fn devices(&self) -> Vec<Device> {
        self.devices_path().and_then(|p| std::fs::read_to_string(p).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
    }

    fn save_devices(&self, ds: &[Device]) {
        if let Some(p) = self.devices_path() {
            let _ = crate::store::write_text_atomic(&p, &serde_json::to_string_pretty(ds).unwrap_or_default());
        }
    }

    pub fn infos(&self) -> Vec<DeviceInfo> {
        self.devices().into_iter().map(|d| DeviceInfo { id: d.id, name: d.name, paired: d.paired, seen: d.seen }).collect()
    }

    pub fn forget(&self, id: &str) {
        let ds: Vec<Device> = self.devices().into_iter().filter(|d| d.id != id).collect();
        self.save_devices(&ds);
    }

    /// A new pairing code, good for ten minutes.
    pub fn new_code(&self) -> String {
        let mut b = [0u8; 4];
        let _ = getrandom::fill(&mut b);
        let code = format!("{:06}", u32::from_le_bytes(b) % 1_000_000);
        *self.code.lock().unwrap() = Some((code.clone(), now_ms() + 10 * 60_000));
        code
    }

    pub fn port(&self) -> u16 {
        *self.port.lock().unwrap()
    }

    /// The page's answer to a sync request.
    pub fn reply(&self, rid: u64, merged: serde_json::Value) {
        if let Some(tx) = self.waiting.lock().unwrap().remove(&rid) {
            let _ = tx.send(merged);
        }
    }
}

#[derive(Deserialize)]
struct PairReq {
    code: String,
    name: String,
}

/// Starts the server and the Bonjour announcement; quietly does nothing if the network can't be used.
pub fn start(app: &AppHandle, data: PathBuf) {
    let sync = app.state::<Arc<Sync>>().inner().clone();
    *sync.data.lock().unwrap() = Some(data);
    // Debug builds: a fixed pairing code from TES_PAIR_CODE, for testing with the phone app unattended.
    if cfg!(debug_assertions) {
        if let Ok(c) = std::env::var("TES_PAIR_CODE") {
            *sync.code.lock().unwrap() = Some((c, u64::MAX));
        }
    }
    let server = match tiny_http::Server::http(("0.0.0.0", PORT)).or_else(|_| tiny_http::Server::http(("0.0.0.0", 0))) {
        Ok(s) => s,
        Err(_) => return,
    };
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    *sync.port.lock().unwrap() = port;
    announce(&sync, port);
    let app = app.clone();
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let (app, sync) = (app.clone(), sync.clone());
            // Each on its own thread: a sync waits for the page.
            std::thread::spawn(move || handle(&app, &sync, req));
        }
    });
}

fn announce(sync: &Sync, port: u16) {
    let Ok(d) = mdns_sd::ServiceDaemon::new() else { return };
    // IPv4 only: the server listens on IPv4, and a phone given an IPv6 address would be refused.
    let _ = d.disable_interface(mdns_sd::IfKind::IPv6);
    let name = computer_name();
    let host = format!("tes-{}.local.", random_hex(4));
    // Its address too: Android may be told only an IPv6 link-local one (fe80::), which can't be connected to.
    let ip = local_ip();
    let props = [("app", "tes"), ("v", "1"), ("ip", ip.as_str())];
    if let Ok(info) = mdns_sd::ServiceInfo::new(SERVICE, &name, &host, "", port, &props[..]) {
        let _ = d.register(info.enable_addr_auto());
    }
    *sync.mdns.lock().unwrap() = Some(d);
}

fn respond(req: tiny_http::Request, status: u16, body: serde_json::Value) {
    let h = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    let _ = req.respond(tiny_http::Response::from_string(body.to_string()).with_status_code(status).with_header(h));
}

fn handle(app: &AppHandle, sync: &Sync, mut req: tiny_http::Request) {
    let mut body = String::new();
    // A sync carries the whole journal: a few megabytes for years of entries.
    if req.as_reader().take(64_000_000).read_to_string(&mut body).is_err() {
        return respond(req, 400, serde_json::json!({"error": "unreadable"}));
    }
    let token =
        req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().trim_start_matches("Bearer ").to_string());
    match (req.method(), req.url()) {
        (tiny_http::Method::Get, "/hello") => respond(req, 200, serde_json::json!({"app": "tes", "name": computer_name()})),
        (tiny_http::Method::Post, "/pair") => {
            let Ok(p) = serde_json::from_str::<PairReq>(&body) else {
                return respond(req, 400, serde_json::json!({"error": "bad request"}));
            };
            let ok = matches!(&*sync.code.lock().unwrap(), Some((c, until)) if *c == p.code.trim() && now_ms() < *until);
            if !ok {
                return respond(
                    req,
                    403,
                    serde_json::json!({"error": "That code isn't the one shown on the computer, or it has expired."}),
                );
            }
            *sync.code.lock().unwrap() = None;
            let d = Device { id: random_hex(8), name: p.name.chars().take(60).collect(), token: random_hex(24), paired: now_ms(), seen: 0 };
            let mut ds = sync.devices();
            ds.push(d.clone());
            sync.save_devices(&ds);
            let _ = app.emit("sync-devices", ());
            respond(req, 200, serde_json::json!({"token": d.token, "id": d.id, "name": computer_name()}))
        }
        (tiny_http::Method::Post, "/sync") => {
            let mut ds = sync.devices();
            let Some(i) = token.as_deref().and_then(|t| ds.iter().position(|d| !t.is_empty() && d.token == t)) else {
                return respond(req, 401, serde_json::json!({"error": "not paired"}));
            };
            let Ok(payload) = serde_json::from_str::<serde_json::Value>(&body) else {
                return respond(req, 400, serde_json::json!({"error": "bad request"}));
            };
            let rid = {
                let mut n = sync.next.lock().unwrap();
                *n += 1;
                *n
            };
            let (tx, rx) = mpsc::channel();
            sync.waiting.lock().unwrap().insert(rid, tx);
            let _ = app.emit("sync-request", serde_json::json!({"rid": rid, "device": ds[i].name, "payload": payload}));
            match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(merged) => {
                    ds[i].seen = now_ms();
                    sync.save_devices(&ds);
                    let _ = app.emit("sync-devices", ());
                    respond(req, 200, merged)
                }
                Err(_) => {
                    sync.waiting.lock().unwrap().remove(&rid);
                    respond(req, 503, serde_json::json!({"error": "The app on the computer didn't answer."}))
                }
            }
        }
        _ => respond(req, 404, serde_json::json!({"error": "not found"})),
    }
}
