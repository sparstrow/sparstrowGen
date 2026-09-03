import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Agent, MemorySearchHit } from "@sparstrow/shared";
import { config } from "../config.js";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { memoryLinks, memoryNotes } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { buildMemoryBlock } from "./injector.js";
import { extractWikilinks, getNoteLinks, onNoteRemoved, resolveDanglingLinks, syncNoteLinks } from "./links.js";
import { parseLessonRefs, toEngineQualifiedName } from "./lessons.js";
import { headTailExcerpt, parseLlmJson, truncateSafe } from "./llm-json.js";
import { noteRowExcluded } from "./search.js";
import { buildSynthesisUserMessage } from "./synthesis.js";
import { approveNote, archiveNote, getNote, readNoteRaw, scanVault, writeNote } from "./vault.js";
import { hasExternalContentToolUse } from "../orchestrator/untrusted.js";

describe("P5 typed memory (pure gate)", () => {
  it("noteRowExcluded: type filter, quarantine, and archive are each exclusionary", () => {
    const base = { type: "note", quarantined: false, archivedAt: null };
    expect(noteRowExcluded(base, {})).toBe(false);
    expect(noteRowExcluded({ ...base, type: "decision" }, { type: "decision" })).toBe(false);
    expect(noteRowExcluded(base, { type: "decision" })).toBe(true);
    expect(noteRowExcluded({ ...base, quarantined: true }, {})).toBe(true);
    expect(noteRowExcluded({ ...base, quarantined: true }, { includeQuarantined: true })).toBe(false);
    expect(noteRowExcluded({ ...base, archivedAt: "2026-01-01T00:00:00Z" }, {})).toBe(true);
    expect(
      noteRowExcluded({ ...base, archivedAt: "2026-01-01T00:00:00Z" }, { includeArchived: true }),
    ).toBe(false);
  });
});

