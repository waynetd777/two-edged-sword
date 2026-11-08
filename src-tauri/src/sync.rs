// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Sync with the phone app: a small HTTP server on the home network, announced over Bonjour as
//! `_tes-sync._tcp`, that the phones and tablets paired with this computer sync through. What's synced
//! (bookmarks, highlights, plans, Recent, the place in each book, the journal) is merged by the page
//! (src/sync.ts, syncHub.ts), which owns it: a request is passed to it as an event, and its answer goes back.
//!
//! The server runs only while a device is paired or a pairing code is showing, and answers only
//! addresses on the home network.
//!
//! Pairing: Settings shows a six-digit code for two minutes. The phone and this computer agree a key
//! with it (sync_crypto.rs, SPAKE2): five wrong tries and the code is gone. The key is kept per device
//! in sync-devices.json, and every request and reply after that is encrypted with it. Forgetting a
//! device drops its key. Devices paired before sync was encrypted have none, and must pair again.

use crate::sync_crypto as crypto;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const SERVICE: &str = "_tes-sync._tcp.local.";
/// The port asked for first, so a firewall rule stays put; any free one if it's taken.
const PORT: u16 = 47615;
/// How long a pairing code works, and how many wrong tries it takes.
const CODE_FOR: u64 = 2 * 60_000;
const MAX_TRIES: u32 = 5;
/// The most a pairing or hello request may carry; a sync carries the whole journal.
const SMALL: usize = 4096;
const BIG: usize = 64_000_000;
/// Requests handled at once. Each sync from a device holds one while the page merges it.
const WORKERS: usize = 6;
/// How long the page has to take up a sync (sync_claim), and once it has, to finish it.
const UNCLAIMED_WAIT: Duration = Duration::from_secs(15);
const CLAIMED_WAIT: Duration = Duration::from_secs(120);

#[derive(Serialize, Deserialize, Clone)]
pub struct Device {
    pub id: String,
    pub name: String,
    /// The key agreed when it paired (hex). One paired before sync was encrypted has none.
    #[serde(default)]
    key: String,
    pub paired: u64,
    pub seen: u64,
    /// The highest request counter taken from it: a request with one no higher is a replay.
    #[serde(default)]
    ctr: u64,
}

impl Device {
    fn key(&self) -> Option<Vec<u8>> {
        crypto::unhex(&self.key).filter(|k| k.len() == 32)
    }
}

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    id: String,
    name: String,
    paired: u64,
    seen: u64,
}

/// The pairing code showing in Settings: until when (ms), wrong tries so far, and the pairings begun with
/// it (by session), waiting for the phone's proof.
struct Code {
    code: String,
    until: u64,
    tries: u32,
    sessions: HashMap<String, (crypto::Shared, u64)>,
}

/// A sync waiting for the page's answer.
struct Waiting {
    tx: mpsc::Sender<serde_json::Value>,
    device: String,
    claimed: bool,
}

/// The server while it runs.
struct Running {
    port: u16,
    stop: Arc<AtomicBool>,
    /// Kept so the Bonjour announcement lasts as long as the server.
    mdns: Option<mdns_sd::ServiceDaemon>,
}

#[derive(Default)]
pub struct Sync {
    data: Mutex<Option<PathBuf>>,
    app: Mutex<Option<AppHandle>>,
    /// Held across every read-modify-write of sync-devices.json.
    devices_lock: Mutex<()>,
    code: Mutex<Option<Code>>,
    /// Requests waiting for the page's merge, by number.
    waiting: Mutex<HashMap<u64, Waiting>>,
    /// Devices with a sync under way: one each at a time.
    busy: Mutex<HashSet<String>>,
    next: Mutex<u64>,
    running: Mutex<Option<Running>>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn random_hex(bytes: usize) -> Result<String, String> {
    crypto::random(bytes).map(|b| crypto::hex(&b))
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

/// An address on the home network (or this computer): the only ones answered.
pub fn home_network(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(a) => a.is_private() || a.is_loopback() || a.is_link_local(),
        IpAddr::V6(a) => {
            let s = a.segments()[0];
            a.is_loopback()
                || (s & 0xffc0) == 0xfe80
                || (s & 0xfe00) == 0xfc00
                || a.to_ipv4_mapped().is_some_and(|v| home_network(IpAddr::V4(v)))
        }
    }
}

impl Sync {
    fn devices_path(&self) -> Option<PathBuf> {
        self.data.lock().unwrap().as_ref().map(|d| d.join("sync-devices.json"))
    }

