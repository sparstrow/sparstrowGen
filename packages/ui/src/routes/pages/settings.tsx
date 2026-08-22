import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, User, Palette, Github, Settings as SettingsIcon, Key, Activity, AlertTriangle } from "lucide-react";
import { useAccount } from "@/lib/account";
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
import {
  DEFAULT_WIP_SNAPSHOT_KEEP,
  SETTING_WIP_SNAPSHOT,
  SETTING_WIP_SNAPSHOT_KEEP,
  isWipSnapshotEnabled,
  type ProviderInfo,
  type ProviderId,
} from "@sparstrow/shared";
import { useTheme, type Theme } from "@/theme/theme-provider";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProfileForm } from "@/components/profile-form";
import { WorkspaceForm } from "@/components/workspace-form";

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
          <span className="text-xs text-success">
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
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm">{children}</span>
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
          <Label htmlFor="github-pat-input" className="sr-only">
            GitHub PAT
          </Label>
          <Input
            id="github-pat-input"
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

/**
 * OQ-1 — WIP snapshots. Defaults on; the toggle exists because a developer who
 * wants their repo left strictly alone is entitled to that, and because a
 * feature that writes into someone's git objects should be visibly switchable
 * rather than a background behaviour they discover by accident.
 *
 * **Local UI only.** The snapshot is taken by core, on that machine's disk, and
 * the switch is a row in that machine's SQLite. The hosted app has no
 * `/system/settings` route at all, so rendering this there would give a control
 * that flips and then silently fails to reach the daemon it claims to configure.
 * The per-runtime version this comment anticipated now exists: M4's command
 * spine carries a setting to a named daemon, and the control lives on the
 * Machines page (M8). This card stays because it is a different thing sharing
 * a word — the local build's own setting, in its own SQLite.
 */
function WipSnapshotCard() {
  const account = useAccount();
  const settings = useSettings();
  const update = useUpdateSettings();
  const [keep, setKeep] = React.useState("");
  if (account) return null;

  const enabled = isWipSnapshotEnabled(settings.data?.[SETTING_WIP_SNAPSHOT]);
  const storedKeep = settings.data?.[SETTING_WIP_SNAPSHOT_KEEP] ?? String(DEFAULT_WIP_SNAPSHOT_KEEP);
  const keepValue = keep === "" ? storedKeep : keep;
  const keepDirty = keep !== "" && keep !== storedKeep;
  const keepValid = /^\d+$/.test(keepValue) && Number.parseInt(keepValue, 10) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Work-in-progress snapshots</CardTitle>
        <CardDescription>
          When a run ends, back up whatever the agent left uncommitted so a crash, a cancel, or
          the next run cannot lose it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Snapshot uncommitted work</p>
            <p className="text-xs text-muted-foreground">
              Records the project&apos;s working tree as a git object under{" "}
              <code className="font-mono">refs/sparstrow/wip/&lt;run-id&gt;</code>. It is not a
              branch and is never pushed — your current branch, staged changes and{" "}
              <code className="font-mono">git status</code> are untouched. Files matched by{" "}
              <code className="font-mono">.gitignore</code> are excluded.
            </p>
          </div>
          {settings.isLoading ? (
            <Skeleton className="h-5 w-9" />
          ) : (
            <Switch
              checked={enabled}
              disabled={update.isPending}
              onCheckedChange={(next) =>
                update.mutate({ [SETTING_WIP_SNAPSHOT]: next ? "on" : "off" })
              }
              aria-label="Snapshot uncommitted work when a run ends"
            />
          )}
        </div>

        <div className="flex items-end justify-between gap-4 border-t pt-4">
          <div className="space-y-1">
            <Label htmlFor="wip-snapshot-keep" className="text-sm font-medium">
              Snapshots kept per project
            </Label>
            <p className="text-xs text-muted-foreground">
              Older ones are deleted. Each snapshot pins its objects, so keeping them forever
              means <code className="font-mono">git gc</code> can never reclaim the space.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              id="wip-snapshot-keep"
              className="w-20 font-mono text-xs"
              inputMode="numeric"
              value={keepValue}
              disabled={!enabled}
              onChange={(e) => setKeep(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!enabled || !keepDirty || !keepValid || update.isPending}
              onClick={() =>
                update.mutate(
                  { [SETTING_WIP_SNAPSHOT_KEEP]: keepValue },
                  { onSuccess: () => setKeep("") },
                )
              }
            >
              Save
            </Button>
          </div>
        </div>

        <div className="space-y-1 rounded-md border bg-muted/40 p-3">
          <p className="text-xs font-medium">Recovering work</p>
          <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
            {RECOVERY_COMMANDS}
          </pre>
        </div>
        {update.isError && <p className="text-xs text-destructive">{update.error.message}</p>}
      </CardContent>
    </Card>
  );
}

const RECOVERY_COMMANDS = [
  "git for-each-ref refs/sparstrow/wip/          # list snapshots",
  "git show --stat refs/sparstrow/wip/<run-id>   # see what one contains",
  "git restore --source=refs/sparstrow/wip/<run-id> -- <path>",
].join("\n");

