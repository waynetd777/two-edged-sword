// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Spelling and grammar for the journal on Windows, as spell.rs gives them on macOS. Spelling is
//! Windows' own spell checker (the one Edge and Office use): the misspelled words, the guesses for
//! one, its automatic correction, and adding or ignoring a word. Windows has no grammar checker
//! for apps; grammar is Harper's, as on macOS (grammar.rs).
//! Offsets are UTF-16, as in JavaScript strings. Every word in the KJV counts as spelled right,
//! and sentences in KJV English ("he maketh me", "thou art") aren't grammar-checked.

pub use crate::grammar::GrammarIssue;
pub use crate::kjv_words::kjv_ready;
use crate::kjv_words::{in_kjv, words, KJV_MARKERS};
use windows::core::{HSTRING, PWSTR};
use windows::Win32::Globalization::{
    GetUserDefaultLocaleName, ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory, CORRECTIVE_ACTION_DELETE, CORRECTIVE_ACTION_REPLACE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};

thread_local! {
    /// The spell checker for the user's language, made once on each thread that asks (COM wants it
    /// made where it's used).
    static CHECKER: Option<ISpellChecker> = make_checker();
}

/// Reads the KJV's words and sets Harper up, off the main thread.
pub fn load_kjv(lib: &crate::library::Library) {
    crate::kjv_words::load_kjv(lib);
    crate::grammar::load();
}

/// The user's language as Windows names it ("en-ZA"), or US English.
pub fn locale() -> String {
    let mut buf = [0u16; 85];
    let n = unsafe { GetUserDefaultLocaleName(&mut buf) };
    if n > 1 {
        String::from_utf16_lossy(&buf[..n as usize - 1])
    } else {
        "en-US".into()
    }
}

fn make_checker() -> Option<ISpellChecker> {
    unsafe {
        // Already set up on the main thread (as the web view's), which is as good.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let f: ISpellCheckerFactory = CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER).ok()?;
        let lang = locale();
        let supported = |l: &str| f.IsSupported(&HSTRING::from(l)).is_ok_and(|b| b.as_bool());
        let lang = if supported(&lang) { lang } else { "en-US".to_string() };
        f.CreateSpellChecker(&HSTRING::from(lang)).ok()
    }
}

fn with<T>(f: impl FnOnce(&ISpellChecker) -> T) -> Option<T> {
    CHECKER.with(|c| c.as_ref().map(f))
}

/// Windows' errors in `text`: (start, length, the automatic correction if it has one).
fn errors(sc: &ISpellChecker, text: &str) -> Vec<(usize, usize, Option<String>)> {
    let mut out = Vec::new();
    let Ok(errs) = (unsafe { sc.Check(&HSTRING::from(text)) }) else { return out };
    // Windows counts in UTF-16, as JavaScript does.
    loop {
        let mut next = None;
        // S_FALSE, with nothing, after the last.
        if unsafe { errs.Next(&mut next) } != windows::Win32::Foundation::S_OK {
            break;
        }
        let Some(e) = next else { break };
        let (start, len) = unsafe { (e.StartIndex().unwrap_or(0) as usize, e.Length().unwrap_or(0) as usize) };
        if len == 0 || out.len() >= 1000 {
            break;
        }
        let action = unsafe { e.CorrectiveAction() }.ok();
        // A word said twice ("the the") is grammar's to report, not spelling's.
        if action == Some(CORRECTIVE_ACTION_DELETE) {
            continue;
        }
        let fix = unsafe {
            if action == Some(CORRECTIVE_ACTION_REPLACE) {
                e.Replacement().ok().map(|p| take(p))
            } else {
                None
            }
        };
        out.push((start, len, fix));
    }
    out
}

/// A string Windows allocated, read and freed.
unsafe fn take(p: PWSTR) -> String {
    let s = p.to_string().unwrap_or_default();
    CoTaskMemFree(Some(p.0 as *const _));
    s
}

fn utf16_slice(text: &str, start: usize, len: usize) -> String {
    let u: Vec<u16> = text.encode_utf16().skip(start).take(len).collect();
    String::from_utf16_lossy(&u)
}

