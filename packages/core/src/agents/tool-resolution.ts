import { eq } from "drizzle-orm";
import { resolveEffectiveTools, type EffectiveTools, type ToolPolicy } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { settings } from "../db/schema.js";

/** Settings keys holding the factory-wide (Global-level) tool policy. */
const GLOBAL_ALLOWED_KEY = "tools.global.allowed";
const GLOBAL_DISALLOWED_KEY = "tools.global.disallowed";

function readJsonStringArray(key: string): string[] {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function readGlobalToolPolicy(): ToolPolicy {
  return {
    allowed: readJsonStringArray(GLOBAL_ALLOWED_KEY),
    disallowed: readJsonStringArray(GLOBAL_DISALLOWED_KEY),
  };
}

interface WithToolPolicy {
  allowedTools: string[];
  disallowedTools: string[];
}

/**
 * Resolve the immutable effective toolset for a run from Global (settings) → Agent →
 * Project → Task (P2, EH5). Called once at spawn; the result is snapshotted on the run
 * and the provider reads only the snapshot, so mutating any row while the run is queued
 * cannot change what it may touch.
 */
export function resolveRunEffectiveTools(input: {
  agent: WithToolPolicy;
  project?: WithToolPolicy | null;
  task?: WithToolPolicy | null;
}): EffectiveTools {
  const policy = (p?: WithToolPolicy | null): ToolPolicy | null =>
    p ? { allowed: p.allowedTools, disallowed: p.disallowedTools } : null;
  return resolveEffectiveTools({
    global: readGlobalToolPolicy(),
    agent: policy(input.agent),
    project: policy(input.project),
    task: policy(input.task),
  });
}
