"""Verses where a translation may differ in meaning from a base Bible (the KJV by default), for review.

    python3 tools/variances/candidates.py niv --books 40-66

Reads both modules from the e-Sword library and writes batches of candidates, with both texts,
to a work folder outside the repo (the translation's text is copyrighted; it is never committed).
Each candidate says why it was picked. The review (see review.md) decides which are real.
"""
import argparse, json, os, re, sqlite3, sys
from pathlib import Path

HOME = Path(os.environ.get("HOME", ""))
LIBRARY = HOME / "Library/Containers/net.e-sword.e-Sword-X/Data/Library/Application Support"
DATA = HOME / "Library/Application Support/Two-edged Sword"

# A term the base uses more often than the translation does (after its modern equivalents are
# counted) is a sign that something was dropped or changed.
TERMS = {
    "jesus": ["jesus"], "christ": ["christ", "messiah"], "lord": ["lord"], "god": ["god"],
    "blood": ["blood"], "spirit": ["spirit"], "holy ghost": ["holy spirit"], "son": ["son"],
    "father": ["father"], "begotten": ["begotten", "one and only"], "hell": ["hell"],
    "fasting": ["fasting", "fast"], "virgin": ["virgin"], "saviour": ["savior", "saviour"],
    "cross": ["cross"], "amen": ["amen"], "believe": ["believe"], "repent": ["repent"],
    "grace": ["grace"], "heaven": ["heaven", "heavens"], "damnation": ["damnation", "condemn"],
    "lucifer": ["lucifer"], "godhead": ["godhead"], "worship": ["worship"], "for ever": ["for ever", "forever"],
    "joseph": ["joseph"], "commandments": ["commandments", "commands"], "firstborn": ["firstborn"],
    "everlasting": ["everlasting", "eternal"], "salvation": ["salvation", "saved"], "church": ["church"], "chosen": ["chosen"], "on me": ["on me", "in me"],
}
WORD = re.compile(r"[a-z']+")
# Verses often raised in KJV-and-modern-translation debates whose difference no word count
# catches (a capital letter, a pronoun, a changed clause): always reviewed.
KNOWN = {(19, 2, 12), (19, 12, 7), (27, 9, 25), (27, 9, 26), (27, 3, 25), (23, 9, 3), (38, 12, 10), (18, 19, 26), (1, 22, 8),
         (5, 32, 8), (20, 8, 22), (19, 22, 16), (23, 53, 11), (33, 5, 2), (27, 7, 13), (19, 138, 2), (26, 28, 2), (1, 3, 15)}


def clean(t):
    t = re.sub(r"<num>[^<]*</num>|<sup>[^<]*</sup>", "", t or "")
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"&mdash;", "—", re.sub(r"\s+", " ", t)).strip()


def load(module):
    p = LIBRARY / f"{module}.bbli"
    if not p.exists():
        sys.exit(f"no Bible module {module!r} in {LIBRARY}")
    c = sqlite3.connect(f"file:{p}?immutable=1", uri=True)
    return {(b, ch, v): clean(t) for b, ch, v, t in c.execute("select Book, Chapter, Verse, Scripture from Bible")}


def count(text, phrase):
    return len(re.findall(r"\b" + re.escape(phrase) + r"\b", text))


def reasons(base, text, shorter=True):
    if not text:
        return ["verse missing"]
    b, t = base.lower(), text.lower()
    out = [f"fewer '{k}'" for k, alts in TERMS.items() if count(b, k) > sum(count(t, a) for a in alts)]
    bw, tw = len(WORD.findall(b)), len(WORD.findall(t))
    if shorter and bw >= 12 and tw < bw * 0.7:
        out.append(f"much shorter ({tw} words vs {bw})")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("module")
    ap.add_argument("--base", default="kjv")
    ap.add_argument("--books", default="1-66", help="e-Sword book numbers, e.g. 40-66")
    ap.add_argument("--batch", type=int, default=80)
    ap.add_argument("--no-shorter", action="store_true", help="don't pick verses only for being much shorter (for the Old Testament, where both follow the Masoretic text and a shorter verse is idiom, not omission)")
    ap.add_argument("--out", type=Path, help="work folder (default: variances-work/<module> in the app's data folder)")
    a = ap.parse_args()
    lo, hi = (int(x) for x in (a.books.split("-") + [a.books])[:2])
    base, mod = load(a.base), load(a.module)
    found = []
    for ref in sorted(base):
        if not lo <= ref[0] <= hi:
            continue
        why = reasons(base[ref], mod.get(ref, ""), not a.no_shorter)
        if not why and ref in KNOWN:
            why = ["often disputed"]
        if why:
            found.append({"book": ref[0], "chapter": ref[1], "verse": ref[2], "why": why, "base": base[ref], "text": mod.get(ref, "")})
    out = a.out or DATA / "variances-work" / a.module
    (out / "batches").mkdir(parents=True, exist_ok=True)
    (out / "reviewed").mkdir(exist_ok=True)
    # A new set of batches: reviews of the old ones no longer match (build.py has already kept their records).
    for old in [*(out / "batches").glob("*.json"), *(out / "reviewed").glob("*.json")]:
        old.unlink()
    for i in range(0, len(found), a.batch):
        name = f"{i // a.batch + 1:03d}.json"
        (out / "batches" / name).write_text(json.dumps({"base": a.base, "module": a.module, "candidates": found[i:i + a.batch]}, indent=1, ensure_ascii=False))
    print(f"{len(found)} candidates in {-(-len(found) // a.batch)} batches → {out}")


if __name__ == "__main__":
    main()
