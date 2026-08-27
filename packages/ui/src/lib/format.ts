export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(4)}`;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

/**
 * Coarse "how long ago" bucketing — minutes, then hours, then days. Started
 * life as `machines.tsx`'s local `relativeTime`; moved here by `T-M17-02` so
 * the Terminals page's "machine off, last seen …" wording is the SAME
 * function as the Machines page's, per the spec's "inherits that vocabulary
 * rather than inventing a second one."
 */
export function relativeTimeFromMs(ms: number): string {
  if (Number.isNaN(ms)) return "unknown";
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  return relativeTimeFromMs(ms);
}
