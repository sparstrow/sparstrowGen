import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchRoute } from "./router";
import { parseWorkspacePatch, slugify, withCollisionSuffix } from "./handlers/workspace";
import "./handlers";

/**
 * M9's `/workspace` handler.
 *
 * `PATCH /workspace` moved to `app/settings/actions.ts`'s
 * `updateWorkspaceAction` (`T-WA-08`) — the end-to-end slug-freeze tests moved
 * with it to `app/settings/actions.test.ts`. What's left here is
 * `parseWorkspacePatch`/`slugify`/`withCollisionSuffix`'s own pure-function
 * coverage (still exported from this module) and the surviving `GET
 * /workspace` route.
 */

const SUPABASE_URL = "https://example.supabase.co";
const OWN_IMAGE = `${SUPABASE_URL}/storage/v1/object/public/public-images/workspace-logos/ws_1/a.png`;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── dispatch ────────────────────────────────────────────────────────────────

describe("dispatch", () => {
  it("still serves GET /workspace", () => {
    expect(matchRoute("GET", "/workspace")).not.toBeNull();
  });

  it("no longer serves PATCH /workspace — moved to updateWorkspaceAction", () => {
    expect(matchRoute("PATCH", "/workspace")).toBeNull();
  });

  it("does not collide with the plural form nobody built", () => {
    // M9 decision 1: singular and id-less. If /workspaces/:id ever appears,
    // it is a second path to a decision getActiveWorkspaceId already made.
    expect(matchRoute("GET", "/workspaces/ws_1")).toBeNull();
  });
});

// ─── what a body may contain ─────────────────────────────────────────────────

describe("parseWorkspacePatch", () => {
  it("accepts each editable field on its own", () => {
    for (const [key, value] of [
      ["name", "Renin"],
      ["description", "Where the doors get made"],
      ["context", "A manufacturer of interior doors."],
      ["logo_url", OWN_IMAGE],
    ] as const) {
      const parsed = parseWorkspacePatch({ [key]: value });
      expect(parsed, key).toEqual({ patch: { [key]: value } });
    }
  });

  it("writes only the keys actually present", () => {
    // A form that saves one field sends one field. Building a fixed shape with
    // undefined holes would blank the other three.
    const parsed = parseWorkspacePatch({ context: "just this" });
    expect(parsed).toEqual({ patch: { context: "just this" } });
  });

  it("accepts all four at once", () => {
    const parsed = parseWorkspacePatch({
      name: "Renin",
      description: "d",
      context: "c",
      logo_url: null,
    });
    expect(parsed).toEqual({
      patch: { name: "Renin", description: "d", context: "c", logo_url: null },
    });
  });

  it("accepts an empty name", () => {
    // The decision most likely to be reversed by reflex. T-M9-01 makes '' the
    // starting state, so refusing it would mean refusing to write the value the
    // database already holds.
    expect(parseWorkspacePatch({ name: "" })).toEqual({ patch: { name: "" } });
    expect(parseWorkspacePatch({ name: "   " })).toEqual({ patch: { name: "" } });
  });

  it("trims before measuring", () => {
    expect(parseWorkspacePatch({ name: `  ${"a".repeat(60)}  ` })).toEqual({
      patch: { name: "a".repeat(60) },
    });
  });

  it("rejects each field one character over its limit, naming the limit", () => {
    for (const [key, limit] of [
      ["name", 60],
      ["description", 280],
      ["context", 4000],
    ] as const) {
      const parsed = parseWorkspacePatch({ [key]: "a".repeat(limit + 1) });
      expect(parsed, key).toHaveProperty("error");
      const { error } = parsed as { error: string };
      expect(error, key).toContain(String(limit));
      expect(error, key).toContain(key);
    }
  });

  it("accepts each field exactly at its limit", () => {
    expect(parseWorkspacePatch({ name: "a".repeat(60) })).toHaveProperty("patch");
    expect(parseWorkspacePatch({ description: "a".repeat(280) })).toHaveProperty("patch");
    expect(parseWorkspacePatch({ context: "a".repeat(4000) })).toHaveProperty("patch");
  });

  it("ignores slug rather than rejecting it", () => {
    // GET returns the slug, so a client handing the whole object back is normal
    // and 400-ing it would be hostile.
    expect(parseWorkspacePatch({ slug: "anything", name: "Renin" })).toEqual({
      patch: { name: "Renin" },
    });
  });

  it("rejects fields that are not editable, naming them", () => {
    for (const key of ["owner_id", "id", "created_at", "updated_at", "nonsense"]) {
      const parsed = parseWorkspacePatch({ [key]: "x" });
      expect(parsed, key).toHaveProperty("error");
      expect((parsed as { error: string }).error, key).toContain(key);
    }
  });

  it("refuses a logo_url this app did not produce", () => {
    // A stored tracking pixel: every member of the workspace renders it.
    for (const bad of [
      "https://evil.example/x.png",
      // Right path, wrong host.
      "https://evil.supabase.co/storage/v1/object/public/public-images/a.png",
      // Right host, wrong bucket -- which may not carry the write policies.
      `${SUPABASE_URL}/storage/v1/object/public/other-bucket/a.png`,
      // Right host and bucket, but a scheme downgrade.
      OWN_IMAGE.replace("https://", "http://"),
      "javascript:alert(1)",
      "/storage/v1/object/public/public-images/a.png",
      "",
    ]) {
      const parsed = parseWorkspacePatch({ logo_url: bad });
      expect(parsed, bad).toHaveProperty("error");
    }
  });

  it("accepts null to clear the logo", () => {
    expect(parseWorkspacePatch({ logo_url: null })).toEqual({ patch: { logo_url: null } });
  });

  it("rejects a non-string where a string belongs", () => {
    expect(parseWorkspacePatch({ name: 42 })).toHaveProperty("error");
    expect(parseWorkspacePatch({ name: null })).toHaveProperty("error");
  });

  it("rejects a body that is not an object", () => {
    for (const body of [null, "name", 7, ["name"]]) {
      expect(parseWorkspacePatch(body)).toHaveProperty("error");
    }
  });
});

// ─── the slug ────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and collapses non-alphanumerics", () => {
    expect(slugify("Renin Doors")).toBe("renin-doors");
    expect(slugify("R&D   /  Ops")).toBe("r-d-ops");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  ...Renin!!  ")).toBe("renin");
  });

  it("truncates to 40 characters without leaving a trailing dash", () => {
    const out = slugify(`${"a".repeat(38)} bcdefgh`);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("-")).toBe(false);
  });

  it("returns empty for a name that carries no slug material", () => {
    // Punctuation only, or a non-Latin script. The caller must keep the
    // existing slug rather than write '' into a not-null unique column.
    expect(slugify("!!!")).toBe("");
    expect(slugify("日本語")).toBe("");
  });
});

describe("withCollisionSuffix", () => {
  it("stays within the 40-character budget and changes the value", () => {
    const base = "a".repeat(40);
    const out = withCollisionSuffix(base);
    expect(out.length).toBe(40);
    expect(out).not.toBe(base);
    expect(out).toMatch(/^a{35}-[0-9a-f]{4}$/);
  });
});
