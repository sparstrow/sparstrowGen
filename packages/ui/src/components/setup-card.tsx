import { Compass } from "lucide-react";
import { useProfile, useRuntimes, useWorkspace } from "@/api/hooks";
import { type StepId, isSetupComplete, setupSteps } from "@/lib/setup";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STEP_LABEL: Record<StepId, string> = {
  profile: "your profile",
  workspace: "your workspace",
  machine: "your first machine",
};

/**
 * T-M10-04 — the dashboard's entry point into `/setup`. Web-only, and placed
 * in `apps/web/src/app/page.tsx` specifically, not the shared
 * `packages/ui/src/routes/pages/dashboard.tsx` — the web dashboard is its own
 * implementation, so a card added to the shared page would be shown to
 * nobody on the web (this phase's headline trap).
 *
 * **Renders `null`, not an error, whenever there is nothing useful to say**:
 * all three steps done, or any step `unknown`. A broken setup query is not
 * something to debug on the dashboard — `/setup` is where that failure is
 * shown, per the phase's four-states table — and a card reading "couldn't
 * check your setup" above someone else's real work would be noise.
 *
 * No dismiss control (phase decision 5): the card disappears on its own once
 * setup completes, which is what makes one unnecessary.
 */
export function SetupCard() {
  const profileQ = useProfile();
  const workspaceQ = useWorkspace();
  const runtimesQ = useRuntimes();

  const loading = profileQ.isLoading || workspaceQ.isLoading || runtimesQ.isLoading;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const steps = setupSteps({
    profile: profileQ.isError ? null : profileQ.data,
    workspace: workspaceQ.isError ? null : workspaceQ.data,
    machines: runtimesQ.isError ? null : runtimesQ.data,
  });

  if (steps.some((s) => s.state === "unknown")) return null;
  if (isSetupComplete(steps)) return null;

  const doneCount = steps.filter((s) => s.state === "done").length;
  const current = steps.find((s) => s.state === "current");

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Compass className="size-5 shrink-0 text-primary" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Setup — {doneCount} of {steps.length} done
          </p>
          {current ? (
            <p className="truncate text-xs text-muted-foreground">
              Next: {STEP_LABEL[current.id]}
            </p>
          ) : null}
        </div>
        {/*
         * A plain anchor, not TanStack's typed `Link` — `/setup` is
         * deliberately absent from `packages/ui/src/router.tsx` (phase
         * decision 2, web-only), so it has no entry in the generated route
         * map to link against. `apps/web`'s Next.js host serves the page
         * regardless of how it's reached.
         */}
        <a href="/setup" className="shrink-0 text-sm font-medium text-primary hover:underline">
          Continue
        </a>
      </CardContent>
    </Card>
  );
}
