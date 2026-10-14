# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Writes src/pictures/kjv-verses.ts: each picture's verse (its `verse:` in src/pictures) in the
bundled KJV, for the pictures viewer, which runs in a browser and can't read the library. The app
itself looks the verses up in the Bible chosen in Settings. `make visions` runs it first.

    python3 tools/visions_verses.py
"""

import json
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from books import NAMES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
names = [n.lower() for n in NAMES]

refs = sorted({r for p in (ROOT / "src/pictures").glob("*.ts") for r in re.findall(r'^\s+verse: "([^"]+)",$', p.read_text(), re.M)})
db = sqlite3.connect(f"file:{ROOT / 'src-tauri/modules/kjv.bbli'}?mode=ro", uri=True)
out = {}
for ref in refs:
    m = re.fullmatch(r"(.+) (\d+):(\d+)", ref)
    book = m[1].lower()
    book = "psalms" if book == "psalm" else book
    row = db.execute("select Scripture from Bible where Book=? and Chapter=? and Verse=?", (names.index(book) + 1, int(m[2]), int(m[3]))).fetchone()
    if not row:
        sys.exit(f"{ref}: not in the KJV")
    out[ref] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", row[0])).strip()

body = "".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n" for k, v in out.items())
(ROOT / "src/pictures/kjv-verses.ts").write_text(
    "// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.\n"
    "// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.\n\n"
    "// Made by tools/visions_verses.py: each picture's verse in the KJV, for the pictures viewer only.\n\n"
    f"export const KJV_VERSES: Record<string, string> = {{\n{body}}};\n"
)
print(f"{len(out)} verses")
