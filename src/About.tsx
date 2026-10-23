// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
import { CSSProperties, useState } from "react";
import { LibrarySource, ModuleInfo } from "./api";
import { isLicensed } from "./Ask";
import { ImageViewer } from "./ImageViewer";

/** A module's terms, as its About text gives them: copyrighted ones are for personal use; one under a
 *  non-commercial licence (Vulg-C+'s CC BY-NC-SA) mustn't be sold; CC BY, CC BY-SA, CC0, GPL or Apache
 *  is an open licence (credit owed); the rest are public domain. */
export function licenceOf(m: ModuleInfo): "Personal use" | "Non-commercial" | "Open licence" | "Public domain" {
  if (isLicensed(m)) return "Personal use";
  if (/\bCC[ -]?BY-NC|NonCommercial/i.test(m.info)) return "Non-commercial"; // a licence named, not a source's note
  if (/\bCC[ -]?BY\b|\bCC0\b|\bGPL\b|Apache[ -]2/i.test(m.info)) return "Open licence";
  return "Public domain";
}

export const SOURCE: Record<LibrarySource, string> = { app: "your modules folder", esword: "e-Sword X", bundled: "built in" };

/** A module's About text split into the cover it opens with, if any (the app's own books have one), and the rest. */
export function splitCover(info: string): [string | undefined, string] {
  const c = info.match(/^\s*<p>\s*<img src="(data:image\/[^"]+)"[^>]*>\s*<\/p>/);
  return c ? [c[1], info.slice(c[0].length)] : [undefined, info];
}

/** A book's cover at the top right of its About text, which runs round it, justified so it has a straight edge.
 *  A click shows it full screen. */
export function Cover({ src, title, width = 84 }: { src: string; title: string; width?: number }) {
  const [big, setBig] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={`The cover of ${title}`}
        title="Click to enlarge"
        className="zoomable"
        onClick={() => setBig(true)}
        style={{ float: "right", width, margin: "2px 0 10px 16px", borderRadius: 4, boxShadow: "0 1px 6px rgba(0,0,0,.35)", cursor: "zoom-in" }}
      />
      {big && <ImageViewer images={[src]} start={0} onClose={() => setBig(false)} />}
    </>
  );
}

/** About text set justified, with hyphens so the gaps stay small. */
export const JUSTIFIED: CSSProperties = { textAlign: "justify", hyphens: "auto" };
