import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { useMachines } from "@sparstrow/core";
import { MachineTabs, type MachineTabItem } from "./machine-tabs";
import { MachineProfileHeader } from "./machine-profile-header";
import { MachineSubtabs, type MachineSubtabKey } from "./machine-subtabs";
import { RuntimeTable, type DiscoveredRuntime } from "../runtimes/runtime-table";
import { RuntimeInspector } from "../runtimes/runtime-inspector";
import { Skeleton } from "@sparstrow/ui/components/ui/skeleton";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { Cpu, HardDrive, Activity, FolderGit2, KeyRound } from "lucide-react";

export interface MachineProfileViewProps {
  thisMachineId?: string | null;
  onConnectMachine?: () => void;
  className?: string;
}

const MOCK_RUNTIMES_WINDOWS: DiscoveredRuntime[] = [
  {
    id: "antigravity",
    name: "Antigravity",
    badge: "Built-in",
    status: "online",
    version: "1.1.8",
    cliPath: "C:\\Users\\gsrih\\AppData\\Local\\agy\\bin\\agy.exe",
    discoveryCmd: "agy models",
    models: [
      { id: "claude-opus-5", label: "Opus 5", default: true, thinking: ["ultracode"] },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", thinking: ["high"] },
      { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", thinking: ["high"] },
      { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)", thinking: ["medium"] },
      { id: "gemini-3.7-flash-high", label: "Gemini 3.7 Flash (High)", thinking: ["high"] },
      { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" },
      { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
    ],
    envKeys: [
      { key: "ANTIGRAVITY_AGENTAPI_EXE", source: "process", value: "Present" },
      { key: "AGY_BROWSER_WS_URL", source: "process", value: "Active CDP connection" },
      { key: "GEMINI_API_KEY", source: "none", value: "Unset (using CLI session auth)" },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    badge: "Built-in",
    status: "online",
    version: "2.1.90 (Claude Code)",
    cliPath: "C:\\Users\\gsrih\\.local\\bin\\claude.exe",
    discoveryCmd: "claude --version",
    models: [
      { id: "claude-opus-5", label: "Opus 5", default: true, thinking: ["ultracode"] },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", thinking: ["high"] },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", thinking: ["medium"] },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7", thinking: ["high"] },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
    envKeys: [
      { key: "CLAUDE_CODE_OAUTH_TOKEN", source: "process", value: "sk-ant-oat01-*** (Authenticated)" },
      { key: "ANTHROPIC_API_KEY", source: "none", value: "Unset" },
      { key: "ANTHROPIC_BASE_URL", source: "none", value: "Default (https://api.anthropic.com)" },
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    badge: "Built-in",
    status: "online",
    version: "v0.18.2 (Hermes Agent)",
    cliPath: "C:\\Users\\gsrih\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe",
    discoveryCmd: "hermes --version",
    models: [
      { id: "nous-hermes-3-llama-3.1-8b", label: "Hermes 3 (Llama-3.1-8B)", default: true },
      { id: "nous-hermes-3-llama-3.1-70b", label: "Hermes 3 (Llama-3.1-70B)" },
      { id: "hermes-function-calling", label: "Hermes Tool Agent (Local)" },
    ],
    envKeys: [
      { key: "HERMES_HOME", source: "process", value: "C:\\Users\\gsrih\\AppData\\Local\\hermes" },
      { key: "HERMES_GIT_BASH_PATH", source: "process", value: "Present" },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    badge: "Built-in",
    status: "idle",
    version: "v1.4.0 (Codex CLI)",
    cliPath: "C:\\Users\\gsrih\\AppData\\Local\\Programs\\codex\\codex.cmd",
    discoveryCmd: "codex --version",
    models: [
      { id: "gpt-5-codex", label: "GPT-5 Codex", default: true },
      { id: "o3-mini", label: "o3-mini (High Reasoning)", thinking: ["high"] },
    ],
    envKeys: [{ key: "OPENAI_API_KEY", source: "process", value: "sk-proj-*** (Detected)" }],
  },
  {
    id: "opencode",
    name: "OpenCode",
    badge: "Built-in",
    status: "online",
    version: "v0.8.4",
    cliPath: "C:\\Users\\gsrih\\AppData\\Roaming\\npm\\opencode.cmd",
    discoveryCmd: "opencode models",
    models: [
      { id: "deepseek-r1-distill-qwen-32b", label: "DeepSeek R1 (32B)", default: true, thinking: ["high"] },
      { id: "qwen-2.5-coder-32b", label: "Qwen 2.5 Coder (32B)" },
    ],
    envKeys: [{ key: "OPENCODE_RUNTIME_DIR", source: "process", value: "C:\\Users\\gsrih\\.opencode" }],
  },
  {
    id: "cursor",
    name: "Cursor Agent",
    badge: "Built-in",
    status: "online",
    version: "v0.45.11 (Cursor CLI)",
    cliPath: "C:\\Users\\gsrih\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin\\cursor.cmd",
    discoveryCmd: "cursor --version",
    models: [
      { id: "cursor-fast", label: "Cursor Fast (Claude 3.5 Sonnet)", default: true },
      { id: "cursor-composer", label: "Cursor Composer (Agentic)" },
    ],
    envKeys: [{ key: "CURSOR_TOKEN", source: "persistent", value: "cur_sess_*** (HKCU)" }],
  },
];

const MOCK_RUNTIMES_UBUNTU: DiscoveredRuntime[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    badge: "Worker",
    status: "online",
    version: "v0.12.0",
    cliPath: "/usr/local/bin/openclaw",
    discoveryCmd: "openclaw models",
    models: [
      { id: "deepseek-r1-full", label: "DeepSeek R1 Full (671B FP8)", default: true, thinking: ["high"] },
    ],
    envKeys: [{ key: "CUDA_VISIBLE_DEVICES", source: "process", value: "0,1,2,3 (4x RTX 4090)" }],
  },
];

export function MachineProfileView({
  thisMachineId,
  onConnectMachine,
  className,
}: MachineProfileViewProps) {
  const machinesQuery = useMachines();

  // Connected machines list
  const machinesList: MachineTabItem[] = React.useMemo(() => {
    const live = machinesQuery.data ?? [];
    if (live.length > 0) {
      return live.map((m) => ({
        id: m.id,
        name: m.name || m.hostname || "Workstation",
        os: m.os,
        online: m.online,
        hostname: m.hostname,
        isThisDevice: thisMachineId ? m.machineId === thisMachineId || m.id === thisMachineId : true,
      }));
    }

    // Default development fallback machine tabs
    return [
      {
        id: "mach_host",
        name: "DESKTOP-GJ8NLB8",
        os: "Windows 11 Pro 24H2 (x64)",
        online: true,
        hostname: "DESKTOP-GJ8NLB8",
        isThisDevice: true,
      },
      {
        id: "mach_ubuntu",
        name: "dev-ubuntu-server",
        os: "Linux Ubuntu 22.04 LTS (x86_64)",
        online: true,
        hostname: "dev-ubuntu-server",
        isThisDevice: false,
      },
      {
        id: "mach_mac",
        name: "macbook-pro-m3",
        os: "Darwin 23.5.0 (arm64)",
        online: true,
        hostname: "macbook-pro-m3",
        isThisDevice: false,
      },
    ];
  }, [machinesQuery.data, thisMachineId]);

  const [selectedMachineId, setSelectedMachineId] = React.useState<string>(
    machinesList[0]?.id ?? "mach_host",
  );

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
  const [selectedRuntimeId, setSelectedRuntimeId] = React.useState<string>("claude");
  const [isRescanning, setIsRescanning] = React.useState(false);
  const [isProbing, setIsProbing] = React.useState(false);

  // Runtimes for active machine
  const activeRuntimes = React.useMemo(() => {
    if (activeMachine?.id === "mach_ubuntu" || (activeMachine?.os ?? "").toLowerCase().includes("linux")) {
      return MOCK_RUNTIMES_UBUNTU;
    }
    return MOCK_RUNTIMES_WINDOWS;
  }, [activeMachine]);

  // Keep selectedRuntimeId valid
  React.useEffect(() => {
    if (!activeRuntimes.some((r) => r.id === selectedRuntimeId)) {
      setSelectedRuntimeId(activeRuntimes[0]?.id ?? "");
    }
  }, [activeRuntimes, selectedRuntimeId]);

  const selectedRuntime = React.useMemo(() => {
    return activeRuntimes.find((r) => r.id === selectedRuntimeId) ?? null;
  }, [activeRuntimes, selectedRuntimeId]);

  const handleRescan = () => {
    setIsRescanning(true);
    setTimeout(() => {
      setIsRescanning(false);
    }, 600);
  };

  const handleProbeRuntime = (_id: string) => {
    setIsProbing(true);
    setTimeout(() => {
      setIsProbing(false);
    }, 450);
  };

  if (machinesQuery.isPending && machinesList.length === 0) {
    return (
      <div className={cn("flex flex-col h-full bg-background p-6 space-y-6", className)}>
        <Skeleton className="h-9 w-72 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-12 gap-6 flex-1">
          <Skeleton className="col-span-8 h-full rounded-xl" />
          <Skeleton className="col-span-4 h-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background text-foreground overflow-hidden", className)}>
      {/* Top Machines Tab Bar */}
      <MachineTabs
        machines={machinesList}
        selectedMachineId={selectedMachineId}
        onSelectMachine={setSelectedMachineId}
        onConnectMachine={onConnectMachine}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <span>Machines</span>
          <span>/</span>
          <span className="text-foreground">{activeMachine.name}</span>
        </div>

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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[460px]">
              {/* Left Runtimes Table (8 cols) */}
              <div className="lg:col-span-8 flex flex-col min-h-0">
                <RuntimeTable
                  runtimes={activeRuntimes}
                  selectedRuntimeId={selectedRuntimeId}
                  onSelectRuntime={setSelectedRuntimeId}
                />
              </div>

              {/* Right Model Inspector Drawer (4 cols) */}
              <div className="lg:col-span-4 flex flex-col min-h-0">
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
