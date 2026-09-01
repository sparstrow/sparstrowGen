"use client";

import * as React from "react";
import { Loader2, Trash2, Unplug } from "lucide-react";
import { OsIcon } from "@/components/os-icon";
import { ProviderLogo, providerLabel } from "@/components/provider-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCost, formatDuration, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LATEST_CORE_VERSION, machineState } from "@sparstrow/shared";
import { useAgents, type Runtime, type RuntimeActivityRun, type RuntimeUsage, type AgentMachineRestriction } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import {
  addAgentMachineRestrictionAction,
  getRuntimeActivityAction,
  getRuntimeAgentRestrictionsAction,
  getRuntimeRemovalImpactAction,
  getRuntimeUsageAction,
  removeAgentMachineRestrictionAction,
  removeRuntimeAction,
  revokeRuntimeTokenAction,
  setRuntimeCostBudgetAction,
} from "./actions";
import { MachineTile, SnapshotControl, TerminalAccessControl } from "./machine-shared";

type Section = "overview" | "providers" | "activity" | "settings";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "providers", label: "Providers" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

/**
 * `DESIGN.md` §9's per-entity profile — side sub-nav inside the outer tab
 * strip, first build for Machines (DD-003/DD-008, D-18 unparked 2026-09-01
 * for this entity specifically). One instance per open tab in `machines.tsx`,
 * so each tab's `activeSection` is its own component's local state — exactly
 * what §9.1 means by "every tab preserves its own state."
 */
