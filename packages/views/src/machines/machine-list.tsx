"use client";

import * as React from "react";
import { Monitor } from "lucide-react";
import { machineState, type MachineState, type Runtime } from "@sparstrow/shared";
import { useMachines } from "@sparstrow/core";
import { cn } from "@sparstrow/ui/lib/utils";
import { Skeleton } from "@sparstrow/ui/components/ui/skeleton";
import { EntityTile, type EntityStatus } from "../entity-tile";
import { PlatformMark, platformLabel } from "./platform-mark";

/**
 * "Your machines are there" — the first thing the product has to say.
 *
 * The first screen built through the restructured stack:
 * `@sparstrow/views` → `@sparstrow/core` → `server/`. It knows nothing about
 * which app is rendering it — no `next/*`, no router, no Electron — so the same
 * component serves the web app today and the desktop window in Phase 3.
 *
 * Read-only by design. The rename/revoke/remove controls on `apps/web`'s own
 * `/machines` screen are Server Actions, which Phase 5 converts; pulling them
 * in here would have dragged that work forward and made this component
 * un-renderable outside Next.
 *
 * All four of `DESIGN.md` §10's states are handled explicitly, including the
 * one that is usually skipped: **a failed list must not masquerade as an empty
 * one.** "No machines yet" invites you to add a computer; that is a lie when
 * the truth is that the request failed, and it sends someone to re-pair a
 * machine that was never gone.
 */

export type MachineListProps = {
  /**
   * Renders when the workspace genuinely has no machines. Supplied by the host
   * because "add a computer" is a navigation action, and navigation is the one
   * thing a view does not own.
   */
  emptyAction?: React.ReactNode;
  /** Marks the row for the machine this app is running on, when known. */
  thisMachineId?: string | null;
  className?: string;
};

const STATUS_BY_STATE: Record<MachineState, { tone: EntityStatus; label: string }> = {
  active: { tone: "success", label: "Online" },
  draining: { tone: "warning", label: "Shutting down" },
  unreachable: { tone: "neutral", label: "Unreachable" },
};

export function MachineList({ emptyAction, thisMachineId, className }: MachineListProps) {
  const machines = useMachines();

  if (machines.isPending) {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your machines…</span>
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
            <Skeleton className="size-8 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (machines.isError) {
    return (
      <div
        role="alert"
        className={cn(
          "rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm",
          className,
        )}
      >
        <p className="font-medium text-foreground">Could not load your machines.</p>
        <p className="mt-1 text-muted-foreground">
          {machines.error.message}
          {machines.error.isUnreachable
            ? " The list will refresh on its own once it is reachable again."
            : null}
        </p>
      </div>
    );
  }

  const rows = machines.data ?? [];

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed p-6 text-center", className)}>
        <Monitor className="mx-auto size-6 stroke-[1.5] text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm font-medium">No machines yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Agents run on your own computers, not in the browser. Connect one to give
          this workspace somewhere to work.
        </p>
        {emptyAction ? <div className="mt-4">{emptyAction}</div> : null}
      </div>
    );
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {rows.map((machine) => (
        <MachineRow
          key={machine.id}
          machine={machine}
          isThisMachine={Boolean(thisMachineId) && machine.machineId === thisMachineId}
        />
      ))}
    </ul>
  );
}

function MachineRow({ machine, isThisMachine }: { machine: Runtime; isThisMachine: boolean }) {
  // Recomputed on render rather than read from the row: liveness is derived
  // from the AGE of the last heartbeat, so the same row means something
  // different a minute later. `machine.status` is never the answer.
  const state = machineState(machine.status, machine.lastHeartbeat);
  const { tone, label } = STATUS_BY_STATE[state];
  const os = platformLabel(machine.os);

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3",
        "transition-colors duration-110 hover:bg-accent/40",
      )}
    >
      {/*
        No `statusLabel` here on purpose. The tile's sr-only label exists for
        rows where the dot is the ONLY statement of state; this row also prints
        the status as visible text on the right, and passing both made a screen
        reader announce "Online … Online" for every machine.
      */}
      <EntityTile status={tone} ringClassName="ring-card">
        <PlatformMark os={machine.os} />
      </EntityTile>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {machine.name || machine.hostname}
          {isThisMachine ? (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              This device
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {/* The OS is stated in text as well as shown as a mark: the mark is a
              scanning aid and is aria-hidden, so this line is what a screen
              reader actually gets. */}
          {os} · {machine.hostname}
          {machine.coreVersion ? ` · v${machine.coreVersion}` : ""}
        </p>
      </div>

      <span
        className={cn(
          "shrink-0 text-xs",
          state === "active" ? "text-success" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </li>
  );
}
