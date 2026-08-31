import { randomUUID } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import type { PairResponse, StartPairingAttemptResponse } from "@sparstrow/shared";
import { logger } from "../logger.js";
import { cloudFetch, getRuntimeId, getWorkspaceId, savePairing } from "./client.js";
import { describeMachine } from "./registration.js";
import { clearCloudLinks } from "./resolve.js";

/**
 * Browser-loopback pairing — replaces the pairing-code exchange
 * (`pairWithCode`, removed) with the flow `doc/plans/2026-08-31-browser-
 * loopback-pairing.md` describes: this machine registers a pairing attempt,
 * opens the owner's browser to confirm it on an already signed-in session,
 * and only THIS process — never the browser — ever exchanges the approved
 * attempt for the real daemon token. See that plan's Decisions section
 * ("Two-phase approve-then-exchange, not mint-then-redirect") for why the
 * token is minted here and not by the web app before the browser redirects.
 *
 * Modeled on multica's `multica login`
 * (`references/multica/server/cmd/multica/cmd_auth.go:238`) and its web
 * confirm screen (`references/multica/packages/views/auth/login-page.tsx`),
 * adapted so the real credential never transits the browser at all — see
 * this file's own header comments below for where that departs from
 * multica's simpler (browser-carries-the-final-token) version.
 *
 * Deliberately usable without a running core, same as the old flow: pairing
 * has to work on a machine where core is installed but stopped, which is the
 * normal first-run state.
 */

export type PairFailure =
  | "unknown_attempt"
  | "attempt_not_approved"
  | "attempt_already_consumed"
  | "attempt_expired"
  | "invalid_callback"
  | "invalid_request"
  | "no_browser"
  | "timeout"
  | "unreachable"
  | "server_error";

export class PairError extends Error {
  readonly failure: PairFailure;
  constructor(failure: PairFailure, message: string) {
    super(message);
    this.name = "PairError";
    this.failure = failure;
  }
}

const MESSAGES: Record<PairFailure, string> = {
  unknown_attempt:
    "That pairing attempt was not recognised by the control plane. Run `sparstrow pair` again.",
  attempt_not_approved: "The pairing attempt was exchanged before it was approved. This is a bug — run `sparstrow pair` again.",
  attempt_already_consumed:
    "That pairing attempt has already been used. Run `sparstrow pair` again to start a fresh one.",
  attempt_expired: "That pairing attempt expired. Run `sparstrow pair` again and confirm within 5 minutes.",
  invalid_callback: "This machine could not register a valid callback address. This is a bug.",
  invalid_request: "This machine could not describe itself to the control plane.",
  no_browser:
    "Could not open a browser automatically. Open the URL above manually to finish pairing.",
  timeout:
    "Timed out waiting for the browser to confirm. The tab may have been closed, or `Authorize this machine` was never pressed.",
  unreachable: "Could not reach the control plane.",
  server_error: "The control plane could not complete pairing.",
};

/** How long this process waits for the browser to reach its local listener,
 *  matching the control plane's own attempt TTL (apps/web/…/pair/route.ts). */
const ATTEMPT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Reported to the browser confirm page while `sparstrow pair` is waiting, and
 * printed to the terminal. A caller wanting quieter output can ignore these.
 */
export interface PairProgress {
  onListening?: (confirmUrl: string) => void;
  onBrowserOpenFailed?: (confirmUrl: string) => void;
  onWaiting?: () => void;
}

/**
 * Pair this machine via the browser-loopback flow, and store the resulting
 * token.
 *
 * `runtimeId` reuses whatever this machine used the last time it completed a
 * pairing (`getRuntimeId()`), so a re-pair — `--force`, without an
 * intervening `--unpair` — lands on the same `runtimes` row instead of
 * leaving the old one orphaned in the workspace forever (spec FR-008,
 * `exchange_pairing_attempt`'s upsert). A machine that has never paired, or
 * that ran `--unpair` first, gets a fresh id.
 */
