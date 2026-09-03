import { eq } from "drizzle-orm";
import {
  slugify,
  type Agent,
  type EffectiveTools,
  type LessonRef,
  type MemoryNote,
  type MemoryNoteType,
  type MemoryScopeKind,
  type MemorySearchHit,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents, projects, runs, tasks, teams } from "../db/schema.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { indexer } from "./indexer.js";
import { searchMemory } from "./search.js";
import { expandReadScopes, noteMatchesFilters, resolveWriteFilters } from "./scopes.js";
import { writeNote } from "./vault.js";

/**
 * Task-aware run context (DX-C2, P1 foundation). Delegation semantics are invisible
 * to an agent unless its context knows the task — so MCP tools can auto-scope taskId,
 * and P3 will populate the parent/team/delegation fields (null in P1).
 */
export interface RunContext {
  runId: string;
  agent: Agent;
  /** P5: db id of the run's project — keys the per-project graph-engine store. */
  projectId: string | null;
  projectSlug: string | null;
  /** EH7 (P4): the run's project is a sandbox — memory writes are clamped to it. */
  isSandbox: boolean;
  taskId: string | null;
  parentTaskId: string | null;
  teamId: string | null;
  delegatedByAgentName: string | null;
  delegationDepth: number;
  /**
   * P5 (#49 spawn-pinned availability): the run's immutable effective-tools
   * snapshot, verbatim from the run row. Tool surfaces derived from it cannot
   * drift mid-run — a tool advertised at spawn stays registered for the run's
   * lifetime and degrades via isError, never method-not-found.
   */
  effectiveTools: EffectiveTools | null;
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
  // One project read carries both the slug and the EH7 sandbox flag.
  const projectRow = run.projectId
    ? db.select().from(projects).where(eq(projects.id, run.projectId)).get()
    : null;
  const projectSlug = projectRow?.slug ?? null;
  const isSandbox = projectRow?.isSandbox ?? false;
  // A task-triggered run carries its taskId in triggerRef; P3 threads the
  // delegation fields (DX-C2) so tools auto-scope and the preamble can brief.
  const taskId = run.trigger === "task" ? (run.triggerRef ?? null) : null;
  let parentTaskId: string | null = null;
  let teamId: string | null = null;
  let delegatedByAgentName: string | null = null;
  let delegationDepth = 0;
  if (taskId) {
    const taskRow = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (taskRow) {
      parentTaskId = taskRow.parentTaskId ?? null;
      if (parentTaskId && taskRow.createdByAgentId) {
        delegatedByAgentName =
          db.select({ name: agents.name }).from(agents).where(eq(agents.id, taskRow.createdByAgentId)).get()
            ?.name ?? null;
      }
      // Depth = parent-chain length, cycle-guarded (cap enforced at spawn anyway).
      const seen = new Set<string>([taskId]);
      let cursor = parentTaskId;
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        delegationDepth++;
        cursor =
          db.select({ parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, cursor)).get()
            ?.parentTaskId ?? null;
      }
      // Ephemeral swarm context: the team linked to this task or its parent.
      const linked = db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.linkedTaskId, parentTaskId ?? taskId))
        .get();
      teamId = linked?.id ?? null;
    }
  }
  return {
    runId,
    agent: agentRow as unknown as Agent,
    projectId: run.projectId ?? null,
    projectSlug,
    isSandbox,
    taskId,
    parentTaskId,
    teamId,
    delegatedByAgentName,
    delegationDepth,
    effectiveTools: (run.effectiveTools as EffectiveTools | null) ?? null,
  };
}

export async function agentMemorySearch(
  ctx: RunContext,
  query: string,
  k: number,
  opts: { type?: MemoryNoteType } = {},
): Promise<MemorySearchHit[]> {
  const filters = expandReadScopes(ctx.agent, ctx.projectSlug);
  if (filters.length === 0) return [];
  // EH6/archive exclusion is searchMemory's default — agents can never opt in.
  return searchMemory(query, filters, k, { callerProjectSlug: ctx.projectSlug, type: opts.type });
}

export interface AgentSaveInput {
  title: string;
  content: string;
  scope: MemoryScopeKind;
  projectSlug?: string | null;
  agentSlug?: string | null;
  tags: string[];
  /** P5 typed memory (default 'note'). */
  type?: MemoryNoteType;
  /** P5 LESSONS: portable (filePath, symbolName) refs for type='lesson'. */
  refs?: LessonRef[];
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
  // EH7: an untrusted run (a sandbox project OR a delegated/agent-authored task)
  // has its write scopes clamped to its own project — global/agent:self/foreign-
  // project writes are rejected here, the SAME clamp the preamble advertised, so
  // the 403 can't surprise the agent. A trusted run keeps its full write scopes.
  const restricted = ctx.isSandbox || ctx.parentTaskId != null;
  const writeFilters = resolveWriteFilters(ctx.agent, ctx.projectSlug, { restricted });
  const attempted = `${scope}${projectSlug ? `:${projectSlug}` : ""}${agentSlug ? `:${agentSlug}` : ""}`;
  const allowed = noteMatchesFilters(candidate, writeFilters);
  if (!allowed) {
    if (restricted) {
      const kind = ctx.isSandbox
        ? `sandbox project "${ctx.projectSlug}"`
        : "untrusted run (delegated / agent-authored work)";
      const target = ctx.projectSlug
        ? `this run's project "${ctx.projectSlug}"`
        : "a project (this run has none)";
      throw new HttpError(
        403,
        `${kind}: runs may only write project-scoped memory to ${target} (attempted scope ${attempted}). Global, agent:self, and other-project writes are blocked to prevent second-order prompt injection.`,
      );
    }
    throw new HttpError(
      403,
      `agent "${ctx.agent.name}" may not write to scope ${attempted} (allowed: ${ctx.agent.memoryWriteScopes.join(", ")})`,
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
    type: input.type ?? "note",
    refs: input.refs ?? [],
    quarantined: false,
  });
  indexer.enqueue([note.id]);
  return note;
}
