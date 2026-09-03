// Consistent SQLite snapshot for backup. Uses better-sqlite3's online backup
// API, which reads a coherent view INCLUDING committed WAL frames, so the
// destination is a single complete .db (no torn copy, no lost WAL data) even
// while the core is running. Lives under server/ so better-sqlite3
// resolves; pass paths relative to wherever you invoke node from:
//   node server/scripts/backup-db.mjs data/sparstrow.db "$SPARSTROW_VAULT/.db-backup/sparstrow.db"
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [, , src, dest] = process.argv;
if (!src || !dest) {
  console.error("usage: node server/scripts/backup-db.mjs <src.db> <dest.db>");
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
const db = new Database(src, { fileMustExist: true });
try {
  const info = await db.backup(dest);
  console.log(`backed up ${src} -> ${dest} (${info.totalPages} pages)`);
} finally {
  db.close();
}
