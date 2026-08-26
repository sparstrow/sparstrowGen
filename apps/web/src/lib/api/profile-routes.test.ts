import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchRoute } from "./router";
import { parseProfilePatch } from "./handlers/profile";
import "./handlers";

/**
 * M9's `/me` handler.
 *
 * `PATCH /me` moved to `app/settings/actions.ts`'s `updateProfileAction`
 * (`T-WA-08`) — the end-to-end "which store each field lands in" tests moved
 * with it to `app/settings/actions.test.ts`. What's left here is
 * `parseProfilePatch`'s own pure-function coverage (still exported from this
 * module, re-exported from `lib/patch-validation.ts`) and the surviving
 * `GET /me` route.
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

function fakeSupabase(row: Row | null, opts: { user?: boolean } = {}) {
  function chain() {
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      async maybeSingle() {
        return { data: row, error: null };
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
    },
  };

  return { supabase: supabase as never };
}

async function call(body: unknown, row: Row | null, opts: { user?: boolean } = {}) {
  const matched = matchRoute("GET", "/me");
  if (!matched) throw new Error("GET /me is not registered");
  const { supabase } = fakeSupabase(row, opts);
  const res = await matched.route.handler({
    supabase,
    workspaceId: "ws_1",
    params: {},
    searchParams: new URLSearchParams(),
    body,
  });
  return { status: res.status, json: await res.json() };
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
  it("still serves GET /me", () => {
    expect(matchRoute("GET", "/me")).not.toBeNull();
  });

  it("no longer serves PATCH /me — moved to updateProfileAction", () => {
    expect(matchRoute("PATCH", "/me")).toBeNull();
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

describe("GET /me refusals", () => {
  it("401s an unauthenticated read", async () => {
    const { status } = await call(undefined, freshRow(), { user: false });
    expect(status).toBe(401);
  });
});

describe("GET /me", () => {
  it("returns the row the form edits, camel-cased, without the role", async () => {
    const { status, json } = await call(undefined, freshRow());
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
