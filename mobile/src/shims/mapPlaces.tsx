// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Stands in for the desktop's MapPlaces.tsx in the phone app (vite.config.ts): maps' clickable
// places aren't on the phone yet, so a map shows as a plain picture.
import type { Ref } from "../../../src/bible";

export interface Place {
  name: string;
  sure: boolean;
  x: number;
  y: number;
  r: number;
  label?: [number, number, number, number];
  refs: Ref[];
}

export const imagePlaces = (_img: Element): Place[] => [];

export function MapPicture({ src, onImage }: { src: string; places: Place[]; onImage?: (src: string) => void; onPick: unknown; picked?: Place | null }) {
  return <img src={src} alt="" style={{ maxWidth: "100%" }} onClick={() => onImage?.(src)} />;
}
