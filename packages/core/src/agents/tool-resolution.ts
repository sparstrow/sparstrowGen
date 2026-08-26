import { eq } from "drizzle-orm";
import {
  intersectEffectiveTools,
  resolveEffectiveTools,
  type EffectiveTools,
  type ToolPolicy,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { settings } from "../db/schema.js";

import { isControlPlaneHealthy } from "../cloud/commands.js";
import { logger } from "../logger.js";

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

let cachedCloudPolicy: ToolPolicy | null = null;
let loggedLocalFallback = false;

export function cacheWorkspacePolicy(policy: { allowedTools: string[]; disallowedTools: string[] }) {
  cachedCloudPolicy = { allowed: policy.allowedTools, disallowed: policy.disallowedTools };
}

export function _resetWorkspacePolicyCache() {
  cachedCloudPolicy = null;
  loggedLocalFallback = false;
}

export function readGlobalToolPolicy(): ToolPolicy {
  const localRows: ToolPolicy = {
    allowed: readJsonStringArray(GLOBAL_ALLOWED_KEY),
    disallowed: readJsonStringArray(GLOBAL_DISALLOWED_KEY),
  };

  if (cachedCloudPolicy !== null) {
    if (isControlPlaneHealthy()) {
      return cachedCloudPolicy;
    }
    const localEffective = resolveEffectiveTools({ global: localRows });
    const cachedEffective = resolveEffectiveTools({ global: cachedCloudPolicy });
    const intersected = intersectEffectiveTools(cachedEffective, localEffective);
    return {
      allowed: intersected.allowed,
      disallowed: intersected.disallowed,
    };
  }

  if (!loggedLocalFallback) {
    logger.warn("running on local tool policy — control plane has never been reached");
    loggedLocalFallback = true;
  }
  return localRows;
}

interface WithToolPolicy {
  allowedTools: string[];
  disallowedTools: string[];
}

interface WithDelegationBound extends WithToolPolicy {
  /** P3 S1-a: the delegating run's snapshot, persisted on the task at spawn_subtask time. */
  parentEffectiveTools?: EffectiveTools | null;
}

/**
 * Resolve the immutable effective toolset for a run from Global (settings) → Agent →
 * Project → Task (P2, EH5). Called once at spawn; the result is snapshotted on the run
 * and the provider reads only the snapshot, so mutating any row while the run is queued
 * cannot change what it may touch.
 *
 * P3 (S1-a): a delegated task additionally carries its parent run's effective
 * snapshot; the resolution is intersected with that bound (LEAST privilege), so a
 * child can never run with capability its delegator lacked — and since each run's
 * snapshot already folds in ITS bound, clamps compose transitively down the tree.
 */
export function resolveRunEffectiveTools(input: {
  agent: WithToolPolicy;
  project?: WithToolPolicy | null;
  task?: WithDelegationBound | null;
}): EffectiveTools {
  const policy = (p?: WithToolPolicy | null): ToolPolicy | null =>
    p ? { allowed: p.allowedTools, disallowed: p.disallowedTools } : null;
  const resolved = resolveEffectiveTools({
    global: readGlobalToolPolicy(),
    agent: policy(input.agent),
    project: policy(input.project),
    task: policy(input.task),
  });
  const bound = input.task?.parentEffectiveTools ?? null;
  return bound ? intersectEffectiveTools(resolved, bound) : resolved;
}
