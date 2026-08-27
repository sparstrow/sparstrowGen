import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";
import {
  MACHINE_REPLY_EVENT,
  MACHINE_REQUEST_EVENT,
  TERMINAL_INPUT_EVENT,
  TERMINAL_OUTPUT_EVENT,
  machineControlTopic,
  terminalSessionTopic,
  type RealtimeCredential,
} from "@sparstrow/shared";
import { logger } from "../logger.js";
import { CloudAuthError, cloudFetch, getRuntimeId, getWorkspaceId, isPaired } from "./client.js";

/**
 * M16 — the daemon's own Realtime connection.
 *
 * Knows about credentials, connections, channels and backoff. Knows nothing
 * about terminals — `terminal-bridge.ts` is the only caller, and it reaches
 * this module through `onMachineRequest` / `sendMachineReply` /
 * `openSessionChannel` rather than touching `RealtimeClient` directly, so the
 * next live surface (I-11) can register its own handler without touching
 * connection code.
 *
 * A machine with no Realtime connection still runs dispatched work exactly
 * as it does today — this is a capability core gained, not a dependency it
 * acquired, the same sentence `client.ts` opens with about the cloud
 * generally. Failure discipline mirrors `heartbeat.ts` deliberately: log the
 * connectivity edge once, back off, never reject into core's startup path,
 * never touch the command loop.
 *
 * Core has never talked to Supabase directly before this — every other cloud
 * call goes through `cloudFetch` to `/api/daemon/*` on the Next app. The
 * Realtime endpoint, the anon key and the token all come from ONE call to
 * that same surface (`POST /realtime/token`, T-M16-02) rather than from any
 * separately configured Supabase credential.
 */

let client: RealtimeClient | null = null;
let controlChannel: RealtimeChannel | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let backoffTimer: NodeJS.Timeout | null = null;
let pairingCheckTimer: NodeJS.Timeout | null = null;
let backoffAttempt = 0;
let connecting = false;
let stopped = true;
let healthy = true;
let requestHandler: ((payload: unknown) => void) | null = null;

/** How often an unpaired-or-disconnected machine checks whether it should try
 *  again — the same property `heartbeat.ts`'s interval gives pairing: takes
 *  effect without a restart. Not used while backoff already owns the retry. */
const PAIRING_CHECK_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;

function backoffDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
}

function logUnhealthy(detail: string): void {
  if (healthy) {
    healthy = false;
    logger.warn({ detail }, "cloud Realtime connection unreachable — retrying in the background");
  }
}

function logHealthy(): void {
  if (!healthy) {
    healthy = true;
    logger.info("cloud Realtime connection reachable again");
  }
}

function teardown(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  const channel = controlChannel;
  controlChannel = null;
  if (channel) void channel.unsubscribe();
  const realtime = client;
  client = null;
  if (realtime) realtime.disconnect();
}

function scheduleBackoff(): void {
  if (stopped || backoffTimer) return;
  const delay = backoffDelay(backoffAttempt++);
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void establish();
  }, delay);
  backoffTimer.unref?.();
}

async function mintCredential(): Promise<RealtimeCredential> {
  return cloudFetch<RealtimeCredential>("/realtime/token", { retries: 0, timeoutMs: 10_000 });
}

function scheduleRefresh(credential: RealtimeCredential): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const ttlMs = new Date(credential.expiresAt).getTime() - Date.now();
  // 80% of the credential's life (DD-2's own number), floored so a clock
  // anomaly or a very short TTL never schedules a refresh in the past.
  const refreshInMs = Math.max(ttlMs * 0.8, 1_000);
  refreshTimer = setTimeout(() => void refresh(), refreshInMs);
  refreshTimer.unref?.();
}

/**
 * Re-mint and hand the new token to the live client via `setAuth` — the
 * connection is never torn down to refresh it.
 *
 * A refresh that fails does NOT drop the connection: the existing credential
 * is valid until its own `exp`, so failing at 80% still leaves 20% of its
 * life to keep retrying in. If refreshing keeps failing all the way to
 * `exp`, Realtime itself will reject the now-stale token and the control
 * channel's own status callback (`onChannelStatus`) is what notices and
 * reconnects — this function does not need to detect expiry itself.
 */
async function refresh(): Promise<void> {
  if (stopped || !client) return;
  try {
    const credential = await mintCredential();
    await client.setAuth(credential.token);
    scheduleRefresh(credential);
    logHealthy();
  } catch (err) {
    if (err instanceof CloudAuthError) {
      handleAuthError(err);
      return;
    }
    logUnhealthy(err instanceof Error ? err.message : String(err));
    // A short, fixed retry rather than the full backoff ladder: the
    // connection is still up, so this is a courtesy retry, not a
    // reconnection attempt.
    refreshTimer = setTimeout(() => void refresh(), 30_000);
    refreshTimer.unref?.();
  }
}

/** 403 (revoked) stops for good, matching `heartbeat.ts`/`commands.ts`'s own
 *  handling of the same signal — one re-pair message, not three. 401 (rejected
 *  but not revoked, usually a fresh `sparstrow pair` while core was running)
 *  tears down and lets the next attempt re-read pairing state fresh. */
function handleAuthError(err: CloudAuthError): void {
  if (err.revoked) {
    logger.warn(
      "this machine's pairing was revoked — stopping the Realtime connection. Run `sparstrow pair <code>` to reconnect.",
    );
    stopRealtimeConnection();
    return;
  }
  teardown();
  scheduleBackoff();
}

