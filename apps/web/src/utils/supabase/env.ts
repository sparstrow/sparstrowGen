/**
 * One place that decides where Supabase lives.
 *
 * Previously each client read `process.env.*` on its own and disagreed about
 * what to do when the value was missing: the browser and server clients used
 * `!` (crash at runtime with a useless message), while the middleware fell back
 * to a hardcoded project ref and an empty anon key. The middleware's fallback
 * was the dangerous one -- with no env file present, every request would still
 * "work", silently authenticating against a project nobody configured, and the
 * only symptom was a 401 that looked like a session problem.
 *
 * Fail loudly at the first read instead. A missing env var is a deployment
 * mistake, and it should read like one.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy apps/web/.env.example to apps/web/.env.local ` +
        `and fill in the values from Supabase → Project Settings → API.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
