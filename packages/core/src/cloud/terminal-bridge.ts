import { eq } from "drizzle-orm";
import {
  SETTING_TERMINAL_ACCESS,
  machineRequestSchema,
  type Agent,
  type MachineReply,
  type MachineRequest,
  type TerminalAttachRequest,
  type TerminalCloseRequest,
  type TerminalListRequest,
  type TerminalOpenRequest,
  type TerminalRefusal,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents, settings } from "../db/schema.js";
import { config } from "../config.js";
import { getProvider } from "../providers/index.js";
import { logger } from "../logger.js";
import {
  attachSink,
  createSession,
  getSession,
  killSession,
  listSessions,
  peekRing,
  resizeSession,
  writeToSession,
  type TerminalSink,
} from "../terminal/manager.js";
import { onMachineRequest, openSessionChannel, sendMachineReply, type SessionChannel } from "./realtime.js";

/**
 * M16 — the four request kinds and the manager. Knows nothing about tokens
 * or reconnection; every call into `realtime.ts` is through
 * `onMachineRequest` / `sendMachineReply` / `openSessionChannel`, none of
 * which mention a credential.
 */

/** Set once, at module load — this process's boot time. Reported on
 *  `terminal.list` and `unknown_session` so M17 can say *the machine
 *  restarted at …* (DD-5) rather than leaving a stale client to guess. */
const MACHINE_STARTED_AT = new Date().toISOString();

const OFF_WORDS = ["off", "false", "0", "no"];

/**
 * FR-011's enforcement point. `T-M17-04` builds the switch and its UI; this
 * is what makes ignoring the switch impossible from the browser side, since
 * the check runs on the machine regardless of what a client requests.
 */
function terminalAccessEnabled(): boolean {
  try {
    const row = getDb().select().from(settings).where(eq(settings.key, SETTING_TERMINAL_ACCESS)).get();
    const raw = row?.value ?? null;
    if (raw == null) return true;
    return !OFF_WORDS.includes(raw.trim().toLowerCase());
  } catch {
    // No DB, or the table isn't there yet — same fail-open reasoning as the
    // default itself: absent means on.
    return true;
  }
}

function errorReply<K extends MachineRequest["kind"]>(requestId: string, kind: K, error: TerminalRefusal) {
  return { requestId, kind, error } as MachineReply;
}

/** One bridge sink per session that has ever had a cloud subscriber. Reused
 *  across `terminal.open` and every subsequent `terminal.attach` for the
 *  same session — one Realtime channel serves every browser tab watching
 *  it, since the topic fans broadcasts out to all its subscribers already. */
const sessionChannels = new Map<string, SessionChannel>();

/**
 * Wire a session to its own Realtime channel, if a connection exists to open
 * one on. A `null` from `openSessionChannel` means no live connection —
 * fine: the session still works over the local `/ws/terminal/:id` route,
 * which never touches this map.
 *
 * Ordering matters (phase trap): this is only ever called AFTER the manager
 * already has the session — subscribing first would let the first output
 * message target a session id the manager has not registered yet, and the
 * sink lookup would fail silently.
 */
function ensureBridgeSink(sessionId: string): void {
  if (sessionChannels.has(sessionId)) return;
  const channel = openSessionChannel(sessionId);
  if (!channel) return;

  channel.onInput((data) => {
    writeToSession(sessionId, data);
  });

  const sink: TerminalSink = {
    write: (chunk) => {
      void channel.sendOutput(chunk);
    },
    close: () => {
      void channel.close();
      sessionChannels.delete(sessionId);
    },
  };
  sessionChannels.set(sessionId, channel);
  // Replays the ring to this sink immediately — a broadcast nobody may be
  // subscribed to yet, since the requester subscribes only after receiving
  // the reply. Harmless; `terminal.attach`'s own `replay` field (below) is
  // what actually catches a fresh subscriber up.
  attachSink(sessionId, sink);
}

async function handleList(req: TerminalListRequest): Promise<MachineReply> {
  return {
    requestId: req.requestId,
    kind: "terminal.list",
    sessions: listSessions(),
    machineStartedAt: MACHINE_STARTED_AT,
  };
}

