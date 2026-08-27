import * as pty from "node-pty";
import { nanoid } from "nanoid";
import { logger } from "../logger.js";
import { agentChildEnv } from "../orchestrator/child-env.js";
import {
  MAX_TERMINAL_SESSIONS,
  TERMINAL_OUTPUT_FLUSH_BYTES,
  TERMINAL_OUTPUT_FLUSH_MS,
  TERMINAL_OUTPUT_MAX_BYTES,
  TERMINAL_THROTTLE_BYTES_PER_SEC,
  TERMINAL_THROTTLE_SUSTAIN_MS,
  type TerminalSessionInfo,
} from "@sparstrow/shared";

const RING_BUFFER_MAX = 256 * 1024; // 256 KB

export interface TerminalSession {
  id: string;
  agentId: string | null;
  cols: number;
  rows: number;
  createdAt: string;
}

/** Why a session ended, or why one sink of several was detached. */
export type TerminalCloseReason = "closed" | "exited" | "access_revoked" | "detached";

/**
 * A destination for a session's output, and the one way to tell it the
 * session ended (or that this one sink specifically was detached, without
 * ending the session — the cloud bridge's job in T-M16-04, when one browser
 * tab stops watching while others remain).
 *
 * Deliberately output-only. Input still goes straight to `session.pty.write`
 * — see `attachSocket`, and from T-M16-04 the bridge's own input handling —
 * because a sink has no business deciding whether a keystroke is authorised;
 * that happens before a sink is ever attached.
 */
export interface TerminalSink {
  write(chunk: string): void;
  close(reason: TerminalCloseReason): void;
}

const CLOSE_MESSAGES: Record<TerminalCloseReason, string> = {
  closed: "closed",
  exited: "ended: the process exited",
  access_revoked: "closed: terminal access was switched off",
  detached: "detached",
};

class SocketSink implements TerminalSink {
  constructor(private readonly socket: import("@fastify/websocket").WebSocket) {}

  write(chunk: string): void {
    try {
      this.socket.send(chunk);
    } catch {
      // A send failing means the socket is already on its way out; the
      // `close` handler registered in attachSocket is what removes it from
      // the sink set, not this call.
    }
  }

  close(reason: TerminalCloseReason): void {
    try {
      this.socket.send(`\r\n[session ${CLOSE_MESSAGES[reason]}]\r\n`);
      this.socket.close();
    } catch {
      // Already gone.
    }
  }
}

interface RateState {
  windowStartMs: number;
  bytesInWindow: number;
  /** Set the moment the window first exceeds budget; cleared the moment it doesn't. */
  overBudgetSinceMs: number | null;
}

interface ActiveSession {
  meta: TerminalSession;
  agentName: string | null;
  pty: pty.IPty;
  /** Full scrollback. Keeps receiving raw output even while throttled — see `noteOutput`. */
  ring: string;
  sinks: Set<TerminalSink>;
  pending: string;
  pendingBytes: number;
  flushTimer: NodeJS.Timeout | null;
  rate: RateState;
  throttled: boolean;
}

const sessions = new Map<string, ActiveSession>();

function now() {
  return new Date().toISOString();
}

/**
 * Split on JS string (UTF-16) boundaries, never mid-codepoint, so a flush
 * never carries a corrupted trailing byte. Grows a candidate slice to
 * `maxBytes` chars — an upper bound, since terminal output is overwhelmingly
 * ASCII — then backs off char-by-char until it actually fits in bytes.
 */
function splitByBytes(text: string, maxBytes: number): string[] {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxBytes);
    while (end > start + 1 && Buffer.byteLength(text.slice(start, end), "utf8") > maxBytes) {
      end--;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function clearFlushTimer(session: ActiveSession): void {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer);
    session.flushTimer = null;
  }
}

/** Send whatever is coalesced, split so no single message exceeds the wire ceiling. */
function flush(session: ActiveSession): void {
  clearFlushTimer(session);
  if (!session.pending) return;
  const chunks = splitByBytes(session.pending, TERMINAL_OUTPUT_MAX_BYTES);
  session.pending = "";
  session.pendingBytes = 0;
  for (const chunk of chunks) {
    for (const sink of session.sinks) sink.write(chunk);
  }
}

