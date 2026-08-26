import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { updateProfileAction, updateWorkspaceAction } from "./actions";

/**
 * Ports `profile-routes.test.ts`'s "PATCH /me writes the right field to the
 * right store" / "PATCH /me refusals" and `workspace-routes.test.ts`'s
 * "PATCH /workspace" describe blocks onto the actions that replace those
 * routes (`T-WA-08`) — same fixtures, same assertions. `parseProfilePatch` /
 * `parseWorkspacePatch` / `slugify` / `withCollisionSuffix` keep their own
 * pure-function tests where they already lived; only the end-to-end route
 * tests moved, because the routes they exercised no longer exist.
 */

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const SUPABASE_URL = "https://example.supabase.co";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type Row = Record<string, unknown>;

// ─── updateProfileAction ────────────────────────────────────────────────────

const OWN_AVATAR = `${SUPABASE_URL}/storage/v1/object/public/public-images/avatars/u_1/a.png`;

function mockProfileCtx(
  row: Row | null,
  opts: { user?: boolean; authFails?: boolean } = {},
) {
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

  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
  return { metadataWrites, rowWrites };
}

/** A user as `bootstrap_workspace` leaves them after T-M9-01: no name. */
const freshProfileRow = (): Row => ({
  id: "u_1",
  email: "sriharicoder@example.com",
  name: "",
  avatar_url: null,
  bio: "",
});

describe("updateProfileAction writes the right field to the right store", () => {
  it("writes the name to both stores, under both metadata keys", async () => {
    const { metadataWrites, rowWrites } = mockProfileCtx(freshProfileRow());
    const result = await updateProfileAction({ name: "Sri Hari" });
    expect(result.ok).toBe(true);
    expect(metadataWrites).toEqual([{ full_name: "Sri Hari", name: "Sri Hari" }]);
    expect(rowWrites[0]).toMatchObject({ name: "Sri Hari" });
  });

  it("keeps bio out of auth metadata entirely", async () => {
    const { metadataWrites, rowWrites } = mockProfileCtx(freshProfileRow());
    await updateProfileAction({ bio: "Builds things." });
    expect(metadataWrites).toEqual([]);
    expect(rowWrites[0]).toMatchObject({ bio: "Builds things." });
  });

  it("writes the avatar to both stores", async () => {
    const { metadataWrites, rowWrites } = mockProfileCtx(freshProfileRow());
    await updateProfileAction({ avatarUrl: OWN_AVATAR });
    expect(metadataWrites).toEqual([{ avatar_url: OWN_AVATAR }]);
    expect(rowWrites[0]).toMatchObject({ avatar_url: OWN_AVATAR });
  });

  it("does not blank the other fields when only one is sent", async () => {
    const row = { ...freshProfileRow(), name: "Sri Hari", bio: "Existing bio." };
    const { rowWrites } = mockProfileCtx(row);
    await updateProfileAction({ bio: "New bio." });
    expect(rowWrites[0]).not.toHaveProperty("name");
    expect(row.name).toBe("Sri Hari");
  });

  it("stamps updated_at", async () => {
    const { rowWrites } = mockProfileCtx(freshProfileRow());
    await updateProfileAction({ bio: "b" });
    expect(rowWrites[0]).toHaveProperty("updated_at");
  });

  it("surfaces an auth failure instead of the row, and never writes the row", async () => {
    const row = freshProfileRow();
    mockProfileCtx(row, { authFails: true });
    const result = await updateProfileAction({ name: "Sri Hari" });
    expect(result.ok).toBe(false);
    expect(row.name).toBe("");
  });
});

describe("updateProfileAction refusals", () => {
  it("fails with no session", async () => {
    mockProfileCtx(freshProfileRow(), { user: false });
    const result = await updateProfileAction({ name: "x" });
    expect(result.ok).toBe(false);
  });

  it("fails an empty patch rather than reporting a successful no-op", async () => {
    mockProfileCtx(freshProfileRow());
    const result = await updateProfileAction({});
    expect(result.ok).toBe(false);
  });

  it("fails when the update matches no row", async () => {
    mockProfileCtx(null);
    const result = await updateProfileAction({ bio: "b" });
    expect(result.ok).toBe(false);
  });

  it("refuses an avatarUrl this app did not produce", async () => {
    mockProfileCtx(freshProfileRow());
    const result = await updateProfileAction({ avatarUrl: "https://evil.example/x.png" });
    expect(result.ok).toBe(false);
  });
});

// ─── updateWorkspaceAction ──────────────────────────────────────────────────

