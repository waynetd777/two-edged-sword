//! Spelling for the journal, from macOS's own spell checker (the one TextEdit and Mail use):
//! the misspelled words in a text, the guesses for one, the automatic correction for one when
//! the user has "Correct spelling automatically" on, and learning or ignoring a word. Offsets
//! are UTF-16, as in NSString and in JavaScript strings. Called on the main thread (the
//! commands aren't async), where AppKit wants it.

use objc2_app_kit::NSSpellChecker;
use objc2_foundation::{NSRange, NSString};
use std::sync::OnceLock;

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
        let r = unsafe { sc.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(&s, at as isize, None, false, tag(), std::ptr::null_mut()) };
        if r.length == 0 || r.location >= len {
            break;
        }
        out.push((r.location, r.length));
        at = r.location + r.length;
    }
    out
}

pub fn guesses(word: &str) -> Vec<String> {
    let sc = NSSpellChecker::sharedSpellChecker();
    let s = NSString::from_str(word);
    let Some(a) = sc.guessesForWordRange_inString_language_inSpellDocumentWithTag(NSRange::new(0, s.length()), &s, None, tag()) else { return vec![] };
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
