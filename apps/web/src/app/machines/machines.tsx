import * as React from "react";
import {
  Check,
  Loader2,
  Monitor,
  Pencil,
  Plus,
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
import { useRuntimes, useWorkspace, type Runtime } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import { relativeTime } from "@/lib/format";
import {
  removeRuntimeAction,
  renameRuntimeAction,
  revokeRuntimeTokenAction,
  setRuntimeSettingAction,
} from "./actions";
import {
  DEFAULT_WIP_SNAPSHOT_KEEP,
  SETTING_TERMINAL_ACCESS,
  SETTING_WIP_SNAPSHOT,
  SETTING_WIP_SNAPSHOT_KEEP,
  isTerminalAccessEnabled,
  isWipSnapshotEnabled,
  machineState,
  type MachineState,
} from "@sparstrow/shared";
import { cn } from "@/lib/utils";
import { AddComputerDialog } from "./add-computer-dialog";
import { desktopCloudStatus } from "@web/lib/desktop-machine";

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
 * indistinguishable from a connection that failed.
 */

/**
 * `sparstrow` is not on npm and there is no installer yet (`D-10`). Naming a
 * command without this leaves someone with one their shell does not have.
 */
const CHECKOUT_NOTE =
  "The sparstrow CLI isn't published yet — another machine needs a checkout of this repository to run it. Packaged installers are coming.";

/**
 * The deliberate "something just happened" moment when a computer shows up in
 * the list without this page having done anything to cause it.
 *
 * That is now the NORMAL case, not the exception: the desktop app connects the
 * computer it runs on the moment someone signs in, so the most common arrival
 * has no button anywhere to attribute it to. Without this panel a fresh row is
 * silent — it just appears, which reads as the page skipping a step rather
 * than a computer actually connecting.
 */
function ConnectionOutcomePanel({ name, onDismiss }: { name: string; onDismiss: () => void }) {
  return (
    <div
      className="spg-turn flex items-start gap-3 rounded-lg border bg-muted/40 p-5"
      role="status"
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
        aria-hidden="true"
      >
        <Check className="size-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{name} is connected</p>
        <p className="text-sm text-muted-foreground">
          It can run work in every workspace you belong to.
        </p>
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

/**
 * Which machine id is the computer this browser is running on, or null.
 *
 * Only the desktop shell can answer: a plain browser has no way to know what
 * hardware it is on, and matching on hostname would badge the wrong row the
 * first time someone has two machines called `localhost`. Null everywhere
 * else, which is why the badge simply does not render in a web browser rather
 * than guessing.
 */
function useThisMachineId(): string | null {
  const [machineId, setMachineId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void desktopCloudStatus().then((status) => {
      if (!cancelled) setMachineId(status.machineId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return machineId;
}

function RuntimeRow({
  runtime,
  canManageTerminals,
  isThisDevice,
}: {
  runtime: Runtime;
  canManageTerminals: boolean;
  isThisDevice: boolean;
}) {
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
          {/* US1's "which one is mine". Neutral, not a status colour — this
              says what a row IS, not what state it is in (§2.1). */}
          {isThisDevice && (
            <Badge variant="secondary" className="ml-2 font-normal">
              This device
            </Badge>
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
          title="Disconnect this computer from your account"
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
        <TerminalAccessControl runtime={runtime} canManage={canManageTerminals} />
      </ItemFooter>

      <ConfirmDialog
        open={confirming === "revoke"}
        onOpenChange={(open) => setConfirming(open ? "revoke" : null)}
        title={`Disconnect ${runtime.name}?`}
        description={
          <>
            {/* What "revoke" means changed with the credential. A computer now
                belongs to a PERSON and reaches every workspace they are in, so
                "revoke it for this workspace" would be a lie — it would carry
                on working everywhere else while this page claimed otherwise.
                The copy says what actually happens. */}
            This computer stops reaching <strong>all of your workspaces</strong> on its very
            next request — not just this one, because its credential is yours rather than this
            workspace&apos;s. It stays in the list, and connecting it again restores access.
            {isThisDevice && (
              <>
                {" "}
                <strong>This is the computer you are using right now.</strong>
              </>
            )}
          </>
        }
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
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
            Deletes this computer from this workspace. Anything recorded
            against it goes too. The computer itself keeps its local data — connect it again to
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

/**
 * T-M17-04 — same shape as `SnapshotControl` immediately above: renders the
 * machine's own CONFIRMED value from `reportedSettings`, never an optimistic
 * local one (`G-6`), and disables with a reason when the command can't be
 * delivered. Differs in one way `SnapshotControl` doesn't need: this grant
 * is FR-009-gated, so a non-admin member never gets a control that would
 * silently no-op — the switch itself is disabled with why, matching
 * Terminals' own role check (`T-M17-02`).
 */
function TerminalAccessControl({ runtime, canManage }: { runtime: Runtime; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [, startTransition] = React.useTransition();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reported = runtime.reportedSettings ?? {};
  const enabled = isTerminalAccessEnabled(reported[SETTING_TERMINAL_ACCESS]);

  const send = (value: string) => {
    setPending(true);
    setError(null);
    startTransition(async () => {
      const r = await callAction(() => setRuntimeSettingAction(runtime.id, SETTING_TERMINAL_ACCESS, value));
      if (!r.ok) setError(r.error);
      else void queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      setPending(false);
    });
  };

  return (
    <div className="w-full border-t border-border/60 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Browser terminals</p>
          <p className="text-xs text-muted-foreground">
            {!canManage
              ? "Only workspace owners and admins can change this."
              : !runtime.online
                ? "This machine is unreachable — its settings can be changed when it reconnects."
                : "Lets a signed-in browser open a shell on this machine. Turning it off ends any open sessions."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          <Switch
            checked={enabled}
            disabled={!canManage || !runtime.online || pending}
            onCheckedChange={(next) => send(next ? "on" : "off")}
            aria-label={`Browser terminals on ${runtime.name}`}
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
  const workspace = useWorkspace();
  // T-M17-04 — the same role check Terminals itself uses (FR-009): a member
  // who is not owner/admin cannot open a terminal, so cannot switch whether
  // anyone else can either. Fail-closed while the role hasn't loaded yet.
  const canManageTerminals = workspace.data?.role === "owner" || workspace.data?.role === "admin";
  const [justPaired, setJustPaired] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const thisMachineId = useThisMachineId();

  const machines = runtimes.data ?? [];

  /**
   * Detect a newly-arrived machine by diffing ids against the set this page
   * knew about on its first successful load — not "the list got longer",
   * which breaks the moment `machines` is ever sorted by anything other than
   * insertion order.
   *
   * Nothing on THIS page starts a connection any more (the desktop app claims
   * its own computer, and another machine runs `sparstrow setup`, see
   * `/pair`), so there is no "issued" moment to diff against like the old
   * code-based flow had. Instead the baseline is simply whatever this page
   * already knew the first time `runtimes` resolved — any id that shows up
   * after that reads as "just paired", whether this tab or a completely
   * different one drove the confirm click.
   */
  const knownIdsRef = React.useRef<ReadonlySet<string> | null>(null);
  React.useEffect(() => {
    if (runtimes.isLoading) return;
    if (knownIdsRef.current === null) {
      knownIdsRef.current = new Set(machines.map((m) => m.id));
      return;
    }
    const arrival = machines.find((m) => !knownIdsRef.current!.has(m.id));
    knownIdsRef.current = new Set(machines.map((m) => m.id));
    if (arrival) setJustPaired(arrival.name);
  }, [machines, runtimes.isLoading]);

  React.useEffect(() => {
    if (!justPaired) return;
    const clear = setTimeout(() => setJustPaired(null), 8000);
    return () => clearTimeout(clear);
  }, [justPaired]);

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
        {/* US5. Deliberately not a "find machines" button: there is nothing
            safe to scan (see AddComputerDialog's header), so this opens a
            waiting room with the two commands to run on the other computer.
            The machine you are SITTING at needs none of this — the desktop app
            connects it the moment you sign in. */}
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" /> Add a computer
        </Button>
      </div>

      <AddComputerDialog open={addOpen} onOpenChange={setAddOpen} runtimeCount={machines.length} />

      {justPaired ? (
        <ConnectionOutcomePanel name={justPaired} onDismiss={() => setJustPaired(null)} />
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
            <EmptyTitle>No computers yet</EmptyTitle>
            <EmptyDescription>
              A computer running Sparstrow core is where agents actually run — nothing runs in
              the browser. Opening the desktop app on a computer connects it automatically, so
              this list usually fills itself.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" /> Add a computer
            </Button>
            <p className="text-xs text-muted-foreground">{CHECKOUT_NOTE}</p>
          </EmptyContent>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {machines.map((runtime) => (
            <RuntimeRow
              key={runtime.id}
              runtime={runtime}
              canManageTerminals={canManageTerminals}
              isThisDevice={thisMachineId !== null && runtime.machineId === thisMachineId}
            />
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