    /// The devices paired, without any paired before sync was encrypted (they have no key).
    pub fn devices(&self) -> Vec<Device> {
        let all: Vec<Device> = self
            .devices_path()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        all.into_iter().filter(|d| d.key().is_some()).collect()
    }

    fn save_devices(&self, ds: &[Device]) {
        if let Some(p) = self.devices_path() {
            if let Err(e) = crate::store::write_text_atomic(&p, &serde_json::to_string_pretty(ds).unwrap_or_default()) {
                eprintln!("sync: couldn't save the devices: {e}");
            }
        }
    }

    /// Reads the devices, changes them, and saves them if `f` says so, all under one lock.
    fn with_devices<T>(&self, f: impl FnOnce(&mut Vec<Device>) -> (T, bool)) -> T {
        let _held = self.devices_lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut ds = self.devices();
        let (out, changed) = f(&mut ds);
        if changed {
            self.save_devices(&ds);
        }
        out
    }

    pub fn infos(&self) -> Vec<DeviceInfo> {
        self.devices().into_iter().map(|d| DeviceInfo { id: d.id, name: d.name, paired: d.paired, seen: d.seen }).collect()
    }

    pub fn forget(self: &Arc<Self>, id: &str) {
        self.with_devices(|ds| {
            ds.retain(|d| d.id != id);
            ((), true)
        });
        self.update();
    }

    fn code_showing(&self) -> bool {
        self.code.lock().unwrap().as_ref().is_some_and(|c| now_ms() < c.until)
    }

    /// A new pairing code, good for two minutes; the server is started for it if need be.
    pub fn new_code(self: &Arc<Self>) -> Result<String, String> {
        let b = crypto::random(4)?;
        let code = format!("{:06}", u32::from_le_bytes([b[0], b[1], b[2], b[3]]) % 1_000_000);
        let until = now_ms() + CODE_FOR;
        *self.code.lock().unwrap() = Some(Code { code: code.clone(), until, tries: 0, sessions: HashMap::new() });
        self.update();
        if self.port() == 0 {
            return Err("The computer couldn't start listening for the phone on this network.".into());
        }
        // Gone when it runs out, and the server with it if nothing is paired.
        let me = self.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(CODE_FOR + 1000));
            let mut c = me.code.lock().unwrap();
            if c.as_ref().is_some_and(|c| c.until == until) {
                *c = None;
                drop(c);
                me.update();
            }
        });
        Ok(code)
    }

    /// The code no longer shown (Settings closed).
    pub fn cancel_code(self: &Arc<Self>) {
        *self.code.lock().unwrap() = None;
        self.update();
    }

    pub fn port(&self) -> u16 {
        self.running.lock().unwrap().as_ref().map_or(0, |r| r.port)
    }

    /// The page takes up a sync: false if it has been given up on (the phone was told it failed) or its
    /// device has been forgotten since, and then the page changes nothing.
    pub fn claim(&self, rid: u64) -> bool {
        let mut w = self.waiting.lock().unwrap();
        let Some(x) = w.get_mut(&rid) else { return false };
        let device = x.device.clone();
        if !self.devices().iter().any(|d| d.id == device) {
            return false;
        }
        x.claimed = true;
        true
    }

    /// The page's answer to a sync request.
    pub fn reply(&self, rid: u64, merged: serde_json::Value) {
        if let Some(w) = self.waiting.lock().unwrap().remove(&rid) {
            let _ = w.tx.send(merged);
        }
    }

    /// Starts the server and its announcement when a device is paired or a code is showing; stops them
    /// when neither.
    fn update(self: &Arc<Self>) {
        let wanted = self.code_showing() || !self.devices().is_empty();
        let mut running = self.running.lock().unwrap();
        if wanted && running.is_none() {
            *running = self.listen();
        } else if !wanted {
            if let Some(r) = running.take() {
                r.stop.store(true, Ordering::SeqCst);
                if let Some(m) = r.mdns {
                    let _ = m.shutdown();
                }
            }
        }
    }

    fn listen(self: &Arc<Self>) -> Option<Running> {
        let app = self.app.lock().unwrap().clone()?;
        let server = tiny_http::Server::http(("0.0.0.0", PORT)).or_else(|_| tiny_http::Server::http(("0.0.0.0", 0))).ok()?;
        let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
        let server = Arc::new(server);
        let stop = Arc::new(AtomicBool::new(false));
        // A few threads take requests in turn; the listener closes when the last of them lets go.
        for _ in 0..WORKERS {
            let (server, stop, app, sync) = (server.clone(), stop.clone(), app.clone(), self.clone());
            std::thread::spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    if let Ok(Some(req)) = server.recv_timeout(Duration::from_millis(500)) {
                        handle(&app, &sync, req);
                    }
                }
            });
        }
        Some(Running { port, stop, mdns: announce(port) })
    }
}

