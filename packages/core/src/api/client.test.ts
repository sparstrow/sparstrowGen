import { describe, expect, it, vi } from "vitest";
import { ApiClient, qs } from "./client";
import { ApiError } from "./errors";

/**
 * `ApiClient` is the single piece of code every screen in every app depends on,
 * so its edges are worth pinning: which headers go out, what a failure turns
 * into, and what happens when `server/` is not there at all.
 *
 * `fetch` is injected rather than stubbed globally — a global stub leaks
 * between test files and produces failures whose cause is in a different file.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch) {
  return new ApiClient({ baseUrl: "", fetch: fetchImpl });
}

/** The (url, init) pair a mocked fetch was called with, typed once. */
function callArgs(fetchImpl: { mock: { calls: unknown[][] } }, index: number) {
  const [url, init] = fetchImpl.mock.calls[index] as [string, RequestInit];
  return { url, headers: new Headers(init.headers) };
}

describe("qs", () => {
  it("omits undefined, null and empty values rather than sending them", () => {
    // A `?status=undefined` reaching a handler is a filter nobody asked for.
    expect(qs({ a: 1, b: undefined, c: null, d: "", e: "x" })).toBe("?a=1&e=x");
  });

  it("returns an empty string when nothing survives, not a bare '?'", () => {
    expect(qs({})).toBe("");
    expect(qs({ a: undefined })).toBe("");
  });
});

describe("ApiClient headers", () => {
  it("prefixes the path with /api/v1 and sends no auth header when there is no token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const api = clientWith(fetchImpl as unknown as typeof fetch);

    // Awaited, not fire-and-forget: `getToken` and `getWorkspaceId` are awaited
    // inside `request`, so `fetch` has not been called yet when the promise is
    // merely created.
    await api.get("/agents");

    const { url, headers } = callArgs(fetchImpl, 0);
    expect(url).toBe("/api/v1/agents");
    // The web app authenticates by cookie; an empty Authorization header would
    // be worse than none, since `server/` would try to verify "".
    expect(headers.has("authorization")).toBe(false);
  });

  it("calls getToken per request, so a refreshed token is actually used", async () => {
    const tokens = ["first", "second"];
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const api = new ApiClient({
      baseUrl: "http://127.0.0.1:8080",
      fetch: fetchImpl as unknown as typeof fetch,
      getToken: () => tokens.shift() ?? null,
    });

    await api.get("/a");
    await api.get("/b");

    expect(callArgs(fetchImpl, 0).headers.get("authorization")).toBe("Bearer first");
    expect(callArgs(fetchImpl, 1).headers.get("authorization")).toBe("Bearer second");
  });

  it("sends the workspace header only when one is known", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    let workspace: string | null = null;
    const api = new ApiClient({
      baseUrl: "",
      fetch: fetchImpl as unknown as typeof fetch,
      getWorkspaceId: () => workspace,
    });

    await api.get("/a");
    workspace = "ws-1";
    await api.get("/b");

    expect(callArgs(fetchImpl, 0).headers.has("x-sparstrow-workspace")).toBe(false);
    expect(callArgs(fetchImpl, 1).headers.get("x-sparstrow-workspace")).toBe("ws-1");
  });

  it("sets Content-Type only on requests that carry a body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const api = clientWith(fetchImpl as unknown as typeof fetch);

    await api.get("/a");
    await api.post("/b", { name: "x" });

    expect(callArgs(fetchImpl, 0).headers.has("content-type")).toBe(false);
    expect(callArgs(fetchImpl, 1).headers.get("content-type")).toBe("application/json");
  });
});

describe("ApiClient responses", () => {
  it("returns parsed JSON", async () => {
    const api = clientWith((async () => jsonResponse([{ id: "a" }])) as unknown as typeof fetch);
    await expect(api.get("/agents")).resolves.toEqual([{ id: "a" }]);
  });

  it("returns undefined for 204 rather than trying to parse an empty body", async () => {
    const api = clientWith((async () => new Response(null, { status: 204 })) as unknown as typeof fetch);
    await expect(api.delete("/projects/1")).resolves.toBeUndefined();
  });

  it("carries the server's error message and reason token onto ApiError", async () => {
    const api = clientWith(
      (async () =>
        jsonResponse({ error: "No machine is online.", reason: "no_runtime_available" }, 409)) as unknown as typeof fetch,
    );

    // `reason` is the contract the UI switches on; `message` is prose that is
    // allowed to be reworded without breaking anything.
    await expect(api.post("/runs")).rejects.toMatchObject({
      status: 409,
      message: "No machine is online.",
      reason: "no_runtime_available",
    });
  });

  it("does not surface an HTML error page as a message", async () => {
    const api = clientWith(
      (async () =>
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
    );

    const error = await api.get("/agents").catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("Request failed (502)");
    expect((error as ApiError).message).not.toContain("<html>");
  });

  it("reports a thrown fetch as unreachable, not as a server response", async () => {
    // A transport failure has no status. Reporting it as one would make "the
    // server is not running" indistinguishable from "the server said no".
    const api = clientWith(
      (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    );

    const error = await api.get("/agents").catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).isUnreachable).toBe(true);
    expect((error as ApiError).isUnauthenticated).toBe(false);
  });

  it("lets an abort propagate instead of laundering it into an unreachable error", async () => {
    // react-query aborts on unmount. Turning that into an ApiError would make
    // every navigation look like an outage.
    const api = clientWith(
      (async () => {
        throw new DOMException("aborted", "AbortError");
      }) as unknown as typeof fetch,
    );

    await expect(api.get("/agents")).rejects.toBeInstanceOf(DOMException);
  });
});

describe("ApiError", () => {
  it("recognises an expired session", () => {
    expect(new ApiError(401, "nope").isUnauthenticated).toBe(true);
    expect(new ApiError(403, "nope").isUnauthenticated).toBe(false);
  });

  it("treats the proxy's own 502 reason token as unreachable", () => {
    // `apps/web`'s /api/v1 proxy answers 502 + `server_unreachable` when it
    // cannot reach server/. A client should read that the same way it reads a
    // thrown fetch.
    expect(new ApiError(502, "…", "server_unreachable").isUnreachable).toBe(true);
    expect(new ApiError(502, "…").isUnreachable).toBe(false);
  });
});
