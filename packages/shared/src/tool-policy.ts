/**
 * P2-lite tool permission resolver (the security spine P3's delegation clamp
 * depends on). One pure function, one written truth table. Locked semantics:
 *
 * - Order: Global â†’ Agent â†’ Project â†’ Task (P2-Q1). The order is documented here
 *   and is what the deferred provenance matrix will render; for the effective SET
 *   it is order-independent because deny-wins is absolute, which is exactly what
 *   makes "a project contains the agents in it" true (a project disallow removes
 *   an agent grant).
 * - Deny-wins (P2): a tool disallowed at ANY level is never in the granted set and
 *   is always emitted as an explicit disallow, so it stays denied even against the
 *   provider's default toolset.
 * - Empty allow = inherit/default (P2-Q2): an empty allow-list at a level does NOT
 *   mean "deny all" â€” restriction is always an explicit disallow. If no level
 *   grants anything, `allowed` is empty and the provider falls back to its default
 *   tools (still filtered by `disallowed`).
 */

export interface ToolPolicy {
  allowed: string[];
  disallowed: string[];
}

export interface ToolPolicyLevels {
  global?: ToolPolicy | null;
  agent?: ToolPolicy | null;
  project?: ToolPolicy | null;
  task?: ToolPolicy | null;
}

export interface EffectiveTools {
  /** Explicit grants across levels, with denied tools removed. Empty â‡’ provider default. */
  allowed: string[];
  /** Every tool denied at any level â€” always enforced, even over the default set. */
  disallowed: string[];
}

export function resolveEffectiveTools(levels: ToolPolicyLevels): EffectiveTools {
  const order: (ToolPolicy | null | undefined)[] = [
    levels.global,
    levels.agent,
    levels.project,
    levels.task,
  ];
  const allowed: string[] = [];
  const disallowed: string[] = [];
  const seenAllow = new Set<string>();
  const seenDeny = new Set<string>();
  for (const level of order) {
    if (!level) continue;
    for (const t of level.allowed) {
      if (!seenAllow.has(t)) {
        seenAllow.add(t);
        allowed.push(t);
      }
    }
    for (const t of level.disallowed) {
      if (!seenDeny.has(t)) {
        seenDeny.add(t);
        disallowed.push(t);
      }
    }
  }
  // Deny-wins: a disallowed tool is never presented as a grant.
  const effectiveAllowed = allowed.filter((t) => !seenDeny.has(t));
  return { allowed: effectiveAllowed, disallowed };
}

/**
 * LEAST of two effective policies (P3 S1-a): the constructor whose output
 * isToolPolicySubset (below) verifies. Used at spawn_subtask time â€” the child's
 * bound is the parent run's immutable effective snapshot, so a delegated task can
 * never mint capability its delegator lacked (and at child-run start the normal
 * Globalâ†’Agentâ†’Projectâ†’Task resolution is intersected with this bound).
 *
 * Semantics over "usable set" = (allow-list, or the provider default when the
 * allow-list is empty) minus denies:
 * - disallowed = union (deny at either level stays denied)
 * - allowed: both empty â†’ empty (provider default, filtered by the union of denies);
 *   one side empty â†’ the other side's allow-list (the non-default side is the
 *   tighter bound); both non-empty â†’ set intersection.
 */
export function intersectEffectiveTools(a: EffectiveTools, b: EffectiveTools): EffectiveTools {
  const disallowed: string[] = [];
  const seenDeny = new Set<string>();
  for (const t of [...a.disallowed, ...b.disallowed]) {
    if (!seenDeny.has(t)) {
      seenDeny.add(t);
      disallowed.push(t);
    }
  }
  let allowed: string[];
  if (a.allowed.length === 0) allowed = [...b.allowed];
  else if (b.allowed.length === 0) allowed = [...a.allowed];
  else {
    const bAllows = new Set(b.allowed);
    allowed = a.allowed.filter((t) => bAllows.has(t));
  }
  return { allowed: allowed.filter((t) => !seenDeny.has(t)), disallowed };
}

/**
 * Is `child`'s effective policy a subset of `parent`'s? (P3 delegation clamp,
 * S1-a: a child task must never gain a tool the parent couldn't use.) A child is
 * within bounds when every tool it could actually run is one the parent could too,
 * and it denies at least everything the parent denies. Exported here so P2 and P3
 * share one definition.
 */
export function isToolPolicySubset(child: EffectiveTools, parent: EffectiveTools): boolean {
  // If the parent has an explicit allow-list, the child may not grant anything
  // outside it. If the parent's allow-list is empty (provider default), the child
  // is bounded only by the union of denials.
  const parentDenies = new Set(parent.disallowed);
  if (parent.allowed.length > 0) {
    const parentAllows = new Set(parent.allowed);
    for (const t of child.allowed) {
      if (!parentAllows.has(t)) return false;
    }
  }
  // The child must deny everything the parent denies (can't re-grant a parent deny).
  for (const d of parentDenies) {
    if (!child.disallowed.includes(d)) return false;
    if (child.allowed.includes(d)) return false;
  }
  return true;
}
export type PolicyLevel = "global" | "agent" | "project" | "task" | "delegation-bound";

