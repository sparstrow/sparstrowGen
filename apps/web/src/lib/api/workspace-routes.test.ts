import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchRoute } from "./router";
import { parseWorkspacePatch, slugify, withCollisionSuffix } from "./handlers/workspace";
import "./handlers";

/**
 * M9's `/workspace` handler.
 *
 * Unlike `runtime-routes.test.ts`, this exercises handler *bodies* and not only
 * dispatch. It can, because the two things worth proving here are pure decisions
 * -- what a body is allowed to contain, and whether the slug moves -- and the
 * only Supabase surface they need is `.select().eq().maybeSingle()` and
 * `.update().eq().select().maybeSingle()`. A ten-line fake buys the slug-freeze
 * rule real coverage; that rule fires exactly once in a workspace's lifetime and
 * is then frozen forever, so a later edit does not repair getting it wrong.
 *
 * What is NOT proved here: RLS, cross-workspace denial, and the live round-trip.
 * Those need a real session and belong to T-M9-06.
 */

const SUPABASE_URL = "https://example.supabase.co";
const OWN_IMAGE = `${SUPABASE_URL}/storage/v1/object/public/public-images/workspace-logos/ws_1/a.png`;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── a Supabase stand-in, only as wide as these two handlers reach ───────────

type Row = Record<string, unknown>;

function fakeSupabase(row: Row | null, collidingSlugs: string[] = []) {
  const updates: Row[] = [];
  const taken = new Set(collidingSlugs);

  function chain() {
    let patch: Row | null = null;
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      update(next: Row) {
        patch = next;
        return self;
      },
      async maybeSingle() {
        if (patch === null) return { data: row, error: null };
        updates.push(patch);
        if (typeof patch.slug === "string" && taken.has(patch.slug)) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        if (row === null) return { data: null, error: null };
        Object.assign(row, patch);
        return { data: { ...row }, error: null };
      },
    };
    return self;
  }

  return { supabase: { from: () => chain() } as never, updates };
}

async function patchWorkspace(body: unknown, row: Row | null, collidingSlugs: string[] = []) {
  const matched = matchRoute("PATCH", "/workspace");
  if (!matched) throw new Error("PATCH /workspace is not registered");
  const { supabase, updates } = fakeSupabase(row, collidingSlugs);
  const res = await matched.route.handler({
    supabase,
    workspaceId: "ws_1",
    params: {},
    searchParams: new URLSearchParams(),
    body,
  });
  return { status: res.status, json: await res.json(), updates };
}

/** A workspace as `bootstrap_workspace` leaves it: no name, generated slug. */
const freshRow = (): Row => ({
  id: "ws_1",
  name: "",
  slug: "personal-a1b2c3d4",
  description: "",
  context: "",
  logo_url: null,
  created_at: "2026-08-18T00:00:00Z",
});

// ─── dispatch ────────────────────────────────────────────────────────────────

describe("dispatch", () => {
  it("registers GET and PATCH /workspace", () => {
    expect(matchRoute("GET", "/workspace")).not.toBeNull();
    expect(matchRoute("PATCH", "/workspace")).not.toBeNull();
  });

  it("is not swallowed by a stub", () => {
    // M2 defect 5: a real handler shadowed by its own 501 because it was
    // imported after ./stubs. `handlers/index.ts` imports ./workspace before
    // it; this is what notices if that ordering is ever "tidied".
    expect(matchRoute("PATCH", "/workspace")?.route.pattern).toBe("/workspace");
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

// ─── PATCH, end to end against a fake row ────────────────────────────────────

describe("PATCH /workspace", () => {
  it("sets the slug when the workspace gains its first real name", () => {
    // The one moment the slug is allowed to move.
    return patchWorkspace({ name: "Renin Doors" }, freshRow()).then(({ status, updates }) => {
      expect(status).toBe(200);
      expect(updates[0]).toMatchObject({ name: "Renin Doors", slug: "renin-doors" });
    });
  });

  it("freezes the slug on every later rename", async () => {
    // FR-022. The slug may already be in a link someone saved; a name is
    // renamed far more casually than an address should move.
    const row = freshRow();
    await patchWorkspace({ name: "Renin Doors" }, row);
    const second = await patchWorkspace({ name: "Renin Industries" }, row);
    expect(second.updates[0]).not.toHaveProperty("slug");
    expect(row.slug).toBe("renin-doors");
  });

  it("does not touch a slug a human chose, even one starting with 'personal-'", async () => {
    // A loose /^personal-/ test would rewrite this. The anchored pattern is
    // `personal-` + exactly 8 lowercase hex, which is what bootstrap writes.
    const row = { ...freshRow(), slug: "personal-notes" };
    const { updates } = await patchWorkspace({ name: "Renin" }, row);
    expect(updates[0]).not.toHaveProperty("slug");
  });

  it("keeps the bootstrap slug when the name slugifies to nothing", async () => {
    const row = freshRow();
    const { status, updates } = await patchWorkspace({ name: "日本語" }, row);
    expect(status).toBe(200);
    expect(updates[0]).not.toHaveProperty("slug");
    expect(row.slug).toBe("personal-a1b2c3d4");
  });

  it("does not move the slug when the name is cleared", async () => {
    const row = freshRow();
    const { updates } = await patchWorkspace({ name: "" }, row);
    expect(updates[0]).toEqual({ name: "" });
  });

  it("retries once with a suffix when the derived slug is taken", async () => {
    const row = freshRow();
    const { status, updates } = await patchWorkspace({ name: "Renin" }, row, ["renin"]);
    expect(status).toBe(200);
    expect(updates).toHaveLength(2);
    expect(updates[1].slug).toMatch(/^renin-[0-9a-f]{4}$/);
  });

  it("applies the name anyway when the slug cannot be made unique", async () => {
    // The name is what the owner asked for. Failing their edit over a machine
    // identifier they cannot see would be incomprehensible from the outside.
    const row = freshRow();
    const taken = ["renin", ...Array.from({ length: 65536 }, (_, i) => `renin-${i.toString(16).padStart(4, "0")}`)];
    const { status, updates, json } = await patchWorkspace({ name: "Renin" }, row, taken);
    expect(status).toBe(200);
    expect(updates).toHaveLength(3);
    expect(updates[2]).not.toHaveProperty("slug");
    expect(json.name).toBe("Renin");
    expect(row.slug).toBe("personal-a1b2c3d4");
  });

  it("400s an empty patch rather than reporting a successful no-op", async () => {
    const { status } = await patchWorkspace({}, freshRow());
    expect(status).toBe(400);
  });

  it("400s a body carrying only ignored keys", async () => {
    const { status } = await patchWorkspace({ slug: "x" }, freshRow());
    expect(status).toBe(400);
  });

  it("404s when the update matches no row", async () => {
    // The false-success M2 found across eleven handlers: a filtered update that
    // affects zero rows otherwise reports 200.
    const { status } = await patchWorkspace({ description: "d" }, null);
    expect(status).toBe(404);
  });
});
