"use client";

import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@sparstrow/ui/theme/theme-provider";
import { Toaster } from "@sparstrow/ui/components/ui/sonner";
import { wsHub } from "@sparstrow/ui/lib/ws";
import { createClient } from "@web/utils/supabase/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

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
        case "graph.engine.status":
          void queryClient.invalidateQueries({ queryKey: ["graph-engine"] });
          break;
        case "graph.project.status":
          void queryClient.invalidateQueries({ queryKey: ["project-graph", event.projectId] });
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

    // Supabase Realtime Postgres channel subscription for cloud sync
    const supabase = createClient();
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
          } else if (table === "system_health") {
            void queryClient.invalidateQueries({ queryKey: ["health"] });
          }
        }
      )
      .subscribe();

    return () => {
      unsubscribeWs();
      void supabase.removeChannel(realtimeChannel);
    };
  }, [queryClient]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
