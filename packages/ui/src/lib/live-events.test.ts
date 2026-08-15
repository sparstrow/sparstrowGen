import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent, WsServerEvent } from "@sparstrow/shared";

/**
 * `wsHub` touches `window.location` the moment it actually opens a socket
 * (`connect()`), and this suite runs under vitest's default `node`
 * environment — there is no `window`. Mocking `./ws` entirely means these
 * tests exercise `WsHubLiveEventSource`'s own reshaping logic without ever
 * reaching real connection code, which is `ws.ts`'s own concern and already
 * unrelated to what this file adds.
 */
type Listener = (event: WsServerEvent) => void;
type StatusListener = (connected: boolean) => void;

const listeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();
let mockConnected = false;

vi.mock("./ws", () => ({
  wsHub: {
    subscribe: (fn: Listener) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onStatusChange: (fn: StatusListener) => {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    get isConnected() {
      return mockConnected;
    },
  },
}));

function publish(event: WsServerEvent) {
  for (const fn of listeners) fn(event);
}

function setConnected(value: boolean) {
  mockConnected = value;
  for (const fn of statusListeners) fn(value);
}

function runEvent(runId: string, seq: number): RunEvent {
  return { runId, seq, ts: "2026-08-12T00:00:00Z", type: "assistant", payload: {} };
}

describe("WsHubLiveEventSource", () => {
  beforeEach(() => {
    listeners.clear();
    statusListeners.clear();
    mockConnected = false;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("delivers only run.event frames for the subscribed runId", async () => {
    const { wsHubLiveEventSource } = await import("./live-events");
    const received: RunEvent[] = [];
    wsHubLiveEventSource.subscribeRun("run_1", (e) => received.push(e));

    publish({ type: "run.event", runId: "run_2", event: runEvent("run_2", 0) }); // different run
    publish({ type: "run.updated", run: { id: "run_1" } as never }); // different frame type
    publish({ type: "run.event", runId: "run_1", event: runEvent("run_1", 0) });

    expect(received).toHaveLength(1);
    expect(received[0]?.seq).toBe(0);
  });

  it("stops delivering once unsubscribed", async () => {
    const { wsHubLiveEventSource } = await import("./live-events");
    const received: RunEvent[] = [];
    const unsubscribe = wsHubLiveEventSource.subscribeRun("run_1", (e) => received.push(e));

    publish({ type: "run.event", runId: "run_1", event: runEvent("run_1", 0) });
    unsubscribe();
    publish({ type: "run.event", runId: "run_1", event: runEvent("run_1", 1) });

    expect(received).toHaveLength(1);
  });

  it("reflects wsHub's own connection state", async () => {
    const { wsHubLiveEventSource } = await import("./live-events");
    expect(wsHubLiveEventSource.isConnected).toBe(false);
    setConnected(true);
    expect(wsHubLiveEventSource.isConnected).toBe(true);
  });

  it("forwards status changes to onStatusChange listeners", async () => {
    const { wsHubLiveEventSource } = await import("./live-events");
    const seen: boolean[] = [];
    wsHubLiveEventSource.onStatusChange((c) => seen.push(c));
    setConnected(true);
    setConnected(false);
    expect(seen).toEqual([true, false]);
  });
});
