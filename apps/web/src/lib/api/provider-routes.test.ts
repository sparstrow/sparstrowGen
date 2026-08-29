import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";
import "./handlers";

/**
 * T-CS4-01. `GET /providers/model-cache` reads `provider_model_cache`
 * (T-CS3-02/03) -- a real, cloud-side capability, unlike the `/providers`
 * and `/providers/(.*)` wildcard in `handlers/stubs.ts`, which is genuinely
 * host-local ("Provider management"). `router.ts`'s own comment warns this
 * exact shape of bug already happened once (`POST /goals`, M2 defect 5): a
 * real handler and a wildcard stub at the same specificity, the wrong one
 * winning depending on import order. This test pins that the literal route
 * wins, not just that a handler exists.
 */

type Row = Record<string, unknown>;

function fakeTable(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  const builder: any = {
    select: () => builder,
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    async maybeSingle() {
      const match = rows.find((r) => filters.every(([k, v]) => r[k] === v));
      return { data: match ?? null, error: null };
    },
  };
  return builder;
}

function fakeSupabase(rows: Row[]) {
  return {
    from(table: string) {
      if (table === "provider_model_cache") return fakeTable(rows);
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  } as never;
}

async function callRoute(path: string, rows: Row[]) {
  const [pathname, query] = path.split("?");
  const matched = matchRoute("GET", pathname);
  if (!matched) throw new Error(`GET ${pathname} is not registered`);
  const res = await matched.route.handler({
    supabase: fakeSupabase(rows),
    workspaceId: "ws_1",
    params: matched.params,
    searchParams: new URLSearchParams(query ?? ""),
    body: {},
  });
  return { status: res.status, json: await res.json() };
}

const CACHED_ROW: Row = {
  workspace_id: "ws_1",
  provider: "antigravity",
  models: ["Gemini 3.7 Flash (High)", "Gemini 3.6 Flash (High)"],
  live: true,
  detail: null,
  checked_at: "2026-08-28T00:00:00Z",
};

describe("GET /providers/model-cache", () => {
  it("is not shadowed by the /providers/(.*) host-local stub", async () => {
    const { status, json } = await callRoute("/providers/model-cache?provider=antigravity", [CACHED_ROW]);
    // The stub returns 501 with `{ error, reason: undefined }` shaped
    // differently and always fails -- any 501 here means the wildcard won.
    expect(status).not.toBe(501);
    expect(json.provider).toBe("antigravity");
  });

  it("returns the cached row scoped to workspace and provider", async () => {
    const { json } = await callRoute("/providers/model-cache?provider=antigravity", [
      CACHED_ROW,
      { ...CACHED_ROW, workspace_id: "ws_2", models: ["other-workspace-model"] },
    ]);
    expect(json.models).toEqual(["Gemini 3.7 Flash (High)", "Gemini 3.6 Flash (High)"]);
  });

  it("returns null when no discovery has ever landed for this provider", async () => {
    const { json } = await callRoute("/providers/model-cache?provider=antigravity", []);
    expect(json).toBeNull();
  });

  it("returns null without querying when no provider is given", async () => {
    const { json } = await callRoute("/providers/model-cache", [CACHED_ROW]);
    expect(json).toBeNull();
  });
});