#[derive(Deserialize)]
struct PairStart {
    msg: String,
}

#[derive(Deserialize)]
struct PairFinish {
    session: String,
    proof: String,
    name: String,
}

/// An encrypted request's contents.
#[derive(Deserialize)]
struct Sealed {
    ctr: u64,
    #[serde(default)]
    body: serde_json::Value,
}

/// Starts sync: the server, if a device is paired; otherwise it waits for a pairing code.
pub fn start(app: &AppHandle, data: PathBuf) {
    let sync = app.state::<Arc<Sync>>().inner().clone();
    *sync.data.lock().unwrap() = Some(data);
    *sync.app.lock().unwrap() = Some(app.clone());
    // Debug builds: a fixed pairing code from TES_PAIR_CODE, for testing with the phone app unattended.
    if cfg!(debug_assertions) {
        if let Ok(c) = std::env::var("TES_PAIR_CODE") {
            *sync.code.lock().unwrap() = Some(Code { code: c, until: u64::MAX, tries: 0, sessions: HashMap::new() });
        }
    }
    sync.update();
}

fn announce(port: u16) -> Option<mdns_sd::ServiceDaemon> {
    let d = mdns_sd::ServiceDaemon::new().ok()?;
    // IPv4 only: the server listens on IPv4, and a phone given an IPv6 address would be refused.
    let _ = d.disable_interface(mdns_sd::IfKind::IPv6);
    let name = computer_name();
    let host = format!("tes-{}.local.", random_hex(4).ok()?);
    // Its address too: Android may be told only an IPv6 link-local one (fe80::), which can't be connected to.
    let ip = local_ip();
    let props = [("app", "tes"), ("v", "2"), ("ip", ip.as_str())];
    if let Ok(info) = mdns_sd::ServiceInfo::new(SERVICE, &name, &host, "", port, &props[..]) {
        let _ = d.register(info.enable_addr_auto());
    }
    Some(d)
}

fn respond_text(req: tiny_http::Request, status: u16, body: String) {
    let h = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    let _ = req.respond(tiny_http::Response::from_string(body).with_status_code(status).with_header(h));
}

fn respond(req: tiny_http::Request, status: u16, body: serde_json::Value) {
    respond_text(req, status, body.to_string())
}

fn error(req: tiny_http::Request, status: u16, msg: &str) {
    respond(req, status, serde_json::json!({ "error": msg }))
}

/// The body, if its stated length is within `max` (checked before anything is read).
fn body(req: &mut tiny_http::Request, max: usize) -> Option<String> {
    if req.body_length().is_some_and(|n| n > max) {
        return None;
    }
    let mut s = String::new();
    req.as_reader().take(max as u64 + 1).read_to_string(&mut s).ok()?;
    (s.len() <= max).then_some(s)
}

const WRONG_CODE: &str = "That code isn't the one shown on the computer, or it has expired.";

