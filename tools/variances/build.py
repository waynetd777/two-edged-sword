# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Checks the reviewed batches and writes the app's variance file.

    python3 tools/variances/build.py niv

Reads variances-work/<module>/reviewed/*.json (see review.md) and writes variances-<module>.json
to the app's data folder, where the reading pane picks it up. It merges: a verse in the batches
takes its reviewed record (or loses its old one if the review dropped it); every other record in
the existing file is kept, so the Old Testament, or a list of disputed verses, can be added later.
"""
import argparse, datetime, json, re, sys
from pathlib import Path
from candidates import DATA

KINDS = {"omission", "deity", "atonement", "trinity", "salvation", "judgment", "prophecy", "virgin-birth", "other"}


def check(r, where):
    errs = []
    for k in ("book", "chapter", "verse"):
        if not isinstance(r.get(k), int) or r[k] < 1:
            errs.append(f"bad {k}")
    if r.get("kind") not in KINDS:
        errs.append(f"bad kind {r.get('kind')!r}")
    if r.get("weight") not in ("major", "minor"):
        errs.append(f"bad weight {r.get('weight')!r}")
    for k in ("change", "note"):
        if not isinstance(r.get(k), str) or not r[k].strip():
            errs.append(f"missing {k}")
    if len(r.get("change", "").split()) > 16:
        errs.append("change is too long")
    return [f"{where} {r.get('book')}.{r.get('chapter')}.{r.get('verse')}: {e}" for e in errs]


def store_name(module):
    return "variances-" + re.sub(r"[^A-Za-z0-9_-]", "_", module)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("module")
    ap.add_argument("--work", type=Path)
    a = ap.parse_args()
    work = a.work or DATA / "variances-work" / a.module
    batches = sorted((work / "batches").glob("*.json"))
    reviewed = {p.name: p for p in (work / "reviewed").glob("*.json")}
    missing = [b.name for b in batches if b.name not in reviewed]
    if missing:
        sys.exit(f"not reviewed yet: {', '.join(missing)}")
    base, picked_all, records, errs = "kjv", set(), {}, []
    for b in batches:
        batch = json.loads(b.read_text())
        base = batch["base"]
        picked = {(c["book"], c["chapter"], c["verse"]) for c in batch["candidates"]}
        picked_all |= picked
        out = json.loads(reviewed[b.name].read_text())
        for r in out["records"]:
            errs += check(r, b.name)
            if (r.get("book"), r.get("chapter"), r.get("verse")) not in picked:
                errs.append(f"{b.name} {r.get('book')}.{r.get('chapter')}.{r.get('verse')}: not a candidate in this batch")
            records[(r["book"], r["chapter"], r["verse"])] = {k: r[k].strip() if isinstance(r[k], str) else r[k] for k in ("book", "chapter", "verse", "kind", "weight", "change", "note")}
    if errs:
        sys.exit("\n".join(errs))
    target = DATA / f"{store_name(a.module)}.json"
    if target.exists():
        for r in json.loads(target.read_text()).get("records", []):
            if (r["book"], r["chapter"], r["verse"]) not in picked_all:
                records.setdefault((r["book"], r["chapter"], r["verse"]), r)
    doc = {"module": a.module, "base": base, "updated": datetime.date.today().isoformat(), "records": [records[k] for k in sorted(records)]}
    target.write_text(json.dumps(doc, indent=1, ensure_ascii=False))
    major = sum(r["weight"] == "major" for r in doc["records"])
    print(f"{len(doc['records'])} records ({major} major) → {target}")


if __name__ == "__main__":
    main()
