import { describe, expect, it, vi } from "vitest";
import type { ProjectProvision } from "@sparstrow/shared";
import { actionContext } from "@web/lib/action-result";
import { provisionProjectAction } from "./actions";

/**
 * BUG-2026-08-24-project-provision-always-400s.
 *
 * Moved from `lib/api/projects-routes.test.ts` when `T-WA-02` converted
 * `POST /projects/provision` into `provisionProjectAction`. Same five
 * assertions, adapted for two things the action does that the deleted route
 * wrapper used to do for it: the insert payload is snake_case (`toSnake` runs
 * *inside* the action now, since there is no `parseBody` around a Server
 * Action), and auth/workspace resolution goes through `actionContext()` —
 * mocked here so these tests isolate the insert logic exactly as the
 * original route test isolated the handler from real auth.
 */

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

// `revalidatePath` needs Next's request-scoped static generation store, which
// only exists inside a real request lifecycle. These tests call the action
// directly, outside that lifecycle — same reason `actionContext` is mocked
// above — so this is a no-op stand-in, not a claim that revalidation works.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;

function fakeSupabase(opts: { collideOnce?: boolean } = {}) {
  const inserted: Row[] = [];
  let attempt = 0;

  function insertChain() {
    let row: Row | null = null;
    const self = {
      insert(payload: Row) {
        row = payload;
        inserted.push(payload);
        return self;
      },
      select: () => self,
      async single() {
        attempt += 1;
        if (opts.collideOnce && attempt === 1) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        return {
          data: { ...row, created_at: "2026-08-24T00:00:00Z", updated_at: "2026-08-24T00:00:00Z" },
          error: null,
        };
      },
    };
    return self;
  }

  const supabase = {
    from(table: string) {
      if (table === "projects") return insertChain();
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  };

  return { supabase: supabase as never, inserted };
}

async function provision(body: Record<string, unknown>, opts: Parameters<typeof fakeSupabase>[0] = {}) {
  const { supabase, inserted } = fakeSupabase(opts);
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
  const result = await provisionProjectAction(body as ProjectProvision);
  return { result, inserted };
}

describe("provisionProjectAction", () => {
  it("succeeds on a typical scratch-mode payload", async () => {
    const { result } = await provision({
      name: "VR Verification Project",
      description: "",
      mode: "scratch",
      rootDir: "/home/me/vr-verification-project",
      gitInit: true,
      isSandbox: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe("VR Verification Project");
  });

  it("never sends mode/gitInit/gitUrl/rootDir to the insert — none are real columns", async () => {
    const { inserted } = await provision({
      name: "Import Me",
      description: "",
      mode: "clone",
      rootDir: "/home/me/import-me",
      gitUrl: "https://github.com/example/repo",
      gitInit: false,
      isSandbox: true,
    });
    const payload = inserted[0]!;
    expect(payload.mode).toBeUndefined();
    expect(payload.root_dir).toBeUndefined();
    expect(payload.git_url).toBeUndefined();
    expect(payload.git_init).toBeUndefined();
    // is_sandbox *is* a real column (packages/shared/src/db/schema.ts) and
    // must survive — the fix strips known-bad fields, not everything.
    expect(payload.is_sandbox).toBe(true);
  });

  it("derives a slug from name, matching the sibling POST /projects fix", async () => {
    const { inserted } = await provision({ name: "My Cool App", description: "", mode: "scratch", rootDir: "/x" });
    expect(inserted[0]!.slug).toBe("my-cool-app");
  });

  it("retries with a collision suffix on a 23505 and still succeeds", async () => {
    const { result, inserted } = await provision(
      { name: "Duplicate Name", description: "", mode: "scratch", rootDir: "/x" },
      { collideOnce: true },
    );
    expect(result.ok).toBe(true);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]!.slug).toBe("duplicate-name");
    expect(inserted[1]!.slug).not.toBe("duplicate-name");
    expect(inserted[1]!.slug).toMatch(/^duplicate-name-/);
  });

  it("uses an explicit slug when the client sends one", async () => {
    const { inserted } = await provision({
      name: "Anything",
      slug: "custom-slug",
      description: "",
      mode: "scratch",
      rootDir: "/x",
    });
    expect(inserted[0]!.slug).toBe("custom-slug");
  });
});
