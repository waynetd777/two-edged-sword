// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Sync's encryption, the same on both sides: the computer's sync.rs and the phone app's sync.rs (which
//! compiles this file in with #[path]).
//!
//! Pairing is SPAKE2 with the six-digit code as its password: each side sends one message, and both get
//! the same key only if they used the same code. Someone listening learns nothing they can test codes
//! against; someone in the middle gets one guess per pairing. Each side then proves it has the key (an
//! HMAC of both messages) before anything is kept. The key that's kept is derived from it with HKDF.
//!
//! After that every request and reply body is AES-256-GCM with a random nonce. The device's id goes in
//! clear (a header) so the computer knows which key to use; the request carries a counter that must be
//! higher than the last one the computer accepted from that device, so a request recorded on the network
//! can't be sent again; the reply is bound to the request's path and counter, so it can't be swapped.

// Each app uses its own side's half.
#![allow(dead_code)]

use aes_gcm::aead::{rand_core::RngCore, Aead, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use spake2::{Ed25519Group, Identity, Password, Spake2};

/// Which side is which in SPAKE2: the phone starts, the computer answers.
const PHONE: &[u8] = b"tes-sync phone";
const COMPUTER: &[u8] = b"tes-sync computer";

/// Random bytes from the system; an error rather than zeros if it can't give them.
pub fn random(n: usize) -> Result<Vec<u8>, String> {
    let mut b = vec![0u8; n];
    OsRng.try_fill_bytes(&mut b).map_err(|e| format!("no randomness: {e}"))?;
    Ok(b)
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn unhex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

fn b64(b: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(b)
}

fn unb64(s: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD.decode(s).map_err(|_| "bad encoding".to_string())
}

/// The phone's first step: its SPAKE2 state, and the message to send (base64).
pub fn phone_start(code: &str) -> (Spake2<Ed25519Group>, String) {
    let (s, msg) = Spake2::<Ed25519Group>::start_a(&Password::new(code.trim().as_bytes()), &Identity::new(PHONE), &Identity::new(COMPUTER));
    (s, b64(&msg))
}

/// The computer's step: given the phone's message, its own message (base64) and what both will share.
pub fn computer_answer(code: &str, phone_msg: &str) -> Result<(String, Shared), String> {
    let pm = unb64(phone_msg)?;
    let (s, cm) = Spake2::<Ed25519Group>::start_b(&Password::new(code.trim().as_bytes()), &Identity::new(PHONE), &Identity::new(COMPUTER));
    let k = s.finish(&pm).map_err(|_| "bad pairing message".to_string())?;
    Ok((b64(&cm), Shared::new(&k, &pm, &cm)))
}

/// The phone's second step, with the computer's message.
pub fn phone_finish(s: Spake2<Ed25519Group>, phone_msg: &str, computer_msg: &str) -> Result<Shared, String> {
    let (pm, cm) = (unb64(phone_msg)?, unb64(computer_msg)?);
    let k = s.finish(&cm).map_err(|_| "bad pairing message".to_string())?;
    Ok(Shared::new(&k, &pm, &cm))
}

/// What pairing leaves both sides with: proofs of the key each way, and the key that's kept.
pub struct Shared {
    confirm_phone: [u8; 32],
    confirm_computer: [u8; 32],
    pub key: [u8; 32],
}

impl Shared {
    fn new(k: &[u8], pm: &[u8], cm: &[u8]) -> Shared {
        // Both messages go in, so the keys are this exchange's alone.
        let mut transcript = Vec::with_capacity(pm.len() + cm.len());
        transcript.extend_from_slice(pm);
        transcript.extend_from_slice(cm);
        let hk = hkdf::Hkdf::<Sha256>::new(Some(&transcript), k);
        let mut out = Shared { confirm_phone: [0; 32], confirm_computer: [0; 32], key: [0; 32] };
        // Lengths are fixed and short, so expand can't fail.
        let _ = hk.expand(b"tes-sync confirm phone", &mut out.confirm_phone);
        let _ = hk.expand(b"tes-sync confirm computer", &mut out.confirm_computer);
        let _ = hk.expand(b"tes-sync key v1", &mut out.key);
        out
    }

    fn mac(key: &[u8; 32]) -> Hmac<Sha256> {
        <Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC takes any key length")
    }

    /// The phone's proof that it has the key (base64).
    pub fn phone_proof(&self) -> String {
        let mut m = Self::mac(&self.confirm_phone);
        m.update(b"phone");
        b64(&m.finalize().into_bytes())
    }

    pub fn computer_proof(&self) -> String {
        let mut m = Self::mac(&self.confirm_computer);
        m.update(b"computer");
        b64(&m.finalize().into_bytes())
    }

    /// Checked in constant time.
    pub fn check_phone(&self, proof: &str) -> bool {
        let mut m = Self::mac(&self.confirm_phone);
        m.update(b"phone");
        unb64(proof).is_ok_and(|p| m.verify_slice(&p).is_ok())
    }

    pub fn check_computer(&self, proof: &str) -> bool {
        let mut m = Self::mac(&self.confirm_computer);
        m.update(b"computer");
        unb64(proof).is_ok_and(|p| m.verify_slice(&p).is_ok())
    }
}

/// What a request's body is encrypted with besides the key: the device and the path.
pub fn request_aad(device: &str, path: &str) -> String {
    format!("tes-sync v1 request {device} {path}")
}

/// A reply's: the request it answers.
pub fn reply_aad(device: &str, path: &str, ctr: u64) -> String {
    format!("tes-sync v1 reply {device} {path} {ctr}")
}

/// `plain` encrypted, as the JSON sent: {"n": nonce, "c": ciphertext}, both base64.
pub fn seal(key: &[u8], aad: &str, plain: &[u8]) -> Result<String, String> {
    let c = Aes256Gcm::new_from_slice(key).map_err(|_| "bad key".to_string())?;
    let n = random(12)?;
    let ct = c.encrypt(Nonce::from_slice(&n), Payload { msg: plain, aad: aad.as_bytes() }).map_err(|_| "couldn't encrypt".to_string())?;
    Ok(serde_json::json!({"n": b64(&n), "c": b64(&ct)}).to_string())
}

/// The plain text of what `seal` made; an error if it was made with another key or for another purpose,
/// or changed on the way.
pub fn open(key: &[u8], aad: &str, sealed: &str) -> Result<Vec<u8>, String> {
    let bad = || "couldn't decrypt".to_string();
    let v: serde_json::Value = serde_json::from_str(sealed).map_err(|_| bad())?;
    let (n, ct) = (unb64(v["n"].as_str().ok_or_else(bad)?)?, unb64(v["c"].as_str().ok_or_else(bad)?)?);
    if n.len() != 12 {
        return Err(bad());
    }
    let c = Aes256Gcm::new_from_slice(key).map_err(|_| bad())?;
    c.decrypt(Nonce::from_slice(&n), Payload { msg: &ct, aad: aad.as_bytes() }).map_err(|_| bad())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_agrees_only_with_the_same_code() {
        let (s, pm) = phone_start("123456");
        let (cm, computer) = computer_answer("123456", &pm).unwrap();
        let phone = phone_finish(s, &pm, &cm).unwrap();
        assert_eq!(phone.key, computer.key);
        assert!(computer.check_phone(&phone.phone_proof()));
        assert!(phone.check_computer(&computer.computer_proof()));
        // A proof one way isn't one the other way.
        assert!(!phone.check_computer(&phone.phone_proof()));

        let (s, pm) = phone_start("123456");
        let (cm, computer) = computer_answer("654321", &pm).unwrap();
        let phone = phone_finish(s, &pm, &cm).unwrap();
        assert_ne!(phone.key, computer.key);
        assert!(!computer.check_phone(&phone.phone_proof()));
        assert!(!phone.check_computer(&computer.computer_proof()));
        assert!(!computer.check_phone("not base64!"));
    }

    #[test]
    fn sealed_opens_only_with_its_key_and_purpose() {
        let key = random(32).unwrap();
        let other = random(32).unwrap();
        let s = seal(&key, &request_aad("dev", "/sync"), b"{\"a\":1}").unwrap();
        assert_eq!(open(&key, &request_aad("dev", "/sync"), &s).unwrap(), b"{\"a\":1}");
        assert!(open(&other, &request_aad("dev", "/sync"), &s).is_err());
        assert!(open(&key, &request_aad("dev2", "/sync"), &s).is_err());
        assert!(open(&key, &reply_aad("dev", "/sync", 1), &s).is_err());
        // Changed on the way.
        let mut v: serde_json::Value = serde_json::from_str(&s).unwrap();
        let mut ct = unb64(v["c"].as_str().unwrap()).unwrap();
        ct[0] ^= 1;
        v["c"] = b64(&ct).into();
        assert!(open(&key, &request_aad("dev", "/sync"), &v.to_string()).is_err());
        assert!(open(&key, "x", "not json").is_err());
        // Two seals of the same text differ (a fresh nonce each time).
        assert_ne!(seal(&key, "x", b"same").unwrap(), seal(&key, "x", b"same").unwrap());
    }

    #[test]
    fn hex_round_trips() {
        assert_eq!(unhex(&hex(&[0, 1, 254, 255])).unwrap(), vec![0, 1, 254, 255]);
        assert!(unhex("abc").is_none() && unhex("zz").is_none());
    }
}
