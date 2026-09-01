import * as React from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  Monitor,
  Pencil,
  RefreshCw,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { EntityTabStrip, type EntityTab } from "@/components/entity-tab-strip";
import { OsIcon } from "@/components/os-icon";
import { MachineProfile } from "./machine-profile";
import { DOT_TONE, MachineTile, SnapshotControl, TerminalAccessControl } from "./machine-shared";
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
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useRuntimes, useWorkspace, type Runtime } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import { relativeTime } from "@/lib/format";
import {
  getRuntimeRemovalImpactAction,
  removeRuntimeAction,
  renameRuntimeAction,
  revokeRuntimeTokenAction,
} from "./actions";
import { machineState } from "@sparstrow/shared";
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
 * "run sparstrow pair" without this leaves someone with a command their
 * shell does not have.
 */
const CHECKOUT_NOTE =
  "sparstrow isn't published yet — the machine needs a checkout of this repository to run it. Packaged installers are coming.";

/**
 * The deliberate "something just happened" moment when a new machine shows
 * up in the list without this page having done anything to cause it —
 * browser-loopback pairing starts entirely on the CLI side (`sparstrow
 * pair`), so there is no button here to attribute the arrival to. Without
 * this, a fresh row was silent: it just appeared, which reads as the page
 * skipping a step rather than a machine actually pairing.
 */
