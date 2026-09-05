import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Switch } from "@sparstrow/ui/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@sparstrow/ui/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@sparstrow/ui/components/ui/empty";
import { Terminal, CheckCircle2, ChevronDown, Check, Info, Zap, RefreshCw } from "lucide-react";
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
      <Card className={cn("flex flex-col items-center justify-center p-8 border-border bg-card text-center", className)}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Terminal className="size-6 text-muted-foreground stroke-[1.5]" />
            </EmptyMedia>
            <EmptyTitle>Select a Runtime</EmptyTitle>
            <EmptyDescription>
              Click any provider on the left to inspect its model catalog, configuration, and CLI probe outputs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    );
  }

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
        role="button"
        tabIndex={0}
        aria-label={`Select model ${m.label}`}
        onClick={() => setSelectedModelId(m.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedModelId(m.id);
          }
        }}
        className={cn(
          "flex items-center justify-between rounded-lg border p-2.5 text-xs transition cursor-pointer select-none",
          isModelSelected
            ? "border-primary/50 bg-primary/10 text-foreground"
            : "border-border/60 bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground",
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          {m.shortcut != null ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted border border-border font-mono text-xs text-muted-foreground font-semibold">
              {m.shortcut}
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-foreground truncate">
                {m.label}
              </span>
              {m.badge ? (
                m.badge === "Default" ? (
                  <Badge variant="success" className="text-xs px-1.5 py-0">
                    Default
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-warning/30 bg-warning/10 text-warning text-xs px-1.5 py-0 flex items-center gap-1 font-normal"
                  >
                    <Info className="size-3 shrink-0" />
                    <span>{m.badge}</span>
                  </Badge>
                )
              ) : null}
            </div>
            <div className="font-mono text-xs text-muted-foreground mt-0.5 truncate">
              {m.id}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isModelSelected ? (
            <Check className="size-4 text-primary shrink-0" />
          ) : null}
          {m.thinking && m.thinking.length > 0 ? (
            <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0 font-normal">
              Thinking
            </Badge>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Card className={cn("flex flex-col overflow-hidden border-border bg-card", className)}>
      {/* Drawer Header */}
      <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/20 p-4 space-y-0">
        <div className="flex items-center gap-3 min-w-0 pr-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background p-1.5">
            <ProviderLogo providerId={runtime.id} className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle as="h3" className="font-semibold text-base text-foreground truncate">
                {runtime.name}
              </CardTitle>
              {runtime.badge ? (
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 font-mono text-[10px] text-muted-foreground font-normal"
                >
                  {runtime.badge}
                </Badge>
              ) : null}
              <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                <span className="size-1.5 rounded-full bg-success shrink-0" />
                <span>Online</span>
              </span>
            </div>
            <p className="truncate font-mono text-xs text-muted-foreground mt-0.5" title={runtime.cliPath}>
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
            className="h-8 shrink-0 text-xs gap-1.5 font-medium bg-background border-border hover:bg-muted"
          >
            <RefreshCw className={cn("size-3.5", isProbing && "animate-spin")} />
            <span>{isProbing ? "Probing..." : "Probe CLI"}</span>
          </Button>
        ) : null}
      </CardHeader>

      {/* Drawer Scrollable Body */}
      <CardContent className="p-4 space-y-5 overflow-y-auto">
        {/* Available Models List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Available Models
              </h4>
              <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0 font-normal">
                {runtime.models.length}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success" />
              <span>Live enumeration</span>
            </span>
          </div>

          <div className="space-y-1.5">
            {primaryModels.map(renderModelRow)}

            {moreModels.length > 0 ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setMoreExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition font-medium"
                >
                  <span className="flex items-center gap-1.5">
                    <span>More models</span>
                    <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0 font-normal">
                      {moreModels.length}
                    </Badge>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform duration-200",
                      moreExpanded && "rotate-180",
                    )}
                  />
                </button>

                {moreExpanded ? (
                  <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-border/60 ml-1">
                    {moreModels.map(renderModelRow)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Fast Mode Toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center gap-2.5 min-w-0 pr-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <Zap className="size-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm text-foreground">
                Fast mode
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Enable fast mode for ~2.5x faster Claude Opus generation
              </div>
            </div>
          </div>
          <Switch
            checked={fastModeEnabled}
            onCheckedChange={setFastModeEnabled}
            aria-label="Toggle fast mode"
          />
        </div>

        {/* CLI Discovery Probe Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Discovery Command</span>
            <span className="flex items-center gap-1 font-mono text-xs text-success">
              <CheckCircle2 className="size-3.5" />
              <span>Exit code 0</span>
            </span>
          </div>
          <div className="rounded-md border border-border bg-muted/40 p-2.5 font-mono text-xs text-foreground break-all select-all">
            {runtime.discoveryCmd}
          </div>
        </div>

        {/* Inspected Environment Keys */}
        {runtime.envKeys && runtime.envKeys.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Inspected Environment Keys
            </h4>
            <div className="space-y-1.5">
              {runtime.envKeys.map((e) => (
                <div
                  key={e.key}
                  className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="min-w-0 pr-3 truncate">
                    <div className="font-mono text-xs font-semibold text-foreground truncate">{e.key}</div>
                    <div className="font-mono text-xs text-muted-foreground truncate mt-0.5">{e.value}</div>
                  </div>
                  <Badge
                    variant={e.source === "process" ? "success" : e.source === "persistent" ? "info" : "secondary"}
                    className="shrink-0 font-mono text-xs font-normal"
                  >
                    {e.source === "process"
                      ? "Process"
                      : e.source === "persistent"
                        ? "Registry HKCU"
                        : "Unset"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
