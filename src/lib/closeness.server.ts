import type Database from "better-sqlite3";
import {
  MIRROR_CONFIG,
  pairKey,
  computeStreakDays,
  computeCloseness,
  type ClosenessInfo,
  type MirrorSettings,
} from "@/lib/closeness-core";

/**
 * Read the singleton mirror_settings row, falling back to defaults if the
 * row is missing (e.g. very old DB).
 */
export function readMirrorSettings(sqlite: Database.Database): MirrorSettings {
  const row = sqlite
    .prepare(`SELECT * FROM mirror_settings WHERE id = 'global'`)
    .get() as any;
  if (!row) return { ...MIRROR_CONFIG };
  return {
    imageFullPoints: row.image_full_points ?? MIRROR_CONFIG.imageFullPoints,
    videoUnlockPoints:
      row.video_unlock_points ?? MIRROR_CONFIG.videoUnlockPoints,
    activityCap: row.activity_cap ?? MIRROR_CONFIG.activityCap,
    streakBonusMax: row.streak_bonus_max ?? MIRROR_CONFIG.streakBonusMax,
    activityWindowDays:
      row.activity_window_days ?? MIRROR_CONFIG.activityWindowDays,
  };
}

/**
 * Compute the closeness between two users by querying raw likes / comments
 * exchanged in the configured activity window.
 */
export function recomputeCloseness(
  sqlite: Database.Database,
  myId: string,
  otherId: string,
  cfg: MirrorSettings,
): ClosenessInfo {
  const sinceSec =
    Math.floor(Date.now() / 1000) - cfg.activityWindowDays * 86400;

  const likesRow = sqlite
    .prepare(
      `SELECT
         SUM(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS mine,
         SUM(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS theirs
       FROM likes l
       JOIN posts p ON p.id = l.post_id
       WHERE l.created_at >= ?
         AND ((l.user_id = ? AND p.user_id = ?)
              OR (l.user_id = ? AND p.user_id = ?))`,
    )
    .get(myId, otherId, sinceSec, myId, otherId, otherId, myId) as any;
  const likesMine = likesRow?.mine ?? 0;
  const likesTheirs = likesRow?.theirs ?? 0;

  const commentsRow = sqlite
    .prepare(
      `SELECT
         SUM(CASE WHEN c.user_id = ? THEN 1 ELSE 0 END) AS mine,
         SUM(CASE WHEN c.user_id = ? THEN 1 ELSE 0 END) AS theirs
       FROM comments c
       JOIN posts p ON p.id = c.post_id
       WHERE c.created_at >= ?
         AND ((c.user_id = ? AND p.user_id = ?)
              OR (c.user_id = ? AND p.user_id = ?))`,
    )
    .get(myId, otherId, sinceSec, myId, otherId, otherId, myId) as any;
  const commentsMine = commentsRow?.mine ?? 0;
  const commentsTheirs = commentsRow?.theirs ?? 0;

  const myTs = sqlite
    .prepare(
      `SELECT l.created_at AS t FROM likes l
         JOIN posts p ON p.id = l.post_id
        WHERE l.user_id = ? AND p.user_id = ? AND l.created_at >= ?
       UNION ALL
       SELECT c.created_at AS t FROM comments c
         JOIN posts p ON p.id = c.post_id
        WHERE c.user_id = ? AND p.user_id = ? AND c.created_at >= ?`,
    )
    .all(myId, otherId, sinceSec, myId, otherId, sinceSec) as { t: number }[];
  const theirTs = sqlite
    .prepare(
      `SELECT l.created_at AS t FROM likes l
         JOIN posts p ON p.id = l.post_id
        WHERE l.user_id = ? AND p.user_id = ? AND l.created_at >= ?
       UNION ALL
       SELECT c.created_at AS t FROM comments c
         JOIN posts p ON p.id = c.post_id
        WHERE c.user_id = ? AND p.user_id = ? AND c.created_at >= ?`,
    )
    .all(otherId, myId, sinceSec, otherId, myId, sinceSec) as {
    t: number;
  }[];

  const streakDays = computeStreakDays(
    myTs.map((r) => r.t),
    theirTs.map((r) => r.t),
  );

  const likes14d = likesMine + likesTheirs;
  const comments14d = commentsMine + commentsTheirs;
  const lastActivity = Math.max(
    ...myTs.map((r) => r.t),
    ...theirTs.map((r) => r.t),
    0,
  );

  return computeCloseness(
    myId,
    otherId,
    likes14d,
    comments14d,
    streakDays,
    lastActivity,
    cfg,
  );
}

/**
 * Persist a freshly-computed closeness record (idempotent UPSERT).
 */
export function persistCloseness(
  sqlite: Database.Database,
  info: ClosenessInfo,
): void {
  sqlite
    .prepare(
      `INSERT INTO closeness (pair_key, points, streak_days, last_activity, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(pair_key) DO UPDATE SET
         points        = excluded.points,
         streak_days   = excluded.streak_days,
         last_activity = excluded.last_activity,
         updated_at    = excluded.updated_at`,
    )
    .run(
      info.pairKey,
      info.points,
      info.streakDays,
      info.lastActivityAt,
      Math.floor(Date.now() / 1000),
    );
}

/**
 * Recompute & persist the closeness record for the (me, friend) pair.
 * Returns the freshly-computed record.
 */
export function bumpCloseness(
  sqlite: Database.Database,
  myId: string,
  friendId: string,
): ClosenessInfo {
  const cfg = readMirrorSettings(sqlite);
  const info = recomputeCloseness(sqlite, myId, friendId, cfg);
  persistCloseness(sqlite, info);
  return info;
}

/** Re-export the canonical pair-key helper for API routes. */
export { pairKey };