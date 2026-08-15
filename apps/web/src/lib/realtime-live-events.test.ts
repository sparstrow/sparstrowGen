import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `RealtimeLiveEventSource` is `apps/web`'s live transport: Supabase Realtime
 * broadcast, subscribed per run on a private channel. `@web/utils/supabase/client`
 * is mocked entirely — this suite is about the SOURCE's own logic (topic
 * building, workspace-id caching, subscribe/unsubscribe lifecycle), not
 * supabase-js or a live network.
 */

class FakeChannel {
  private handlers: Array<{ event: string; cb: (arg: { payload: unknown }) => void }> = [];

  constructor(
    public topic: string,
    public config: unknown,
    public subscribeStatus: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED",
  ) {}

  on(_type: string, filter: { event: string }, cb: (arg: { payload: unknown }) => void) {
    this.handlers.push({ event: filter.event, cb });
    return this;
  }

  subscribe(statusCb?: (status: string) => void) {
    statusCb?.(this.subscribeStatus);
    return this;
  }

  emit(event: string, payload: unknown) {
    for (const h of this.handlers) if (h.event === event) h.cb({ payload });
  }
}

interface Fake {
  userId: string | null;
  workspaceId: string | null;
  channels: FakeChannel[];
  getUserCalls: number;
  workspaceLookupCalls: number;
  /** What a newly-created channel reports the moment `.subscribe()` is called on it. */
  nextSubscribeStatus: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
}

let fake: Fake;
// Kept outside `Fake` deliberately: `ReturnType<typeof vi.fn>` on a generic
// mock factory does not collapse to a callable type when nested inside
// another interface's field (resolves to the unconstrained union of `fn`'s
// type bounds instead) — a plain module-level `let` sidesteps it entirely.
let removeChannelSpy: (ch: unknown) => void;

function resetFake(over: Partial<Pick<Fake, "userId" | "workspaceId" | "nextSubscribeStatus">> = {}) {
  fake = {
    userId: "user_1",
    workspaceId: "ws_1",
    channels: [],
    getUserCalls: 0,
    workspaceLookupCalls: 0,
    nextSubscribeStatus: "SUBSCRIBED",
    ...over,
  };
  removeChannelSpy = vi.fn();
}

vi.mock("@web/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        fake.getUserCalls++;
        return { data: { user: fake.userId ? { id: fake.userId } : null } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => {
              fake.workspaceLookupCalls++;
              return { data: fake.workspaceId ? { workspace_id: fake.workspaceId } : null };
            },
          }),
        }),
      }),
    }),
    channel: (topic: string, config: unknown) => {
      const ch = new FakeChannel(topic, config, fake.nextSubscribeStatus);
      fake.channels.push(ch);
      return ch;
    },
    removeChannel: (ch: unknown) => removeChannelSpy(ch),
  }),
}));

