import { ApiError } from "./errors";

/**
 * The one HTTP client. Every app talks to `server/` through this and nothing
 * else.
 *
 * ─── What it deliberately does NOT assume ─────────────────────────────────
 *
 * The version this replaces (`apps/web/src/lib/api-client.ts`) hardcoded a
 * relative `/api/v1` URL and read its token from `window.__SPARSTROW_TOKEN__`.
 * Both are web-only facts, and either one makes the module unusable from
 * Electron or React Native — which is the whole reason a shared data layer did
 * not exist. So:
 *
 *   - **the base URL is injected.** `apps/web` passes `""` and keeps using its
 *     same-origin `/api/v1` proxy, because its session is an httpOnly cookie
 *     the browser must send itself. `apps/desktop` passes
 *     `http://127.0.0.1:8080` and talks to `server/` directly.
 *   - **auth is a function, not a value.** A token read once at construction is
 *     a token that is wrong after the first refresh. `getToken()` is called per
 *     request, and returning `null` is a legitimate answer — it means "this
 *     host authenticates some other way", which is exactly the web app's cookie
 *     case.
 *   - **`fetch` is injectable**, so tests do not need a network or a global
 *     stub that leaks between files.
 */

export type ApiClientOptions = {
  /**
   * Where `server/` is. `""` means same-origin, which is what a browser
   * talking through its own app's proxy wants.
   */
  baseUrl: string;

  /**
   * Called before every request. Return `null` when the host authenticates by
   * some other means (the web app's cookie), and the header is simply omitted.
   */
  getToken?: () => string | null | Promise<string | null>;

  /**
   * The workspace the client is acting in, if it knows. Sent as
   * `X-Sparstrow-Workspace`; `server/` validates it against real membership
   * before believing it, so a stale value degrades to "your default workspace"
   * rather than to someone else's data.
   */
  getWorkspaceId?: () => string | null | Promise<string | null>;

  /** Injectable for tests. Defaults to the platform `fetch`. */
  fetch?: typeof fetch;
};

export type RequestInitLite = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Passed through so a caller can cancel — react-query supplies one. */
  signal?: AbortSignal;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null | Promise<string | null>;
  private readonly getWorkspaceId: () => string | null | Promise<string | null>;
  private readonly doFetch: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getToken = options.getToken ?? (() => null);
    this.getWorkspaceId = options.getWorkspaceId ?? (() => null);
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(path: string, init: RequestInitLite = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    // Only on requests that carry one. Sending `Content-Type: application/json`
    // on a bodyless GET is harmless but misleading, and some proxies treat it
    // as a promise of a body.
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    const token = await this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const workspaceId = await this.getWorkspaceId();
    if (workspaceId) headers["X-Sparstrow-Workspace"] = workspaceId;

    let res: Response;
    try {
      res = await this.doFetch(`${this.baseUrl}/api/v1${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
        // The session cookie for the web app's same-origin proxy. Ignored by a
        // cross-origin desktop request, which authenticates by bearer token.
        credentials: "same-origin",
      });
    } catch (cause) {
      // A thrown fetch is a transport failure -- server down, DNS, offline --
      // and must not be reported as though the server answered. Status 0 says
      // "no response", which `isUnreachable` reads.
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new ApiError(
        0,
        `Could not reach the API at ${this.baseUrl || "this app"}.`,
        "server_unreachable",
      );
    }

    if (!res.ok) throw await this.errorFrom(res);
    if (res.status === 204) return undefined as T;

    return (await res.json()) as T;
  }

  private async errorFrom(res: Response): Promise<ApiError> {
    let message = `Request failed (${res.status})`;
    let reason: string | null = null;
    try {
      const data = (await res.json()) as { error?: unknown; reason?: unknown };
      if (typeof data?.error === "string" && data.error) message = data.error;
      if (typeof data?.reason === "string" && data.reason) reason = data.reason;
    } catch {
      // Non-JSON body (an HTML error page from a proxy, say). Keep the generic
      // message rather than surfacing markup to a user.
    }
    return new ApiError(res.status, message, reason);
  }

  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "GET", signal });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  /**
   * Is `server/` there at all?
   *
   * Its own method because `/healthz` sits OUTSIDE `/api/v1` — it is
   * unauthenticated on purpose, and it deliberately says nothing about the
   * database, so a slow Supabase does not tell a supervisor to restart a
   * process that is fine.
   *
   * Worth separating from every other call: "cannot reach the server" and
   * "reachable but not signed in" have completely different answers, and an app
   * that collapses them into one spinner is how someone ends up restarting
   * something that was working.
   */
  async isReachable(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await this.doFetch(`${this.baseUrl}/healthz`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Build a query string from defined params; returns "" when empty. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}
