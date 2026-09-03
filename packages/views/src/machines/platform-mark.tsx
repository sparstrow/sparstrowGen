import * as React from "react";
import { Monitor } from "lucide-react";

/**
 * A machine's OS as its own recognisable mark.
 *
 * `DESIGN.md` §6 names this exact gap and requires closing it: *"A machine's OS
 * (`win32` / `darwin` / `linux`) is the concrete case that exposed this gap:
 * rendering it as plain text next to the hostname works, but a reader scanning
 * a room of tiles has to read every row to tell them apart."*
 *
 * These are the sole permitted exception to the `lucide-react`-only rule —
 * externally-recognisable identities render as their own SVG. All three are
 * monochrome and use `currentColor`, so they follow the theme rather than
 * fixing a colour; Apple's brand guideline permits monochrome only, and
 * Microsoft's and Tux's marks carry no colour we would be entitled to invent.
 *
 * `Monitor` remains correct wherever no more specific mark exists — an OS
 * string we do not recognise is not a reason to guess.
 */

export type PlatformMarkProps = {
  /** `process.platform`: `win32` | `darwin` | `linux`, or anything else. */
  os: string | null | undefined;
  className?: string;
};

/**
 * `process.platform` first, loose matching only as a fallback.
 *
 * The exact values are checked before any `includes()`, and that ordering is
 * the whole point: **`"darwin".includes("win")` is true.** A substring test for
 * Windows silently claimed every Mac in the list, and it rendered as a Windows
 * logo next to a machine called "Studio" — which is exactly the kind of defect
 * that typechecks, passes review, and is obvious the first second anyone looks
 * at the screen. Found by looking at the screen.
 */
function normalise(os: string | null | undefined): "windows" | "apple" | "linux" | null {
  if (!os) return null;
  const value = os.trim().toLowerCase();

  // `process.platform`, which is what a daemon actually reports.
  if (value === "win32") return "windows";
  if (value === "darwin") return "apple";
  if (value === "linux") return "linux";

  // Anything else is a human-written or third-party string. Apple and Linux
  // are tested before Windows so a value containing "darwin" cannot be caught
  // by a "win" substring.
  if (/\b(darwin|mac ?os|macos|osx|ios|iphone|ipad)\b/.test(value)) return "apple";
  if (/\b(linux|ubuntu|debian|fedora|arch|nixos|alpine)\b/.test(value)) return "linux";
  if (/\bwin(dows|32|64|nt)?\b/.test(value)) return "windows";

  return null;
}

export function PlatformMark({ os, className }: PlatformMarkProps) {
  const platform = normalise(os);

  // `aria-hidden` throughout: the mark is a scanning aid beside a name that
  // already says which machine this is, so announcing "Windows logo" to a
  // screen reader adds noise, not information. `MachineRow` puts the OS into
  // the row's accessible name instead.
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  if (platform === "windows") {
    return (
      <svg {...common}>
        <path d="M3 5.6 10.2 4.6v6.9H3V5.6Zm0 12.8 7.2 1v-6.8H3v5.8Zm8 1.1L21 21V12.5h-10v7Zm0-15v7.0h10V3l-10 1.5Z" />
      </svg>
    );
  }

  if (platform === "apple") {
    return (
      <svg {...common}>
        <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6 0 0-2.5-1-2.5-3.6ZM14.2 5.9c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3Z" />
      </svg>
    );
  }

  if (platform === "linux") {
    return (
      <svg {...common}>
        <path d="M12 2c-2.2 0-3.6 1.8-3.6 4.2 0 1.3.2 2 .2 2.8 0 .9-.7 1.7-1.4 2.9C6.3 13.4 5.5 15 5.5 16.6c0 .8.2 1.4.6 1.8-.3.5-.5 1-.5 1.5 0 1.2 1.1 2.1 3 2.1 1.3 0 2.2-.4 2.7-1h1.4c.5.6 1.4 1 2.7 1 1.9 0 3-.9 3-2.1 0-.5-.2-1-.5-1.5.4-.4.6-1 .6-1.8 0-1.6-.8-3.2-1.7-4.7-.7-1.2-1.4-2-1.4-2.9 0-.8.2-1.5.2-2.8C15.6 3.8 14.2 2 12 2Zm-1.6 3.4c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1Zm3.2 0c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1ZM12 8.6c.9 0 1.9.5 1.9.9 0 .3-.3.5-.7.7-.4.2-.8.4-1.2.4s-.8-.2-1.2-.4c-.4-.2-.7-.4-.7-.7 0-.4 1-.9 1.9-.9Z" />
      </svg>
    );
  }

  return <Monitor className={className} aria-hidden focusable="false" />;
}

/** How to say this OS out loud, for a row's accessible name. */
export function platformLabel(os: string | null | undefined): string {
  switch (normalise(os)) {
    case "windows":
      return "Windows";
    case "apple":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return os || "Unknown OS";
  }
}
