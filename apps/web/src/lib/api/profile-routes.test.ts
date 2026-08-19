import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchRoute } from "./router";
import { parseProfilePatch } from "./handlers/profile";
import "./handlers";

/**
 * M9's `/me` handler.
 *
 * Exercises handler bodies, not only dispatch — see the note in
 * `workspace-routes.test.ts` for why that is worth a fake here. The specific
 * thing this file exists to pin is **which store each field lands in**:
 * `bio` must never reach auth metadata, and `name` must reach both stores under
 * both metadata keys. Neither is visible from a 200, and getting either wrong
 * produces a change that works everywhere except the sidebar, or everywhere
 * except the rest of the schema.
 */

const SUPABASE_URL = "https://example.supabase.co";
const OWN_IMAGE = `${SUPABASE_URL}/storage/v1/object/public/public-images/avatars/u_1/a.png`;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type Row = Record<string, unknown>;

function fakeSupabase(row: Row | null, opts: { user?: boolean; authFails?: boolean } = {}) {
  const metadataWrites: Row[] = [];
  const rowWrites: Row[] = [];

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
        rowWrites.push(patch);
        if (row === null) return { data: null, error: null };
        Object.assign(row, patch);
        return { data: { ...row }, error: null };
      },
    };
    return self;
  }

  const supabase = {
    from: () => chain(),
    auth: {
      async getUser() {
        return { data: { user: opts.user === false ? null : { id: "u_1" } } };
      },
      async updateUser({ data }: { data: Row }) {
        metadataWrites.push(data);
        return opts.authFails ? { error: { message: "gotrue is down" } } : { error: null };
      },
    },
  };

  return { supabase: supabase as never, metadataWrites, rowWrites };
}

async function call(
  method: "GET" | "PATCH",
  body: unknown,
  row: Row | null,
  opts: { user?: boolean; authFails?: boolean } = {},
) {
  const matched = matchRoute(method, "/me");
  if (!matched) throw new Error(`${method} /me is not registered`);
  const { supabase, metadataWrites, rowWrites } = fakeSupabase(row, opts);
  const res = await matched.route.handler({
    supabase,
    workspaceId: "ws_1",
    params: {},
    searchParams: new URLSearchParams(),
    body,
  });
  return { status: res.status, json: await res.json(), metadataWrites, rowWrites };
}

/** A user as `bootstrap_workspace` leaves them after T-M9-01: no name. */
const freshRow = (): Row => ({
  id: "u_1",
  email: "sriharicoder@example.com",
  name: "",
  avatar_url: null,
  bio: "",
});

// ─── dispatch ────────────────────────────────────────────────────────────────

describe("dispatch", () => {
  it("registers GET and PATCH /me", () => {
    expect(matchRoute("GET", "/me")).not.toBeNull();
    expect(matchRoute("PATCH", "/me")).not.toBeNull();
  });

  it("is not swallowed by a stub", () => {
    expect(matchRoute("PATCH", "/me")?.route.pattern).toBe("/me");
  });
});

// ─── what a body may contain ─────────────────────────────────────────────────

describe("parseProfilePatch", () => {
  it("accepts each editable field on its own", () => {
    for (const [key, value] of [
      ["name", "Sri Hari"],
      ["bio", "Builds agent harnesses."],
      ["avatar_url", OWN_IMAGE],
    ] as const) {
      expect(parseProfilePatch({ [key]: value }), key).toEqual({ patch: { [key]: value } });
    }
  });

  it("accepts all three at once", () => {
    expect(parseProfilePatch({ name: "Sri Hari", bio: "b", avatar_url: null })).toEqual({
      patch: { name: "Sri Hari", bio: "b", avatar_url: null },
    });
  });

  it("accepts an empty name", () => {
    expect(parseProfilePatch({ name: "" })).toEqual({ patch: { name: "" } });
    expect(parseProfilePatch({ name: "  " })).toEqual({ patch: { name: "" } });
  });

  it("rejects a name over 60 and a bio over 2000, naming the limit", () => {
    for (const [key, limit] of [
      ["name", 60],
      ["bio", 2000],
    ] as const) {
      const parsed = parseProfilePatch({ [key]: "a".repeat(limit + 1) });
      expect(parsed, key).toHaveProperty("error");
      expect((parsed as { error: string }).error, key).toContain(String(limit));
    }
  });

  it("accepts each field exactly at its limit", () => {
    expect(parseProfilePatch({ name: "a".repeat(60) })).toHaveProperty("patch");
    expect(parseProfilePatch({ bio: "a".repeat(2000) })).toHaveProperty("patch");
  });

  it("refuses email, password, role and id with a reason, not a generic message", () => {
    // role especially: authorization data must never be settable by its subject.
    const role = parseProfilePatch({ role: "admin" }) as { error: string };
    expect(role.error).toContain("role");
    expect(role.error).toMatch(/authorization/i);

    for (const key of ["email", "password", "id"]) {
      const parsed = parseProfilePatch({ [key]: "x" });
      expect(parsed, key).toHaveProperty("error");
      expect((parsed as { error: string }).error, key).toContain(key);
    }
  });

  it("refuses an avatar_url this app did not produce", () => {
    for (const bad of [
      "https://evil.example/x.png",
      `${SUPABASE_URL}/storage/v1/object/public/other-bucket/a.png`,
      OWN_IMAGE.replace("https://", "http://"),
      "javascript:alert(1)",
      "",
    ]) {
      expect(parseProfilePatch({ avatar_url: bad }), bad).toHaveProperty("error");
    }
  });

  it("accepts null to clear the avatar", () => {
    expect(parseProfilePatch({ avatar_url: null })).toEqual({ patch: { avatar_url: null } });
  });

  it("rejects a body that is not an object", () => {
    for (const body of [null, "name", 7, ["name"]]) {
      expect(parseProfilePatch(body)).toHaveProperty("error");
    }
  });
});

