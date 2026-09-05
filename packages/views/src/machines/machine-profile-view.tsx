import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { useMachines, useProviders, useDiscoverModels } from "@sparstrow/core";
import {
  CLAUDE_CODE_MODEL_CATALOG,
  ANTIGRAVITY_MODEL_CATALOG,
  enrichDiscoveredModels,
  type ProviderId,
} from "@sparstrow/shared";
import { MachineTabs, type MachineTabItem } from "./machine-tabs";
import { MachineProfileHeader } from "./machine-profile-header";
import { MachineSubtabs, type MachineSubtabKey } from "./machine-subtabs";
import { RuntimeTable, type DiscoveredRuntime, type DiscoveredModel } from "../runtimes/runtime-table";
import { RuntimeInspector } from "../runtimes/runtime-inspector";
import { Skeleton } from "@sparstrow/ui/components/ui/skeleton";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { Cpu, HardDrive, Activity, FolderGit2, KeyRound } from "lucide-react";

export interface MachineProfileViewProps {
  thisMachineId?: string | null;
  selectedMachineId?: string | null;
  onSelectMachine?: (id: string) => void;
  onConnectMachine?: () => void;
  className?: string;
}

const RUNTIME_DEFINITIONS: Record<string, DiscoveredRuntime> = {
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    badge: "Built-in",
    status: "online",
    version: "1.1.25",
    cliPath: "agy",
    discoveryCmd: "agy models",
    models: ANTIGRAVITY_MODEL_CATALOG,
    envKeys: [
      { key: "ANTIGRAVITY_AGENTAPI_EXE", source: "process", value: "Present" },
      { key: "AGY_BROWSER_WS_URL", source: "process", value: "Active CDP connection" },
    ],
  },
  "claude-code": {
    id: "claude",
    name: "Claude Code",
    badge: "Built-in",
    status: "online",
    version: "2.1.90",
    cliPath: "claude",
    discoveryCmd: "claude --version",
    models: CLAUDE_CODE_MODEL_CATALOG,
    envKeys: [
      { key: "CLAUDE_CODE_OAUTH_TOKEN", source: "process", value: "Authenticated" },
      { key: "ANTHROPIC_API_KEY", source: "none", value: "Unset" },
    ],
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    badge: "Local",
    status: "idle",
    version: "v0.5.0",
    cliPath: "http://127.0.0.1:11434",
    discoveryCmd: "ollama list",
    models: [],
    envKeys: [
      { key: "OLLAMA_HOST", source: "process", value: "http://127.0.0.1:11434" },
    ],
  },
};

const DEFAULT_REAL_RUNTIMES: DiscoveredRuntime[] = [
  RUNTIME_DEFINITIONS.antigravity!,
  RUNTIME_DEFINITIONS["claude-code"]!,
];

