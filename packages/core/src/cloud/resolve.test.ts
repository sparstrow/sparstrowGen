import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { agents, cloudLinks, projects } from "../db/schema.js";
import { clearCloudLinks, resolveAgent, resolveProject } from "./resolve.js";
import type { RunStartPayload } from "@sparstrow/shared";

const now = "2026-08-10T00:00:00Z";
let tmpDir: string;

function payload(over: Partial<RunStartPayload> = {}): RunStartPayload {
  return {
    runId: "run_cloud1",
    agentId: "cloud-agent-1",
    agentSlug: "builder",
    projectId: null,
    projectSlug: null,
    taskId: null,
    prompt: "do it",
    trigger: "manual",
    lane: "foreground",
    ...over,
  };
}

function seedAgent(over: Partial<typeof agents.$inferInsert> = {}) {
  getDb()
    .insert(agents)
    .values({
      id: "agt_local1",
      name: "Builder",
      slug: "builder",
      provider: "claude-code",
      model: "sonnet",
      createdAt: now,
      updatedAt: now,
      ...over,
    })
    .run();
}

function seedProject(rootDir: string | null, over: Partial<typeof projects.$inferInsert> = {}) {
  getDb()
    .insert(projects)
    .values({
      id: "prj_local1",
      name: "App",
      slug: "app",
      rootDir,
      createdAt: now,
      updatedAt: now,
      ...over,
    })
    .run();
}

describe("cloud → local resolution", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-resolve-"));
  });
  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves an agent by slug the first time and records the link", () => {
    seedAgent();
    const result = resolveAgent(payload());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.localAgentId).toBe("agt_local1");

    const link = getDb().select().from(cloudLinks).where(eq(cloudLinks.cloudId, "cloud-agent-1")).get();
    expect(link?.localId).toBe("agt_local1");
  });

  it("uses the link afterwards, even when the slug no longer matches", () => {
    // The whole reason the link exists: a renamed local agent must keep running
    // the work already pointed at it.
    seedAgent();
    resolveAgent(payload());
    getDb().update(agents).set({ slug: "renamed" }).where(eq(agents.id, "agt_local1")).run();

    const result = resolveAgent(payload());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.localAgentId).toBe("agt_local1");
  });

  it("treats a link pointing at a deleted agent as a miss and re-resolves", () => {
    seedAgent();
    resolveAgent(payload());
    getDb().delete(agents).where(eq(agents.id, "agt_local1")).run();
    seedAgent({ id: "agt_local2" });

    const result = resolveAgent(payload());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.localAgentId).toBe("agt_local2");
  });

  it("refuses rather than inventing an agent it does not have", () => {
    // D-9. Creating one from the cloud definition is the start of a
    // bidirectional sync, not a line of code inside a dispatcher.
    const result = resolveAgent(payload({ agentSlug: "nobody" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("agent_not_available");
      expect(result.failure.error).toContain("nobody");
      expect(getDb().select().from(agents).all()).toHaveLength(0);
    }
  });

  it("refuses a disabled agent, naming it", () => {
    seedAgent({ enabled: false });
    const result = resolveAgent(payload());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe("agent_disabled");
  });

  it("refuses a quarantined agent and says quarantined, not disabled", () => {
    // P9's lifecycle states are actionable in a way "disabled" is not.
    seedAgent({ status: "quarantined" });
    const result = resolveAgent(payload());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("agent_disabled");
      expect(result.failure.error).toContain("quarantined");
    }
  });

  it("resolves no project when the command names none", () => {
    seedAgent();
    const result = resolveAgent(payload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.localProjectId).toBeNull();
      expect(result.value.rootDir).toBeNull();
    }
  });

  it("resolves a project by slug and returns its directory", () => {
    seedAgent();
    seedProject(tmpDir);
    const result = resolveAgent(payload({ projectId: "cloud-prj-1", projectSlug: "app" }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.localProjectId).toBe("prj_local1");
      expect(result.value.rootDir).toBe(tmpDir);
    }
  });

  it("refuses when the machine has no project with that slug", () => {
    seedAgent();
    const result = resolveAgent(payload({ projectId: "cloud-prj-1", projectSlug: "elsewhere" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe("project_not_available");
  });

  it("refuses when the project exists locally but has no directory bound", () => {
    seedAgent();
    seedProject(null);
    const result = resolveAgent(payload({ projectId: "cloud-prj-1", projectSlug: "app" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe("project_not_available");
  });

  it("checks the filesystem, not just the row, and reports the path it checked", () => {
    // The binding is a claim about a disk made whenever the daemon last
    // reported. Directories get renamed, deleted, and left on unmounted drives.
    seedAgent();
    const gone = path.join(tmpDir, "not-here");
    seedProject(gone);

    const result = resolveAgent(payload({ projectId: "cloud-prj-1", projectSlug: "app" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("project_not_available");
      // Carried so the browser can pre-fill relink instead of asking the user
      // to remember where the project used to live.
      expect(result.failure.detail).toBe(gone);
    }
  });

  it("forgets every link when the machine is re-paired", () => {
    seedAgent();
    resolveAgent(payload());
    expect(getDb().select().from(cloudLinks).all()).toHaveLength(1);

    clearCloudLinks();
    expect(getDb().select().from(cloudLinks).all()).toHaveLength(0);
  });

  it("re-links a local agent to a new cloud id without violating the unique index", () => {
    // The workspace's agent was deleted and recreated: same slug, new cloud id.
    seedAgent();
    resolveAgent(payload());

    const result = resolveAgent(payload({ agentId: "cloud-agent-2" }));
    expect(result.ok).toBe(true);

    const links = getDb().select().from(cloudLinks).all();
    expect(links).toHaveLength(1);
    expect(links[0]?.cloudId).toBe("cloud-agent-2");
  });

  it("resolveProject is a no-op for a payload with only one half of the pair", () => {
    const result = resolveProject({ projectId: "cloud-prj-1", projectSlug: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.localProjectId).toBeNull();
  });
});
