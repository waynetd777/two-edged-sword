// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Spelling for the journal, from macOS's own spell checker (the one TextEdit and Mail use):
//! the misspelled words in a text, the guesses for one, the automatic correction for one when
//! the user has "Correct spelling automatically" on, and learning or ignoring a word. Offsets
//! are UTF-16, as in NSString and in JavaScript strings. Called on the main thread, where AppKit
//! wants it. Every word in the KJV counts as spelled right. Grammar is Harper's (grammar.rs), as
//! on Windows: macOS's own finds little more than a doubled word. A sentence in KJV English
//! ("he maketh me", "thou art") isn't grammar-checked.

pub use crate::grammar::GrammarIssue;
pub use crate::kjv_words::kjv_ready;
#[cfg(test)]
use crate::kjv_words::KJV;
use crate::kjv_words::{in_kjv, words, KJV_MARKERS};
use objc2_app_kit::NSSpellChecker;
use objc2_foundation::{NSLocale, NSRange, NSString};
use std::sync::OnceLock;

/// Reads the KJV's words and sets Harper up, off the main thread.
pub fn load_kjv(lib: &crate::library::Library) {
    crate::kjv_words::load_kjv(lib);
    crate::grammar::load();
}

/// The user's locale ("en_ZA"), for Harper's English.
pub fn locale() -> String {
    NSLocale::currentLocale().localeIdentifier().to_string()
}

/// Whether a sentence is in KJV English, for grammar. On the main thread.
pub fn is_kjv_sentence(sentence: &str) -> bool {
    kjv_sentence(&NSSpellChecker::sharedSpellChecker(), sentence)
}

/// Whether a sentence is in KJV English: it has thee, thou, hath… or a KJV word macOS doesn't know.
fn kjv_sentence(sc: &NSSpellChecker, sentence: &str) -> bool {
    if words(sentence).any(|w| KJV_MARKERS.contains(&w.as_str())) {
        return true;
    }
    let s = NSString::from_str(sentence);
    let (len, mut at) = (s.length(), 0usize);
    while at < len {
        let r = unsafe {
            sc.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                &s,
                at as isize,
                None,
                false,
                tag(),
                std::ptr::null_mut(),
            )
        };
        if r.length == 0 || r.location >= len {
            return false;
        }
        if in_kjv(&s.substringWithRange(r).to_string()) {
            return true;
        }
        at = r.location + r.length;
    }
    false
}

/// One document tag for the app, so words ignored stay ignored until it quits.
fn tag() -> isize {
    static T: OnceLock<isize> = OnceLock::new();
    *T.get_or_init(NSSpellChecker::uniqueSpellDocumentTag)
}

/// The misspelled words, as (start, length).
pub fn check(text: &str) -> Vec<(usize, usize)> {
    let sc = NSSpellChecker::sharedSpellChecker();
    let s = NSString::from_str(text);
    let (len, mut at, mut out) = (s.length(), 0usize, Vec::new());
    while at < len && out.len() < 1000 {
        let r = unsafe {
            sc.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                &s,
                at as isize,
                None,
                false,
                tag(),
                std::ptr::null_mut(),
            )
        };
        if r.length == 0 || r.location >= len {
            break;
        }
        if !in_kjv(&s.substringWithRange(r).to_string()) {
            out.push((r.location, r.length));
        }
        at = r.location + r.length;
    }
    out
}

pub fn guesses(word: &str) -> Vec<String> {
    let sc = NSSpellChecker::sharedSpellChecker();
    let s = NSString::from_str(word);
    let Some(a) = sc.guessesForWordRange_inString_language_inSpellDocumentWithTag(NSRange::new(0, s.length()), &s, None, tag()) else {
        return vec![];
    };
    (0..a.count()).map(|i| a.objectAtIndex(i).to_string()).collect()
}

/// What macOS would correct the word to as it's typed, if the user lets it correct spelling.
pub fn correction(word: &str) -> Option<String> {
    if !NSSpellChecker::isAutomaticSpellingCorrectionEnabled() {
        return None;
    }
    let sc = NSSpellChecker::sharedSpellChecker();
    let s = NSString::from_str(word);
    let lang = sc.language();
    let c = sc.correctionForWordRange_inString_language_inSpellDocumentWithTag(NSRange::new(0, s.length()), &s, &lang, tag())?.to_string();
    (c != word).then_some(c)
}

/// Adds the word to the user's dictionary (shared with every app).
pub fn learn(word: &str) {
    NSSpellChecker::sharedSpellChecker().learnWord(&NSString::from_str(word));
}

/// Leaves the word alone until the app quits.
pub fn ignore(word: &str) {
    NSSpellChecker::sharedSpellChecker().ignoreWord_inSpellDocumentWithTag(&NSString::from_str(word), tag());
}

#[cfg(test)]
mod tests {
    /// Against the modules on this Mac; skips itself where it is absent.
    #[test]
    fn kjv_spellings_and_sentences_pass() {
        let Some(lib) = crate::library::local("kjv.bbli") else { return };
        let t = std::time::Instant::now();
        super::load_kjv(&lib);
        println!("KJV words loaded: {} in {:?}", super::KJV.get().map_or(0, |k| k.len()), t.elapsed());
        let text = "He maketh me to lie down; there remaineth therefore a rest. Recieve this.";
        let u: Vec<u16> = text.encode_utf16().collect();
        let flagged: Vec<String> = super::check(text).iter().map(|&(a, l)| String::from_utf16_lossy(&u[a..a + l])).collect();
        assert_eq!(flagged, vec!["Recieve".to_string()]);
        assert!(super::is_kjv_sentence("He maketh me to lie down in green pastures."));
        assert!(!super::is_kjv_sentence("He went to the store."));
    }
}
