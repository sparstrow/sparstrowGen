import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { RefreshCw, Globe, Cpu, Clock, CheckCircle2 } from "lucide-react";
import { PlatformMark } from "./platform-mark";

export interface MachineProfileHeaderProps {
  machine: {
    id: string;
    name: string;
    os: string | null | undefined;
    online: boolean;
    hostname?: string;
    coreVersion?: string | null;
    lastHeartbeat?: string | null;
    isThisDevice?: boolean;
    subtitle?: string;
    endpointUrl?: string;
  };
  onRescan?: () => void;
  isRescanning?: boolean;
  className?: string;
}

export function MachineProfileHeader({
  machine,
  onRescan,
  isRescanning = false,
  className,
}: MachineProfileHeaderProps) {
  const isWindows = (machine.os ?? "").toLowerCase().includes("win");
  const isLinux = (machine.os ?? "").toLowerCase().includes("linux") || (machine.os ?? "").toLowerCase().includes("ubuntu");
  const isMac = (machine.os ?? "").toLowerCase().includes("darwin") || (machine.os ?? "").toLowerCase().includes("mac");

  const platformLabel = isWindows
    ? "Windows 11 Workstation"
    : isLinux
      ? "Linux Server Node"
      : isMac
        ? "macOS Workstation"
        : "Workstation Node";

  const subtitle = machine.subtitle ?? `${platformLabel} · ${machine.isThisDevice ? "Host Controller Node" : "Remote Compute Node"}`;
  const endpoint = machine.endpointUrl ?? (machine.isThisDevice ? "http://127.0.0.1:8080" : `http://${machine.hostname || "node"}:8080`);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-xs transition",
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left: OS Avatar & Entity Details */}
        <div className="flex items-center gap-4 min-w-0">
          {/* OS Avatar: 4-Pane Windows, Linux, or Apple Vector */}
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-muted to-card p-3 shadow-inner"
            aria-hidden="true"
          >
            <PlatformMark os={machine.os} className="size-8 text-amber-400" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-sans text-xl font-bold tracking-tight text-foreground">
                {machine.name}
              </h1>

              {machine.online ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span>Online · Controller</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                  <span>Offline</span>
                </span>
              )}

              {machine.isThisDevice ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-400 font-semibold"
                >
                  This Device
                </Badge>
              ) : null}
            </div>

            <p className="mt-1 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: Endpoint Metadata & Actions */}
        <div className="flex items-center gap-4 self-end md:self-center">
          <div className="hidden sm:block text-right text-xs">
            <div className="flex items-center justify-end gap-1.5 font-mono text-foreground/80">
              <Globe className="size-3 text-muted-foreground" />
              <span>{endpoint}</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              Daemon {machine.coreVersion ?? "v0.4.15"} · Fastify
            </div>
          </div>

          {onRescan ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRescan}
              disabled={isRescanning}
              className="h-8 gap-1.5 border-border bg-muted/40 font-medium text-xs text-foreground shadow-xs hover:bg-muted"
            >
              <RefreshCw
                className={cn("size-3.5 text-muted-foreground", isRescanning && "animate-spin text-amber-500")}
              />
              <span>{isRescanning ? "Scanning..." : "Rescan"}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* 4-Column Metadata Sub-Row */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs md:grid-cols-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Globe className="size-3.5 shrink-0 text-muted-foreground/70" />
          <div className="truncate">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">Endpoint</span>
            <span className="font-mono text-[11px] text-foreground/90">{endpoint}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Cpu className="size-3.5 shrink-0 text-muted-foreground/70" />
          <div className="truncate">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">Platform</span>
            <span className="font-sans text-[11px] text-foreground/90">{machine.os || "Unknown OS"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500/80" />
          <div className="truncate">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">Daemon Runtime</span>
            <span className="font-mono text-[11px] text-foreground/90">{machine.coreVersion ?? "v0.4.15"} · Active</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="size-3.5 shrink-0 text-muted-foreground/70" />
          <div className="truncate">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">Heartbeat</span>
            <span className="font-mono text-[11px] text-foreground/90">
              {machine.online ? "Synced (2ms)" : "Stale"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
