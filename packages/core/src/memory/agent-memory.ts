import { eq } from "drizzle-orm";
import {
  slugify,
  type Agent,
  type MemoryNote,
  type MemoryScopeKind,
  type MemorySearchHit,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents, projects, runs } from "../db/schema.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { indexer } from "./indexer.js";
import { searchMemory } from "./search.js";
import { expandReadScopes, expandWriteScopes, noteMatchesFilters } from "./scopes.js";
import { writeNote } from "./vault.js";

/**
 * Task-aware run context (DX-C2, P1 foundation). Delegation semantics are invisible
 * to an agent unless its context knows the task — so MCP tools can auto-scope taskId,
 * and P3 will populate the parent/team/delegation fields (null in P1).
 */
export interface RunContext {
  runId: string;
  agent: Agent;
  projectSlug: string | null;
  taskId: string | null;
  parentTaskId: string | null;
  teamId: string | null;
  delegatedByAgentName: string | null;
  delegationDepth: number;
}

/** Resolve the calling agent from a per-run id (header on gateway/MCP calls). */
export function resolveRunContext(runId: unknown): RunContext {
  if (typeof runId !== "string" || runId.length === 0) {
    throw new HttpError(401, "missing run id (x-sparstrow-run header)");
  }
  const db = getDb();
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new HttpError(401, `unknown run: ${runId}`);
  if (run.status !== "running") {
    throw new HttpError(403, `run is not active (status: ${run.status})`);
  }
  const agentRow = db.select().from(agents).where(eq(agents.id, run.agentId)).get();
  if (!agentRow) throw new HttpError(403, "agent for run no longer exists");
  const projectSlug = run.projectId
    ? (db.select().from(projects).where(eq(projects.id, run.projectId)).get()?.slug ?? null)
    : null;
  // A task-triggered run carries its taskId in triggerRef; P3 adds parent/team.
  const taskId = run.trigger === "task" ? (run.triggerRef ?? null) : null;
  return {
    runId,
    agent: agentRow as unknown as Agent,
    projectSlug,
    taskId,
    parentTaskId: null,
    teamId: null,
    delegatedByAgentName: null,
    delegationDepth: 0,
  };
}

export async function agentMemorySearch(
  ctx: RunContext,
  query: string,
  k: number,
): Promise<MemorySearchHit[]> {
  const filters = expandReadScopes(ctx.agent, ctx.projectSlug);
  if (filters.length === 0) return [];
  return searchMemory(query, filters, k);
}

export interface AgentSaveInput {
  title: string;
  content: string;
  scope: MemoryScopeKind;
  projectSlug?: string | null;
  agentSlug?: string | null;
  tags: string[];
}

export function agentMemorySave(ctx: RunContext, input: AgentSaveInput): MemoryNote {
  const scope = input.scope;
  let projectSlug = input.projectSlug ? slugify(input.projectSlug) : null;
  let agentSlug = input.agentSlug ? slugify(input.agentSlug) : null;
  if (scope === "project" && !projectSlug) projectSlug = ctx.projectSlug;
  if (scope === "agent" && !agentSlug) agentSlug = ctx.agent.slug;
  // P3 (locked D5): a self-write inside a project targets the (template, project)
  // INSTANCE — writes land under agents/<template>/<project>/ and never bleed into
  // other projects. Writes to another agent's scope stay template-level.
  if (scope === "agent") {
    projectSlug = agentSlug === ctx.agent.slug ? ctx.projectSlug : null;
  }

  // One matcher (noteMatchesFilters) decides both search visibility and write
  // permission, so the two can't drift on instance semantics.
  const candidate = {
    scope,
    projectSlug: scope === "global" ? null : projectSlug,
    agentSlug: scope === "agent" ? agentSlug : null,
  };
  const allowed = noteMatchesFilters(candidate, expandWriteScopes(ctx.agent, ctx.projectSlug));
  if (!allowed) {
    throw new HttpError(
      403,
      `agent "${ctx.agent.name}" may not write to scope ${scope}${projectSlug ? `:${projectSlug}` : ""}${agentSlug ? `:${agentSlug}` : ""} (allowed: ${ctx.agent.memoryWriteScopes.join(", ")})`,
    );
  }
  if (scope === "project" && !projectSlug) {
    throw new HttpError(400, "project scope requires a projectSlug (or run with a project)");
  }

  const note = writeNote({
    title: input.title,
    content: input.content,
    scope,
    projectSlug: scope === "global" ? null : projectSlug,
    agentSlug: scope === "agent" ? agentSlug : null,
    tags: input.tags,
    source: `agent:${ctx.agent.slug}`,
  });
  indexer.enqueue([note.id]);
  return note;
}
