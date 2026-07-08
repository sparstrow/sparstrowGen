import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useClearGithubPat,
  useClearProviderKey,
  useDiscoverModels,
  useFactoryHealth,
  useGithubPat,
  useGraphEngine,
  useHealth,
  useIndexAllProjects,
  useInstallGraphEngine,
  useProviders,
  useRetryGraphEngine,
  useSetGithubPat,
  useSetProviderKey,
  useSettings,
  useUpdateSettings,
} from "@/api/hooks";
import type { ProviderInfo, ProviderId } from "@sparstrow/shared";
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

/**
 * Rule 23 — the "is my factory armed?" self-check. One row per degrade-by-design
 * dependency; `armed` is green only when every REQUIRED check is ok. This is the
 * operator-side mirror of the agent's resolved-toolset preamble.
 */
function FactoryHealthCard() {
  const health = useFactoryHealth();
  const statusVariant = (s: "ok" | "degraded" | "off") =>
    s === "ok" ? "success" : s === "degraded" ? "warning" : "destructive";
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm">Factory health</CardTitle>
          <CardDescription>Is the factory armed? Each degrade-by-design dependency.</CardDescription>
        </div>
        {health.data && (
          <Badge variant={health.data.armed ? "success" : "destructive"}>
            {health.data.armed ? "armed" : "disarmed"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="divide-y">
        {health.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : health.data ? (
          health.data.checks.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                {c.detail && (
                  <p className="truncate text-xs text-muted-foreground" title={c.detail}>
                    {c.detail}
                  </p>
                )}
              </div>
              <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
            </div>
          ))
        ) : (
          <p className="py-3 text-sm text-destructive">Core service unreachable.</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * P7 (EC2) — the GitHub PAT. It lives in the core-only encrypted secret store
 * (never the DB any agent could read), so this panel only ever shows presence +
 * a masked hint. Setting it enables PR creation + the Dashboard PR queue.
 */
function GitCard() {
  const pat = useGithubPat();
  const setPat = useSetGithubPat();
  const clearPat = useClearGithubPat();
  const [token, setToken] = React.useState("");

  const present = pat.data?.present ?? false;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Git</CardTitle>
        <CardDescription>
          A fine-grained GitHub PAT (contents:rw, pull_requests:rw on your repos). Stored
          encrypted outside the agent-readable data dir — never injected into an agent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="GitHub PAT">
          {pat.isLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : present ? (
            <span className="flex items-center gap-2">
              <Badge variant="success">configured</Badge>
              {pat.data?.hint && <span className="font-mono text-xs">{pat.data.hint}</span>}
            </span>
          ) : (
            <Badge variant="secondary">not set</Badge>
          )}
        </InfoRow>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            className="font-mono text-xs"
            placeholder={present ? "Enter a new token to replace…" : "github_pat_…"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button
            size="sm"
            disabled={setPat.isPending || token.trim().length === 0}
            onClick={() => setPat.mutate(token.trim(), { onSuccess: () => setToken("") })}
          >
            {present ? "Replace" : "Save"}
          </Button>
          {present && (
            <Button
              size="sm"
              variant="ghost"
              disabled={clearPat.isPending}
              onClick={() => clearPat.mutate()}
            >
              Clear
            </Button>
          )}
        </div>
        {setPat.isError && <p className="text-xs text-destructive">{setPat.error.message}</p>}
      </CardContent>
    </Card>
  );
}

/** P8 — a direct-API provider's key input (stored in the encrypted secret store). */
function ProviderKeyInput({ providerId, keyPresent }: { providerId: string; keyPresent: boolean }) {
  const setKey = useSetProviderKey();
  const clearKey = useClearProviderKey();
  const [value, setValue] = React.useState("");
  return (
    <div className="mt-2 flex items-center gap-2">
      <Input
        type="password"
        className="h-8 font-mono text-xs"
        placeholder={keyPresent ? "Enter a new key to replace…" : "API key…"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        size="sm"
        disabled={setKey.isPending || value.trim().length === 0}
        onClick={() => setKey.mutate({ providerId, key: value.trim() }, { onSuccess: () => setValue("") })}
      >
        {keyPresent ? "Replace" : "Save"}
      </Button>
      {keyPresent && (
        <Button size="sm" variant="ghost" disabled={clearKey.isPending} onClick={() => clearKey.mutate(providerId)}>
          Clear
        </Button>
      )}
    </div>
  );
}

/** P8 — every runtime, its mode, health, key status, and live model discovery. */
function ProvidersCard() {
  const providers = useProviders();
  const discover = useDiscoverModels();
  const [discovered, setDiscovered] = React.useState<Record<string, { count: number; live: boolean }>>({});

  const modeBadge = (p: ProviderInfo) =>
    p.mode === "direct_api" ? <Badge variant="default">direct API</Badge> : <Badge variant="secondary">CLI</Badge>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Providers</CardTitle>
        <CardDescription>
          CLI models log in once from a terminal. Direct-API providers run core&apos;s tool-loop and
          keep their key in the encrypted secret store (never in an agent&apos;s env).
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {providers.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          (providers.data ?? []).map((p) => (
            <div key={p.id} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.id}</span>
                  {modeBadge(p)}
                </div>
                <Badge variant={p.ok ? "success" : p.requiresKey && !p.keyPresent ? "warning" : "destructive"}>
                  {p.ok ? (p.version ?? "ready") : p.requiresKey && !p.keyPresent ? "no key" : "unavailable"}
                </Badge>
              </div>
              {p.detail && <p className="mt-0.5 text-xs text-muted-foreground">{p.detail}</p>}
              {p.mode === "direct_api" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={discover.isPending}
                    onClick={() =>
                      discover.mutate(p.id as ProviderId, {
                        onSuccess: (r) =>
                          setDiscovered((d) => ({ ...d, [p.id]: { count: r.models.length, live: r.live } })),
                      })
                    }
                  >
                    Discover models
                  </Button>
                  {discovered[p.id] && (
                    <span className="text-xs text-muted-foreground">
                      {discovered[p.id]!.count} models{discovered[p.id]!.live ? "" : " (static — provider unreachable)"}
                    </span>
                  )}
                </div>
              )}
              {p.requiresKey && <ProviderKeyInput providerId={p.id} keyPresent={p.keyPresent} />}
            </div>
          ))
        )}
      </CardContent>
    </Card>
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
      <FactoryHealthCard />

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

      <ProvidersCard />

      <GitCard />

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
