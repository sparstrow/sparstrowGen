/**
 * T-M10-01 — the setup guide's step derivation.
 *
 * A pure function, deliberately: `packages/ui` has no jsdom (`G-13`), so this
 * is the only layer of the guide provable without a renderer, and the whole
 * point of the guide is that it stores nothing (plan decision 5) — a function
 * of the profile, workspace and machine data the app already has, called
 * fresh on every read. It takes no hooks and does no I/O.
 *
 * **The three rules are a plain emptiness check, not a heuristic.** An earlier
 * draft compared a name against the signed-in email's local part; spec
 * decision 6 replaced that guess with a fact, because `T-M9-01` removed the
 * two places the database was inventing a name. After that migration, an
 * empty name means exactly one thing — nobody has typed one yet — so
 * `name.trim().length > 0` is the whole rule. Reintroducing any comparison
 * against an email here puts the guess back in a new place.
 */

export type StepState = "done" | "current" | "todo" | "unknown";
export type StepId = "profile" | "workspace" | "machine";

export interface SetupStep {
  id: StepId;
  state: StepState;
}

export interface SetupInput {
  /** From useProfile(). `undefined` = loading, `null` = the query failed. */
  profile: { name: string } | null | undefined;
  /** From useWorkspace(). Same convention. */
  workspace: { name: string } | null | undefined;
  /** From useRuntimes(). Same convention. */
  machines: { id: string }[] | null | undefined;
}

const STEP_ORDER: StepId[] = ["profile", "workspace", "machine"];

/**
 * Three buckets, not four: `StepState` has no "loading" value, and a step
 * that is still loading is simply not yet known to be done — the same
 * position as one that resolved to an empty name. Both are eligible to become
 * `current`; only a genuinely `unknown` (failed) step is excluded. `undefined`
 * and `null` must never collapse into each other on the way in, though: a
 * caller that does `profile ?? fallback` produces a guide that either shows
 * "couldn't check this" on every page load, or silently treats a failed query
 * as unfinished work.
 */
type Bucket = "done" | "unknown" | "pending";

function bucket(value: unknown, isDone: boolean): Bucket {
  if (value === null) return "unknown";
  if (value === undefined) return "pending";
  return isDone ? "done" : "pending";
}

export function setupSteps(input: SetupInput): SetupStep[] {
  const buckets: Record<StepId, Bucket> = {
    profile: bucket(input.profile, (input.profile?.name ?? "").trim().length > 0),
    workspace: bucket(input.workspace, (input.workspace?.name ?? "").trim().length > 0),
    // Pairing, not reachability — a machine that paired and is currently
    // switched off has completed this step. Requiring it to be online would
    // make the guide flicker every time a laptop sleeps.
    machine: bucket(input.machines, (input.machines?.length ?? 0) > 0),
  };

  // Exactly one step is `current`: the first, in order, still `pending`.
  // `unknown` steps are skipped rather than treated as a stop sign — a
  // workspace query that failed must not stall the guide on a step it cannot
  // read when the machine step is genuinely undone.
  const currentId = STEP_ORDER.find((id) => buckets[id] === "pending");

  return STEP_ORDER.map((id) => {
    const b = buckets[id];
    if (b === "done") return { id, state: "done" };
    if (b === "unknown") return { id, state: "unknown" };
    return { id, state: id === currentId ? "current" : "todo" };
  });
}

/** True only when every step is `done`. `unknown` or still-loading anywhere means not complete. */
export function isSetupComplete(steps: SetupStep[]): boolean {
  return steps.every((step) => step.state === "done");
}
