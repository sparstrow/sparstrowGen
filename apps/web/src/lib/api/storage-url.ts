import { supabaseUrl } from "@web/utils/supabase/env";

/**
 * Is this a URL that *this project's* Supabase Storage produced?
 *
 * `users.avatar_url` and `workspaces.logo_url` are rendered in an `<img>` for
 * every member of a workspace. A column that accepts an arbitrary URL is
 * therefore a stored tracking pixel at minimum: set it to
 * `https://evil.example/x.png` and every colleague's browser announces itself
 * to that host on every page load, with a referer and an IP, forever, and no
 * one can see why. Neither field is ever *meant* to hold a foreign URL — the
 * only legitimate writer is the upload in `T-M9-04` — so the check is an
 * allowlist of exactly one origin and one path prefix rather than a blocklist
 * of bad ones.
 *
 * This lives in its own module, against M9 decision 3's "validation is inline
 * and shared with nothing", for one specific reason: it is a **security** check
 * with three consumers (`PATCH /workspace`, `PATCH /me`, and the upload
 * component's own assertion). Decision 3 forbids a generic validator for the
 * six ordinary fields, and that still holds — those are all inline. Two
 * hand-copied origin checks would drift, and the direction they drift in is
 * "accepts more".
 */

/**
 * The single bucket `T-M9-04` creates. Named here, not just in the policy file,
 * because a URL under a *different* bucket of this same project would pass an
 * origin-only check — and that bucket might not have the write policies this
 * one does.
 */
export const PUBLIC_IMAGE_BUCKET = "public-images";

/** How Supabase Storage serves a public object. */
const PUBLIC_OBJECT_PREFIX = `/storage/v1/object/public/${PUBLIC_IMAGE_BUCKET}/`;

export function isOwnStorageUrl(value: string): boolean {
  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    // Not a URL at all — a relative path, a `javascript:` fragment, or noise.
    return false;
  }

  // Deliberately NOT wrapped in try/catch. A missing NEXT_PUBLIC_SUPABASE_URL
  // is a deployment fault and throws a MissingConfigError that becomes a 500;
  // swallowing it here would report "that image URL is invalid" to someone
  // whose URL was fine, and hide the real problem.
  const expected = new URL(supabaseUrl()).origin;

  // `origin` compares scheme, host and port together, so a lookalike host or a
  // downgrade to http fails. `pathname` is already percent-decoded consistently
  // by URL, and startsWith on the full prefix pins the bucket too.
  return candidate.origin === expected && candidate.pathname.startsWith(PUBLIC_OBJECT_PREFIX);
}
