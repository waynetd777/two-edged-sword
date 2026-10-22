# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Builds lxx_brenton+.bbli ("Septuagint (Greek, Brenton 1844) w/ glosses"): the Greek Brenton
Septuagint word by word, with the Apocrypha, each word with English under it, its Strong's number
and its grammar, as Byz+ has them.

    python3 tools/lxx/plus.py

Reads lxx_brenton.bbli (tools/lxx/build.py builds it) and writes lxx_brenton+.bbli to the library,
or to `into` (tools/core passes the app's modules folder, inside modules.shipping()). Every source
may be passed on; nothing comes from e-Sword.

Sources:
  Dictionary words and grammar: GLAUx (the Greek Language Automated corpus, Alek Keersmaekers,
    https://github.com/alekkeersmaekers/glaux, CC BY-SA 4.0), whose Septuagint (Rahlfs' text, from
    the Greek Wikisource, CC BY-SA 3.0) gives every word its lemma and an AGDT-style grammar tag.
    Genesis was annotated by hand (the Pedalion Trees, CC BY-SA 4.0); the rest by GLAUx's tagger,
    which the author puts at 98.8% right for lemmas and 97.2% for grammar, and which was trained
    partly on treebanks licensed for non-commercial use (PROIEL, Gorman); GLAUx itself, the
    tagger's output included, is CC BY-SA 4.0. The files are GLAUx's at a fixed commit.
  Strong's numbers: the lemma's, by STEPBible's TBESG headwords (Translators Brief lexicon of
    Extended Strongs for Greek, Tyndale House, CC BY 4.0, tools/stepbible.py), which number the
    Septuagint's words beyond Strong's too (G6000 on). Where a headword has two numbers, the one
    TAGNT (the Greek NT, CC BY 4.0) uses more is taken, a name's only for a capitalised word (τύραννος
    is never Tyrannus). FORM_NUMBER (tools/beza/plus.py) numbers ἦσαν G2258, as Strong does.
    Where Strong numbers forms of a word apart (εἶπεν G2036 for λέγω, μου G3450 for ἐγώ, ἦν G2258
    for εἰμί), the form takes the number TAGNT gives it, as Byz+ does.
  English: TBESG's gloss for the number, as Byz+ has it (tools/beza/plus.py's gloss_for: αὐτός and
    the personal pronouns by case, plural nouns plural; its GLOSS_FIX where TBESG's is wrong), but
    for OT_GLOSS's (Ἰησοῦς Joshua, but Jesus in Sirach, its author's name, save Joshua son of
    Nave there; χριστός anointed). A name with no
    number is transliterated. Brenton's words written as one (διατοῦτο, ἀναμέσον) are PHRASES: one
    box with each word's number. strong.lexi (tools/core) has TBESG's entries for its numbers
    beyond Strong's.

