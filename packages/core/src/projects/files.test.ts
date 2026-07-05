import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "../orchestrator/run-manager.js";
import { listProjectDir } from "./files.js";

describe("listProjectDir (read-only project files, P4-Q4)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-files-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.mkdirSync(path.join(root, ".git")); // must be hidden
    fs.mkdirSync(path.join(root, "node_modules")); // must be hidden
    fs.writeFileSync(path.join(root, "README.md"), "# hi");
    fs.writeFileSync(path.join(root, "src", "index.ts"), "export const x = 1;");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("lists the root: dirs first, files after, .git/node_modules hidden", () => {
    const { entries } = listProjectDir(root, "");
    const names = entries.map((e) => e.name);
    expect(names).toEqual(["src", "README.md"]);
    expect(entries.find((e) => e.name === "src")!.type).toBe("dir");
    expect(entries.find((e) => e.name === "README.md")!.type).toBe("file");
    expect(entries.find((e) => e.name === "README.md")!.size).toBeGreaterThan(0);
  });

  it("descends into a subdir", () => {
    const { path: rel, entries } = listProjectDir(root, "src");
    expect(rel).toBe("src");
    expect(entries.map((e) => e.name)).toEqual(["index.ts"]);
  });

  it("rejects path traversal out of the project root", () => {
    expect(() => listProjectDir(root, "../..")).toThrow(/escapes/);
    expect(() => listProjectDir(root, "../secret")).toThrow(HttpError);
  });

  it("errors on a null rootDir or a missing path", () => {
    expect(() => listProjectDir(null, "")).toThrow(/no rootDir/);
    expect(() => listProjectDir(root, "does-not-exist")).toThrow(/not found/);
  });
});