function PairingOutcomePanel({ name, onDismiss }: { name: string; onDismiss: () => void }) {
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
        <p className="text-sm font-medium">{name} is paired</p>
        <p className="text-sm text-muted-foreground">
          Restart core on that machine if it was already running.
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

function RuntimeRow({
  runtime,
  canManageTerminals,
  onOpenProfile,
}: {
  runtime: Runtime;
  canManageTerminals: boolean;
  onOpenProfile: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [, startRename] = React.useTransition();
  const [revokePending, startRevoke] = React.useTransition();
  const [removePending, startRemove] = React.useTransition();

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(runtime.name);
  const [confirming, setConfirming] = React.useState<null | "revoke" | "remove">(null);
  const [removalImpact, setRemovalImpact] = React.useState<number | null>(null);

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
          <span className="inline-flex items-center gap-1 align-[-1px]">
            <OsIcon os={runtime.os} size={11} />
            {runtime.os}
          </span>{" "}
          · {runtime.hostname}
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
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="Remove this machine from the workspace"
          aria-label={`Remove ${runtime.name}`}
          onClick={() => {
            setConfirming("remove");
            setRemovalImpact(null);
            void callAction(() => getRuntimeRemovalImpactAction(runtime.id)).then((r) => {
              if (r.ok) setRemovalImpact(r.data.agentRestrictions);
            });
          }}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title={`Open ${runtime.name}'s profile`}
          aria-label={`Open profile for ${runtime.name}`}
          onClick={() => onOpenProfile(runtime.id)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </ItemActions>

      <ItemFooter>
        <SnapshotControl runtime={runtime} />
        <TerminalAccessControl runtime={runtime} canManage={canManageTerminals} />
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
            {removalImpact ? (
              <>
                {" "}
                <strong>
                  {removalImpact} agent{removalImpact === 1 ? "" : "s"} restricted to this
                  machine will lose that restriction
                </strong>{" "}
                (they may then run anywhere, not nowhere).
              </>
            ) : null}
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

/**
 * `DESIGN.md` §9's outer tab strip: one tab per open machine, plus the fixed
 * "Machines" list tab (never closed). Lives here rather than inside
 * `MachineProfile` because §9.1's "clicking an already-open entity focuses
 * its tab, never duplicates" needs to know what's already open across every
 * row's click — that's list-level state, not any one profile's.
 *
 * DD-003/DD-008/D-18: this is the first entity this pattern ships to
 * (§9.4's stated rollout order), unparking D-18 for Machines specifically —
 * Agents and Projects are still outside this doctrine's built scope.
 */
function useMachineTabs() {
  const [openIds, setOpenIds] = React.useState<string[]>([]);
  const [activeId, setActiveId] = React.useState("list");

  const openProfile = React.useCallback((id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
  }, []);

  const closeProfile = React.useCallback((id: string) => {
    setOpenIds((prev) => prev.filter((x) => x !== id));
    setActiveId((prev) => (prev === id ? "list" : prev));
  }, []);

  return { openIds, activeId, setActiveId, openProfile, closeProfile };
}

export function MachinesPage() {
  const runtimes = useRuntimes();
  const workspace = useWorkspace();
  // T-M17-04 — the same role check Terminals itself uses (FR-009): a member
  // who is not owner/admin cannot open a terminal, so cannot switch whether
  // anyone else can either. Fail-closed while the role hasn't loaded yet.
  const canManageTerminals = workspace.data?.role === "owner" || workspace.data?.role === "admin";
  const [justPaired, setJustPaired] = React.useState<string | null>(null);
  const { openIds, activeId, setActiveId, openProfile, closeProfile } = useMachineTabs();

  const machines = runtimes.data ?? [];

  const tabs: EntityTab[] = [
    { id: "list", label: "Machines", closable: false },
    ...openIds.map((id) => {
      const m = machines.find((x) => x.id === id);
      const state = m ? machineState(m.status, m.lastHeartbeat) : "unreachable";
      return {
        id,
        label: m?.name ?? id,
        closable: true,
        indicator: <span className={cn("size-1.5 shrink-0 rounded-full", DOT_TONE[state])} aria-hidden="true" />,
      };
    }),
  ];

  /**
   * Detect a newly-arrived machine by diffing ids against the set this page
   * knew about on its first successful load — not "the list got longer",
   * which breaks the moment `machines` is ever sorted by anything other than
   * insertion order.
   *
   * Nothing on THIS page starts a pairing attempt any more (browser-loopback
   * pairing runs entirely from `sparstrow pair` on the machine itself, see
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

  const activeMachine = machines.find((m) => m.id === activeId) ?? null;

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      {openIds.length > 0 ? (
        <EntityTabStrip tabs={tabs} activeId={activeId} onSelect={setActiveId} onClose={closeProfile} />
      ) : null}

      {activeId !== "list" ? (
        <div role="tabpanel" id={`tabpanel-${activeId}`} aria-labelledby={`tab-${activeId}`}>
          {activeMachine ? (
            <MachineProfile
              runtime={activeMachine}
              canManageTerminals={canManageTerminals}
              onClose={() => closeProfile(activeId)}
            />
          ) : (
            // The machine was removed (by this tab or another) while its
            // profile tab was still open — the tab itself is closed by the
            // `machines` query resolving without that id, but there is one
            // render in between where `activeMachine` is briefly null.
            <p className="p-6 text-sm text-muted-foreground">This machine is no longer in the workspace.</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[1.75rem] font-[650] leading-[1.15] tracking-tight">Machines</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Machines running Sparstrow core that this workspace can reach. Agents run on
                these, not in the browser.
              </p>
            </div>
            {/* No button here any more — only the CLI, running on the machine
                being paired, can open that machine's own loopback listener. The
                empty state below carries the instructions instead. */}
            {machines.length > 0 ? (
              <code className="rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-sm">
                sparstrow pair
              </code>
            ) : null}
          </div>

          {justPaired ? (
            <PairingOutcomePanel name={justPaired} onDismiss={() => setJustPaired(null)} />
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
                  browser.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <p className="text-sm text-muted-foreground">
                  On the machine you want to pair, run:
                </p>
                <code className="block rounded-md border bg-background px-3 py-2 font-mono text-sm">
                  sparstrow pair
                </code>
                <p className="text-xs text-muted-foreground">
                  It opens your browser to confirm — nothing to copy or type here.
                </p>
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
                  onOpenProfile={openProfile}
                />
              ))}
            </ItemGroup>
          )}
        </>
      )}
    </div>
  );
}
