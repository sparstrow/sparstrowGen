import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, CircleAlert, Monitor, PartyPopper } from "lucide-react";
import { useProfile, useRuntimes, useWorkspace } from "@/api/hooks";
import { type StepId, type StepState, isSetupComplete, setupSteps } from "@/lib/setup";
import { ProfileForm } from "@/components/profile-form";
import { WorkspaceForm } from "@/components/workspace-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * T-M10-03 — the setup guide.
 *
 * Web-only (phase decision 2): this page is registered only under
 * `apps/web/src/app/setup/page.tsx`, never in `packages/ui/src/router.tsx`.
 * The local desktop build has no account, no cloud workspace and no pairing,
 * so a guide here would teach a workflow that host does not have.
 *
 * **Never a gate.** `todo` steps are collapsed but always expandable and
 * never disabled (scenario 6) — someone who wants to pair a machine before
 * naming their workspace can. There is no dismiss button and no redirect on
 * completion (plan decision 4/5): the page just says setup is complete and
 * stays reachable.
 */

const STEP_META: Record<StepId, { title: string; blurb: string }> = {
  profile: {
    title: "Your profile",
    blurb:
      "Agents work on your behalf — this is who they're working as, and what they should know about you.",
  },
  workspace: {
    title: "Your workspace",
    blurb:
      "Everything — machines, agents, runs, memory — lives inside a workspace. Name it, and tell agents what it's for.",
  },
  machine: {
    title: "Your first machine",
    blurb:
      "Agents run on a computer you own, not in the browser. Pairing one is what makes everything else work.",
  },
};

const STATE_ICON: Record<StepState, React.ReactNode> = {
  done: <CheckCircle2 className="size-5 text-success" strokeWidth={1.8} />,
  current: <span className="flex size-5 items-center justify-center">
    <span className="size-2.5 rounded-full bg-primary" />
  </span>,
  todo: <span className="flex size-5 items-center justify-center">
    <span className="size-2.5 rounded-full border-2 border-muted-foreground/40" />
  </span>,
  unknown: <CircleAlert className="size-5 text-warning" strokeWidth={1.8} />,
};

function StepShell({
  id,
  state,
  open,
  onToggle,
  doneSummary,
  children,
}: {
  id: StepId;
  state: StepState;
  open: boolean;
  onToggle: () => void;
  doneSummary: string | null;
  children: React.ReactNode;
}) {
  const meta = STEP_META[id];

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {STATE_ICON[state]}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{meta.title}</span>
          {!open && state === "done" && doneSummary ? (
            <span className="block truncate text-xs text-muted-foreground">{doneSummary}</span>
          ) : !open ? (
            <span className="block truncate text-xs text-muted-foreground">{meta.blurb}</span>
          ) : null}
        </span>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border/60 px-4 py-4">
          <p className="text-xs text-muted-foreground">{meta.blurb}</p>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MachineStepBody({
  state,
  count,
  error,
  onRetry,
}: {
  state: StepState;
  count: number | undefined;
  error: string | undefined;
  onRetry: () => void;
}) {
  if (state === "unknown") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-destructive">Couldn't check this. {error ?? ""}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {state === "done"
          ? `${count} machine${count === 1 ? "" : "s"} paired.`
          : "Pairing a machine needs a checkout of this repository today — sparstrow is not published as an installable package yet."}
      </p>
      <Button asChild size="sm" variant={state === "done" ? "outline" : "default"}>
        <Link href="/machines">
          <Monitor className="size-4" /> {state === "done" ? "Manage machines" : "Pair a machine"}
        </Link>
      </Button>
    </div>
  );
}

export function SetupPage() {
  const profileQ = useProfile();
  const workspaceQ = useWorkspace();
  const runtimesQ = useRuntimes();

  const [overrides, setOverrides] = React.useState<Partial<Record<StepId, boolean>>>({});

  // Latches false permanently once every query has settled at least once —
  // deliberately NOT a live `isLoading` check. The workspace step's inline
  // form mounts only once `loading` is false, and that form's own
  // `useWorkspace()` call is a second observer on the same query; mounting it
  // can itself trigger a background refetch, which must never be allowed to
  // flip this page back into a full loading skeleton (that would unmount the
  // very form that triggered it, an oscillation this guards against
  // regardless of exactly why a given refetch happens).
  const currentlySettled = !profileQ.isLoading && !workspaceQ.isLoading && !runtimesQ.isLoading;
  const [everSettled, setEverSettled] = React.useState(currentlySettled);
  React.useEffect(() => {
    if (currentlySettled) setEverSettled(true);
  }, [currentlySettled]);
  const loading = !everSettled;

  const steps = setupSteps({
    profile: profileQ.isError ? null : profileQ.data,
    workspace: workspaceQ.isError ? null : workspaceQ.data,
    machines: runtimesQ.isError ? null : runtimesQ.data,
  });
  const complete = isSetupComplete(steps);

  function isOpen(id: StepId, state: StepState) {
    if (overrides[id] !== undefined) return overrides[id]!;
    return state === "current" || state === "unknown";
  }
  function toggle(id: StepId, state: StepState) {
    setOverrides((prev) => ({ ...prev, [id]: !isOpen(id, state) }));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <p className="text-sm text-muted-foreground">
          Three things, in order. Skip ahead any time — nothing here is a gate.
        </p>
      </div>

      {complete ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
          <PartyPopper className="size-5 shrink-0 text-success" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="text-sm font-medium">You're all set.</p>
            <p className="text-xs text-muted-foreground">
              Profile, workspace and a machine are all in place — start a run or create an agent
              whenever you're ready.
            </p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step) => {
            const open = isOpen(step.id, step.state);
            const doneSummary =
              step.state === "done"
                ? step.id === "profile"
                  ? (profileQ.data?.name ?? null)
                  : step.id === "workspace"
                    ? (workspaceQ.data?.name ?? null)
                    : `${runtimesQ.data?.length ?? 0} machine${runtimesQ.data?.length === 1 ? "" : "s"} paired`
                : null;

            return (
              <StepShell
                key={step.id}
                id={step.id}
                state={step.state}
                open={open}
                onToggle={() => toggle(step.id, step.state)}
                doneSummary={doneSummary}
              >
                {step.id === "profile" ? <ProfileForm variant="inline" /> : null}
                {step.id === "workspace" ? <WorkspaceForm variant="inline" /> : null}
                {step.id === "machine" ? (
                  <MachineStepBody
                    state={step.state}
                    count={runtimesQ.data?.length}
                    error={runtimesQ.error?.message}
                    onRetry={() => void runtimesQ.refetch()}
                  />
                ) : null}
              </StepShell>
            );
          })}
        </div>
      )}
    </div>
  );
}
