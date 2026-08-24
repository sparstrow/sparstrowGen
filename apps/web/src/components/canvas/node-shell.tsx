import * as React from "react";
import { Handle, Position } from "@xyflow/react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared canvas node primitives (design rule 15: one canvas, one node family,
 * one status vocabulary). Both P6's `StatusNode` (run status ring + drill-in)
 * and P10's `EditableStepNode` (same shell + form affordances) are built from
 * these — so there is exactly one card shell, one handle style, one agent chip,
 * and one set of semantic status tokens. No new hues without amending the table.
 */

/** The locked semantic status table (P1). Every canvas node maps onto this. */
export type NodeSemanticStatus =
  | "pending"
  | "ready"
  | "running"
  | "attention"
  | "approval"
  | "done"
  | "failed"
  | "skipped";

/** Border/ring treatment per semantic status. */
export const SEMANTIC_RING: Record<NodeSemanticStatus, string> = {
  pending: "border-muted-foreground/30 border-dashed",
  ready: "border-muted-foreground/50",
  running: "border-primary ring-2 ring-primary/30 animate-pulse",
  attention: "border-warning ring-2 ring-warning/30",
  approval: "border-approval ring-2 ring-approval/30",
  done: "border-success ring-2 ring-success/40 shadow-[0_0_14px_color-mix(in_oklab,var(--success)_35%,transparent)]",
  failed: "border-destructive ring-2 ring-destructive/30",
  skipped: "border-muted-foreground/20 opacity-50",
};

/** Status dot fill per semantic status. */
export const SEMANTIC_DOT: Record<NodeSemanticStatus, string> = {
  pending: "bg-muted-foreground/40",
  ready: "bg-muted-foreground",
  running: "bg-primary",
  attention: "bg-warning",
  approval: "bg-approval",
  done: "bg-success",
  failed: "bg-destructive",
  skipped: "bg-muted-foreground/30",
};

/**
 * The node card shell: fixed-width rounded card with left (target) / right
 * (source) handles and the semantic ring. Consumers pass a `status` from the
 * locked table (not a raw color) so no node can invent a hue outside rule 15.
 * `connectable` defaults off — the P6 graph is read-only and P10 pipelines are
 * linear (edges derive from order), so neither draws edges by hand.
 */
export function NodeShell({
  status,
  title,
  connectable = false,
  className,
  children,
}: {
  status: NodeSemanticStatus;
  title?: string;
  connectable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-56 rounded-xl border-2 bg-background p-3 text-left shadow-sm transition-colors",
        SEMANTIC_RING[status],
        className,
      )}
      title={title}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={connectable}
        className="!size-2 !border-0 !bg-muted-foreground/50"
      />
      {children}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={connectable}
        className="!size-2 !border-0 !bg-muted-foreground/50"
      />
    </div>
  );
}

/** The one agent chip used across every node family member. */
export function NodeAgentChip({ name, className }: { name: string; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground",
        className,
      )}
    >
      <Bot className="size-2.5 shrink-0" />
      <span className="truncate">{name}</span>
    </p>
  );
}
