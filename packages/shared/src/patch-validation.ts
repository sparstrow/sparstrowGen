import { isOwnStorageUrl } from "./storage-url";

/**
 * Profile and workspace PATCH validation, extracted from
 * `api/handlers/profile.ts` and `api/handlers/workspace.ts` by `T-WA-08`.
 *
 * These four functions are pure and are needed by both the `/api/v1` GET
 * handlers (which keep them for their own tests) and the Server Actions
 * replacing the PATCH writes. Importing them from the handler files would
 * work and would be wrong: those modules call `registerRoute()` at module
 * scope, so a Server Action importing from them pulls the entire route
 * registry into the action's module graph as a side effect — the same
 * reasoning `lib/slug.ts` (`T-WA-01`) already applied to `slugify`.
 *
 * `handlers/profile.ts` and `handlers/workspace.ts` re-export everything
 * here, so every existing import site and their route tests are unaffected.
 */

// ─── profile ────────────────────────────────────────────────────────────────

/** What a caller may set on themselves. */
const PROFILE_EDITABLE = ["name", "bio", "avatar_url"] as const;

const PROFILE_MAX = { name: 60, bio: 2000 } as const;

/**
 * Refused with a reason rather than a generic "unknown field", because each of
 * these is a thing someone will reasonably try and the useful answer differs.
 */
const PROFILE_REFUSED: Record<string, string> = {
  email:
    "Changing your email is an auth flow with a confirmation loop, not a profile edit. It is not available yet.",
  password:
    "Changing your password is an auth flow, not a profile edit. It is not available yet.",
  role: "role is authorization data and is never settable by its own subject.",
  id: "id is not editable.",
};

export type ProfilePatch = Record<string, string | null>;

/**
 * Validate a PATCH body into the exact set of columns to write.
 *
 * Bodies arrive **snake-cased** — `toSnake` runs before either caller (the
 * route or the action) sees them, so the browser's `avatarUrl` is
 * `avatar_url` here.
 */
export function parseProfilePatch(
  body: unknown,
  storageBaseUrl: string,
): { error: string } | { patch: ProfilePatch } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be an object." };
  }

  const editable = new Set<string>(PROFILE_EDITABLE);
  const entries = Object.entries(body as Record<string, unknown>);

  for (const [key] of entries) {
    if (editable.has(key)) continue;
    // Read once rather than `key in PROFILE_REFUSED` then index again:
    // `packages/shared` typechecks under `noUncheckedIndexedAccess`, which the
    // web app's config did not enforce, and `in` does not narrow an index
    // access. Same behaviour, and it no longer looks the value up twice.
    const refusal = PROFILE_REFUSED[key];
    if (refusal !== undefined) return { error: refusal };
    return {
      error: `Not editable on a profile: ${key}. Editable fields are ${PROFILE_EDITABLE.join(", ")}.`,
    };
  }

  const patch: ProfilePatch = {};

  for (const [key, raw] of entries) {
    if (key === "avatar_url") {
      if (raw === null) {
        patch.avatar_url = null;
        continue;
      }
      if (typeof raw !== "string" || !isOwnStorageUrl(raw, storageBaseUrl)) {
        return {
          error:
            "avatar_url must be null, or an image uploaded to this workspace. " +
            "An arbitrary URL is not accepted.",
        };
      }
      patch.avatar_url = raw;
      continue;
    }

    if (typeof raw !== "string") {
      return { error: `${key} must be a string.` };
    }

    const value = raw.trim();
    const limit = PROFILE_MAX[key as keyof typeof PROFILE_MAX];
    if (value.length > limit) {
      return { error: `${key} must be ${limit} characters or fewer (got ${value.length}).` };
    }

    // Empty is a legitimate value, not a missing one -- T-M9-01 makes '' the
    // starting state, so an API that refused it would be refusing to write
    // what its own database holds.
    patch[key] = value;
  }

  return { patch };
}

// ─── workspace ──────────────────────────────────────────────────────────────

/** What a caller may set. Everything else in the row is derived or immutable. */
const WORKSPACE_EDITABLE = ["name", "description", "context", "logo_url"] as const;

/**
 * Accepted and dropped rather than rejected. `slug` is *returned* by GET, and
 * a client that hands the whole object back is a normal thing to write.
 */
const WORKSPACE_IGNORED = ["slug"] as const;

const WORKSPACE_MAX = { name: 60, description: 280, context: 4000 } as const;

/** Exactly what `bootstrap_workspace` writes: `personal-` + 8 lowercase hex. */
export const BOOTSTRAP_SLUG = /^personal-[0-9a-f]{8}$/;

export type WorkspacePatch = Record<string, string | null>;

/**
 * Validate a PATCH body into the exact set of columns to write.
 *
 * Bodies arrive **snake-cased** — `toSnake` runs before either caller sees
 * them, so the browser's `logoUrl` is `logo_url` here.
 */
export function parseWorkspacePatch(
  body: unknown,
  storageBaseUrl: string,
): { error: string } | { patch: WorkspacePatch } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be an object." };
  }

  const editable = new Set<string>(WORKSPACE_EDITABLE);
  const ignored = new Set<string>(WORKSPACE_IGNORED);
  const entries = Object.entries(body as Record<string, unknown>);

  // Named, not counted. "Unknown field" sends someone hunting; "owner_id is
  // not editable" ends the question.
  const unknown = entries
    .map(([key]) => key)
    .filter((key) => !editable.has(key) && !ignored.has(key));
  if (unknown.length > 0) {
    return {
      error: `Not editable on a workspace: ${unknown.join(", ")}. Editable fields are ${WORKSPACE_EDITABLE.join(", ")}.`,
    };
  }

  const patch: WorkspacePatch = {};

  for (const [key, raw] of entries) {
    if (!editable.has(key)) continue;

    if (key === "logo_url") {
      if (raw === null) {
        patch.logo_url = null;
        continue;
      }
      if (typeof raw !== "string" || !isOwnStorageUrl(raw, storageBaseUrl)) {
        return {
          error:
            "logo_url must be null, or an image uploaded to this workspace. " +
            "An arbitrary URL is not accepted.",
        };
      }
      patch.logo_url = raw;
      continue;
    }

    if (typeof raw !== "string") {
      return { error: `${key} must be a string.` };
    }

    const value = raw.trim();
    const limit = WORKSPACE_MAX[key as keyof typeof WORKSPACE_MAX];
    if (value.length > limit) {
      return { error: `${key} must be ${limit} characters or fewer (got ${value.length}).` };
    }

    // An empty name is a legitimate value, not a missing one -- see
    // `parseProfilePatch`'s comment on the same rule.
    patch[key] = value;
  }

  return { patch };
}
