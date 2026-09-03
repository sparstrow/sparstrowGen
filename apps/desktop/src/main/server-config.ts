import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

/**
 * Where this installation's `server/` gets its Supabase credentials.
 *
 * ## Why a file on this machine, and not the installer
 *
 * `server/` needs `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` to
 * accept a machine's personal access token: the service role resolves the token
 * to a person (reading `access_tokens.token_hash`, which no other role may) and
 * the JWT secret mints the short-lived user token that puts RLS back in front
 * of everything after it.
 *
 * **Neither may ever ship in the installer.** An installer is a public file;
 * anything inside it is published to everyone who downloads it, and a service
 * role key is unlimited access to every row in the database. That is not a
 * tradeoff to weigh — it is the reason this file exists rather than a
 * `channel.json` field.
 *
 * So Sparstrowgen is configured the way any self-hosted application is: you
 * point it at your own Supabase project, once, on your own machine.
 *
 * ## Why encrypted rather than plain JSON
 *
 * Same reasoning as `session.ts`: a credential that acts as the whole database
 * does not belong in a readable file because that was more convenient. It goes
 * through `safeStorage` (DPAPI on Windows, Keychain on macOS, libsecret on
 * Linux), and **if encryption is unavailable this refuses to save rather than
 * falling back to plaintext** — a silent fallback would work perfectly and
 * leave the key sitting there.
 *
 * ## What is NOT a secret here
 *
 * `supabaseUrl` and `supabaseAnonKey` are public by design — the anon key is in
 * the JavaScript of every page the web app serves. They are stored in the same
 * encrypted blob only because splitting one config across two files, one
 * readable and one not, is a worse thing to maintain than encrypting two values
 * that did not need it.
 */

export type ServerCredentials = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Absent means `server/` runs but cannot accept a machine token. */
  supabaseServiceRoleKey: string | null;
  supabaseJwtSecret: string | null;
};

/** What the UI is allowed to know. Never carries a secret's value. */
export type ServerConfigStatus = {
  configured: boolean;
  supabaseUrl: string | null;
  /** Whether each secret is present. The values never cross the bridge. */
  hasServiceRoleKey: boolean;
  hasJwtSecret: boolean;
  /** False on a system with no keychain — nothing can be saved safely. */
  encryptionAvailable: boolean;
};

function configPath(): string {
  return path.join(app.getPath("userData"), "server-config.bin");
}

export function readServerConfig(): ServerCredentials | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const raw = safeStorage.decryptString(fs.readFileSync(configPath()));
    const parsed = JSON.parse(raw) as Partial<ServerCredentials>;
    if (!parsed.supabaseUrl || !parsed.supabaseAnonKey) return null;
    return {
      supabaseUrl: parsed.supabaseUrl.replace(/\/+$/, ""),
      supabaseAnonKey: parsed.supabaseAnonKey,
      supabaseServiceRoleKey: parsed.supabaseServiceRoleKey || null,
      supabaseJwtSecret: parsed.supabaseJwtSecret || null,
    };
  } catch {
    // Absent, unreadable, or written by a different OS user. All of them mean
    // the same thing to a caller: this machine has no server configuration.
    return null;
  }
}

export function writeServerConfig(next: ServerCredentials): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "This system has no secure credential storage available, so the server " +
        "configuration cannot be saved safely. Sparstrowgen will not write a " +
        "service role key in plain text.",
    );
  }
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
}

export function serverConfigStatus(): ServerConfigStatus {
  const encryptionAvailable = (() => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  })();
  const config = readServerConfig();
  return {
    configured: Boolean(config),
    supabaseUrl: config?.supabaseUrl ?? null,
    hasServiceRoleKey: Boolean(config?.supabaseServiceRoleKey),
    hasJwtSecret: Boolean(config?.supabaseJwtSecret),
    encryptionAvailable,
  };
}

/**
 * Merge an update into what is stored.
 *
 * A blank string for a secret means "leave it alone", not "clear it" — the
 * Settings form never receives the stored values (they do not cross the
 * bridge), so it submits blanks for anything the person did not retype. Without
 * this, editing the Supabase URL would silently wipe both keys.
 *
 * Clearing is done deliberately, with `clearServerConfig`.
 */
export function updateServerConfig(patch: Partial<ServerCredentials>): ServerConfigStatus {
  const current = readServerConfig();
  const merged: ServerCredentials = {
    supabaseUrl: (patch.supabaseUrl ?? current?.supabaseUrl ?? "").trim(),
    supabaseAnonKey: (patch.supabaseAnonKey || current?.supabaseAnonKey || "").trim(),
    supabaseServiceRoleKey:
      (patch.supabaseServiceRoleKey || current?.supabaseServiceRoleKey || "").trim() || null,
    supabaseJwtSecret:
      (patch.supabaseJwtSecret || current?.supabaseJwtSecret || "").trim() || null,
  };
  if (!merged.supabaseUrl || !merged.supabaseAnonKey) {
    throw new Error("A Supabase URL and anon key are both required.");
  }
  writeServerConfig(merged);
  return serverConfigStatus();
}

export function clearServerConfig(): ServerConfigStatus {
  try {
    fs.rmSync(configPath(), { force: true });
  } catch {
    // Nothing stored, or already gone.
  }
  return serverConfigStatus();
}

/**
 * Seed the configuration from the environment, once, if nothing is stored.
 *
 * This is what makes a developer's machine work without retyping four values
 * that are already in `apps/web/.env.local` and already exported into a dev
 * shell. It only ever fills an EMPTY configuration — it can never overwrite
 * what someone entered in Settings, because an environment variable left over
 * in a shell should not silently redirect an app at a different database.
 */
export function seedServerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (readServerConfig()) return false;
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return false;
  try {
    writeServerConfig({
      supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
      supabaseAnonKey,
      supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || null,
      supabaseJwtSecret: env.SUPABASE_JWT_SECRET || null,
    });
    console.log("[server-config] seeded from the environment");
    return true;
  } catch (err) {
    console.error("[server-config] could not seed from the environment:", err);
    return false;
  }
}
