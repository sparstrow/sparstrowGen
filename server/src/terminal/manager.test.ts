import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as pty from "node-pty";
import {
  MAX_TERMINAL_SESSIONS,
  TERMINAL_OUTPUT_FLUSH_MS,
  TERMINAL_THROTTLE_BYTES_PER_SEC,
  TERMINAL_THROTTLE_SUSTAIN_MS,
} from "@sparstrow/shared";

vi.mock("node-pty", () => ({ spawn: vi.fn() }));

interface FakePty {
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  pid: number;
  emitData: (chunk: string) => void;
  emitExit: (exitCode: number) => void;
}

function makeFakePty(): FakePty {
  let dataHandler: ((data: string) => void) | null = null;
  let exitHandler: ((e: { exitCode: number }) => void) | null = null;
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 4242,
    onData: (cb: (data: string) => void) => {
      dataHandler = cb;
    },
    onExit: (cb: (e: { exitCode: number }) => void) => {
      exitHandler = cb;
    },
    emitData: (chunk: string) => dataHandler?.(chunk),
    emitExit: (exitCode: number) => exitHandler?.({ exitCode }),
  } as unknown as FakePty;
}

interface FakeWs {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  triggerClose: () => void;
  triggerMessage: (msg: string) => void;
}

function makeFakeWs(): FakeWs {
  let closeHandler: (() => void) | null = null;
  let messageHandler: ((msg: unknown) => void) | null = null;
  const ws = {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      if (event === "close") closeHandler = cb as () => void;
      if (event === "message") messageHandler = cb;
    }),
  } as unknown as FakeWs;
  ws.triggerClose = () => closeHandler?.();
  ws.triggerMessage = (msg: string) => messageHandler?.(msg);
  return ws;
}

function fakeSink() {
  return { write: vi.fn(), close: vi.fn() };
}

const BASE_OPTS = { command: "cmd.exe", args: [] as string[], cwd: "C:\\", env: {} };

