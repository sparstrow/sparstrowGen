"use client";

import * as React from "react";
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  Loader2,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ChatActivity } from "@sparstrow/shared";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { cn } from "@sparstrow/ui/lib/utils";

interface ThinkingCardProps {
  content: string;
  isLive?: boolean;
}

export function ThinkingCard({ content, isLive = false }: ThinkingCardProps) {
  const [isOpen, setIsOpen] = React.useState(isLive);

  // Auto-open while live, but allow user to toggle
  React.useEffect(() => {
    if (isLive) setIsOpen(true);
  }, [isLive]);

  if (!content) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 text-xs transition-colors">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-muted-foreground hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          <Brain className={cn("size-3.5", isLive ? "animate-pulse text-brand" : "text-muted-foreground")} />
          <span>{isLive ? "Thinking..." : "Thought process"}</span>
          <span className="text-[10px] text-muted-foreground/60">
            ({content.length} chars)
          </span>
        </div>
        {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>

      {isOpen ? (
        <div className="border-t border-border/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground/90 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
          {content}
          {isLive ? <span className="inline-block w-1.5 h-3 ml-0.5 bg-brand animate-pulse align-middle" /> : null}
        </div>
      ) : null}
    </div>
  );
}

interface ToolCardProps {
  activity: ChatActivity;
  isLive?: boolean;
}

function getToolIcon(toolName?: string) {
  const lower = (toolName ?? "").toLowerCase();
  if (lower.includes("bash") || lower.includes("cmd") || lower.includes("terminal") || lower.includes("command")) {
    return <Terminal className="size-3.5 text-sky-500" />;
  }
  if (lower.includes("file") || lower.includes("read") || lower.includes("write") || lower.includes("view")) {
    return <FileText className="size-3.5 text-amber-500" />;
  }
  if (lower.includes("code") || lower.includes("grep") || lower.includes("glob")) {
    return <FileCode className="size-3.5 text-indigo-500" />;
  }
  return <Wrench className="size-3.5 text-brand" />;
}

function getToolSummary(activity: ChatActivity): string {
  const tool = activity.tool ?? "tool";
  const input = activity.input ?? {};

  if (input.command && typeof input.command === "string") {
    return input.command;
  }
  if (input.path && typeof input.path === "string") {
    return input.path;
  }
  if (input.targetFile && typeof input.targetFile === "string") {
    return input.targetFile;
  }
  if (input.query && typeof input.query === "string") {
    return `query: ${input.query}`;
  }
  if (Object.keys(input).length > 0) {
    try {
      const firstVal = Object.values(input)[0];
      if (typeof firstVal === "string") return firstVal;
      return JSON.stringify(input);
    } catch {
      return tool;
    }
  }
  return tool;
}

export function ToolCard({ activity, isLive = false }: ToolCardProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const toolName = activity.tool ?? "Tool Execution";
  const summary = getToolSummary(activity);
  const hasOutput = Boolean(activity.output);
  const isRunning = isLive && !hasOutput;

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 text-xs shadow-2xs transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          {getToolIcon(toolName)}
          <Badge variant="outline" className="h-4.5 px-1.5 font-mono text-[10px] uppercase tracking-wider">
            {toolName}
          </Badge>
          <span className="truncate font-mono text-[11px] text-foreground/80 max-w-[340px]">
            {summary}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin text-brand" />
              <span>Running...</span>
            </div>
          ) : hasOutput ? (
            <div className="flex items-center gap-1 text-[11px] text-emerald-500">
              <Check className="size-3" />
              <span>Done</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>Ready</span>
            </div>
          )}
          {isOpen ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-border/40 p-3 space-y-2 bg-muted/10 font-mono text-[11px]">
          {activity.input && Object.keys(activity.input).length > 0 ? (
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Input:</span>
              <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-background/80 p-2 text-foreground/90 whitespace-pre-wrap break-all border border-border/30">
                {JSON.stringify(activity.input, null, 2)}
              </pre>
            </div>
          ) : null}

          {activity.output ? (
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Output:</span>
              <pre className="mt-1 max-h-52 overflow-y-auto rounded bg-background/90 p-2 text-foreground/90 whitespace-pre-wrap break-all border border-border/30">
                {activity.output}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ActivitiesList({
  activities,
  isLive = false,
}: {
  activities?: ChatActivity[];
  isLive?: boolean;
}) {
  if (!activities || activities.length === 0) return null;

  // Aggregate thinking blocks together for clean presentation
  const items: Array<
    | { kind: "thinking"; content: string }
    | { kind: "tool"; activity: ChatActivity }
    | { kind: "status"; content: string }
  > = [];

  let accumulatedThinking = "";

  for (const act of activities) {
    if (act.type === "thinking") {
      accumulatedThinking += act.content ?? "";
    } else {
      if (accumulatedThinking) {
        items.push({ kind: "thinking", content: accumulatedThinking });
        accumulatedThinking = "";
      }
      if (act.type === "tool_use" || act.type === "tool_result") {
        items.push({ kind: "tool", activity: act });
      } else if (act.type === "status" && act.content) {
        items.push({ kind: "status", content: act.content });
      }
    }
  }

  if (accumulatedThinking) {
    items.push({ kind: "thinking", content: accumulatedThinking });
  }

  return (
    <div className="flex flex-col space-y-2 my-2">
      {items.map((item, idx) => {
        if (item.kind === "thinking") {
          return (
            <ThinkingCard
              key={`think-${idx}`}
              content={item.content}
              isLive={isLive && idx === items.length - 1}
            />
          );
        }
        if (item.kind === "tool") {
          return (
            <ToolCard
              key={`tool-${item.activity.id ?? idx}`}
              activity={item.activity}
              isLive={isLive && idx === items.length - 1}
            />
          );
        }
        if (item.kind === "status") {
          return (
            <div key={`stat-${idx}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
              <span className="size-1.5 rounded-full bg-brand" />
              <span>{item.content}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
