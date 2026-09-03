import * as React from "react";
import { MachineList } from "@sparstrow/views";
import { ApiError, useApi } from "@sparstrow/core";
import { Button } from "@sparstrow/ui/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@sparstrow/core";
import { Monitor, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { Settings } from "./settings";
import { isNewsworthy, useUpdates } from "./use-updates";

type Screen = "machines" | "settings";

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
  const [screen, setScreen] = React.useState<Screen>("machines");
  const { status: update } = useUpdates();

  const queryClient = useQueryClient();

  // Clicking the OS update notification should land on the screen that installs
  // it. The main process only says where; what the name means is decided here.
  React.useEffect(() => {
    return window.sparstrowDesktop?.onNavigate((target) => {
      if (target === "settings") setScreen("settings");
    });
  }, []);

  // The main process claims this computer at launch and after sign-in, and that
  // finishes AFTER this window has already rendered — the runtime has to come
  // up first. Without this the list would render "No machines yet" and go on
  // saying it, correctly, about data fetched a second too early.
  React.useEffect(() => {
    return window.sparstrowDesktop?.onMachinesChanged(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.machines.all });
    });
  }, [queryClient]);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-1">
          <p className="mr-2 text-sm font-medium">Sparstrowgen</p>
          <NavButton
            active={screen === "machines"}
            onClick={() => setScreen("machines")}
            icon={<Monitor className="size-3.5" strokeWidth={2} />}
            label="Machines"
          />
          <NavButton
            active={screen === "settings"}
            onClick={() => setScreen("settings")}
            icon={<SettingsIcon className="size-3.5" strokeWidth={2} />}
            label="Settings"
          />
        </div>

        <div className="flex items-center gap-2">
          {/*
            The notification, in the one place it is always visible. It is a
            button, not a badge: news the user cannot act on from where they are
            standing is just an interruption, so this goes to the screen that
            does something about it.
          */}
          {isNewsworthy(update) && screen !== "settings" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-brand/40 text-brand"
              onClick={() => setScreen("settings")}
            >
              <Sparkles className="size-3.5" strokeWidth={2} />
              {update.state === "downloaded" ? "Update ready" : "Update available"}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            v{window.sparstrowDesktop?.version ?? "dev"}
          </p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {/*
          Settings is reachable whatever the server is doing. It is where the
          update lives, and an app that cannot reach its server is a moment when
          being able to install a fix matters more than usual, not less.
        */}
        {screen === "settings" ? <Settings /> : null}

        {screen === "machines" && state.kind === "checking" ? (
          <p className="text-sm text-muted-foreground">Connecting…</p>
        ) : null}

        {screen === "machines" && state.kind === "unreachable" ? (
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

        {screen === "machines" && state.kind === "signed-out" ? (
          <SignIn onSignedIn={() => void recheck()} />
        ) : null}

        {screen === "machines" && state.kind === "ready" ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-medium">Your machines</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await window.sparstrowDesktop?.session.signOut();
                  void recheck();
                }}
              >
                Sign out
              </Button>
            </div>
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

/**
 * A tab in the header strip.
 *
 * Deliberately not a router. Two screens with no URLs to share and no back
 * button to honour do not need one, and adding it now would be the fourth
 * navigation abstraction this repo has carried — `DESIGN.md` §9's tab strip is
 * the contract to grow into when there are enough screens to justify it.
 */
function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors duration-110 ${
        active
          ? "bg-accent text-foreground [&_svg]:text-brand"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * The one human moment.
 *
 * No password field, and there never will be: a native window asking for
 * credentials is indistinguishable from one that is phishing them, and it would
 * have to handle MFA, OAuth providers and password resets itself. The browser
 * already does all of that, so the button opens it and waits.
 *
 * The promise this awaits does not settle until the browser has actually
 * redirected back — so "Waiting for your browser…" is the true state, not an
 * optimistic one, and a cancelled sign-in ends in a real error rather than a
 * spinner that never stops.
 */
function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const bridge = window.sparstrowDesktop?.session;
    if (!bridge) {
      setError("This build has no desktop bridge — it is running outside Electron.");
      setBusy(false);
      return;
    }
    const result = await bridge.signIn();
    setBusy(false);
    if (result.ok) onSignedIn();
    else setError(result.error);
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border p-6 text-center">
      <p className="text-sm font-medium">Connect this computer</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Sparstrowgen signs you in through your browser, where you are already signed
        in. Nothing is typed here.
      </p>
      <Button className="mt-4" onClick={() => void start()} disabled={busy}>
        {busy ? "Waiting for your browser…" : "Sign in with your browser"}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