function scheduleFlush(session: ActiveSession): void {
  if (session.flushTimer) return;
  session.flushTimer = setTimeout(() => flush(session), TERMINAL_OUTPUT_FLUSH_MS);
}

const THROTTLE_NOTICE = "\r\n[output throttled — rate limit reached, resuming automatically]\r\n";

function engageThrottle(session: ActiveSession): void {
  session.throttled = true;
  // Send what was already coalesced before cutting sinks off, so the
  // flood's first burst isn't silently swallowed along with the rest of it.
  flush(session);
  for (const sink of session.sinks) sink.write(THROTTLE_NOTICE);
}

/**
 * Update the sliding rate estimate and engage the throttle once output has
 * been over `TERMINAL_THROTTLE_BYTES_PER_SEC` for a full
 * `TERMINAL_THROTTLE_SUSTAIN_MS`. Resuming needs no sustain — DD-8 asks only
 * that it "fall back under", not that it stay under for a matching window.
 *
 * The ring buffer is already written by the time this runs (see the
 * `onData` handler below) — throttling only ever affects sinks, never the
 * scrollback.
 */
function noteOutput(session: ActiveSession, byteLen: number, at: number): void {
  const rate = session.rate;
  if (at - rate.windowStartMs >= 1000) {
    rate.windowStartMs = at;
    rate.bytesInWindow = 0;
  }
  rate.bytesInWindow += byteLen;

  const overBudget = rate.bytesInWindow > TERMINAL_THROTTLE_BYTES_PER_SEC;
  if (overBudget) {
    if (rate.overBudgetSinceMs === null) rate.overBudgetSinceMs = at;
    if (!session.throttled && at - rate.overBudgetSinceMs >= TERMINAL_THROTTLE_SUSTAIN_MS) {
      engageThrottle(session);
    }
  } else {
    rate.overBudgetSinceMs = null;
    session.throttled = false;
  }
}

function toInfo(session: ActiveSession): TerminalSessionInfo {
  return {
    id: session.meta.id,
    agentId: session.meta.agentId,
    agentName: session.agentName,
    cols: session.meta.cols,
    rows: session.meta.rows,
    createdAt: session.meta.createdAt,
    ageMs: Date.now() - new Date(session.meta.createdAt).getTime(),
    attached: session.sinks.size > 0,
  };
}

export type CreateSessionResult =
  | { ok: true; session: TerminalSession }
  | { ok: false; error: "session_limit_reached" };

export function createSession(opts: {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
  agentId?: string | null;
  agentName?: string | null;
}): CreateSessionResult {
  // The ceiling lands with the timer's removal, not after it — a build with
  // one and not the other accumulates node-pty processes with nothing
  // stopping it. Two callers now reach this (the local HTTP route and, from
  // T-M16-04, the cloud bridge), which is why this is a typed result rather
  // than an HttpError only one of them would know how to catch.
  if (sessions.size >= MAX_TERMINAL_SESSIONS) {
    return { ok: false, error: "session_limit_reached" };
  }

  const id = `term_${nanoid(10)}`;
  const cols = opts.cols ?? 220;
  const rows = opts.rows ?? 50;

  const proc = pty.spawn(opts.command, opts.args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: opts.cwd,
    // EC2 (P7): allowlisted child env — a terminal is agent-capable, so it gets
    // the same no-process.env-spread treatment as headless runs.
    env: agentChildEnv(opts.env),
    useConpty: true,
  });

  const session: ActiveSession = {
    meta: { id, agentId: opts.agentId ?? null, cols, rows, createdAt: now() },
    agentName: opts.agentName ?? null,
    pty: proc,
    ring: "",
    sinks: new Set(),
    pending: "",
    pendingBytes: 0,
    flushTimer: null,
    rate: { windowStartMs: Date.now(), bytesInWindow: 0, overBudgetSinceMs: null },
    throttled: false,
  };
  sessions.set(id, session);

  proc.onData((data) => {
    // Ring first, always — throttling must never create a hole in scrollback.
    session.ring += data;
    if (session.ring.length > RING_BUFFER_MAX) {
      session.ring = session.ring.slice(session.ring.length - RING_BUFFER_MAX);
    }

    const at = Date.now();
    noteOutput(session, Buffer.byteLength(data, "utf8"), at);
    if (session.throttled) return;

    session.pending += data;
    session.pendingBytes = Buffer.byteLength(session.pending, "utf8");
    if (session.pendingBytes >= TERMINAL_OUTPUT_FLUSH_BYTES) {
      flush(session);
    } else {
      scheduleFlush(session);
    }
  });

  proc.onExit(({ exitCode }) => {
    logger.info({ id, exitCode }, "terminal session exited");
    clearFlushTimer(session);
    for (const sink of session.sinks) sink.close("exited");
    sessions.delete(id);
  });

  logger.info({ id, command: opts.command, pid: proc.pid }, "terminal session created");
  return { ok: true, session: session.meta };
}

