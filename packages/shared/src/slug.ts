/**
 * Slug derivation, extracted from `api/handlers/workspace.ts` by `T-WA-01`.
 *
 * These two functions are pure and are needed by both the `/api/v1` handlers
 * and the Server Actions replacing their writes. Importing them from
 * `handlers/workspace.ts` would work and would be wrong: that module calls
 * `registerRoute()` at module scope, so a Server Action importing it pulls the
 * entire route registry into the action's module graph as a side effect.
 *
 * ⚠️ **Renamed `slugify` -> `slugifyShort` by restructure Phase 1, and the
 * rename is the point.** Moving this file into `@sparstrow/shared` put it in
 * the same namespace as `schemas/common.ts`'s `slugify` for the first time, and
 * they are NOT the same function: that one truncates at 80 characters and can
 * leave a trailing `-`; this one truncates at 40 and cleans up after itself.
 *
 * They have been silently disagreeing about `projects.slug` — `routes/handlers/
 * projects.ts` derives it with this one, `src/api/routes/projects.ts` with the
 * other — so the same project gets a different slug depending on which path
 * created it. That is [`G-62`](../../../doc/KnownGaps.md); neither behaviour was
 * changed here, because picking a winner changes slugs that are already written
 * and already in URLs.
 */

/**
 * Derive a slug from a name.
 *
 * For a workspace this runs once in its lifetime and is then frozen forever,
 * so getting it wrong is not something a later edit repairs.
 */
export function slugifyShort(name: string): string {
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
  // Web Crypto, not `node:crypto`. This module moved into `@sparstrow/shared`
  // in restructure Phase 1, and that package's barrel is imported by browser
  // code — a `node:` builtin at the top of it is a bundler failure waiting for
  // whichever client imports it first. `crypto.getRandomValues` is the same
  // CSPRNG and exists in Node 18+, every browser, and React Native.
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${slug.slice(0, 35)}-${hex}`;
}
