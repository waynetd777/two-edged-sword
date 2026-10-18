// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// When the app opens: an offer to open the Getting started guide in the help, until "Don't ask me
// again" is ticked (settings.offerGuide). Not in screenshot mode, which is read-only.

import { useEffect, useState } from "react";
import { isReadOnly } from "./api";
import { openHelp } from "./Help";
import { Sword } from "./icons";
import { useApp } from "./state";
import { Dialog } from "./ui";

export function WelcomeDialog() {
  const app = useApp();
  const [shown, setShown] = useState(false);
  const [never, setNever] = useState(false);
  const offer = app.plansReady && app.settings.offerGuide;
  // Once a launch, after the stored settings have loaded; a scene has set read-only by then.
  useEffect(() => {
    if (!offer) return;
    const t = window.setTimeout(() => {
      if (!isReadOnly()) setShown(true);
    }, 800);
    return () => window.clearTimeout(t);
  }, [offer]);
  if (!shown) return null;
  const close = (open: boolean) => {
    setShown(false);
    if (never) app.set({ offerGuide: false });
    if (open) openHelp({ guide: "start-here", step: 0 });
  };
  return (
    <Dialog onClose={() => close(false)} width={480} label="Welcome to Two-edged Sword">
      <div className="update-head">
        <Sword size={56} />
        <div>
          <div style={{ font: "500 24px/1.2 var(--display)" }}>Welcome to Two-edged Sword</div>
          <div style={{ color: "var(--muted)", marginTop: 2 }}>
            Getting started walks you through the app a step at a time, beginning with how to find your way around.
          </div>
        </div>
      </div>
      <div className="foot">
        <label className="opt" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
          Don't ask me again
        </label>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={() => close(false)}>
          Not now
        </button>
        <button className="btn primary" type="button" autoFocus onClick={() => close(true)}>
          Open Getting started
        </button>
      </div>
    </Dialog>
  );
}