function onChannelStatus(status: string, err?: Error): void {
  if (status === "SUBSCRIBED") {
    backoffAttempt = 0;
    logHealthy();
    return;
  }
  if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
    if (stopped) return;
    logUnhealthy(err?.message ?? status);
    teardown();
    scheduleBackoff();
  }
}

async function establish(): Promise<void> {
  if (stopped || client || connecting) return;
  if (!isPaired()) return;

  const workspaceId = getWorkspaceId();
  const runtimeId = getRuntimeId();
  if (!workspaceId || !runtimeId) return;

  connecting = true;
  try {
    let credential: RealtimeCredential;
    try {
      credential = await mintCredential();
    } catch (err) {
      if (err instanceof CloudAuthError) {
        handleAuthError(err);
        return;
      }
      logUnhealthy(err instanceof Error ? err.message : String(err));
      scheduleBackoff();
      return;
    }

    // Constructed directly with the minted token, never via `createClient()` —
    // core has no browser session and no `@supabase/ssr`; `createClient()`
    // would try to manage a user session that does not exist here.
    const wsUrl = `${credential.supabaseUrl.replace(/^http/, "ws")}/realtime/v1`;
    const realtime = new RealtimeClient(wsUrl, {
      params: { apikey: credential.supabaseAnonKey },
      accessToken: () => Promise.resolve(credential.token),
    });
    realtime.connect();

    const topic = machineControlTopic(workspaceId, runtimeId);
    const channel = realtime.channel(topic, {
      config: { broadcast: { self: false }, private: true },
    });

    channel.on("broadcast", { event: MACHINE_REQUEST_EVENT }, ({ payload }: { payload: unknown }) => {
      try {
        requestHandler?.(payload);
      } catch (err) {
        logger.error({ err }, "machine request handler threw");
      }
    });

    channel.subscribe((status, err) => onChannelStatus(status, err));

    client = realtime;
    controlChannel = channel;
    scheduleRefresh(credential);
  } finally {
    connecting = false;
  }
}

/**
 * Start holding a Realtime connection for as long as this machine is paired.
 * Safe to call on an unpaired machine — `establish()` no-ops until pairing
 * appears, which `pairingCheckTimer` notices without a restart, the same
 * property `heartbeat.ts`'s interval gives pairing generally.
 *
 * Takes no handler: `onMachineRequest` is the one registration point, called
 * by `terminal-bridge.ts`'s `startTerminalBridge` before this — a request
 * answered on the very first tick needs somewhere to be routed already.
 */
export function startRealtimeConnection(): void {
  if (!stopped) return;
  stopped = false;
  healthy = true;
  backoffAttempt = 0;
  void establish();
  pairingCheckTimer = setInterval(() => {
    if (!stopped && !client && !connecting) void establish();
  }, PAIRING_CHECK_MS);
  pairingCheckTimer.unref?.();
}

export function stopRealtimeConnection(): void {
  stopped = true;
  if (pairingCheckTimer) {
    clearInterval(pairingCheckTimer);
    pairingCheckTimer = null;
  }
  if (backoffTimer) {
    clearTimeout(backoffTimer);
    backoffTimer = null;
  }
  teardown();
}

export function isRealtimeHealthy(): boolean {
  return healthy;
}

/** Registered once, by `terminal-bridge.ts`'s `startTerminalBridge`. */
export function onMachineRequest(handler: (payload: unknown) => void): void {
  requestHandler = handler;
}

export async function sendMachineReply(payload: unknown): Promise<void> {
  if (!controlChannel) return;
  try {
    await controlChannel.send({ type: "broadcast", event: MACHINE_REPLY_EVENT, payload });
  } catch (err) {
    logger.warn({ err }, "failed to send a machine reply");
  }
}

export interface SessionChannel {
  onInput(handler: (data: string) => void): void;
  sendOutput(data: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Open (or reuse — `terminal-bridge.ts` guards this) a session's own
 * Realtime channel. Returns `null` when there is no live connection to open
 * one on, which the caller treats as "no cloud subscriber yet," not an
 * error: a session opened purely for the local `/ws/terminal/:id` path needs
 * none of this.
 */
export function openSessionChannel(sessionId: string): SessionChannel | null {
  if (!client) return null;
  const workspaceId = getWorkspaceId();
  // Both come from this machine's own pairing state, never from a message —
  // the same rule `establish()` follows for the control topic (M16 phase
  // decision 3). `019`'s policy checks this pair, so a runtime id taken from
  // an inbound payload would be a machine publishing under another's name.
  const runtimeId = getRuntimeId();
  if (!workspaceId || !runtimeId) return null;

  const topic = terminalSessionTopic(workspaceId, runtimeId, sessionId);
  const channel = client.channel(topic, {
    config: { broadcast: { self: false }, private: true },
  });
  let inputHandler: ((data: string) => void) | null = null;

  channel.on("broadcast", { event: TERMINAL_INPUT_EVENT }, ({ payload }: { payload: { data?: unknown } }) => {
    if (typeof payload?.data === "string") {
      try {
        inputHandler?.(payload.data);
      } catch (err) {
        logger.error({ err, sessionId }, "terminal input handler threw");
      }
    }
  });
  channel.subscribe();

  return {
    onInput(handler) {
      inputHandler = handler;
    },
    async sendOutput(data) {
      try {
        await channel.send({ type: "broadcast", event: TERMINAL_OUTPUT_EVENT, payload: { data } });
      } catch (err) {
        logger.warn({ err, sessionId }, "failed to send terminal output");
      }
    },
    async close() {
      await channel.unsubscribe();
    },
  };
}
