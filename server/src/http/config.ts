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
  /** Origins allowed to call this server from a browser. */
  corsOrigins: string[];
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
    corsOrigins: (env.SPARSTROW_SERVER_CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
