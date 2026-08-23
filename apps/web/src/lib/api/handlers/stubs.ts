import { registerRoute, fail, HandlerContext } from "../router";

function hostLocalError(feature: string) {
  return fail(501, `${feature} runs on the local daemon and is not available from the web app.`);
}

/**
 * A stub's message is a promise, and the next reader will hold you to it.
 *
 * These all used to say "Arriving in M4". M4 shipped the dispatch spine —
 * starting, cancelling and running a task — and none of the rest, because each
 * of them needs its own payload, its own progress model and its own UI, and
 * shipping them as a batch of half-tested command kinds is the over-engineering
 * AGENTS.md §9 rules out.
 *
 * So each now names a phase that will actually serve it, or admits that none is
 * scheduled. "Not scheduled yet" is a true and useful thing to tell someone;
 * naming a milestone that will not contain it is not.
 */
function needsRuntimeError(feature: string, arriving: string | null) {
  const when = arriving ? ` Arriving in ${arriving}.` : " It is not scheduled yet.";
  return fail(501, `${feature} requires a paired machine. Pair one from Settings.${when}`);
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

// Needs a runtime.
//
// `POST /runs`, `POST /runs/:id/cancel` and `POST /tasks/:id/run` are NOT here
// any more — M4 serves them from handlers/runs.ts and handlers/tasks.ts.
// Leaving a stub registered alongside a real handler is how M2's defect 5
// happened: `POST /goals` had both, and the stub won depending on import order.
const needsRuntimePatterns = [
  // Chat over the spine needs a daemon-dispatched turn, which M5 (transcripts)
  // never actually included — see doc/tasks/M5/README.md's own "M5 does not
  // build ... chat streaming" and doc/specs/2026-08-23-chat-message-sending.md.
  { m: "POST", p: "/chat/sessions/:id/messages", f: "Sending a chat message", when: null },
  { m: "POST", p: "/chat/sessions/:id/retry", f: "Retrying chat", when: null },
  { m: "POST", p: "/teams/:id/manager/chat", f: "Team manager chat", when: null },
  // Each of these is a multi-step orchestration with its own progress model.
  { m: "POST", p: "/pipelines/:id/run", f: "Running a pipeline", when: null },
  { m: "POST", p: "/cron-jobs/:id/run-now", f: "Running a cron job", when: null },
  { m: "POST", p: "/agents/:id/test-spawn", f: "Testing an agent", when: null },
  { m: "POST", p: "/agents/draft", f: "Drafting an agent", when: null },
  { m: "POST", p: "/projects/:id/dream", f: "Project dreaming", when: null },
  { m: "PUT", p: "/projects/:id/dream", f: "Project dreaming", when: null }, // UI hook says PUT
  { m: "POST", p: "/projects/:id/dream/(.*)", f: "Project dreaming", when: null },
  { m: "POST", p: "/projects/:id/sync-from-base", f: "Syncing project", when: null },
  { m: "POST", p: "/goals", f: "Starting a goal", when: null }
];

for (const { m, p, f, when } of needsRuntimePatterns) {
  registerRoute({
    method: m as any,
    pattern: p,
    handler: async () => needsRuntimeError(f, when)
  });
}
