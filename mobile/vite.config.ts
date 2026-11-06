// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "../src");

/** The phone shares the desktop's pure helpers (bible.ts, esword.tsx). Two of esword.tsx's imports
 *  reach into the desktop app (its invoke wrappers and the map pictures); they're swapped for small
 *  phone versions here, so the rest of the desktop app isn't pulled in. */
const SHIMS: Record<string, string> = {
  "./api": resolve(here, "src/shims/desktopApi.ts"),
  "./MapPlaces": resolve(here, "src/shims/mapPlaces.tsx"),
};
function desktopShims(): Plugin {
  return {
    name: "tes-desktop-shims",
    enforce: "pre",
    resolveId(id, importer) {
      if (importer && importer.startsWith(desktop) && SHIMS[id]) return SHIMS[id];
      return null;
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [desktopShims(), react()],
  clearScreen: false,
  server: { port: 1432, strictPort: true, fs: { allow: [resolve(here, "..")] } },
  build: { outDir: "dist", emptyOutDir: true, target: "safari16" },
});
