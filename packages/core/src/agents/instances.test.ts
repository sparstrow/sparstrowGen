import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "@sparstrow/shared";
import { config } from "../config.js";
import { closeDb, openDb } from "../db/connection.js";
import { agentInstances, agents, memoryNotes, projects } from "../db/schema.js";
import { expandScopes, noteMatchesFilters } from "../memory/scopes.js";
import { deriveScopeFromPath, scopeDir, writeNote } from "../memory/vault.js";
import { agentMemorySave, type RunContext } from "../memory/agent-memory.js";
import { busyKey, ensureAgentInstance } from "./instances.js";

const ts = "2026-01-01T00:00:00Z";

describe("agent instances (P3, locked D5)", () => {
  let db: ReturnType<typeof openDb>["db"];
  let vaultDir: string;
  let originalVault: string;

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
    originalVault = config.vaultPath;
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-vault-"));
    config.vaultPath = vaultDir;
    db.insert(agents)
      .values({ id: "agt_1", name: "Coder", slug: "coder", provider: "claude-code", model: "x", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(projects).values({ id: "proj_1", name: "Alpha", slug: "alpha", createdAt: ts, updatedAt: ts }).run();
  });
  afterEach(() => {
    config.vaultPath = originalVault;
    closeDb();
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  const ensure = () =>
    ensureAgentInstance({ agentId: "agt_1", agentSlug: "coder", projectId: "proj_1", projectSlug: "alpha" });

  it("creates lazily once and is idempotent (get-or-create)", () => {
    const first = ensure();
    expect(first.created).toBe(true);
    const second = ensure();
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(db.select().from(agentInstances).all()).toHaveLength(1);
  });

  it("copies template self-notes into the instance scope on first create (P3-Q1)", () => {
    writeNote({
      title: "Coder lore",
      content: "Always run typecheck before push.",
      scope: "agent",
      projectSlug: null,
      agentSlug: "coder",
      tags: ["lore"],
      source: "agent:coder",
    });
    ensure();

    const rows = db.select().from(memoryNotes).all();
    const template = rows.filter((r) => r.scope === "agent" && r.projectSlug === null);
    const instance = rows.filter((r) => r.scope === "agent" && r.projectSlug === "alpha");
    expect(template).toHaveLength(1); // original untouched
    expect(instance).toHaveLength(1); // copy created
    expect(instance[0]!.title).toBe("Coder lore");
    expect(instance[0]!.path.startsWith("agents/coder/alpha/")).toBe(true);
    // The copied file exists on disk under the instance dir.
    expect(fs.existsSync(path.join(vaultDir, ...instance[0]!.path.split("/")))).toBe(true);

    // A SECOND instantiate copies nothing (created=false short-circuits).
    ensure();
    expect(db.select().from(memoryNotes).all()).toHaveLength(2);
  });

  it("instance scope resolution isolates self-memory per project", () => {
    // agent:self in project alpha ⇒ instance filter; template note must NOT match.
    const inAlpha = expandScopes(["agent:self"], "coder", "alpha");
    expect(noteMatchesFilters({ scope: "agent", agentSlug: "coder", projectSlug: "alpha" }, inAlpha)).toBe(true);
    expect(noteMatchesFilters({ scope: "agent", agentSlug: "coder", projectSlug: null }, inAlpha)).toBe(false);
    expect(noteMatchesFilters({ scope: "agent", agentSlug: "coder", projectSlug: "beta" }, inAlpha)).toBe(false);

    // agent:self with NO project ⇒ template-only.
    const noProject = expandScopes(["agent:self"], "coder", null);
    expect(noteMatchesFilters({ scope: "agent", agentSlug: "coder", projectSlug: null }, noProject)).toBe(true);
    expect(noteMatchesFilters({ scope: "agent", agentSlug: "coder", projectSlug: "alpha" }, noProject)).toBe(false);

    // agent:<x> cross-agent read stays cross-project (any).
    const other = expandScopes(["agent:coder"], "reviewer", "alpha");
    expect(noteMatchesFilters({ scope: "agent", agentSlug: "coder", projectSlug: null }, other)).toBe(true);
    expect(noteMatchesFilters({ scope: "agent", agentSlug: "coder", projectSlug: "beta" }, other)).toBe(true);
  });

  it("agentMemorySave routes self-writes to the instance of the current project", () => {
    const ctx = {
      runId: "run_1",
      agent: {
        id: "agt_1",
        slug: "coder",
        name: "Coder",
        memoryReadScopes: ["agent:self"],
        memoryWriteScopes: ["agent:self"],
      } as unknown as Agent,
      projectSlug: "alpha",
      taskId: null,
      parentTaskId: null,
      teamId: null,
      delegatedByAgentName: null,
      delegationDepth: 0,
    } satisfies RunContext;

    const note = agentMemorySave(ctx, {
      title: "Alpha pitfall",
      content: "Vite proxy needs the token.",
      scope: "agent",
      tags: [],
    });
    expect(note.projectSlug).toBe("alpha");
    expect(note.path.startsWith("agents/coder/alpha/")).toBe(true);

    // Same agent with no project writes template-scoped.
    const templateNote = agentMemorySave({ ...ctx, projectSlug: null }, {
      title: "General lore",
      content: "x",
      scope: "agent",
      tags: [],
    });
    expect(templateNote.projectSlug).toBeNull();
    expect(templateNote.path.startsWith("agents/coder/")).toBe(true);
    expect(templateNote.path.startsWith("agents/coder/alpha/")).toBe(false);
  });

  it("vault path round-trip: scopeDir and deriveScopeFromPath agree on instance dirs", () => {
    expect(scopeDir("agent", "alpha", "coder")).toBe("agents/coder/alpha");
    expect(scopeDir("agent", null, "coder")).toBe("agents/coder");
    expect(deriveScopeFromPath("agents/coder/alpha/note.md")).toEqual({
      scope: "agent",
      projectSlug: "alpha",
      agentSlug: "coder",
    });
    expect(deriveScopeFromPath("agents/coder/note.md")).toEqual({
      scope: "agent",
      projectSlug: null,
      agentSlug: "coder",
    });
  });

  it("busyKey separates projects but not runs of the same instance", () => {
    expect(busyKey("agt_1", "proj_1")).not.toBe(busyKey("agt_1", "proj_2"));
    expect(busyKey("agt_1", "proj_1")).toBe(busyKey("agt_1", "proj_1"));
    expect(busyKey("agt_1", null)).toBe(busyKey("agt_1", undefined));
  });
});
