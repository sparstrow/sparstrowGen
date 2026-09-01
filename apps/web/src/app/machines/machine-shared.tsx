"use client";

import * as React from "react";
import { Loader2, Monitor } from "lucide-react";
import { ItemMedia } from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_WIP_SNAPSHOT_KEEP,
  SETTING_TERMINAL_ACCESS,
  SETTING_WIP_SNAPSHOT,
  SETTING_WIP_SNAPSHOT_KEEP,
  isTerminalAccessEnabled,
  isWipSnapshotEnabled,
  type MachineState,
} from "@sparstrow/shared";
import type { Runtime } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import { setRuntimeSettingAction } from "./actions";

/**
 * Shared between `machines.tsx` (the list) and `machine-profile.tsx` (the
 * per-machine profile, `DESIGN.md` §9) — pulled into its own module so the
 * two don't import from each other. `machines.tsx` renders `MachineProfile`
 * for an open tab; `machine-profile.tsx` reuses the list's own tile and
 * settings controls. Either direction on its own would be a circular
 * import between two client components in the same route.
 */

/**
 * The entity tile from `DESIGN.md` §6: the machine's semantic icon in a tile,
 * with its state as a dot on the corner. The dot is the ONLY thing on this
 * page allowed to carry status colour, and it is never the sole carrier — the
 * words beside it say the same thing (§2.1, and scenario 6's requirement that
 * an unreachable machine says so in text).
 */
export const DOT_TONE: Record<MachineState, string> = {
  active: "bg-success",
  draining: "bg-warning",
  unreachable: "bg-muted-foreground/40",
};

export function MachineTile({ state }: { state: MachineState }) {
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
export function SnapshotControl({ runtime }: { runtime: Runtime }) {
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
export function TerminalAccessControl({ runtime, canManage }: { runtime: Runtime; canManage: boolean }) {
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
