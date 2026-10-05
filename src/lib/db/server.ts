import Database from "better-sqlite3";
import path from "path";

/**
 * Module-level singleton. Opening a new better-sqlite3 connection on every
 * request piled up FDs on pulo.db under HMR + multi-worker dev mode and
 * caused SQLITE_BUSY for every route in /api/groups/* and /api/notifications.
 * One process = one connection = one journal = no contention with ourselves.
 */
function openConnection(): Database.Database {
  const dbPath = path.resolve(process.cwd(), "pulo.db");
  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  // Wait up to 5s when another process (e.g. a Next.js dev worker) holds the
  // DB lock instead of failing immediately with SQLITE_BUSY.
  conn.pragma("busy_timeout = 5000");
  conn.pragma("synchronous = NORMAL");
  return conn;
}

let sqlite: Database.Database = openConnection();

/**
 * Backwards-compatible accessor. The whole codebase calls `getDb()` and
 * expects a `Database`-shaped value. We return the singleton so call-sites
 * keep working, but every caller now shares the same connection.
 *
 * Self-healing: if the underlying connection has been closed (for example
 * by Next.js dev HMR garbage-collecting the previous module instance, or by
 * an accidental `db.close()` somewhere), we transparently reopen it on the
 * next request. Without this guard, the very first request after the close
 * surfaces "The database connection is not open" and the route returns 500.
 */
export function getDb() {
  if (!sqlite.open) {
    console.warn("[db] connection was closed; reopening singleton");
    sqlite = openConnection();
    // Re-run idempotent CREATE TABLE / index statements on the fresh
    // connection so subsequent queries can assume the schema is in place.
    bootstrapSchema(sqlite);
  }
  return sqlite;
}

function bootstrapSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      caption    TEXT DEFAULT '',
      media_url  TEXT NOT NULL,
      media_type TEXT NOT NULL,
      public_id  TEXT,
      lens       TEXT NOT NULL DEFAULT 'friends',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id          TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_notes (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      content       TEXT NOT NULL,
      mood          TEXT NOT NULL DEFAULT 'neutral',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      unlock_points INTEGER,
      visibility    TEXT NOT NULL DEFAULT 'shared'
    );

    CREATE TABLE IF NOT EXISTS vault_note_visibility (
      id          TEXT PRIMARY KEY,
      note_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      state       TEXT NOT NULL DEFAULT 'allowed',
      mood_filter TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id            TEXT PRIMARY KEY,
      recipient_id  TEXT NOT NULL,
      actor_id      TEXT,
      type          TEXT NOT NULL,
      title         TEXT NOT NULL,
      body          TEXT,
      data          TEXT,
      read          INTEGER NOT NULL DEFAULT 0,
      read_at       INTEGER,
      created_at    INTEGER NOT NULL
    );
  `);

  // ── Backfill columns on legacy tables created by older Drizzle migrations ──
  // Older snapshots of the `comments` table only had `id, user_id, post_id,
  // content, created_at`. The reply/soft-delete/edit features need
  // `parent_id, updated_at, edited, deleted_at`. Adding a column twice
  // raises an error, so we look it up in sqlite_master first.
  function ensureColumn(table: string, column: string, ddl: string) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }

  try {
    ensureColumn("comments", "parent_id",  "parent_id TEXT");
    ensureColumn("comments", "updated_at", "updated_at INTEGER NOT NULL DEFAULT 0");
    ensureColumn("comments", "edited",     "edited INTEGER NOT NULL DEFAULT 0");
    ensureColumn("comments", "deleted_at", "deleted_at INTEGER");
  } catch (err) {
    console.error("[db] ensureColumn failed:", err);
  }

  // Create the comment_*, diary_encounters, closeness, mirror_settings
  // tables up-front so the indexes created below have something to
  // attach to. CREATE TABLE IF NOT EXISTS is idempotent — re-running
  // on an already-populated DB is a no-op.
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_reactions (
      id          TEXT PRIMARY KEY,
      comment_id  TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      emoji       TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      UNIQUE(comment_id, user_id, emoji),
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS comment_mentions (
      id         TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      username   TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS comment_shares (
      id         TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
    );
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
    INSERT OR IGNORE INTO mirror_settings
      (id, image_full_points, video_unlock_points, activity_cap,
       streak_bonus_max, activity_window_days, updated_at)
      VALUES ('global', 100, 60, 95, 5, 14, CAST(strftime('%s','now') AS INTEGER));
    CREATE TABLE IF NOT EXISTS diary_encounters (
      id              TEXT PRIMARY KEY,
      viewer_id       TEXT NOT NULL,
      encountered_id  TEXT NOT NULL,
      picked_at       INTEGER NOT NULL,
      viewed_at       INTEGER,
      dismissed_at    INTEGER,
      note            TEXT,
      UNIQUE(viewer_id, picked_at)
    );
  `);

  // Index creation has to live outside the big CREATE block because the
  // legacy `comments` table is missing the parent_id column that
  // idx_comments_parent references. We attempt each index individually
  // and swallow the error so a missing column never blocks the whole
  // module from loading.
  const indexStatements = [
    "CREATE INDEX IF NOT EXISTS idx_vault_notes_user ON vault_notes(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_vault_notes_visibility_created ON vault_notes(visibility, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_vault_note_visibility_note ON vault_note_visibility(note_id)",
    "CREATE INDEX IF NOT EXISTS idx_vault_note_visibility_user ON vault_note_visibility(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipient_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id, read, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_diary_encounters_viewer_picked ON diary_encounters(viewer_id, picked_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id)",
    "CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON comment_mentions(comment_id)",
    "CREATE INDEX IF NOT EXISTS idx_comment_mentions_user_created ON comment_mentions(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comment_shares_comment ON comment_shares(comment_id)",
  ];
  for (const stmt of indexStatements) {
    try {
      db.exec(stmt);
    } catch (err) {
      // Most common cause: the underlying column doesn't exist (legacy
      // table). The index is a perf optimization, not a correctness
      // requirement, so log and move on rather than crash the server.
      console.warn(`[db] skipped index (${stmt.split(" ")[5]}):`, (err as Error).message);
    }
  }
}

// Run the schema bootstrap once at module load so the first request
// already finds the tables in place. Subsequent reconnects (in
// `getDb()` above) re-run this against a fresh connection.
bootstrapSchema(sqlite);