/** Attach any sink. Replays the ring so a reconnecting client catches up. */
export function attachSink(id: string, sink: TerminalSink): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  if (session.ring.length > 0) sink.write(session.ring);
  session.sinks.add(sink);
  return true;
}

/**
 * The local `/ws/terminal/:id` route. NOT deleted by T-M16-05 (DD-6) — this
 * is how anything running on the machine itself attaches, unrelated to
 * whatever the cloud bridge does. Thin wrapper over `attachSink`: builds a
 * `SocketSink` for output, and keeps the existing input handling (resize,
 * raw data) going straight to the pty exactly as before.
 *
 * Detaching no longer schedules anything — the owner's decision (spec
 * Assumptions, third bullet) that a session survives until one of the
 * triggers in T-M16-05's Decisions table actually ends it.
 */
export function attachSocket(id: string, ws: import("@fastify/websocket").WebSocket): boolean {
  const session = sessions.get(id);
  if (!session) return false;

  const sink = new SocketSink(ws);
  attachSink(id, sink);

  ws.on("message", (msg: unknown) => {
    const data = typeof msg === "string" ? msg : String(msg);
    try {
      const parsed = JSON.parse(data) as { type: string; cols?: number; rows?: number; data?: string };
      if (parsed.type === "resize" && parsed.cols && parsed.rows) {
        session.pty.resize(parsed.cols, parsed.rows);
        session.meta.cols = parsed.cols;
        session.meta.rows = parsed.rows;
      } else if (parsed.type === "data" && parsed.data) {
        session.pty.write(parsed.data);
      }
    } catch {
      session.pty.write(data);
    }
  });
  ws.on("close", () => {
    session.sinks.delete(sink);
  });
  return true;
}

export function resizeSession(id: string, cols: number, rows: number): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.pty.resize(cols, rows);
  session.meta.cols = cols;
  session.meta.rows = rows;
  return true;
}

/**
 * Write raw bytes to a session's pty — the cloud bridge's (`T-M16-04`)
 * equivalent of `attachSocket`'s inline `ws.on("message")` handling, since a
 * `TerminalSink` is output-only by design and has no business writing input.
 */
export function writeToSession(id: string, data: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.pty.write(data);
  return true;
}

/**
 * The session's current scrollback, without attaching anything — what
 * `terminal.attach`'s reply embeds inline as `replay` (T-M16-01), since the
 * requester isn't subscribed to the session's own topic yet when the reply
 * is sent and so cannot receive a sink's normal replay-on-attach write.
 */
export function peekRing(id: string): string | null {
  return sessions.get(id)?.ring ?? null;
}

export function killSession(id: string, reason: TerminalCloseReason = "closed"): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  clearFlushTimer(session);
  for (const sink of session.sinks) sink.close(reason);
  session.pty.kill();
  sessions.delete(id);
  return true;
}

export function listSessions(): TerminalSessionInfo[] {
  return [...sessions.values()].map(toInfo);
}

export function getSession(id: string): TerminalSessionInfo | null {
  const session = sessions.get(id);
  return session ? toInfo(session) : null;
}

export function killAllSessions(reason: TerminalCloseReason = "closed"): void {
  for (const [id, session] of sessions) {
    clearFlushTimer(session);
    for (const sink of session.sinks) sink.close(reason);
    try {
      session.pty.kill();
    } catch {
      // ignore
    }
    sessions.delete(id);
  }
}
