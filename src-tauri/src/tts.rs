// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Reading aloud through macOS's own synthesiser (AVSpeechSynthesizer). WebKit's speechSynthesis
//! only offers the voices that ship with the system and hides the Premium and Enhanced ones
//! people download, so the page speaks through here instead. Each utterance carries the page's
//! id; the word about to be spoken and the end of the utterance come back as "tts" events.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Voice {
    id: String,
    name: String,
    lang: String,
    /// 1 default, 2 enhanced, 3 premium.
    quality: isize,
    default: bool,
}

#[derive(Clone, Serialize)]
struct Event {
    id: u64,
    /// "word" (char/len: the word's UTF-16 range, as JS indexes strings) or "end".
    kind: &'static str,
    char: usize,
    len: usize,
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{Event, Voice};
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
    use objc2_avf_audio::{
        AVSpeechBoundary, AVSpeechSynthesisVoice, AVSpeechSynthesizer, AVSpeechSynthesizerDelegate, AVSpeechUtterance,
        AVSpeechUtteranceDefaultSpeechRate, AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceMinimumSpeechRate,
    };
    use objc2_foundation::{NSObject, NSObjectProtocol, NSRange, NSString};
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use tauri::{AppHandle, Emitter};

    pub struct Ivars {
        app: AppHandle,
        /// Utterance address → the page's id. The synthesiser holds each utterance until its
        /// finish or cancel callback, so an address is not reused while it is in here.
        ids: Mutex<HashMap<usize, u64>>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[ivars = Ivars]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl AVSpeechSynthesizerDelegate for Delegate {
            #[unsafe(method(speechSynthesizer:willSpeakRangeOfSpeechString:utterance:))]
            fn will_speak(&self, _s: &AVSpeechSynthesizer, r: NSRange, u: &AVSpeechUtterance) {
                self.send(u, "word", r.location, r.length, false);
            }

            #[unsafe(method(speechSynthesizer:didFinishSpeechUtterance:))]
            fn did_finish(&self, _s: &AVSpeechSynthesizer, u: &AVSpeechUtterance) {
                self.send(u, "end", 0, 0, true);
            }

            #[unsafe(method(speechSynthesizer:didCancelSpeechUtterance:))]
            fn did_cancel(&self, _s: &AVSpeechSynthesizer, u: &AVSpeechUtterance) {
                self.ivars().ids.lock().unwrap().remove(&(u as *const _ as usize));
            }
        }
    );

    impl Delegate {
        fn send(&self, u: &AVSpeechUtterance, kind: &'static str, char: usize, len: usize, last: bool) {
            let key = u as *const _ as usize;
            let mut ids = self.ivars().ids.lock().unwrap();
            let id = if last { ids.remove(&key) } else { ids.get(&key).copied() };
            drop(ids);
            if let Some(id) = id {
                let _ = self.ivars().app.emit("tts", Event { id, kind, char, len });
            }
        }
    }

    thread_local! {
        /// Lives on the main thread. The synthesiser holds its delegate weakly, so both are kept.
        static SYNTH: RefCell<Option<(Retained<AVSpeechSynthesizer>, Retained<Delegate>)>> = const { RefCell::new(None) };
    }

    fn with_synth(app: &AppHandle, f: impl FnOnce(&AVSpeechSynthesizer, &Delegate) + Send + 'static) {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            SYNTH.with(|cell| {
                let mut cell = cell.borrow_mut();
                let (synth, del) = cell.get_or_insert_with(|| {
                    let del = Delegate::alloc().set_ivars(Ivars { app: a, ids: Mutex::new(HashMap::new()) });
                    let del: Retained<Delegate> = unsafe { msg_send![super(del), init] };
                    let synth = unsafe { AVSpeechSynthesizer::new() };
                    unsafe { synth.setDelegate(Some(ProtocolObject::from_ref(&*del))) };
                    (synth, del)
                });
                f(synth, del);
            })
        });
    }

    pub fn voices() -> Vec<Voice> {
        unsafe {
            let default = AVSpeechSynthesisVoice::voiceWithLanguage(None).map(|v| v.identifier().to_string());
            AVSpeechSynthesisVoice::speechVoices()
                .iter()
                .map(|v| {
                    let id = v.identifier().to_string();
                    Voice {
                        default: default.as_deref() == Some(id.as_str()),
                        id,
                        name: v.name().to_string(),
                        lang: v.language().to_string(),
                        quality: v.quality().0,
                    }
                })
                .collect()
        }
    }

    /// `rate` is the page's speed (1 = normal), scaled the way WebKit scales it.
    pub fn speak(app: &AppHandle, id: u64, text: String, voice: Option<String>, rate: f32) {
        with_synth(app, move |synth, del| unsafe {
            synth.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate);
            let u = AVSpeechUtterance::speechUtteranceWithString(&NSString::from_str(&text));
            if let Some(v) = voice.and_then(|v| AVSpeechSynthesisVoice::voiceWithIdentifier(&NSString::from_str(&v))) {
                u.setVoice(Some(&v));
            }
            u.setRate(
                (AVSpeechUtteranceDefaultSpeechRate * rate).clamp(AVSpeechUtteranceMinimumSpeechRate, AVSpeechUtteranceMaximumSpeechRate),
            );
            del.ivars().ids.lock().unwrap().insert(Retained::as_ptr(&u) as usize, id);
            synth.speakUtterance(&u);
        });
    }

    /// Pauses mid-word (`on`), or carries on from there.
    pub fn pause(app: &AppHandle, on: bool) {
        with_synth(app, move |synth, _| unsafe {
            if on {
                synth.pauseSpeakingAtBoundary(AVSpeechBoundary::Immediate);
            } else {
                synth.continueSpeaking();
            }
        });
    }

    pub fn stop(app: &AppHandle) {
        with_synth(app, |synth, _| unsafe {
            synth.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate);
        });
    }
}

// Synchronous commands run on the main thread in order, so a stop and the next speak arrive in
// the order the page sent them.

#[tauri::command]
pub fn tts_voices() -> Vec<Voice> {
    #[cfg(target_os = "macos")]
    return mac::voices();
    #[cfg(not(target_os = "macos"))]
    Vec::new()
}

#[tauri::command]
pub fn tts_speak(app: AppHandle, id: u64, text: String, voice: Option<String>, rate: f32) {
    #[cfg(target_os = "macos")]
    mac::speak(&app, id, text, voice, rate);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, id, text, voice, rate);
}

#[tauri::command]
pub fn tts_pause(app: AppHandle, on: bool) {
    #[cfg(target_os = "macos")]
    mac::pause(&app, on);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, on);
}

#[tauri::command]
pub fn tts_stop(app: AppHandle) {
    #[cfg(target_os = "macos")]
    mac::stop(&app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}
