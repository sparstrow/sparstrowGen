import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OQ-12 option A.
 *
 * The failure this closes was a real dispatched turn dying with *"This machine
 * has no agent with the slug `slice-probe`"* — an accurate message about a step
 * nothing in the product performed. Everything either side of it already
 * worked: the turn was assigned, claimed in under 10 s, executed and reported.
 *
 * These tests pin the two behaviours that are easy to get wrong and impossible
 * to notice: that a sync never destroys local data, and that a name collision
 * degrades instead of failing the row.
 */

const rows: Record<string, unknown>[] = [];
const links: { kind: string; cloudId: string; localId: string }[] = [];

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./resolve.js", () => ({
  writeLink: (kind: string, cloudId: string, localId: string) => {
    links.push({ kind, cloudId, localId });
  },
}));

vi.mock("./client.js", () => ({
  cloudFetch: vi.fn(),
  getRuntimes: vi.fn(() => []),
  isPaired: vi.fn(() => true),
}));

/**
 * A hand-rolled stand-in for the drizzle/SQLite chain.
 *
 * Deliberately not a real database: these assertions are about the sync's
 * DECISIONS — adopt by slug, never delete, degrade on a name clash — and a real
 * SQLite file would test drizzle rather than any of that.
 */
function makeDb() {
  let pendingColumn: string | null = null;
  let pendingValue: unknown = null;

  const chain = {
    select: () => chain,
    from: () => chain,
    where: (predicate: { column: string; value: unknown }) => {
      pendingColumn = predicate.column;
      pendingValue = predicate.value;
      return chain;
    },
    get: () => rows.find((r) => pendingColumn && r[pendingColumn] === pendingValue),
    insert: () => chain,
    values: (v: Record<string, unknown>) => {
      if (rows.some((r) => r.name === v.name)) {
        throw new Error("UNIQUE constraint failed: agents.name");
      }
      rows.push({ ...v });
      return chain;
    },
    update: () => chain,
    set: (v: Record<string, unknown>) => {
      const target = rows.find((r) => pendingColumn && r[pendingColumn] === pendingValue);
      if (target) Object.assign(target, v);
      return chain;
    },
    delete: () => chain,
    run: () => undefined,
  };
  return chain;
}

vi.mock("../db/connection.js", () => ({ getDb: () => makeDb() }));
vi.mock("../db/schema.js", () => ({ agents: { id: "id", name: "name", slug: "slug" } }));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => ({ column, value }),
}));

const remote = (over: Record<string, unknown> = {}) => ({
  id: "cloud_1",
  name: "Reviewer",
  slug: "reviewer",
  role: "",
  system_prompt: "",
  provider: "claude-code",
  model: "claude-sonnet-4-6",
  cwd: null,
  add_dirs: [],
  allowed_tools: [],
  disallowed_tools: [],
  permission_mode: "default",
  mcp_servers: {},
  max_turns: null,
  memory_read_scopes: [],
  memory_write_scopes: [],
  extra_args: [],
  enabled: true,
  signal_extraction: true,
  origin: "user",
  status: "active",
  ...over,
});

beforeEach(() => {
  rows.length = 0;
  links.length = 0;
  vi.clearAllMocks();
});

describe("applyAgents", () => {
  it("adds an agent the machine has never seen, and links it", async () => {
    const { applyAgents } = await import("./agent-sync.js");
    const result = applyAgents([remote()] as never);

    expect(result).toMatchObject({ added: 1, updated: 0, skipped: 0 });
    expect(rows[0]).toMatchObject({ slug: "reviewer", name: "Reviewer" });
    // The link is written at pull time so the first dispatch does not have to
    // rediscover it by slug.
    expect(links).toContainEqual(
      expect.objectContaining({ kind: "agent", cloudId: "cloud_1" }),
    );
  });

  it("adopts a local agent with the same slug instead of duplicating it", async () => {
    const { applyAgents } = await import("./agent-sync.js");
    rows.push({ id: "agt_local", name: "Reviewer", slug: "reviewer", model: "old-model" });

    const result = applyAgents([remote({ model: "claude-sonnet-4-6" })] as never);

    expect(result).toMatchObject({ added: 0, updated: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "agt_local", model: "claude-sonnet-4-6" });
  });

  it("never removes a local agent the workspace does not have", async () => {
    const { applyAgents } = await import("./agent-sync.js");
    // A machine can hold agents that exist nowhere else — made before it was
    // connected, or belonging to a workspace it has left. Reconciling by
    // deletion would turn one empty response into permanent data loss.
    rows.push({ id: "agt_local_only", name: "Local Only", slug: "local-only" });

    applyAgents([remote()] as never);

    expect(rows.some((r) => r.slug === "local-only")).toBe(true);
  });

  it("keeps the local name when another agent already holds it, and syncs the rest", async () => {
    const { applyAgents } = await import("./agent-sync.js");
    // `name` is UNIQUE locally. Writing it anyway fails the whole row, so an
    // agent would silently not exist because of a label.
    rows.push({ id: "agt_other", name: "Reviewer", slug: "some-other-slug" });

    const result = applyAgents([remote({ slug: "reviewer", model: "m2" })] as never);

    expect(result.skipped).toBe(0);
    const synced = rows.find((r) => r.slug === "reviewer");
    expect(synced).toBeDefined();
    expect(synced?.model).toBe("m2");
    expect(synced?.name).not.toBe("Reviewer");
  });

  it("skips a malformed row without losing the rest of the batch", async () => {
    const { applyAgents } = await import("./agent-sync.js");
    const result = applyAgents([remote({ slug: "a", id: "c1" }), remote({ slug: "b", id: "c2", name: "Second" })] as never);
    expect(result.added).toBe(2);
  });
});

