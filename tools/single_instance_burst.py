# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

"""Checks that a burst of launches leaves one Two-edged Sword running (Windows).

    python tools/single_instance_burst.py --exe src-tauri/target/release/TwoEdgedSword.exe [--count 8] [--wait 30]

Starts the app `--count` times as fast as the shell can (a few hundred milliseconds for eight),
waits `--wait` seconds for the copies to start or hand over (src-tauri/src/single_instance_win.rs),
then counts the processes running that .exe. Passes when exactly one is left. `--exe` is a release
build (`npx tauri build`) or the installed app: a debug build doesn't take the lock. Quit the app
first, and quit the copy that's left afterwards from its notification-area menu.
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

PS = ["powershell", "-NoProfile", "-Command"]


def copies(exe: Path) -> list[int]:
    """The ids of the processes running `exe`."""
    out = subprocess.run(
        PS
        + [
            f'Get-CimInstance Win32_Process -Filter "Name=\'{exe.name}\'" | ForEach-Object {{ "$($_.ProcessId)`t$($_.ExecutablePath)" }}'
        ],
        capture_output=True,
        text=True,
        check=False,
    ).stdout
    found = []
    for line in out.splitlines():
        pid, _, path = line.partition("\t")
        if pid.strip().isdigit() and path.strip() and Path(path.strip()).resolve() == exe:
            found.append(int(pid))
    return found


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exe", required=True)
    ap.add_argument("--count", type=int, default=8)
    ap.add_argument("--wait", type=float, default=30)
    a = ap.parse_args()

    exe = Path(a.exe).resolve()
    before = copies(exe)
    if before:
        print(f"already running before the burst: {before}; quit it first")
        return 2

    t0 = time.perf_counter()
    for _ in range(a.count):
        subprocess.Popen([str(exe)], close_fds=True)
    print(f"launched {a.count} copies of {exe} in {time.perf_counter() - t0:.2f} s")

    time.sleep(a.wait)
    live = copies(exe)
    print(f"after {a.wait:g} s: {len(live)} copy(ies) {live}")
    ok = len(live) == 1
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
