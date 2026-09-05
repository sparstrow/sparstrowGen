import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";

export type MachineSubtabKey =
  | "overview"
  | "runtimes"
  | "projects"
  | "credentials"
  | "telemetry"
  | "settings";

export interface MachineSubtabsProps {
  activeTab: MachineSubtabKey;
  onSelectTab: (tab: MachineSubtabKey) => void;
  counts?: {
    runtimes?: number;
    projects?: number;
  };
  className?: string;
}

export function MachineSubtabs({
  activeTab,
  onSelectTab,
  counts,
  className,
}: MachineSubtabsProps) {
  const tabs: Array<{ key: MachineSubtabKey; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "runtimes", label: "Runtimes & Models", count: counts?.runtimes },
    { key: "projects", label: "Projects & Worktrees", count: counts?.projects },
    { key: "credentials", label: "Environment & Keys" },
    { key: "telemetry", label: "Telemetry & Logs" },
    { key: "settings", label: "Node Settings" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Machine Sections"
      className={cn(
        "flex items-center gap-6 border-b border-border/80 text-xs font-medium select-none px-1",
        className,
      )}
    >
      {tabs.map((t) => {
        const isActive = t.key === activeTab;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(t.key)}
            className={cn(
              "relative flex items-center gap-2 pb-3 transition focus-visible:outline-none",
              isActive
                ? "border-b-2 border-amber-500 font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.label}</span>
            {typeof t.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 font-mono text-[10px]",
                  isActive
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
