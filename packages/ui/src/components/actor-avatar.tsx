import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function hue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

const SIZES = {
  sm: "size-5 text-[9px]",
  md: "size-7 text-[11px]",
  lg: "size-9 text-xs",
} as const;

/**
 * Deterministic initials avatar for any actor (agent or the owner). Same name
 * always renders the same tint, so agents stay recognizable across surfaces.
 */
export function ActorAvatar({
  name,
  kind = "agent",
  size = "md",
  className,
  title,
}: {
  name: string | null | undefined;
  kind?: "agent" | "user";
  size?: keyof typeof SIZES;
  className?: string;
  title?: string;
}) {
  if (!name) {
    const Icon = kind === "user" ? User : Bot;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
          SIZES[size],
          className,
        )}
        title={title}
      >
        <Icon className="size-[55%]" />
      </span>
    );
  }
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase ring-1 ring-inset ring-border",
        hue(name),
        SIZES[size],
        className,
      )}
      title={title ?? name}
    >
      {initials}
    </span>
  );
}