describe("terminal manager", () => {
  let fake: FakePty;
  let manager: typeof import("./manager.js");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00.000Z"));
    vi.resetModules();
    fake = makeFakePty();
    vi.mocked(pty.spawn).mockReturnValue(fake as unknown as pty.IPty);
    manager = await import("./manager.js");
  });

  afterEach(() => {
    manager.killAllSessions();
    vi.useRealTimers();
  });

  it("creates a session and lists it as a TerminalSessionInfo", () => {
    const result = manager.createSession({ ...BASE_OPTS, agentId: "agent_1", agentName: "Researcher" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    const list = manager.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: result.session.id,
      agentId: "agent_1",
      agentName: "Researcher",
      attached: false,
      ageMs: 0,
    });
  });

  it("refuses the eleventh session with session_limit_reached, without touching the other ten", () => {
    for (let i = 0; i < MAX_TERMINAL_SESSIONS; i++) {
      const r = manager.createSession(BASE_OPTS);
      expect(r.ok).toBe(true);
    }
    expect(manager.listSessions()).toHaveLength(MAX_TERMINAL_SESSIONS);

    const refused = manager.createSession(BASE_OPTS);
    expect(refused).toEqual({ ok: false, error: "session_limit_reached" });
    expect(manager.listSessions()).toHaveLength(MAX_TERMINAL_SESSIONS);
  });

  it("a session survives all its sinks detaching", () => {
    const result = manager.createSession(BASE_OPTS);
    if (!result.ok) throw new Error("expected ok");
    const ws = makeFakeWs();
    manager.attachSocket(result.session.id, ws as unknown as import("@fastify/websocket").WebSocket);
    expect(manager.listSessions()[0]!.attached).toBe(true);

    ws.triggerClose();

    expect(manager.getSession(result.session.id)).not.toBeNull();
    expect(manager.listSessions()[0]!.attached).toBe(false);
  });

  it("reattaching replays the ring", () => {
    const result = manager.createSession(BASE_OPTS);
    if (!result.ok) throw new Error("expected ok");
    const id = result.session.id;

    fake.emitData("hello ");
    vi.advanceTimersByTime(TERMINAL_OUTPUT_FLUSH_MS);
    fake.emitData("world");
    vi.advanceTimersByTime(TERMINAL_OUTPUT_FLUSH_MS);

    const ws2 = makeFakeWs();
    manager.attachSocket(id, ws2 as unknown as import("@fastify/websocket").WebSocket);

    // The very first send on reattach is the replayed ring.
    expect(ws2.send).toHaveBeenCalledWith("hello world");
  });

  it("onExit closes every sink with 'exited' and removes the session", () => {
    const result = manager.createSession(BASE_OPTS);
    if (!result.ok) throw new Error("expected ok");
    const sink = fakeSink();
    manager.attachSink(result.session.id, sink);

    fake.emitExit(1);

    expect(sink.close).toHaveBeenCalledWith("exited");
    expect(manager.getSession(result.session.id)).toBeNull();
  });

  it("killSession closes sinks with the given reason and kills the pty", () => {
    const result = manager.createSession(BASE_OPTS);
    if (!result.ok) throw new Error("expected ok");
    const sink = fakeSink();
    manager.attachSink(result.session.id, sink);

    expect(manager.killSession(result.session.id, "access_revoked")).toBe(true);

    expect(sink.close).toHaveBeenCalledWith("access_revoked");
    expect(fake.kill).toHaveBeenCalled();
    expect(manager.getSession(result.session.id)).toBeNull();
  });

  it("coalesces a burst of small writes into one flush", () => {
    const result = manager.createSession(BASE_OPTS);
    if (!result.ok) throw new Error("expected ok");
    const sink = fakeSink();
    manager.attachSink(result.session.id, sink);
    sink.write.mockClear(); // drop the empty-ring replay call

    fake.emitData("a");
    fake.emitData("b");
    fake.emitData("c");
    expect(sink.write).not.toHaveBeenCalled(); // nothing flushed yet

    vi.advanceTimersByTime(TERMINAL_OUTPUT_FLUSH_MS);

    expect(sink.write).toHaveBeenCalledTimes(1);
    expect(sink.write).toHaveBeenCalledWith("abc");
  });

  it("the ring keeps every byte even while a burst is still coalescing", () => {
    const result = manager.createSession(BASE_OPTS);
    if (!result.ok) throw new Error("expected ok");
    fake.emitData("a");
    fake.emitData("b");
    // Before the flush timer fires, a fresh attach still replays everything --
    // proof the ring is independent of the coalescer's own buffer.
    const ws = makeFakeWs();
    manager.attachSocket(result.session.id, ws as unknown as import("@fastify/websocket").WebSocket);
    expect(ws.send).toHaveBeenCalledWith("ab");
  });

  it("throttles sustained output, then recovers, with the ring complete throughout", () => {
    const result = manager.createSession(BASE_OPTS);
    if (!result.ok) throw new Error("expected ok");
    const sink = fakeSink();
    manager.attachSink(result.session.id, sink);
    sink.write.mockClear();

    const big = "x".repeat(TERMINAL_THROTTLE_BYTES_PER_SEC + 1);
    let expectedRing = "";

    // Flood for longer than the sustain window, one burst per second.
    const seconds = Math.ceil(TERMINAL_THROTTLE_SUSTAIN_MS / 1000) + 1;
    for (let s = 0; s < seconds; s++) {
      fake.emitData(big);
      expectedRing += big;
      vi.advanceTimersByTime(1000);
    }

    expect(sink.close).not.toHaveBeenCalled();
    const notice = sink.write.mock.calls.find(([chunk]) => String(chunk).includes("throttled"));
    expect(notice).toBeDefined();

    const sinkWritesWhileThrottled = sink.write.mock.calls.length;
    // Still throttled: one more flood burst must not reach the sink.
    fake.emitData(big);
    expectedRing += big;
    expect(sink.write.mock.calls.length).toBe(sinkWritesWhileThrottled);

    // Falls back under budget -- no sustain required to resume, per DD-8.
    vi.advanceTimersByTime(1000);
    fake.emitData("small");
    expectedRing += "small";
    vi.advanceTimersByTime(TERMINAL_OUTPUT_FLUSH_MS);
    expect(sink.write).toHaveBeenCalledWith("small");

    // The ring never dropped a byte, throttled or not.
    const ws = makeFakeWs();
    manager.attachSocket(result.session.id, ws as unknown as import("@fastify/websocket").WebSocket);
    const replayed = ws.send.mock.calls[0]![0] as string;
    expect(expectedRing.endsWith(replayed.slice(-100))).toBe(true);
    expect(replayed.length).toBeGreaterThan(0);
  });
});
