import * as pty from "node-pty";
import { nanoid } from "nanoid";
import { logger } from "../logger.js";

const RING_BUFFER_MAX = 256 * 1024; // 256 KB
const DETACH_TTL_MS = 10 * 60 * 1000; // 10 min grace after WS disconnect

export interface TerminalSession {
  id: string;
  agentId: string | null;
  cols: number;
  rows: number;
  createdAt: string;
}

interface ActiveSession {
  meta: TerminalSession;
  pty: pty.IPty;
  ring: string;
  sockets: Set<import("@fastify/websocket").WebSocket>;
  killTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, ActiveSession>();

function now() {
  return new Date().toISOString();
}

export function createSession(opts: {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
  agentId?: string | null;
}): TerminalSession {
  const id = `term_${nanoid(10)}`;
  const cols = opts.cols ?? 220;
  const rows = opts.rows ?? 50;

  const proc = pty.spawn(opts.command, opts.args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env } as Record<string, string>,
    useConpty: true,
  });

  const session: ActiveSession = {
    meta: { id, agentId: opts.agentId ?? null, cols, rows, createdAt: now() },
    pty: proc,
    ring: "",
    sockets: new Set(),
    killTimer: null,
  };
  sessions.set(id, session);

  proc.onData((data) => {
    session.ring += data;
    if (session.ring.length > RING_BUFFER_MAX) {
      session.ring = session.ring.slice(session.ring.length - RING_BUFFER_MAX);
    }
    for (const ws of session.sockets) {
      try {
        ws.send(data);
      } catch {
        session.sockets.delete(ws);
      }
    }
  });

  proc.onExit(({ exitCode }) => {
    logger.info({ id, exitCode }, "terminal session exited");
    for (const ws of session.sockets) {
      try {
        ws.send(`\r\n[Process exited with code ${exitCode}]\r\n`);
      } catch {
        // ignore
      }
    }
    sessions.delete(id);
  });

  logger.info({ id, command: opts.command, pid: proc.pid }, "terminal session created");
  return session.meta;
}

export function attachSocket(id: string, ws: import("@fastify/websocket").WebSocket): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  if (session.killTimer) {
    clearTimeout(session.killTimer);
    session.killTimer = null;
  }
  // Replay ring buffer so the client catches up.
  if (session.ring.length > 0) {
    try {
      ws.send(session.ring);
    } catch {
      // ignore
    }
  }
  session.sockets.add(ws);
  ws.on("message", (msg: unknown) => {
    const data = typeof msg === "string" ? msg : String(msg);
    try {
      const parsed = JSON.parse(data) as { type: string; cols?: number; rows?: number; data?: string };
      if (parsed.type === "resize" && parsed.cols && parsed.rows) {
        session.pty.resize(parsed.cols, parsed.rows);
      } else if (parsed.type === "data" && parsed.data) {
        session.pty.write(parsed.data);
      }
    } catch {
      session.pty.write(data);
    }
  });
  ws.on("close", () => {
    session.sockets.delete(ws);
    if (session.sockets.size === 0) {
      session.killTimer = setTimeout(() => {
        logger.info({ id }, "terminal session killed after detach TTL");
        session.pty.kill();
        sessions.delete(id);
      }, DETACH_TTL_MS);
    }
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

export function killSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.pty.kill();
  sessions.delete(id);
  return true;
}

export function listSessions(): TerminalSession[] {
  return [...sessions.values()].map((s) => s.meta);
}

export function getSession(id: string): TerminalSession | null {
  return sessions.get(id)?.meta ?? null;
}

export function killAllSessions(): void {
  for (const [id, session] of sessions) {
    try {
      session.pty.kill();
    } catch {
      // ignore
    }
    sessions.delete(id);
  }
}
