import type { QueryClient } from "@tanstack/react-query";
import type { ChatTurnBroadcast, RunEvent, TranscriptBroadcast } from "@sparstrow/shared";
import {
  CHAT_TURN_BROADCAST_EVENT,
  TRANSCRIPT_BROADCAST_EVENT,
  chatTurnTopic,
  runTranscriptTopic,
} from "@sparstrow/shared";
import type { LiveEventSource } from "@web/lib/live-events";
import { createClient } from "@web/utils/supabase/client";

/**
 * M5 — the hosted app's live transport: Supabase Realtime broadcast.
 *
 * `wsHub` (the local UI's transport, and `packages/ui`'s default) dials
 * `wss://<host>/ws`. Vercel does not serve WebSockets from Next route
 * handlers, `apps/web` has never had a `/ws` route, and it cannot have one —
 * so that socket has been reconnecting into a 404 on a 500ms→5s backoff since
 * the day this app shipped. Nothing looked broken because nothing live
 * existed to miss until M5 made the mismatch visible: the transcript would
 * stream while the connection chip said the app was offline.
 *
 * The daemon never sends here directly — `POST /api/daemon/runs/:id/events`
 * (T-M5-01/02) durably writes the batch and broadcasts it from the SAME
 * request, since that route already holds the service role and has already
 * resolved the workspace from the bearer token. See
 * `doc/tasks/M5/README.md` decision 1.
 */
export class RealtimeLiveEventSource implements LiveEventSource {
  private supabase = createClient();
  private connected = false;
  private statusListeners = new Set<(connected: boolean) => void>();

  /**
   * Optional on purpose: `providers.tsx` passes its own `QueryClient`, but
   * nothing about subscribing or receiving events requires one. Without it,
   * an oversized-event marker (see `subscribeRun`) is simply not acted on —
   * degraded, not broken.
   */
  constructor(private readonly queryClient?: QueryClient) {}

  /**
   * Resolved once per browser session, not once per run. Every open channel
   * reuses it: a signed-in session belongs to exactly one workspace in
   * practice today (multi-workspace switching is deferred — D-9 in
   * `Deferred.md`), and it is the SUBSCRIBER's own membership that grants
   * access to a topic, not anything about the particular run being watched
   * (which RLS would already have refused to load if it belonged to a
   * workspace this session cannot see).
   */
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

  /**
   * Per-run private channel, unsubscribed on unmount — never a
   * workspace-wide one, which would deliver every run's transcript to every
   * open tab. `run-detail.tsx` already gates the call on `isActive`, so a
   * finished run's channel closes itself; this does not additionally need to
   * watch for terminal.
   */
  subscribeRun(runId: string, onEvent: (event: RunEvent) => void): () => void {
    let closed = false;
    let channel: ReturnType<SupabaseClientLike["channel"]> | null = null;

    void this.workspaceId().then((workspaceId) => {
      // Unmounted, or navigated away, before the workspace lookup resolved.
      if (closed || !workspaceId) return;

      channel = this.supabase
        .channel(runTranscriptTopic(workspaceId, runId), { config: { private: true } })
        .on(
          "broadcast",
          { event: TRANSCRIPT_BROADCAST_EVENT },
          ({ payload }: { payload: TranscriptBroadcast }) => {
            for (const event of payload.events) {
              onEvent({ runId, seq: event.seq, ts: event.ts, type: event.type, payload: event.payload });
            }
            // T-M5-02 sends `oversized` for an event too large to ride the
            // broadcast — it IS stored durably, just not delivered live. The
            // fix is a refetch, not silence: `refetchOnWindowFocus` is off
            // (`providers.tsx`), and nothing else re-triggers `useRunEvents`
            // on its own, so without this the gap sits unfilled until the
            // user happens to navigate away and back.
            if (payload.oversized && payload.oversized.length > 0) {
              void this.queryClient?.invalidateQueries({ queryKey: ["run-events", runId] });
            }
          },
        )
        .subscribe((status) => {
          this.setConnected(status === "SUBSCRIBED");
        });
    });

    return () => {
      closed = true;
      if (channel) void this.supabase.removeChannel(channel);
    };
  }

  /**
   * M12 — per-SESSION private channel (`chatTurnTopic`, `015_chat_broadcast.sql`),
   * same lifecycle shape as `subscribeRun` above: the workspace id is
   * resolved once and cached, a `closed` flag guards against a subscriber
   * that unmounted before that lookup settled, and the channel is torn down
   * on unsubscribe. Delivers the broadcast payload as sent — a consumer
   * merges `events` into whatever turn state it already holds, the same way
   * `subscribeRun`'s caller merges individual `RunEvent`s rather than
   * receiving a synthesized `Run`.
   */
  subscribeChat(sessionId: string, onUpdate: (delta: ChatTurnBroadcast) => void): () => void {
    let closed = false;
    let channel: ReturnType<SupabaseClientLike["channel"]> | null = null;

    void this.workspaceId().then((workspaceId) => {
      if (closed || !workspaceId) return;

      channel = this.supabase
        .channel(chatTurnTopic(workspaceId, sessionId), { config: { private: true } })
        .on("broadcast", { event: CHAT_TURN_BROADCAST_EVENT }, ({ payload }: { payload: ChatTurnBroadcast }) => {
          onUpdate(payload);
        })
        .subscribe((status) => {
          this.setConnected(status === "SUBSCRIBED");
        });
    });

    return () => {
      closed = true;
      if (channel) void this.supabase.removeChannel(channel);
    };
  }

  onStatusChange(fn: (connected: boolean) => void): () => void {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    for (const fn of this.statusListeners) fn(value);
  }
}

/** Structural alias so `channel`'s return type doesn't need importing realtime-js directly. */
type SupabaseClientLike = ReturnType<typeof createClient>;
