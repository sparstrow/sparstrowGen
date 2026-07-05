import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { closeDb, openDb } from "../db/connection.js";
import { memoryNotes, projects } from "../db/schema.js";
import { writeNote } from "../memory/vault.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { copyProjectScopeNotes, createClientVariant, syncFromBase } from "./variants.js";

const ts = "2026-01-01T00:00:00Z";

function gitAvailable(): boolean {
  try {
    execFileSync(config.gitPath, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("client variants (P4 §7)", () => {
  let vaultDir: string;
  let originalVault: string;
  let tmp: string;

  beforeEach(() => {
    closeDb();
    openDb(":memory:");
    originalVault = config.vaultPath;
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-var-vault-"));
    config.vaultPath = vaultDir;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-var-"));
  });
  afterEach(() => {
    config.vaultPath = originalVault;
    closeDb();
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("copyProjectScopeNotes copies only project-scope notes, physically, to the new scope", () => {
    const db = openDb(":memory:").db;
    db.insert(projects).values({ id: "prj_base", name: "Base", slug: "base", createdAt: ts, updatedAt: ts }).run();
    writeNote({ title: "Arch", content: "shared architecture", scope: "project", projectSlug: "base", agentSlug: null, tags: ["arch"], source: "user" });
    writeNote({ title: "Global thing", content: "g", scope: "global", projectSlug: null, agentSlug: null, tags: [], source: "user" });
    writeNote({ title: "Agent note", content: "a", scope: "agent", projectSlug: null, agentSlug: "coder", tags: [], source: "agent:coder" });

    const copied = copyProjectScopeNotes("base", "variant");
    expect(copied).toBe(1); // only the project-scope note

    const variantNotes = db.select().from(memoryNotes).where(eq(memoryNotes.projectSlug, "variant")).all();
    expect(variantNotes).toHaveLength(1);
    expect(variantNotes[0]!.title).toBe("Arch");
    expect(variantNotes[0]!.scope).toBe("project");
    // Physical file written under the variant's project dir.
    expect(fs.existsSync(path.join(vaultDir, ...variantNotes[0]!.path.split("/")))).toBe(true);
  });

  it("createClientVariant errors when the base is missing or has no rootDir", async () => {
    const db = openDb(":memory:").db;
    await expect(createClientVariant("prj_nope", { name: "V", rootDir: path.join(tmp, "v") })).rejects.toThrow(HttpError);
    db.insert(projects).values({ id: "prj_base", name: "Base", slug: "base", rootDir: null, createdAt: ts, updatedAt: ts }).run();
    await expect(createClientVariant("prj_base", { name: "V", rootDir: path.join(tmp, "v") })).rejects.toThrow(/no rootDir/);
  });

  it("syncFromBase spawns an unassigned review task on the variant; rejects non-variants", () => {
    const db = openDb(":memory:").db;
    db.insert(projects).values([
      { id: "prj_base", name: "Base", slug: "base", createdAt: ts, updatedAt: ts },
      { id: "prj_var", name: "Clinic A", slug: "clinic-a", parentProjectId: "prj_base", createdAt: ts, updatedAt: ts },
    ]).run();

    expect(() => syncFromBase("prj_base")).toThrow(/not a client variant/);

    const task = syncFromBase("prj_var");
    expect(task.projectId).toBe("prj_var");
    expect(task.assignedAgentId).toBeNull();
    expect(task.status).toBe("inbox");
    expect(task.title).toContain("Sync");
    expect(task.description).toContain("Do NOT blind-merge");
  });

  it("createClientVariant forks a real git repo + copies base notes (integration)", async () => {
    if (!gitAvailable()) return; // skip where git is absent
    const db = openDb(":memory:").db;
    // A real base git repo with one commit.
    const baseDir = path.join(tmp, "base-repo");
    fs.mkdirSync(baseDir);
    const git = (args: string[]) => execFileSync(config.gitPath, ["-C", baseDir, ...args], { stdio: "ignore" });
    execFileSync(config.gitPath, ["init", baseDir], { stdio: "ignore" });
    git(["config", "user.email", "t@t.com"]);
    git(["config", "user.name", "T"]);
    fs.writeFileSync(path.join(baseDir, "README.md"), "# Base product");
    git(["add", "."]);
    git(["commit", "-m", "init"]);

    db.insert(projects).values({ id: "prj_base", name: "Base", slug: "base", rootDir: baseDir, gitRemote: "https://example.com/base.git", createdAt: ts, updatedAt: ts }).run();
    writeNote({ title: "Shared arch", content: "core layout", scope: "project", projectSlug: "base", agentSlug: null, tags: [], source: "user" });

    const variantDir = path.join(tmp, "clinic-a");
    const variant = await createClientVariant("prj_base", { name: "Clinic A", rootDir: variantDir });
    expect(variant.parentProjectId).toBe("prj_base");
    expect(variant.gitRemote).toBe("https://example.com/base.git");
    expect(variant.isSandbox).toBe(false);
    // The clone brought the base's file across.
    expect(fs.existsSync(path.join(variantDir, "README.md"))).toBe(true);
    // The base's project note was copied into the variant scope.
    expect(db.select().from(memoryNotes).where(eq(memoryNotes.projectSlug, "clinic-a")).all()).toHaveLength(1);
  });
});
