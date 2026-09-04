import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { McpServerConfig } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents } from "../db/schema.js";
import { logger } from "../logger.js";
import { cloudFetch, getRuntimes, isPaired } from "./client.js";
import { writeLink } from "./resolve.js";

/**
 * OQ-12 option A — mirror the workspace's agents into this machine's store.
 *
 * ## Why this exists
 *
 * An agent created in the app was only a cloud row. The dispatcher links agents
 * **by slug** into local SQLite, so a turn for a newly created agent failed with
 * "This machine has no agent with the slug ..." — an accurate message about a
 * step nothing in the product performed. The dispatch spine either side of it
 * was already proved end to end; this is the missing link in the middle.
 *
 * ## What it deliberately does not do
 *
 * **It never deletes a local agent.** A machine may hold agents that exist
 * nowhere else — created before it was ever connected, or belonging to a
 * workspace it has since left — and a sync that reconciles by deletion turns a
 * transient empty response into permanent data loss. Rows are added and updated
 * here; removal stays a local, deliberate act.
 *
 * **It is not a two-way sync.** Local edits are not pushed back and a later
 * pull overwrites them. That is a stated limitation rather than an oversight:
 * making it bidirectional needs a conflict rule, and inventing one before
 * anybody has hit a conflict is how the last five months went. `D-39` (option
 * C, cloud agents become the only agents) is where this stops mattering.
 */

/** One agent as `GET /api/daemon/agents` returns it. */
interface CloudAgent {
  id: string;
  name: string;
  slug: string;
  role: string;
  system_prompt: string;
  provider: string;
  model: string;
  cwd: string | null;
  add_dirs: string[];
  allowed_tools: string[];
  disallowed_tools: string[];
  permission_mode: string;
  mcp_servers: Record<string, McpServerConfig>;
  max_turns: number | null;
  memory_read_scopes: string[];
  memory_write_scopes: string[];
  extra_args: string[];
  enabled: boolean;
  signal_extraction: boolean;
  origin: string;
  status: string;
}

export interface AgentSyncResult {
  added: number;
  updated: number;
  skipped: number;
}

/** Defensive: this arrives over the network, and one bad row must not abort the batch. */
function isCloudAgent(value: unknown): value is CloudAgent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.slug === "string" &&
    v.slug.length > 0 &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    typeof v.provider === "string" &&
    typeof v.model === "string"
  );
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * The columns a pull owns.
 *
 * `name` is handled by the caller instead, because it carries a UNIQUE
 * constraint that a sibling row may already hold.
 */
