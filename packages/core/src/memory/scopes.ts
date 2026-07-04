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
