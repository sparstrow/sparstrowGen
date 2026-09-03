import * as React from "react";
import { cn } from "@sparstrow/ui/lib/utils";

/**
 * The entity tile.
 *
 * `DESIGN.md` §6 calls this *"the single most important visual pattern in the
 * app"*: a 32px rounded-square tile on `--accent` holding a 16px semantic icon,
 * with a 9px status dot overlapping the lower-left corner, ringed 2px in the
 * parent surface colour. It exists so an entity's identity and its state are
 * both readable in one glance, without reading a word.
 *
 * Generic over the entity on purpose — a machine, an agent and a team are all
 * this shape, and three near-copies would drift. The icon is passed in because
 * §6's other rule applies here: *when the entity has a more specific identity
 * than its category, the tile's icon is that identity's own mark* (a machine
 * shows its platform, not `Monitor`).
 *
 * `ringClassName` is not decoration. The dot's ring must match the colour of
 * the surface the tile sits on, or it reads as a coloured halo instead of as a
 * cut-out; a tile inside a `--card` needs `ring-card`, one on the page
 * background needs `ring-background`.
 */

export type EntityStatus = "success" | "warning" | "danger" | "info" | "neutral";

const DOT_COLOUR: Record<EntityStatus, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

export type EntityTileProps = {
  /** The 16px mark. Rendered inside the tile; sizing is applied here. */
  children: React.ReactNode;
  status?: EntityStatus;
  /**
   * What the status means, in words. Required whenever `status` is set: a
   * colour alone is not an accessible state indicator, and `DESIGN.md` §9.3
   * makes accessibility mandatory rather than a follow-up pass.
   */
  statusLabel?: string;
  /** Match the surface the tile sits on, e.g. `ring-card`. */
  ringClassName?: string;
  className?: string;
};

export function EntityTile({
  children,
  status,
  statusLabel,
  ringClassName = "ring-background",
  className,
}: EntityTileProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-md bg-accent text-muted-foreground",
          "[&>svg]:size-4",
        )}
      >
        {children}
      </div>
      {status ? (
        <>
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-0.5 -left-0.5 size-[9px] rounded-full ring-2",
              DOT_COLOUR[status],
              ringClassName,
              // `DESIGN.md` §7: a status change is a 140ms state change, and
              // nothing else here moves.
              "transition-colors duration-140",
            )}
          />
          {statusLabel ? <span className="sr-only">{statusLabel}</span> : null}
        </>
      ) : null}
    </div>
  );
}
