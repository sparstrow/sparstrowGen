import { registerRoute, ok, fail, HandlerContext } from "../router";
import { isOwnStorageUrl } from "../storage-url";

/**
 * M9 — the profile as something a person fills in.
 *
 * Singular and id-less, like `/workspace` and for the same reason (M9
 * decision 1): the caller is exactly one user, resolved from the session.
 *
 * **This endpoint serves the form, not the shell.** The sidebar keeps reading
 * the session snapshot (`account-snapshot.ts`), which is server-rendered into
 * the first paint to avoid a hydration mismatch. The two do not compete: one
 * shows a name, the other edits three fields. `bio` is deliberately absent from
 * the session metadata (plan decision 9) — the shell never renders it and it
 * would ride along on every request — so the form has nowhere but here to read
 * it from.
 */

/** What a caller may set on themselves. */
const EDITABLE = ["name", "bio", "avatar_url"] as const;

const MAX = { name: 60, bio: 2000 } as const;

/** Everything GET returns and PATCH echoes back. `role` is deliberately absent. */
const SELECT = "id, email, name, avatar_url, bio";

/**
 * Refused with a reason rather than a generic "unknown field", because each of
 * these is a thing someone will reasonably try and the useful answer differs.
 */
const REFUSED: Record<string, string> = {
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
 * Exported for its tests, the same shape `parseWorkspacePatch` uses. Bodies
 * arrive **snake-cased** — `parseBody` → `toSnake` runs before any handler sees
 * them, so the browser's `avatarUrl` is `avatar_url` here.
 */
export function parseProfilePatch(body: unknown): { error: string } | { patch: ProfilePatch } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be an object." };
  }

  const editable = new Set<string>(EDITABLE);
  const entries = Object.entries(body as Record<string, unknown>);

  for (const [key] of entries) {
    if (editable.has(key)) continue;
    if (key in REFUSED) return { error: REFUSED[key] };
    return {
      error: `Not editable on a profile: ${key}. Editable fields are ${EDITABLE.join(", ")}.`,
    };
  }

  const patch: ProfilePatch = {};

  for (const [key, raw] of entries) {
    if (key === "avatar_url") {
      if (raw === null) {
        patch.avatar_url = null;
        continue;
      }
      if (typeof raw !== "string" || !isOwnStorageUrl(raw)) {
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
    const limit = MAX[key as keyof typeof MAX];
    if (value.length > limit) {
      return { error: `${key} must be ${limit} characters or fewer (got ${value.length}).` };
    }

    // Empty is a legitimate value, not a missing one -- same reasoning as
    // T-M9-02. T-M9-01 makes '' the starting state, so an API that refused it
    // would be refusing to write what its own database holds.
    patch[key] = value;
  }

  return { patch };
}

registerRoute({
  method: "GET",
  pattern: "/me",
  handler: async ({ supabase }: HandlerContext) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail(401, "not authenticated");

    const { data, error } = await supabase
      .from("users")
      .select(SELECT)
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    // bootstrap_workspace inserts this row on the first authenticated request,
    // so its absence means something upstream failed rather than "new user".
    if (!data) return fail(404, "Not Found");
    return ok(data);
  },
});

registerRoute({
  method: "PATCH",
  pattern: "/me",
  handler: async ({ supabase, body }: HandlerContext) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail(401, "not authenticated");

    const parsed = parseProfilePatch(body);
    if ("error" in parsed) return fail(400, parsed.error);
    const { patch } = parsed;

    if (Object.keys(patch).length === 0) {
      return fail(400, `Nothing to update. Editable fields are ${EDITABLE.join(", ")}.`);
    }

    // ── Store 1: the session's metadata, which is what the shell reads ───────
    //
    // Only the two fields the shell actually renders. `bio` stays out
    // deliberately (plan decision 9). GoTrue merges the keys given into the
    // existing raw_user_meta_data rather than replacing it, so a PATCH carrying
    // only `name` leaves an existing avatar alone.
    const metadata: Record<string, string | null> = {};
    if ("name" in patch) {
      // Both keys. `bootstrap_workspace` reads full_name first and name second,
      // so writing both means a future bootstrap finds the chosen name rather
      // than falling through to ''.
      metadata.full_name = patch.name;
      metadata.name = patch.name;
    }
    if ("avatar_url" in patch) metadata.avatar_url = patch.avatar_url;

    if (Object.keys(metadata).length > 0) {
      // Auth first, then the row. If the row update then fails, the handler
      // throws and the caller sees an error -- a half-applied change is visible.
      // Reversed, a failing auth update after a successful row update would
      // leave the shell showing the old value with no error at all, which reads
      // as "the save didn't work" and is much harder to diagnose.
      //
      // The two writes cannot share a transaction: updateUser goes through
      // GoTrue, not PostgREST. The window is narrow and recovery is "press save
      // again", which the UI can offer precisely because this reports the error
      // rather than swallowing it. A trigger mirroring auth.users into
      // public.users was rejected -- this repo has already had one incident
      // caused by an auth.users trigger nobody remembered (SEC-2026-08-16).
      const { error: authError } = await supabase.auth.updateUser({ data: metadata });
      if (authError) throw authError;
    }

    // ── Store 2: the public.users row, which the cloud schema joins on ───────
    //
    // public.users is not auth.users. They share an id and nothing else;
    // updating only one produces a change that works everywhere except the
    // sidebar, or everywhere except the rest of the schema.
    const { data, error } = await supabase
      .from("users")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select(SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(404, "Not Found");
    return ok(data);
  },
});
