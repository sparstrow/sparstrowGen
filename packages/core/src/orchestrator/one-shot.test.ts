import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, ProviderId } from "@sparstrow/shared";
import { config } from "../config.js";
import type { CliProvider, NormalizedEvent } from "../providers/types.js";

/**
 * M12, T-M12-04's `onEvent` addition to `completeOnce` — a REAL child
 * process (a short `node -e` script standing in for a CLI provider), not a
 * mocked spawn, so this proves the actual readline/stdout wiring rather than
 * an assumption about it. One-shot.ts has no other test file; this is
 * intentionally narrow — only the new `onEvent` behavior, not a general
 * spawn-path regression suite.
 */

vi.mock("../providers/index.js", () => ({
  getProvider: vi.fn(),
}));

import { getProvider } from "../providers/index.js";
import { completeOnce } from "./one-shot.js";

function agent(): Agent {
  return {
    id: "a1",
    name: "Test",
    slug: "test",
    role: "",
    systemPrompt: "",
    provider: "claude-code" as ProviderId,
    model: "sonnet",
    cwd: null,
    addDirs: [],
    allowedTools: [],
    disallowedTools: [],
    permissionMode: "default",
    mcpServers: {},
    maxTurns: null,
    memoryReadScopes: [],
    memoryWriteScopes: [],
    extraArgs: [],
    enabled: true,
    signalExtraction: false,
    isSystem: false,
    origin: "user",
    status: "active",
    specterReport: null,
    importId: null,
    sandboxProjectId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Agent;
}

/** Fake CLI provider whose subprocess prints a few JSON lines with real
 *  delays between them, then a terminal "result" line. */
function fakeCliProvider(lines: string[], delayMs = 15): CliProvider {
  const script = `
    const lines = ${JSON.stringify(lines)};
    let i = 0;
    const timer = setInterval(() => {
      console.log(lines[i]);
      i++;
      if (i >= lines.length) clearInterval(timer);
    }, ${delayMs});
  `;

  return {
    id: "claude-code" as ProviderId,
    kind: "cli",
    listModels: () => [],
    buildHeadlessSpawn: () => ({
      command: process.execPath,
      args: ["-e", script],
      cwd: process.cwd(),
      env: {},
    }),
    buildInteractiveSpawn: () => {
      throw new Error("not used in this test");
    },
    parseLine: (line: string): NormalizedEvent[] => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        return [{ type: obj.type as NormalizedEvent["type"], payload: obj }];
      } catch {
        return [];
      }
    },
    // Same shape as claude-code.ts's real extractResult: a terminal "result"
    // event wins; otherwise fall back to the last "assistant" event's text.
    // That fallback IS the progressive signal onEvent relies on.
    extractResult: (events) => {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i]!;
        if (e.type === "result") {
          const payload = e.payload as { result: string };
          return { resultText: payload.result, costUsd: null, numTurns: null, sessionId: null, isError: false };
        }
      }
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i]!;
        if (e.type === "assistant") {
          const payload = e.payload as { text: string };
          return {
            resultText: payload.text,
            costUsd: null,
            numTurns: null,
            sessionId: null,
            isError: true,
            errorMessage: "no result event yet",
          };
        }
      }
      return { resultText: null, costUsd: null, numTurns: null, sessionId: null, isError: true, errorMessage: "none" };
    },
    healthCheck: async () => ({ status: "ok" }) as never,
  };
}

describe("completeOnce — onEvent", () => {
  let originalTmpDir: string;

  beforeEach(() => {
    originalTmpDir = config.tmpDir;
    config.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-oneshot-"));
  });

  afterEach(() => {
    fs.rmSync(config.tmpDir, { recursive: true, force: true });
    config.tmpDir = originalTmpDir;
    vi.restoreAllMocks();
  });

  it("fires with the progressive text, then the final text, in order", async () => {
    vi.mocked(getProvider).mockReturnValue(
      fakeCliProvider([
        JSON.stringify({ type: "assistant", text: "Hel" }),
        JSON.stringify({ type: "assistant", text: "Hello" }),
        JSON.stringify({ type: "result", result: "Hello there!" }),
      ]),
    );

    const seen: { seq: number; replyText: string }[] = [];
    const result = await completeOnce(agent(), "hi", {
      timeoutMs: 5_000,
      onEvent: (delta) => seen.push(delta),
    });

    expect(result.text).toBe("Hello there!");
    expect(seen.map((d) => d.replyText)).toEqual(["Hel", "Hello", "Hello there!"]);
    // seq is a local monotonic counter, not anything from the wire.
    expect(seen.map((d) => d.seq)).toEqual([1, 2, 3]);
  });

  it("does not fire twice for the same text (system/status lines between two identical states)", async () => {
    vi.mocked(getProvider).mockReturnValue(
      fakeCliProvider([
        JSON.stringify({ type: "assistant", text: "same" }),
        JSON.stringify({ type: "system", subtype: "noop" }),
        JSON.stringify({ type: "result", result: "same" }),
      ]),
    );

    const seen: string[] = [];
    await completeOnce(agent(), "hi", { timeoutMs: 5_000, onEvent: (d) => seen.push(d.replyText) });

    // "same" -> "same" is not a change, so onEvent should fire once, not twice.
    expect(seen).toEqual(["same"]);
  });

  it("is fully optional — omitting it changes nothing about the result", async () => {
    vi.mocked(getProvider).mockReturnValue(
      fakeCliProvider([JSON.stringify({ type: "result", result: "fine" })]),
    );

    const result = await completeOnce(agent(), "hi", { timeoutMs: 5_000 });
    expect(result.text).toBe("fine");
    expect(result.isError).toBe(false);
  });
});
