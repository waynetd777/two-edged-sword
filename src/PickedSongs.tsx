// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { Picked } from "./worship";

/** Songs the assistant chose (for Quiet time's Worship part or a chapter): what they're chosen for,
 *  any note (why there are none, in red), and each song with why it suits. */
export function PickedSongs({ intro, note, songs }: Pick<Picked, "intro" | "note" | "songs">) {
  return (
    <>
      {intro && <p style={{ margin: 0, font: "400 15px/1.55 var(--serif)" }}>{intro}</p>}
      {note && (
        <div className={songs.length ? "hint" : "err"} style={{ fontSize: 12.5 }}>
          {note}
        </div>
      )}
      {songs.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          {songs.map((x) => (
            <li key={x.id}>
              <b style={{ fontWeight: 600 }}>{x.name}</b> <span className="n">— {x.artist}</span>
              {x.why && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)", marginTop: 2 }}>{x.why}</div>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
