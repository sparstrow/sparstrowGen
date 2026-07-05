import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/connection.js";
import { agents } from "../db/schema.js";
import { logger } from "../logger.js";

/**
 * P4 factory-managed system agents. `createRun` requires a real enabled agents
 * row (there is no synthetic-agent path that can reach memory), so the auto-index
 * (§2) and morning-briefing (§5) features need persisted agents. They are seeded
 * idempotently at boot, flagged is_system=true (hidden from the roster), and given
 * least-privilege read tools + project memory-write scope so they can summarize a
 * codebase into project-scoped notes but cannot modify files.
 */

export const PROJECT_INDEXER_SLUG = "project-indexer";
export const PROJECT_REPORTER_SLUG = "project-reporter";

interface SystemAgentSeed {
  slug: string;
  name: string;
  role: string;
  systemPrompt: string;
  allowedTools: string[];
  disallowedTools: string[];
  memoryReadScopes: string[];
  memoryWriteScopes: string[];
}

const SEEDS: SystemAgentSeed[] = [
  {
    slug: PROJECT_INDEXER_SLUG,
    name: "Project Indexer",
    role: "Summarizes a project's codebase into project memory",
    systemPrompt:
      "You are the Project Indexer, a read-only system agent. You crawl a project's root directory and write concise, factual memory notes (scope: project) describing the codebase — its architecture, key modules, entry points, conventions, and how to run it. One topic per note. You never modify files and never run commands. Be terse and accurate; these notes prime other agents so they don't re-read the whole repo.",
    allowedTools: ["Read", "Glob", "Grep"],
    disallowedTools: ["Bash", "Write", "Edit", "WebFetch", "WebSearch"],
    memoryReadScopes: ["project:*"],
    memoryWriteScopes: ["project:*"],
  },
  {
    slug: PROJECT_REPORTER_SLUG,
    name: "Project Reporter",
    role: "Writes the daily project status briefing",
    systemPrompt:
      "You are the Project Reporter, a read-only system agent. Once a day you review a project's recent activity — recent runs, task outcomes, memory updates, and git commits — and write ONE concise \"Morning briefing\" memory note (scope: project) summarizing what changed and what needs attention. Lead with anything blocked or awaiting the operator. You never modify files and never run commands.",
    allowedTools: ["Read", "Glob", "Grep"],
    disallowedTools: ["Bash", "Write", "Edit", "WebFetch", "WebSearch"],
    memoryReadScopes: ["project:*", "global"],
    memoryWriteScopes: ["project:*"],
  },
];

/** Idempotent boot seeding: insert missing system agents, keep is_system set. */
export function ensureSystemAgents(): void {
  const db = getDb();
  const ts = new Date().toISOString();
  for (const seed of SEEDS) {
    const existing = db.select().from(agents).where(eq(agents.slug, seed.slug)).get();
    if (existing) {
      // Repair the is_system flag on an older row if needed (never overwrite the
      // operator's other edits — these agents are ours but we stay minimal).
      if (!existing.isSystem) {
        db.update(agents).set({ isSystem: true }).where(eq(agents.id, existing.id)).run();
      }
      continue;
    }
    db.insert(agents)
      .values({
        id: `agt_${nanoid(10)}`,
        name: seed.name,
        slug: seed.slug,
        role: seed.role,
        systemPrompt: seed.systemPrompt,
        provider: "claude-code",
        model: "sonnet",
        cwd: null,
        addDirs: [],
        allowedTools: seed.allowedTools,
        disallowedTools: seed.disallowedTools,
        permissionMode: "default",
        mcpServers: {},
        maxTurns: null,
        memoryReadScopes: seed.memoryReadScopes,
        memoryWriteScopes: seed.memoryWriteScopes,
        extraArgs: [],
        enabled: true,
        isSystem: true,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    logger.info({ slug: seed.slug }, "seeded system agent");
  }
}

export function getSystemAgentId(slug: string): string | null {
  return (
    getDb().select({ id: agents.id }).from(agents).where(eq(agents.slug, slug)).get()?.id ?? null
  );
}
