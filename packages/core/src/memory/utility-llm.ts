import { eq } from "drizzle-orm";
import type { Agent } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { completeOnce, type CompleteOnceResult } from "../orchestrator/one-shot.js";

/**
 * P5 utility LLM calls: single cheap text→JSON turns for synthesis-over-search
 * (synchronous, inside a memory_search call). This is the completeOnce path —
 * legitimate here because it is a SYNCHRONOUS sub-step of a request the run
 * queue already admitted. The nightly extractor/dream consolidator must NOT
 * use this: EH3 mandates those go through runManager lanes (see dream-cycle).
 */

/** Settings key for the cheap utility model; claude CLI model alias. */
export const UTILITY_MODEL_KEY = "memory.utilityModel";
export const DEFAULT_UTILITY_MODEL = "haiku";

export function utilityModel(): string {
  const row = getDb().select().from(settings).where(eq(settings.key, UTILITY_MODEL_KEY)).get();
  return row?.value?.trim() || DEFAULT_UTILITY_MODEL;
}

const ISO = "2026-01-01T00:00:00.000Z";

/**
 * Synthetic, non-persisted agent for utility turns (draft-service idiom): no
 * tools, no memory scopes — runId "" in completeOnce means no MCP wiring, so
 * the turn is pure text-in/text-out.
 */
export function utilityAgent(systemPrompt: string): Agent {
  return {
    id: "memory-utility",
    name: "Memory Utility",
    slug: "memory-utility",
    role: "",
    systemPrompt,
    provider: "claude-code",
    model: utilityModel(),
    cwd: null,
    addDirs: [],
    allowedTools: [],
    disallowedTools: ["Bash", "Write", "Edit", "Read", "Glob", "Grep", "WebFetch", "WebSearch"],
    permissionMode: "default",
    mcpServers: {},
    maxTurns: 1,
    memoryReadScopes: [],
    memoryWriteScopes: [],
    extraArgs: [],
    enabled: true,
    signalExtraction: false,
    isSystem: false,
    origin: "user",
    status: "active",
    specterReport: null,
    importId: null,
    sandboxProjectId: null,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

export interface UtilityTurnOptions {
  timeoutMs?: number;
}

/** One cheap headless turn. Returns null text on error/timeout (caller degrades). */
export async function utilityTurn(
  systemPrompt: string,
  prompt: string,
  opts: UtilityTurnOptions = {},
): Promise<CompleteOnceResult> {
  return completeOnce(utilityAgent(systemPrompt), prompt, {
    timeoutMs: opts.timeoutMs ?? 60_000,
  });
}
