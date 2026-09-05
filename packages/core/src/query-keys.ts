/**
 * Every cache key in one place.
 *
 * Not ceremony. `apps/web/src/api/hooks.ts` spells its keys inline across 1,477
 * lines, and the cost shows up at invalidation time: a mutation has to
 * reproduce a key exactly, by hand, in a different file from the query that
 * wrote it. Two spellings of the same key means a screen that quietly does not
 * refresh, which is invisible in tests and obvious to a user.
 *
 * Keys are hierarchical so a broad invalidation works by prefix:
 * invalidating `["agents"]` also clears `["agents", "detail", id]`.
 */
export const queryKeys = {
  machines: {
    all: ["machines"] as const,
    list: () => [...queryKeys.machines.all, "list"] as const,
  },
  agents: {
    all: ["agents"] as const,
    list: () => [...queryKeys.agents.all, "list"] as const,
    detail: (id: string) => [...queryKeys.agents.all, "detail", id] as const,
  },
  runs: {
    all: ["runs"] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.runs.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.runs.all, "detail", id] as const,
    events: (id: string) => [...queryKeys.runs.all, "events", id] as const,
  },
  chat: {
    all: ["chat"] as const,
    sessions: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.chat.all, "sessions", filters] as const,
    session: (id: string) => [...queryKeys.chat.all, "session", id] as const,
  },
  providers: {
    all: ["providers"] as const,
    list: () => [...queryKeys.providers.all, "list"] as const,
    models: (id: string) => [...queryKeys.providers.all, "models", id] as const,
  },
  workspace: {
    current: ["workspace", "current"] as const,
  },
} as const;
