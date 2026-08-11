import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import type { CommandFailureReason, RunStartPayload } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents, cloudLinks, projects } from "../db/schema.js";
import { logger } from "../logger.js";

/**
 * M4 — turning a cloud command into local rows the runner can use.
 *
 * The board is Postgres; the runner reads SQLite. Both have agents and
 * projects, with independent ids and NO definition sync between them (D-9).
 * Nothing before M4 needed to cross, so nothing bridged them.
 *
 * The rules, in one place:
 *
 *   - Resolve by SLUG the first time, then by `cloud_links` forever after.
 *   - A miss is a legible refusal, never an invented row. The daemon does not
 *     create an agent from a cloud definition, because that is the start of a
 *     bidirectional sync with its own conflict model — who wins on edit, what
 *     `cwd` means on a machine that does not have it — and not a line of code
 *     inside a dispatcher.
 *   - Preflight is filesystem truth, not row truth. A binding says a path
 *     existed once.
 */

export type ResolutionFailure = {
  reason: CommandFailureReason;
  error: string;
  /** The path actually checked, so the UI's relink action can pre-fill it. */
  detail?: string;
};

export type Resolved = {
  localAgentId: string;
  localProjectId: string | null;
  rootDir: string | null;
};

export type ResolveResult = { ok: true; value: Resolved } | { ok: false; failure: ResolutionFailure };

type LinkKind = "agent" | "project";

function readLink(kind: LinkKind, cloudId: string): string | null {
  const row = getDb()
    .select()
    .from(cloudLinks)
    .where(and(eq(cloudLinks.kind, kind), eq(cloudLinks.cloudId, cloudId)))
    .get();
  return row?.localId ?? null;
}

function writeLink(kind: LinkKind, cloudId: string, localId: string): void {
  const db = getDb();
  // A local row can be re-linked to a different cloud row (the workspace's
  // agent was recreated), so the old link for that local id has to go first or
  // the UNIQUE on (kind, local_id) rejects the insert.
  db.delete(cloudLinks).where(and(eq(cloudLinks.kind, kind), eq(cloudLinks.localId, localId))).run();
  db.insert(cloudLinks)
    .values({ kind, cloudId, localId, linkedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: [cloudLinks.kind, cloudLinks.cloudId],
      set: { localId, linkedAt: new Date().toISOString() },
    })
    .run();
}

function dropLink(kind: LinkKind, cloudId: string): void {
  getDb().delete(cloudLinks).where(and(eq(cloudLinks.kind, kind), eq(cloudLinks.cloudId, cloudId))).run();
}

/** Forget every link. Called when a machine is paired to a different workspace. */
export function clearCloudLinks(): void {
  getDb().delete(cloudLinks).run();
}

/**
 * Cloud agent → local agent.
 *
 * A stale link — one whose local row has been deleted — is treated as a miss
 * rather than an error: the link is dropped and slug resolution runs again.
 * Users delete agents, and a dispatcher that hard-fails on that would need
 * manual repair for something the next lookup can fix by itself.
 */
export function resolveAgent(payload: RunStartPayload): ResolveResult {
  const db = getDb();

  const linkedId = readLink("agent", payload.agentId);
  let agent = linkedId
    ? db.select().from(agents).where(eq(agents.id, linkedId)).get()
    : undefined;

  if (linkedId && !agent) {
    logger.info({ cloudAgentId: payload.agentId }, "cloud agent link pointed at a deleted local agent — re-resolving by slug");
    dropLink("agent", payload.agentId);
  }

  if (!agent) {
    agent = db.select().from(agents).where(eq(agents.slug, payload.agentSlug)).get();
    if (agent) writeLink("agent", payload.agentId, agent.id);
  }

  if (!agent) {
    return {
      ok: false,
      failure: {
        reason: "agent_not_available",
        error: `This machine has no agent with the slug "${payload.agentSlug}". Create it here, or run this on a machine that has it.`,
      },
    };
  }

  // Checked here rather than left to createRun, which throws an HttpError for
  // the same cases. The message is better from here, and P9's quarantine states
  // deserve to be named — "agent is quarantined" is actionable in a way that
  // "agent is disabled" is not.
  if (!agent.enabled) {
    return {
      ok: false,
      failure: { reason: "agent_disabled", error: `The agent "${agent.name}" is disabled on this machine.` },
    };
  }
  if (agent.status !== "active") {
    return {
      ok: false,
      failure: {
        reason: "agent_disabled",
        error: `The agent "${agent.name}" is ${agent.status} on this machine, not active.`,
      },
    };
  }

  const projectResult = resolveProject(payload);
  if (!projectResult.ok) return projectResult;

  return {
    ok: true,
    value: {
      localAgentId: agent.id,
      localProjectId: projectResult.value.localProjectId,
      rootDir: projectResult.value.rootDir,
    },
  };
}

/**
 * Cloud project → local project, then to a directory that actually exists.
 *
 * The second half is the point. `runtime_projects` is a claim about a disk made
 * whenever the daemon last reported, and directories get renamed, deleted, and
 * left on unmounted drives. Letting a stale row through means spawning an agent
 * with a cwd that is not there — which `run-manager.start()` does catch, but
 * only after creating a run row and failing it, and with a worse message.
 */
export function resolveProject(
  payload: Pick<RunStartPayload, "projectId" | "projectSlug">,
): { ok: true; value: { localProjectId: string | null; rootDir: string | null } } | { ok: false; failure: ResolutionFailure } {
  if (!payload.projectId || !payload.projectSlug) {
    return { ok: true, value: { localProjectId: null, rootDir: null } };
  }

  const db = getDb();
  const linkedId = readLink("project", payload.projectId);
  let project = linkedId
    ? db.select().from(projects).where(eq(projects.id, linkedId)).get()
    : undefined;

  if (linkedId && !project) {
    dropLink("project", payload.projectId);
  }

  if (!project) {
    project = db.select().from(projects).where(eq(projects.slug, payload.projectSlug)).get();
    if (project) writeLink("project", payload.projectId, project.id);
  }

  if (!project) {
    return {
      ok: false,
      failure: {
        reason: "project_not_available",
        error: `This machine has no project with the slug "${payload.projectSlug}".`,
      },
    };
  }

  if (!project.rootDir) {
    return {
      ok: false,
      failure: {
        reason: "project_not_available",
        error: `The project "${project.name}" exists on this machine but has no directory bound to it.`,
      },
    };
  }

  if (!fs.existsSync(project.rootDir)) {
    return {
      ok: false,
      failure: {
        reason: "project_not_available",
        error: `The directory for "${project.name}" is no longer there.`,
        // The path travels so the browser can offer relink with it already
        // filled in — the user should not have to remember where it was.
        detail: project.rootDir,
      },
    };
  }

  return { ok: true, value: { localProjectId: project.id, rootDir: project.rootDir } };
}
