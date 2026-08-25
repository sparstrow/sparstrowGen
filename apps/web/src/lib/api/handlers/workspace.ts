import type { SupabaseClient } from "@supabase/supabase-js";
import { registerRoute, ok, fail, HandlerContext } from "../router";
import { isOwnStorageUrl } from "../storage-url";

/**
 * M9 — the workspace as something an owner fills in.
 *
 * Before this, `/api/v1` had 16 handler modules and not one of them touched the
 * `workspaces` table: the workspace id was *resolved* per request by
 * `getActiveWorkspaceId` and used as a filter, and the row itself was never
 * read back or written.
 *
 * Singular and id-less, per M9 decision 1. The caller has exactly one active
 * workspace, resolved and authorized server-side before this handler runs. A
 * `/workspaces/:id` shape would invite passing an id the server then has to
 * re-authorize, for a product that has no workspace picker and whose
 * multiple-workspace branch is a deliberate 400 (`D-7`).
 */

/** What a caller may set. Everything else in the row is derived or immutable. */
const EDITABLE = ["name", "description", "context", "logo_url"] as const;

/**
 * Accepted and dropped rather than rejected. `slug` is *returned* by GET, and
 * a client that hands the whole object back is a normal thing to write — see
 * "the slug moves once" below for why it is nonetheless not settable.
 */
const IGNORED = ["slug"] as const;

/**
 * Enforced here rather than as a column CHECK. A constraint violation arrives
 * as a SQLSTATE the API layer would have to translate into readable prose
 * anyway, and it would do it without knowing which field overflowed.
 */
const MAX = { name: 60, description: 280, context: 4000 } as const;

/** Exactly what `bootstrap_workspace` writes: `personal-` + 8 lowercase hex. */
const BOOTSTRAP_SLUG = /^personal-[0-9a-f]{8}$/;

/** Every column GET returns and PATCH echoes back. `owner_id` is deliberately absent. */
const SELECT = "id, name, slug, description, context, logo_url, created_at";

export type WorkspacePatch = Record<string, string | null>;

/**
 * Slug helpers now live in `lib/slug.ts` and are re-exported here so every
 * existing import site and `workspace-routes.test.ts` are unaffected.
 *
 * Moved by `T-WA-01`: this module calls `registerRoute()` at module scope, so
 * a Server Action importing `slugify` from here would pull the whole route
 * registry into the action's module graph as a side effect.
 */
export { slugify, withCollisionSuffix } from "../../slug";
import { slugify, withCollisionSuffix } from "../../slug";

/**
 * Validate a PATCH body into the exact set of columns to write.
 *
 * Exported so the rules are testable without a Supabase session, which is the
 * same shape `enqueueFailureFrom` uses in `../enqueue.ts`.
 *
 * Bodies arrive **snake-cased** — `parseBody` → `toSnake` runs in the route
 * before any handler sees them, so the browser's `logoUrl` is `logo_url` here.
 */
export function parseWorkspacePatch(
  body: unknown,
): { error: string } | { patch: WorkspacePatch } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be an object." };
  }

  const editable = new Set<string>(EDITABLE);
  const ignored = new Set<string>(IGNORED);
  const entries = Object.entries(body as Record<string, unknown>);

  // Named, not counted. "Unknown field" sends someone hunting; "owner_id is not
  // editable" ends the question. Silently dropping them is worse than either:
  // that is how an afternoon goes into a field that was never wired up.
  const unknown = entries
    .map(([key]) => key)
    .filter((key) => !editable.has(key) && !ignored.has(key));
  if (unknown.length > 0) {
    return {
      error: `Not editable on a workspace: ${unknown.join(", ")}. Editable fields are ${EDITABLE.join(", ")}.`,
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
      if (typeof raw !== "string" || !isOwnStorageUrl(raw)) {
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
    const limit = MAX[key as keyof typeof MAX];
    if (value.length > limit) {
      return { error: `${key} must be ${limit} characters or fewer (got ${value.length}).` };
    }

    // An empty name is a legitimate value, not a missing one. T-M9-01 makes ''
    // the starting state, so an API that refused it would be refusing to write
    // what its own database already holds -- and "clear this and think about it
    // later" would be impossible. The *setup step* is what reads empty as
    // not-done; that is a UI reading of the data, not a constraint on it.
    patch[key] = value;
  }

  return { patch };
}

registerRoute({
  method: "GET",
  pattern: "/workspace",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("workspaces")
      .select(SELECT)
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(404, "Not Found");
    return ok(data);
  },
});

/**
 * Write the patch, moving the slug with it if a slug was derived.
 *
 * `workspaces.slug` is `not null unique`, so the derived value can collide with
 * another workspace's. One retry with a random suffix, then **give up on the
 * slug and apply the name anyway**: the name is what the owner asked for, and
 * failing their edit over a machine identifier they cannot see would be
 * incomprehensible from the outside.
 */
async function writeWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  patch: WorkspacePatch,
  slug: string | undefined,
) {
  const attempts: WorkspacePatch[] =
    slug === undefined
      ? [patch]
      : [{ ...patch, slug }, { ...patch, slug: withCollisionSuffix(slug) }, patch];

  for (let i = 0; i < attempts.length; i++) {
    const { data, error } = await supabase
      .from("workspaces")
      .update(attempts[i])
      .eq("id", workspaceId)
      .select(SELECT)
      .maybeSingle();

    if (error) {
      if (error.code === "23505" && i < attempts.length - 1) continue;
      throw error;
    }

    // `.select()` after the update is what makes a no-op distinguishable from a
    // success. A filtered update that matches nothing affects zero rows and
    // would otherwise report 200 -- the false-success M2 found across eleven
    // handlers.
    if (!data) return fail(404, "Not Found");
    return ok(data);
  }

  // Unreachable: the last attempt carries no slug, so it cannot raise 23505.
  return fail(500, "Internal Server Error");
}

registerRoute({
  method: "PATCH",
  pattern: "/workspace",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const parsed = parseWorkspacePatch(body);
    if ("error" in parsed) return fail(400, parsed.error);
    const { patch } = parsed;

    if (Object.keys(patch).length === 0) {
      return fail(400, `Nothing to update. Editable fields are ${EDITABLE.join(", ")}.`);
    }

    // The slug moves exactly once in a workspace's life: when it gains its first
    // real name, while it still carries the one bootstrap generated. After that
    // it is frozen (plan decision 8, FR-022) -- it may already be in a link
    // someone saved, and a name is renamed far more casually than an address
    // should move.
    //
    // This needs a read first: a single UPDATE cannot express "set this only if
    // the current value still looks like X".
    let slug: string | undefined;
    if (typeof patch.name === "string" && patch.name !== "") {
      const { data: current, error: readError } = await supabase
        .from("workspaces")
        .select("slug")
        .eq("id", workspaceId)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) return fail(404, "Not Found");

      // The full anchored pattern, not /^personal-/. A workspace deliberately
      // slugged `personal-notes` has been named by a human, and a loose prefix
      // test would silently rewrite it.
      if (BOOTSTRAP_SLUG.test(current.slug as string)) {
        // A name of only punctuation, or entirely in a non-Latin script,
        // slugifies to nothing. Keep the existing slug rather than writing ''
        // into a not-null unique column.
        const derived = slugify(patch.name);
        if (derived) slug = derived;
      }
    }

    return writeWorkspace(supabase, workspaceId, patch, slug);
  },
});
