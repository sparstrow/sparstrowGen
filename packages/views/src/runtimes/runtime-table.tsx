import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Plus } from "lucide-react";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@sparstrow/ui/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@sparstrow/ui/components/ui/card";
import { ProviderLogo } from "./provider-logo";

export interface DiscoveredModel {
  id: string;
  label: string;
  default?: boolean;
  thinking?: string[];
  description?: string;
  category?: "primary" | "more";
  badge?: string;
  shortcut?: number | string;
  supportsFastMode?: boolean;
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
  return (
    <Card className={cn("flex flex-col overflow-hidden border-border bg-card", className)}>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle as="h3" className="text-sm font-semibold text-foreground">
            Installed Runtimes
          </CardTitle>
          <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0 font-normal">
            {runtimes.length}
          </Badge>
        </div>

        {onAddRuntime ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onAddRuntime}
            className="h-7 text-xs gap-1 font-medium bg-background border-border hover:bg-muted"
          >
            <Plus className="size-3.5" />
            <span>Add Runtime</span>
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
              <TableHead className="h-9 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Runtime Provider
              </TableHead>
              <TableHead className="h-9 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Health
              </TableHead>
              <TableHead className="h-9 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Version
              </TableHead>
              <TableHead className="h-9 px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Models
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runtimes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                  No CLI runtimes discovered on this machine.
                </TableCell>
              </TableRow>
            ) : (
              runtimes.map((r) => {
                const isSelected = r.id === selectedRuntimeId;
                const isOnline = r.status === "online";

                return (
                  <TableRow
                    key={r.id}
                    data-state={isSelected ? "selected" : undefined}
                    tabIndex={0}
                    role="button"
                    aria-label={`Select runtime ${r.name}`}
                    onClick={() => onSelectRuntime(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectRuntime(r.id);
                      }
                    }}
                    className={cn(
                      "cursor-pointer border-b border-border/70 transition-colors select-none",
                      isSelected
                        ? "bg-primary/10 hover:bg-primary/15 border-l-2 border-l-primary"
                        : "hover:bg-muted/40",
                    )}
                  >
                    {/* Provider Info */}
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1">
                          <ProviderLogo providerId={r.id} className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-foreground truncate">
                              {r.name}
                            </span>
                            {r.badge ? (
                              <Badge
                                variant="secondary"
                                className="px-1.5 py-0 text-[10px] text-muted-foreground font-mono font-normal"
                              >
                                {r.badge}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Health */}
                    <TableCell className="px-3 py-3 whitespace-nowrap">
                      {isOnline ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-success font-medium">
                          <span className="size-1.5 rounded-full bg-success shrink-0" />
                          <span>Online</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                          <span>Idle</span>
                        </span>
                      )}
                    </TableCell>

                    {/* Version */}
                    <TableCell className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {r.version}
                    </TableCell>

                    {/* Model Catalog Count */}
                    <TableCell className="px-4 py-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {r.models.length} model{r.models.length === 1 ? "" : "s"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