export async function pairViaBrowser(
  name?: string | null,
  progress: PairProgress = {},
  /** Overridable only for tests — production callers always get the real
   *  5-minute window, matched to the control plane's own attempt TTL. */
  timeoutMs: number = ATTEMPT_TIMEOUT_MS,
): Promise<PairResponse> {
  const identity = await describeMachine(name);
  const runtimeId = getRuntimeId() ?? randomUUID();

  let attemptId = "";
  let settled = false;
  let resolveWait: (() => void) | null = null;
  let rejectWait: ((err: unknown) => void) | null = null;
  const waitForBrowser = new Promise<void>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  // A single mutable box rather than two separate `let`s: both are written
  // only from inside the closure below, and reading either back out through
  // the outer function's control flow is simpler to get right as one object
  // than as two variables TypeScript has to track independently across the
  // closure boundary.
  const outcome: { result: PairResponse | null; error: unknown } = { result: null, error: null };

  const server = http.createServer((req, res) => {
    void handleCallback(req, res, async () => {
      if (settled) {
        // A second request after the first already resolved this attempt —
        // a double-click, a reloaded tab. Nothing to redo; say so plainly
        // rather than exchanging twice (the RPC would reject the second
        // exchange anyway, but this avoids the round trip).
        return { ok: true, alreadyDone: true };
      }
      settled = true;
      try {
        outcome.result = await cloudFetch<PairResponse>("/pair/exchange", {
          anonymous: true,
          body: { attemptId },
          retries: 1,
        });
        resolveWait?.();
        return { ok: true, alreadyDone: false };
      } catch (err) {
        outcome.error = err;
        rejectWait?.(err);
        return { ok: false, alreadyDone: false, message: describeExchangeError(err) };
      }
    });
  });

  const port = await listen(server);
  const callback = `http://127.0.0.1:${port}/callback`;

  try {
    let start: StartPairingAttemptResponse;
    try {
      start = await cloudFetch<StartPairingAttemptResponse>("/pair", {
        anonymous: true,
        body: { runtimeId, callback, ...identity },
        retries: 1,
      });
    } catch (err) {
      throw toPairError(err);
    }
    attemptId = start.attemptId;

    progress.onListening?.(start.confirmUrl);
    const opened = await openBrowser(start.confirmUrl);
    if (!opened) progress.onBrowserOpenFailed?.(start.confirmUrl);
    progress.onWaiting?.();

    await withTimeout(waitForBrowser, timeoutMs);
  } catch (err) {
    if (err instanceof PairError) throw err;
    if (err === TIMEOUT) throw new PairError("timeout", MESSAGES.timeout);
    throw toPairError(err);
  } finally {
    server.close();
  }

  if (outcome.error) throw toPairError(outcome.error);
  const response = outcome.result;
  if (!response?.token || !response.runtimeId || !response.workspaceId) {
    throw new PairError("server_error", MESSAGES.server_error);
  }

  // M4: cloud ids only mean anything within one workspace — cleared before
  // the new pairing is saved so a crash in between leaves no links rather
  // than wrong ones. Same reasoning `pairWithCode` used to carry.
  const previousWorkspaceId = getWorkspaceId();
  if (previousWorkspaceId && previousWorkspaceId !== response.workspaceId) {
    try {
      clearCloudLinks();
      logger.info("paired to a different workspace — cleared cloud id links");
    } catch (err) {
      logger.debug({ err }, "could not clear cloud links while re-pairing");
    }
  }

  savePairing({
    token: response.token,
    runtimeId: response.runtimeId,
    workspaceId: response.workspaceId,
  });

  return response;
}

const TIMEOUT = Symbol("pairing-timeout");

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(TIMEOUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

type CallbackResult = { ok: true; alreadyDone: boolean } | { ok: false; alreadyDone: false; message: string };

async function handleCallback(
  req: IncomingMessage,
  res: ServerResponse,
  exchange: () => Promise<CallbackResult>,
): Promise<void> {
  const path = (req.url ?? "/").split("?")[0];
  if (path !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const result = await exchange();
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(result.ok ? successHtml(result.alreadyDone) : failureHtml(result.message));
}

/** Best-effort — a failure here is reported via `onBrowserOpenFailed`, never
 *  thrown, since the confirm URL printed to the terminal is always a valid
 *  fallback (spec FR-006). */
async function openBrowser(url: string): Promise<boolean> {
  const command =
    process.platform === "win32"
      ? { cmd: "cmd", args: ["/c", "start", '""', url] }
      : process.platform === "darwin"
        ? { cmd: "open", args: [url] }
        : { cmd: "xdg-open", args: [url] };

  return new Promise((resolve) => {
    try {
      const child = spawn(command.cmd, command.args, { stdio: "ignore", detached: true });
      child.on("error", () => resolve(false));
      child.unref();
      // spawn's callback fires asynchronously even on success; there is no
      // "it opened" signal from the OS, so unref-and-assume-success is the
      // same trade every CLI that shells out to `open`/`xdg-open` makes.
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

function toPairError(err: unknown): PairError {
  const reason = (err as { reason?: string })?.reason;
  if (reason && reason in MESSAGES) {
    const failure = reason as PairFailure;
    return new PairError(failure, MESSAGES[failure]);
  }

  const status = (err as { status?: number | null })?.status ?? null;
  if (status === null) {
    const detail = err instanceof Error ? err.message : String(err);
    return new PairError("unreachable", detail || MESSAGES.unreachable);
  }

  return new PairError("server_error", MESSAGES.server_error);
}

function describeExchangeError(err: unknown): string {
  return toPairError(err).message;
}

function successHtml(alreadyDone: boolean): string {
  const body = alreadyDone
    ? "This pairing was already completed. You can close this tab."
    : "Your machine is paired. You can close this tab and go back to the terminal.";
  return page("Paired", body, true);
}

function failureHtml(message: string): string {
  return page("Pairing failed", message, false);
}

function page(title: string, body: string, ok: boolean): string {
  const accent = ok ? "#22c55e" : "#ef4444";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sparstrow — ${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0a0a0a; color: #e5e5e5;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
  }
  .card { max-width: 26rem; padding: 2rem; text-align: center; }
  .dot { width: 2.5rem; height: 2.5rem; border-radius: 999px; background: ${accent}22; color: ${accent};
    display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; font-size: 1.25rem; }
  h1 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
  p { font-size: 0.875rem; color: #a3a3a3; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <div class="dot" aria-hidden="true">${ok ? "&#10003;" : "&#10005;"}</div>
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}
