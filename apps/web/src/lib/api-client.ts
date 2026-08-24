export class ApiError extends Error {
  readonly status: number;
  /**
   * Stable machine-readable failure token from the response body, when the
   * server sent one (`no_runtime_available`, `project_not_available`, …).
   *
   * M4 needs this: the four recovery actions offered for a blocked project are
   * different from the one offered for "no machine is online", and choosing
   * between them by matching on the prose would break the first time someone
   * improves a message. The tokens are the contract; the prose is for people.
   */
  readonly reason: string | null;

  constructor(status: number, message: string, reason: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.reason = reason;
  }
}

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
}

/**
 * Thin JSON fetch wrapper for the Sparstrowgen REST API.
 * Uses relative URLs so the vite dev proxy (and same-origin prod) both work.
 */
/** Prod: the server injects the token into the page. Dev: the vite proxy adds it. */
function authHeaders(): Record<string, string> {
  const token = (window as unknown as { __SPARSTROW_TOKEN__?: string }).__SPARSTROW_TOKEN__;
  return typeof token === "string" && token.length > 0
    ? { Authorization: `Bearer ${token}` }
    : {};
}

export async function api<T>(path: string, init?: ApiInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let reason: string | null = null;
    try {
      const data = (await res.json()) as { error?: unknown; reason?: unknown };
      if (typeof data?.error === "string" && data.error.length > 0) {
        message = data.error;
      }
      if (typeof data?.reason === "string" && data.reason.length > 0) {
        reason = data.reason;
      }
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message, reason);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
