import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Plus, X } from "lucide-react";
import { PlatformMark } from "./platform-mark";

export interface MachineTabItem {
  id: string;
  name: string;
  os: string | null | undefined;
  online: boolean;
  hostname?: string;
  isThisDevice?: boolean;
}

export interface MachineTabsProps {
  machines: MachineTabItem[];
  selectedMachineId: string;
  onSelectMachine: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onConnectMachine?: () => void;
  className?: string;
}

export function MachineTabs({
  machines,
  selectedMachineId,
  onSelectMachine,
  onCloseTab,
  onConnectMachine,
  className,
}: MachineTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Connected Machines"
      className={cn(
        "flex h-9 items-center gap-1 border-b border-border/80 bg-background px-2 text-xs select-none",
        className,
      )}
    >
      {machines.map((m) => {
        const isSelected = m.id === selectedMachineId;
        return (
          <div
            key={m.id}
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelectMachine(m.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectMachine(m.id);
              }
            }}
            className={cn(
              "flex h-full cursor-pointer items-center gap-2 border-r border-border/60 px-3.5 font-medium transition",
              isSelected
                ? "border-t-2 border-t-amber-500 bg-card/80 text-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            <PlatformMark
              os={m.os}
              className={cn("size-3.5 shrink-0", isSelected ? "text-amber-500" : "text-muted-foreground")}
            />
            <span className="truncate tracking-tight font-sans">{m.name}</span>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                m.online ? "bg-emerald-500" : "bg-muted-foreground/40",
              )}
              title={m.online ? "Online" : "Offline"}
            />
            {onCloseTab ? (
              <button
                type="button"
                aria-label={`Close tab for ${m.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(m.id);
                }}
                className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        );
      })}

      {onConnectMachine ? (
        <button
          type="button"
          aria-label="Connect New Machine"
          title="Connect New Machine"
          onClick={onConnectMachine}
          className="ml-1 flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition"
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
