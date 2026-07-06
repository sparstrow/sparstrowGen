import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "@sparstrow/shared";
import { config } from "../config.js";
import { closeDb, openDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import { agentMemorySave, type RunContext } from "./agent-memory.js";
import { clampSandboxWriteScopes, expandWriteScopes } from "./scopes.js";
import { getSandboxProjectSlugs, isForeignSandboxNote } from "./search.js";
import { HttpError } from "../orchestrator/run-manager.js";

const ts = "2026-01-01T00:00:00Z";

const mkAgent = (writeScopes: string[]): Agent =>
  ({
    id: "agt_1",
    name: "Coder",
    slug: "coder",
    memoryReadScopes: ["global", "agent:self", "project:*"],
    memoryWriteScopes: writeScopes,
  }) as unknown as Agent;

const ctx = (over: Partial<RunContext>): RunContext =>
  ({
    runId: "run_1",
    agent: mkAgent(["global", "agent:self", "project:*"]),
    projectId: null,
    projectSlug: "sandboxproj",
    isSandbox: true,
    taskId: null,
    parentTaskId: null,
    teamId: null,
    delegatedByAgentName: null,
    delegationDepth: 0,
    effectiveTools: null,
    ...over,
  }) as RunContext;

describe("EH7 sandbox write-scope clamp (pure)", () => {
  it("keeps ONLY project:<sandbox>, dropping global / agent:self / foreign-project", () => {
    const agent = mkAgent(["global", "agent:self", "project:*", "project:other"]);
    const clamped = clampSandboxWriteScopes(expandWriteScopes(agent, "sandboxproj"), "sandboxproj");
    expect(clamped).toEqual([{ scope: "project", projectSlug: "sandboxproj" }]);
    expect(clamped.some((f) => f.scope === "global")).toBe(false);
    expect(clamped.some((f) => f.scope === "agent")).toBe(false);
    expect(clamped.some((f) => f.scope === "project" && f.projectSlug === "other")).toBe(false);
  });

  it("an agent with no project write scope is clamped to nothing (can't write in a sandbox)", () => {
    const clamped = clampSandboxWriteScopes(expandWriteScopes(mkAgent(["global", "agent:self"]), "sandboxproj"), "sandboxproj");
    expect(clamped).toEqual([]);
  });
});

describe("EH7 sandbox write enforcement (agentMemorySave)", () => {
  let vaultDir: string;
  let originalVault: string;

  beforeEach(() => {
    closeDb();
    openDb(":memory:");
    originalVault = config.vaultPath;
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-sbx-"));
    config.vaultPath = vaultDir;
  });
  afterEach(() => {
    config.vaultPath = originalVault;
    closeDb();
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("allows a project-scoped write to the sandbox project itself", () => {
    const note = agentMemorySave(ctx({}), { title: "Sandbox finding", content: "x", scope: "project", tags: [] });
    expect(note.scope).toBe("project");
    expect(note.projectSlug).toBe("sandboxproj");
  });

  it("REJECTS a global write from a sandbox run", () => {
    expect(() => agentMemorySave(ctx({}), { title: "leak", content: "x", scope: "global", tags: [] })).toThrow(
      /sandbox project/,
    );
  });

  it("REJECTS an agent:self write from a sandbox run (the EH7 leak vector)", () => {
    // agent:self would resolve to agents/coder/sandboxproj — seeded from the
    // cross-project template lineage — so it MUST be blocked under sandbox.
    expect(() => agentMemorySave(ctx({}), { title: "leak", content: "x", scope: "agent", tags: [] })).toThrow(HttpError);
  });

  it("REJECTS a write to a DIFFERENT project from a sandbox run", () => {
    expect(() =>
      agentMemorySave(ctx({}), { title: "leak", content: "x", scope: "project", projectSlug: "other", tags: [] }),
    ).toThrow(/sandbox project/);
  });

  it("a NON-sandbox run keeps its normal write scopes (global + self allowed)", () => {
    const nonSbx = ctx({ isSandbox: false, projectSlug: "normalproj" });
    expect(agentMemorySave(nonSbx, { title: "g", content: "x", scope: "global", tags: [] }).scope).toBe("global");
    expect(agentMemorySave(nonSbx, { title: "s", content: "x", scope: "agent", tags: [] }).scope).toBe("agent");
  });
});

describe("EH7 sandbox read isolation", () => {
  it("isForeignSandboxNote hides a sandbox note from other projects + global search, shows it to its own", () => {
    const sandboxSlugs = new Set(["sbx"]);
    const note = { scope: "project", projectSlug: "sbx" };
    expect(isForeignSandboxNote(note, sandboxSlugs, "other")).toBe(true);
    expect(isForeignSandboxNote(note, sandboxSlugs, null)).toBe(true); // global/user search
    expect(isForeignSandboxNote(note, sandboxSlugs, "sbx")).toBe(false); // its own project
    // A normal (non-sandbox) project note is never hidden; non-project scopes never hidden.
    expect(isForeignSandboxNote({ scope: "project", projectSlug: "norm" }, sandboxSlugs, null)).toBe(false);
    expect(isForeignSandboxNote({ scope: "global", projectSlug: null }, sandboxSlugs, null)).toBe(false);
  });

  it("getSandboxProjectSlugs returns only is_sandbox projects", () => {
    closeDb();
    const db = openDb(":memory:").db;
    db.insert(projects)
      .values([
        { id: "prj_s", name: "Sbx", slug: "sbx", isSandbox: true, createdAt: ts, updatedAt: ts },
        { id: "prj_n", name: "Norm", slug: "norm", isSandbox: false, createdAt: ts, updatedAt: ts },
      ])
      .run();
    expect([...getSandboxProjectSlugs()]).toEqual(["sbx"]);
    closeDb();
  });

  it("the /memory/search LIKE-fallback filter drops sandbox notes for the operator's global search", () => {
    // Reproduces the exact filter the route applies to its fallback rows.
    const sandboxSlugs = new Set(["sbx"]);
    const rows = [
      { scope: "project", projectSlug: "sbx" }, // confidential sandbox note
      { scope: "project", projectSlug: "norm" }, // ordinary project note
      { scope: "global", projectSlug: null },
    ];
    const visible = rows.filter((r) => !isForeignSandboxNote(r, sandboxSlugs, null));
    expect(visible).toEqual([
      { scope: "project", projectSlug: "norm" },
      { scope: "global", projectSlug: null },
    ]);
  });
});
