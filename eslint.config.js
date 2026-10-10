// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// ESLint for the TypeScript front end (`make lint`). Formatting is Prettier's job, so its rules are off here.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Of src-tauri, only the scripts the app runs in web pages (frame.js) are JavaScript to check.
  { ignores: ["dist", "node_modules", "src-tauri/*", "!src-tauri/src", "src-tauri/src/*", "!src-tauri/src/*.js", "_sift", "tools"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: { globals: globals.browser },
    // The classic hook rules only: the React Compiler ones (refs, set-state-in-effect, …) assume the
    // compiler, which this app doesn't use.
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
  // Plain browser scripts, run in the pages the app shows, and the product page's (site/).
  {
    files: ["src-tauri/src/*.js", "site/*.js"],
    extends: [js.configs.recommended, prettier],
    languageOptions: { globals: globals.browser, sourceType: "script" },
  },
);
