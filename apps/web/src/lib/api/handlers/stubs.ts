import { registerRoute, fail, HandlerContext } from "../router";

function hostLocalError(feature: string) {
  return fail(501, `${feature} runs on the local daemon and is not available from the web app.`);
}

function needsRuntimeError(feature: string, mNumber: string = "M4") {
  return fail(501, `${feature} requires a paired machine. Pair one from Settings. (Arriving in ${mNumber})`);
}

// Host-local
const hostLocalPatterns = [
  { p: "/host-fs/(.*)", f: "Local filesystem access" },
  { p: "/terminal/(.*)", f: "Terminal access" },
  { p: "/git/(.*)", f: "Git operations" },
  { p: "/projects/:id/git", f: "Project git operations" },
  { p: "/projects/:id/git/(.*)", f: "Project git operations" },
  { p: "/projects/:id/pull-requests", f: "Pull requests" },
  { p: "/projects/:id/files", f: "Project files" },
  { p: "/providers", f: "Provider management" },
  { p: "/providers/(.*)", f: "Provider management" },
  { p: "/graph/(.*)", f: "Code graph" },
  { p: "/projects/:id/graph", f: "Project graph" },
  { p: "/projects/:id/graph/(.*)", f: "Project graph" },
  { p: "/projects/:id/reindex", f: "Project reindex" },
  { p: "/projects/:id/briefing", f: "Project briefing" },
  { p: "/system/secrets/github-pat", f: "System secrets" },
  { p: "/memory/rescan", f: "Memory rescan" },
  { p: "/memory/notes/:id/raw", f: "Raw memory note access" },
  { p: "/skills/local", f: "Local skills" },
  { p: "/skills/import-local", f: "Local skill import" },
  { p: "/skills/import-url", f: "URL skill import" }
];

for (const { p, f } of hostLocalPatterns) {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    registerRoute({
      method: method as any,
      pattern: p,
      handler: async () => hostLocalError(f)
    });
  }
}

// Needs runtime (M4)
const needsRuntimePatterns = [
  { m: "POST", p: "/runs", f: "Starting a run" },
  { m: "POST", p: "/runs/:id/cancel", f: "Cancelling a run" }, // UI uses POST /runs/:id/cancel
  { m: "POST", p: "/tasks/:id/run", f: "Running a task" },
  { m: "POST", p: "/pipelines/:id/run", f: "Running a pipeline" },
  { m: "POST", p: "/cron-jobs/:id/run-now", f: "Running a cron job" },
  { m: "POST", p: "/agents/:id/test-spawn", f: "Testing an agent" },
  { m: "POST", p: "/agents/draft", f: "Drafting an agent" },
  { m: "POST", p: "/chat/sessions/:id/messages", f: "Sending a chat message" },
  { m: "POST", p: "/chat/sessions/:id/retry", f: "Retrying chat" },
  { m: "POST", p: "/teams/:id/manager/chat", f: "Team manager chat" },
  { m: "POST", p: "/projects/:id/dream", f: "Project dreaming" },
  { m: "PUT", p: "/projects/:id/dream", f: "Project dreaming" }, // UI hook says PUT
  { m: "POST", p: "/projects/:id/dream/(.*)", f: "Project dreaming" },
  { m: "POST", p: "/projects/:id/sync-from-base", f: "Syncing project" },
  { m: "POST", p: "/goals", f: "Starting a goal" }
];

for (const { m, p, f } of needsRuntimePatterns) {
  registerRoute({
    method: m as any,
    pattern: p,
    handler: async () => needsRuntimeError(f)
  });
}
