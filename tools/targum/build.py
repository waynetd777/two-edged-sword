"""Builds the Targums word by word: targum_aramaic+.bbli ("Targum (Aramaic) w/ glosses", Targum+) and
pseudojonathan_aramaic+.bbli ("Targum Pseudo-Jonathan (Aramaic) w/ glosses", Ps-Jon+), each Aramaic
word with English under it and, where it renders a word of the Hebrew, that word's Strong's number.

    python3 tools/targum/build.py [targum_aramaic pseudojonathan_aramaic]

Reads the Targums (tools/sefaria builds them) and WLC+ (tools/wlc) from the e-Sword library, and
writes the new modules beside them; the app finds them after Library → Rescan.

A Targum follows its Hebrew closely, word for word in Onkelos and Jonathan, and its words are
mostly cognate with the Hebrew ones (אַרְעָא for אֶרֶץ, שְׁמַיָּא for שָׁמַיִם). So each verse is lined up
with the same verse of WLC+ (both are in the KJV's numbering): words are compared by their
consonants, with prefixes and endings set aside and the letters Aramaic has for Hebrew ones (ד for
ז, ת for ש, ט or ע for צ) counted as the same, and the best order-keeping pairing is kept where
the words are alike enough. A paired word takes the Hebrew word's English (STEPBible's, as WLC+
has it) and Strong's number.

A word with no Hebrew counterpart is given its English from COMMON if it is one of the commonest
words (with its prefixes: ו and, ד of, ב in, ל to, מ from, כ as); otherwise it (the Targums add much, Pseudo-Jonathan most) is looked up in
Jastrow's Dictionary of the Targumim (1903), in Sefaria's digitisation as UniquePixels/jastrow
has it (github.com/UniquePixels/jastrow, CC BY-NC): its prefixes, suffixes and verbal affixes are
taken off in turn until a headword matches, and the English is the headword's first gloss. The
tooltip says which: "Hebrew בָּרָא" or "Jastrow אַרְעָא".

Downloads are cached in ~/Library/Caches/Two-edged Sword/targum.
"""
import html, json, os, re, sqlite3, sys, unicodedata, urllib.request
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = Path(os.environ.get("ESWORD_LIBRARY") or HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support")
CACHE = HOME / "Library/Caches/Two-edged Sword/targum"
JASTROW = "https://raw.githubusercontent.com/UniquePixels/jastrow/main/data/jastrow-part{}.jsonl"
MODULES = {
    "targum_aramaic": dict(title="Targum (Aramaic) w/ glosses", abbrev="Targum+"),
    "pseudojonathan_aramaic": dict(title="Targum Pseudo-Jonathan (Aramaic) w/ glosses", abbrev="Ps-Jon+"),
}
FINAL = str.maketrans("ךםןףץ", "כמנפצ")
# Aramaic letters that stand for Hebrew ones in cognate words, and the first letters of each pair.
SAME = {("ד", "ז"), ("ת", "ש"), ("ט", "צ"), ("ע", "צ"), ("א", "ה"), ("ש", "ש"), ("ס", "ש"), ("ס", "ש")}
PREFIX = {"ו": "and", "ד": "of", "ב": "in", "ל": "to", "מ": "from", "כ": "as"}
# Aramaic words and the Hebrew they stand for, where the two aren't cognate.
EQUIV = {"ית": "את", "יי": ("יהוה", "אלהימ", "אדני"), "ארי": "כי", "דין": "זה", "הא": "הנה", "כען": "עתה", "לות": "אל", "קדם": "לפני", "ארום": "כי",
         "אתא": "בא", "אזל": "הלך", "חזא": "ראה", "סגי": "רב", "חד": "אחד", "תרין": "שנים", "אנש": "איש", "גבר": "איש",
         "לא": "לא", "כל": "כל", "על": "על", "עם": "עם", "מן": "מן", "אנא": "אני", "אנת": "אתה", "הוא": "הוא", "אמר": "אמר"}


# The commonest words, whose first gloss in Jastrow is some other word's (אמר: "join" for "say").
COMMON = {"מן": "from", "קדם": "before", "על": "on", "אמר": "say", "די": "which", "לא": "not", "ישראל": "Israel", "ליה": "to him", "ית": "[obj.]", "ארום": "for", "להון": "to them", "מלכא": "the king", "בני": "sons of", "כל": "all", "הוה": "was", "בית": "house of", "הוא": "he", "בר": "son", "עם": "with", "הדין": "this", "אנא": "I", "כד": "when", "עד": "until", "ארעא": "the land", "יתיה": "him", "לכון": "to you", "עמא": "the people", "קדמי": "before me", "למימר": "saying", "יתהון": "them", "לך": "to you", "עממיא": "the nations", "משה": "Moses", "קרבא": "battle", "לי": "to me", "דין": "this", "מקדשא": "the sanctuary", "יהי": "let be", "בהון": "in them", "חד": "one", "בתר": "after", "ביה": "in him", "כדנן": "thus", "כן": "so", "הא": "behold", "לית": "there is not", "סחור": "around", "רבא": "great", "בכן": "then", "מטול": "because", "גברא": "the man", "עבד": "do", "עלמא": "the world", "עמיה": "his people", "אף": "also", "יהודה": "Judah", "אין": "if", "היך": "how", "מימרא": "the Word", "מימרי": "my Word", "מימריה": "his Word", "שמיא": "heaven", "דוד": "David", "זמנא": "time", "לה": "to her", "למעבד": "to do", "כען": "now", "יתי": "me", "כהנא": "the priest", "כהניא": "the priests", "מליל": "speak", "יתכון": "you", "לחדא": "very", "תמן": "there", "חדא": "one", "ברם": "but", "מנהון": "from them", "עמי": "my people", "פתגמא": "the word", "פתגם": "word", "פתגמי": "words of", "פתגמיא": "the words", "אתון": "you", "מניה": "from him", "הדא": "this", "אלין": "these", "האלין": "these", "מה": "what", "יתה": "her", "קדמך": "before you", "מצרים": "Egypt", "היא": "she", "קדמוהי": "before him", "קדמוי": "before him", "בדיל": "because of", "דינא": "judgment", "קרתא": "the city", "נביא": "prophet", "נביאה": "the prophet", "קרא": "call", "למהוי": "to be", "אינון": "they", "עליהון": "upon them", "נבואה": "prophecy", "חזור": "around", "אוריתא": "the Law", "אלהא": "God", "אלהי": "God of", "אלהכון": "your God", "אלהך": "your God", "יומא": "day", "יומין": "days", "ארי": "for", "בגו": "inside", "עלי": "upon me", "שנין": "years", "שנא": "year", "ימא": "sea", "עמך": "with you", "אזל": "go", "בגין": "because of", "אתא": "come", "לחוד": "only", "קים": "covenant", "כנשתא": "congregation", "ההוא": "that", "ההיא": "that", "כדון": "now", "ירושלם": "Jerusalem", "היכמא": "as", "כמא": "as", "כי": "for", "הוו": "were", "הלא": "is not", "כדין": "so", "אחד": "one", "מאה": "hundred", "משכן": "tabernacle", "משכנא": "the tabernacle", "נסיב": "take", "יהב": "give", "גבר": "man", "מדבחא": "the altar", "חילא": "might", "רב": "great", "קודשיא": "holy things", "קודשא": "holiness", "אתיב": "answer", "עלוהי": "upon him", "עלוי": "upon him", "כחדא": "together", "מני": "from me", "נפק": "go out", "יעקב": "Jacob", "קם": "arise", "אנון": "they", "הינון": "they", "בנוי": "his sons", "ביתא": "the house", "מלכותא": "the kingdom", "פקיד": "command", "נטלו": "set out", "תחות": "under", "מסאב": "unclean", "צבאות": "hosts", "תרין": "two", "או": "or", "בישתא": "evil", "עוד": "again", "בגלל": "because of", "הות": "was", "יקרא": "glory", "קביל": "receive", "שבטא": "tribe", "שבטיא": "the tribes", "נשא": "women", "תקיף": "strong", "פרעה": "Pharaoh", "מלך": "king", "טב": "good", "יהון": "be", "אנשא": "mankind", "אנש": "man", "יד": "hand", "עדנא": "time", "ביני": "between", "בין": "between", "דהבא": "gold", "שבע": "seven", "חלף": "instead of", "מתמן": "from there", "רבוני": "my lord", "אבהתהון": "their fathers", "אבוהי": "his father", "אבא": "father", "יוסף": "Joseph", "אלהן": "except", "בנין": "sons", "עלך": "upon you", "עליה": "upon him", "עלה": "upon her", "בנך": "your son", "בריה": "his son", "אמיה": "his mother", "אחוהי": "his brother", "אתתא": "the woman", "אתתיה": "his wife", "ארחא": "the way", "אורח": "way", "טורא": "the mountain", "מיא": "water", "נורא": "fire", "רוחא": "spirit", "קודשא": "holy", "צלותא": "prayer", "חובא": "sin", "חובין": "sins", "זכו": "merit", "שלמא": "peace", "רחמין": "mercy", "מלאכא": "the angel", "מלאכיא": "the angels", "עבדא": "servant", "עבדך": "your servant", "עבדוהי": "his servants", "כולא": "all", "כולהון": "all of them", "כלהון": "all of them", "לות": "to", "ואזלו": "and went", "אזלו": "went", "אמרו": "said", "ואמרו": "and said", "אמרת": "said", "אמרית": "I said", "שמע": "hear", "שמעו": "hear", "חזא": "see", "חזו": "see", "ידע": "know", "ידעון": "know", "אתו": "came", "יתיב": "dwell", "שרא": "dwell", "מית": "die", "מיתו": "died", "חיי": "life", "חיין": "life", "נפשא": "soul", "נפשיה": "his soul", "לבא": "heart", "ליבא": "heart", "ליביה": "his heart", "אנפי": "face of", "אפי": "face of", "אפיה": "his face", "עינוהי": "his eyes", "עיני": "eyes of", "קל": "voice", "קלא": "the voice", "שום": "name", "שמיה": "his name", "שמא": "the name", "דא": "this", "דנא": "this", "כדנא": "thus", "ארבע": "four", "תלת": "three", "חמש": "five", "עסר": "ten", "אלף": "thousand", "רבו": "myriad", "חויא": "serpent", "אילן": "tree", "אילנא": "the tree", "בעיר": "cattle", "בעירא": "the cattle", "אלהים": "God", "נש": "man", "גינתא": "the garden", "גנתא": "the garden", "חיות": "beasts of", "חיותא": "the beast"}


def consonants(w):
    return "".join(ch for ch in unicodedata.normalize("NFD", w) if "א" <= ch <= "ת").translate(FINAL)


# The tables are written with final letters; words are compared without them.
COMMON = {k.translate(FINAL): v for k, v in COMMON.items()}
EQUIV = {k.translate(FINAL): tuple(x.translate(FINAL) for x in v) if isinstance(v, tuple) else v.translate(FINAL) for k, v in EQUIV.items()}


def jastrow():
    """{consonants of a headword: (headword, first gloss)}. Of homographs, an Aramaic entry (Jastrow's
    "ch.") is preferred; an entry that only points to another ("v. הוי") takes that one's gloss."""
    entries, by_id = [], {}
    for part in (1, 2):
        p = CACHE / f"jastrow-part{part}.jsonl"
        if not p.exists() or not p.stat().st_size:
            p.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(JASTROW.format(part), timeout=300) as r:
                p.write_bytes(r.read())
        for line in p.read_text().splitlines():
            e = json.loads(line)
            entries.append(e)
            by_id[e.get("id")] = e
    out = {}
    for e in entries:
        hw = re.sub(r"[\sIVX²³⁴⁵⁶⁷⁸⁹¹]+$", "", e.get("hw", "")).strip()
        key = consonants(hw)
        if not key:
            continue
        g = gloss_of(e)
        if not g:
            first = (e.get("c", {}).get("s") or [{}])[0].get("d", "")
            ref = re.search(r"rid:(\w+)", first)
            if ref and ref.group(1) in by_id and len(re.sub(r"<[^>]+>", "", first)) < 60:
                g = gloss_of(by_id[ref.group(1)])
        if not g:
            continue
        aramaic = "<abbr>ch.</abbr>" in json.dumps(e.get("c", {}), ensure_ascii=False)[:400]
        if key not in out or (aramaic and not out[key][2]):
            out[key] = (hw, g, aramaic)
    return {k: (hw, g) for k, (hw, g, _) in out.items()}


def gloss_of(e):
    for s in e.get("c", {}).get("s", []):
        for m in re.finditer(r"<i>(.*?)</i>", s.get("d", "")):
            g = re.sub(r"<[^>]+>|\[.*?\]|\(.*?\)", "", m.group(1))
            g = re.split(r"[,;:]", g)[0].strip().strip(".").strip()
            g = re.sub(r"^(?:to |a |an |the )", "", g)
            if re.search(r"[a-z]{3}", g) and len(g) <= 28 and "." not in g and "." not in m.group(1)[:6] and g.lower() not in ("pl", "sing", "part", "adj", "adv"):
                return g
    return None


SUFFIXES = ["יהון", "יכון", "הון", "כון", "והי", "יהא", "יה", "יך", "הא", "נא", "נן", "תא", "יא", "ין", "ון", "יי", "ה", "ך", "י", "ת", "ו", "א"]
VERB_PREFIX = ["אית", "את", "אי", "י", "ת", "נ", "א", "מ"]


def prefixed(c):
    """The word with 0, 1 or 2 prefix letters taken off: [(prefixes, rest)]."""
    out = [("", c)]
    for k in (1, 2):
        if len(c) - k >= 2 and all(ch in PREFIX for ch in c[:k]):
            out.append((c[:k], c[k:]))
    return out


def candidates(c):
    """A word's possible headwords, fewest changes first: the word itself, then without its
    prefixes, then without a suffix, then without a verb's prefix too (a stem of three letters at
    least, or a final-weak root with its ה or א put back)."""
    out = []
    for pre, rest in prefixed(c):
        out += [(pre, rest), (pre, rest + "א")]
    for pre, rest in prefixed(c):
        for sfx in SUFFIXES:
            st = rest[:-len(sfx)] if rest.endswith(sfx) else None
            if st and len(st) >= 3:
                out += [(pre, st), (pre, st + "א")]
            elif st and len(st) == 2:
                out += [(pre, st + "ה"), (pre, st + "א")]
    for pre, rest in prefixed(c):
        for vp in VERB_PREFIX:
            if rest.startswith(vp):
                st = rest[len(vp):]
                for sfx in [""] + SUFFIXES:
                    t = st[:-len(sfx)] if sfx and st.endswith(sfx) else (st if not sfx else None)
                    if t and len(t) >= 3:
                        out.append((pre, t))
                    elif t and len(t) == 2:
                        out += [(pre, t + "ה"), (pre, t + "א")]
    return out


def look_up(word, jas):
    c = consonants(word)
    for pre, rest in prefixed(c):
        if rest in COMMON:
            return consonants(rest) and rest, " ".join([PREFIX[p] for p in pre] + [COMMON[rest]])
    for pre, st in candidates(c):
        if st in jas:
            hw, g = jas[st]
            return hw, " ".join([PREFIX[p] for p in pre] + [g])
    return None


HEB_GLOSS = {}  # consonants of a Hebrew word: its English, filled from WLC+ for EQUIV's sake


def stem(c, aramaic):
    for _ in range(2):
        if len(c) > 3 and c[0] in "ודבלמכה":
            c = c[1:]
    ends = ["יא", "ין", "ון", "תא", "א", "ה"] if aramaic else ["ים", "ות", "ה", "ת"]
    for e in ends:
        if c.endswith(e) and len(c) - len(e) >= 2:
            return c[:-len(e)]
    return c


def like(a, h):
    """How alike an Aramaic and a Hebrew word are, 0 to 1."""
    ca, ch = consonants(a), consonants(h)
    if not ca or not ch:
        return 0
    # Words that stand for Hebrew ones they aren't cognate with: those only, with the same prefixes.
    for pa, ra in prefixed(ca):
        if ra in EQUIV:
            want = EQUIV[ra] if isinstance(EQUIV[ra], tuple) else (EQUIV[ra],)
            for ph, rh in prefixed(ch) + [(ch[:1], ch[1:])]:
                if rh in want:
                    return 1.0 if pa.replace("ד", "") == ph.replace("ה", "") else 0.8
            return 0
    sa, sh = stem(ca, True), stem(ch, False)
    # Longest common subsequence, with cognate letters counted as the same.
    n, m = len(sa), len(sh)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            eq = sa[i] == sh[j] or (sa[i], sh[j]) in SAME
            dp[i + 1][j + 1] = dp[i][j] + 1 if eq else max(dp[i][j + 1], dp[i + 1][j])
    l = dp[n][m]
    score = l / max(n, m)
    if sa[:1] != sh[:1] and not (sa[:1], sh[:1]) in SAME:
        score *= 0.8
    return score if l >= 2 or (n <= 2 and m <= 2 and l >= 1 and score == 1) else 0


def align(aram, heb, floor=0.6):
    """Order-keeping pairing of Aramaic and Hebrew words with the most likeness: {i: j}."""
    n, m = len(aram), len(heb)
    s = [[like(a, h[0]) for h in heb] for a in aram]
    best = [[0.0] * (m + 1) for _ in range(n + 1)]
    step = [[None] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            opts = [(best[i + 1][j], "a"), (best[i][j + 1], "h")]
            if s[i][j] >= floor:
                opts.append((best[i + 1][j + 1] + s[i][j], "p"))
            best[i][j], step[i][j] = max(opts)
    out, i, j = {}, 0, 0
    while i < n and j < m:
        st = step[i][j]
        if st == "p":
            out[i] = j
            i, j = i + 1, j + 1
        elif st == "a":
            i += 1
        else:
            j += 1
    return out


DIV = re.compile(r"<div><grk>(.*?)</grk>((?:<num>.*?</num>)*)<tvm>.*?</tvm><gra>(.*?)</gra></div>")
WORD = re.compile(r"[א-ת][֑-ׇא-ת]*")


def hebrew():
    db = sqlite3.connect(f"file:{LIBRARY / 'wlc+.bbli'}?mode=ro", uri=True)
    out = {}
    for b, c, v, t in db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible"):
        words = [(m.group(1), re.findall(r"<num>(.*?)</num>", m.group(2)), html.unescape(m.group(3))) for m in DIV.finditer(t or "")]
        out[(b, c, v)] = words
        for w, _, g in words:
            HEB_GLOSS.setdefault(consonants(w).lstrip("ודבלכמה") or consonants(w), g)
    db.close()
    return out


def build(name, heb, jas):
    src = LIBRARY / f"{name}.bbli"
    if not src.exists():
        print(f"  no {src.name}; skipped")
        return
    db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    rows = db.execute("SELECT Book, Chapter, Verse, Scripture FROM Bible ORDER BY Book, Chapter, Verse").fetchall()
    info = db.execute("SELECT Information FROM Details").fetchone()[0] or ""
    db.close()
    out, paired, looked, total = [], 0, 0, 0
    for b, c, v, text in rows:
        text = text or ""
        spans = [(m.start(), m.end(), m.group()) for m in WORD.finditer(text)]
        hw = heb.get((b, c, v), [])
        pairs = align([s[2] for s in spans], hw)
        s, last = [], 0
        for k, (a, e, w) in enumerate(spans):
            s.append(text[last:a] if not s or text[last:a].strip() else "")
            last = e
            total += 1
            if k in pairs:
                h, nums, g = hw[pairs[k]]
                paired += 1
                nums_html = "".join(f"<num>{n}</num>" for n in nums)
                s.append(f"<div><grk>{w}</grk>{nums_html}<tvm>Hebrew {html.escape(h)}</tvm><gra>{html.escape(g)}</gra></div>")
                continue
            j = look_up(w, jas)
            if j:
                looked += 1
                s.append(f"<div><grk>{w}</grk><tvm>Jastrow {html.escape(j[0])}</tvm><gra>{html.escape(j[1])}</gra></div>")
            else:
                s.append(w)
        s.append(text[last:])
        out.append((b, c, v, "".join(s).strip()))
    print(f"  {total} words: {paired} ({paired / total:.0%}) paired with the Hebrew, {looked} ({looked / total:.0%}) from Jastrow, "
          f"{total - paired - looked} ({(total - paired - looked) / total:.0%}) without English")

    m = MODULES[name]
    about = (info + "<p>This edition shows English under each Aramaic word. Where a word renders a word of the Hebrew, it is paired "
             "with it (by their consonants, the Targum being close to the Hebrew and its words mostly cognate) and has that "
             "word's English (STEPBible's TBESH, CC BY 4.0) and Strong's number; otherwise the English is the first gloss of "
             "the headword it seems to be in Jastrow's Dictionary of the Targumim (1903; Sefaria's digitisation, CC BY-NC). "
             f"{paired / total:.0%} of the words are paired and {looked / total:.0%} from Jastrow. The pairing and the "
             "look-ups are a program's, so some are wrong; the tooltip says which each is. Built by Two-edged Sword's tools/targum.</p>")
    p = LIBRARY / f"{name}+.bbli"
    tmp = p.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("""CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL);
        CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT);
        CREATE INDEX BookChapterVerseIndex ON Bible (Book, Chapter, Verse);""")
    db.execute("INSERT INTO Details VALUES (?,?,?,1,1,0,0,1,1)", (m["title"], m["abbrev"], about))
    db.executemany("INSERT INTO Bible VALUES (?,?,?,?)", out)
    db.commit()
    db.close()
    tmp.replace(p)
    print(f"{p.name}: {len(out)} verses")


def main():
    names = sys.argv[1:] or list(MODULES)
    for n in names:
        if n not in MODULES:
            sys.exit(f"unknown module {n}; one of {', '.join(MODULES)}")
    if not (LIBRARY / "wlc+.bbli").exists():
        sys.exit("no wlc+.bbli; build it first: python3 tools/wlc/build.py")
    heb = hebrew()
    jas = jastrow()
    print(f"Jastrow: {len(jas)} headwords with English")
    for n in names:
        print(n)
        build(n, heb, jas)


if __name__ == "__main__":
    main()
