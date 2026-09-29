// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Prints the app's wordmark (src/icons.tsx) as static SVG, for the DMG's background.
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const { Wordmark } = await vite.ssrLoadModule("/src/icons.tsx");
  process.stdout.write(renderToStaticMarkup(createElement(Wordmark)));
} finally {
  await vite.close();
}
