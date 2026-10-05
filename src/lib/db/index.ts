import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const dbPath = path.resolve(process.cwd(), "pulo.db");
console.log("[DB] process.cwd():", process.cwd());
console.log("[DB] resolved db path:", dbPath);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
// Wait up to 5s when another process (e.g. a Next.js dev worker) holds
// the DB lock. Without this we get SQLITE_BUSY → 500 on every API route
// during HMR or when dev server forks multiple workers.
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");
const rawTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("[DB] raw tables (via better-sqlite3):", JSON.stringify(rawTables));
console.log("[DB] raw tables count:", rawTables.length);

// Verify the users table columns exist directly
try {
  const usersCols = sqlite.prepare("PRAGMA table_info(users)").all();
  console.log("[DB] users table columns:", usersCols);
} catch (e) {
  console.error("[DB] could not read users columns:", e);
}

// Idempotent runtime migrations — add columns that newer code expects. We
// guard each ALTER with a check on PRAGMA so the script can re-run safely.
function addColumnIfMissing(table: string, column: string, definition: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[DB] added column ${table}.${column}`);
    }
  } catch (e) {
    console.error(`[DB] failed to add column ${table}.${column}:`, e);
  }
}

addColumnIfMissing("messages", "file_name", "TEXT");
addColumnIfMissing("messages", "file_size", "INTEGER");
addColumnIfMissing("messages", "media_type", "TEXT"); // was added by older migration but harmless to re-check
addColumnIfMissing("posts", "moderation_status", "TEXT NOT NULL DEFAULT 'pending'");
addColumnIfMissing("posts", "moderation_reason", "TEXT");
addColumnIfMissing("posts", "moderation_score", "INTEGER DEFAULT 100");
addColumnIfMissing("posts", "moderated_at", "INTEGER");
addColumnIfMissing("posts", "public_id", "TEXT");
addColumnIfMissing("posts", "media_width", "INTEGER");
addColumnIfMissing("posts", "media_height", "INTEGER");

// Closeness / Mirror tables — created once, no columns to add later.
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS closeness (
      pair_key      TEXT PRIMARY KEY,
      points        INTEGER NOT NULL DEFAULT 0,
      streak_days   INTEGER NOT NULL DEFAULT 0,
      last_activity INTEGER NOT NULL DEFAULT 0,
      updated_at    INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mirror_settings (
      id                    TEXT PRIMARY KEY,
      image_full_points     INTEGER NOT NULL DEFAULT 100,
      video_unlock_points   INTEGER NOT NULL DEFAULT 60,
      activity_cap          INTEGER NOT NULL DEFAULT 95,
      streak_bonus_max      INTEGER NOT NULL DEFAULT 5,
      activity_window_days  INTEGER NOT NULL DEFAULT 14,
      updated_at            INTEGER NOT NULL DEFAULT 0
    );
  `);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO mirror_settings
        (id, image_full_points, video_unlock_points, activity_cap,
         streak_bonus_max, activity_window_days, updated_at)
       VALUES ('global', 100, 60, 95, 5, 14, ?)`,
    )
    .run(Math.floor(Date.now() / 1000));
} catch (e) {
  console.error("[DB] failed to bootstrap closeness tables:", e);
}

// @ts-ignore — drizzle-orm v1 RC generic constraint mismatch with tsconfig strictness
export const db = drizzle({ client: sqlite, schema });