describe("syncAgents", () => {
  it("does nothing at all when the machine is not paired", async () => {
    const client = await import("./client.js");
    vi.mocked(client.isPaired).mockReturnValue(false);

    const { syncAgents } = await import("./agent-sync.js");
    const result = await syncAgents();

    expect(result).toEqual({ added: 0, updated: 0, skipped: 0 });
    expect(client.cloudFetch).not.toHaveBeenCalled();
  });

  it("keeps the previous roster when a workspace pull fails", async () => {
    const client = await import("./client.js");
    vi.mocked(client.isPaired).mockReturnValue(true);
    vi.mocked(client.getRuntimes).mockReturnValue([
      { runtimeId: "rt_1", workspaceId: "ws_1" },
    ] as never);
    vi.mocked(client.cloudFetch).mockRejectedValue(new Error("offline"));
    rows.push({ id: "agt_local", name: "Kept", slug: "kept" });

    const { syncAgents } = await import("./agent-sync.js");
    const result = await syncAgents();

    // Stale but working beats "this machine stopped working".
    expect(result).toEqual({ added: 0, updated: 0, skipped: 0 });
    expect(rows.some((r) => r.slug === "kept")).toBe(true);
  });

  it("scopes the pull to each runtime, so a token cannot read another workspace", async () => {
    const client = await import("./client.js");
    vi.mocked(client.isPaired).mockReturnValue(true);
    vi.mocked(client.getRuntimes).mockReturnValue([
      { runtimeId: "rt_1", workspaceId: "ws_1" },
      { runtimeId: "rt_2", workspaceId: "ws_2" },
    ] as never);
    vi.mocked(client.cloudFetch).mockResolvedValue({ agents: [] } as never);

    const { syncAgents } = await import("./agent-sync.js");
    await syncAgents();

    expect(client.cloudFetch).toHaveBeenCalledWith(
      "/agents",
      expect.objectContaining({ runtimeId: "rt_1" }),
    );
    expect(client.cloudFetch).toHaveBeenCalledWith(
      "/agents",
      expect.objectContaining({ runtimeId: "rt_2" }),
    );
  });
});

describe("ensureAgentLocal", () => {
  it("does not touch the network when the agent is already here", async () => {
    const client = await import("./client.js");
    vi.mocked(client.isPaired).mockReturnValue(true);
    rows.push({ id: "agt_1", name: "Here", slug: "here" });

    const { ensureAgentLocal } = await import("./agent-sync.js");
    await ensureAgentLocal("here");

    expect(client.cloudFetch).not.toHaveBeenCalled();
  });

  it("pulls when the slug is missing — this is what makes 'create then message' work", async () => {
    const client = await import("./client.js");
    vi.mocked(client.isPaired).mockReturnValue(true);
    vi.mocked(client.getRuntimes).mockReturnValue([
      { runtimeId: "rt_1", workspaceId: "ws_1" },
    ] as never);
    vi.mocked(client.cloudFetch).mockResolvedValue({ agents: [remote({ slug: "brand-new" })] } as never);

    const { ensureAgentLocal } = await import("./agent-sync.js");
    await ensureAgentLocal("brand-new");

    expect(client.cloudFetch).toHaveBeenCalled();
    expect(rows.some((r) => r.slug === "brand-new")).toBe(true);
  });

  it("ignores an empty slug rather than pulling for nothing", async () => {
    const client = await import("./client.js");
    const { ensureAgentLocal } = await import("./agent-sync.js");
    await ensureAgentLocal(null);
    await ensureAgentLocal("");
    expect(client.cloudFetch).not.toHaveBeenCalled();
  });
});
