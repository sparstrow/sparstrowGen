import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import treeKill from "tree-kill";
import { nanoid } from "nanoid";
import type { Agent } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getProvider } from "../providers/index.js";
import type { NormalizedEvent } from "../providers/types.js";

export interface CompleteOnceOptions {
  /** Hard ceiling for the turn; the process tree is killed past it. */
  timeoutMs?: number;
  /** Resume an earlier provider session (multi-turn interview). */
  resumeSessionId?: string;
}

export interface CompleteOnceResult {
  text: string | null;
  sessionId: string;
  isError: boolean;
  errorMessage?: string;
}

/**
 * Fire a single headless model turn and await its result — NO run row, NO
 * memory injection, NO concurrency queue, short timeout. Reuses the same
 * provider spawn/parse layer RunManager uses (this realizes the reviewed
 * `createRunAndAwait` decision as a focused helper rather than bolting a
 * second lifecycle onto the queue-oriented RunManager).
 *
 * Built for the Agent Creator's /agents/draft endpoint, which needs a quick
 * synchronous structured reply, not a tracked long-running run. Passing an
 * empty runId makes the provider skip memory-MCP wiring.
 */
export async function completeOnce(
  agent: Agent,
  prompt: string,
  opts: CompleteOnceOptions = {},
): Promise<CompleteOnceResult> {
  const provider = getProvider(agent.provider);
  const sessionId = opts.resumeSessionId ?? crypto.randomUUID();
  const tempDir = path.join(config.tmpDir, `draft_${nanoid(8)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const spec = provider.buildHeadlessSpawn(agent, prompt, {
    runId: "", // no run context → provider skips memory-MCP + run-scoped tools
    tempDir,
    sessionId,
    resumeSessionId: opts.resumeSessionId,
  });

  const timeoutMs = opts.timeoutMs ?? 90_000;
  const events: NormalizedEvent[] = [];
  const stderr: string[] = [];

  return await new Promise<CompleteOnceResult>((resolve) => {
    const child = spawn(
      spec.viaCmdShell ? "cmd.exe" : spec.command,
      spec.viaCmdShell ? ["/d", "/s", "/c", spec.command, ...spec.args] : spec.args,
      {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) treeKill(child.pid, "SIGTERM");
    }, timeoutMs);

    const finish = (result: CompleteOnceResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rm(tempDir, { recursive: true, force: true }, () => {});
      resolve(result);
    };

    if (spec.stdinData != null && child.stdin) {
      child.stdin.write(spec.stdinData);
      child.stdin.end();
    }
    if (child.stdout) {
      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        for (const ev of provider.parseLine(line)) events.push(ev);
      });
    }
    if (child.stderr) {
      readline.createInterface({ input: child.stderr }).on("line", (line) => {
        if (stderr.length < 50) stderr.push(line);
      });
    }

    child.on("error", (err) => {
      logger.warn({ err }, "draft turn spawn error");
      finish({ text: null, sessionId, isError: true, errorMessage: err.message });
    });

    child.on("close", () => {
      if (timedOut) {
        finish({ text: null, sessionId, isError: true, errorMessage: "draft turn timed out" });
        return;
      }
      const result = provider.extractResult(events);
      finish({
        text: result.resultText,
        sessionId: result.sessionId ?? sessionId,
        isError: result.isError,
        errorMessage: result.errorMessage,
      });
    });
  });
}
