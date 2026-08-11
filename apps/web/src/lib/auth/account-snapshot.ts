/**
 * The parts of a Supabase user that cross the server -> client boundary.
 *
 * This lives in its own module with no "use client" directive because both
 * sides need it: the root layout (a Server Component) builds the snapshot so
 * the shell's first paint knows who is signed in, and the client auth listener
 * rebuilds it whenever the session changes. A function exported from a
 * "use client" module cannot be called on the server at all -- React replaces
 * it with a reference stub -- so the shared helper has to be neutral.
 */

export interface AccountSnapshot {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  /** "email", "github", "google" -- what they actually signed in with. */
  provider: string;
}

/** Narrow structural type so this module needn't import supabase-js. */
interface UserLike {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export function toSnapshot(user: UserLike): AccountSnapshot {
  const email = user.email ?? "";
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    email.split("@")[0] ||
    "Account";
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;
  const provider =
    typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "email";

  return { id: user.id, email, name, avatarUrl, provider };
}
