import type { RunEvent } from "@sparstrow/shared";

/**
 * Fetched events and live-delta events, merged into one `seq`-ordered,
 * deduped list.
 *
 * Extracted out of `run-detail.tsx` so it is testable without mounting a
 * component — `run-detail.tsx`'s `useMemo` just calls this.
 *
 * A live event wins on a collision. Not because it is more likely to be
 * right in general, but because `run_events` is keyed on `(run_id, seq)` — a
 * fetched row and a live delta reporting the SAME `seq` are the SAME event by
 * definition, so the only way their values could differ is a stale fetch
 * result racing a fresher live delta, and the live one is the newer of the
 * two by construction (map insertion order: fetched first, live second).
 */
export function mergeRunEvents(fetched: RunEvent[], live: RunEvent[]): RunEvent[] {
  const merged = new Map<number, RunEvent>();
  for (const e of fetched) merged.set(e.seq, e);
  for (const e of live) merged.set(e.seq, e);
  return [...merged.values()].sort((a, b) => a.seq - b.seq);
}