/** One microtask turn — enough for the `workspaceId()` promise chain to settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("RealtimeLiveEventSource", () => {
  beforeEach(() => {
    resetFake();
    vi.resetModules();
  });

  it("subscribes on run:<workspaceId>:<runId>, private", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    source.subscribeRun("run_1", () => {});
    await flush();

    expect(fake.channels).toHaveLength(1);
    expect(fake.channels[0]?.topic).toBe("run:ws_1:run_1");
    expect(fake.channels[0]?.config).toEqual({ config: { private: true } });
  });

  it("delivers each event in a broadcast payload to onEvent", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    const received: number[] = [];
    source.subscribeRun("run_1", (e) => received.push(e.seq));
    await flush();

    fake.channels[0]?.emit("events", {
      runId: "run_1",
      events: [
        { seq: 0, ts: "2026-08-12T00:00:00Z", type: "assistant", payload: {} },
        { seq: 1, ts: "2026-08-12T00:00:01Z", type: "assistant", payload: {} },
      ],
    });

    expect(received).toEqual([0, 1]);
  });

  it("invalidates the run's events query when a broadcast reports an oversized event", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const invalidateQueries = vi.fn();
    const source = new RealtimeLiveEventSource({ invalidateQueries } as never);
    source.subscribeRun("run_1", () => {});
    await flush();

    fake.channels[0]?.emit("events", { runId: "run_1", events: [], oversized: [7] });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["run-events", "run_1"] });
  });

  it("does not invalidate anything for an ordinary batch with nothing oversized", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const invalidateQueries = vi.fn();
    const source = new RealtimeLiveEventSource({ invalidateQueries } as never);
    source.subscribeRun("run_1", () => {});
    await flush();

    fake.channels[0]?.emit("events", {
      runId: "run_1",
      events: [{ seq: 0, ts: "2026-08-12T00:00:00Z", type: "assistant", payload: {} }],
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("does not throw when constructed without a query client and an oversized marker arrives", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource(); // no queryClient
    source.subscribeRun("run_1", () => {});
    await flush();

    expect(() => fake.channels[0]?.emit("events", { runId: "run_1", events: [], oversized: [3] })).not.toThrow();
  });

  it("stamps the delivered event's runId from the subscription, not the payload", async () => {
    // Defence in depth: even if a payload were ever malformed, the caller's
    // own runId is the source of truth for which run these belong to.
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    const received: string[] = [];
    source.subscribeRun("run_1", (e) => received.push(e.runId));
    await flush();

    fake.channels[0]?.emit("events", {
      runId: "run_1",
      events: [{ seq: 0, ts: "2026-08-12T00:00:00Z", type: "assistant", payload: {} }],
    });

    expect(received).toEqual(["run_1"]);
  });

  it("resolves the workspace id ONCE and reuses it across multiple runs", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    source.subscribeRun("run_1", () => {});
    source.subscribeRun("run_2", () => {});
    await flush();

    expect(fake.getUserCalls).toBe(1);
    expect(fake.workspaceLookupCalls).toBe(1);
    expect(fake.channels.map((c) => c.topic).sort()).toEqual(["run:ws_1:run_1", "run:ws_1:run_2"]);
  });

  it("removes the channel on unsubscribe", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    const unsubscribe = source.subscribeRun("run_1", () => {});
    await flush();
    const channel = fake.channels[0];

    unsubscribe();

    expect(removeChannelSpy).toHaveBeenCalledWith(channel);
  });

  it("does not open a channel if unsubscribed before the workspace lookup resolves", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    const unsubscribe = source.subscribeRun("run_1", () => {});
    unsubscribe(); // before `await flush()` — the lookup promise hasn't settled yet
    await flush();

    expect(fake.channels).toHaveLength(0);
    expect(removeChannelSpy).not.toHaveBeenCalled();
  });

  it("does not open a channel when there is no signed-in user", async () => {
    resetFake({ userId: null });
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    source.subscribeRun("run_1", () => {});
    await flush();

    expect(fake.channels).toHaveLength(0);
  });

  it("does not open a channel when the user has no workspace membership", async () => {
    resetFake({ workspaceId: null });
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    source.subscribeRun("run_1", () => {});
    await flush();

    expect(fake.channels).toHaveLength(0);
  });

  it("reports connected once a channel reaches SUBSCRIBED", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    expect(source.isConnected).toBe(false);
    source.subscribeRun("run_1", () => {});
    await flush();
    expect(source.isConnected).toBe(true);
  });

  it("notifies onStatusChange listeners of the transition", async () => {
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    const seen: boolean[] = [];
    source.onStatusChange((c) => seen.push(c));
    source.subscribeRun("run_1", () => {});
    await flush();
    expect(seen).toEqual([true]);
  });

  it("does not report connected when the channel fails to subscribe", async () => {
    resetFake({ nextSubscribeStatus: "CHANNEL_ERROR" });
    const { RealtimeLiveEventSource } = await import("./realtime-live-events");
    const source = new RealtimeLiveEventSource();
    source.subscribeRun("run_1", () => {});
    await flush();

    expect(source.isConnected).toBe(false);
  });
});
