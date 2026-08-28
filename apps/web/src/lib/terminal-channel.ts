import {
  MACHINE_REPLY_EVENT,
  MACHINE_REQUEST_EVENT,
  MACHINE_REQUEST_TIMEOUT_MS,
  TERMINAL_INPUT_EVENT,
  TERMINAL_OUTPUT_EVENT,
  machineControlTopic,
  machineReplySchema,
  terminalOutputMessageSchema,
  terminalSessionTopic,
  type MachineReply,
  type MachineRequest,
  type TerminalInputMessage,
} from "@sparstrow/shared";
import { createClient } from "@web/utils/supabase/client";

/**
 * T-M17-01 — the browser half of M16's wire. Subscribes to one machine's
 * control topic and, per session, a session topic; issues correlated
 * requests with a timeout; hands a session's bytes to whoever is rendering
 * them. No React here — `terminals.tsx` (T-M17-02) owns the component state
 * (which machine, cols/rows, which pane is on screen).
 *
 * Mirrors `RealtimeLiveEventSource` (`realtime-live-events.ts`): same
 * once-per-instance workspace-id resolution, same subscribe/teardown shape.
 * Differs in two ways that class doesn't need: this one SENDS as well as
 * receives, and it is scoped to one machine (`runtimeId`) rather than one
 * workspace — phase decision 2 treats a machine switch as a different key,
 * not a refetch of the same one, so the caller constructs a fresh instance
 * per machine rather than this file tracking "current machine" itself.
 */

/** Every request kind a browser may send on the control topic (`T-M16-01`). */
export type MachineRequestKind = MachineRequest["kind"];

type PayloadFor<K extends MachineRequestKind> = Omit<Extract<MachineRequest, { kind: K }>, "requestId" | "kind">;
type ReplyFor<K extends MachineRequestKind> = Extract<MachineReply, { kind: K }>;

/** Alias for interface fidelity with the task spec's `send(sessionId, message: TerminalInput)`. */
export type TerminalInput = TerminalInputMessage;

/**
 * Why an attached session stopped delivering output.
 *
 * `"closed"` is the only member this file ever produces itself — it fires
 * when THIS instance's own `request("terminal.close", …)` for that session
 * succeeds, which is information only this file has (the reply arrives on
 * the control topic, not the session topic, so a passive session-topic
 * listener has no way to learn it). The other three members are real per
 * the M17 phase README's error-state table, but nothing on the wire tells a
 * passive listener which applies — discovering them (comparing a fresh
 * `terminal.list`'s `machineStartedAt` against a previously seen one, or
 * reading `terminal_access_disabled` off a `terminal.attach` refusal) needs
 * state this file doesn't keep (the page's last-known geometry, its last
 * seen `machineStartedAt`) and is `T-M17-02`'s job, done by calling
 * `request()` directly rather than through `onEnded`.
 */
export type TerminalEndReason = "closed" | "exited" | "machine_restarted" | "access_switched_off";

export interface TerminalChannel {
  /** Correlated request on machine:<ws>:<runtimeId>. Rejects on timeout. */
  request<K extends MachineRequestKind>(kind: K, payload: PayloadFor<K>): Promise<ReplyFor<K>>;
  /** Attach to one session's topic. Returns a detach function. */
  attach(
    sessionId: string,
    handlers: {
      onOutput(chunk: string): void;
      onThrottled(active: boolean): void;
      onEnded(reason: TerminalEndReason): void;
    },
  ): () => void;
  /** Client-sendable events only — input. (Resize travels via a fresh `terminal.attach` request, not this — T-M16-01.) */
  send(sessionId: string, message: TerminalInput): void;
  onConnectionChange(cb: (connected: boolean) => void): () => void;
  /**
   * Tears down the control channel and every still-attached session channel.
   * Added by `T-M17-02`: an instance is scoped to one machine (phase decision
   * 2), so switching machines means constructing a new one, and without this
   * the old instance's control-channel subscription — and any session
   * channels a pane never got around to detaching — would sit open on
   * Realtime forever. Idempotent; safe to call on an instance that never
   * finished connecting.
   */
  close(): void;
}

/** Rejects every request still in flight when `close()` is called — distinct
 *  from `TerminalRequestTimeoutError`, since the machine was never given the
 *  chance to answer. */
