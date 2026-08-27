import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MACHINE_REPLY_EVENT, MACHINE_REQUEST_EVENT, MACHINE_REQUEST_TIMEOUT_MS, TERMINAL_INPUT_EVENT } from "@sparstrow/shared";
import { RealtimeTerminalChannel, TerminalChannelClosedError, TerminalRequestTimeoutError } from "./terminal-channel";

/**
 * `@web/utils/supabase/client` is mocked entirely — this suite is about the
 * channel client's own logic (correlation, timeout-vs-refusal, teardown),
 * not supabase-js or a live network. Mirrors `realtime-live-events.test.ts`'s
 * `FakeChannel` pattern, extended with `send()` since this transport sends
 * as well as receives.
 */

class FakeChannel {
  handlers: Array<{ event: string; cb: (arg: { payload: unknown }) => void }> = [];
  sent: Array<{ type: string; event: string; payload: unknown }> = [];

  constructor(
    public topic: string,
    public config: unknown,
    private readonly subscribeStatus: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED",
  ) {}

  on(_type: string, filter: { event: string }, cb: (arg: { payload: unknown }) => void) {
    this.handlers.push({ event: filter.event, cb });
    return this;
  }

  subscribe(statusCb?: (status: string) => void) {
    statusCb?.(this.subscribeStatus);
    return this;
  }

  send(msg: { type: string; event: string; payload: unknown }) {
    this.sent.push(msg);
    return Promise.resolve("ok");
  }

  emit(event: string, payload: unknown) {
    for (const h of this.handlers) if (h.event === event) h.cb({ payload });
  }
}

interface Fake {
  userId: string | null;
  workspaceId: string | null;
  channels: FakeChannel[];
  nextSubscribeStatus: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
}

let fake: Fake;
let removeChannelSpy: (ch: unknown) => void;

function resetFake(over: Partial<Pick<Fake, "userId" | "workspaceId" | "nextSubscribeStatus">> = {}) {
  fake = {
    userId: "user_1",
    workspaceId: "ws_1",
    channels: [],
    nextSubscribeStatus: "SUBSCRIBED",
    ...over,
  };
  removeChannelSpy = vi.fn();
}