export interface ToolProvenance {
  tool: string;
  /** Every level that granted it, in resolution order. Empty ? provider default. */
  grantedBy: PolicyLevel[];
  /** Every level that denied it. Non-empty ? denied, whatever grantedBy says. */
  deniedBy: PolicyLevel[];
}

export interface EffectiveToolsWithProvenance {
  tools: ToolProvenance[];
  /** True when no level granted anything — the provider's default set applies. */
  usesProviderDefault: boolean;
}

export function resolveEffectiveToolsWithProvenance(levels: ToolPolicyLevels): EffectiveToolsWithProvenance {
  const levelNames: PolicyLevel[] = ["global", "agent", "project", "task"];
  const levelValues = [levels.global, levels.agent, levels.project, levels.task];
  
  const map = new Map<string, ToolProvenance>();


  for (let i = 0; i < levelNames.length; i++) {
    const levelName = levelNames[i] as PolicyLevel;
    const level = levelValues[i];
    if (!level) continue;

    for (const t of level.allowed) {
      if (!map.has(t)) map.set(t, { tool: t, grantedBy: [], deniedBy: [] });
      map.get(t)!.grantedBy.push(levelName);
    }
    for (const t of level.disallowed) {
      if (!map.has(t)) map.set(t, { tool: t, grantedBy: [], deniedBy: [] });
      map.get(t)!.deniedBy.push(levelName);
    }
  }

  let hasEffectiveGrant = false;
  for (const prov of map.values()) {
    if (prov.grantedBy.length > 0 && prov.deniedBy.length === 0) {
      hasEffectiveGrant = true;
      break;
    }
  }

  return {
    tools: Array.from(map.values()),
    usesProviderDefault: !hasEffectiveGrant,
  };
}

export function intersectEffectiveToolsWithProvenance(
  a: EffectiveToolsWithProvenance,
  bound: EffectiveToolsWithProvenance
): EffectiveToolsWithProvenance {
  const map = new Map<string, ToolProvenance>();
  
  for (const t of a.tools) {
    map.set(t.tool, { ...t, grantedBy: [...t.grantedBy], deniedBy: [...t.deniedBy] });
  }

  for (const bt of bound.tools) {
    if (bt.deniedBy.length > 0) {
      if (!map.has(bt.tool)) {
        map.set(bt.tool, { tool: bt.tool, grantedBy: [], deniedBy: [] });
      }
      map.get(bt.tool)!.deniedBy.push("delegation-bound");
    }
  }
  
  let usesProviderDefault = false;
  if (a.usesProviderDefault) {
    usesProviderDefault = bound.usesProviderDefault;
    for (const bt of bound.tools) {
      if (bt.grantedBy.length > 0) {
         if (!map.has(bt.tool)) {
           map.set(bt.tool, { tool: bt.tool, grantedBy: [], deniedBy: [] });
         }
         map.get(bt.tool)!.grantedBy.push("delegation-bound");
      }
    }
  } else if (bound.usesProviderDefault) {
    usesProviderDefault = false;
  } else {
    usesProviderDefault = false;
    const bAllows = new Set(bound.tools.filter(t => t.grantedBy.length > 0).map(t => t.tool));
    for (const [tool, prov] of map.entries()) {
      if (prov.grantedBy.length > 0 && !bAllows.has(tool)) {
         prov.grantedBy = [];
      }
    }
  }

  const finalTools: ToolProvenance[] = [];
  for (const prov of map.values()) {
    if (prov.grantedBy.length > 0 || prov.deniedBy.length > 0) {
      finalTools.push(prov);
    }
  }

  return {
    tools: finalTools,
    usesProviderDefault,
  };
}

export function toLegacyShape(withProvenance: EffectiveToolsWithProvenance): EffectiveTools {
  const allowed: string[] = [];
  const disallowed: string[] = [];

  const seenAllow = new Set<string>();
  const seenDeny = new Set<string>();

  for (const prov of withProvenance.tools) {
    if (prov.deniedBy.length > 0 && !seenDeny.has(prov.tool)) {
      seenDeny.add(prov.tool);
      disallowed.push(prov.tool);
    }
  }
  
  if (!withProvenance.usesProviderDefault) {
    for (const prov of withProvenance.tools) {
      if (prov.grantedBy.length > 0 && prov.deniedBy.length === 0 && !seenAllow.has(prov.tool)) {
        seenAllow.add(prov.tool);
        allowed.push(prov.tool);
      }
    }
  }

  return { allowed, disallowed };
}
