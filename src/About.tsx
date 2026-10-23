// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
import { LibrarySource, ModuleInfo } from "./api";
import { isLicensed } from "./Ask";

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
