// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Spelling and grammar for the journal on Windows, as spell.rs gives them on macOS. Spelling is
//! Windows' own spell checker (the one Edge and Office use): the misspelled words, the guesses for
//! one, its automatic correction, and adding or ignoring a word. Windows has no grammar checker
//! for apps, so grammar is Harper's, which runs here on the PC: nothing written leaves it.
//! Offsets are UTF-16, as in JavaScript strings. Every word in the KJV counts as spelled right,
//! and sentences in KJV English ("he maketh me", "thou art") aren't grammar-checked.

pub use crate::kjv_words::kjv_ready;
use crate::kjv_words::{in_kjv, words, KJV_MARKERS};
use harper_core::linting::{LintGroup, LintKind, Linter, Suggestion};
use harper_core::spell::FstDictionary;
use harper_core::{Dialect, Document};
use serde::Serialize;
use windows::core::{HSTRING, PWSTR};
use windows::Win32::Globalization::{
    GetUserDefaultLocaleName, ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory, CORRECTIVE_ACTION_DELETE, CORRECTIVE_ACTION_REPLACE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};

/// A grammar problem: where it is (UTF-16, as for spelling), Harper's explanation, and its fixes.
#[derive(Serialize)]
pub struct GrammarIssue {
    pub start: usize,
    pub len: usize,
    pub description: String,
    pub corrections: Vec<String>,
}

thread_local! {
    /// The spell checker for the user's language, made once on each thread that asks (COM wants it
    /// made where it's used).
    static CHECKER: Option<ISpellChecker> = make_checker();
}

/// Harper's checks: made once, as that takes a few seconds, at start with the KJV's words.
fn harper() -> &'static std::sync::Mutex<LintGroup> {
    static H: std::sync::OnceLock<std::sync::Mutex<LintGroup>> = std::sync::OnceLock::new();
    H.get_or_init(|| std::sync::Mutex::new(LintGroup::new_curated(FstDictionary::curated(), dialect())))
}

/// Reads the KJV's words and sets Harper up, off the main thread.
pub fn load_kjv(lib: &crate::library::Library) {
    crate::kjv_words::load_kjv(lib);
    harper();
}

/// The user's language as Windows names it ("en-ZA"), or US English.
fn locale() -> String {
    let mut buf = [0u16; 85];
    let n = unsafe { GetUserDefaultLocaleName(&mut buf) };
    if n > 1 {
        String::from_utf16_lossy(&buf[..n as usize - 1])
    } else {
        "en-US".into()
    }
}

/// Harper's English nearest the user's: British spelling outside North America.
fn dialect() -> Dialect {
    match locale().as_str() {
        "en-US" => Dialect::American,
        "en-CA" => Dialect::Canadian,
        "en-AU" | "en-NZ" => Dialect::Australian,
        "en-IN" => Dialect::Indian,
        _ => Dialect::British,
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

/// The kinds of Harper's checks that are grammar, as macOS's are: not spelling (Windows does
/// that), and not its advice on style.
fn is_grammar(k: &LintKind) -> bool {
    matches!(
        k,
        LintKind::Agreement
            | LintKind::BoundaryError
            | LintKind::Capitalization
            | LintKind::Eggcorn
            | LintKind::Grammar
            | LintKind::Malapropism
            | LintKind::Punctuation
            | LintKind::Repetition
            | LintKind::Typo
            | LintKind::Usage
            | LintKind::WordChoice
            | LintKind::WordOrder
    )
}

/// The grammar problems. One inside a sentence in KJV English is left out.
pub fn grammar(text: &str) -> Vec<GrammarIssue> {
    let chars: Vec<char> = text.chars().collect();
    // Each char's UTF-16 offset, and the end.
    let mut at16 = Vec::with_capacity(chars.len() + 1);
    let mut n = 0;
    for c in &chars {
        at16.push(n);
        n += c.len_utf16();
    }
    at16.push(n);
    // Harper doesn't know a lowercase "i" for the pronoun, so it reads it as "I" (the same length,
    // so every offset holds), and the lowercase one is reported here.
    let lone_i = |k: usize| {
        chars[k] == 'i' && (k == 0 || !chars[k - 1].is_alphanumeric()) && chars.get(k + 1).is_none_or(|c| !c.is_alphanumeric() && *c != '.')
    };
    let lower_i: Vec<usize> = (0..chars.len()).filter(|&k| lone_i(k)).collect();
    let fixed: String = chars.iter().enumerate().map(|(k, &c)| if lower_i.contains(&k) { 'I' } else { c }).collect();
    let lints = harper().lock().unwrap_or_else(|e| e.into_inner()).lint(&Document::new_plain_english_curated(&fixed));
    let sentence_of = |i: usize| {
        let is_end = |c: char| ".!?\n".contains(c);
        let from = chars[..i].iter().rposition(|&c| is_end(c)).map_or(0, |p| p + 1);
        let to = chars[i..].iter().position(|&c| is_end(c)).map_or(chars.len(), |p| i + p);
        // From the text Harper read, with its "I"s.
        fixed.chars().skip(from).take(to - from).collect::<String>()
    };
    let mut out: Vec<GrammarIssue> = lower_i
        .iter()
        .map(|&k| GrammarIssue {
            start: at16[k],
            len: 1,
            description: "“I” is always a capital letter.".into(),
            corrections: vec!["I".into()],
        })
        .collect();
    for l in lints.into_iter().filter(|l| is_grammar(&l.lint_kind)) {
        let (s, e) = (l.span.start.min(chars.len()), l.span.end.min(chars.len()));
        if s >= e || kjv_sentence(&sentence_of(s)) {
            continue;
        }
        let here: String = chars[s..e].iter().collect();
        let corrections = l
            .suggestions
            .iter()
            .map(|g| match g {
                Suggestion::ReplaceWith(r) => r.iter().collect(),
                Suggestion::InsertAfter(x) => format!("{here}{}", x.iter().collect::<String>()),
                Suggestion::Remove => String::new(),
            })
            .collect();
        out.push(GrammarIssue { start: at16[s], len: at16[e] - at16[s], description: l.message, corrections });
        if out.len() >= 500 {
            break;
        }
    }
    out
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
