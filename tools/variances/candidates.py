# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Verses where a translation may differ in meaning from a base Bible (the KJV by default), for review.

    python3 tools/variances/candidates.py niv --books 40-66
    python3 tools/variances/candidates.py niv --refs tools/variances/disputed-ot.txt

Reads both modules from the library (tools/modules.py finds them) and writes batches of candidates, with both texts,
to a work folder outside the repo (the translation's text is copyrighted; it is never committed).
Each candidate says why it was picked. The review (see review.md) decides which are real.
A new set of batches replaces the old ones and their reviews, so it stops if there are reviews that
build.py hasn't yet merged (--discard-reviews to drop them).
"""
import argparse, json, re, sqlite3, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from modules import HOME, LIBRARY, find  # noqa: E402
DATA = HOME / "Library/Application Support/Two-edged Sword"


def store_name(module):
    """The variance file's name (without .json) in DATA, which the reading pane reads."""
    return "variances-" + re.sub(r"[^A-Za-z0-9_-]", "_", module)

# A term the base uses more often than the translation does (after its modern equivalents are
# counted) is a sign that something was dropped or changed.
TERMS = {
    "jesus": ["jesus"], "christ": ["christ", "messiah"], "lord": ["lord", "jehovah", "yahweh"], "god": ["god"],
    "blood": ["blood"], "spirit": ["spirit"], "holy ghost": ["holy spirit"], "son": ["son"],
    "father": ["father"], "begotten": ["begotten", "one and only"], "hell": ["hell"],
    "fasting": ["fasting", "fast"], "virgin": ["virgin"], "saviour": ["savior", "saviour"],
    "cross": ["cross"], "amen": ["amen"], "believe": ["believe"], "repent": ["repent"],
    "grace": ["grace"], "heaven": ["heaven", "heavens"], "damnation": ["damnation", "condemn"],
    "lucifer": ["lucifer"], "godhead": ["godhead"], "worship": ["worship"], "for ever": ["for ever", "forever"],
    "joseph": ["joseph"], "commandments": ["commandments", "commands"], "firstborn": ["firstborn", "first-born", "first born"],
    "everlasting": ["everlasting", "eternal"], "salvation": ["salvation", "saved"], "church": ["church"], "chosen": ["chosen"], "on me": ["on me", "in me"],
}
WORD = re.compile(r"[a-z']+")
# Verses often raised in KJV-and-modern-translation debates whose difference no word count
# catches (a capital letter, a pronoun, a changed clause): always reviewed.
KNOWN = {(19, 2, 12), (19, 12, 7), (27, 9, 25), (27, 9, 26), (27, 3, 25), (23, 9, 3), (38, 12, 10), (18, 19, 26), (1, 22, 8),
         (5, 32, 8), (20, 8, 22), (19, 22, 16), (23, 53, 11), (33, 5, 2), (27, 7, 13), (19, 138, 2), (26, 28, 2), (1, 3, 15)}


def clean(t):
    t = re.sub(r"<num>[^<]*</num>|<sup>[^<]*</sup>|<not>[^<]*</not>", "", t or "")
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"&mdash;", "—", re.sub(r"\s+", " ", t)).strip()


def load(module):
    p = find(f"{module}.bbli")
    if not p.exists():
        sys.exit(f"no Bible module {module!r} in {LIBRARY}")
    c = sqlite3.connect(f"file:{p}?immutable=1", uri=True)
    return {(b, ch, v): clean(t) for b, ch, v, t in c.execute("select Book, Chapter, Verse, Scripture from Bible")}


def bridged(mod):
    """Verses a translation joins into an earlier one, which it marks "(6-7) …" (GNB): not missing."""
    out = set()
    for (b, ch, v), t in mod.items():
        m = re.match(r"\((\d+)-(\d+)\)", t)
        if m and int(m.group(1)) == v:
            out |= {(b, ch, n) for n in range(v + 1, int(m.group(2)) + 1)}
    return out


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
    ap.add_argument("--refs", type=Path, help="review exactly these verses: a file of 'book chapter verse' lines (e-Sword book numbers), # comments")
    ap.add_argument("--no-shorter", action="store_true", help="don't pick verses only for being much shorter (for the Old Testament, where both follow the Masoretic text and a shorter verse is idiom, not omission)")
    ap.add_argument("--out", type=Path, help="work folder (default: variances-work/<module> in the app's data folder)")
    ap.add_argument("--discard-reviews", action="store_true", help="replace reviews build.py hasn't merged yet")
    a = ap.parse_args()
    out = a.out or DATA / "variances-work" / a.module
    target = DATA / f"{store_name(a.module)}.json"
    built = target.stat().st_mtime if target.exists() else 0
    unmerged = sorted(p.name for p in (out / "reviewed").glob("*.json") if p.stat().st_mtime > built)
    if unmerged and not a.discard_reviews:
        sys.exit(f"reviews not yet merged: {', '.join(unmerged)} in {out / 'reviewed'}; run build.py {a.module} first, or pass --discard-reviews")
    lo, hi = (int(x) for x in (a.books.split("-") + [a.books])[:2])
    base, mod = load(a.base), load(a.module)
    only = None
    if a.refs:
        only = {tuple(int(x) for x in line.split("#")[0].split()) for line in a.refs.read_text().splitlines() if line.split("#")[0].strip()}
    joined = bridged(mod)
    found = []
    for ref in sorted(base):
        if only is not None:
            if ref in only:
                found.append({"book": ref[0], "chapter": ref[1], "verse": ref[2], "why": reasons(base[ref], mod.get(ref, ""), False) or ["often disputed"], "base": base[ref], "text": mod.get(ref, "")})
            continue
        if not lo <= ref[0] <= hi:
            continue
        if not mod.get(ref) and ref in joined:
            continue
        why = reasons(base[ref], mod.get(ref, ""), not a.no_shorter)
        if not why and ref in KNOWN:
            why = ["often disputed"]
        if why:
            found.append({"book": ref[0], "chapter": ref[1], "verse": ref[2], "why": why, "base": base[ref], "text": mod.get(ref, "")})
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
