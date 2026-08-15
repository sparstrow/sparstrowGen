import * as React from "react";
import type { RunEvent, WsServerEvent } from "@sparstrow/shared";
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
