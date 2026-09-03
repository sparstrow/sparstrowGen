"use client";

import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@sparstrow/ui/theme/theme-provider";
import { Toaster } from "@sparstrow/ui/components/ui/sonner";
import { wsHub } from "@web/lib/ws";
import { LiveEventsContext } from "@web/lib/live-events";
import { createClient } from "@web/utils/supabase/client";
import { WebAccountProvider } from "@web/components/auth/account-provider";
import type { AccountSnapshot } from "@web/lib/auth/account-snapshot";
import { RealtimeLiveEventSource } from "@web/lib/realtime-live-events";
import { CoreProvider } from "@sparstrow/core";
import { browserStorage } from "@web/lib/browser-storage";

export function Providers({
  account,
  children,
}: {
  account: AccountSnapshot | null;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  // One instance for the tab's lifetime, matching `wsHub`'s own singleton
  // shape: "connected" means at least one open transcript channel is
  // currently subscribed, not a single persistent socket like `wsHub`'s.
  // Given `queryClient` so an oversized-event marker can invalidate the
  // affected run's `useRunEvents` query directly.
  const [liveEvents] = useState(() => new RealtimeLiveEventSource(queryClient));
  const [storage] = useState(() => browserStorage());

  useEffect(() => {
    // Bridge local websocket push events into query invalidation
    const unsubscribeWs = wsHub.subscribe((event) => {
      switch (event.type) {
        case "run.created":
        case "run.updated":
        case "run.completed":
          void queryClient.invalidateQueries({ queryKey: ["runs"] });
          void queryClient.invalidateQueries({ queryKey: ["run", event.run.id] });
          break;
        case "task.created":
        case "task.updated":
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          void queryClient.invalidateQueries({ queryKey: ["goal"] });
          break;
        case "goal.updated":
          void queryClient.invalidateQueries({ queryKey: ["goals"] });
          void queryClient.invalidateQueries({ queryKey: ["goal", event.goal.id] });
          break;
        case "goal.plan.updated":
          void queryClient.invalidateQueries({ queryKey: ["goals"] });
          void queryClient.invalidateQueries({ queryKey: ["goal", event.goalId] });
          break;
        case "message.created":
          void queryClient.invalidateQueries({ queryKey: ["messages"] });
          break;
        case "pipeline-run.updated":
          void queryClient.invalidateQueries({ queryKey: ["pipeline-runs"] });
          break;
        case "cron.fired":
          void queryClient.invalidateQueries({ queryKey: ["cron-jobs"] });
          break;
        case "terminal.session.opened":
        case "terminal.session.closed":
          void queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
          break;
        case "memory.note.indexed":
        case "memory.note.removed":
          void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
          break;
        case "system.health":
          void queryClient.invalidateQueries({ queryKey: ["health"] });
          break;
        case "dream.completed":
          void queryClient.invalidateQueries({ queryKey: ["project-dream", event.projectId] });
          void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
          void queryClient.invalidateQueries({ queryKey: ["messages"] });
          break;
        case "memory.contradiction.flagged":
          void queryClient.invalidateQueries({ queryKey: ["attention-queue"] });
          break;
        default:
          break;
      }
    });

    const supabase = createClient();

    /**
     * Wipe every cached query when the session ends.
     *
     * React Query's cache is per-tab, not per-user. Without this, signing out
     * and signing in as someone else on the same tab repaints the previous
     * account's agents, messages and memory notes from cache while the new
     * user's fetches are still in flight. RLS never sees those reads -- they
     * never leave the browser -- so the server-side boundary cannot help.
     */
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") queryClient.clear();
    });

    // Supabase Realtime Postgres channel subscription for cloud sync
    const realtimeChannel = supabase
      .channel("db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        (payload: { table: string }) => {
          const table = payload.table;
          if (table === "runs") {
            void queryClient.invalidateQueries({ queryKey: ["runs"] });
          } else if (table === "tasks") {
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          } else if (table === "goals") {
            void queryClient.invalidateQueries({ queryKey: ["goals"] });
          } else if (table === "messages") {
            void queryClient.invalidateQueries({ queryKey: ["messages"] });
          } else if (table === "runtimes") {
            void queryClient.invalidateQueries({ queryKey: ["health"] });
          } else if (table === "chat_messages") {
            void queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
          } else if (table === "task_questions") {
            void queryClient.invalidateQueries({ queryKey: ["attention-queue"] });
          } else if (table === "runtime_projects") {
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
          }
        }
      )
      .subscribe();

    return () => {
      unsubscribeWs();
      authSub.subscription.unsubscribe();
      void supabase.removeChannel(realtimeChannel);
    };
  }, [queryClient]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/*
          `@sparstrow/core` is the data layer every client shares. It is given
          THIS app's query client rather than making its own, so the screens
          still on `@web/api/hooks` and the ones already on `packages/views`
          read from one cache — two caches would show the same row in two
          states depending on which component you looked at.

          `apiBaseUrl: ""` means same-origin: this app's session is an httpOnly
          cookie, so the browser must send it itself and `/api/v1` proxies to
          `server/`. The desktop app passes a real URL and a bearer token
          instead, and no screen has to know the difference.
        */}
        <CoreProvider
          apiBaseUrl=""
          storage={storage}
          queryClient={queryClient}
          identity={{
            platform: "web",
            version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
            os: null,
          }}
        >
          <LiveEventsContext.Provider value={liveEvents}>
            <WebAccountProvider initial={account}>{children}</WebAccountProvider>
            <Toaster />
          </LiveEventsContext.Provider>
        </CoreProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
