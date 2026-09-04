/**
 * What `cmd/server.ts` needs to start.
 *
 * Separate from `src/config.ts`, which configures the **daemon** — a different
 * process with a different job. Sharing one config object between them was the
 * shape that made "core" mean two things at once.
 */

export type ServerConfig = {
  host: string;
  port: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /**
   * Server-only, and both are needed together to authenticate desktop/CLI
   * clients: the service role resolves a personal access token to a user, and
   * the JWT secret mints the short-lived token that makes RLS apply to it.
   * Absent them, `server/` still serves `apps/web` perfectly — it just cannot
   * accept a PAT. See `src/auth/jwt.ts`.
   */
  supabaseServiceRoleKey: string | null;
  supabaseJwtSecret: string | null;
  /** Origins allowed to call this server from a browser. */
  corsOrigins: string[];
  /**
   * Where the browser-facing web app lives.
   *
   * Used to build the `/connect` confirm URL a machine sends someone to. Not
   * derived from the incoming request: `server/` may be on `127.0.0.1` inside a
   * desktop install while the confirm page is served from somewhere else
   * entirely, and a loopback confirm URL is one nobody can open.
   */
  webOrigin: string;
};

export class MissingServerConfigError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    super(
      `${variable} is not set. server/ needs it to reach Supabase. In local ` +
        `development the values are printed by \`pnpm dev:status\`; copy them ` +
        `into a .env the server can read, or export them before starting.`,
    );
    this.name = "MissingServerConfigError";
    this.variable = variable;
  }
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // Two accepted names for each, and the fallback is not laziness. The local
  // stack's values live in `apps/web/.env.local` under `NEXT_PUBLIC_*`, because
  // that is where Next requires them; making the server insist on its own
  // spelling would mean maintaining the same two values in two files that must
  // never disagree. The unprefixed name wins where both are set, so a real
  // deployment can configure the server without inheriting a web app's naming.
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new MissingServerConfigError("SUPABASE_URL");

  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) throw new MissingServerConfigError("SUPABASE_ANON_KEY");

  const port = Number(env.SPARSTROW_SERVER_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SPARSTROW_SERVER_PORT must be a valid port, got "${env.SPARSTROW_SERVER_PORT}"`);
  }

  return {
    // Loopback by default. Under OQ-9's option A this server runs on the
    // user's own machine, and a server holding a session-scoped database
    // connection should not be listening on every interface because a default
    // said so. Set SPARSTROW_SERVER_HOST deliberately to expose it.
    host: env.SPARSTROW_SERVER_HOST ?? "127.0.0.1",
    port,
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    supabaseAnonKey,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || null,
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET || null,
    // Defaults to this server's OWN origin, because it serves `/connect`
    // itself now. It used to default to `http://localhost:3000`, which meant a
    // packaged install sent people to a Next.js server it does not ship — the
    // "Could not reach http://localhost:3000" a first sign-in actually hit.
    // Set it explicitly to send people to `apps/web` instead.
    webOrigin: (env.SPARSTROW_WEB_ORIGIN ?? `http://127.0.0.1:${port}`).replace(/\/+$/, ""),
    corsOrigins: (env.SPARSTROW_SERVER_CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
