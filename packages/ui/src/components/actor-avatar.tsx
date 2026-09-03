import { Bot, User } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * The six actor-identity roles of `DESIGN.md` §2.5. Hues 50/135/185/235/285/335
 * — 50° apart, and every one of them at least 20° from a status hue, so an
 * avatar can never read as a state it has nothing to do with (Identity Is Not
 * Status). The palette this replaced used emerald, amber, and rose: success,
 * warning, and danger.
 *
 * **A neutral fill with a coloured mark and ring, not a coloured fill.** The
 * doctrine originally specified an identity tint plus the colour's own
 * foreground; measured, that reaches only 3.91:1 in dark mode, because a 15%
 * tint lifts the ground by more than the mark gains. This form keeps both
 * signals — mark and ring — at 7.16:1 dark and 4.72:1 light. `DD-013`.
 */
const IDENTITY = [
  "text-identity-1 ring-identity-1/40",
  "text-identity-2 ring-identity-2/40",
  "text-identity-3 ring-identity-3/40",
  "text-identity-4 ring-identity-4/40",
  "text-identity-5 ring-identity-5/40",
  "text-identity-6 ring-identity-6/40",
];

/**
 * Stable name -> identity role. The hash is unchanged: an agent keeps the same
 * slot it has always had, so only the colour of that slot moved.
 */
function identity(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return IDENTITY[Math.abs(h) % IDENTITY.length]!;
}

const SIZES = {
  sm: "size-5 text-[9px]",
  md: "size-7 text-[11px]",
  lg: "size-9 text-xs",
} as const;

/**
 * Deterministic initials avatar for any actor (agent or the owner). Same name
 * always renders the same identity colour, so agents stay recognizable across
 * surfaces — and the colour is never a status colour, so it cannot be misread
 * as one.
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
        "inline-flex shrink-0 select-none items-center justify-center rounded-full",
        "bg-muted font-semibold uppercase ring-1 ring-inset",
        identity(name),
        SIZES[size],
        className,
      )}
      title={title ?? name}
    >
      {initials}
    </span>
  );
}