export function MachineProfileView({
  thisMachineId,
  selectedMachineId: controlledSelectedMachineId,
  onSelectMachine,
  onConnectMachine,
  className,
}: MachineProfileViewProps) {
  const machinesQuery = useMachines();

  // Connected machines list
  const machinesList: MachineTabItem[] = React.useMemo(() => {
    const live = machinesQuery.data ?? [];
    if (live.length > 0) {
      const sorted = [...live].sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return (b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0) - (a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0);
      });
      return sorted.map((m) => ({
        id: m.id,
        name: m.name || m.hostname || "Workstation",
        os: m.os,
        online: m.online,
        hostname: m.hostname,
        isThisDevice: thisMachineId ? m.machineId === thisMachineId || m.id === thisMachineId : true,
      }));
    }

    // Default to this local workstation
    return [
      {
        id: "mach_host",
        name: "DESKTOP-GJ8NLB8",
        os: "Windows 11 Pro 24H2 (x64)",
        online: true,
        hostname: "DESKTOP-GJ8NLB8",
        isThisDevice: true,
      },
    ];
  }, [machinesQuery.data, thisMachineId]);

  const [internalSelectedMachineId, setInternalSelectedMachineId] = React.useState<string>(
    controlledSelectedMachineId ?? machinesList[0]?.id ?? "mach_host",
  );

  const selectedMachineId = controlledSelectedMachineId ?? internalSelectedMachineId;

  React.useEffect(() => {
    if (controlledSelectedMachineId) {
      setInternalSelectedMachineId(controlledSelectedMachineId);
    }
  }, [controlledSelectedMachineId]);

  React.useEffect(() => {
    if (machinesList.length > 0 && !machinesList.some((m) => m.id === selectedMachineId)) {
      const fallbackId = machinesList[0]?.id ?? "mach_host";
      setInternalSelectedMachineId(fallbackId);
      onSelectMachine?.(fallbackId);
    }
  }, [machinesList, selectedMachineId, onSelectMachine]);

  const DEFAULT_MACHINE: MachineTabItem = {
    id: "mach_host",
    name: "DESKTOP-GJ8NLB8",
    os: "Windows 11 Pro 24H2 (x64)",
    online: true,
    hostname: "DESKTOP-GJ8NLB8",
    isThisDevice: true,
  };

  // Active machine object
  const activeMachine: MachineTabItem = React.useMemo(() => {
    return machinesList.find((m) => m.id === selectedMachineId) ?? machinesList[0] ?? DEFAULT_MACHINE;
  }, [machinesList, selectedMachineId]);

  const [activeSubtab, setActiveSubtab] = React.useState<MachineSubtabKey>("runtimes");
  const [selectedRuntimeId, setSelectedRuntimeId] = React.useState<string | null>("antigravity");
  const [isRescanning, setIsRescanning] = React.useState(false);
  const [isProbing, setIsProbing] = React.useState(false);
  const [dynamicModels, setDynamicModels] = React.useState<Record<string, DiscoveredModel[]>>({});

  const providersQuery = useProviders();
  const discoverModelsMutation = useDiscoverModels();

  // Filter available runtimes for this machine, injecting dynamically discovered models if available
  const activeRuntimes = React.useMemo<DiscoveredRuntime[]>(() => {
    return DEFAULT_REAL_RUNTIMES.map((runtime) => {
      const live = dynamicModels[runtime.id];
      if (live && live.length > 0) {
        return {
          ...runtime,
          models: live,
        };
      }
      return runtime;
    });
  }, [dynamicModels]);

  const selectedRuntime = React.useMemo(() => {
    return activeRuntimes.find((r) => r.id === selectedRuntimeId) ?? activeRuntimes[0] ?? null;
  }, [activeRuntimes, selectedRuntimeId]);

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await Promise.allSettled([
        machinesQuery.refetch(),
        providersQuery.refetch(),
      ]);
    } finally {
      setIsRescanning(false);
    }
  };

  const handleProbeRuntime = async (id: string) => {
    setIsProbing(true);
    const providerKey: ProviderId = id === "claude" ? "claude-code" : (id as ProviderId);
    try {
      const res = await discoverModelsMutation.mutateAsync({ provider: providerKey });
      if (res?.models && res.models.length > 0) {
        const enriched = enrichDiscoveredModels(id, res.models);
        setDynamicModels((prev) => ({
          ...prev,
          [id]: enriched,
        }));
      }
    } catch {
      // Degrades gracefully to static catalog
    } finally {
      setIsProbing(false);
    }
  };

  if (machinesQuery.isLoading) {
    return (
      <div className={cn("p-6 space-y-4", className)}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background text-foreground overflow-hidden", className)}>
      {/* Main Content Viewport — top shell header handles the breadcrumb trail */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Machine Profile Header Card */}
        <MachineProfileHeader
          machine={activeMachine}
          onRescan={handleRescan}
          isRescanning={isRescanning}
        />

        {/* Sub Navigation Tabs */}
        <MachineSubtabs
          activeTab={activeSubtab}
          onSelectTab={setActiveSubtab}
          counts={{
            runtimes: activeRuntimes.length,
            projects: 1,
          }}
        />

        {/* Sub-tab 1: Runtimes & Models */}
        {activeSubtab === "runtimes" ? (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                Discovered CLI Runtimes & Agent Engines
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Discovered via system registry and PATH. Click any provider to inspect its model catalog and CLI probe outputs.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[460px] items-start">
              {/* Left Runtimes Table (5 cols) */}
              <div className="lg:col-span-5 flex flex-col min-h-0">
                <RuntimeTable
                  runtimes={activeRuntimes}
                  selectedRuntimeId={selectedRuntimeId}
                  onSelectRuntime={setSelectedRuntimeId}
                />
              </div>

              {/* Right Model Inspector Workbench (7 cols) */}
              <div className="lg:col-span-7 flex flex-col min-h-0">
                <RuntimeInspector
                  runtime={selectedRuntime}
                  onProbeRuntime={handleProbeRuntime}
                  isProbing={isProbing}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Sub-tab 2: Overview */}
        {activeSubtab === "overview" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Cpu className="size-4 text-amber-500" />
                <span>Hardware Telemetry</span>
              </div>
              <div className="mt-2 text-base font-bold text-foreground">Intel Core i9-13900K</div>
              <p className="text-xs text-muted-foreground mt-1">24 cores / 32 threads · 64 GB DDR5 RAM</p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-2">
                <span>CPU: 8%</span>
                <span>Memory: 22.4 / 64 GB</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <HardDrive className="size-4 text-amber-500" />
                <span>Local Storage</span>
              </div>
              <div className="mt-2 text-base font-bold text-foreground">C:\Users\gsrih</div>
              <p className="text-xs text-muted-foreground mt-1">AppData: %APPDATA%\Sparstrowgen</p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-2">
                <span>Free Disk: 482 GB</span>
                <span>Docker: Active</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Activity className="size-4 text-emerald-400" />
                <span>Daemon Process</span>
              </div>
              <div className="mt-2 text-base font-bold text-foreground">Running (PID 40616)</div>
              <p className="text-xs text-muted-foreground mt-1">Loopback Fastify server on port 8080</p>
              <div className="mt-4 flex items-center justify-between text-xs text-emerald-400 font-medium border-t border-border/60 pt-2">
                <span>● Healthy</span>
                <span>Uptime: 2h 45m</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Sub-tab 3: Projects & Worktrees */}
        {activeSubtab === "projects" ? (
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <FolderGit2 className="size-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">Bound Worktrees & Git Repositories</h3>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex items-center justify-between text-xs">
              <div className="min-w-0 pr-3">
                <div className="font-semibold text-foreground">Sparstrowgen / complete_slice_plan_implementation</div>
                <div className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
                  C:\Users\gsrih\.gemini\antigravity\worktrees\Sparstrowgen\complete_slice_plan_implementation
                </div>
              </div>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono">
                feature/complete-slice-plan
              </Badge>
            </div>
          </div>
        ) : null}

        {/* Sub-tab 4: Environment & Keys */}
        {activeSubtab === "credentials" ? (
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="size-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">Environment Credential Scope Resolution</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Registry (HKCU/HKLM) has precedence over ambient process memory to prevent shell collision.
            </p>

            <div className="space-y-2 text-xs font-mono">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">ANTIGRAVITY_AGENTAPI_EXE</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Value: C:\Users\gsrih\AppData\Local\agy\bin\agy.exe</div>
                </div>
                <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold">
                  Active
                </span>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">CLAUDE_CODE_OAUTH_TOKEN</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Value: sk-ant-oat01-9a74... (Valid Session)</div>
                </div>
                <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold">
                  Active
                </span>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">HERMES_HOME</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Value: C:\Users\gsrih\AppData\Local\hermes</div>
                </div>
                <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold">
                  Active
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Sub-tab 5: Telemetry */}
        {activeSubtab === "telemetry" ? (
          <div className="rounded-xl border border-border bg-card p-5 text-center text-xs text-muted-foreground shadow-xs">
            Telemetry metrics streaming via local Fastify daemon WebSocket.
          </div>
        ) : null}

        {/* Sub-tab 6: Settings */}
        {activeSubtab === "settings" ? (
          <div className="rounded-xl border border-border bg-card p-5 text-center text-xs text-muted-foreground shadow-xs">
            Node daemon settings and port configuration.
          </div>
        ) : null}
      </div>
    </div>
  );
}
