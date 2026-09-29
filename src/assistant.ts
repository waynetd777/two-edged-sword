// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Which AI CLIs are installed and the models they offer. Ask needs Claude Code, Codex,
// Antigravity or GitHub Copilot on this Mac; with none, every Ask control is hidden. Checked once at start and again when Settings
// opens, so installing one takes effect without a restart.

import { useSyncExternalStore } from "react";
import { api, AssistantStatus } from "./api";

export type Provider = "claude" | "codex" | "antigravity" | "copilot";
export interface ModelOpt {
  id: string;
  name: string;
  provider: Provider;
}

// Claude Code's aliases, which it resolves to the newest model of each family, so a new Sonnet
// needs no app update. "claude:" routes the id to Claude Code and is stripped before it runs.
const CLAUDE_MODELS: ModelOpt[] = [
  { id: "claude:opus", name: "Claude Opus", provider: "claude" },
  { id: "claude:sonnet", name: "Claude Sonnet", provider: "claude" },
  { id: "claude:haiku", name: "Claude Haiku", provider: "claude" },
];
/** Pinned ids from before the aliases, kept so old chats still show their model's name. */
const OLD_CLAUDE_NAMES: Record<string, string> = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
};
/** A pinned Claude id ("claude-sonnet-5") as its family's alias ("claude:sonnet"); anything else unchanged. */
export const claudeAlias = (id: string) => id.replace(/^claude-(opus|sonnet|haiku)\b.*$/, "claude:$1");

export const providerOf = (id: string): Provider =>
  id.startsWith("agy:") ? "antigravity" : id.startsWith("copilot:") ? "copilot" : id.startsWith("claude") ? "claude" : "codex";
export const PROVIDER_NAME: Record<Provider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  antigravity: "Antigravity",
  copilot: "GitHub Copilot",
};
/** The model menus' headings: by the tool that runs them (Antigravity offers Claude and GPT models too). */
const GROUP_NAME: Record<Provider, string> = {
  claude: "Claude Code",
  codex: "ChatGPT (Codex)",
  antigravity: "Antigravity (Google)",
  copilot: "GitHub Copilot",
};

/** The models by the tool that runs them, in a fixed order, leaving out tools with none. */
export const modelGroups = (models: ModelOpt[]) =>
  (["claude", "codex", "antigravity", "copilot"] as const)
    .map((p) => ({ provider: p, name: GROUP_NAME[p], models: models.filter((m) => m.provider === p) }))
    .filter((g) => g.models.length);

export interface Assistant {
  /** null until the first check returns. */
  status: AssistantStatus | null;
  models: ModelOpt[];
  /** False only once the check has found neither CLI, so nothing flickers away at start. */
  available: boolean;
}

let state: Assistant = { status: null, models: [], available: true };
const listeners = new Set<() => void>();

export function refreshAssistant() {
  api
    .assistantStatus()
    .then((status) => {
      const agy = (status.antigravity?.path ? status.antigravity.models : []).map((m) => ({ ...m, provider: "antigravity" as const }));
      const copilot = (status.copilot?.path ? status.copilot.models : []).map((m) => ({ ...m, provider: "copilot" as const }));
      const models = [
        ...(status.claude.path ? CLAUDE_MODELS : []),
        ...(status.codex.path ? status.codex.models.map((m) => ({ ...m, provider: "codex" as const })) : []),
        ...agy,
        ...copilot,
      ];
      state = { status, models, available: models.length > 0 };
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}
refreshAssistant();

/** The models on offer now, for code outside a component. */
export const assistantModels = () => state.models;

export function useAssistant(): Assistant {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** A model's display name, also for one no longer offered (an old chat's). */
export function modelName(id: string): string {
  return state.models.find((m) => m.id === id)?.name ?? CLAUDE_MODELS.find((m) => m.id === id)?.name ?? OLD_CLAUDE_NAMES[id] ?? id;
}

/** The model to use: the preferred one if it is still offered, else the first that is. */
export function pickModel(preferred: string, models: ModelOpt[]): string {
  return models.some((m) => m.id === preferred) || models.length === 0 ? preferred : models[0].id;
}
