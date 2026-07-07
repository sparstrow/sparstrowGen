import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * EC2 (P7-Q1) — the core-only secret vault. The GitHub PAT (and any future
 * core-side credential) is kept OUT of the app DB: `settings` rows live in the
 * same SQLite file any Bash/Read-capable agent could open, and `GET
 * /system/settings` dumps every row verbatim. Instead secrets live in an
 * AES-256-GCM-encrypted file under `config.secretsDir` (~/.sparstrow by default —
 * OUTSIDE the agent-adjacent dataDir), with the machine-local key in a sibling
 * 0600 file. Used only by core-side git ops; never injected into an agent env
 * (the Slice-1 allowlist already strips it) and never returned to the UI raw —
 * `getSecretMeta` exposes presence + a masked hint only.
 *
 * This is the local-machine posture the plan locked (P7-Q1); the migration to an
 * OS keychain lands with the Electron shell. Encryption-at-rest here is defence
 * in depth on top of the file living outside dataDir, not the primary boundary.
 */

const KEY_FILE = "secret.key";
const STORE_FILE = "secrets.json";
const ALGO = "aes-256-gcm";

/** Well-known secret keys. */
export const SECRET_GITHUB_PAT = "github.pat";

interface Entry {
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64 ciphertext
}
interface Store {
  version: 1;
  entries: Record<string, Entry>;
}

function keyPath(): string {
  return path.join(config.secretsDir, KEY_FILE);
}
function storePath(): string {
  return path.join(config.secretsDir, STORE_FILE);
}

/** Warn once if the secrets dir was misconfigured to sit inside the agent-readable dataDir. */
function assertOutsideDataDir(): void {
  const rel = path.relative(config.dataDir, config.secretsDir);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    logger.warn(
      { secretsDir: config.secretsDir, dataDir: config.dataDir },
      "secretsDir is inside dataDir — an agent could read the encrypted secret file; set SPARSTROW_SECRETS_DIR outside dataDir",
    );
  }
}

/** Load (or lazily create) the 32-byte machine-local key. Exclusive-create avoids a rotate race. */
function loadOrCreateKey(): Buffer {
  assertOutsideDataDir();
  fs.mkdirSync(config.secretsDir, { recursive: true });
  const kp = keyPath();
  try {
    const fd = fs.openSync(kp, "wx", 0o600);
    const key = crypto.randomBytes(32);
    fs.writeSync(fd, key.toString("hex"));
    fs.closeSync(fd);
    return key;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    return Buffer.from(fs.readFileSync(kp, "utf8").trim(), "hex");
  }
}

function readStore(): Store {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Store;
    if (parsed.version !== 1 || typeof parsed.entries !== "object") {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeStore(store: Store): void {
  fs.mkdirSync(config.secretsDir, { recursive: true });
  const tmp = `${storePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, storePath());
}

/** Store (or overwrite) a secret. Empty string clears it. */
export function setSecret(key: string, value: string): void {
  const store = readStore();
  if (value === "") {
    delete store.entries[key];
    writeStore(store);
    return;
  }
  const dk = loadOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, dk, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  store.entries[key] = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
  writeStore(store);
}

/** Decrypt and return a secret, or null when absent. Throws only on tamper/corruption. */
export function getSecret(key: string): string | null {
  const entry = readStore().entries[key];
  if (!entry) return null;
  const kp = keyPath();
  if (!fs.existsSync(kp)) return null; // key gone → treat as absent, don't crash git ops
  const dk = Buffer.from(fs.readFileSync(kp, "utf8").trim(), "hex");
  const decipher = crypto.createDecipheriv(ALGO, dk, Buffer.from(entry.iv, "base64"));
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.ct, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function hasSecret(key: string): boolean {
  return readStore().entries[key] != null;
}

export function deleteSecret(key: string): void {
  const store = readStore();
  if (store.entries[key]) {
    delete store.entries[key];
    writeStore(store);
  }
}

export function listSecretKeys(): string[] {
  return Object.keys(readStore().entries);
}

/**
 * Presence + a masked hint for UI display — NEVER the raw value. `hint` is the
 * last 4 chars ("…a1b2"), enough for an operator to confirm which token is set
 * without exposing it.
 */
export function getSecretMeta(key: string): { present: boolean; hint: string | null; length: number | null } {
  if (!hasSecret(key)) return { present: false, hint: null, length: null };
  let value: string | null = null;
  try {
    value = getSecret(key);
  } catch (err) {
    logger.warn({ err, key }, "secret decrypt failed — reporting present-but-unreadable");
    return { present: true, hint: null, length: null };
  }
  if (value == null) return { present: false, hint: null, length: null };
  return {
    present: true,
    hint: value.length >= 4 ? `…${value.slice(-4)}` : "…",
    length: value.length,
  };
}
