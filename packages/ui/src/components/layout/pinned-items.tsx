import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bot, FolderKanban, GripVertical, Pin, Play, Users, X } from "lucide-react";
import { usePins, type PinnedItem } from "@/lib/pins";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<PinnedItem["kind"], typeof Pin> = {
  project: FolderKanban,
  run: Play,
  team: Users,
  agent: Bot,
  page: Pin,
};

function SortablePin({ item }: { item: PinnedItem }) {
  const unpin = usePins((s) => s.unpin);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.key });
  const Icon = KIND_ICONS[item.kind];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-sidebar-accent/60",
        isDragging && "z-10 bg-sidebar-accent opacity-80 shadow-sm",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity focus:outline-none group-hover:opacity-100 active:cursor-grabbing"
        aria-label={`Reorder ${item.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Link
        to={item.to}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-sidebar-accent-foreground"
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:outline-none group-hover:opacity-100"
        aria-label={`Unpin ${item.label}`}
        onClick={() => unpin(item.key)}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/**
 * Pinned quick-access links in the sidebar. Pins are added from entity rows
 * (projects, runs, …) and reordered here by drag-and-drop; the order persists
 * in localStorage.
 */
export function PinnedItems({ collapsed = false }: { collapsed?: boolean }) {
  const pins = usePins((s) => s.pins);
  const reorder = usePins((s) => s.reorder);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) reorder(String(active.id), String(over.id));
  };

  // Icon rail: pins stay reachable as icon-only links; reordering needs the
  // expanded sidebar.
  if (collapsed) {
    if (pins.length === 0) return null;
    return (
      <div className="space-y-0.5 px-2 pt-3">
        {pins.map((p) => {
          const Icon = KIND_ICONS[p.kind];
          return (
            <Link
              key={p.key}
              to={p.to}
              title={p.label}
              className="flex items-center justify-center rounded-md py-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <Icon className="size-4" />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="px-2 pt-3">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Pinned
      </p>
      {pins.length === 0 ? (
        <p className="px-3 pb-1 text-[11px] leading-relaxed text-muted-foreground/60">
          Pin projects or runs from their pages for quick access.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pins.map((p) => p.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {pins.map((p) => (
                <SortablePin key={p.key} item={p} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
