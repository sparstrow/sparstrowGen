import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

/**
 * A draggable Kanban card. Dragging is pointer-distance activated so a plain
 * click still opens the detail dialog; `disabled` pins machine-managed tasks
 * (escalation states) in place.
 */
export function BoardCard({
  id,
  disabled = false,
  onClick,
  children,
}: {
  id: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-20 opacity-60")}
      {...attributes}
      {...listeners}
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full rounded-lg border bg-background p-2.5 text-left shadow-sm transition-colors hover:border-primary/40",
          !disabled && "cursor-grab active:cursor-grabbing",
          isDragging && "border-primary/60 shadow-md",
        )}
      >
        {children}
      </button>
    </div>
  );
}
