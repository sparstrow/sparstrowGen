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
import { expandReadScopes, expandWriteScopes } from "./scopes.js";
import { writeNote } from "./vault.js";

export interface RunContext {
  runId: string;
  agent: Agent;
  projectSlug: string | null;
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
  return { runId, agent: agentRow as unknown as Agent, projectSlug };
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

  const allowed = expandWriteScopes(ctx.agent, ctx.projectSlug).some((f) => {
    if (f.scope !== scope) return false;
    if (scope === "project" && f.projectSlug !== undefined && f.projectSlug !== projectSlug)
      return false;
    if (scope === "agent" && f.agentSlug !== undefined && f.agentSlug !== agentSlug) return false;
    return true;
  });
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
    projectSlug: scope === "project" ? projectSlug : null,
    agentSlug: scope === "agent" ? agentSlug : null,
    tags: input.tags,
    source: `agent:${ctx.agent.slug}`,
  });
  indexer.enqueue([note.id]);
  return note;
}
