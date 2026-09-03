import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import {
  buildDirectivesBlock,
  createDirective,
  deleteDirective,
  listDirectives,
  updateDirective,
} from "./directives.js";

const ts = "2026-01-01T00:00:00Z";

describe("project directives (§2/P4-Q2)", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
    db.insert(projects).values({ id: "prj_1", name: "App", slug: "app", createdAt: ts, updatedAt: ts }).run();
  });
  afterEach(() => closeDb());

  it("create appends to the end by sort; list is sort-ordered", () => {
    const a = createDirective("prj_1", { body: "Use Tailwind." });
    const b = createDirective("prj_1", { body: "No inline styles." });
    expect(a.sort).toBe(0);
    expect(b.sort).toBe(1);
    expect(listDirectives("prj_1").map((d) => d.body)).toEqual(["Use Tailwind.", "No inline styles."]);
  });

  it("buildDirectivesBlock renders enabled directives in order as operator rules", () => {
    createDirective("prj_1", { body: "Use Tailwind." });
    createDirective("prj_1", { body: "Prefer server components." });
    const block = buildDirectivesBlock("prj_1");
    expect(block).toContain("## Project directives");
    expect(block).toContain("take precedence");
    expect(block).toContain("1. Use Tailwind.");
    expect(block).toContain("2. Prefer server components.");
  });

  it("disabled directives are excluded from the injection block", () => {
    const a = createDirective("prj_1", { body: "Active rule." });
    createDirective("prj_1", { body: "Muted rule." }).id;
    const muted = listDirectives("prj_1").find((d) => d.body === "Muted rule.")!;
    updateDirective("prj_1", muted.id, { enabled: false });
    const block = buildDirectivesBlock("prj_1");
    expect(block).toContain("Active rule.");
    expect(block).not.toContain("Muted rule.");
    void a;
  });

  it("no project / no enabled directives ⇒ empty block (drops out of the prompt join)", () => {
    expect(buildDirectivesBlock(null)).toBe("");
    expect(buildDirectivesBlock("prj_1")).toBe("");
    const d = createDirective("prj_1", { body: "x" });
    updateDirective("prj_1", d.id, { enabled: false });
    expect(buildDirectivesBlock("prj_1")).toBe("");
  });

  it("update/delete are scoped to the owning project", () => {
    const d = createDirective("prj_1", { body: "original" });
    expect(updateDirective("prj_other", d.id, { body: "hijack" })).toBeNull();
    expect(deleteDirective("prj_other", d.id)).toBe(false);
    expect(updateDirective("prj_1", d.id, { body: "edited" })!.body).toBe("edited");
    expect(deleteDirective("prj_1", d.id)).toBe(true);
    expect(listDirectives("prj_1")).toHaveLength(0);
  });
});
