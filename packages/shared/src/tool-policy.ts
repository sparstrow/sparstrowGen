/**
 * P2-lite tool permission resolver (the security spine P3's delegation clamp
 * depends on). One pure function, one written truth table. Locked semantics:
 *
 * - Order: Global → Agent → Project → Task (P2-Q1). The order is documented here
 *   and is what the deferred provenance matrix will render; for the effective SET
 *   it is order-independent because deny-wins is absolute, which is exactly what
 *   makes "a project contains the agents in it" true (a project disallow removes
 *   an agent grant).
 * - Deny-wins (P2): a tool disallowed at ANY level is never in the granted set and
 *   is always emitted as an explicit disallow, so it stays denied even against the
 *   provider's default toolset.
 * - Empty allow = inherit/default (P2-Q2): an empty allow-list at a level does NOT
 *   mean "deny all" — restriction is always an explicit disallow. If no level
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
  /** Explicit grants across levels, with denied tools removed. Empty ⇒ provider default. */
  allowed: string[];
  /** Every tool denied at any level — always enforced, even over the default set. */
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
 * isToolPolicySubset (below) verifies. Used at spawn_subtask time — the child's
 * bound is the parent run's immutable effective snapshot, so a delegated task can
 * never mint capability its delegator lacked (and at child-run start the normal
 * Global→Agent→Project→Task resolution is intersected with this bound).
 *
 * Semantics over "usable set" = (allow-list, or the provider default when the
 * allow-list is empty) minus denies:
 * - disallowed = union (deny at either level stays denied)
 * - allowed: both empty → empty (provider default, filtered by the union of denies);
 *   one side empty → the other side's allow-list (the non-default side is the
 *   tighter bound); both non-empty → set intersection.
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
