import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "@/theme/theme-provider";
import { wsHub } from "@/lib/ws";
import { router } from "@/router";
import "@/styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Bridge server push events into query invalidation (pages subscribe to
// run.event themselves for live transcripts).
wsHub.subscribe((event) => {
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
    default:
      break;
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
