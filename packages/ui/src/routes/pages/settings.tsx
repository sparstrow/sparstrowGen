import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGraphEngine,
  useHealth,
  useIndexAllProjects,
  useInstallGraphEngine,
  useRetryGraphEngine,
  useSettings,
  useUpdateSettings,
} from "@/api/hooks";
import { useTheme, type Theme } from "@/theme/theme-provider";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * P5 (design F4): ONE engine-level row — per-project index state lives on each
 * project page. Install is the explicit T-a affordance (a predictable Defender
 * moment); "Index all projects" is the post-install backfill (T10, DX F7);
 * Retry clears crash-loop breaker latches (audit #40). Download progress
 * arrives over ws (graph.engine.status → query invalidation), never silent.
 */
function GraphEngineRow() {
  const engine = useGraphEngine();
  const install = useInstallGraphEngine();
  const retry = useRetryGraphEngine();
  const indexAll = useIndexAllProjects();
  const s = engine.data;
  if (engine.isLoading || !s) {
    return (
      <InfoRow label="Code graph">
        <Skeleton className="h-5 w-24" />
      </InfoRow>
    );
  }
  const busy = s.state === "installing" || s.state === "verifying";
  return (
    <InfoRow label="Code graph">
      <span className="flex items-center justify-end gap-1.5">
        {s.state === "installed" && <Badge variant="success">v{s.pinnedVersion}</Badge>}
        {s.state === "not-installed" && <Badge variant="secondary">not installed</Badge>}
        {busy && <Badge variant="secondary">{s.state === "installing" ? "downloading…" : "verifying…"}</Badge>}
        {s.state === "error" && <Badge variant="destructive">error</Badge>}
        {s.detail && <span className="max-w-56 truncate text-xs text-muted-foreground">{s.detail}</span>}
        {(s.state === "not-installed" || s.state === "error") && (
          <Button
            size="sm"
            variant="outline"
            disabled={install.isPending || busy}
            onClick={() => install.mutate("std")}
          >
            {s.state === "error" ? "Retry install" : "Install"}
          </Button>
        )}
        {s.state === "installed" && (
          <>
            {!s.variants.ui && (
              <Button
                size="sm"
                variant="outline"
                disabled={install.isPending || busy}
                onClick={() => install.mutate("ui")}
                title="Adds the 3D visualization variant (~37 MB) used by the project pages' Launch 3D view"
              >
                Install viz
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={indexAll.isPending} onClick={() => indexAll.mutate()}>
              {indexAll.isPending ? "Queuing…" : "Index all projects"}
            </Button>
            <Button size="sm" variant="ghost" disabled={retry.isPending} onClick={() => retry.mutate()}>
              Retry engine
            </Button>
          </>
        )}
        {indexAll.isSuccess && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {indexAll.data.queued} queued{indexAll.data.skipped > 0 ? `, ${indexAll.data.skipped} skipped` : ""}
          </span>
        )}
      </span>
    </InfoRow>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

export function SettingsPage() {
  const health = useHealth();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const { theme, setTheme } = useTheme();
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  const themes: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">System</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {health.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : health.data ? (
            <>
              <InfoRow label="Version">v{health.data.version}</InfoRow>
              <InfoRow label="Uptime">{formatDuration(health.data.uptimeMs)}</InfoRow>
              <InfoRow label="Database">
                <span className="font-mono text-xs">{health.data.db.path}</span>
              </InfoRow>
              <InfoRow label="Memory vault">
                <span className="font-mono text-xs">{health.data.vault.path}</span>
              </InfoRow>
              <InfoRow label="Search">
                <span className="flex gap-1.5">
                  <Badge variant={health.data.search.fts ? "success" : "destructive"}>
                    keyword {health.data.search.fts ? "on" : "off"}
                  </Badge>
                  <Badge variant={health.data.search.vec ? "success" : "warning"}>
                    semantic {health.data.search.vec ? "on" : "off"}
                  </Badge>
                </span>
              </InfoRow>
              <InfoRow label="Embedder">
                <span className="flex items-center gap-1.5">
                  <Badge variant={health.data.embedder.ready ? "success" : "secondary"}>
                    {health.data.embedder.ready ? "ready" : "not ready"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {health.data.embedder.model}
                  </span>
                </span>
              </InfoRow>
              <GraphEngineRow />
            </>
          ) : (
            <p className="py-3 text-sm text-destructive">Core service unreachable.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Providers</CardTitle>
          <CardDescription>
            CLI models must be installed and logged in once from a terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {(health.data?.providers ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">{p.id}</p>
                {p.detail && <p className="text-xs text-muted-foreground">{p.detail}</p>}
              </div>
              <Badge variant={p.ok ? "success" : "destructive"}>
                {p.ok ? (p.version ?? "ok") : "unavailable"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {themes.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                className={cn(
                  "flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors hover:bg-accent",
                  theme === t.value && "border-primary bg-accent",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Advanced</CardTitle>
          <CardDescription>Raw key/value settings stored in the core database.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(settings.data ?? {}).length === 0 && (
            <p className="text-sm text-muted-foreground">No settings stored yet.</p>
          )}
          {Object.entries(settings.data ?? {}).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-48 shrink-0 font-mono text-xs">{key}</span>
              <Input
                className="font-mono text-xs"
                value={draft[key] ?? value}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
          {Object.keys(draft).length > 0 && (
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                disabled={updateSettings.isPending}
                onClick={() => updateSettings.mutate(draft, { onSuccess: () => setDraft({}) })}
              >
                Save changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