// ─── which store each field lands in ─────────────────────────────────────────

describe("PATCH /me writes the right field to the right store", () => {
  it("writes the name to both stores, under both metadata keys", async () => {
    // bootstrap_workspace reads full_name first and name second, so writing
    // both is what makes a future bootstrap find the chosen name.
    const { status, metadataWrites, rowWrites } = await call("PATCH", { name: "Sri Hari" }, freshRow());
    expect(status).toBe(200);
    expect(metadataWrites).toEqual([{ full_name: "Sri Hari", name: "Sri Hari" }]);
    expect(rowWrites[0]).toMatchObject({ name: "Sri Hari" });
  });

  it("keeps bio out of auth metadata entirely", async () => {
    // Plan decision 9. The shell never renders it, and it would ride along on
    // every request in the JWT.
    const { metadataWrites, rowWrites } = await call("PATCH", { bio: "Builds things." }, freshRow());
    expect(metadataWrites).toEqual([]);
    expect(rowWrites[0]).toMatchObject({ bio: "Builds things." });
  });

  it("writes the avatar to both stores", async () => {
    const { metadataWrites, rowWrites } = await call("PATCH", { avatar_url: OWN_IMAGE }, freshRow());
    expect(metadataWrites).toEqual([{ avatar_url: OWN_IMAGE }]);
    expect(rowWrites[0]).toMatchObject({ avatar_url: OWN_IMAGE });
  });

  it("does not blank the other fields when only one is sent", async () => {
    const row = { ...freshRow(), name: "Sri Hari", bio: "Existing bio." };
    const { rowWrites } = await call("PATCH", { bio: "New bio." }, row);
    expect(rowWrites[0]).not.toHaveProperty("name");
    expect(row.name).toBe("Sri Hari");
  });

  it("stamps updated_at", async () => {
    const { rowWrites } = await call("PATCH", { bio: "b" }, freshRow());
    expect(rowWrites[0]).toHaveProperty("updated_at");
  });

  it("writes auth before the row, and surfaces an auth failure instead of the row", async () => {
    // Reversed, a failing auth update after a successful row update would leave
    // the shell showing the old value with no error at all.
    const row = freshRow();
    await expect(call("PATCH", { name: "Sri Hari" }, row, { authFails: true })).rejects.toBeTruthy();
    expect(row.name).toBe("");
  });
});

describe("PATCH /me refusals", () => {
  it("401s with no session", async () => {
    const { status } = await call("PATCH", { name: "x" }, freshRow(), { user: false });
    expect(status).toBe(401);
  });

  it("401s an unauthenticated read too", async () => {
    const { status } = await call("GET", undefined, freshRow(), { user: false });
    expect(status).toBe(401);
  });

  it("400s an empty patch rather than reporting a successful no-op", async () => {
    const { status } = await call("PATCH", {}, freshRow());
    expect(status).toBe(400);
  });

  it("404s when the update matches no row", async () => {
    const { status } = await call("PATCH", { bio: "b" }, null);
    expect(status).toBe(404);
  });
});

describe("GET /me", () => {
  it("returns the row the form edits, camel-cased, without the role", async () => {
    const { status, json } = await call("GET", undefined, freshRow());
    expect(status).toBe(200);
    expect(json).toEqual({
      id: "u_1",
      email: "sriharicoder@example.com",
      name: "",
      avatarUrl: null,
      bio: "",
    });
    expect(json).not.toHaveProperty("role");
  });
});