function mockWorkspaceCtx(row: Row | null, collidingSlugs: string[] = []) {
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

  vi.mocked(actionContext).mockResolvedValue({
    supabase: { from: () => chain() } as never,
    workspaceId: "ws_1",
  });
  return { updates };
}

/** A workspace as `bootstrap_workspace` leaves it: no name, generated slug. */
const freshWorkspaceRow = (): Row => ({
  id: "ws_1",
  name: "",
  slug: "personal-a1b2c3d4",
  description: "",
  context: "",
  logo_url: null,
  created_at: "2026-08-18T00:00:00Z",
});

describe("updateWorkspaceAction", () => {
  it("sets the slug when the workspace gains its first real name", async () => {
    const { updates } = mockWorkspaceCtx(freshWorkspaceRow());
    const result = await updateWorkspaceAction({ name: "Renin Doors" });
    expect(result.ok).toBe(true);
    expect(updates[0]).toMatchObject({ name: "Renin Doors", slug: "renin-doors" });
  });

  it("freezes the slug on every later rename", async () => {
    const row = freshWorkspaceRow();
    mockWorkspaceCtx(row);
    await updateWorkspaceAction({ name: "Renin Doors" });
    const { updates } = mockWorkspaceCtx(row);
    await updateWorkspaceAction({ name: "Renin Industries" });
    expect(updates[0]).not.toHaveProperty("slug");
    expect(row.slug).toBe("renin-doors");
  });

  it("does not touch a slug a human chose, even one starting with 'personal-'", async () => {
    const row = { ...freshWorkspaceRow(), slug: "personal-notes" };
    const { updates } = mockWorkspaceCtx(row);
    await updateWorkspaceAction({ name: "Renin" });
    expect(updates[0]).not.toHaveProperty("slug");
  });

  it("keeps the bootstrap slug when the name slugifies to nothing", async () => {
    const row = freshWorkspaceRow();
    const { updates } = mockWorkspaceCtx(row);
    const result = await updateWorkspaceAction({ name: "日本語" });
    expect(result.ok).toBe(true);
    expect(updates[0]).not.toHaveProperty("slug");
    expect(row.slug).toBe("personal-a1b2c3d4");
  });

  it("does not move the slug when the name is cleared", async () => {
    const { updates } = mockWorkspaceCtx(freshWorkspaceRow());
    await updateWorkspaceAction({ name: "" });
    expect(updates[0]).toEqual({ name: "" });
  });

  it("retries once with a suffix when the derived slug is taken", async () => {
    const { updates } = mockWorkspaceCtx(freshWorkspaceRow(), ["renin"]);
    const result = await updateWorkspaceAction({ name: "Renin" });
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(2);
    expect((updates[1] as Row).slug).toMatch(/^renin-[0-9a-f]{4}$/);
  });

  it("applies the name anyway when the slug cannot be made unique", async () => {
    const row = freshWorkspaceRow();
    const taken = [
      "renin",
      ...Array.from({ length: 65536 }, (_, i) => `renin-${i.toString(16).padStart(4, "0")}`),
    ];
    const { updates } = mockWorkspaceCtx(row, taken);
    const result = await updateWorkspaceAction({ name: "Renin" });
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(3);
    expect(updates[2]).not.toHaveProperty("slug");
    if (result.ok) expect(result.data.name).toBe("Renin");
    expect(row.slug).toBe("personal-a1b2c3d4");
  });

  it("fails an empty patch rather than reporting a successful no-op", async () => {
    mockWorkspaceCtx(freshWorkspaceRow());
    const result = await updateWorkspaceAction({});
    expect(result.ok).toBe(false);
  });

  it("fails a body carrying only ignored keys (slug alone is not an edit)", async () => {
    mockWorkspaceCtx(freshWorkspaceRow());
    const result = await updateWorkspaceAction({ slug: "x" } as never);
    expect(result.ok).toBe(false);
  });

  it("fails when the update matches no row", async () => {
    mockWorkspaceCtx(null);
    const result = await updateWorkspaceAction({ description: "d" });
    expect(result.ok).toBe(false);
  });

  it("refuses a logoUrl this app did not produce", async () => {
    mockWorkspaceCtx(freshWorkspaceRow());
    const result = await updateWorkspaceAction({ logoUrl: "https://evil.example/x.png" });
    expect(result.ok).toBe(false);
  });

  it("accepts null to clear the logo", async () => {
    const { updates } = mockWorkspaceCtx(freshWorkspaceRow());
    const result = await updateWorkspaceAction({ logoUrl: null });
    expect(result.ok).toBe(true);
    expect(updates[0]).toEqual({ logo_url: null });
  });
});