export class TerminalChannelClosedError extends Error {
  constructor(public readonly kind: MachineRequestKind) {
    super(`terminal channel closed while "${kind}" was still in flight`);
    this.name = "TerminalChannelClosedError";
  }
}

/** A request that timed out — the machine did not answer (FR-014). Distinct
 *  from a refusal: a refusal is a well-formed reply carrying `error`, which
 *  `request()` resolves with normally rather than throwing — collapsing the
 *  two into one error type is exactly what the phase spec's error state
 *  must not do. */
export class TerminalRequestTimeoutError extends Error {
  constructor(public readonly kind: MachineRequestKind) {
    super(`terminal channel request "${kind}" timed out after ${MACHINE_REQUEST_TIMEOUT_MS}ms`);
    this.name = "TerminalRequestTimeoutError";
  }
}

function dropped(event: string): void {
  // Event name only, per phase decision 2 — never the payload.
  console.warn(`terminal channel: dropped a malformed "${event}" message`);
}

function guard(where: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // supabase-js does not surface a throw inside a broadcast callback —
    // the channel stays subscribed and silently stops doing its job.
    console.error(`terminal channel: ${where} handler threw`, err);
  }
}

interface PendingRequest {
  resolve: (reply: MachineReply) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  kind: MachineRequestKind;
}

interface SessionEntry {
  channel: SupabaseChannelLike;
  onEnded: (reason: TerminalEndReason) => void;
}

export class RealtimeTerminalChannel implements TerminalChannel {
  private supabase = createClient();
  private connected = false;
  private connectionListeners = new Set<(connected: boolean) => void>();
  private controlChannel: SupabaseChannelLike | null = null;
  private controlChannelPromise: Promise<SupabaseChannelLike | null> | null = null;
  private pending = new Map<string, PendingRequest>();
  private sessionChannels = new Map<string, SessionEntry>();

  constructor(private readonly runtimeId: string) {}

  /** Resolved once per instance, mirroring `RealtimeLiveEventSource`. */
  private workspaceIdPromise: Promise<string | null> | null = null;

  private workspaceId(): Promise<string | null> {
    if (!this.workspaceIdPromise) {
      this.workspaceIdPromise = this.resolveWorkspaceId();
    }
    return this.workspaceIdPromise;
  }