/// The misspelled words, as (start, length).
pub fn check(text: &str) -> Vec<(usize, usize)> {
    with(|sc| errors(sc, text).into_iter().filter(|(s, l, _)| !in_kjv(&utf16_slice(text, *s, *l))).map(|(s, l, _)| (s, l)).collect())
        .unwrap_or_default()
}

/// Whether a sentence is in KJV English: it has thee, thou, hath… or a KJV word Windows doesn't know.
fn kjv_sentence(sentence: &str) -> bool {
    words(sentence).any(|w| KJV_MARKERS.contains(&w.as_str()))
        || with(|sc| errors(sc, sentence).iter().any(|(s, l, _)| in_kjv(&utf16_slice(sentence, *s, *l)))).unwrap_or(false)
}

/// The grammar problems, from Harper. One inside a sentence in KJV English is left out.
pub fn grammar(text: &str) -> Vec<GrammarIssue> {
    crate::grammar::check(text, kjv_sentence)
}

pub fn guesses(word: &str) -> Vec<String> {
    with(|sc| {
        let mut out = Vec::new();
        let Ok(list) = (unsafe { sc.Suggest(&HSTRING::from(word)) }) else { return out };
        loop {
            let mut got = [PWSTR::null()];
            let mut n = 0u32;
            if unsafe { list.Next(&mut got, Some(&mut n)) }.is_err() || n == 0 {
                break;
            }
            out.push(unsafe { take(got[0]) });
        }
        out
    })
    .unwrap_or_default()
}

/// Windows' automatic correction for the word ("teh" to "the"), if it has one.
pub fn correction(word: &str) -> Option<String> {
    with(|sc| errors(sc, word).into_iter().find_map(|(_, _, fix)| fix)).flatten().filter(|c| c != word)
}

/// Adds the word to the user's dictionary (shared with every app).
pub fn learn(word: &str) {
    with(|sc| unsafe { sc.Add(&HSTRING::from(word)) });
}

/// Leaves the word alone until the app quits.
pub fn ignore(word: &str) {
    with(|sc| unsafe { sc.Ignore(&HSTRING::from(word)) });
}

#[cfg(test)]
mod tests {
    #[test]
    fn finds_a_misspelling_with_guesses() {
        let text = "This sentance is fine otherwise.";
        let found = super::check(text);
        assert_eq!(found, vec![(5, 8)], "{found:?}");
        assert!(super::guesses("sentance").iter().any(|g| g == "sentence"));
    }

    #[test]
    fn grammar_finds_a_doubled_word_with_its_fix() {
        let found = super::grammar("He went to the the store.");
        assert!(
            found.iter().any(|g| g.corrections.iter().any(|c| c == "the")),
            "{:?}",
            found.iter().map(|g| &g.description).collect::<Vec<_>>()
        );
    }

    #[test]
    fn a_lowercase_i_is_capitalised_and_checked() {
        let found = super::grammar("i are very happy");
        assert!(found.iter().any(|g| g.start == 0 && g.corrections == ["I"]));
        assert!(
            found.iter().any(|g| g.corrections.iter().any(|c| c.contains("am"))),
            "{:?}",
            found.iter().map(|g| &g.description).collect::<Vec<_>>()
        );
    }

    #[test]
    fn a_word_said_twice_is_grammar_not_spelling() {
        assert!(super::check("He went to the the store.").is_empty());
    }

    /// With the KJV's words read, as in the app; skips itself without the built-in KJV.
    #[test]
    fn with_the_kjv_a_doubled_word_is_still_found() {
        let Some(lib) = crate::library::local("kjv.bbli") else { return };
        super::load_kjv(&lib);
        assert!(!super::grammar("He went to the the store.").is_empty());
        assert!(super::check("He maketh me to lie down.").is_empty());
    }

    #[test]
    fn kjv_english_isnt_grammar_checked() {
        assert!(super::grammar("Thou art my son, this day have I begotten thee.").is_empty());
    }
}
