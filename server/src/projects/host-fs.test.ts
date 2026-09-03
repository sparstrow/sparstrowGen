import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHostDir, listHostDir, listVolumes } from "./host-fs.js";
import { HttpError } from "../orchestrator/run-manager.js";

/** Real directories on disk — this module's whole job is the real filesystem. */
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-hostfs-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("listVolumes — 001 FR-009", () => {
  it("returns at least one volume for this platform", async () => {
    const volumes = await listVolumes();
    expect(volumes.length).toBeGreaterThan(0);
    for (const v of volumes) expect(path.isAbsolute(v.path)).toBe(true);
  });

  it("includes the volume the temp directory lives on", async () => {
    const volumes = await listVolumes();
    const root = path.parse(tmp).root;
    expect(volumes.map((v) => v.path)).toContain(root);
  });
});

describe("listHostDir — 001 FR-010 to FR-013", () => {
  it("lists directories only — files are not selectable as a project root", () => {
    fs.mkdirSync(path.join(tmp, "alpha"));
    fs.writeFileSync(path.join(tmp, "readme.md"), "x");
    const listing = listHostDir(tmp);
    expect(listing.entries.map((e) => e.name)).toEqual(["alpha"]);
  });

  it("sorts case-insensitively so Beta does not sort before alpha", () => {
    for (const name of ["Beta", "alpha", "Gamma"]) fs.mkdirSync(path.join(tmp, name));
    expect(listHostDir(tmp).entries.map((e) => e.name)).toEqual(["alpha", "Beta", "Gamma"]);
  });

  it("excludes hidden directories", () => {
    fs.mkdirSync(path.join(tmp, ".hidden"));
    fs.mkdirSync(path.join(tmp, "visible"));
    expect(listHostDir(tmp).entries.map((e) => e.name)).toEqual(["visible"]);
  });

  it("returns absolute entry paths so the client never joins them itself", () => {
    fs.mkdirSync(path.join(tmp, "alpha"));
    expect(listHostDir(tmp).entries[0]?.path).toBe(path.join(tmp, "alpha"));
  });

  it("reports an empty directory as empty rather than failing — it is a valid choice", () => {
    const listing = listHostDir(tmp);
    expect(listing.entries).toEqual([]);
    expect(listing.truncated).toBe(false);
  });

  it("defaults to the home directory when no path is given (FR-005)", () => {
    expect(listHostDir().path).toBe(path.resolve(os.homedir()));
    expect(listHostDir("  ").path).toBe(path.resolve(os.homedir()));
  });

  it("sets parent for a nested directory and null at a volume root", () => {
    const child = path.join(tmp, "child");
    fs.mkdirSync(child);
    expect(listHostDir(child).parent).toBe(tmp);
    const root = path.parse(tmp).root;
    expect(listHostDir(root).parent).toBeNull();
  });

  it("caps the listing and says so, rather than truncating silently (FR-013)", () => {
    for (let i = 0; i < 510; i++) {
      fs.mkdirSync(path.join(tmp, `d${String(i).padStart(4, "0")}`));
    }
    const listing = listHostDir(tmp);
    expect(listing.entries).toHaveLength(500);
    expect(listing.truncated).toBe(true);
  });

  it("rejects a relative path", () => {
    expect(() => listHostDir("not/absolute")).toThrow(HttpError);
    try {
      listHostDir("not/absolute");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(400);
    }
  });

  it("404s a path that does not exist", () => {
    try {
      listHostDir(path.join(tmp, "nope"));
      expect.unreachable();
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(404);
    }
  });

  it("400s a path that is a file", () => {
    const file = path.join(tmp, "a.txt");
    fs.writeFileSync(file, "x");
    try {
      listHostDir(file);
      expect.unreachable();
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(400);
    }
  });
});

describe("createHostDir — 001 FR-016 to FR-020", () => {
  it("creates the folder and returns its listing, ready to select", () => {
    const listing = createHostDir(tmp, "my-app");
    expect(listing.path).toBe(path.join(tmp, "my-app"));
    expect(listing.parent).toBe(tmp);
    expect(fs.statSync(path.join(tmp, "my-app")).isDirectory()).toBe(true);
  });

  it("trims the submitted name", () => {
    createHostDir(tmp, "  spaced  ");
    expect(fs.existsSync(path.join(tmp, "spaced"))).toBe(true);
  });

  it("409s a name that already exists and leaves it untouched (FR-018)", () => {
    const existing = path.join(tmp, "taken");
    fs.mkdirSync(existing);
    fs.writeFileSync(path.join(existing, "keep.txt"), "important");
    try {
      createHostDir(tmp, "taken");
      expect.unreachable();
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(409);
    }
    expect(fs.readFileSync(path.join(existing, "keep.txt"), "utf8")).toBe("important");
  });

  // FR-017 — the assertion that matters is that nothing is written, not the status.
  for (const name of ["..", ".", "../escape", "a/b", "a\\b", "/abs", ""]) {
    it(`rejects ${JSON.stringify(name)} and creates nothing`, () => {
      const before = fs.readdirSync(tmp);
      expect(() => createHostDir(tmp, name)).toThrow(HttpError);
      expect(fs.readdirSync(tmp)).toEqual(before);
      // and specifically: nothing appeared beside the parent either
      expect(fs.existsSync(path.join(path.dirname(tmp), "escape"))).toBe(false);
    });
  }

  it("does not create a missing parent chain — one level only", () => {
    const missing = path.join(tmp, "no", "such", "parent");
    try {
      createHostDir(missing, "child");
      expect.unreachable();
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(404);
    }
    expect(fs.existsSync(path.join(tmp, "no"))).toBe(false);
  });

  it("rejects a relative parent", () => {
    expect(() => createHostDir("relative/parent", "child")).toThrow(HttpError);
  });

  it("400s when the parent is a file", () => {
    const file = path.join(tmp, "a.txt");
    fs.writeFileSync(file, "x");
    try {
      createHostDir(file, "child");
      expect.unreachable();
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(400);
    }
  });
});