  private async resolveWorkspaceId(): Promise<string | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data } = await this.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    return (data?.workspace_id as string | undefined) ?? null;
  }

  private ensureControlChannel(): Promise<SupabaseChannelLike | null> {
    if (!this.controlChannelPromise) {
      this.controlChannelPromise = this.workspaceId().then((workspaceId) => {
        if (!workspaceId) return null;
        const topic = machineControlTopic(workspaceId, this.runtimeId);
        const channel = this.supabase.channel(topic, { config: { broadcast: { self: false }, private: true } });
        channel.on("broadcast", { event: MACHINE_REPLY_EVENT }, ({ payload }: { payload: unknown }) => {
          guard("reply", () => this.handleReply(payload));
        });
        channel.subscribe((status: string) => this.setConnected(status === "SUBSCRIBED"));
        this.controlChannel = channel;
        return channel;
      });
    }
    return this.controlChannelPromise;
  }

  private handleReply(raw: unknown): void {
    const parsed = machineReplySchema.safeParse(raw);
    if (!parsed.success) {
      dropped(MACHINE_REPLY_EVENT);
      return;
    }
    const reply = parsed.data;
    // The control topic is per machine, not per browser — a second tab's
    // replies arrive here too. Unrecognised requestIds are expected
    // traffic, not an error, so they are dropped without logging.
    const pendingRequest = this.pending.get(reply.requestId);
    if (!pendingRequest) return;

    this.pending.delete(reply.requestId);
    clearTimeout(pendingRequest.timer);
    pendingRequest.resolve(reply);
  }

  async request<K extends MachineRequestKind>(kind: K, payload: PayloadFor<K>): Promise<ReplyFor<K>> {
    const requestId = crypto.randomUUID();
    const channel = await this.ensureControlChannel();

    if (!channel) {
      throw new TerminalRequestTimeoutError(kind);
    }

    const message = { requestId, kind, ...payload } as MachineRequest;

    const reply = await new Promise<MachineReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new TerminalRequestTimeoutError(kind));
      }, MACHINE_REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer, kind });

      void channel.send({ type: "broadcast", event: MACHINE_REQUEST_EVENT, payload: message }).catch(() => {
        // Swallow — the pending timeout is what surfaces this to the caller,
        // matching the daemon's own "warn and continue" discipline for a
        // failed send rather than a distinct third outcome.
      });
    });

    // A self-initiated close is the one case this file can resolve
    // `onEnded` for on its own — see `TerminalEndReason`'s doc comment.
    if (kind === "terminal.close" && "ok" in reply && reply.ok) {
      const sessionId = (payload as { sessionId?: string }).sessionId;
      if (sessionId) this.endSession(sessionId, "closed");
    }

    return reply as ReplyFor<K>;
  }

  attach(
    sessionId: string,
    handlers: {
      onOutput(chunk: string): void;
      onThrottled(active: boolean): void;
      onEnded(reason: TerminalEndReason): void;
    },
  ): () => void {
    let closed = false;
    let channel: SupabaseChannelLike | null = null;

    void this.workspaceId().then((workspaceId) => {
      if (closed || !workspaceId) return;

      const topic = terminalSessionTopic(workspaceId, this.runtimeId, sessionId);
      channel = this.supabase.channel(topic, { config: { broadcast: { self: false }, private: true } });
      channel.on("broadcast", { event: TERMINAL_OUTPUT_EVENT }, ({ payload }: { payload: unknown }) => {
        guard("output", () => {
          const parsed = terminalOutputMessageSchema.safeParse(payload);
          if (!parsed.success) {
            dropped(TERMINAL_OUTPUT_EVENT);
            return;
          }
          handlers.onOutput(parsed.data.data);
        });
      });
      channel.subscribe();

      this.sessionChannels.set(sessionId, { channel, onEnded: handlers.onEnded });
    });

    return () => {
      closed = true;
      this.sessionChannels.delete(sessionId);
      if (channel) void this.supabase.removeChannel(channel);
    };
  }

  send(sessionId: string, message: TerminalInput): void {
    const entry = this.sessionChannels.get(sessionId);
    if (!entry) {
      console.warn(`terminal channel: send() called for ${sessionId} before attach() resolved — dropped`);
      return;
    }
    void entry.channel.send({ type: "broadcast", event: TERMINAL_INPUT_EVENT, payload: message }).catch((err: unknown) => {
      // Realtime does not report a policy-refused broadcast back to the
      // sender — this only catches a transport failure, not a refusal.
      console.warn("terminal channel: failed to send input", err);
    });
  }

  onConnectionChange(cb: (connected: boolean) => void): () => void {
    this.connectionListeners.add(cb);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  close(): void {
    for (const [, pendingRequest] of this.pending) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(new TerminalChannelClosedError(pendingRequest.kind));
    }
    this.pending.clear();

    for (const [, entry] of this.sessionChannels) {
      void this.supabase.removeChannel(entry.channel);
    }
    this.sessionChannels.clear();

    if (this.controlChannel) {
      void this.supabase.removeChannel(this.controlChannel);
      this.controlChannel = null;
    }
    this.controlChannelPromise = null;
  }

  private endSession(sessionId: string, reason: TerminalEndReason): void {
    const entry = this.sessionChannels.get(sessionId);
    if (!entry) return;
    this.sessionChannels.delete(sessionId);
    void this.supabase.removeChannel(entry.channel);
    guard("onEnded", () => entry.onEnded(reason));
  }

  private setConnected(value: boolean): void {
    // The control channel's own Realtime status, not the machine's — a
    // machine can be off while Realtime is perfectly healthy. Conflating
    // them would make the page say "lost contact" when the truth is "your
    // machine is asleep."
    if (this.connected === value) return;
    this.connected = value;
    for (const fn of this.connectionListeners) {
      guard("onConnectionChange", () => fn(value));
    }
  }
}

/** One instance per machine (phase decision 2) — construct a fresh one on a machine switch. */
export function createTerminalChannel(runtimeId: string): TerminalChannel {
  return new RealtimeTerminalChannel(runtimeId);
}

/** Structural alias so `channel`'s return type doesn't need importing realtime-js directly. */
type SupabaseChannelLike = ReturnType<ReturnType<typeof createClient>["channel"]>;
