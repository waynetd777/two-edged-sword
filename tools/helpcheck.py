#!/usr/bin/env python3
# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Checks the in-app help (src/Help.tsx), which shows the user guides in docs/.

Every link in a guide must point at a guide the help shows, and at a heading in it; each screen's
place in src/guides.ts must be a heading too; and src/guides.ts must list every guide but development.md.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
GUIDES_TS = (ROOT / "src/guides.ts").read_text(encoding="utf-8")
def slug(heading: str) -> str:
    """GitHub's anchor for a heading, as src/guides.ts makes it."""
    return re.sub(r"\s", "-", re.sub(r"[^\w\s-]", "", heading.strip().lower()))


# What app:screen#target buttons can point at: the words on src/ lines that set data-help.
HELP_TARGETS = {
    w
    for f in (ROOT / "src").glob("*.tsx")
    for line in f.read_text(encoding="utf-8").splitlines()
    if "data-help=" in line
    for w in re.findall(r'"([\w-]+)"', line.split("data-help=", 1)[1])
}
# Settings marks each section with the slug of its title (src/Settings.tsx Section).
HELP_TARGETS |= {slug(t) for t in re.findall(r'<Section title="([^"]+)"', (ROOT / "src/Settings.tsx").read_text(encoding="utf-8"))}
APP_ACTIONS = {"read", "compare", "search", "word", "journal", "plans", "library", "history", "settings", "open", "palette", "modules", "rescan"}


def main() -> int:
    pages = re.findall(
        r'"([\w-]+)"', re.search(r"const PAGES = \[([^\]]*)\]", GUIDES_TS)[1]
    )
    errors = []
    guides = {p.stem for p in DOCS.glob("*.md")} - {"development"}
    if set(pages) != guides:
        errors.append(
            f"src/guides.ts PAGES {sorted(pages)} isn't the guides in docs/ {sorted(guides)}"
        )
    anchors = {
        p: {
            slug(h)
            for h in re.findall(
                r"^#{2,3} (.+)$", (DOCS / f"{p}.md").read_text(encoding="utf-8"), re.MULTILINE
            )
        }
        for p in pages
        if (DOCS / f"{p}.md").exists()
    }

    for page in anchors:
        text = (DOCS / f"{page}.md").read_text(encoding="utf-8")
        for os_ in ("mac", "windows", "github"):
            if text.count(f"<!-- {os_} -->") != text.count(f"<!-- /{os_} -->"):
                errors.append(f"docs/{page}.md has an unclosed <!-- {os_} --> part")
        for href in re.findall(r"\]\(([^)\s]+)\)", text):
            if re.match(r"https?:|images/|mailto:", href):
                continue
            if href.startswith("app:"):
                # An app: link (src/Help.tsx runAction): a screen, a passage, ⌘K, the modules folder or Rescan.
                what = href[4:].split("#")[0].split("/")[0]
                if what not in APP_ACTIONS:
                    errors.append(f"docs/{page}.md has a link to {href}, which src/Help.tsx can't do")
                target = href.partition("#")[2]
                if target and target not in HELP_TARGETS:
                    errors.append(f"docs/{page}.md has a link to {href}, but nothing in src/ is marked data-help=\"{target}\"")
                continue
            m = re.fullmatch(r"(?:([\w-]+)\.md)?(?:#([\w-]+))?", href)
            to, anchor = (m[1] or page, m[2]) if m else (None, None)
            if to not in anchors:
                errors.append(f"docs/{page}.md links to {href}, which the help hasn't")
            elif anchor and anchor not in anchors[to]:
                errors.append(
                    f"docs/{page}.md links to {href}, but {to}.md has no such heading"
                )

    for to, anchor in re.findall(r'"([\w-]+)#([\w-]+)"', GUIDES_TS):
        if anchor not in anchors.get(to, ()):
            errors.append(
                f"src/guides.ts points a screen at {to}#{anchor}, which isn't a heading"
            )

    for e in errors:
        print(f"helpcheck: {e}", file=sys.stderr)
    if not errors:
        print(f"helpcheck: {len(anchors)} guides, links and screens all resolve")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