vi.mock("@web/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: fake.userId ? { id: fake.userId } : null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: fake.workspaceId ? { workspace_id: fake.workspaceId } : null }),
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

/** One macrotask turn — enough for the workspace-id and channel-setup promise chains to settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function controlChannel(): FakeChannel {
  const ch = fake.channels.find((c) => c.topic === "machine:ws_1:rt_1");
  if (!ch) throw new Error("control channel not created yet");
  return ch;
}

function sessionChannel(sessionId: string): FakeChannel {
  const ch = fake.channels.find((c) => c.topic === `terminal:ws_1:${sessionId}`);
  if (!ch) throw new Error("session channel not created yet");
  return ch;
}

describe("RealtimeTerminalChannel", () => {
  beforeEach(() => {
    resetFake();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes the control channel on machine:<workspaceId>:<runtimeId>, private", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    void channel.request("terminal.list", {});
    await flush();

    expect(controlChannel().config).toEqual({ config: { broadcast: { self: false }, private: true } });
  });

  it("carries a client-generated requestId and matches the reply to it", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const promise = channel.request("terminal.list", {});
    await flush();

    const sent = controlChannel().sent[0]?.payload as { requestId: string; kind: string };
    expect(sent.kind).toBe("terminal.list");
    expect(typeof sent.requestId).toBe("string");
    expect(sent.requestId.length).toBeGreaterThan(0);

    controlChannel().emit(MACHINE_REPLY_EVENT, {
      requestId: sent.requestId,
      kind: "terminal.list",
      sessions: [],
      machineStartedAt: "2026-08-27T00:00:00Z",
    });

    await expect(promise).resolves.toMatchObject({ kind: "terminal.list", sessions: [] });
  });

  it("drops a reply whose requestId does not match any pending request, without throwing", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    void channel.request("terminal.list", {});
    await flush();

    expect(() =>
      controlChannel().emit(MACHINE_REPLY_EVENT, {
        requestId: "some_other_tabs_request",
        kind: "terminal.list",
        sessions: [],
        machineStartedAt: "2026-08-27T00:00:00Z",
      }),
    ).not.toThrow();
  });

  it("two concurrent requests each resolve with their own reply, not each other's", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const p1 = channel.request("terminal.list", {});
    const p2 = channel.request("terminal.close", { sessionId: "term_2" });
    await flush();

    const [sent1, sent2] = controlChannel().sent.map((s) => s.payload as { requestId: string; kind: string });
    controlChannel().emit(MACHINE_REPLY_EVENT, {
      requestId: sent2!.requestId,
      kind: "terminal.close",
      ok: true,
    });
    controlChannel().emit(MACHINE_REPLY_EVENT, {
      requestId: sent1!.requestId,
      kind: "terminal.list",
      sessions: [],
      machineStartedAt: "2026-08-27T00:00:00Z",
    });

    await expect(p1).resolves.toMatchObject({ kind: "terminal.list" });
    await expect(p2).resolves.toMatchObject({ kind: "terminal.close", ok: true });
  });

  it("resolves (does not reject) when the machine replies with a refusal", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const promise = channel.request("terminal.open", { agentId: null, cols: 80, rows: 24 });
    await flush();

    const sent = controlChannel().sent[0]?.payload as { requestId: string };
    controlChannel().emit(MACHINE_REPLY_EVENT, {
      requestId: sent.requestId,
      kind: "terminal.open",
      error: "spawn_failed",
    });

    await expect(promise).resolves.toEqual({
      requestId: sent.requestId,
      kind: "terminal.open",
      error: "spawn_failed",
    });
  });

  it("rejects with TerminalRequestTimeoutError, distinct from a refusal, when nothing replies", async () => {
    vi.useFakeTimers();
    const channel = new RealtimeTerminalChannel("rt_1");
    const promise = channel.request("terminal.list", {});

    const assertion = expect(promise).rejects.toBeInstanceOf(TerminalRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(MACHINE_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it("drops a malformed reply (fails schema) without resolving or throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const channel = new RealtimeTerminalChannel("rt_1");
    const promise = channel.request("terminal.list", {});
    await flush();

    expect(() => controlChannel().emit(MACHINE_REPLY_EVENT, { garbage: true })).not.toThrow();
    expect(warn).toHaveBeenCalled();

    // Still pending — a malformed reply must not resolve the request it wasn't for.
    let settled = false;
    void promise.then(
      () => (settled = true),
      () => (settled = true),
    );
    await flush();
    expect(settled).toBe(false);
    warn.mockRestore();
  });

  it("attach() subscribes on terminal:<workspaceId>:<sessionId>, private, and delivers output", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const received: string[] = [];
    channel.attach("term_1", { onOutput: (c) => received.push(c), onThrottled: () => {}, onEnded: () => {} });
    await flush();

    expect(sessionChannel("term_1").config).toEqual({ config: { broadcast: { self: false }, private: true } });

    sessionChannel("term_1").emit("output", { data: "hello\r\n" });
    expect(received).toEqual(["hello\r\n"]);
  });

  it("drops a malformed output message without crashing or delivering it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const channel = new RealtimeTerminalChannel("rt_1");
    const received: string[] = [];
    channel.attach("term_1", { onOutput: (c) => received.push(c), onThrottled: () => {}, onEnded: () => {} });
    await flush();

    expect(() => sessionChannel("term_1").emit("output", { notData: 1 })).not.toThrow();
    expect(received).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("send() delivers input on the session's own channel once attach() has resolved", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    channel.attach("term_1", { onOutput: () => {}, onThrottled: () => {}, onEnded: () => {} });
    await flush();

    channel.send("term_1", { data: "ls\n" });

    expect(sessionChannel("term_1").sent).toEqual([
      { type: "broadcast", event: TERMINAL_INPUT_EVENT, payload: { data: "ls\n" } },
    ]);
  });

  it("drops send() silently (with a warning) when called before attach() has resolved", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const channel = new RealtimeTerminalChannel("rt_1");

    expect(() => channel.send("term_never_attached", { data: "x" })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("tears down the session channel on detach, leaving no listener", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const detach = channel.attach("term_1", { onOutput: () => {}, onThrottled: () => {}, onEnded: () => {} });
    await flush();
    const ch = sessionChannel("term_1");

    detach();

    expect(removeChannelSpy).toHaveBeenCalledWith(ch);
  });

  it("does not open a session channel if detached before the workspace lookup resolves", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const detach = channel.attach("term_1", { onOutput: () => {}, onThrottled: () => {}, onEnded: () => {} });
    detach();
    await flush();

    expect(fake.channels.find((c) => c.topic === "terminal:ws_1:term_1")).toBeUndefined();
    expect(removeChannelSpy).not.toHaveBeenCalled();
  });

  it("fires onEnded('closed') for an attached session when THIS instance's own terminal.close succeeds", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const onEnded = vi.fn();
    channel.attach("term_1", { onOutput: () => {}, onThrottled: () => {}, onEnded });
    await flush();
    const attachedChannel = sessionChannel("term_1");

    const closePromise = channel.request("terminal.close", { sessionId: "term_1" });
    await flush();
    const sent = controlChannel().sent.find((s) => (s.payload as { kind: string }).kind === "terminal.close")
      ?.payload as { requestId: string };
    controlChannel().emit(MACHINE_REPLY_EVENT, { requestId: sent.requestId, kind: "terminal.close", ok: true });
    await closePromise;

    expect(onEnded).toHaveBeenCalledWith("closed");
    expect(removeChannelSpy).toHaveBeenCalledWith(attachedChannel);
  });

  it("does not fire onEnded for a terminal.close of a DIFFERENT session", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const onEnded = vi.fn();
    channel.attach("term_1", { onOutput: () => {}, onThrottled: () => {}, onEnded });
    await flush();

    const closePromise = channel.request("terminal.close", { sessionId: "term_2" });
    await flush();
    const sent = controlChannel().sent.find((s) => (s.payload as { kind: string }).kind === "terminal.close")
      ?.payload as { requestId: string };
    controlChannel().emit(MACHINE_REPLY_EVENT, { requestId: sent.requestId, kind: "terminal.close", ok: true });
    await closePromise;

    expect(onEnded).not.toHaveBeenCalled();
  });

  it("reports connected once the control channel reaches SUBSCRIBED", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const seen: boolean[] = [];
    channel.onConnectionChange((c) => seen.push(c));
    void channel.request("terminal.list", {});
    await flush();

    expect(seen).toEqual([true]);
  });

  it("does not report connected when the control channel fails to subscribe", async () => {
    resetFake({ nextSubscribeStatus: "CHANNEL_ERROR" });
    const channel = new RealtimeTerminalChannel("rt_1");
    const seen: boolean[] = [];
    channel.onConnectionChange((c) => seen.push(c));
    void channel.request("terminal.list", {});
    await flush();

    expect(seen).toEqual([]);
  });

  it("stops notifying an onConnectionChange listener after it unsubscribes", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    const seen: boolean[] = [];
    const unsubscribe = channel.onConnectionChange((c) => seen.push(c));
    unsubscribe();
    void channel.request("terminal.list", {});
    await flush();

    expect(seen).toEqual([]);
  });

  it("resolves the control channel ONCE and reuses it across multiple requests", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    void channel.request("terminal.list", {});
    void channel.request("terminal.list", {});
    await flush();

    expect(fake.channels.filter((c) => c.topic === "machine:ws_1:rt_1")).toHaveLength(1);
  });

  it("does not open a control channel when there is no signed-in user, and rejects the request", async () => {
    resetFake({ userId: null });
    const channel = new RealtimeTerminalChannel("rt_1");
    const promise = channel.request("terminal.list", {});

    await expect(promise).rejects.toBeInstanceOf(TerminalRequestTimeoutError);
    expect(fake.channels).toHaveLength(0);
  });

  it("sends the request under the MACHINE_REQUEST_EVENT event name", async () => {
    const channel = new RealtimeTerminalChannel("rt_1");
    void channel.request("terminal.list", {});
    await flush();

    expect(controlChannel().sent[0]?.event).toBe(MACHINE_REQUEST_EVENT);
    expect(controlChannel().sent[0]?.type).toBe("broadcast");
  });

  describe("close()", () => {
    it("tears down the control channel and every attached session channel", async () => {
      const channel = new RealtimeTerminalChannel("rt_1");
      // Never replied to — close() rejects it; the outcome of this particular
      // request isn't this test's concern (covered by the next test).
      channel.request("terminal.list", {}).catch(() => {});
      channel.attach("term_1", { onOutput: () => {}, onThrottled: () => {}, onEnded: () => {} });
      await flush();
      const control = controlChannel();
      const session = sessionChannel("term_1");

      channel.close();

      expect(removeChannelSpy).toHaveBeenCalledWith(control);
      expect(removeChannelSpy).toHaveBeenCalledWith(session);
    });

    it("rejects an in-flight request with TerminalChannelClosedError, not the timeout error", async () => {
      const channel = new RealtimeTerminalChannel("rt_1");
      const promise = channel.request("terminal.list", {});
      await flush();

      channel.close();

      await expect(promise).rejects.toBeInstanceOf(TerminalChannelClosedError);
      await expect(promise).rejects.not.toBeInstanceOf(TerminalRequestTimeoutError);
    });

    it("is idempotent — calling it twice, or before anything ever connected, does not throw", async () => {
      const channel = new RealtimeTerminalChannel("rt_1");
      expect(() => channel.close()).not.toThrow();
      expect(() => channel.close()).not.toThrow();
    });

    it("reconnecting after close() opens a fresh control channel rather than reusing the torn-down one", async () => {
      const channel = new RealtimeTerminalChannel("rt_1");
      // Never replied to — close() rejects it, and the rejection is expected
      // and ignored here since this test is about channel identity, not this
      // request's outcome (covered by the previous test).
      channel.request("terminal.list", {}).catch(() => {});
      await flush();
      const first = controlChannel();

      channel.close();
      void channel.request("terminal.list", {});
      await flush();

      const controlTopics = fake.channels.filter((c) => c.topic === "machine:ws_1:rt_1");
      expect(controlTopics).toHaveLength(2);
      expect(controlTopics[1]).not.toBe(first);
    });
  });
});
