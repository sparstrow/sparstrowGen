import { logger } from "../logger.js";
import type { AgentBackend, AgentMessage, AgentResult, ExecOptions } from "./backend.js";

export interface ExecuteAndDrainOptions extends ExecOptions {
  onEvent?: (event: AgentMessage) => void;
  signal?: AbortSignal;
}

/**
 * Common execution and drain harness, translating Multica's `Daemon.executeAndDrain`.
 *
 * Runs any AgentBackend, drains its message stream (forwarding structured events to
 * onEvent), enforces inactivity watchdog and wall-clock timeout, and awaits final result.
 */
export async function executeAndDrain(
  backend: AgentBackend,
  prompt: string,
  opts: ExecuteAndDrainOptions = {},
): Promise<AgentResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const idleWatchdogMs = opts.idleWatchdogMs ?? 45_000;

  const abortController = new AbortController();
  const forwardAbort = () => abortController.abort();

  if (opts.signal) {
    if (opts.signal.aborted) {
      abortController.abort();
    } else {
      opts.signal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  let session: Awaited<ReturnType<typeof backend.execute>>;
  try {
    session = await backend.execute(prompt, opts, abortController.signal);
  } catch (err) {
    logger.warn({ backend: backend.id, err: err instanceof Error ? err.message : String(err) }, "backend.execute failed");
    return {
      status: "failed",
      output: "",
      error: err instanceof Error ? err.message : String(err),
      durationMs: 0,
    };
  }

  let timeoutTimer: NodeJS.Timeout | null = null;
  let watchdogTimer: NodeJS.Timeout | null = null;
  let inFlightTools = 0;
  let isDone = false;

  const resetWatchdog = () => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    if (idleWatchdogMs <= 0 || isDone) return;

    // While a tool is in flight, allow longer budget (e.g. 3x)
    const effectiveBudget = inFlightTools > 0 ? idleWatchdogMs * 3 : idleWatchdogMs;
    watchdogTimer = setTimeout(() => {
      if (isDone) return;
      logger.warn({ backend: backend.id, inFlightTools }, "agent idle watchdog tripped");
      session.cancel();
      abortController.abort();
    }, effectiveBudget);
    watchdogTimer.unref?.();
  };

  if (timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      if (isDone) return;
      logger.warn({ backend: backend.id, timeoutMs }, "agent wall-clock timeout fired");
      session.cancel();
      abortController.abort();
    }, timeoutMs);
    timeoutTimer.unref?.();
  }

  resetWatchdog();

  // Drain message stream in background
  const drainStream = async () => {
    try {
      for await (const message of session.messages) {
        if (message.type === "tool_use") {
          inFlightTools++;
        } else if (message.type === "tool_result") {
          inFlightTools = Math.max(0, inFlightTools - 1);
        }

        resetWatchdog();

        if (opts.onEvent) {
          try {
            opts.onEvent(message);
          } catch (e) {
            logger.warn({ err: e }, "onEvent callback threw");
          }
        }
      }
    } catch (streamErr) {
      if (!abortController.signal.aborted) {
        logger.warn({ streamErr }, "error draining session messages");
      }
    }
  };

  const drainPromise = drainStream();

  let finalResult: AgentResult;
  try {
    const rawResult = await session.result;
    finalResult = rawResult;
  } catch (err) {
    finalResult = {
      status: abortController.signal.aborted ? "timeout" : "failed",
      output: "",
      error: err instanceof Error ? err.message : String(err),
      durationMs: 0,
    };
  } finally {
    isDone = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (watchdogTimer) clearTimeout(watchdogTimer);
    if (opts.signal) {
      opts.signal.removeEventListener("abort", forwardAbort);
    }
  }

  await drainPromise.catch(() => {});
  return finalResult;
}
