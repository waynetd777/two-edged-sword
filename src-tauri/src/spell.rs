//! Spelling for the journal, from macOS's own spell checker (the one TextEdit and Mail use):
//! the misspelled words in a text, the guesses for one, the automatic correction for one when
//! the user has "Correct spelling automatically" on, and learning or ignoring a word. Offsets
//! are UTF-16, as in NSString and in JavaScript strings. Called on the main thread (the
//! commands aren't async), where AppKit wants it. Every word in the KJV counts as spelled right,
//! and sentences in KJV English ("he maketh me", "thou art") aren't grammar-checked.

use objc2::runtime::AnyObject;
use objc2_app_kit::NSSpellChecker;
use objc2_foundation::{NSArray, NSDictionary, NSRange, NSString, NSValue};
use serde::Serialize;
use std::collections::HashSet;
use std::sync::OnceLock;

/// Every word in the user's KJV, lowercase; read once at start, in the background.
static KJV: OnceLock<HashSet<String>> = OnceLock::new();

/// Words that mark a sentence as KJV English even though macOS knows them.
const KJV_MARKERS: &[&str] = &["thee", "thou", "thy", "thine", "ye", "hast", "hath", "dost", "doth", "shalt", "wast", "wert", "canst", "saith", "unto", "spake"];

fn norm(w: &str) -> String {
    w.trim_matches(|c: char| c == '\'' || c == '’').replace('’', "'").to_lowercase()
}

fn words(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !(c.is_alphabetic() || c == '\'' || c == '’')).map(norm).filter(|w| !w.is_empty())
}

/// Reads the KJV's words from the library (a Bible whose abbreviation is KJV); called once, off
/// the main thread. Tags (Strong's numbers, notes) are dropped.
pub fn load_kjv(lib: &crate::library::Library) {
    use crate::library::Kind;
    let Some(id) = lib.of_kind(Kind::Bible).find(|m| m.abbrev.eq_ignore_ascii_case("KJV")).map(|m| m.id.clone()) else { return };
    let texts = lib.with(Kind::Bible, &id, |c| {
        let mut st = c.prepare("SELECT Scripture FROM Bible")?;
        let rows = st.query_map([], |r| r.get::<_, Option<String>>(0))?;
        rows.map(|r| r.map(|t| t.unwrap_or_default())).collect::<rusqlite::Result<Vec<_>>>()
    });
    let Ok(texts) = texts else { return };
    let mut set = HashSet::new();
    for t in texts {
        let mut plain = String::with_capacity(t.len());
        let mut tag = false;
        for c in t.chars() {
            match c { '<' => tag = true, '>' => { tag = false; plain.push(' ') } _ if !tag => plain.push(c), _ => {} }
        }
        set.extend(words(&plain));
    }
    let _ = KJV.set(set);
}

/// Whether the KJV's words have been read (the journal's first check waits for them, since what
/// it finds is kept for each paragraph).
pub fn kjv_ready() -> bool {
    KJV.get().is_some()
}

fn in_kjv(word: &str) -> bool {
    KJV.get().is_some_and(|k| k.contains(&norm(word)))
}

