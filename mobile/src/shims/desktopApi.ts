// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Stands in for the desktop's src/api.ts when esword.tsx is built into the phone app
// (vite.config.ts). esword.tsx only asks it for KJV glosses, which the phone doesn't show yet.
export const api = {
  article: async (_kind: string, _module: string, _topic: string): Promise<{ html: string } | null> => null,
};
