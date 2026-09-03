import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app";
import { bearerFrom } from "../auth/supabase";
import type { AuthProvider, AuthResult } from "../auth/provider";
import { registerRoute, ok } from "../routes/index";
import type { ServerConfig } from "./config";

/**
 * The Fastify host, exercised through real HTTP (`app.inject`) with a stub
 * `AuthProvider`.
 *
 * What this is actually asserting is the **boundary**, not the routes — the 71
 * handlers already have their own coverage and did not change when they moved.
 * What is new and therefore worth proving is the four things the host decides:
 * who you are, which workspace you are in, whether a forged workspace header is
 * believed, and whether a handler's `Response` survives the trip onto a Fastify
 * reply intact.
 */

const CONFIG: ServerConfig = {
  host: "127.0.0.1",
  port: 8080,
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseAnonKey: "anon-key",
  // Null on purpose: these tests use a stub AuthProvider, so nothing here
  // should be able to reach a service role or mint a token even by accident.
  supabaseServiceRoleKey: null,
  supabaseJwtSecret: null,
  corsOrigins: ["http://localhost:3000"],
};

const USER = { id: "user-1", email: "agent@sparstrow.test" };

/** Accepts exactly one token; everything else is invalid. */
function stubAuth(supabase: unknown): AuthProvider {
  return {
    async verify(credential): Promise<AuthResult> {
      if (!credential) return { ok: false, failure: "missing" };
      if (credential !== "good-token") return { ok: false, failure: "invalid" };
      return { ok: true, user: USER, credential };
    },
    clientFor() {
      return supabase as never;
    },
  };
}

/**
 * Enough of a Supabase client for `getActiveWorkspaceId`: one membership, so
 * the single-workspace branch is taken and no cookie/header is consulted.
 */
function fakeSupabase(memberships: { workspace_id: string; workspaces: unknown }[]) {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: USER.id } }, error: null };
      },
    },
    from() {
      const self: Record<string, unknown> = {
        select: () => self,
        eq: async () => ({ data: memberships, error: null }),
      };
      return self;
    },
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  registerRoute({
    method: "GET",
    pattern: "/__probe",
    handler: (ctx) => ok({ workspace_id: ctx.workspaceId, q: ctx.searchParams.get("q") }),
  });

  app = await buildServer({
    config: CONFIG,
    auth: stubAuth(
      fakeSupabase([{ workspace_id: "ws-1", workspaces: { id: "ws-1", name: "Personal" } }]),
    ),
  });
});

afterAll(async () => {
  await app.close();
});

describe("bearerFrom", () => {
  it("accepts any case of the scheme, per HTTP", () => {
    expect(bearerFrom("Bearer abc")).toBe("abc");
    expect(bearerFrom("bearer abc")).toBe("abc");
    expect(bearerFrom("BEARER  abc  ")).toBe("abc");
  });

  it("returns null for anything that is not a bearer credential", () => {
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom("")).toBeNull();
    expect(bearerFrom("Basic abc")).toBeNull();
    expect(bearerFrom("Bearer")).toBeNull();
    expect(bearerFrom("Bearer ")).toBeNull();
  });
});

describe("the HTTP boundary", () => {
  it("serves /healthz without a credential", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: "sparstrow-server" });
  });

  it("refuses an unauthenticated request with JSON, not an HTML error page", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/__probe" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toEqual({ error: "not authenticated" });
  });

  it("refuses an invalid credential the same way as a missing one", async () => {
    // Deliberately indistinguishable: telling a caller that a token was
    // well-formed but rejected is a free oracle.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/__probe",
      headers: { authorization: "Bearer nope" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "not authenticated" });
  });

  it("builds a HandlerContext and returns the handler's Response verbatim", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/__probe?q=hello",
      headers: { authorization: "Bearer good-token" },
    });
    expect(res.statusCode).toBe(200);
    // camelCased on the way out by the registry's own `ok()`.
    expect(res.json()).toEqual({ workspaceId: "ws-1", q: "hello" });
  });

  it("does not believe a workspace named in a header the caller controls", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/__probe",
      headers: {
        authorization: "Bearer good-token",
        "x-sparstrow-workspace": "ws-someone-else",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspaceId).toBe("ws-1");
  });

  it("accepts an empty body on a JSON content type instead of 400ing before the route", async () => {
    // Fastify's default parser rejects "" with FST_ERR_CTP_EMPTY_JSON_BODY
    // BEFORE any route runs. Found by running it: a DELETE sent with
    // `Content-Type: application/json` and no body 400d, and the row it was
    // aimed at was still there afterwards.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/__probe",
      headers: { authorization: "Bearer good-token", "content-type": "application/json" },
      payload: "",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspaceId).toBe("ws-1");
  });

  it("still refuses a malformed JSON body, rather than treating it as empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/__probe",
      headers: { authorization: "Bearer good-token", "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("404s an unregistered path rather than falling through to Fastify's own handler", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/nothing-here",
      headers: { authorization: "Bearer good-token" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not Found" });
  });
});
