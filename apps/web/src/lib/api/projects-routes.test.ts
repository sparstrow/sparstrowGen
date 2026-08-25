import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";
import "./handlers";

/**
 * BUG-2026-08-24-project-provision-always-400s.
 *
 * `POST /projects/provision` spread the raw client body (which includes
 * `mode`, `gitInit`, `gitUrl` — none of them real columns on `projects`)
 * straight into the insert, so PostgREST rejected it before anything was
 * written. It also never generated a `slug`, the exact NOT-NULL gap
 * `BUG-2026-08-22-team-create-500-missing-slug` fixed on the sibling
 * `POST /projects` handler but not on this one. These tests pin both fixes
 * on the actual route, against a fake insert chain, rather than trusting
 * that the sibling handler's coverage generalizes.
 */

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
        return { data: { ...row, created_at: "2026-08-24T00:00:00Z", updated_at: "2026-08-24T00:00:00Z" }, error: null };
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

async function provision(body: unknown, opts: Parameters<typeof fakeSupabase>[0] = {}) {
  const matched = matchRoute("POST", "/projects/provision");
  if (!matched) throw new Error("POST /projects/provision is not registered");
  const { supabase, inserted } = fakeSupabase(opts);
  const res = await matched.route.handler({
    supabase,
    workspaceId: "ws_1",
    params: {},
    searchParams: new URLSearchParams(),
    body,
  });
  return { status: res.status, json: await res.json(), inserted };
}

describe("POST /projects/provision", () => {
  it("succeeds on a typical scratch-mode payload", async () => {
    const { status, json } = await provision({
      name: "VR Verification Project",
      description: "",
      mode: "scratch",
      rootDir: "/home/me/vr-verification-project",
      gitInit: true,
      isSandbox: false,
    });
    expect(status).toBe(200);
    expect(json.name).toBe("VR Verification Project");
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
    expect(payload.rootDir).toBeUndefined();
    expect(payload.root_dir).toBeUndefined();
    expect(payload.gitUrl).toBeUndefined();
    expect(payload.git_url).toBeUndefined();
    expect(payload.gitInit).toBeUndefined();
    expect(payload.git_init).toBeUndefined();
    // isSandbox *is* a real column (packages/shared/src/db/schema.ts) and
    // must survive — the fix strips known-bad fields, not everything.
    expect(payload.isSandbox).toBe(true);
  });

  it("derives a slug from name, matching the sibling POST /projects fix", async () => {
    const { inserted } = await provision({ name: "My Cool App", mode: "scratch", rootDir: "/x" });
    expect(inserted[0]!.slug).toBe("my-cool-app");
  });

  it("retries with a collision suffix on a 23505 and still succeeds", async () => {
    const { status, inserted } = await provision(
      { name: "Duplicate Name", mode: "scratch", rootDir: "/x" },
      { collideOnce: true },
    );
    expect(status).toBe(200);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]!.slug).toBe("duplicate-name");
    expect(inserted[1]!.slug).not.toBe("duplicate-name");
    expect(inserted[1]!.slug).toMatch(/^duplicate-name-/);
  });

  it("uses an explicit slug when the client sends one", async () => {
    const { inserted } = await provision({ name: "Anything", slug: "custom-slug", mode: "scratch", rootDir: "/x" });
    expect(inserted[0]!.slug).toBe("custom-slug");
  });
});