Brenton's text is the Vatican (Sixtine) one and Rahlfs' his own, and lxx_brenton.bbli numbers the
verses as the KJV does, so the two are matched by their words, not their numbers: for each of
Brenton's verses the run of one to three GLAUx verses of the same book (Daniel, Susanna and Bel:
both Greek versions; Tobit: both texts) that shares most words with it is found, from the verse's
rarer words, and the words are lined up in order, accents, case, final sigma and a closing movable
nu ignored; where the texts differ a word matches its like in the same place (one letter apart). A
word matched to none takes the analysis GLAUx gives the same form most often anywhere in the
Septuagint (its grammar TAGNT's for the form where the NT has it), or else TAGNT's number for it (a
Koine ending, ἤλθοσαν, as ἦλθον), or a verb's whose headword is nearly its form (ἀναγγελῶ).

GLAUx spells headwords as LSJ does (γίγνομαι), Strong's as the Koine does (γίνομαι): SPELL and a
γιγν → γιν rule bring them together (and -υμι, -ομαι as TBESG's -υω, -ω where it has those). FIXES
and STEMS put right the tagger's commonest slips, by form; a lemma TBESG hasn't at all (the tagger's
guess at a word it didn't know) gives way to the lemma GLAUx gives the same form elsewhere.

Downloads are cached in ~/Library/Caches/Two-edged Sword/glaux (STEPBible's in tools/stepbible's).
"""
import html, re, sqlite3, sys, unicodedata
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from beza.plus import FORM_NUMBER, gloss_for, glosses  # noqa: E402
from modules import CACHES, fetch, find, greek_key, module, similar as ratio  # noqa: E402
from stepbible import robinson, tagnt  # noqa: E402

CACHE = CACHES / "glaux"
COMMIT = "b077d8f6ff429a5c7245954bc16bb7d1d7948823"
URL = f"https://raw.githubusercontent.com/alekkeersmaekers/glaux/{COMMIT}/xml/0527-{{}}.xml"

# e-Sword's book numbers -> GLAUx's Septuagint texts (TLG 0527-…), the likeliest first.
SOURCES = {1: ["001"], 2: ["002"], 3: ["003"], 4: ["004"], 5: ["005"], 6: ["006"], 7: ["009"], 8: ["010"], 9: ["011"], 10: ["012"],
           11: ["013"], 12: ["014"], 13: ["015"], 14: ["016"], 15: ["018"], 16: ["018"], 17: ["019"], 18: ["032"], 19: ["027"],
           20: ["029"], 21: ["030"], 22: ["031"], 23: ["048"], 24: ["049"], 25: ["051"], 26: ["053"],
           27: ["057", "056", "055", "054", "059", "058"], 28: ["036"], 29: ["039"], 30: ["037"], 31: ["040"], 32: ["041"],
           33: ["038"], 34: ["042"], 35: ["043"], 36: ["044"], 37: ["045"], 38: ["046"], 39: ["047"],
           67: ["021", "022"], 68: ["020"], 69: ["033"], 70: ["034"], 71: ["050", "052"], 72: ["023"], 73: ["024"], 74: ["017"],
           76: ["025"], 77: ["026"], 78: ["028"]}
BOOK_NAMES = {67: "Tobit", 68: "Judith", 69: "Wisdom", 70: "Sirach", 71: "Baruch", 72: "1 Maccabees", 73: "2 Maccabees",
              74: "1 Esdras", 76: "3 Maccabees", 77: "4 Maccabees", 78: "Prayer of Manasseh"}

# GLAUx's (LSJ's) headword -> TBESG's (Strong's, the Koine spelling), and the tagger's invented lemmas.
SPELL = {"γίγνομαι": "γίνομαι", "γιγνώσκω": "γινώσκω", "ἀνοίγνυμι": "ἀνοίγω", "ἀείρω": "αἴρω", "πετεινόν": "πετεινός",
         "ἀοιδή": "ᾠδή", "μείς": "μήν", "ἐρύω": "ῥύομαι", "ρύω": "ῥύομαι", "πρόσωθεν": "πόρρωθεν", "πρόσω": "πόρρω",
         "ἀλληλούϊος": "ἀλληλουϊά", "Ἱεροσόλυμα": "Ἱερουσαλήμ", "Κορός": "Κορέ", "ἐκακράκνυμι": "κράζω", "ἀγαπάζω": "ἀγαπάω",
         "βοσακέω": "βόσκω", "ἐφορεύω": "πορεύομαι", "ἁσιύω": "ἥκω", "ἐνακόσιοι": "ἐννακόσιοι", "σωτήριος": "σωτήριον",
         "ἐθέλω": "θέλω", "φάος": "φῶς", "βορέας": "βορρᾶς", "κύκλος": "κύκλῳ", "Σαύλιος": "Σαούλ", "χερουβίν": "χερουβίμ",
         "ἀείδω": "ᾄδω", "χειμάρρους": "χειμάρρος", "ζυγόν": "ζυγός", "ἵλαος": "ἵλεως", "ταμιεῖον": "ταμεῖον", "ὠδίς": "ὠδίν",
         "νόος": "νοῦς", "ἔνατος": "ἔννατος", "διπλόος": "διπλοῦς", "ὀρεινή": "ὀρεινός", "νίζω": "νίπτω", "ἔσθω": "ἐσθίω",
         "οἰκτίρω": "οἰκτείρω", "οἰκτειρέω": "οἰκτείρω", "ἅλως": "ἅλων", "νεομηνία": "νουμηνία", "ἐξαείρω": "ἐξαίρω",
         "ἐλαχύς": "ἐλάχιστος", "θυμιάζω": "θυμιάω", "ξυρέω": "ξυράω", "τίρυμι": "ῥύομαι", "ἰδίω": "ὁράω",
         "ἀποστράπτω": "ἀποστρέφω", "ἰάζω": "ἰάομαι", "κεκράσσω": "κράζω", "μισθωτής": "μισθωτός", "ρίζαι": "ῥίζα",
         "ἱστάω": "ἵστημι", "κρατύς": "κρείσσων", "ἐσώτερος": "ἐσωτέρω", "φύλαξ": "φυλακτήριος",
         "Νεφθαλί": "Νεφθαλείμ", "Νεφθαλίς": "Νεφθαλείμ", "Νεφθαλίμ": "Νεφθαλείμ",
         "Χαναναῖος": "Χανααναῖος", "Χανανῖτις": "Χανααναῖος"}
# A form the tagger gets wrong -> its lemma, or (lemma, Robinson's code) where its grammar is wrong too.
FIXES = {"πρόσχες": ("προσέχω", "V-2AAM-2S"), "πρόσχετε": ("προσέχω", "V-2AAM-2P"), "ἐπλούτησεν": ("πλουτέω", "V-AAI-3S"),
         "ἐπλούτησε": ("πλουτέω", "V-AAI-3S"), "λήψῃ": ("λαμβάνω", "V-FDI-2S"), "μᾶλλον": ("μᾶλλον", "ADV"),
         "μάλιστα": ("μάλιστα", "ADV"), "δεῖ": ("δεῖ", "V-PAI-3S"), "ἔδει": ("δεῖ", "V-IAI-3S"), "δέον": ("δεῖ", "V-PAP-NSN"),
         "δέοντα": ("δεῖ", "V-PAP-APN"), "δέοι": ("δεῖ", "V-PAO-3S"), "δέῃ": ("δεῖ", "V-PAS-3S"), "δεήσει": ("δεῖ", "V-FAI-3S"),
         "ἀπῇραν": ("ἀπαίρω", "V-AAI-3P"), "ἀπῆρεν": ("ἀπαίρω", "V-AAI-3S"), "ἀπῆρε": ("ἀπαίρω", "V-AAI-3S"),
         "ἐξῇραν": ("ἐξαίρω", "V-AAI-3P"), "ἐπῇραν": ("ἐπαίρω", "V-AAI-3P"), "ᾖραν": ("αἴρω", "V-AAI-3P"), "ᾖρα": ("αἴρω", "V-AAI-1S"),
         "ἦρεν": ("αἴρω", "V-AAI-3S"), "ἦρε": ("αἴρω", "V-AAI-3S"), "προσάξετε": ("προσάγω", "V-FAI-2P"),
         "προσάξεις": ("προσάγω", "V-FAI-2S"), "προσάξει": ("προσάγω", "V-FAI-3S"), "προσάξουσι": ("προσάγω", "V-FAI-3P"),
         "προσάξουσιν": ("προσάγω", "V-FAI-3P"), "ἀνάξω": ("ἀνάγω", "V-FAI-1S"), "ἀνάξει": ("ἀνάγω", "V-FAI-3S"),
         "ἀναγγελῶ": ("ἀναγγέλλω", "V-FAI-1S"), "ἐλυτρώσω": ("λυτρόω", "V-AMI-2S"), "ἐντελοῦμαι": ("ἐντέλλομαι", "V-FDI-1S"),
         "ἰησοῖ": ("Ἰησοῦς", "N-DSM"), "γνώτωσαν": ("γινώσκω", "V-2AAM-3P"), "γνώτω": ("γινώσκω", "V-2AAM-3S"), "ἀναφορεῖς": ("ἀναφορεύς", "N-NPM"),
         "μακράν": "μακράν", "οὐδέ": "οὐδέ", "μηδέ": "μηδέ", "ἐναντίον": "ἐναντίον", "σαούλ": "Σαούλ", "καθάπερ": "καθάπερ",
         "ἐάν": "ἐάν", "πλησίον": "πλησίον", "οὐχί": "οὐχί", "κἀγώ": "κἀγώ", "κᾀγώ": "κἀγώ", "ἱνατί": "ἱνατί"}
# Elided words GLAUx hasn't in their place -> their lemma.
ELIDED = {"οὐδ": "οὐδέ", "μηδ": "μηδέ", "ἐπ": "ἐπί", "ἐφ": "ἐπί", "ἀπ": "ἀπό", "ἀφ": "ἀπό", "κατ": "κατά", "καθ": "κατά",
          "μετ": "μετά", "μεθ": "μετά", "παρ": "παρά", "δι": "διά", "ὑπ": "ὑπό", "ὑφ": "ὑπό", "ἀντ": "ἀντί", "ἀνθ": "ἀντί",
          "ἀλλ": "ἀλλά", "δ": "δέ", "τ": "τε", "οὐκ": "οὐ", "ἐπέκεινα": "ἐπέκεινα"}
# Brenton's words written as one (unaccented) -> each part's number, the English and the grammar.
PHRASES = {"διατουτο": (["G1223", "G5124"], "therefore", "preposition · demonstrative pronoun"),
           "αναμεσον": (["G303", "G3319"], "between", "preposition · adjective"),
           "αναμεσοσ": (["G303", "G3319"], "between", "preposition · adjective"),
           "επιτοαυτο": (["G1909", "G3588", "G846"], "together", "preposition · article · pronoun"),
           "διαπαντοσ": (["G1275"], "continually", "adverb"),
           "διατι": (["G1302"], "why?", "adverb · interrogative"),
           "καθοτι": (["G2530"], "because", "conjunction"),
           "εξεναντιασ": (["G1537", "G1727"], "opposite", "preposition · adjective")}
# The numbers' English in the Septuagint, where the NT's is wrong for it: Ἰησοῦς is Joshua (but for Jesus son of
# Sirach and his grandfather, in Sirach), χριστός the anointed (king, priest).
OT_GLOSS = {"G2424": "Joshua", "G5547": "anointed"}
# A word beginning so (unaccented) -> its lemma: πρεσβύτεροι is πρεσβύτερος, not πρέσβυς as LSJ has it;
# ἐπεσκέψατο ἐπισκέπτομαι, not ἐπισκοπέω; βέλτιον βελτίων, not ἀγαθός; δεηθήσομαι δέομαι, not δέω.
STEMS = {"πρεσβυτερ": "πρεσβύτερος", "χερουβ": "χερουβίμ", "βελτι": "βελτίων", "επεσκεψ": "ἐπισκέπτομαι",
         "επισκεψ": "ἐπισκέπτομαι", "επισκεπτ": "ἐπισκέπτομαι", "επεσκεπ": "ἐπισκέπτομαι",
         "δεηθ": "δέομαι", "εδεηθ": "δέομαι", "δεομαι": "δέομαι", "δεομεθα": "δέομαι", "δεομεν": "δέομαι", "εδεομην": "δέομαι"}
# The words Strong numbers by form: a form takes TAGNT's number for it if it is one of its lemma's family.
FAMILIES = [{"G1510", "G2258", "G1488", "G2076", "G1526", "G2071", "G5600", "G5607", "G2077", "G2070", "G2075", "G2252", "G2277",
             "G1498", "G1511", "G2074", "G2073", "G2468", "G5605", "G5604", "G5608", "G5606"},
            {"G1473", "G3450", "G3427", "G3165", "G1698", "G1691", "G2257", "G2254", "G2248", "G2249", "G1700"},
            {"G4771", "G4675", "G4671", "G4571", "G5216", "G5213", "G5209", "G5210"},
            {"G3708", "G1492", "G3700"}, {"G2068", "G5315"}, {"G3004", "G2036", "G2046", "G4483"}, {"G4183", "G4118", "G4119"}]


def key(w):
    """A word for comparing editions: lower case, no accents or breathings, σ for ς, no closing
    movable nu in a word of four letters or more, letters only."""
    return greek_key(w, nu_from=4)


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def form_of(w):
    """A word as printed, for matching forms: lower case, a grave accent as acute, no punctuation, no
    closing movable nu (ἐστὶν is ἐστί)."""
    t = unicodedata.normalize("NFD", w.lower()).replace("\u0300", "\u0301")
    t = unicodedata.normalize("NFC", re.sub(r"[^\w\u0300-\u036f]|\d", "", t))
    return t[:-1] if len(t) >= 4 and t.endswith("ν") and t[-2] in "εέιί" else t


def printed(word):
    """A word as printed, lower case, a grave accent as acute, no punctuation (movable nu kept)."""
    t = unicodedata.normalize("NFD", word.lower()).replace("\u0300", "\u0301")
    return unicodedata.normalize("NFC", re.sub(r"[^\w\u0300-\u036f]|\d", "", t))


def fixed(word, lemma):
    """The lemma, or FIXES' or STEMS' for the word."""
    t = printed(word)
    if t in FIXES:
        f = FIXES[t]
        return f[0] if isinstance(f, tuple) else f
    k = key(word)
    return next((v for s, v in STEMS.items() if k.startswith(s)), lemma)


def fixed_code(word):
    """FIXES' grammar for the word, or None."""
    f = FIXES.get(printed(word))
    return f[1] if isinstance(f, tuple) else None


def lemma_of(w):
    """A headword for matching TBESG's: accents kept, lower case, no punctuation or digits."""
    t = unicodedata.normalize("NFD", (w or "").lower()).replace("\u0300", "\u0301")
    return unicodedata.normalize("NFC", re.sub(r"[^\w\u0300-\u036f]|\d", "", t))


# ---------- GLAUx ----------

def glaux(tlg):
    """GLAUx's text 0527-<tlg> as [[(form, lemma, tag)]], a list per verse in the file's order."""
    path = fetch(URL.format(tlg), CACHE / COMMIT[:12] / f"0527-{tlg}.xml", log=True, timeout=300)
    verses, last = [], None
    for _, el in ET.iterparse(path):
        if el.tag != "word":
            continue
        tag = el.get("postag") or "u"
        if not el.get("artificial") and tag[0] not in "uz" and key(el.get("form") or ""):
            sec = el.get("div_section")
            if sec != last or not verses:
                verses.append([])
                last = sec
            verses[-1].append((nfc(el.get("form")), nfc(el.get("lemma")), tag))
        el.clear()
    return verses


# ---------- AGDT tags as Robinson's codes (stepbible.robinson spells them out) ----------

CASE = {"n": "N", "g": "G", "d": "D", "a": "A", "v": "V"}
NUM = {"s": "S", "p": "P", "d": "P"}
GEN = {"m": "M", "f": "F", "n": "N"}
TENSE = {"p": "P", "i": "I", "f": "F", "a": "A", "r": "R", "l": "L", "t": "F"}  # t, future perfect: spelt out after
MOOD = {"i": "I", "s": "S", "o": "O", "m": "M", "n": "N", "p": "P"}
VOICE = {"a": "A", "m": "M", "p": "P", "e": "E"}
DEMONSTRATIVE = {"οὗτος", "ἐκεῖνος", "ὅδε", "τοιοῦτος", "τοσοῦτος"}
RELATIVE = {"ὅς", "ὅστις", "ὅσος", "οἷος"}
REFLEXIVE = {"ἐμαυτοῦ": "1", "σεαυτοῦ": "2", "ἑαυτοῦ": "3"}
PERSON = {"ἐγώ": "1", "ἡμεῖς": "1", "σύ": "2", "ὑμεῖς": "2"}
NEGATIVE = {"οὐ", "μή", "οὐχί"}


def code(tag, lemma):
    """An AGDT tag ("v3saia---") as Robinson's code ("V-AAI-3S")."""
    pos, per, num, tns, mood, voi, gen, case, deg = (tag + "---------")[:9]
    cng = CASE.get(case, "") + NUM.get(num, "") + GEN.get(gen, "")
    if pos == "v":
        tvm = TENSE.get(tns, "X") + VOICE.get(voi, "X") + MOOD.get(mood, "X")
        if mood == "p":
            return f"V-{tvm}-{cng}"
        if mood == "n":
            return f"V-{tvm}"
        return f"V-{tvm}-{per if per in '123' else ''}{NUM.get(num, '')}"
    if pos == "n":
        return f"N-{cng}" if cng else "N-PRI"
    if pos in "am":
        return (f"A-{cng}" + {"c": "-C", "s": "-S"}.get(deg, "")) if cng else "A-NUI"
    if pos == "l":
        return f"T-{cng}"
    if pos == "p":
        if lemma in PERSON:
            return f"P-{PERSON[lemma]}{CASE.get(case, '')}{NUM.get(num, '')}"
        if lemma in DEMONSTRATIVE:
            return f"D-{cng}"
        if lemma in RELATIVE:
            return f"R-{cng}"
        if lemma == "τίς":
            return f"I-{cng}"
        if lemma == "τις":
            return f"X-{cng}"
        if lemma in REFLEXIVE:
            return f"F-{REFLEXIVE[lemma]}{cng}"
        return f"P-{cng}"
    if lemma in NEGATIVE:
        return "PRT-N"
    return {"d": "ADV", "c": "CONJ", "b": "CONJ", "r": "PREP", "i": "INJ", "g": "PRT"}.get(pos, "")


# ---------- Strong's numbers ----------

class Numbers:
    """Lemma (and form) -> Strong's number, from TBESG's headwords and TAGNT's usage."""

    def __init__(self):
        from stepbible import lexicon
        self.by_lemma, self.by_key, self.name, self.first, self.verbs = defaultdict(list), defaultdict(list), {}, {}, set()
        for line in lexicon("TBESG").split("\n"):
            f = line.split("\t")
            if len(f) > 6 and re.fullmatch(r"G\d{4}[A-Za-z]?", f[0]):
                n = f"G{int(f[0][1:5])}"
                self.name.setdefault(n, bool(re.fullmatch(r"N:.*-(P|L|PG|LG)", f[5])))  # a person or place, not χερουβίμ
                self.first.setdefault(n, key(re.split(r"[,;/]", f[3])[0]))
                if f[5].startswith("G:V"):
                    self.verbs.add(n)
                for hw in re.split(r"[,;/]\s*", f[3]):
                    if hw.strip():
                        for d, k in ((self.by_lemma, lemma_of(hw)), (self.by_key, key(hw))):
                            if n not in d[k]:
                                d[k].append(n)
        self.use, forms, codes = Counter(), defaultdict(Counter), defaultdict(Counter)
        for ws in tagnt().values():
            for w in ws:
                if w.num:
                    self.use[w.num] += 1
                    forms[form_of(w.greek)][w.num] += 1
                    codes[(form_of(w.greek), w.num)][w.code] += 1
        self.forms = forms
        self.forms_key = defaultdict(Counter)
        for f, c in forms.items():
            self.forms_key[key(f)].update(c)
        self.usual = {f: c.most_common(1)[0][0] for f, c in forms.items() if c.most_common(1)[0][1] >= 0.9 * sum(c.values())}
        by_key = defaultdict(Counter)
        for f, c in forms.items():
            by_key[key(f)].update(c)
        self.usual_key = {k: c.most_common(1)[0][0] for k, c in by_key.items() if c.most_common(1)[0][1] >= 0.9 * sum(c.values())}
        self.codes = {k: c.most_common(1)[0][0] for k, c in codes.items()}
        self.missing = Counter()  # lemmas TBESG hasn't, for the report
        self.others = {}  # form -> the lemmas GLAUx gives it anywhere, commonest first (main sets it)

    def pick(self, cands, capital, lemma=""):
        """The likeliest of a headword's numbers, or None: a name's only for a capitalised word (τύραννος
        is never Tyrannus), one whose first headword it is (ἔνθεν G6033, not G1782 ἐντεῦθεν, ἔνθεν),
        the one TAGNT uses more."""
        cands = [n for n in cands if capital or not self.name.get(n)]
        if not cands:
            return None
        return max(cands, key=lambda n: (self.first.get(n) == key(lemma), self.use[n], -int(n[1:])))

    def __call__(self, word, lemma, again=True, verb=False):
        """(number or None, how): "lemma", "form" (Strong's by-form number), "tagnt" (the form's, the
        lemma being unknown) or "none"."""
        f = form_of(word)
        if printed(word) in FORM_NUMBER:
            return FORM_NUMBER[printed(word)], "form"
        lemma = fixed(word, lemma)
        if lemma:
            lemma = SPELL.get(lemma, lemma).replace("γιγν", "γιν").replace("γίγν", "γίν")  # γίγνομαι: γίνομαι
        cands = None
        if lemma:
            cands = self.by_lemma.get(lemma_of(lemma)) or self.by_key.get(key(lemma))
            k = key(lemma)
            for a, b in (("υμι", "υω"), ("ομαι", "ω"), ("ω", "ομαι"), ("υμαι", "υω")):  # ἀπόλλυμι: ἀπολλύω; ψεύδω: ψεύδομαι
                if not cands and k.endswith(a):
                    cands = self.by_key.get(k[:-len(a)] + b)
            if not cands and k.startswith("ε") and k.endswith("ω"):  # ἐλυτρόω, the tagger's lemma with the augment: λυτρόω
                cands = self.by_key.get(k[1:])
        n = self.pick(cands, word[:1].isupper(), lemma) if cands else None
        if n:
            c = self.forms.get(f) or self.forms_key.get(key(word))  # ἴδον: TAGNT's εἶδον
            if c:
                fam = next((x for x in FAMILIES if n in x), None)
                if fam:
                    top, k = max(((m, k) for m, k in c.items() if m in fam), key=lambda x: x[1], default=(None, 0))
                    if top and top != n and k >= 0.6 * sum(c.values()):
                        return top, "form"
            return n, "lemma"
        if lemma and again:
            self.missing[lemma] += 1
            for other in self.others.get(f, ()):  # the tagger's slip: what it makes of the same form elsewhere
                if other != lemma and (n := self(word, other, again=False, verb=verb)[0]):
                    return n, "lemma"
        if f in self.usual:
            return self.usual[f], "tagnt"
        k = key(word)
        for a, b in (("", ""), ("οσαν", "ον"), ("οσα", "ον")):  # ἤλθοσαν, the Koine's ἦλθον
            if k.endswith(a) and (n := self.usual_key.get(k[:len(k) - len(a)] + b)):
                return n, "tagnt"
        if verb and len(k) >= 6:  # a verb the tagger didn't know: the TBESG verb most like it (ἀναγγελῶ, ἀναγγέλλω)
            best = max(((ratio(k, hk), n) for hk, ns in self.by_key.items() if hk[:4] == k[:4] for n in ns if n in self.verbs),
                       default=(0, None))
            if best[0] >= 0.8:
                return best[1], "stem"
        c = self.by_key.get(key(word))  # an indeclinable, or a form that is its own headword
        if c and (n := self.pick(c, word[:1].isupper())):
            return n, "tagnt"
        return None, "none"


# ---------- lining up ----------

def similar(a, b):
    return a == b or (min(len(a), len(b)) >= 3 and ratio(a, b) >= 0.75)


GREEK_WORD = re.compile(r"[Ͱ-Ͽἀ-῿]")
TRANSLIT = dict(zip("αβγδεζηθικλμνξοπρσςτυφχψω", ["a", "b", "g", "d", "e", "z", "ē", "th", "i", "k", "l", "m", "n", "x", "o", "p", "r",
                                                  "s", "s", "t", "u", "ph", "ch", "ps", "ō"], strict=True))


def translit(w):
    k = unicodedata.normalize("NFD", w.lower())
    k = "".join(ch for ch in k if not unicodedata.combining(ch))
    return "".join(TRANSLIT.get(ch, "") for ch in k).capitalize()


class Book:
    """GLAUx's verses for one of Brenton's books, indexed by word."""

    def __init__(self, texts):
        self.units = []  # (text number, [(form, lemma, tag)])
        for t, verses in enumerate(texts):
            self.units += [(t, ws) for ws in verses]
        self.keys = [[key(w[0]) for w in ws] for _, ws in self.units]
        self.freq = Counter(k for ks in self.keys for k in ks)
        self.where = defaultdict(set)
        for i, ks in enumerate(self.keys):
            for k in ks:
                self.where[k].add(i)

    def match(self, ks):
        """The words of the run of GLAUx verses most like a verse's (its keys `ks`), or None."""
        score = Counter()
        for k in set(ks):
            if 0 < self.freq[k] <= 60:
                for i in self.where[k]:
                    score[i] += 1 / self.freq[k]
        best = None
        for i, _ in score.most_common(12):
            for lo in (i - 1, i):
                for n in (1, 2, 3):
                    if lo < 0 or lo + n > len(self.units) or len({self.units[j][0] for j in range(lo, lo + n)}) > 1:
                        continue
                    wk = [k for j in range(lo, lo + n) for k in self.keys[j]]
                    sm = SequenceMatcher(None, ks, wk, autojunk=False)
                    s = sum(m.size for m in sm.get_matching_blocks()) - 0.02 * n
                    if not best or s > best[0]:
                        best = (s, lo, n)
        if not best or best[0] < max(2, 0.3 * len(ks)):
            return None
        _, lo, n = best
        return [w for j in range(lo, lo + n) for w in self.units[j][1]]


def line_up(ks, win, caps=None):
    """For each of a verse's words (keys `ks`), its GLAUx word in `win` or None. A word spelt otherwise
    is matched only to one capitalised as it is (`caps`, for each word: a capital not first in the
    verse), so that a name isn't taken for a word like it (Ἰησοῦς, νήσους)."""
    wk = [key(w[0]) for w in win]
    caps = caps or [None] * len(ks)
    got = [None] * len(ks)
    for op, i1, i2, j1, j2 in SequenceMatcher(None, ks, wk, autojunk=False).get_opcodes():
        if op == "equal":
            for d in range(i2 - i1):
                got[i1 + d] = win[j1 + d]
        elif op == "replace":
            used = set()
            for d in range(i2 - i1):
                for e in range(j1, j2):
                    if e not in used and similar(ks[i1 + d], wk[e]) and caps[i1 + d] in (None, win[e][0][:1].isupper()):
                        got[i1 + d] = win[e]
                        used.add(e)
                        break
    return got


def main(into=None):
    """Writes lxx_brenton+.bbli to the library, or to `into`."""
    if not find("lxx_brenton.bbli").exists():
        sys.exit("no lxx_brenton.bbli; build it first (tools/lxx/build.py)")
    db = sqlite3.connect(f"file:{find('lxx_brenton.bbli')}?mode=ro", uri=True)
    brenton = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible ORDER BY Book, Chapter, Verse").fetchall()
    db.close()
    numbers, G = Numbers(), glosses()
    texts = {t: glaux(t) for t in sorted({t for ts in SOURCES.values() for t in ts})}
    # Every form's commonest analysis in the whole Septuagint, for a word matched to none.
    analyses = defaultdict(Counter)
    for verses in texts.values():
        for ws in verses:
            for f, lemma, tag in ws:
                analyses[form_of(f)][(lemma, tag)] += 1
    common = {f: c.most_common(1)[0][0] for f, c in analyses.items()}
    for f, c in analyses.items():
        numbers.others[f] = list(dict.fromkeys(lemma for (lemma, _), _ in c.most_common()))
    books = {b: Book([texts[t] for t in ts]) for b, ts in SOURCES.items()}
    print(f"Brenton: {len(brenton)} verses; GLAUx: {sum(len(v) for v in texts.values())} verses in {len(texts)} texts")

    out, stats, worst, unknown, bare = [], defaultdict(Counter), [], Counter(), Counter()
    for b, c, v, text in brenton:
        toks = re.findall(r"\S+", text or "")
        words = [(i, key(t)) for i, t in enumerate(toks) if GREEK_WORD.search(t) and key(t)]
        ks = [k for _, k in words]
        win = books[b].match(ks) if b in books and ks else None
        caps = [toks[i][:1].isupper() if d else None for d, (i, _) in enumerate(words)]
        got = line_up(ks, win, caps) if win else [None] * len(ks)
        s = stats[b]
        parts, at = [], {i: d for d, (i, _) in enumerate(words)}
        glossed = 0
        for i, t in enumerate(toks):
            d = at.get(i)
            if d is None:
                parts.append(html.escape(t, quote=False))
                continue
            if key(t) in PHRASES:  # Brenton's διατοῦτο: one box, a number for each word
                ns, en, gr = PHRASES[key(t)]
                parts.append(f"<div><grk>{html.escape(t, quote=False)}</grk>{''.join(f'<num>{x}</num>' for x in ns)}"
                             f"<tvm>{gr}</tvm><gra>{en}</gra></div>")
                s["phrase"] += 1
                glossed += 1
                continue
            if got[d]:
                _, lemma, tag = got[d]
                s["glaux"] += 1
            elif form_of(t) in common:
                lemma, tag = common[form_of(t)]
                s["byform"] += 1
            else:
                lemma, tag = None, None
            refixed = bool(lemma) and fixed(t, lemma) != lemma  # the tagger's lemma was wrong, so its grammar may be too
            if not lemma and t[-1:] in "ʼ’'" and printed(t) in ELIDED:  # ἐπʼ, οὐδʼ
                lemma = ELIDED[printed(t)]
            n, how = numbers(t, lemma, verb=(tag or "")[:1] == "v")
            s[how] += 1
            nt_code = numbers.codes.get((form_of(t), n), "") if n else ""
            if (not got[d] or refixed) and nt_code:
                tag = None  # matched to no GLAUx word, or its lemma put right: the NT's grammar for the form first
            cd = fixed_code(t) or (code(tag, nfc(lemma)) if tag else "") or nt_code
            name = lemma[:1].isupper() if lemma else (t[:1].isupper() and d > 0)  # a name: its lemma capitalised, or a capital not first
            if name and re.search(r"[βγδζθκλμπτφχ]$", key(t)):
                cd = "N-PRI"  # a Hebrew name, not declined (Ἀβραάμ, Δαυίδ): the tagger's case is a guess
            if not n and name:
                cd = cd or "N-PRI"
            en = gloss_for(n, cd, G) if n else ""
            if n in OT_GLOSS and not (n == "G2424" and b == 70 and "ναυη" not in ks):  # Sirach's Jesus, but Joshua son of Nave
                en = OT_GLOSS[n]
            if not n and not name:
                bare[(printed(t), lemma)] += 1
            if not en and name:
                en = translit(t.strip(".,;:·()[]ʼ’'"))
                s["translit"] += 1
            glossed += bool(en)
            gr = robinson(cd, unknown) if cd else ""
            if tag and tag[:1] == "v" and tag[3:4] == "t" and not fixed_code(t):
                gr = gr.replace("future", "future perfect", 1)  # κεκράξομαι: Robinson's codes haven't the tense
            box = f"<div><grk>{html.escape(t, quote=False)}</grk>"
            if n:
                box += f"<num>{n}</num>"
            if gr:
                box += f"<tvm>{html.escape(gr, quote=False)}</tvm>"
            box += f"<gra>{html.escape(en, quote=False) or '—'}</gra></div>"
            parts.append(box)
        out.append((b, c, v, "".join(parts)))
        s["words"] += len(words)
        s["numbered"] += sum(1 for p in parts if "<num>" in p)
        s["glossed"] += glossed
        if len(words) >= 6:
            worst.append((glossed / len(words), (b, c, v)))

    total = Counter()
    for s in stats.values():
        total.update(s)
    w = total["words"]
    print(f"{w} words: {total['glaux'] / w:.1%} matched to GLAUx's, {total['byform'] / w:.1%} analysed by form; "
          f"{total['numbered'] / w:.1%} numbered, {total['glossed'] / w:.1%} glossed ({total['translit'] / w:.1%} names transliterated)")
    print(f"  numbers: {total['lemma']} by lemma, {total['form']} by-form (Strong's), {total['tagnt']} from TAGNT by form, {total['none']} none")
    for name, part in (("canon", [s for b, s in stats.items() if b <= 39]), ("Apocrypha", [s for b, s in stats.items() if b > 39])):
        s = sum(part, Counter())
        if s["words"]:
            print(f"  {name}: {s['words']} words, {s['glaux'] / s['words']:.1%} matched, {s['numbered'] / s['words']:.1%} numbered, "
                  f"{s['glossed'] / s['words']:.1%} glossed")
    low = sorted(stats.items(), key=lambda kv: kv[1]["numbered"] / max(kv[1]["words"], 1))
    print("  least numbered books: " + ", ".join(f"{BOOK_NAMES.get(b, b)} {s['numbered'] / max(s['words'], 1):.1%}" for b, s in low[:8]))
    print("  least glossed verses: " + ", ".join(f"{b}:{c}:{v} {r:.0%}" for r, (b, c, v) in sorted(worst)[:8]))
    print(f"  lemmas TBESG hasn't: {[x for x in numbers.missing.most_common(400) if x[0][:1].islower()][:60]}")
    print(f"  words with no number, not names: {sum(bare.values())}; commonest: {bare.most_common(50)}")
    if unknown:
        print(f"  grammar codes not spelled out: {unknown.most_common(12)}")

    info = ("<p>The Septuagint in Greek as Sir Lancelot Brenton printed it (1844), the Vatican text of the Sixtine edition (Rome, "
            "1587), with the Apocrypha, word by word: each word with English under it, its Strong's number and its grammar. "
            "Brenton's text is public domain (eBible.org's grcbrent).</p>"
            "<p>Each word's dictionary word and grammar are those of the same word in the Septuagint of GLAUx, the Greek Language "
            "Automated corpus (Alek Keersmaekers, https://github.com/alekkeersmaekers/glaux, CC BY-SA 4.0), whose text is Rahlfs' "
            "as the Greek Wikisource has it (el.wikisource.org, CC BY-SA 3.0). The words are matched one by one, as that text "
            "differs from Brenton's in places; a word it hasn't there takes what GLAUx gives the same form elsewhere. GLAUx's "
            "Genesis was annotated by hand; the rest by its automatic tagger (about 99% of lemmas right, 97% of grammar, by the "
            "author's measure), which was trained partly on treebanks licensed for non-commercial use. Some of the tagger's "
            "slips are put right here by form.</p>"
            "<p>The Strong's numbers are found from the dictionary word with STEPBible's TBESG and TAGNT (Tyndale House, "
            "www.STEPBible.org, CC BY 4.0, https://creativecommons.org/licenses/by/4.0/), which number the Septuagint's words "
            "beyond Strong's too (G6000 on; strong.lexi has their entries). STEPBible's data is adapted here: their numbers "
            "are given without the letter that marks a meaning (G2424I is G2424), and their glosses are shortened and inflected "
            "(a plural noun's made plural, the pronouns by case), a few put right. The English is the dictionary sense, not a "
            "translation of the verse; Ἰησοῦς is glossed Joshua, χριστός anointed. A name with no number is transliterated. "
            f"{total['numbered'] / w:.0%} of the words are numbered, {total['glossed'] / w:.0%} have English.</p>"
            "<p>This module, built from GLAUx, is shared under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). "
            "Built by Two-edged Sword's tools/lxx/plus.py.</p>")
    with module("lxx_brenton+.bbli", "Septuagint (Greek, Brenton 1844) w/ glosses", "LXX-Brenton+", info, nt=False, apocrypha=True,
                strongs=True, into=into) as db:
        db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    print(f"lxx_brenton+.bbli: {len(out)} verses")


if __name__ == "__main__":
    main()
