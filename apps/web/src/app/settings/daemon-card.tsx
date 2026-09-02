"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  desktopCloudStatus,
  desktopDaemonAvailable,
  desktopGetDaemonPrefs,
  desktopSetDaemonPrefs,
  type CloudStatus,
  type DaemonPrefs,
} from "@web/lib/desktop-machine";

/**
 * US2 — the switches and the diagnostics for the runtime on THIS computer.
 *
 * Everything here reads and writes through the Electron bridge, because all of
 * it is about a process on this machine rather than anything in the cloud. In
 * a plain browser there is no such process, so the card says so instead of
 * rendering controls that would silently do nothing — a disabled switch with
 * no explanation is the failure this replaces.
 *
 * "Keep running after quit" defaults ON (i.e. `autoStopOnQuit` false) and is
 * the surprising one: quitting an app that leaves a process behind is not what
 * people expect, so its description states the consequence rather than
 * restating its own label.
 */

function humanUptime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function DiagnosticRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-1.5">
      <span className="w-32 shrink-0 text-sm text-muted-foreground">{label}</span>
      {/* Tabular numerals: these are values compared down a column (§3, named
          rule 5), and a pid or an uptime that jitters between renders is
          harder to read than one that does not. */}
      <span className="min-w-0 flex-1 break-all font-mono text-xs tabular-nums">{value}</span>
    </div>
  );
}

export function DaemonCard() {
  const available = React.useMemo(() => desktopDaemonAvailable(), []);
  const [prefs, setPrefs] = React.useState<DaemonPrefs | null>(null);
  const [status, setStatus] = React.useState<CloudStatus | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [nextPrefs, nextStatus] = await Promise.all([
      desktopGetDaemonPrefs(),
      desktopCloudStatus(),
    ]);
    setPrefs(nextPrefs);
    setStatus(nextStatus);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (available) void load();
    else setLoading(false);
  }, [available, load]);

  async function toggle(key: keyof DaemonPrefs, value: boolean) {
    // Optimistic, then reconciled with what was actually written. The switch
    // must not lag behind the finger, but it also must not lie: if persisting
    // fails, the returned prefs are the truth and the switch snaps back.
    setPrefs((current) => (current ? { ...current, [key]: value } : current));
    const next = await desktopSetDaemonPrefs({ [key]: value });
    if (next) setPrefs(next);
  }

  if (!available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Daemon</CardTitle>
          <CardDescription>
            These settings control the agent runtime on a computer, so they only appear in the
            desktop app. Open Sparstrowgen on the machine you want to configure.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Daemon</CardTitle>
        <CardDescription>
          How the agent runtime on this computer behaves with the desktop app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">Auto-start on launch</p>
              <p className="text-sm text-muted-foreground">
                Start the runtime when the app opens. Turning this off does not stop the app
                talking to a runtime you started yourself.
              </p>
            </div>
            {loading || !prefs ? (
              <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
            ) : (
              <Switch
                checked={prefs.autoStartOnLaunch}
                onCheckedChange={(v) => void toggle("autoStartOnLaunch", v)}
                aria-label="Auto-start on launch"
              />
            )}
          </div>

          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">Keep running after quit</p>
              <p className="text-sm text-muted-foreground">
                Leave the runtime running when you quit the app, so this computer stays reachable
                whenever it is switched on. Turn this off and quitting the app makes it
                unreachable.
              </p>
            </div>
            {loading || !prefs ? (
              <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
            ) : (
              <Switch
                // Stored inverted, shown positively. The stored name says what
                // the app DOES on quit; the label says what the owner GETS,
                // which is the thing they are actually choosing between.
                checked={!prefs.autoStopOnQuit}
                onCheckedChange={(v) => void toggle("autoStopOnQuit", !v)}
                aria-label="Keep running after quit"
              />
            )}
          </div>
        </div>

        <div className="space-y-1 border-t pt-4">
          <p className="text-sm font-medium">Diagnostics</p>
          <p className="pb-2 text-sm text-muted-foreground">
            Identification and connection details. Useful when filing a bug report, or working out
            why a machine isn&apos;t showing up.
          </p>

          {loading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 py-1.5">
                  <Skeleton className="h-4 w-32 shrink-0" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ) : status?.error ? (
            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium">Couldn&apos;t reach the runtime on this computer</p>
              <p className="text-sm text-muted-foreground">{status.error}</p>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border p-3">
              <DiagnosticRow
                label="State"
                // The dot is the only thing carrying status colour here, and
                // the word beside it says the same thing (§2.1) — so this
                // still reads correctly with no colour at all.
                value={
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={
                        status?.connected
                          ? "size-2 rounded-full bg-success"
                          : "size-2 rounded-full bg-muted-foreground/40"
                      }
                      aria-hidden="true"
                    />
                    {status?.connected ? "Connected" : "Not connected"}
                  </span>
                }
              />
              {status?.uptimeMs !== undefined && (
                <DiagnosticRow label="Uptime" value={humanUptime(status.uptimeMs)} />
              )}
              {status?.pid !== undefined && <DiagnosticRow label="PID" value={status.pid} />}
              <DiagnosticRow label="Machine id" value={status?.machineId ?? "not yet assigned"} />
              <DiagnosticRow label="Server URL" value={status?.cloudUrl ?? "unknown"} />
              <DiagnosticRow label="Workspaces" value={status?.workspaces ?? 0} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
