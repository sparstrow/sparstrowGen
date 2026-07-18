import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverLocalSkills,
  normalizeSkillUrl,
  parseSkillFrontmatter,
  readLocalSkill,
  type LocalSkillRoot,
} from "./local-skills.js";

let tmp: string;
let roots: LocalSkillRoot[];

function writeSkill(root: string, dir: string, frontmatter: string, body = "Do the thing.") {
  const full = path.join(root, dir);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, "SKILL.md"), `---\n${frontmatter}\n---\n${body}\n`, "utf8");
  return path.join(full, "SKILL.md");
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-skills-"));
  roots = [
    { path: path.join(tmp, "claude"), provider: "claude-code", kind: "provider" },
    { path: path.join(tmp, "universal"), provider: "universal", kind: "universal" },
  ];
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("parseSkillFrontmatter", () => {
  it("parses key: value pairs and returns the body", () => {
    const { frontmatter, body } = parseSkillFrontmatter(
      '---\nname: PDF pro\ndescription: "Handles PDFs"\n---\n# Body\n',
    );
    expect(frontmatter.name).toBe("PDF pro");
    expect(frontmatter.description).toBe("Handles PDFs");
    expect(body).toBe("# Body\n");
  });

  it("returns the whole input as body when no frontmatter", () => {
    const { frontmatter, body } = parseSkillFrontmatter("just markdown");
    expect(frontmatter).toEqual({});
    expect(body).toBe("just markdown");
  });
});

describe("discoverLocalSkills", () => {
  it("finds skills across roots, provider root winning on key collisions", () => {
    writeSkill(roots[0]!.path, "pdf", "name: PDF (claude)");
    writeSkill(roots[1]!.path, "pdf", "name: PDF (universal)");
    writeSkill(roots[1]!.path, "web/research", "name: Web research\ndescription: Search well");

    const found = discoverLocalSkills(roots);
    expect(found.map((s) => s.name).sort()).toEqual(["PDF (claude)", "Web research"]);
    const web = found.find((s) => s.name === "Web research")!;
    expect(web.description).toBe("Search well");
    expect(web.root).toBe("universal");
    expect(web.key).toBe("web/research");
    expect(found.find((s) => s.name === "PDF (claude)")!.provider).toBe("claude-code");
  });

  it("returns empty for absent roots", () => {
    expect(
      discoverLocalSkills([{ path: path.join(tmp, "nope"), provider: "x", kind: "provider" }]),
    ).toEqual([]);
  });
});

describe("readLocalSkill", () => {
  it("reads name/description/content from a skill inside a root", () => {
    const p = writeSkill(roots[0]!.path, "pdf", "name: PDF pro\ndescription: d", "Use pypdf.");
    const skill = readLocalSkill(p, roots);
    expect(skill).toEqual({ name: "PDF pro", description: "d", content: "Use pypdf." });
  });

  it("falls back to the directory name when frontmatter has no name", () => {
    const p = writeSkill(roots[0]!.path, "unnamed-skill", "author: someone");
    expect(readLocalSkill(p, roots).name).toBe("unnamed-skill");
  });

  it("rejects paths outside the known roots (traversal guard)", () => {
    const outside = path.join(tmp, "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "SKILL.md"), "---\nname: evil\n---\nx", "utf8");
    expect(() => readLocalSkill(path.join(outside, "SKILL.md"), roots)).toThrow(/known runtime/);
    const inside = writeSkill(roots[0]!.path, "ok", "name: ok");
    const sneaky = path.join(path.dirname(inside), "..", "..", "..", "outside", "SKILL.md");
    expect(() => readLocalSkill(sneaky, roots)).toThrow(/known runtime/);
  });

  it("rejects non-SKILL.md files even inside a root", () => {
    const dir = path.join(roots[0]!.path, "pdf");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "notes.md"), "x", "utf8");
    expect(() => readLocalSkill(path.join(dir, "notes.md"), roots)).toThrow(/known runtime/);
  });
});

describe("normalizeSkillUrl", () => {
  it("rewrites GitHub blob URLs to raw", () => {
    expect(
      normalizeSkillUrl("https://github.com/anthropics/skills/blob/main/pdf/SKILL.md"),
    ).toBe("https://raw.githubusercontent.com/anthropics/skills/main/pdf/SKILL.md");
  });
  it("passes other URLs through", () => {
    expect(normalizeSkillUrl("https://skills.sh/x/SKILL.md")).toBe("https://skills.sh/x/SKILL.md");
  });
});