describe("P5 vault round-trip (type / quarantine / archive)", () => {
  let vaultDir: string;
  let originalVault: string;

  beforeEach(() => {
    closeDb();
    openDb(":memory:");
    originalVault = config.vaultPath;
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-sm-"));
    config.vaultPath = vaultDir;
  });
  afterEach(() => {
    config.vaultPath = originalVault;
    closeDb();
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("writeNote persists type + refs + quarantined to frontmatter; scanVault reads them back", () => {
    const note = writeNote({
      title: "Auth decision",
      content: "We use bearer tokens.",
      scope: "global",
      tags: ["auth"],
      source: "signal",
      type: "decision",
      refs: [{ filePath: "packages/core/src/auth.ts", symbolName: "verifyToken" }],
      quarantined: true,
    });
    expect(note.type).toBe("decision");
    expect(note.quarantined).toBe(true);
    const raw = readNoteRaw(note);
    expect(raw).toContain("type: decision");
    expect(raw).toContain("quarantined: true");
    expect(raw).toContain("symbolName: verifyToken");

    // Simulate a DB reset: wipe rows, rescan from files.
    getDb().delete(memoryNotes).run();
    scanVault();
    const rescanned = getDb().select().from(memoryNotes).all();
    expect(rescanned).toHaveLength(1);
    expect(rescanned[0]!.type).toBe("decision");
    expect(rescanned[0]!.quarantined).toBe(true);
  });

  it("archiveNote soft-archives (frontmatter + DB) and approveNote clears quarantine", () => {
    const a = writeNote({ title: "Old", content: "x", scope: "global", tags: [], source: "user" });
    const synth = writeNote({ title: "Merged", content: "y", scope: "global", tags: [], source: "dream" });
    const archived = archiveNote(a.id, synth.id)!;
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.supersededBy).toBe(synth.id);
    expect(readNoteRaw(archived)).toContain("archived:");
    // The file still exists — never hard-deleted.
    expect(fs.existsSync(path.join(vaultDir, archived.path))).toBe(true);

    const q = writeNote({
      title: "Sig",
      content: "z",
      scope: "global",
      tags: [],
      source: "signal",
      quarantined: true,
    });
    const approved = approveNote(q.id)!;
    expect(approved.quarantined).toBe(false);
    expect(readNoteRaw(approved)).not.toContain("quarantined:");
  });

  it("quarantined and archived notes never enter the injected memory block", async () => {
    writeNote({
      title: "Visible fact",
      content: "The deploy target is Fly.",
      scope: "global",
      tags: [],
      source: "user",
    });
    writeNote({
      title: "Quarantined signal",
      content: "SECRET-INJECTED-PITFALL",
      scope: "global",
      tags: [],
      source: "signal",
      quarantined: true,
    });
    const arch = writeNote({
      title: "Archived note",
      content: "ARCHIVED-CONTENT",
      scope: "global",
      tags: [],
      source: "user",
    });
    archiveNote(arch.id, null);

    const agent = {
      id: "agt_1",
      name: "Coder",
      slug: "coder",
      memoryReadScopes: ["global"],
      memoryWriteScopes: [],
    } as unknown as Agent;
    // Embedder/FTS not warmed in tests — the recency fallback path serves,
    // which is exactly the EH6 bypass the shared gate must cover.
    const { block, manifest } = await buildMemoryBlock(agent, null, "deploy target");
    expect(block).toContain("Visible fact");
    expect(block).not.toContain("SECRET-INJECTED-PITFALL");
    expect(block).not.toContain("ARCHIVED-CONTENT");
    expect(manifest.map((m) => m.title)).toEqual(["Visible fact"]);
    // EH6: injected entries carry an author label; block is marked untrusted data.
    expect(block).toContain("written-by: user");
    expect(block).toContain("UNTRUSTED DATA");
  });
});

describe("P5 wikilinks", () => {
  it("extractWikilinks: dedupes, trims, handles [[Title|alias]], ignores empties", () => {
    const body = "See [[API Auth]] and [[api auth]] again, [[Deploy|the deploy doc]], [[ ]] and [[API Auth]].";
    expect(extractWikilinks(body)).toEqual(["API Auth", "api auth", "Deploy"]);
  });

  describe("with db", () => {
    let vaultDir: string;
    let originalVault: string;
    beforeEach(() => {
      closeDb();
      openDb(":memory:");
      originalVault = config.vaultPath;
      vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-wl-"));
      config.vaultPath = vaultDir;
    });
    afterEach(() => {
      config.vaultPath = originalVault;
      closeDb();
      fs.rmSync(vaultDir, { recursive: true, force: true });
    });

    it("syncNoteLinks resolves case-insensitively; dangling links resolve when the note appears; deletion degrades to dangling", () => {
      const target = writeNote({ title: "API Auth", content: "t", scope: "global", tags: [], source: "user" });
      const from = writeNote({ title: "Notes", content: "see [[api auth]] and [[Missing One]]", scope: "global", tags: [], source: "user" });
      syncNoteLinks(from.id, "see [[api auth]] and [[Missing One]]");

      let links = getNoteLinks(from.id);
      expect(links.outgoing).toHaveLength(2);
      const resolved = links.outgoing.find((l) => l.unresolvedTitle === "api auth")!;
      expect(resolved.toNoteId).toBe(target.id);
      const dangling = links.outgoing.find((l) => l.unresolvedTitle === "Missing One")!;
      expect(dangling.toNoteId).toBeNull();

      // Backlinks visible from the target side.
      expect(getNoteLinks(target.id).backlinks.map((b) => b.fromNoteId)).toEqual([from.id]);

      // The missing note appears → dangling link resolves.
      const missing = writeNote({ title: "Missing One", content: "m", scope: "global", tags: [], source: "user" });
      resolveDanglingLinks(missing.id, missing.title);
      links = getNoteLinks(from.id);
      expect(links.outgoing.find((l) => l.unresolvedTitle === "Missing One")!.toNoteId).toBe(missing.id);

      // Target removed → inbound link degrades to dangling (raw title kept).
      onNoteRemoved(target.id);
      links = getNoteLinks(from.id);
      const degraded = links.outgoing.find((l) => l.unresolvedTitle === "api auth")!;
      expect(degraded.toNoteId).toBeNull();

      // Self-links never resolve to self.
      syncNoteLinks(from.id, "self ref [[Notes]]");
      const selfLink = getDb().select().from(memoryLinks).where(eq(memoryLinks.fromNoteId, from.id)).all();
      expect(selfLink).toHaveLength(1);
      expect(selfLink[0]!.toNoteId).toBeNull();
    });
  });
});

describe("P5 LESSONS translation fn", () => {
  it("parseLessonRefs drops invalid entries", () => {
    expect(
      parseLessonRefs({
        refs: [
          { filePath: "a/b.ts", symbolName: "fn" },
          { filePath: "", symbolName: "x" },
          "junk",
          { filePath: "c.ts" },
        ],
      }),
    ).toEqual([{ filePath: "a/b.ts", symbolName: "fn" }]);
    expect(parseLessonRefs({})).toEqual([]);
  });

  it("toEngineQualifiedName: slashes→dots, extension stripped, symbol appended verbatim", () => {
    expect(
      toEngineQualifiedName("my-app", {
        filePath: "packages/core/src/orchestrator/run-manager.ts",
        symbolName: "RunManager.tick",
      }),
    ).toBe("my-app.packages.core.src.orchestrator.run-manager.RunManager.tick");
    expect(toEngineQualifiedName("p", { filePath: "src\\win\\path.tsx", symbolName: "App" })).toBe(
      "p.src.win.path.App",
    );
    expect(toEngineQualifiedName("p", { filePath: "/lead/slash.ts", symbolName: "x" })).toBe("p.lead.slash.x");
  });
});

describe("P5 LLM json utilities", () => {
  it("parseLlmJson: strict, fenced, and repaired prose-wrapped JSON all parse", () => {
    expect(parseLlmJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseLlmJson('Sure!\n```json\n{"a": 2}\n```')).toEqual({ a: 2 });
    expect(parseLlmJson('The verdict is {"a": 3,} thanks')).toEqual({ a: 3 });
    expect(() => parseLlmJson("no json here")).toThrow();
    expect(() => parseLlmJson("")).toThrow();
  });

  it("truncateSafe never splits a surrogate pair; headTailExcerpt marks the cut", () => {
    const emoji = "x".repeat(3) + "😀"; // surrogate pair at the boundary
    const cut = truncateSafe(emoji, 4);
    expect(cut.endsWith("…")).toBe(true);
    // No lone surrogate anywhere in the output.
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(cut)).toBe(false);

    const long = "H".repeat(50) + "M".repeat(50) + "T".repeat(50);
    const excerpt = headTailExcerpt(long, 20, 20);
    expect(excerpt).toContain("[...truncated...]");
    expect(excerpt.startsWith("H".repeat(20 - 1))).toBe(true);
    expect(excerpt.endsWith("T".repeat(20))).toBe(true);
  });
});

