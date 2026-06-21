import * as React from "react";
import type { RunEvent } from "@sparstrow/shared";
import { Bot, ChevronRight, Info, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCost } from "@/lib/format";

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

function blocksOf(payload: unknown): ContentBlock[] {
  const message = (payload as { message?: { content?: unknown } } | null)?.message;
  const content = message?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) return content as ContentBlock[];
  return [];
}

function Collapsible({
  icon,
  summary,
  detail,
}: {
  icon: React.ReactNode;
  summary: string;
  detail: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-md border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        {icon}
        <span className="truncate font-mono">{summary}</span>
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {detail}
        </pre>
      )}
    </div>
  );
}

function EventRow({ event }: { event: RunEvent }) {
  switch (event.type) {
    case "system": {
      const p = event.payload as { subtype?: string; model?: string } | null;
      if (p?.subtype !== "init") return null;
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3" />
          session started{p.model ? ` · ${p.model}` : ""}
        </div>
      );
    }
    case "assistant": {
      const blocks = blocksOf(event.payload);
      return (
        <div className="space-y-2">
          {blocks.map((block, i) => {
            if (block.type === "text" && block.text) {
              return (
                <div key={i} className="flex gap-2.5">
                  <Bot className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.text}</p>
                </div>
              );
            }
            if (block.type === "tool_use") {
              const input = JSON.stringify(block.input ?? {});
              return (
                <Collapsible
                  key={i}
                  icon={<Wrench className="size-3 shrink-0" />}
                  summary={`${block.name ?? "tool"}  ${input.slice(0, 120)}`}
                  detail={JSON.stringify(block.input ?? {}, null, 2)}
                />
              );
            }
            return null;
          })}
        </div>
      );
    }
    case "user": {
      const blocks = blocksOf(event.payload).filter((b) => b.type === "tool_result");
      if (blocks.length === 0) return null;
      return (
        <div className="space-y-1.5">
          {blocks.map((block, i) => {
            const text =
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content ?? "", null, 2);
            return (
              <Collapsible
                key={i}
                icon={<ChevronRight className="hidden" />}
                summary={`tool result · ${text.slice(0, 100).replace(/\s+/g, " ")}`}
                detail={text}
              />
            );
          })}
        </div>
      );
    }
    case "result": {
      const p = event.payload as {
        subtype?: string;
        total_cost_usd?: number;
        num_turns?: number;
      } | null;
      return (
        <div className="flex items-center gap-3 border-t pt-2 text-xs text-muted-foreground">
          <span>finished: {p?.subtype ?? "?"}</span>
          {typeof p?.num_turns === "number" && <span>{p.num_turns} turns</span>}
          {typeof p?.total_cost_usd === "number" && <span>{formatCost(p.total_cost_usd)}</span>}
        </div>
      );
    }
    case "stderr":
      return (
        <p className="font-mono text-[11px] leading-tight text-red-600/80 dark:text-red-400/70">
          {String(event.payload)}
        </p>
      );
    default:
      return null;
  }
}

export function RunTranscript({ events, live }: { events: RunEvent[]; live: boolean }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stickToBottom = React.useRef(true);

  React.useEffect(() => {
    const el = containerRef.current;
    if (el && live && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length, live]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {live ? "Waiting for output…" : "No transcript events."}
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="max-h-[60vh] space-y-3 overflow-y-auto rounded-md border p-4"
    >
      {events.map((event) => (
        <EventRow key={event.seq} event={event} />
      ))}
      {live && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-blue-500" />
          running…
        </div>
      )}
    </div>
  );
}
