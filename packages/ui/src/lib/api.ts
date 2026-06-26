export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data?.error === "string" && data.error.length > 0) {
        message = data.error;
      }
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