describe("P5 synthesis prompt", () => {
  it("numbers notes once per noteId (chunk hits merge) and labels them as data", () => {
    const hit = (noteId: string, title: string, excerpt: string): MemorySearchHit => ({
      noteId,
      path: `global/${noteId}.md`,
      title,
      scope: "global",
      projectSlug: null,
      agentSlug: null,
      excerpt,
      heading: null,
      score: 1,
      vecRank: null,
      ftsRank: null,
      type: "note",
    });
    const msg = buildSynthesisUserMessage("what auth?", [
      hit("mem_a", "Auth", "chunk one"),
      hit("mem_a", "Auth", "chunk two"),
      hit("mem_b", "Deploy", "fly"),
    ]);
    expect(msg).toContain("[1] Auth");
    expect(msg).toContain("chunk one\nchunk two");
    expect(msg).toContain("[2] Deploy");
    expect(msg).not.toContain("[3]");
    expect(msg).toContain("<notes>");
  });
});

describe("EH6/EH7 untrusted-run detection", () => {
  const assistantEvent = (blocks: unknown[]) => ({
    type: "assistant" as const,
    payload: { message: { content: blocks } },
  });

  it("flags WebFetch/WebSearch and foreign MCP tools; core memory tools are fine", () => {
    expect(hasExternalContentToolUse([assistantEvent([{ type: "tool_use", name: "WebFetch" }])])).toBe(true);
    expect(hasExternalContentToolUse([assistantEvent([{ type: "tool_use", name: "WebSearch" }])])).toBe(true);
    expect(
      hasExternalContentToolUse([assistantEvent([{ type: "tool_use", name: "mcp__github__get_issue" }])]),
    ).toBe(true);
    expect(
      hasExternalContentToolUse([
        assistantEvent([
          { type: "tool_use", name: "mcp__sparstrow-memory__memory_search" },
          { type: "tool_use", name: "Read" },
          { type: "text", text: "hi" },
        ]),
      ]),
    ).toBe(false);
    expect(hasExternalContentToolUse([{ type: "tool_use", payload: { name: "WebFetch" } }])).toBe(true);
    expect(hasExternalContentToolUse([{ type: "result", payload: {} }])).toBe(false);
  });
});