function fieldsFrom(remote: CloudAgent) {
  return {
    slug: remote.slug,
    role: str(remote.role),
    systemPrompt: str(remote.system_prompt),
    provider: remote.provider,
    model: remote.model,
    cwd: typeof remote.cwd === "string" ? remote.cwd : null,
    addDirs: strArray(remote.add_dirs),
    allowedTools: strArray(remote.allowed_tools),
    disallowedTools: strArray(remote.disallowed_tools),
    permissionMode: str(remote.permission_mode, "default"),
    mcpServers:
      remote.mcp_servers && typeof remote.mcp_servers === "object"
        ? remote.mcp_servers
        : ({} as Record<string, McpServerConfig>),
    maxTurns: typeof remote.max_turns === "number" ? remote.max_turns : null,
    memoryReadScopes: strArray(remote.memory_read_scopes),
    memoryWriteScopes: strArray(remote.memory_write_scopes),
    extraArgs: strArray(remote.extra_args),
    enabled: remote.enabled !== false,
    signalExtraction: remote.signal_extraction !== false,
    origin: str(remote.origin, "user"),
    status: str(remote.status, "active"),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Apply one workspace's agents to the local store.
 *
 * Matching is by **slug**, the key the dispatcher already resolves on, so an
 * agent a person created locally with the same slug is adopted rather than
 * duplicated.
 */
export function applyAgents(remotes: CloudAgent[]): AgentSyncResult {
  const db = getDb();
  const result: AgentSyncResult = { added: 0, updated: 0, skipped: 0 };

  for (const remote of remotes) {
    const fields = fieldsFrom(remote);
    const existing = db.select().from(agents).where(eq(agents.slug, remote.slug)).get();

    /**
     * `name` is UNIQUE locally, and a different agent may already hold this one
     * — two workspaces with a "Reviewer", or a local agent the person named
     * first. Writing it anyway fails the whole row, so the local name is kept
     * and everything else still syncs: an agent running under a slightly wrong
     * label is far better than one that does not exist.
     */
    const nameHolder = db.select().from(agents).where(eq(agents.name, remote.name)).get();
    const nameIsFree = !nameHolder || nameHolder.slug === remote.slug;
    if (!nameIsFree) {
      logger.warn(
        { slug: remote.slug, name: remote.name, heldBy: nameHolder?.slug },
        "another local agent already uses this name — syncing everything except the name",
      );
    }

    try {
      if (existing) {
        db.update(agents)
          .set(nameIsFree ? { ...fields, name: remote.name } : fields)
          .where(eq(agents.id, existing.id))
          .run();
        writeLink("agent", remote.id, existing.id);
        result.updated += 1;
      } else {
        const id = `agt_${nanoid(10)}`;
        db.insert(agents)
          .values({
            id,
            // A row cannot exist without a name, so when the preferred one is
            // taken it is qualified by the slug rather than dropped.
            name: nameIsFree ? remote.name : `${remote.name} (${remote.slug})`,
            ...fields,
            createdAt: new Date().toISOString(),
          })
          .run();
        writeLink("agent", remote.id, id);
        result.added += 1;
      }
    } catch (err) {
      // One conflicting row must not stop the rest. A skipped agent fails later
      // with the dispatcher's own clear message, which is the same outcome as
      // before this existed.
      result.skipped += 1;
      logger.warn({ slug: remote.slug, err }, "could not sync this agent");
    }
  }

  return result;
}

/**
 * Pull agents for every workspace this machine serves.
 *
 * Best effort by design: a failed pull leaves the previous local copy in place,
 * which is stale but working. Throwing would turn "could not refresh the agent
 * list" into "this machine stopped working", which is worse and less true — the
 * same reasoning the heartbeat applies to its own reconciliation.
 */
export async function syncAgents(): Promise<AgentSyncResult> {
  const total: AgentSyncResult = { added: 0, updated: 0, skipped: 0 };
  if (!isPaired()) return total;

  for (const runtime of getRuntimes()) {
    try {
      const body = await cloudFetch<{ agents?: unknown }>("/agents", {
        method: "GET",
        runtimeId: runtime.runtimeId,
      });
      const remotes = Array.isArray(body.agents) ? body.agents.filter(isCloudAgent) : [];
      const applied = applyAgents(remotes);
      total.added += applied.added;
      total.updated += applied.updated;
      total.skipped += applied.skipped;
    } catch (err) {
      logger.warn({ runtimeId: runtime.runtimeId, err }, "agent sync failed for this workspace");
    }
  }

  if (total.added || total.updated || total.skipped) {
    logger.info(total, "agents synced from the workspace");
  }
  return total;
}

/**
 * Make sure this slug exists locally before a dispatch tries to resolve it.
 *
 * Called from the async `dispatch` loop rather than from `resolveAgent`, which
 * is synchronous and has ~35 call sites in tests. A cheap indexed read decides
 * whether a network pull is worth doing, so the common case (the agent is
 * already here) costs one local query.
 *
 * Without this, "create an agent in the app, then message it" would depend on
 * the periodic sync happening to have run in between — the same action working
 * or failing depending on the clock, which is the worst kind of behaviour to
 * explain. A miss is the exact moment the local copy is known to be stale, so
 * it is the right moment to refresh.
 *
 * Best effort: if the pull fails, the dispatch proceeds and fails with
 * `resolveAgent`'s own message, which is what happened before this existed.
 */
export async function ensureAgentLocal(slug: string | null | undefined): Promise<void> {
  if (!slug) return;
  const present = getDb().select().from(agents).where(eq(agents.slug, slug)).get();
  if (present) return;

  logger.info(
    { agentSlug: slug },
    "agent is not on this machine yet — pulling the workspace's agents before dispatching",
  );
  await syncAgents();
}
