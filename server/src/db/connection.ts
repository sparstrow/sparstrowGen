import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { migrations } from "./migrations.js";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

let sqliteInstance: Database.Database | null = null;
let dbInstance: Db | null = null;

const BACKUPS_TO_KEEP = 5;

/** Copy the db file aside before opening it; keep the last few copies. */
function backupOnStart(dbPath: string): void {
  try {
    if (!fs.existsSync(dbPath)) return;
    const backupDir = path.join(path.dirname(dbPath), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    fs.copyFileSync(dbPath, path.join(backupDir, `sparstrow-${stamp}.db`));
    const old = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("sparstrow-") && f.endsWith(".db"))
      .sort()
      .slice(0, -BACKUPS_TO_KEEP);
    for (const f of old) fs.rmSync(path.join(backupDir, f), { force: true });
  } catch (err) {
    logger.warn({ err }, "db backup-on-start failed (continuing)");
  }
}

export function openDb(dbPath = config.dbPath): { sqlite: Database.Database; db: Db } {
  if (sqliteInstance && dbInstance) return { sqlite: sqliteInstance, db: dbInstance };

  backupOnStart(dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  applyMigrations(sqlite);

  sqliteInstance = sqlite;
  dbInstance = drizzle(sqlite, { schema });
  return { sqlite, db: dbInstance };
}

export function getDb(): Db {
  if (!dbInstance) throw new Error("DB not opened yet — call openDb() first");
  return dbInstance;
}

/** Async child-process handlers can outlive the database (shutdown, or a test
 *  tearing down while a child is still exiting). Check before touching getDb()
 *  on those paths — throwing there escapes as an uncaught exception. */
export function isDbOpen(): boolean {
  return dbInstance !== null;
}

export function getSqlite(): Database.Database {
  if (!sqliteInstance) throw new Error("DB not opened yet — call openDb() first");
  return sqliteInstance;
}

function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    (sqlite.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id),
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    logger.info({ migration: migration.id }, "applying migration");
    const run = sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      sqlite
        .prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, new Date().toISOString());
    });
    run();
  }
}

export function closeDb(): void {
  sqliteInstance?.close();
  sqliteInstance = null;
  dbInstance = null;
}
