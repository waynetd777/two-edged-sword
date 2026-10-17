# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""Adds the Windows installer to a GitHub release the Mac's make release published: signs the NSIS
installer with the updater key, uploads it and its signature, and adds windows-x86_64 to the
release's latest.json, which installed copies read (tauri.conf.json, plugins.updater). Run by
.github/workflows/windows-release.yml on Windows, after `npx tauri build`.

    python tools/update_windows.py v1.0.33

Signs with TAURI_SIGNING_PRIVATE_KEY (the key's contents, a repository secret) and
TAURI_SIGNING_PRIVATE_KEY_PASSWORD; uploads with gh, which needs GH_TOKEN.
"""
import json, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONF = json.loads((ROOT / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
NAME, VERSION = CONF["productName"], CONF["version"]
BUNDLE = ROOT / "src-tauri/target/release/bundle/nsis"
REPO = "waynetd777/two-edged-sword"
# One name for every version, so a link to the latest release's installer never changes.
ASSET = f"{NAME.replace(' ', '-')}_x64-setup.exe"


def run(*cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, check=True, **kw)


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else f"v{VERSION}"
    if tag != f"v{VERSION}":
        sys.exit(f"update_windows: the release is {tag} but this checkout is {VERSION}")
    built = BUNDLE / f"{NAME}_{VERSION}_x64-setup.exe"
    if not built.exists():
        sys.exit(f"update_windows: no {built.relative_to(ROOT)}; run npx tauri build first")
    out = BUNDLE / ASSET
    shutil.copyfile(built, out)
    # npx is npx.cmd on Windows, which only a shell runs.
    run("npx", "tauri", "signer", "sign", str(out), shell=sys.platform == "win32", stdout=subprocess.DEVNULL)
    sig = Path(f"{out}.sig")
    latest = BUNDLE / "latest.json"
    run("gh", "release", "download", tag, "--repo", REPO, "--pattern", "latest.json", "--dir", str(BUNDLE), "--clobber")
    data = json.loads(latest.read_text(encoding="utf-8"))
    data["platforms"]["windows-x86_64"] = {
        "signature": sig.read_text(encoding="utf-8").strip(),
        "url": f"https://github.com/{REPO}/releases/download/{tag}/{ASSET}",
    }
    latest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    run("gh", "release", "upload", tag, "--repo", REPO, "--clobber", str(out), str(sig), str(latest))
    print(f"added {ASSET} to {tag}")


if __name__ == "__main__":
    main()
