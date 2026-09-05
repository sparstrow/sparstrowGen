import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Switch } from "@sparstrow/ui/components/ui/switch";
import { Terminal, CheckCircle2, ChevronDown, Check, Info, Zap } from "lucide-react";
import { ProviderLogo } from "./provider-logo";
import type { DiscoveredRuntime, DiscoveredModel } from "./runtime-table";

export interface RuntimeInspectorProps {
  runtime: DiscoveredRuntime | null;
  onProbeRuntime?: (id: string) => void;
  isProbing?: boolean;
  className?: string;
}

export function RuntimeInspector({
  runtime,
  onProbeRuntime,
  isProbing = false,
  className,
}: RuntimeInspectorProps) {
  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(null);
  const [moreExpanded, setMoreExpanded] = React.useState(false);
  const [fastModeEnabled, setFastModeEnabled] = React.useState(false);

  // Sync selected model when runtime changes
  React.useEffect(() => {
    if (runtime && runtime.models.length > 0) {
      const defaultModel = runtime.models.find((m) => m.default) ?? runtime.models[0];
      if (defaultModel) {
        setSelectedModelId(defaultModel.id);
      }
    } else {
      setSelectedModelId(null);
    }
  }, [runtime]);

  if (!runtime) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center shadow-xs",
          className,
        )}
      >
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground">
          <Terminal className="size-6 stroke-[1.5]" />
        </div>
        <h3 className="font-sans text-sm font-semibold text-foreground">Select a Runtime</h3>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
          Click any provider row on the left to inspect its discovered models, CLI probe outputs, and environment keys.
        </p>
      </div>
    );
  }

  const activeModel = runtime.models.find((m) => m.id === selectedModelId) ?? runtime.models[0];

  const primaryModels = React.useMemo(() => {
    const primaries = runtime.models.filter((m) => m.category === "primary");
    return primaries.length > 0 ? primaries : runtime.models;
  }, [runtime.models]);

  const moreModels = React.useMemo(() => {
    return runtime.models.filter((m) => m.category === "more");
  }, [runtime.models]);

  const renderModelRow = (m: DiscoveredModel) => {
    const isModelSelected = m.id === selectedModelId;
    return (
      <div
        key={m.id}
        onClick={() => setSelectedModelId(m.id)}
        className={cn(
          "flex items-center justify-between rounded-lg border p-2 text-xs transition cursor-pointer select-none",
          isModelSelected
            ? "border-amber-500/50 bg-amber-500/10 text-foreground shadow-xs"
            : "border-border/60 bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {m.shortcut != null ? (
            <span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted/70 border border-border font-mono text-[9px] text-muted-foreground font-semibold">
              {m.shortcut}
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground text-xs truncate">
                {m.label}
              </span>
              {m.badge ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.2 font-sans text-[10px] font-semibold border",
                    m.badge === "Default"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-300 border-amber-500/20",
                  )}
                >
                  {m.badge === "Requires usage credits" ? (
                    <Info className="size-2.5 shrink-0 text-amber-400" />
                  ) : null}
                  <span>{m.badge}</span>
                </span>
              ) : null}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
              {m.id}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isModelSelected ? (
            <Check className="size-3.5 text-amber-400" />
          ) : null}
          {m.thinking && m.thinking.length > 0 ? (
            <span className="rounded bg-muted border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Thinking
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className,
      )}
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3 min-w-0 pr-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background p-1.5">
            <ProviderLogo providerId={runtime.id} className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-sans font-semibold text-sm text-foreground truncate">
                {runtime.name}
              </h2>
              {runtime.badge ? (
                <Badge
                  variant="secondary"
                  className="bg-muted px-1.5 py-0 font-mono text-[10px] text-muted-foreground font-normal"
                >
                  {runtime.badge}
                </Badge>
              ) : null}
            </div>
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={runtime.cliPath}>
              {runtime.cliPath}
            </p>
          </div>
        </div>

        {onProbeRuntime ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onProbeRuntime(runtime.id)}
            disabled={isProbing}
            className="h-7 shrink-0 text-xs gap-1 font-medium bg-background border-border shadow-xs hover:bg-muted"
          >
            <span>{isProbing ? "Probing..." : "Probe CLI"}</span>
          </Button>
        ) : null}
      </div>

      {/* Drawer Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* CLI Discovery Probe Box */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>Discovery Command</span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
              <CheckCircle2 className="size-3" />
              <span>Exit code 0</span>
            </span>
          </div>
          <div className="rounded border border-border/80 bg-background/80 p-2 font-mono text-[11px] text-foreground/90 break-all select-all">
            {runtime.discoveryCmd}
          </div>
        </div>

        {/* Active Selection Bar */}
        {activeModel ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 p-2.5 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1">
                <ProviderLogo providerId={runtime.id} className="size-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Model
                </span>
                <span className="block font-sans text-xs font-semibold text-foreground truncate">
                  {activeModel.label}
                </span>
              </div>
            </div>

            <Badge
              variant="outline"
              className="border-border bg-muted/60 font-mono text-[10px] text-muted-foreground"
            >
              {activeModel.id}
            </Badge>
          </div>
        ) : null}

        {/* Available Models List */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-sans font-semibold text-foreground tracking-tight text-xs">
              Available Models ({runtime.models.length})
            </span>
            <span className="text-[11px] text-muted-foreground">Live enumeration</span>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {primaryModels.map(renderModelRow)}

            {moreModels.length > 0 ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setMoreExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition font-medium"
                >
                  <span className="flex items-center gap-1.5">
                    <span>More models</span>
                    <span className="text-[10px] font-mono text-muted-foreground/70">({moreModels.length})</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform duration-200",
                      moreExpanded && "rotate-180",
                    )}
                  />
                </button>

                {moreExpanded ? (
                  <div className="mt-2 space-y-1.5 pl-1 border-l-2 border-border/50 ml-1">
                    {moreModels.map(renderModelRow)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Fast Mode Toggle */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                <Zap className="size-3.5 text-amber-400" />
                <span>Fast mode</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Enable fast mode for faster Claude generation
              </div>
            </div>
            <Switch
              checked={fastModeEnabled}
              onCheckedChange={setFastModeEnabled}
            />
          </div>
        </div>

        {/* Inspected Environment Keys */}
        {runtime.envKeys && runtime.envKeys.length > 0 ? (
          <div>
            <span className="mb-1.5 block font-sans font-semibold text-foreground tracking-tight text-xs">
              Inspected Environment Keys
            </span>
            <div className="space-y-1 font-mono text-[11px]">
              {runtime.envKeys.map((e) => (
                <div
                  key={e.key}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-2"
                >
                  <div className="min-w-0 pr-2 truncate">
                    <div className="font-semibold text-foreground truncate">{e.key}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{e.value}</div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.2 text-[10px] font-semibold border",
                      e.source === "process"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        : e.source === "persistent"
                          ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                          : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {e.source === "process"
                      ? "Process"
                      : e.source === "persistent"
                        ? "Registry HKCU"
                        : "Unset"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
