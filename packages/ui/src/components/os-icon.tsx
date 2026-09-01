import { Monitor } from "lucide-react";
import { siApple, siLinux } from "simple-icons";
import { cn } from "@/lib/utils";

/**
 * `runtime.os` -> a small inline OS mark, rendered next to the plain
 * `win32`/`darwin`/`linux` text. Apple stays `currentColor` (monochrome,
 * matches the surrounding text) since it sits inline rather than in a
 * badge; Linux keeps its real hex — Tux is recognizable specifically as
 * yellow. `win32` has no counterpart: Microsoft Windows has no entry in
 * simple-icons at all (not merely unlicensed there), so it falls back to a
 * neutral monitor glyph rather than an improvised recreation of the flag
 * mark. See `design-system/DECISIONS.md` DD-017.
 */
export function OsIcon({ os, size = 12, className }: { os: string; size?: number; className?: string }) {
  if (os === "darwin") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn("shrink-0", className)}
        aria-hidden="true"
      >
        <path d={siApple.path} />
      </svg>
    );
  }
  if (os === "linux") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={`#${siLinux.hex}`}
        className={cn("shrink-0", className)}
        aria-hidden="true"
      >
        <path d={siLinux.path} />
      </svg>
    );
  }
  return <Monitor className={cn("shrink-0", className)} style={{ width: size, height: size }} aria-hidden="true" />;
}
