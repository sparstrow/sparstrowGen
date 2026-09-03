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
import { agentChildEnv } from "./child-env.js";
import { getProvider } from "../providers/index.js";
import type { NormalizedEvent } from "../providers/types.js";

export interface CompleteOnceOptions {
  /** Hard ceiling for the turn; the process tree is killed past it. */
  timeoutMs?: number;
  /** Resume an earlier provider session (multi-turn interview). */
  resumeSessionId?: string;
  /**
   * M12 — fired with the FULL accumulated reply text so far, each time a new
   * stdout line changes it. Additive: every existing caller omits this and is
   * unaffected. `seq` is a locally-assigned monotonic counter (one per call
   * to this function), not anything from the provider's own wire format —
   * callers that persist it (the cloud chat-turn executor) are the ones who
   * give it meaning.
   *
   * Whole-message granularity, not token-level deltas: `parseLine` for every
   * CLI provider today normalizes a provider's own `stream_event` lines into
   * an opaque `status` event without extracting partial text, so the finest
   * signal available is "a new complete assistant message arrived." See
   * doc/tasks/M12/T-M12-04's Result section and KnownGaps G-30.
   */
  onEvent?: (delta: { seq: number; replyText: string }) => void;
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
  // completeOnce is the CLI-only one-shot path (Agent Creator drafts). Direct-API
  // agents run through the normal tool-loop path, never here.
  if (provider.kind !== "cli") {
    throw new Error(`completeOnce supports CLI providers only (got ${agent.provider})`);
  }
  const cli = provider;
  const sessionId = opts.resumeSessionId ?? crypto.randomUUID();
  const tempDir = path.join(config.tmpDir, `draft_${nanoid(8)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const spec = cli.buildHeadlessSpawn(agent, prompt, {
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
        // EC2 (P7): allowlisted child env — no process.env spread into agents.
        env: agentChildEnv(spec.env),
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
    let lastEmitted: string | null = null;
    let onEventSeq = 0;

    if (child.stdout) {
      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        for (const ev of cli.parseLine(line)) events.push(ev);

        if (!opts.onEvent) return;
        // Reuses the provider's own result-extraction logic on the PARTIAL
        // event list rather than re-deriving "the text so far" — before a
        // terminal `result` event arrives this falls through to the last
        // complete assistant message seen (see each provider's
        // `extractResult`), which is exactly the progressive signal a chat
        // subscriber wants. Only fires on a genuine change, so a run of
        // system/status lines between two assistant messages does not spam
        // the callback with the same text repeated.
        const partial = cli.extractResult(events).resultText;
        if (partial != null && partial !== lastEmitted) {
          lastEmitted = partial;
          opts.onEvent({ seq: ++onEventSeq, replyText: partial });
        }
      });
    }
    if (child.stderr) {
      readline.createInterface({ input: child.stderr }).on("line", (line) => {
        if (stderr.length < 50) stderr.push(line);
      });
    }

    child.on("error", (err) => {
      // Not draft-specific despite the historical name: this is completeOnce,
      // shared by the Agent Creator's draft flow AND M12's cloud chat turn
      // executor (server/src/cloud/chat-turn.ts). A caller-neutral
      // message here is what a chat turn's TurnErrorBanner actually renders
      // to the owner -- "draft turn spawn error"/"draft turn timed out" read
      // as a bug report copy-pasted from the wrong feature when a Free/
      // Project/Agent session's reply fails, which is what happened before
      // this was caught live (T-M13-05).
      logger.warn({ err }, "completeOnce: provider process failed to start");
      finish({ text: null, sessionId, isError: true, errorMessage: err.message });
    });

    child.on("close", () => {
      if (timedOut) {
        finish({ text: null, sessionId, isError: true, errorMessage: "the provider timed out" });
        return;
      }
      const result = cli.extractResult(events);
      finish({
        text: result.resultText,
        sessionId: result.sessionId ?? sessionId,
        isError: result.isError,
        errorMessage: result.errorMessage,
      });
    });
  });
}
