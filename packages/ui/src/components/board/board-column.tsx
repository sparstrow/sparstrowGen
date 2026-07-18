import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const columnDropId = (status: string) => `col:${status}`;

/**
 * A droppable Kanban column. Cards inside participate in a per-column
 * SortableContext; dropping a card anywhere in the column (cards or empty
 * space) targets this column's status.
 */
export function BoardColumn({
  status,
  label,
  accent,
  count,
  itemIds,
  onAdd,
  children,
}: {
  status: string;
  label: string;
  accent: string;
  count: number;
  itemIds: string[];
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(status) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-48 flex-col rounded-xl border bg-muted/30 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("size-2 rounded-full", accent)} />
        <span className="text-xs font-semibold">{label}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            title={`New task in ${label}`}
            aria-label={`New task in ${label}`}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus:outline-none"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
      </SortableContext>
    </div>
  );
}