async function handleOpen(req: TerminalOpenRequest): Promise<MachineReply> {
  if (!terminalAccessEnabled()) {
    return errorReply(req.requestId, "terminal.open", "terminal_access_disabled");
  }

  let command = "cmd.exe";
  let args: string[] = [];
  let cwd = config.dataDir;
  let agentId: string | null = null;
  let agentName: string | null = null;

  if (req.agentId) {
    const db = getDb();
    const row = db.select().from(agents).where(eq(agents.id, req.agentId)).get();
    if (!row) return errorReply(req.requestId, "terminal.open", "agent_not_found");
    const agent = row as unknown as Agent;
    const provider = getProvider(agent.provider);
    if (provider.kind !== "cli") {
      return errorReply(req.requestId, "terminal.open", "agent_not_interactive");
    }
    const spec = provider.buildInteractiveSpawn(agent, {
      tempDir: config.tmpDir,
      extraEnv: { SPARSTROW_API: `http://${config.host}:${config.port}` },
    });
    command = spec.viaCmdShell ? "cmd.exe" : spec.command;
    args = spec.viaCmdShell ? ["/d", "/s", "/c", spec.command, ...spec.args] : spec.args;
    cwd = spec.cwd ?? config.dataDir;
    agentId = agent.id;
    agentName = agent.name;
  }

  let result;
  try {
    result = createSession({
      command,
      args,
      cwd,
      env: { SPARSTROW_API: `http://${config.host}:${config.port}` },
      cols: req.cols,
      rows: req.rows,
      agentId,
      agentName,
    });
  } catch (err) {
    logger.error({ err }, "terminal spawn failed");
    return errorReply(req.requestId, "terminal.open", "spawn_failed");
  }
  if (!result.ok) return errorReply(req.requestId, "terminal.open", result.error);

  ensureBridgeSink(result.session.id);
  const info = getSession(result.session.id);
  if (!info) return errorReply(req.requestId, "terminal.open", "spawn_failed");
  return { requestId: req.requestId, kind: "terminal.open", session: info };
}

async function handleClose(req: TerminalCloseRequest): Promise<MachineReply> {
  const ok = killSession(req.sessionId, "closed");
  if (!ok) return errorReply(req.requestId, "terminal.close", "unknown_session");
  return { requestId: req.requestId, kind: "terminal.close", ok: true };
}

async function handleAttach(req: TerminalAttachRequest): Promise<MachineReply> {
  if (!terminalAccessEnabled()) {
    return errorReply(req.requestId, "terminal.attach", "terminal_access_disabled");
  }
  if (!getSession(req.sessionId)) {
    return errorReply(req.requestId, "terminal.attach", "unknown_session");
  }

  resizeSession(req.sessionId, req.cols, req.rows);
  ensureBridgeSink(req.sessionId);

  const info = getSession(req.sessionId);
  if (!info) return errorReply(req.requestId, "terminal.attach", "unknown_session");
  return {
    requestId: req.requestId,
    kind: "terminal.attach",
    session: info,
    replay: peekRing(req.sessionId) ?? "",
  };
}

export async function handleMachineRequest(payload: unknown): Promise<void> {
  const parsed = machineRequestSchema.safeParse(payload);
  if (!parsed.success) {
    // Dropped, not answered — there is no requestId to answer with when the
    // envelope itself doesn't parse.
    logger.warn({ error: parsed.error.message }, "dropped a malformed machine request");
    return;
  }
  const req = parsed.data;

  let reply: MachineReply;
  try {
    switch (req.kind) {
      case "terminal.list":
        reply = await handleList(req);
        break;
      case "terminal.open":
        reply = await handleOpen(req);
        break;
      case "terminal.close":
        reply = await handleClose(req);
        break;
      case "terminal.attach":
        reply = await handleAttach(req);
        break;
    }
  } catch (err) {
    // Every request is answered even when it fails (phase decision) —
    // silence is indistinguishable from an unreachable machine, which
    // FR-007 requires to read differently.
    logger.error({ err, kind: req.kind }, "terminal bridge handler threw");
    reply = errorReply(req.requestId, req.kind, "spawn_failed");
  }
  await sendMachineReply(reply);
}

export function startTerminalBridge(): void {
  onMachineRequest((payload) => {
    void handleMachineRequest(payload);
  });
}
