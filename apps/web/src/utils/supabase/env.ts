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

/**
 * A missing environment variable, distinguishable from any other failure.
 *
 * The middleware needs to tell "this deployment was never configured" apart
 * from "something went wrong", because the first has a useful answer to show a
 * human and the second must not be swallowed. Everything else keeps throwing
 * and keeps crashing, which is correct.
 */
export class MissingConfigError extends Error {
  readonly variable: string;
  constructor(variable: string, message: string) {
    super(message);
    this.name = "MissingConfigError";
    this.variable = variable;
  }
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new MissingConfigError(
      name,
      `${name} is not set. In local development, copy apps/web/.env.example to ` +
        `apps/web/.env.local and fill in the values from Supabase → Project ` +
        `Settings → API. On Vercel, set it for the environment this deployment ` +
        `belongs to — Preview and Production are configured separately, and a ` +
        `variable set only for Production leaves every preview deployment ` +
        `unable to start.`,
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
