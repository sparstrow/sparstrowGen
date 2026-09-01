import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The outer tab strip from `DESIGN.md` §9.1 — "which entity's profile is
 * open," distinct from a profile's own side sub-nav. First rollout target is
 * Machines (§9.4); built generic here so Agents and Projects can reuse it
 * without a rewrite.
 *
 * Implements §9.3's accessibility contract from the first commit, not as a
 * follow-up: `role="tablist"`, `role="tab"` + `aria-selected` per tab, roving
 * `tabindex` with arrow-key/Home/End navigation, a keyboard path to close a
 * tab that isn't mouse-only, and an `aria-live` announcement whenever the
 * active tab changes.
 */
export interface EntityTab {
  id: string;
  label: string;
  /** Rendered before the label — typically a small status dot or icon. */
  indicator?: React.ReactNode;
  /** The "home" tab (e.g. the list view) is usually not closable. */
  closable?: boolean;
}

export function EntityTabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  className,
}: {
  tabs: EntityTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  className?: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const prevActiveRef = React.useRef(activeId);

  React.useEffect(() => {
    if (prevActiveRef.current === activeId) return;
    prevActiveRef.current = activeId;
    const tab = tabs.find((t) => t.id === activeId);
    if (tab) setAnnouncement(`${tab.label} tab, now active`);
  }, [activeId, tabs]);

  function focusTabAt(index: number) {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (!buttons || buttons.length === 0) return;
    const clamped = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons[clamped]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTabAt(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTabAt(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTabAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTabAt(tabs.length - 1);
    } else if ((e.key === "Delete" || e.key === "Backspace") && tabs[index]?.closable && onClose) {
      e.preventDefault();
      const closingActive = tabs[index].id === activeId;
      onClose(tabs[index].id);
      // Move focus to a neighbour so keyboard closing several tabs in a row
      // never drops focus back to the document body.
      if (closingActive) requestAnimationFrame(() => focusTabAt(Math.max(0, index - 1)));
    }
  }

  return (
    <div className={cn("flex items-stretch overflow-x-auto border-b border-border", className)}>
      <div role="tablist" aria-label="Open items" ref={listRef} className="flex items-stretch">
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={cn(
                "group flex items-center gap-2 border-r border-border px-3 py-2 text-sm transition-colors",
                selected ? "bg-background font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <button
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className="flex min-w-0 items-center gap-1.5 focus-visible:outline-none"
              >
                {tab.indicator}
                <span className="max-w-40 truncate">{tab.label}</span>
              </button>
              {tab.closable && onClose ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Close ${tab.label} tab`}
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.id);
                  }}
                  className="rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
