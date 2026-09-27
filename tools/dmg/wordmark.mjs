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
