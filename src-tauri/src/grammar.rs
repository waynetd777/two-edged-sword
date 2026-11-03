// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Grammar for the journal, from Harper, on macOS and Windows alike: it runs here on the computer,
//! so nothing written leaves it. Spelling stays with the system's own checker (spell.rs,
//! spell_win.rs), which also says which sentences are in KJV English and so aren't checked.
//! Offsets are UTF-16, as in JavaScript strings.

use harper_core::linting::{LintGroup, LintKind, Linter, Suggestion};
use harper_core::spell::FstDictionary;
use harper_core::{Dialect, Document};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};

/// A grammar problem: where it is (UTF-16, as for spelling), Harper's explanation, and its fixes.
#[derive(Serialize)]
pub struct GrammarIssue {
    pub start: usize,
    pub len: usize,
    pub description: String,
    pub corrections: Vec<String>,
}

/// Harper's checks: made once, as that takes a few seconds; `load` makes them at start.
fn harper() -> &'static Mutex<LintGroup> {
    static H: OnceLock<Mutex<LintGroup>> = OnceLock::new();
    H.get_or_init(|| Mutex::new(LintGroup::new_curated(FstDictionary::curated(), dialect(&crate::spell::locale()))))
}

/// Sets Harper up, off the main thread.
pub fn load() {
    harper();
}

/// Harper's English nearest the user's locale ("en-ZA", "en_US"): British spelling outside North America.
fn dialect(locale: &str) -> Dialect {
    match locale.replace('_', "-").as_str() {
        "en-US" => Dialect::American,
        "en-CA" => Dialect::Canadian,
        "en-AU" | "en-NZ" => Dialect::Australian,
        "en-IN" => Dialect::Indian,
        _ => Dialect::British,
    }
}

/// The kinds of Harper's checks that are grammar: not spelling (the system does that), and not
/// its advice on style.
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

/// The grammar problems. One inside a sentence `kjv_sentence` says is in KJV English is left out.
pub fn check(text: &str, kjv_sentence: impl Fn(&str) -> bool) -> Vec<GrammarIssue> {
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

#[cfg(test)]
mod tests {
    fn flagged(text: &str) -> Vec<String> {
        let u: Vec<u16> = text.encode_utf16().collect();
        super::check(text, |_| false).iter().map(|g| String::from_utf16_lossy(&u[g.start..g.start + g.len])).collect()
    }

    #[test]
    fn finds_agreement_and_doubled_words() {
        assert!(!flagged("He go to the temple every morning.").is_empty());
        assert!(flagged("He went to the the store.").iter().any(|f| f.contains("the the")));
        assert_eq!(flagged("i went home."), vec!["i".to_string()]);
    }

    #[test]
    fn leaves_out_kjv_sentences_and_fragments() {
        let text = "He go to the temple.";
        assert!(super::check(text, |_| true).is_empty());
        assert!(flagged("Amen. A full week behind me and a fuller one ahead.").is_empty());
    }
}
