// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Stands in for the desktop's src/api.ts when its pure helpers (esword.tsx, lexicon.ts) are built
// into the phone app (vite.config.ts). They only ask it for lexicon entries.
import { invoke } from "@tauri-apps/api/core";

export const api = {
  article: (kind: string, module: string, topic: string) =>
    invoke<{ module: string; title: string; topic: string; html: string } | null>("article", { kind, module, topic }),
};
