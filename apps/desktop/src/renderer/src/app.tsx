import * as React from "react";
import { MachineList } from "@sparstrow/views";
import { ApiError, useApi } from "@sparstrow/core";
import { Button } from "@sparstrow/ui/components/ui/button";

/**
 * The desktop window.
 *
 * Deliberately one screen. Phase 3's job is to prove the shell renders the
 * SHARED components against `server/` — `MachineList` below is the identical
 * component `apps/web` renders on its home page, with no Next.js anywhere in
 * this process. Chat, runs and the rest arrive in Phase 4 as more of the same
 * imports, not as more of this file.
 */

/**
 * Is `server/` there, and does it know who we are?
 *
 * Two separate questions, and the app is much easier to reason about when they
 * are asked separately. "Cannot reach the server" and "reachable but not signed
 * in" have completely different answers, and collapsing them into one spinner
 * is how a person ends up restarting an app that was working.
 */
function useServerStatus() {
  const api = useApi();
  const [state, setState] = React.useState<
    { kind: "checking" } | { kind: "unreachable"; message: string } | { kind: "signed-out" } | { kind: "ready" }
  >({ kind: "checking" });

  const check = React.useCallback(async () => {
    setState({ kind: "checking" });
    if (!(await api.isReachable())) {
      setState({ kind: "unreachable", message: "The Sparstrow server is not running." });
      return;
    }

    try {
      await api.get("/workspace");
      setState({ kind: "ready" });
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        setState({ kind: "signed-out" });
        return;
      }
      setState({
        kind: "unreachable",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }, [api]);

  React.useEffect(() => {
    void check();
  }, [check]);

  return { state, recheck: check };
}

export function App() {
  const { state, recheck } = useServerStatus();

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <p className="text-sm font-medium">Sparstrowgen</p>
        <p className="text-xs text-muted-foreground">
          v{window.sparstrowDesktop?.version ?? "dev"}
        </p>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {state.kind === "checking" ? (
          <p className="text-sm text-muted-foreground">Connecting…</p>
        ) : null}

        {state.kind === "unreachable" ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium">{state.message}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The desktop app talks to a Sparstrow server on this computer. Start it
              with <code className="rounded bg-muted px-1">pnpm dev:up</code>, or point
              this app somewhere else with <code className="rounded bg-muted px-1">SPARSTROW_SERVER_URL</code>.
            </p>
            <Button className="mt-3" size="sm" onClick={() => void recheck()}>
              Try again
            </Button>
          </div>
        ) : null}

        {state.kind === "signed-out" ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">Not signed in</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The server is running and reachable. Signing in from the desktop app
              lands in the next phase — it opens your browser and hands this window a
              session, so no password is ever typed here.
            </p>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <section className="space-y-3">
            <h1 className="text-sm font-medium">Your machines</h1>
            {/*
              The same component `apps/web` renders on its home page. It arrives
              here through `@sparstrow/views` with no adapter and no shim, which
              is the entire point of the restructure.
            */}
            <MachineList />
          </section>
        ) : null}
      </main>
    </div>
  );
}
