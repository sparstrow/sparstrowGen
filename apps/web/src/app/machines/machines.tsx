import * as React from "react";
import {
  Check,
  Clock,
  Copy,
  Loader2,
  Monitor,
  Pencil,
  RefreshCw,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { useRuntimes, type Runtime } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import {
  createPairingCodeAction,
  removeRuntimeAction,
  renameRuntimeAction,
  revokeRuntimeTokenAction,
  setRuntimeSettingAction,
} from "./actions";
import {
  DEFAULT_WIP_SNAPSHOT_KEEP,
  SETTING_WIP_SNAPSHOT,
  SETTING_WIP_SNAPSHOT_KEEP,
  isWipSnapshotEnabled,
  machineState,
  type MachineState,
} from "@sparstrow/shared";
import { cn } from "@/lib/utils";

/**
 * M8 — Machines as a destination of its own (US1).
 *
 * Promoted out of Settings → Workspace → General, where it had lived since M3
 * as `RuntimesCard`. Pair, rename, revoke, remove and the per-machine snapshot
 * switch are all M3/M4 behaviour moved verbatim; what M8 changes is where they
 * live, what the second state is CALLED (`machineState()`, not `online`), and
 * that a failed list no longer masquerades as an empty one.
 *
 * Without this page M3 is invisible: a paired machine that appears nowhere is
 * indistinguishable from a pairing that failed.
 */

/**
 * `sparstrow` is not on npm and there is no installer yet (`D-10`). Saying
 * "run sparstrow pair" without this leaves someone holding a code and a
 * command their shell does not have.
 */
const CHECKOUT_NOTE =
  "sparstrow isn't published yet — the machine needs a checkout of this repository to run it. Packaged installers are coming.";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "unknown";
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The code, with a live countdown.
 *
 * The countdown is not decoration. The code lives in component state and
 * nothing invalidates it when it expires, so without this someone reads a dead
 * code into a terminal on another machine and blames the CLI.
 */
function PairingCodePanel({
  code,
  expiresAt,
  onExpired,
}: {
  code: string;
  expiresAt: string;
  onExpired: () => void;
}) {
  const [remaining, setRemaining] = React.useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const tick = setInterval(() => {
      const left = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(left);
      if (left === 0) onExpired();
    }, 1000);
    return () => clearInterval(tick);
  }, [expiresAt, onExpired]);

  React.useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(reset);
  }, [copied]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return (
    <div className="spg-turn space-y-3 rounded-lg border bg-muted/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-[0.2em]">
          {code}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">On the machine you want to pair, run:</p>
      <code className="block rounded-md border bg-background px-3 py-2 font-mono text-sm">
        sparstrow pair {code}
      </code>
      <p className="text-xs text-muted-foreground">{CHECKOUT_NOTE}</p>

      <p
        className={cn(
          "text-xs tabular-nums",
          remaining < 60_000 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {remaining === 0
          ? "This code has expired — generate another."
          : `Expires in ${minutes}:${String(seconds).padStart(2, "0")} · works once`}
      </p>
    </div>
  );
}

type PairOutcome = { kind: "paired"; name: string } | { kind: "expired" };

/**
 * The deliberate "something just happened" moment between a code being
 * redeemed (or not) and the list settling back to normal.
 *
 * Sits in the exact spot `PairingCodePanel` just occupied — same border/bg
 * treatment — so the eye doesn't have to travel to learn what happened to the
 * code it was just looking at. Without this, redemption was silent: the code
 * panel vanished and the full row (name, OS, capability badges) was simply
 * already there, which read as the page skipping a step rather than a machine
 * actually pairing. `onExpired` had the same silence in the other direction —
 * a code could run out with nothing ever said about it.
 */
function PairingOutcomePanel({
  outcome,
  onDismiss,
  onRetry,
}: {
  outcome: PairOutcome;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const isPaired = outcome.kind === "paired";

  return (
    <div
      className="spg-turn flex items-start gap-3 rounded-lg border bg-muted/40 p-5"
      role="status"
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isPaired ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {isPaired ? <Check className="size-4" /> : <Clock className="size-4" />}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">
          {isPaired ? `${outcome.name} is paired` : "Code expired — no machine connected"}
        </p>
        <p className="text-sm text-muted-foreground">
          {isPaired
            ? "Restart core on that machine if it was already running."
            : "Nobody redeemed it within the 10-minute window. Generate a new one to try again."}
        </p>
        {isPaired ? null : (
          <Button size="sm" variant="outline" className="mt-1" onClick={onRetry}>
            Generate new code
          </Button>
        )}
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * The entity tile from `DESIGN.md` §6: the machine's semantic icon in a tile,
 * with its state as a dot on the corner. The dot is the ONLY thing on this
 * page allowed to carry status colour, and it is never the sole carrier — the
 * words beside it say the same thing (§2.1, and scenario 6's requirement that
 * an unreachable machine says so in text).
 */
const DOT_TONE: Record<MachineState, string> = {
  active: "bg-success",
  draining: "bg-warning",
  unreachable: "bg-muted-foreground/40",
};

function MachineTile({ state }: { state: MachineState }) {
  return (
    <ItemMedia variant="icon" className="relative">
      <Monitor className="size-4" strokeWidth={1.8} />
      <span
        className={cn(
          "absolute -bottom-0.5 -left-0.5 size-2.5 rounded-full ring-2 ring-background",
          DOT_TONE[state],
        )}
        aria-hidden="true"
      />
    </ItemMedia>
  );
}

function RuntimeRow({ runtime }: { runtime: Runtime }) {
  const queryClient = useQueryClient();
  const [, startRename] = React.useTransition();
  const [revokePending, startRevoke] = React.useTransition();
  const [removePending, startRemove] = React.useTransition();

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(runtime.name);
  const [confirming, setConfirming] = React.useState<null | "revoke" | "remove">(null);

  const state = machineState(runtime.status, runtime.lastHeartbeat);

  function commit() {
    const next = draft.trim();
    if (next && next !== runtime.name) {
      startRename(async () => {
        const r = await callAction(() => renameRuntimeAction(runtime.id, next));
        if (r.ok) void queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      });
    }
    setEditing(false);
  }

  return (
    // `spg-turn` only replays when this Item actually mounts (a genuinely new
    // `key`), never on the 15s poll re-rendering an existing row — DESIGN.md
    // §7 lists "Row insert" as the named Entrance case this fills.
    <Item
      variant="outline"
      size="default"
      className="spg-turn flex-wrap gap-x-3 gap-y-2 px-4 py-3"
    >
      <MachineTile state={state} />

      <ItemContent>
        <ItemTitle>
          {editing ? (
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(runtime.name);
                  setEditing(false);
                }
              }}
              className="h-8 max-w-56"
              aria-label="Machine name"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="group flex items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Rename ${runtime.name}`}
              title="Rename this machine"
            >
              {runtime.name}
              <Pencil className="size-3 opacity-0 transition-opacity duration-100 group-hover:opacity-60 group-focus-visible:opacity-60" />
            </button>
          )}
        </ItemTitle>

        {/*
         * `machineState()` decides the word, and an unreachable machine ALWAYS
         * carries when it was last seen (FR-006). A bare "unreachable" is the
         * assertion the spec rejected — we do not know whether it is off,
         * asleep, crashed, or merely off the network.
         */}
        <ItemDescription>
          <span
            className={cn(
              "font-medium",
              state === "active" && "text-success",
              state === "draining" && "text-warning",
            )}
          >
            {state}
          </span>
          {state !== "active" ? ` · last seen ${relativeTime(runtime.lastHeartbeat)}` : ""} ·{" "}
          {runtime.os} · {runtime.hostname}
          {runtime.coreVersion ? ` · core ${runtime.coreVersion}` : ""}
        </ItemDescription>
      </ItemContent>

      {/* Its own line under ~sm, where sharing one with the name squeezed the
          identity text down to "active · win3…" — the very fields scenario 5
          asks the row to show. */}
      <div className="flex basis-full flex-wrap items-center gap-1.5 sm:basis-auto">
        {runtime.capabilities.length === 0 ? (
          <Badge variant="outline" title="This machine reported no usable providers">
            no providers
          </Badge>
        ) : (
          runtime.capabilities.map((capability) => (
            <Badge key={capability} variant="secondary">
              {capability}
            </Badge>
          ))
        )}
      </div>

      <ItemActions>
        <Button
          size="sm"
          variant="ghost"
          title="Revoke this machine's pairing"
          aria-label={`Revoke ${runtime.name}`}
          onClick={() => setConfirming("revoke")}
        >
          <Unplug className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="Remove this machine from the workspace"
          aria-label={`Remove ${runtime.name}`}
          onClick={() => setConfirming("remove")}
        >
          <Trash2 className="size-4" />
        </Button>
      </ItemActions>

      <ItemFooter>
        <SnapshotControl runtime={runtime} />
      </ItemFooter>

      <ConfirmDialog
        open={confirming === "revoke"}
        onOpenChange={(open) => setConfirming(open ? "revoke" : null)}
        title={`Revoke ${runtime.name}?`}
        description={
          <>
            This machine stops reaching the workspace on its very next request. It stays in
            the list, and pairing it again with a fresh code restores access.
          </>
        }
        confirmLabel="Revoke pairing"
        pendingLabel="Revoking…"
        pending={revokePending}
        onConfirm={() =>
          startRevoke(async () => {
            const r = await callAction(() => revokeRuntimeTokenAction(runtime.id));
            if (r.ok) {
              void queryClient.invalidateQueries({ queryKey: ["runtimes"] });
              void queryClient.invalidateQueries({ queryKey: ["health"] });
            }
            setConfirming(null);
          })
        }
      />

      <ConfirmDialog
        open={confirming === "remove"}
        onOpenChange={(open) => setConfirming(open ? "remove" : null)}
        title={`Remove ${runtime.name}?`}
        description={
          <>
            Deletes this machine and its pairing from the workspace. Anything recorded
            against it goes too. The machine itself keeps its local data — pair it again to
            reconnect.
          </>
        }
        confirmLabel="Remove machine"
        pendingLabel="Removing…"
        pending={removePending}
        onConfirm={() =>
          startRemove(async () => {
            const r = await callAction(() => removeRuntimeAction(runtime.id));
            if (r.ok) {
              void queryClient.invalidateQueries({ queryKey: ["runtimes"] });
              void queryClient.invalidateQueries({ queryKey: ["health"] });
            }
            setConfirming(null);
          })
        }
      />
    </Item>
  );
}

/**
 * The per-runtime WIP snapshot control (`G-6`).
 *
 * Renders `runtime.reportedSettings` — what the machine last CONFIRMED — and
 * never an optimistic local value. That is the entire reason this closes the
 * gap rather than reopening it in a new place: `G-6` was raised because a
 * switch in workspace settings would flip and silently fail to reach the daemon
 * it claimed to configure, and a switch that shows what you clicked rather than
 * what happened has the same defect wearing a better hat.
 *
 * Unreachable machines get a disabled control with the reason spelled out.
 * Queuing the command instead would leave someone believing they had changed a
 * setting on a computer that is switched off.
 *
 * It still disables on `runtime.online`, not on `machineState()`: this is a
 * "can the command be delivered?" question, and the label above is a "what do
 * I call it?" one. Only the wording is shared, so that one row does not say
 * "unreachable" and "offline" about the same machine in two places.
 */
function SnapshotControl({ runtime }: { runtime: Runtime }) {
  const queryClient = useQueryClient();
  const [, startTransition] = React.useTransition();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reported = runtime.reportedSettings ?? {};
  const enabled = isWipSnapshotEnabled(reported[SETTING_WIP_SNAPSHOT]);
  const keep = reported[SETTING_WIP_SNAPSHOT_KEEP] ?? String(DEFAULT_WIP_SNAPSHOT_KEEP);

  // The machines can legitimately disagree — a laptop with a small disk and a
  // workstation with a large one have different right answers — which is why
  // this is here per machine and not one switch in workspace settings.
  const send = (key: string, value: string) => {
    setPendingKey(key);
    setError(null);
    startTransition(async () => {
      const r = await callAction(() => setRuntimeSettingAction(runtime.id, key, value));
      if (!r.ok) setError(r.error);
      else void queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      setPendingKey(null);
    });
  };

  return (
    <div className="w-full border-t border-border/60 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Snapshot uncommitted work</p>
          <p className="text-xs text-muted-foreground">
            {runtime.online
              ? `Keeps the last ${keep} runs' working trees on this machine, under a private git ref.`
              : "This machine is unreachable — its settings can be changed when it reconnects."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pendingKey ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          <Switch
            checked={enabled}
            disabled={!runtime.online || pendingKey !== null}
            onCheckedChange={(next) => send(SETTING_WIP_SNAPSHOT, next ? "on" : "off")}
            aria-label={`Snapshot uncommitted work on ${runtime.name}`}
          />
        </div>
      </div>

      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Skeletons shaped like the rows they stand in for, so nothing jumps on arrival. */
function MachineRowSkeleton() {
  return (
    <Item variant="outline" size="default" className="flex-wrap gap-x-3 gap-y-2 px-4 py-3">
      <Skeleton className="size-8 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-8 w-16" />
      <ItemFooter>
        <div className="w-full border-t border-border/60 pt-2">
          <Skeleton className="h-9 w-full" />
        </div>
      </ItemFooter>
    </Item>
  );
}

/**
 * What failed, in the user's words, plus the next action — `DESIGN.md` §10.
 * `inline` is the with-data form: the list below it is real and usable, so
 * this says the refresh failed without pretending the page is empty.
 */
function RuntimesError({
  message,
  query,
  inline = false,
}: {
  message: string;
  query: { isFetching: boolean; refetch: () => unknown };
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/40 bg-destructive/5",
        inline ? "flex flex-wrap items-center gap-3 px-4 py-3" : "p-6",
      )}
      role="alert"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {inline ? "Couldn't refresh this list" : "Couldn't load machines"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className={inline ? "" : "mt-3"}
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isFetching ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        Try again
      </Button>
    </div>
  );
}

export function MachinesPage() {
  const runtimes = useRuntimes();
  const [createPending, startCreate] = React.useTransition();
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<{
    code: string;
    expiresAt: string;
    knownIds: ReadonlySet<string>;
  } | null>(null);
  const [pairOutcome, setPairOutcome] = React.useState<PairOutcome | null>(null);

  const machines = runtimes.data ?? [];

  /**
   * Detect the redeemed code by diffing ids, not by "the list got longer".
   *
   * Length-plus-"assume it's the last element" breaks the moment the list is
   * ever sorted by anything other than insertion order — a rename, a status
   * change, a future sort control all reorder `machines` without a new
   * machine existing. Diffing against the id set taken at issue time is
   * correct regardless of order, and also survives two codes being issued
   * back to back (each panel only reacts to ids it didn't already know about).
   */
  React.useEffect(() => {
    if (!issued) return;
    const arrival = machines.find((m) => !issued.knownIds.has(m.id));
    if (!arrival) return;
    setPairOutcome({ kind: "paired", name: arrival.name });
    setIssued(null);
  }, [machines, issued]);

  React.useEffect(() => {
    if (!pairOutcome || pairOutcome.kind !== "paired") return;
    const clear = setTimeout(() => setPairOutcome(null), 8000);
    return () => clearTimeout(clear);
  }, [pairOutcome]);

  const pair = () => {
    setPairOutcome(null);
    setCreateError(null);
    startCreate(async () => {
      const r = await callAction(() => createPairingCodeAction());
      if (!r.ok) {
        setCreateError(r.error);
        return;
      }
      setIssued({ ...r.data, knownIds: new Set(machines.map((m) => m.id)) });
    });
  };

  const PairButton = ({ variant }: { variant: "default" | "outline" }) => (
    <Button variant={variant} disabled={createPending} onClick={pair}>
      {createPending ? <Loader2 className="size-4 animate-spin" /> : null}
      Pair a machine
    </Button>
  );

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-[650] leading-[1.15] tracking-tight">Machines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Machines running Sparstrow core that this workspace can reach. Agents run on
            these, not in the browser.
          </p>
        </div>
        {/* The empty state carries its own primary action, so this would be a
            second button saying the same thing on the one screen that must not
            be cluttered. */}
        {machines.length > 0 && !issued ? <PairButton variant="outline" /> : null}
      </div>

      {issued ? (
        <PairingCodePanel
          code={issued.code}
          expiresAt={issued.expiresAt}
          onExpired={() => {
            setIssued(null);
            setPairOutcome({ kind: "expired" });
          }}
        />
      ) : null}

      {createError ? (
        <p className="text-sm text-destructive">Could not create a pairing code: {createError}</p>
      ) : null}

      {pairOutcome ? (
        <PairingOutcomePanel
          outcome={pairOutcome}
          onDismiss={() => setPairOutcome(null)}
          onRetry={pair}
        />
      ) : null}

      {/*
       * A failed load must never reach the empty state. The card this page
       * replaces had no error branch at all, so a failed request fell through
       * to "No machines paired yet" and told a new owner something untrue
       * about their workspace.
       *
       * Two tiers, because the two failures are not the same: with nothing to
       * show, the error REPLACES the list; with machines already on screen, a
       * refetch that failed is reported above them rather than erasing a list
       * whose controls still work.
       */}
      {runtimes.isError && machines.length > 0 ? (
        <RuntimesError inline message={runtimes.error.message} query={runtimes} />
      ) : null}

      {runtimes.isError && machines.length === 0 ? (
        <RuntimesError message={runtimes.error.message} query={runtimes} />
      ) : runtimes.isLoading ? (
        <ItemGroup className="gap-2">
          <MachineRowSkeleton />
          <MachineRowSkeleton />
        </ItemGroup>
      ) : machines.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12">
              <Monitor className="size-6" strokeWidth={1.5} />
            </EmptyMedia>
            <EmptyTitle>No machines paired yet</EmptyTitle>
            <EmptyDescription>
              A machine is a computer running Sparstrow core. Pairing links it to this
              workspace so agents have somewhere to actually run — nothing runs in the
              browser. Generate a code here, then redeem it on that computer.
            </EmptyDescription>
          </EmptyHeader>
          {/* While a code is on screen the panel above is already saying both
              of these; repeating them here puts the same sentence twice on
              the one page the spec calls its most important. */}
          {issued ? null : (
            <EmptyContent>
              <PairButton variant="default" />
              <p className="text-xs text-muted-foreground">{CHECKOUT_NOTE}</p>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {machines.map((runtime) => (
            <RuntimeRow key={runtime.id} runtime={runtime} />
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
