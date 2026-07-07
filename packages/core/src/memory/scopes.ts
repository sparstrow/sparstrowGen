import type { Agent, MemoryNote, MemoryScopeKind } from "@sparstrow/shared";

export interface ScopeFilter {
  scope: MemoryScopeKind;
  projectSlug?: string | null; // undefined = any project
  agentSlug?: string | null;
}

/**
 * Expand an agent's memory scope grammar into concrete filters.
 * 'project:*' resolves to the run's current project (if any), otherwise any project.
 * 'agent:self' is instance-aware (P3, locked D5): inside a project it resolves to
 * the (template, project) instance — projectSlug set — and outside a project to the
 * template's own notes (projectSlug null, NOT any-project). 'agent:<x>' stays
 * cross-project (undefined = any): reading another agent's accumulated knowledge
 * is deliberate and coarse; instance isolation is about *self* memory.
 */
export function expandScopes(
  scopes: string[],
  agentSlug: string,
  currentProjectSlug: string | null,
): ScopeFilter[] {
  const filters: ScopeFilter[] = [];
  for (const scope of scopes) {
    if (scope === "global") filters.push({ scope: "global" });
    else if (scope === "project:*") {
      filters.push(
        currentProjectSlug
          ? { scope: "project", projectSlug: currentProjectSlug }
          : { scope: "project", projectSlug: undefined },
      );
    } else if (scope.startsWith("project:")) {
      filters.push({ scope: "project", projectSlug: scope.slice("project:".length) });
    } else if (scope === "agent:self") {
      filters.push({ scope: "agent", agentSlug, projectSlug: currentProjectSlug });
    } else if (scope.startsWith("agent:")) {
      filters.push({ scope: "agent", agentSlug: scope.slice("agent:".length) });
    }
  }
  return filters;
}

export function expandReadScopes(agent: Agent, currentProjectSlug: string | null): ScopeFilter[] {
  return expandScopes(agent.memoryReadScopes, agent.slug, currentProjectSlug);
}

export function expandWriteScopes(agent: Agent, currentProjectSlug: string | null): ScopeFilter[] {
  return expandScopes(agent.memoryWriteScopes, agent.slug, currentProjectSlug);
}

/**
 * EH7 (P4 §6) — the single source of truth for the untrusted-run WRITE clamp. A
 * restricted run may only write memory scoped to its OWN project: this discards
 * every other filter — `global`, ANY `agent` scope (agent:self resolves to the
 * cross-project template/instance whose seed notes were copied from the template
 * lineage — the exact leak EH7 names), and any `project` scope for a different
 * project. Named for its first caller (sandbox); `resolveWriteFilters` now also
 * routes delegated/untrusted runs through it.
 */
export function clampSandboxWriteScopes(
  filters: ScopeFilter[],
  sandboxProjectSlug: string,
): ScopeFilter[] {
  return filters.filter((f) => f.scope === "project" && f.projectSlug === sandboxProjectSlug);
}

/**
 * EH7 (P4 §6 + cross-cutting rule 13) — the effective WRITE filters for a run,
 * the ONE decision both enforcement points share (the runtime MCP gate
 * `agentMemorySave` and the preamble's advertised write-dir list) so guidance and
 * enforcement can never drift.
 *
 * A run is `restricted` when it consumed content the operator did not author —
 * either a **sandbox project** (cloned/unreviewed code) OR a **delegated task**
 * (its prompt embeds a `<delegated-request>` another agent wrote). Restricted
 * runs may only write project-scoped memory to their own project; `global`,
 * `agent:self`, and foreign-project writes are dropped, which closes the stored
 * second-order prompt-injection channel (a "pitfall" note distilled from hostile
 * content and later injected as if it were operator guidance). A restricted run
 * with no project can write nothing. Trusted runs keep their full write scopes.
 */
export function resolveWriteFilters(
  agent: Agent,
  currentProjectSlug: string | null,
  opts: { restricted: boolean },
): ScopeFilter[] {
  const filters = expandWriteScopes(agent, currentProjectSlug);
  if (!opts.restricted) return filters;
  return currentProjectSlug ? clampSandboxWriteScopes(filters, currentProjectSlug) : [];
}

export function noteMatchesFilters(
  note: Pick<MemoryNote, "scope" | "projectSlug" | "agentSlug">,
  filters: ScopeFilter[],
): boolean {
  return filters.some((f) => {
    if (f.scope !== note.scope) return false;
    if (f.scope === "project" && f.projectSlug !== undefined && f.projectSlug !== note.projectSlug)
      return false;
    if (f.scope === "agent") {
      if (f.agentSlug !== undefined && f.agentSlug !== note.agentSlug) return false;
      // P3 instance isolation: an agent-scope filter with a projectSlug set (or
      // explicitly null = template-only) must match the note's instance exactly —
      // otherwise an instance filter would also see template/other-project notes.
      if (f.projectSlug !== undefined && f.projectSlug !== note.projectSlug) return false;
    }
    return true;
  });
}
