import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as pty from "node-pty";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { killAllSessions } from "../terminal/manager.js";

vi.mock("node-pty", () => ({ spawn: vi.fn() }));

const sendMachineReply = vi.fn();
const onMachineRequest = vi.fn();
const openSessionChannel = vi.fn().mockReturnValue(null);
vi.mock("./realtime.js", () => ({
  sendMachineReply: (...args: unknown[]) => sendMachineReply(...args),
  onMachineRequest: (...args: unknown[]) => onMachineRequest(...args),
  openSessionChannel: (...args: unknown[]) => openSessionChannel(...args),
}));

// Static import, deliberately no vi.resetModules(): this module and the test
// file both reach into ../db/connection.js's module-level singleton, and
// resetting the module registry would give one of them a second, unopened
// instance instead of the shared one this test relies on.
const bridge = await import("./terminal-bridge.js");

function makeFakePty() {
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
  };
}

describe("terminal bridge", () => {
  beforeEach(() => {
    sendMachineReply.mockClear();
    openSessionChannel.mockClear().mockReturnValue(null);
    closeDb();
    openDb(":memory:");
    vi.mocked(pty.spawn).mockReturnValue(makeFakePty() as unknown as pty.IPty);
  });

  afterEach(() => {
    killAllSessions();
    closeDb();
  });

  it("drops a malformed request without throwing, and answers nothing", async () => {
    await expect(bridge.handleMachineRequest({ kind: "not.a.thing" })).resolves.toBeUndefined();
    expect(sendMachineReply).not.toHaveBeenCalled();
  });

  it("terminal.list replies with the current sessions and a machineStartedAt", async () => {
    await bridge.handleMachineRequest({ requestId: "r1", kind: "terminal.list" });
    expect(sendMachineReply).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "r1", kind: "terminal.list", sessions: [], machineStartedAt: expect.any(String) }),
    );
  });

  it("terminal.close on an unknown session replies unknown_session", async () => {
    await bridge.handleMachineRequest({ requestId: "r2", kind: "terminal.close", sessionId: "term_missing" });
    expect(sendMachineReply).toHaveBeenCalledWith({ requestId: "r2", kind: "terminal.close", error: "unknown_session" });
  });

  it("terminal.attach on an unknown session replies unknown_session", async () => {
    await bridge.handleMachineRequest({ requestId: "r3", kind: "terminal.attach", sessionId: "term_missing", cols: 80, rows: 24 });
    expect(sendMachineReply).toHaveBeenCalledWith({ requestId: "r3", kind: "terminal.attach", error: "unknown_session" });
  });

  it("terminal.open succeeds when the setting is absent (default on)", async () => {
    await bridge.handleMachineRequest({ requestId: "r4", kind: "terminal.open", cols: 80, rows: 24 });
    const call = sendMachineReply.mock.calls.find(([reply]) => reply.requestId === "r4");
    expect(call?.[0]).toMatchObject({ requestId: "r4", kind: "terminal.open" });
    expect(call?.[0].session).toBeDefined();
  });

  it("terminal.open refuses with terminal_access_disabled when the setting is off", async () => {
    getDb().insert(settings).values({ key: "terminal.access", value: "false" }).run();

    await bridge.handleMachineRequest({ requestId: "r5", kind: "terminal.open", cols: 80, rows: 24 });
    expect(sendMachineReply).toHaveBeenCalledWith({ requestId: "r5", kind: "terminal.open", error: "terminal_access_disabled" });
  });

  it("terminal.attach also refuses with terminal_access_disabled when the setting is off", async () => {
    // Open one first, while access is still on.
    await bridge.handleMachineRequest({ requestId: "ropen", kind: "terminal.open", cols: 80, rows: 24 });
    const opened = sendMachineReply.mock.calls.find(([reply]) => reply.requestId === "ropen")?.[0];
    const sessionId = opened.session.id as string;
    sendMachineReply.mockClear();

    getDb().insert(settings).values({ key: "terminal.access", value: "off" }).run();

    await bridge.handleMachineRequest({ requestId: "r6", kind: "terminal.attach", sessionId, cols: 80, rows: 24 });
    expect(sendMachineReply).toHaveBeenCalledWith({ requestId: "r6", kind: "terminal.attach", error: "terminal_access_disabled" });
  });
});