fn handle(app: &AppHandle, sync: &Arc<Sync>, mut req: tiny_http::Request) {
    if !req.remote_addr().is_some_and(|a| home_network(a.ip())) {
        return error(req, 403, "Only devices on the same network can sync.");
    }
    let url = req.url().to_string();
    match (req.method().clone(), url.as_str()) {
        // Found over Bonjour: the app, and its name. Nothing secret.
        (tiny_http::Method::Get, "/hello") => respond(req, 200, serde_json::json!({"app": "tes", "v": 2, "name": computer_name()})),
        (tiny_http::Method::Post, "/pair/start") => {
            let Some(p) = body(&mut req, SMALL).and_then(|b| serde_json::from_str::<PairStart>(&b).ok()) else {
                return error(req, 400, "bad request");
            };
            let mut code = sync.code.lock().unwrap();
            let Some(c) = code.as_mut().filter(|c| now_ms() < c.until) else {
                drop(code);
                return error(req, 403, WRONG_CODE);
            };
            let (Ok((msg, shared)), Ok(session)) = (crypto::computer_answer(&c.code, &p.msg), random_hex(16)) else {
                drop(code);
                return error(req, 400, "bad request");
            };
            // A few begun at once at most; the oldest go.
            c.sessions.retain(|_, (_, t)| now_ms() < *t);
            if c.sessions.len() >= 4 {
                let oldest = c.sessions.iter().min_by_key(|(_, (_, t))| *t).map(|(k, _)| k.clone());
                if let Some(k) = oldest {
                    c.sessions.remove(&k);
                }
            }
            c.sessions.insert(session.clone(), (shared, now_ms() + 60_000));
            drop(code);
            respond(req, 200, serde_json::json!({"session": session, "msg": msg}))
        }
        (tiny_http::Method::Post, "/pair/finish") => {
            let Some(p) = body(&mut req, SMALL).and_then(|b| serde_json::from_str::<PairFinish>(&b).ok()) else {
                return error(req, 400, "bad request");
            };
            // The proof is checked, and the code used up or a wrong try counted, under one lock.
            let mut code = sync.code.lock().unwrap();
            let shared = code.as_mut().filter(|c| now_ms() < c.until).and_then(|c| c.sessions.remove(&p.session)).map(|(s, _)| s);
            let ok = shared.as_ref().is_some_and(|s| s.check_phone(&p.proof));
            let Some(shared) = shared.filter(|_| ok) else {
                let gone = code.as_mut().is_some_and(|c| {
                    c.tries += 1;
                    c.tries >= MAX_TRIES
                });
                if gone {
                    *code = None;
                    let _ = app.emit("sync-code", "tries");
                }
                drop(code);
                // Slows guessing.
                std::thread::sleep(Duration::from_secs(1));
                sync.update();
                return error(req, 403, WRONG_CODE);
            };
            *code = None;
            drop(code);
            let Ok(id) = random_hex(8) else { return error(req, 500, "The computer couldn't pair.") };
            let d = Device {
                id: id.clone(),
                name: p.name.chars().take(60).collect(),
                key: crypto::hex(&shared.key),
                paired: now_ms(),
                seen: 0,
                ctr: 0,
            };
            sync.with_devices(|ds| {
                ds.push(d);
                ((), true)
            });
            let _ = app.emit("sync-devices", ());
            respond(req, 200, serde_json::json!({"id": id, "name": computer_name(), "proof": shared.computer_proof()}))
        }
        (tiny_http::Method::Post, path @ ("/hello" | "/sync")) => sealed(app, sync, req, path),
        _ => error(req, 404, "not found"),
    }
}

/// An encrypted request from a paired device: which one is known before its body is read.
fn sealed(app: &AppHandle, sync: &Arc<Sync>, mut req: tiny_http::Request, path: &str) {
    let id = req.headers().iter().find(|h| h.field.equiv("X-Tes-Device")).map(|h| h.value.as_str().to_string()).unwrap_or_default();
    let Some(key) = sync.devices().into_iter().find(|d| !id.is_empty() && d.id == id).and_then(|d| d.key()) else {
        return error(req, 401, "not paired");
    };
    let Some(text) = body(&mut req, if path == "/sync" { BIG } else { SMALL }) else {
        return error(req, 413, "too large");
    };
    let Some(inner) =
        crypto::open(&key, &crypto::request_aad(&id, path), &text).ok().and_then(|p| serde_json::from_slice::<Sealed>(&p).ok())
    else {
        return error(req, 401, "not paired");
    };
    // Each request's counter is higher than the last: one sent again is refused.
    let fresh = sync.with_devices(|ds| match ds.iter_mut().find(|d| d.id == id) {
        Some(d) if inner.ctr > d.ctr => {
            d.ctr = inner.ctr;
            (true, true)
        }
        _ => (false, false),
    });
    if !fresh {
        return error(req, 409, "That request was sent before.");
    }
    let reply = |req: tiny_http::Request, body: serde_json::Value| match crypto::seal(
        &key,
        &crypto::reply_aad(&id, path, inner.ctr),
        body.to_string().as_bytes(),
    ) {
        Ok(s) => respond_text(req, 200, s),
        Err(e) => error(req, 500, &e),
    };
    if path == "/hello" {
        return reply(req, serde_json::json!({"app": "tes", "name": computer_name()}));
    }
    if !sync.busy.lock().unwrap().insert(id.clone()) {
        return error(req, 429, "A sync from this device is already under way.");
    }
    let out = sync_one(app, sync, &id, inner.body);
    sync.busy.lock().unwrap().remove(&id);
    match out {
        Ok(merged) => reply(req, merged),
        Err((status, msg)) => error(req, status, &msg),
    }
}