/// Whether a sentence is in KJV English: it has thee, thou, hath… or a KJV word macOS doesn't know.
fn kjv_sentence(sc: &NSSpellChecker, sentence: &str) -> bool {
    if words(sentence).any(|w| KJV_MARKERS.contains(&w.as_str())) {
        return true;
    }
    let s = NSString::from_str(sentence);
    let (len, mut at) = (s.length(), 0usize);
    while at < len {
        let r = unsafe { sc.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(&s, at as isize, None, false, tag(), std::ptr::null_mut()) };
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
        let r = unsafe { sc.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(&s, at as isize, None, false, tag(), std::ptr::null_mut()) };
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

/// A grammar problem: where it is (UTF-16, as for spelling), macOS's explanation, and its fixes.
#[derive(Serialize)]
pub struct GrammarIssue {
    pub start: usize,
    pub len: usize,
    pub description: String,
    pub corrections: Vec<String>,
}

/// The grammar problems, a sentence at a time. macOS needs the language named to check grammar
/// at all; a problem inside another one ("the" within "the the") is left to the outer one, and
/// one that is the whole sentence (a "fragment", which a journal is full of) is left out.
pub fn grammar(text: &str) -> Vec<GrammarIssue> {
    let sc = NSSpellChecker::sharedSpellChecker();
    let s = NSString::from_str(text);
    let lang = sc.language();
    let key = |k: &str, d: &NSDictionary<NSString, AnyObject>| d.objectForKey(&NSString::from_str(k));
    let (len, mut at, mut out) = (s.length(), 0usize, Vec::<GrammarIssue>::new());
    while at < len && out.len() < 500 {
        let mut details: Option<objc2::rc::Retained<NSArray<NSDictionary<NSString, AnyObject>>>> = None;
        let r = unsafe { sc.checkGrammarOfString_startingAt_language_wrap_inSpellDocumentWithTag_details(&s, at as isize, Some(&lang), false, tag(), Some(&mut details)) };
        if r.length == 0 || r.location >= len {
            break;
        }
        let first = out.len();
        let has_issues = details.as_ref().is_some_and(|d| d.count() > 0);
        if has_issues && kjv_sentence(&sc, &s.substringWithRange(r).to_string()) {
            at = r.location + r.length;
            continue;
        }
        for d in details.iter().flat_map(|ds| (0..ds.count()).map(move |i| ds.objectAtIndex(i))) {
            // The range is from the start of the sentence.
            let Some(g) = key("NSGrammarRange", &d).and_then(|v| v.downcast::<NSValue>().ok()).and_then(|v| v.get_range()) else { continue };
            let (start, glen) = (r.location + g.location, g.length);
            let whole = s.substringWithRange(r).to_string();
            let body = whole.trim_end_matches(|c: char| c.is_whitespace() || ".!?".contains(c)).encode_utf16().count();
            if g.location == 0 && glen >= body {
                continue;
            }
            if glen == 0 || out[first..].iter().any(|o| o.start <= start && start + glen <= o.start + o.len) {
                continue;
            }
            let description = key("NSGrammarUserDescription", &d).and_then(|v| v.downcast::<NSString>().ok()).map(|v| v.to_string()).unwrap_or_default();
            let corrections = key("NSGrammarCorrections", &d).and_then(|v| v.downcast::<NSArray>().ok())
                .map(|a| (0..a.count()).filter_map(|i| a.objectAtIndex(i).downcast::<NSString>().ok().map(|x| x.to_string())).collect())
                .unwrap_or_default();
            out.push(GrammarIssue { start, len: glen, description, corrections });
        }
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

#[cfg(test)]
mod tests {
    #[test]
    fn grammar_finds_a_doubled_word_with_its_fix() {
        let text = "This is fine. He went to the the store.";
        let found = super::grammar(text);
        let u: Vec<u16> = text.encode_utf16().collect();
        let doubled = found.iter().find(|g| String::from_utf16_lossy(&u[g.start..g.start + g.len]) == "the the");
        let Some(g) = doubled else { panic!("no doubled word in {:?}", found.iter().map(|g| &g.description).collect::<Vec<_>>()) };
        assert_eq!(g.corrections, vec!["the".to_string()]);
        assert!(!g.description.is_empty());
        // The lone "the" inside it isn't reported separately.
        assert_eq!(found.iter().filter(|x| x.start >= g.start && x.start < g.start + g.len).count(), 1);
    }

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
        assert!(super::grammar("Thou art my son. He maketh me to lie down in green pastures.").is_empty());
        assert!(!super::grammar("He went to the the store.").is_empty());
    }

    #[test]
    fn grammar_leaves_out_whole_sentence_fragments() {
        assert!(super::grammar("Amen. A full week behind me and a fuller one ahead.").is_empty());
    }
}
