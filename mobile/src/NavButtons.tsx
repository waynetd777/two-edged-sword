// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useHistory } from "./history";
import { Icon } from "./icons";

/** Back and forward, at the left of every tab's top bar. */
export function NavButtons() {
  const h = useHistory();
  return (
    <>
      <button className="nav" aria-label="Back" disabled={!h.canBack()} onClick={() => h.go(-1)}>
        <Icon name="back" size={22} />
      </button>
      <button className="nav" aria-label="Forward" disabled={!h.canForward()} onClick={() => h.go(1)}>
        <Icon name="forward" size={22} />
      </button>
    </>
  );
}
