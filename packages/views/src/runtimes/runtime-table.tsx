import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Search, Plus } from "lucide-react";
import { Input } from "@sparstrow/ui/components/ui/input";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { ProviderLogo } from "./provider-logo";

export interface DiscoveredModel {
  id: string;
  label: string;
  default?: boolean;
  thinking?: string[];
  description?: string;
}

export interface DiscoveredRuntime {
  id: string;
  name: string;
  badge?: string;
  status: "online" | "offline" | "idle";
  version: string;
  cliPath: string;
  discoveryCmd: string;
  models: DiscoveredModel[];
  envKeys?: Array<{
    key: string;
    source: "process" | "persistent" | "none";
    value: string;
  }>;
}

export interface RuntimeTableProps {
  runtimes: DiscoveredRuntime[];
  selectedRuntimeId: string | null;
  onSelectRuntime: (id: string) => void;
  onAddRuntime?: () => void;
  className?: string;
}

export function RuntimeTable({
  runtimes,
  selectedRuntimeId,
  onSelectRuntime,
  onAddRuntime,
  className,
}: RuntimeTableProps) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return runtimes;
    return runtimes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cliPath.toLowerCase().includes(q) ||
        r.models.some((m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    );
  }, [runtimes, search]);

  return (
    <div className={cn("flex flex-col min-h-0 gap-4", className)}>
      {/* Search & Action Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter runtimes or models..."
            className="h-8 pl-8 pr-3 text-xs bg-card border-border placeholder:text-muted-foreground focus-visible:ring-amber-500/30"
          />
        </div>

        {onAddRuntime ? (
          <Button
            size="sm"
            onClick={onAddRuntime}
            className="h-8 gap-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>Add Runtime</span>
          </Button>
        ) : null}
      </div>

      {/* Table Container */}
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {/* Table Header */}
        <div className="grid grid-cols-12 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
          <div className="col-span-5">Runtime Provider</div>
          <div className="col-span-2">Health</div>
          <div className="col-span-3">Discovered CLI & Version</div>
          <div className="col-span-2 text-right">Catalog</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/60">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No CLI runtimes match your search query.
            </div>
          ) : (
            filtered.map((r) => {
              const isSelected = r.id === selectedRuntimeId;
              const isOnline = r.status === "online";

              return (
                <div
                  key={r.id}
                  onClick={() => onSelectRuntime(r.id)}
                  className={cn(
                    "grid grid-cols-12 items-center px-4 py-3.5 cursor-pointer text-xs transition select-none",
                    isSelected
                      ? "bg-amber-500/10 border-l-2 border-l-amber-500 text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  {/* Provider Info */}
                  <div className="col-span-5 flex items-center gap-3 min-w-0 pr-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1">
                      <ProviderLogo providerId={r.id} className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground text-sm truncate font-sans">
                          {r.name}
                        </span>
                        {r.badge ? (
                          <Badge
                            variant="secondary"
                            className="bg-muted px-1.5 py-0 text-[10px] text-muted-foreground font-mono font-normal"
                          >
                            {r.badge}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Health */}
                  <div className="col-span-2">
                    {isOnline ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span>Online</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>Idle</span>
                      </span>
                    )}
                  </div>

                  {/* Version & CLI */}
                  <div className="col-span-3 truncate font-mono text-xs text-muted-foreground pr-2">
                    {r.version}
                  </div>

                  {/* Model Catalog Count */}
                  <div className="col-span-2 text-right font-mono text-xs text-muted-foreground">
                    {r.models.length} model{r.models.length === 1 ? "" : "s"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
