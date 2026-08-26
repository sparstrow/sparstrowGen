import { randomBytes } from "node:crypto";

/**
 * Slug derivation, extracted from `api/handlers/workspace.ts` by `T-WA-01`.
 *
 * These two functions are pure and are needed by both the `/api/v1` handlers
 * and the Server Actions replacing their writes. Importing them from
 * `handlers/workspace.ts` would work and would be wrong: that module calls
 * `registerRoute()` at module scope, so a Server Action importing it pulls the
 * entire route registry into the action's module graph as a side effect.
 *
 * `handlers/workspace.ts` re-exports both, so every existing import site and
 * `workspace-routes.test.ts` are unaffected.
 */

/**
 * Derive a slug from a name.
 *
 * For a workspace this runs once in its lifetime and is then frozen forever,
 * so getting it wrong is not something a later edit repairs.
 */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      // Truncation can land mid-word and leave a trailing separator, which
      // `replace` above already ran and cannot catch.
      .replace(/-+$/g, "")
  );
}

/**
 * A second candidate for when the first collides, kept within the 40-character
 * budget. Random rather than a counter: a counter needs a read to know what
 * number it is on, and the read races the next caller.
 */
export function withCollisionSuffix(slug: string): string {
  return `${slug.slice(0, 35)}-${randomBytes(2).toString("hex")}`;
}
