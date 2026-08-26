/**
 * Subject: the thing being permitted. An agent today; a person later; a machine where it acts on its own behalf.
 */
export type Subject =
  | { kind: "agent"; id: string }
  | { kind: "person"; id: string }
  | { kind: "machine"; id: string };

/**
 * Level of access: how far a subject may go with something — from see it, through use it, to change its settings, to control who else may. The same ladder for every kind of thing, so it is learned once.
 */
export type AccessLevel = "see" | "use" | "configure" | "administer";

/**
 * Scope: the thing being permitted about — the whole workspace, one project, one machine, one agent, one run.
 */
export type Scope =
  | { kind: "workspace" }
  | { kind: "project"; id: string }
  | { kind: "machine"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "run"; id: string };

/**
 * A rule: one statement joining those three, set at a level, attributed to wherever it was set.
 */
export type AccessRule = {
  subject: Subject;
  level: AccessLevel;
  scope: Scope;
};

/**
 * The resolved answer: what all applicable rules add up to for a given subject in a given scope, at a given moment. This is what the owner reads and what the system enforces; it is not itself something anyone sets.
 */
export type ResolvedAccess = {
  subject: Subject;
  scope: Scope;
  level: AccessLevel;
};

export function atLeast(held: AccessLevel, required: AccessLevel): boolean {
  const levels = ["see", "use", "configure", "administer"];
  return levels.indexOf(held) >= levels.indexOf(required);
}
