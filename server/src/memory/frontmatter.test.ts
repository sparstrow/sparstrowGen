import { describe, expect, it } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";

describe("frontmatter codec (js-yaml 4 — gray-matter replacement)", () => {
  it("round-trips a writeNote-shaped note", () => {
    const data = {
      id: "mem_abc",
      scope: "agent",
      project: "alpha",
      agent: "coder",
      title: "Alpha pitfall",
      tags: ["pitfall", "vite"],
      source: "agent:coder",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    };
    const raw = stringifyFrontmatter("Body line one.\n\nBody line two.", data);
    const parsed = parseFrontmatter(raw);
    expect(parsed.data).toEqual(data);
    expect(parsed.content.trim()).toBe("Body line one.\n\nBody line two.");
  });

  it("no frontmatter block ⇒ empty data, full raw as content", () => {
    const parsed = parseFrontmatter("# Just a heading\nplain note");
    expect(parsed.data).toEqual({});
    expect(parsed.content).toBe("# Just a heading\nplain note");
  });

  it("parses gray-matter-written files (legacy notes) including CRLF", () => {
    const legacy = "---\ntitle: Old note\ntags:\n  - a\n---\nold body\n";
    expect(parseFrontmatter(legacy)).toEqual({
      data: { title: "Old note", tags: ["a"] },
      content: "old body\n",
    });
    const crlf = "---\r\ntitle: Win note\r\n---\r\nwin body";
    const parsed = parseFrontmatter(crlf);
    expect(parsed.data).toEqual({ title: "Win note" });
    expect(parsed.content).toBe("win body");
  });

  it("empty frontmatter block ⇒ empty data", () => {
    expect(parseFrontmatter("---\n---\nbody")).toEqual({ data: {}, content: "body" });
  });

  it("malformed YAML throws (scanVault catches and indexes as plain content)", () => {
    expect(() => parseFrontmatter("---\n{unclosed\n---\nbody")).toThrow();
  });

  it("stringify always terminates the body with a newline", () => {
    expect(stringifyFrontmatter("x", { a: 1 }).endsWith("x\n")).toBe(true);
    expect(stringifyFrontmatter("x\n", { a: 1 }).endsWith("x\n")).toBe(true);
  });
});