export function MachineProfile({
  runtime,
  canManageTerminals,
  onClose,
}: {
  runtime: Runtime;
  canManageTerminals: boolean;
  onClose: () => void;
}) {
  const [section, setSection] = React.useState<Section>("overview");
  const state = machineState(runtime.status, runtime.lastHeartbeat);

  return (
    <div className="flex gap-6">
      <div role="tablist" aria-label={`${runtime.name} sections`} className="flex w-40 shrink-0 flex-col gap-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            tabIndex={section === s.id ? 0 : -1}
            onClick={() => setSection(s.id)}
            onKeyDown={(e) => {
              const idx = SECTIONS.findIndex((x) => x.id === s.id);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSection(SECTIONS[(idx + 1) % SECTIONS.length].id);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSection(SECTIONS[(idx - 1 + SECTIONS.length) % SECTIONS.length].id);
              }
            }}
            className={cn(
              "rounded-sm px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              section === s.id
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
          <MachineTile state={state} />
          <div className="min-w-0">
            <h2 className="text-base font-bold">{runtime.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{runtime.hostname}</p>
          </div>
        </div>

        <div id={`section-panel-${section}`} role="tabpanel" aria-label={SECTIONS.find((s) => s.id === section)?.label}>
          {section === "overview" ? <OverviewSection runtime={runtime} state={state} /> : null}
          {section === "providers" ? <ProvidersSection runtime={runtime} /> : null}
          {section === "activity" ? <ActivitySection runtime={runtime} /> : null}
          {section === "settings" ? (
            <SettingsSection runtime={runtime} canManageTerminals={canManageTerminals} onClose={onClose} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ runtime, state }: { runtime: Runtime; state: ReturnType<typeof machineState> }) {
  const updateAvailable = runtime.coreVersion != null && runtime.coreVersion !== LATEST_CORE_VERSION;

  return (
    <div className="max-w-lg space-y-1 text-[12.5px]">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Diagnostics</h3>
      <Row label="Status">
        <span className={cn("font-semibold", state === "active" && "text-success", state === "draining" && "text-warning")}>
          {state}
        </span>
        {state !== "active" ? ` · last seen ${relativeTime(runtime.lastHeartbeat)}` : ""}
      </Row>
      <Row label="Runtime ID">
        <span className="font-mono">{runtime.id}</span>
      </Row>
      <Row label="Hostname">
        <span className="font-mono">{runtime.hostname}</span>
      </Row>
      <Row label="Operating system">
        <span className="inline-flex items-center gap-1.5">
          <OsIcon os={runtime.os} size={13} />
          {runtime.os}
        </span>
        {runtime.isElectron ? " · desktop app" : " · headless daemon"}
      </Row>
      <Row label="Core version">
        {runtime.coreVersion ?? "unknown"}
        {updateAvailable ? (
          <Badge variant="secondary" className="ml-2 text-[10px]" title={`Newest known version is ${LATEST_CORE_VERSION}. No remote update is triggered from here — update the machine directly.`}>
            update available
          </Badge>
        ) : null}
      </Row>
      <Row label="Providers detected">{runtime.capabilities.length}</Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-x-0 gap-y-2.5 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function ProvidersSection({ runtime }: { runtime: Runtime }) {
  if (runtime.capabilities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-7 text-center text-[12.5px] text-muted-foreground">
        This machine hasn&apos;t reported any usable providers yet.
      </div>
    );
  }
  return (
    <div>
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        AI providers on this machine
      </h3>
      <div className="rounded-lg border">
        {runtime.capabilities.map((c) => (
          <div key={c} className="flex items-center gap-3 border-b p-2.5 last:border-b-0">
            <ProviderLogo capability={c} size={18} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{providerLabel(c)}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{c}</div>
            </div>
            <Badge variant="secondary" className="ml-auto bg-success/15 text-success">
              available
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivitySection({ runtime }: { runtime: Runtime }) {
  const [usage, setUsage] = React.useState<RuntimeUsage | null>(null);
  const [runs, setRuns] = React.useState<RuntimeActivityRun[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = React.useState("");
  const [editingBudget, setEditingBudget] = React.useState(false);
  const [budgetPending, setBudgetPending] = React.useState(false);

  // Deliberately does not clear `error` itself — call sites that reload after
  // fixing a prior failure (`saveBudget`'s success branch) clear it there.
  // Doing it here would be a synchronous setState from the mount effect
  // below, which is what `react-hooks/set-state-in-effect` exists to catch.
  const load = React.useCallback(() => {
    void callAction(() => getRuntimeUsageAction(runtime.id)).then((r) => {
      if (r.ok) setUsage(r.data);
      else setError(r.error);
    });
    void callAction(() => getRuntimeActivityAction(runtime.id, 20)).then((r) => {
      if (r.ok) setRuns(r.data);
    });
  }, [runtime.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const overBudget = usage?.budgetUsd != null && usage.monthToDateCostUsd > usage.budgetUsd;

  function saveBudget() {
    const trimmed = budgetDraft.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Budget must be a positive number, or blank to clear it.");
      return;
    }
    setBudgetPending(true);
    void callAction(() => setRuntimeCostBudgetAction(runtime.id, value)).then((r) => {
      setBudgetPending(false);
      if (r.ok) {
        setEditingBudget(false);
        setError(null);
        load();
      } else {
        setError(r.error);
      }
    });
  }

  if (usage === null && !error) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Month to date</p>
            <p className={cn("mt-1 text-xl font-bold", overBudget && "text-warning")}>
              {usage ? formatCost(usage.monthToDateCostUsd) : "—"}
            </p>
            {usage?.truncated ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                500+ runs this month — this total is a floor, not exact.
              </p>
            ) : null}
          </div>
          <div className="text-right text-[12.5px] text-muted-foreground">
            <p>{usage?.runCountThisMonth ?? 0} runs</p>
            <p>avg {formatDuration(usage?.avgDurationMs ?? null)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t pt-3 text-[12.5px]">
          <span className="text-muted-foreground">Monthly budget:</span>
          {editingBudget ? (
            <>
              <Input
                autoFocus
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                placeholder="no budget"
                className="h-7 w-28"
                inputMode="decimal"
                aria-label="Monthly cost budget in USD"
              />
              <Button size="sm" className="h-7" disabled={budgetPending} onClick={saveBudget}>
                {budgetPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingBudget(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setBudgetDraft(usage?.budgetUsd != null ? String(usage.budgetUsd) : "");
                setEditingBudget(true);
              }}
              className={cn("font-medium underline decoration-dotted underline-offset-2", overBudget && "text-warning")}
            >
              {usage?.budgetUsd != null ? formatCost(usage.budgetUsd) : "set a budget"}
            </button>
          )}
          {overBudget ? <Badge className="bg-warning/15 text-warning">over budget</Badge> : null}
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div>
        <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Recent runs</h3>
        {runs === null ? (
          <Skeleton className="h-24 w-full" />
        ) : runs.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No runs have targeted this machine yet.</p>
        ) : (
          <div className="rounded-lg border">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b p-2.5 text-[12.5px] last:border-b-0">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    r.status === "completed" ? "bg-success" : r.status === "failed" ? "bg-destructive" : "bg-muted-foreground/40",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{r.agentName}</span>
                <span className="text-muted-foreground">{r.status}</span>
                <span className="w-16 text-right text-muted-foreground">{formatCost(r.costUsd)}</span>
                <span className="w-16 text-right text-muted-foreground">{formatDuration(r.durationMs)}</span>
                <span className="w-20 text-right text-muted-foreground">{relativeTime(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsSection({
  runtime,
  canManageTerminals,
  onClose,
}: {
  runtime: Runtime;
  canManageTerminals: boolean;
  onClose: () => void;
}) {
  return (
    <div className="max-w-xl space-y-4">
      <SnapshotControl runtime={runtime} />
      <TerminalAccessControl runtime={runtime} canManage={canManageTerminals} />
      <AgentAccessBlock runtime={runtime} />
      <DangerZone runtime={runtime} onClose={onClose} />
    </div>
  );
}

/**
 * Surfaces `agent_machine_restrictions` (M18) from the machine's side of the
 * relationship — it already exists and is already enforced, this is the
 * first place in the app it's shown on a runtime rather than only an agent.
 */
function AgentAccessBlock({ runtime }: { runtime: Runtime }) {
  const agents = useAgents();
  const [restrictions, setRestrictions] = React.useState<AgentMachineRestriction[] | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [pickerValue, setPickerValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    void callAction(() => getRuntimeAgentRestrictionsAction(runtime.id)).then((r) => {
      if (r.ok) setRestrictions(r.data);
    });
  }, [runtime.id]);

  React.useEffect(() => load(), [load]);

  const restrictedIds = new Set((restrictions ?? []).map((r) => r.agentId));
  const eligibleAgents = (agents.data ?? []).filter((a) => !restrictedIds.has(a.id));

  return (
    <div className="border-b pb-4">
      <p className="text-xs font-medium">Agent access</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Restricting an agent to this machine means it may run here and nowhere else. An agent with no
        restriction at all may run on any machine.
      </p>

      {restrictions === null ? (
        <Skeleton className="mt-2 h-8 w-full" />
      ) : restrictions.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No agent is restricted to this machine.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {restrictions.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span>{r.agentName}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs text-muted-foreground"
                onClick={() =>
                  void callAction(() => removeAgentMachineRestrictionAction(r.id)).then((res) => {
                    if (res.ok) load();
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <Select value={pickerValue} onValueChange={setPickerValue}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
              {eligibleAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!pickerValue}
            onClick={() => {
              setError(null);
              void callAction(() => addAgentMachineRestrictionAction(pickerValue, runtime.id)).then((r) => {
                if (r.ok) {
                  setAdding(false);
                  setPickerValue("");
                  load();
                } else {
                  setError(r.error);
                }
              });
            }}
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7"
          onClick={() => {
            setAdding(true);
            setError(null);
          }}
        >
          Restrict an agent to this machine
        </Button>
      )}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function DangerZone({ runtime, onClose }: { runtime: Runtime; onClose: () => void }) {
  const [confirming, setConfirming] = React.useState<null | "revoke" | "remove">(null);
  const [pending, setPending] = React.useState(false);
  const [removalImpact, setRemovalImpact] = React.useState<number | null>(null);

  return (
    <div>
      <p className="text-xs font-medium text-destructive">Danger zone</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setConfirming("revoke")}>
          <Unplug className="mr-1.5 size-3.5" />
          Revoke pairing
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setConfirming("remove");
            setRemovalImpact(null);
            void callAction(() => getRuntimeRemovalImpactAction(runtime.id)).then((r) => {
              if (r.ok) setRemovalImpact(r.data.agentRestrictions);
            });
          }}
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Remove machine
        </Button>
      </div>

      <ConfirmDialog
        open={confirming === "revoke"}
        onOpenChange={(open) => setConfirming(open ? "revoke" : null)}
        title={`Revoke ${runtime.name}?`}
        description="This machine stops reaching the workspace on its very next request. It stays in the list, and pairing it again with a fresh code restores access."
        confirmLabel="Revoke pairing"
        pendingLabel="Revoking…"
        pending={pending}
        onConfirm={() => {
          setPending(true);
          void callAction(() => revokeRuntimeTokenAction(runtime.id)).then(() => {
            setPending(false);
            setConfirming(null);
          });
        }}
      />

      <ConfirmDialog
        open={confirming === "remove"}
        onOpenChange={(open) => setConfirming(open ? "remove" : null)}
        title={`Remove ${runtime.name}?`}
        description={
          <>
            Deletes this machine and its pairing from the workspace. Anything recorded against it goes too.
            {removalImpact ? (
              <>
                {" "}
                <strong>
                  {removalImpact} agent{removalImpact === 1 ? "" : "s"} restricted to this machine will lose that
                  restriction.
                </strong>
              </>
            ) : null}
          </>
        }
        confirmLabel="Remove machine"
        pendingLabel="Removing…"
        pending={pending}
        onConfirm={() => {
          setPending(true);
          void callAction(() => removeRuntimeAction(runtime.id)).then((r) => {
            setPending(false);
            setConfirming(null);
            if (r.ok) onClose();
          });
        }}
      />
    </div>
  );
}
