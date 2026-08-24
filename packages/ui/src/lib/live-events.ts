import * as React from "react";
import type { ChatTurnBroadcast, RunEvent, WsServerEvent } from "@sparstrow/shared";
import { wsHub } from "./ws";

/**
 * M5 — a live source of run events, abstracted over the transport.
 *
 * `packages/ui` is shared between the local, core-served UI (a real `/ws`
 * WebSocket) and the hosted `apps/web` (Supabase Realtime broadcast — Vercel
 * does not serve WebSockets from Next route handlers, so `wsHub` dialing
 * `/ws` there has been reconnecting into a 404 since the day the hosted app
 * shipped). `run-detail.tsx` must not know which one it has.
 *
 * Injected via context, not sniffed: "am I in the hosted app" is a question a
 * component should never have to ask. `G-6` is the standing example of what
 * sniffing costs — a control that rendered in one host and silently did
 * nothing in the other, discovered only because someone happened to look.
 */
export interface LiveEventSource {
  /** Subscribe to one run's live events. Returns an unsubscribe function. */
  subscribeRun(runId: string, onEvent: (event: RunEvent) => void): () => void;
  /**
   * M12 — subscribe to one chat SESSION's live turn deltas (a session, not a
   * turn: a session outlives any single turn, so subscribing once per
   * session covers every turn sent in it, matching
   * `chatTurnTopic`/`015_chat_broadcast.sql`'s own per-session topic).
   * `onUpdate` receives the broadcast as sent — an `events` batch plus the
   * turn's `status` as of that message, mirroring `subscribeRun`'s own
   * "deliver raw events, let the consumer merge" shape rather than a
   * synthesized full turn state. Returns an unsubscribe function.
   *
   * The LOCAL (non-cloud) host has nothing asynchronous to deliver here —
   * see `WsHubLiveEventSource`'s own doc comment on why this is a
   * documented no-op there, not an unimplemented gap.
   */
  subscribeChat(sessionId: string, onUpdate: (delta: ChatTurnBroadcast) => void): () => void;
  /** Subscribe to this source's own connection state. Returns an unsubscribe function. */
  onStatusChange(fn: (connected: boolean) => void): () => void;
  readonly isConnected: boolean;
}

/**
 * `wsHub`, reshaped to the narrower interface above — today's behaviour,
 * extracted, not changed. The local UI never installs anything else, so
 * nothing about how it streams a transcript is different after this file
 * exists.
 */
class WsHubLiveEventSource implements LiveEventSource {
  subscribeRun(runId: string, onEvent: (event: RunEvent) => void): () => void {
    return wsHub.subscribe((event: WsServerEvent) => {
      if (event.type === "run.event" && event.runId === runId) onEvent(event.event);
    });
  }

  /**
   * Documented no-op, not an unimplemented gap. The local Fastify chat
   * routes (`POST /chat/sessions/:id/messages`, `.../retry`) already run the
   * turn to completion and return it in ONE response — there is no
   * asynchronous delta to deliver on this host, and no `chat.*` member ever
   * existed on `WsServerEvent` for that reason. M13 should not need to call
   * this for the local host at all (the response it already gets back is
   * already terminal), but every `LiveEventSource` must satisfy the
   * interface, so this exists rather than throwing if something does call it.
   */
  subscribeChat(): () => void {
    return () => {};
  }

  onStatusChange(fn: (connected: boolean) => void): () => void {
    return wsHub.onStatusChange(fn);
  }

  get isConnected(): boolean {
    return wsHub.isConnected;
  }
}

/** Singleton, matching `wsHub` itself — one connection per tab, not one per subscriber. */
export const wsHubLiveEventSource: LiveEventSource = new WsHubLiveEventSource();

/**
 * Defaults to the local UI's transport. `apps/web` overrides this by wrapping
 * its tree in `LiveEventsContext.Provider` with a Realtime-backed source — see
 * `apps/web/src/lib/realtime-live-events.ts`. The default means the local UI
 * needs no provider at all to keep working exactly as it did before this file
 * existed.
 */
export const LiveEventsContext = React.createContext<LiveEventSource>(wsHubLiveEventSource);

export function useLiveEvents(): LiveEventSource {
  return React.useContext(LiveEventsContext);
}