/// Passes a device's sync to the page and waits for its merge.
fn sync_one(app: &AppHandle, sync: &Arc<Sync>, id: &str, payload: serde_json::Value) -> Result<serde_json::Value, (u16, String)> {
    let rid = {
        let mut n = sync.next.lock().unwrap();
        *n += 1;
        *n
    };
    let name = sync.devices().into_iter().find(|d| d.id == id).map(|d| d.name).unwrap_or_default();
    let (tx, rx) = mpsc::channel();
    sync.waiting.lock().unwrap().insert(rid, Waiting { tx, device: id.to_string(), claimed: false });
    let _ = app.emit("sync-request", serde_json::json!({"rid": rid, "device": name, "payload": payload}));
    let gave_up = || {
        sync.waiting.lock().unwrap().remove(&rid);
        Err((503, "The app on the computer didn't answer.".to_string()))
    };
    let merged = match rx.recv_timeout(UNCLAIMED_WAIT) {
        Ok(m) => m,
        Err(_) => {
            // Taken up by the page (it's writing the journal): waited for. Otherwise given up on, under
            // the same lock as a claim, so the page then changes nothing.
            let claimed = {
                let mut w = sync.waiting.lock().unwrap();
                match w.get(&rid) {
                    Some(x) if x.claimed => true,
                    Some(_) => {
                        w.remove(&rid);
                        false
                    }
                    None => true, // answered just now
                }
            };
            if !claimed {
                return Err((503, "The app on the computer didn't answer.".to_string()));
            }
            match rx.recv_timeout(CLAIMED_WAIT) {
                Ok(m) => m,
                Err(_) => return gave_up(),
            }
        }
    };
    if let Some(e) = merged.get("error").and_then(|e| e.as_str()) {
        return Err((503, e.to_string()));
    }
    // Only this device's own entry is touched, as it is now: forgotten meanwhile, it gets nothing.
    let known = sync.with_devices(|ds| match ds.iter_mut().find(|d| d.id == id) {
        Some(d) => {
            d.seen = now_ms();
            (true, true)
        }
        None => (false, false),
    });
    if !known {
        return Err((401, "not paired".into()));
    }
    let _ = app.emit("sync-devices", ());
    Ok(merged)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_home_network() {
        for a in ["192.168.1.5", "10.0.0.2", "172.16.4.1", "127.0.0.1", "169.254.1.1", "fe80::1", "fd00::1", "::1", "::ffff:192.168.1.5"] {
            assert!(home_network(a.parse().unwrap()), "{a}");
        }
        for a in ["8.8.8.8", "100.64.0.1", "2001:db8::1", "::ffff:8.8.8.8"] {
            assert!(!home_network(a.parse().unwrap()), "{a}");
        }
    }

    #[test]
    fn devices_paired_before_encryption_are_dropped() {
        let dir = std::env::temp_dir().join(format!("tes-sync-devices-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let key = crypto::hex(&[7u8; 32]);
        std::fs::write(
            dir.join("sync-devices.json"),
            format!(r#"[{{"id":"a","name":"Old","token":"t","paired":1,"seen":2}},{{"id":"b","name":"New","key":"{key}","paired":1,"seen":2,"ctr":5}}]"#),
        )
        .unwrap();
        let s = Sync::default();
        *s.data.lock().unwrap() = Some(dir.clone());
        let ds = s.devices();
        assert_eq!(ds.len(), 1);
        assert_eq!(ds[0].id, "b");
        assert_eq!(ds[0].ctr, 5);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