/** P8 — a direct-API provider's key input (stored in the encrypted secret store). */
function ProviderKeyInput({ providerId, keyPresent }: { providerId: string; keyPresent: boolean }) {
  const setKey = useSetProviderKey();
  const clearKey = useClearProviderKey();
  const [value, setValue] = React.useState("");
  return (
    <div className="mt-2 flex items-center gap-2">
      <Label htmlFor={`provider-key-${providerId}`} className="sr-only">
        {providerId} API key
      </Label>
      <Input
        id={`provider-key-${providerId}`}
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

function SystemCard() {
  const health = useHealth();
  return (
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
              <span className="block truncate font-mono text-xs" title={health.data.db.path}>
                {health.data.db.path}
              </span>
            </InfoRow>
            <InfoRow label="Memory vault">
              <span className="block truncate font-mono text-xs" title={health.data.vault.path}>
                {health.data.vault.path}
              </span>
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
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const themes: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Appearance</CardTitle>
        <CardDescription>How Sparstrowgen looks on this browser.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {themes.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                theme === t.value && "border-primary bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AdvancedCard() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  return (
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
            <Label htmlFor={`advanced-setting-${key}`} className="w-48 shrink-0 font-mono text-xs">
              {key}
            </Label>
            <Input
              id={`advanced-setting-${key}`}
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
  );
}

/**
 * Two hosts, two answers to "what is your profile". The local desktop build
 * has no account (`useAccount()` is `null`, per `@/lib/account`'s standing
 * convention) — this branch is untouched by T-M10-02, which only converts the
 * signed-in half into `ProfileForm`.
 */
function ProfileCard() {
  const account = useAccount();

  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile</CardTitle>
          <CardDescription>
            This install is local and single-user — there is no hosted account. Your GitHub
            identity below is what agents ship PRs with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InfoRow label="Workspace">Sparstrowgen · 127.0.0.1</InfoRow>
          <InfoRow label="Mode">
            <Badge variant="secondary">local single-user</Badge>
          </InfoRow>
        </CardContent>
      </Card>
    );
  }

  return <ProfileForm variant="card" />;
}

/**
 * Account deletion.
 *
 * Typing the address is the gate rather than a plain "are you sure?" — this
 * destroys every agent, run, memory note and skill in any workspace the
 * account is the only member of, and none of it is recoverable. The same
 * string is re-checked server-side, so the confirmation is not merely
 * decorative.
 */
function DangerZoneCard() {
  const account = useAccount();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!account) return null;

  const matches = typed.trim().toLowerCase() === account.email.toLowerCase();

  async function confirmDelete() {
    if (!account || !matches) return;
    setPending(true);
    setError(null);
    try {
      await account.deleteAccount(typed.trim());
      // On success the route navigates to /login, so nothing after this runs.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account.");
      setPending(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-sm text-destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently deletes {account.email}, along with every workspace where you are the
          only member — agents, runs, memory, skills and history. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setTyped("");
              setError(null);
              setOpen(true);
            }}
          >
            <Trash2 className="size-4" /> Delete account
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title="Delete this account permanently?"
        description="Every workspace where you are the only member will be deleted with it. Agents, runs, memory notes, skills and message history all go. There is no undo and no backup."
        confirmLabel="Delete my account"
        pendingLabel="Deleting…"
        pending={pending}
        confirmDisabled={!matches}
        onConfirm={() => void confirmDelete()}
      >
        <div className="space-y-2">
          <label htmlFor="confirm-delete-email" className="block text-sm">
            Type <span className="font-mono font-medium">{account.email}</span> to confirm.
          </label>
          <Input
            id="confirm-delete-email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </Card>
  );
}

/**
 * Settings, grouped Multica-style into nested tabs:
 * Account (Profile, Preferences) and Workspace (General, Integrations).
 */

export function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState('profile');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setActiveTab(tab);
  }, []);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.replaceState({}, '', url);
  };

  const navGroups = [
    {
      title: 'PERSONAL',
      items: [
        { id: 'profile', label: 'Profile & Identity', icon: User },
        { id: 'appearance', label: 'Appearance & Theme', icon: Palette },
        { id: 'git', label: 'Git Credentials', icon: Github },
      ]
    },
    {
      title: 'WORKSPACE',
      items: [
        { id: 'workspace', label: 'Workspace General', icon: SettingsIcon },
        { id: 'providers', label: 'AI Providers & Keys', icon: Key },
        { id: 'health', label: 'Factory Health & Engine', icon: Activity },
        { id: 'danger', label: 'Danger Zone', icon: AlertTriangle, danger: true },
      ]
    }
  ];

  return (
    <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-start">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-64 shrink-0 flex flex-col gap-6 sticky top-6">
        {navGroups.map(group => (
          <div key={group.title} className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-muted-foreground px-3 mb-1">{group.title}</h3>
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  activeTab === item.id 
                    ? "bg-accent text-foreground font-medium" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  item.danger && activeTab !== item.id && "text-destructive hover:text-destructive/90 hover:bg-destructive/10",
                  item.danger && activeTab === item.id && "bg-destructive/15 text-destructive"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {activeTab === 'profile' && <ProfileCard />}
        {activeTab === 'appearance' && <AppearanceCard />}
        {activeTab === 'git' && <GitCard />}
        {activeTab === 'workspace' && <WorkspaceForm variant="card" />}
        {activeTab === 'providers' && <ProvidersCard />}
        {activeTab === 'health' && (
          <>
            <FactoryHealthCard />
            <WipSnapshotCard />
            <SystemCard />
            <AdvancedCard />
          </>
        )}
        {activeTab === 'danger' && <DangerZoneCard />}
      </div>
    </div>
  );
}
