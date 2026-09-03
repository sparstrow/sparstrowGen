import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, openDb } from "../db/connection.js";
import { projects, runs } from "../db/schema.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { ensureSystemAgents, getSystemAgentId, PROJECT_INDEXER_SLUG } from "../agents/system-agents.js";
import { provisionProject, runProjectIndex } from "./provision.js";

const ts = "2026-01-01T00:00:00Z";

describe("provisionProject (P4 §4 creation modes)", () => {
  let tmp: string;

  beforeEach(() => {
    closeDb();
    openDb(":memory:");
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-prov-"));
  });
  afterEach(() => {
    closeDb();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("scratch: creates the folder + a non-sandbox project row (auto-index no-ops without an indexer)", async () => {
    const root = path.join(tmp, "fresh");
    const p = await provisionProject({
      name: "Fresh",
      description: "",
      mode: "scratch",
      rootDir: root,
      gitInit: false,
      isSandbox: true, // ignored for scratch
    });
    expect(fs.existsSync(root)).toBe(true);
    expect(p.rootDir).toBe(root);
    expect(p.isSandbox).toBe(false); // scratch is never a sandbox
    expect(p.gitRemote).toBeNull();
    // No indexer seeded → no run spawned.
    expect(openDb(":memory:").db.select().from(runs).all()).toHaveLength(0);
  });

  it("bind: binds an existing folder and honors the sandbox toggle", async () => {
    const root = path.join(tmp, "existing");
    fs.mkdirSync(root);
    const p = await provisionProject({
      name: "Bound",
      description: "d",
      mode: "bind",
      rootDir: root,
      gitInit: false,
      isSandbox: true,
    });
    expect(p.rootDir).toBe(root);
    expect(p.isSandbox).toBe(true);
  });

  it("rejects a relative rootDir", async () => {
    await expect(
      provisionProject({ name: "R", description: "", mode: "scratch", rootDir: "relative/path", gitInit: false, isSandbox: false }),
    ).rejects.toThrow(/absolute/);
  });

  it("rejects binding a non-existent folder", async () => {
    await expect(
      provisionProject({ name: "B", description: "", mode: "bind", rootDir: path.join(tmp, "nope"), gitInit: false, isSandbox: false }),
    ).rejects.toThrow(/does not exist/);
  });

  it("rejects scratch onto a non-empty folder", async () => {
    const root = path.join(tmp, "full");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "x.txt"), "hi");
    await expect(
      provisionProject({ name: "F", description: "", mode: "scratch", rootDir: root, gitInit: false, isSandbox: false }),
    ).rejects.toThrow(/not empty/);
  });

  it("rejects a clone with a disallowed URL scheme (no file:// SSRF/local-read)", async () => {
    await expect(
      provisionProject({
        name: "C",
        description: "",
        mode: "clone",
        rootDir: path.join(tmp, "clone"),
        gitUrl: "file:///etc/passwd",
        gitInit: false,
        isSandbox: false,
      }),
    ).rejects.toThrow(/scheme not allowed/);
  });

  it("rejects a duplicate project name", async () => {
    await provisionProject({ name: "Dup", description: "", mode: "scratch", rootDir: path.join(tmp, "a"), gitInit: false, isSandbox: false });
    await expect(
      provisionProject({ name: "Dup", description: "", mode: "scratch", rootDir: path.join(tmp, "b"), gitInit: false, isSandbox: false }),
    ).rejects.toThrow(HttpError);
  });
});

describe("runProjectIndex guards (no child spawn)", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });
  afterEach(() => closeDb());

  it("returns null when the project has no rootDir", () => {
    const db = openDb(":memory:").db;
    db.insert(projects).values({ id: "prj_1", name: "P", slug: "p", createdAt: ts, updatedAt: ts }).run();
    ensureSystemAgents();
    expect(runProjectIndex("prj_1")).toBeNull();
  });

  it("returns null when the indexer is not seeded", () => {
    const db = openDb(":memory:").db;
    db.insert(projects).values({ id: "prj_1", name: "P", slug: "p", rootDir: "C:/x", createdAt: ts, updatedAt: ts }).run();
    expect(runProjectIndex("prj_1")).toBeNull();
  });

  it("debounces: returns null when an index run is already in flight for the project", () => {
    const db = openDb(":memory:").db;
    db.insert(projects).values({ id: "prj_1", name: "P", slug: "p", rootDir: "C:/x", createdAt: ts, updatedAt: ts }).run();
    ensureSystemAgents();
    const indexerId = getSystemAgentId(PROJECT_INDEXER_SLUG)!;
    db.insert(runs)
      .values({ id: "run_live", agentId: indexerId, projectId: "prj_1", trigger: "system", mode: "headless", prompt: "p", status: "running", createdAt: ts })
      .run();
    expect(runProjectIndex("prj_1")).toBeNull();
    expect(db.select().from(runs).where(eq(runs.status, "queued")).all()).toHaveLength(0);
  });
});
