# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

"""The phone app's downloads: every module the desktop app ships (src-tauri/modules, all built from
public-domain sources by tools/core/build.py) that the phone doesn't bundle, gzipped, with a manifest.

    python3 tools/modules_release.py            # writes target/modules-release/ (run from mobile/)

The files go up as the assets of the GitHub release tagged `modules` (make modules-publish). The app
reads manifest.json from there, downloads a module's .gz, checks its SHA-256 and unpacks it into its
Modules folder. Never put a module here that the desktop app doesn't itself ship: e-Sword's and other
third-party modules may not be passed on.
"""

import base64
import gzip
import hashlib
import json
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
MODULES = HERE.parent / "src-tauri" / "modules"
OUT = HERE / "target" / "modules-release"
KINDS = {".bbli": "bible", ".cmti": "commentary", ".dcti": "dictionary", ".lexi": "lexicon", ".refi": "reference", ".devi": "devotional"}


def bundled() -> set[str]:
    conf = json.loads((HERE / "src-tauri" / "tauri.conf.json").read_text())
    return {Path(v).name for v in conf["bundle"]["resources"].values()}


def details(path: Path) -> tuple[str, str, str]:
    c = sqlite3.connect(f"file:{path}?immutable=1", uri=True)
    try:
        row = c.execute("SELECT Title, Abbreviation, Information FROM Details LIMIT 1").fetchone() or ("", "", "")
    finally:
        c.close()
    return (row[0] or path.stem).strip(), (row[1] or "").strip(), (row[2] or "").strip()


def main():
    skip = bundled()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    entries = []
    for path in sorted(MODULES.iterdir()):
        kind = KINDS.get(path.suffix.lower())
        if not kind or path.name in skip:
            continue
        data = path.read_bytes()
        gz = OUT / (path.name + ".gz")
        # mtime=0: the same module gives the same .gz, so an unchanged one needn't be uploaded again.
        with open(gz, "wb") as f, gzip.GzipFile(filename="", mode="wb", fileobj=f, compresslevel=9, mtime=0) as z:
            z.write(data)
        title, abbrev, info = details(path)
        # Its cover goes up as a file of its own, fetched when its About is opened: in the manifest, all of
        # them would make it over a megabyte. The About keeps <img src="cover"> where it was.
        cover = None
        m = re.search(r'<img\b[^>]*src="data:image/(\w+);base64,([^"]+)"[^>]*>', info)
        if m:
            cover = f"{path.name}.cover.{m.group(1)}"
            (OUT / cover).write_bytes(base64.b64decode(m.group(2)))
            info = info[: m.start()] + '<img src="cover">' + info[m.end() :]
        entries.append(
            {
                "id": path.stem,
                "file": path.name,
                "kind": kind,
                "title": title,
                "abbrev": abbrev,
                "size": len(data),
                "gz": gz.stat().st_size,
                "sha256": hashlib.sha256(data).hexdigest(),
                # Its About, so the Library can show it before it's downloaded; any other pictures are left out.
                "info": re.sub(r'<img\b(?![^>]*src="cover")[^>]*>', "", info),
                **({"cover": cover} if cover else {}),
            }
        )
        print(f"{path.name:36} {len(data) / 1e6:6.1f} MB -> {gz.stat().st_size / 1e6:6.1f} MB")
    manifest = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "modules": entries}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    total = sum(e["gz"] for e in entries)
    print(f"{len(entries)} modules, {total / 1e6:.0f} MB to upload, in {OUT}")


if __name__ == "__main__":
    main()
