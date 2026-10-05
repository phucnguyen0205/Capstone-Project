/**
 * Diary helpers — encounter selection + radar scoring.
 *
 * "Ra khơi tìm bạn" (radar): returns a list of users for the radar
 * visualisation, mixing online friends + weighted strangers so the
 * chart feels alive even when the friend list is small.
 *
 * "Chạm mặt bất ngờ" (encounter): picks one user per day from the
 * viewer's "candidate pool" (friends + recently active users), avoids
 * repeats within the last 7 days, and persists the pick in
 * `diary_encounters` so the UI can show a stable card for the day.
 *
 * The picker is deliberately deterministic-ish: it uses the date as a
 * seed so the same user generally sees the same "encounter" within a
 * given day even if they reload. Re-picking for a new day happens on
 * the first GET that crosses the day boundary.
 */

import type Database from "better-sqlite3";

const ENCOUNTER_COOLDOWN_DAYS = 7;
const RADAR_MAX_ITEMS = 6;

export interface RadarUser {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  isOnline: boolean;
  /** "friend" | "active" | "stranger" — used for badge styling. */
  origin: "friend" | "active" | "stranger";
  /** Closeness points (0 if not friends). */
  points: number;
}

export interface EncounterPick {
  id: string;
  pickedAt: number;
  viewed: boolean;
  dismissed: boolean;
  user: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
    bio: string | null;
    isOnline: boolean;
  };
  /** Closeness points between viewer and the picked user. */
  points: number;
  /** Days since last friendship edge (0 if not friends). */
  daysSince: number;
  /** Optional note the viewer attached. */
  note: string | null;
}

export interface EncounterHistoryRow {
  id: string;
  pickedAt: number;
  viewed: boolean;
  dismissed: boolean;
  user: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
}

function genId(prefix: string) {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

/** Canonical (a, b) pair key — must match `src/lib/closeness-core.ts`. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function loadCloseness(
  db: Database.Database,
  a: string,
  b: string,
): number {
  const row = db
    .prepare(`SELECT points FROM closeness WHERE pair_key = ?`)
    .get(pairKey(a, b)) as { points: number } | undefined;
  return row?.points ?? 0;
}

/**
 * Build the radar list. Priority:
 *   1. Online friends (with presence) — front of the list
 *   2. Recently active users (any relationship) — middle
 *   3. Random sampling of registered users we haven't seen — back
 * Returned in render order: friends first, then actives, then strangers.
 */
export function pickRadar(
  db: Database.Database,
  viewerId: string,
): RadarUser[] {
  const out: RadarUser[] = [];

  // 1. Online friends
  const onlineFriends = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.avatar,
              COALESCE(c.points, 0) AS points
       FROM friendships f
       JOIN users u
         ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
       LEFT JOIN presence p ON p.user_id = u.id
       WHERE f.status = 'accepted'
         AND (f.requester_id = ? OR f.receiver_id = ?)
         AND p.last_seen >= ?
       ORDER BY c.points DESC, u.username ASC
       LIMIT ?`,
    )
    .all(
      viewerId,
      viewerId,
      viewerId,
      Math.floor(Date.now() / 1000) - 15 * 60, // active in last 15 min
      RADAR_MAX_ITEMS,
    ) as Array<{
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
    points: number;
  }>;

  for (const f of onlineFriends) {
    out.push({
      id: f.id,
      username: f.username,
      name: f.name,
      avatar: f.avatar,
      isOnline: true,
      origin: "friend",
      points: f.points,
    });
  }

  // 2. Active non-friends (presence recently, not already in `out`)
  const idsSeen = new Set(out.map((u) => u.id));
  const activeOthers = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.avatar
       FROM users u
       LEFT JOIN presence p ON p.user_id = u.id
       WHERE u.id != ?
         AND (p.last_seen IS NULL OR p.last_seen >= ?)
       ORDER BY COALESCE(p.last_seen, 0) DESC, u.created_at DESC
       LIMIT ?`,
    )
    .all(
      viewerId,
      Math.floor(Date.now() / 1000) - 60 * 60,
      RADAR_MAX_ITEMS,
    ) as Array<{
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  }>;

  for (const a of activeOthers) {
    if (idsSeen.has(a.id) || a.id === viewerId) continue;
    if (out.length >= RADAR_MAX_ITEMS) break;
    out.push({
      id: a.id,
      username: a.username,
      name: a.name,
      avatar: a.avatar,
      isOnline: true,
      origin: "active",
      points: 0,
    });
    idsSeen.add(a.id);
  }

  // 3. Random strangers to fill the radar (deterministic per day so
  // the chart doesn't flicker between reloads).
  if (out.length < RADAR_MAX_ITEMS) {
    const daySeed = Math.floor(Date.now() / 1000 / 86400);
    const others = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar
         FROM users u
         WHERE u.id != ?
           AND u.id NOT IN (${Array.from(idsSeen)
             .map(() => "?")
             .join(",") || "''"})
         ORDER BY (CAST(substr(u.id, -6) AS INTEGER) + ?) % 1000
         LIMIT ?`,
      )
      .all(
        viewerId,
        ...Array.from(idsSeen),
        daySeed,
        RADAR_MAX_ITEMS - out.length,
      ) as Array<{
      id: string;
      username: string;
      name: string | null;
      avatar: string | null;
    }>;
    for (const o of others) {
      if (idsSeen.has(o.id)) continue;
      out.push({
        id: o.id,
        username: o.username,
        name: o.name,
        avatar: o.avatar,
        isOnline: false,
        origin: "stranger",
        points: 0,
      });
      idsSeen.add(o.id);
    }
  }

  return out;
}

/**
 * Build the candidate pool for "chạm mặt bất ngờ" — friends ordered
 * by closeness, then recently active users, then a single random
 * stranger to keep things spicy. Excludes the viewer and any user
 * already picked in the last `ENCOUNTER_COOLDOWN_DAYS` days.
 */
function buildEncounterCandidatePool(
  db: Database.Database,
  viewerId: string,
): string[] {
  const cooldownSince =
    Math.floor(Date.now() / 1000) - ENCOUNTER_COOLDOWN_DAYS * 86400;

  const recentPicks = new Set(
    (db
      .prepare(
        `SELECT encountered_id FROM diary_encounters
         WHERE viewer_id = ? AND picked_at >= ?`,
      )
      .all(viewerId, cooldownSince) as Array<{ encountered_id: string }>).map(
      (r) => r.encountered_id,
    ),
  );

  const candidates: Array<{ id: string; weight: number }> = [];

  // Friends (weighted by closeness)
  const friends = db
    .prepare(
      `SELECT u.id, COALESCE(c.points, 0) AS points
       FROM friendships f
       JOIN users u
         ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
       LEFT JOIN closeness c ON c.pair_key = ?
       WHERE f.status = 'accepted'
         AND (f.requester_id = ? OR f.receiver_id = ?)
       ORDER BY points DESC`,
    )
    .all(viewerId, pairKey(viewerId, viewerId), viewerId, viewerId) as Array<{
    id: string;
    points: number;
  }>;
  for (const f of friends) {
    if (recentPicks.has(f.id) || f.id === viewerId) continue;
    candidates.push({ id: f.id, weight: 50 + (f.points ?? 0) });
  }

  // Recently active users
  const active = db
    .prepare(
      `SELECT u.id FROM users u
       LEFT JOIN presence p ON p.user_id = u.id
       WHERE u.id != ? AND p.last_seen >= ?`,
    )
    .all(
      viewerId,
      Math.floor(Date.now() / 1000) - 24 * 60 * 60,
    ) as Array<{ id: string }>;
  for (const a of active) {
    if (recentPicks.has(a.id) || a.id === viewerId) continue;
    if (candidates.find((c) => c.id === a.id)) continue;
    candidates.push({ id: a.id, weight: 20 });
  }

  // Stranger fallback
  if (candidates.length === 0) {
    const others = db
      .prepare(
        `SELECT u.id FROM users WHERE u.id != ? ORDER BY RANDOM() LIMIT 1`,
      )
      .all(viewerId) as Array<{ id: string }>;
    for (const o of others) {
      candidates.push({ id: o.id, weight: 1 });
    }
  }

  return candidates.map((c) => c.id);
}

/**
 * Pick today's encounter. If an undismissed pick for today already
 * exists, return it. Otherwise pick a new candidate deterministically
 * (date-based seed) and persist it.
 */
export function pickOrFetchTodaysEncounter(
  db: Database.Database,
  viewerId: string,
): EncounterPick | null {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayUnix = Math.floor(todayStart.getTime() / 1000);

  // First: did we already pick today? If yes, return that row.
  const existing = db
    .prepare(
      `SELECT id, picked_at, viewed_at, dismissed_at, encountered_id, note
       FROM diary_encounters
       WHERE viewer_id = ? AND picked_at >= ?
       ORDER BY picked_at DESC
       LIMIT 1`,
    )
    .get(viewerId, todayUnix) as
    | {
        id: string;
        picked_at: number;
        viewed_at: number | null;
        dismissed_at: number | null;
        encountered_id: string;
        note: string | null;
      }
    | undefined;

  if (existing && !existing.dismissed_at) {
    return hydrateEncounter(db, viewerId, existing);
  }

  // Otherwise pick a new one and persist.
  const pool = buildEncounterCandidatePool(db, viewerId);
  if (pool.length === 0) return null;

  const daySeed = Math.floor(Date.now() / 1000 / 86400);
  const pick = pool[(daySeed + viewerId.length) % pool.length];

  const now = Math.floor(Date.now() / 1000);
  const row = {
    id: genId("enc_"),
    picked_at: now,
    encountered_id: pick,
    note: null as string | null,
  };

  db.prepare(
    `INSERT INTO diary_encounters
       (id, viewer_id, encountered_id, picked_at, viewed_at, dismissed_at, note)
     VALUES (?, ?, ?, ?, NULL, NULL, ?)`,
  ).run(row.id, viewerId, row.encountered_id, row.picked_at, row.note);

  return hydrateEncounter(db, viewerId, {
    id: row.id,
    picked_at: row.picked_at,
    viewed_at: null,
    dismissed_at: null,
    encountered_id: row.encountered_id,
    note: row.note,
  });
}

export function fetchEncounterHistory(
  db: Database.Database,
  viewerId: string,
  limit = 30,
): EncounterHistoryRow[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.picked_at, e.viewed_at, e.dismissed_at,
              u.id AS user_id, u.username, u.name, u.avatar
       FROM diary_encounters e
       JOIN users u ON u.id = e.encountered_id
       WHERE e.viewer_id = ?
       ORDER BY e.picked_at DESC
       LIMIT ?`,
    )
    .all(viewerId, limit) as Array<{
    id: string;
    picked_at: number;
    viewed_at: number | null;
    dismissed_at: number | null;
    user_id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    pickedAt: r.picked_at,
    viewed: !!r.viewed_at,
    dismissed: !!r.dismissed_at,
    user: {
      id: r.user_id,
      username: r.username,
      name: r.name,
      avatar: r.avatar,
    },
  }));
}

function hydrateEncounter(
  db: Database.Database,
  viewerId: string,
  row: {
    id: string;
    picked_at: number;
    viewed_at: number | null;
    dismissed_at: number | null;
    encountered_id: string;
    note: string | null;
  },
): EncounterPick | null {
  const user = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.avatar, u.bio,
              COALESCE(p.last_seen, 0) AS last_seen
       FROM users u
       LEFT JOIN presence p ON p.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(row.encountered_id) as
    | {
        id: string;
        username: string;
        name: string | null;
        avatar: string | null;
        bio: string | null;
        last_seen: number;
      }
    | undefined;
  if (!user) return null;

  const friendship = db
    .prepare(
      `SELECT created_at FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = ? AND receiver_id = ?)
           OR (requester_id = ? AND receiver_id = ?))
       LIMIT 1`,
    )
    .get(viewerId, user.id, user.id, viewerId) as
    | { created_at: number }
    | undefined;

  const points = loadCloseness(db, viewerId, user.id);
  const daysSince = friendship
    ? Math.max(
        0,
        Math.floor((Date.now() / 1000 - friendship.created_at) / 86400),
      )
    : 0;
  const isOnline =
    user.last_seen > 0 &&
    user.last_seen >= Math.floor(Date.now() / 1000) - 15 * 60;

  return {
    id: row.id,
    pickedAt: row.picked_at,
    viewed: !!row.viewed_at,
    dismissed: !!row.dismissed_at,
    note: row.note,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      isOnline,
    },
    points,
    daysSince,
  };
}

export function markEncounterViewed(
  db: Database.Database,
  viewerId: string,
  encounterId: string,
) {
  db.prepare(
    `UPDATE diary_encounters
     SET viewed_at = COALESCE(viewed_at, ?)
     WHERE id = ? AND viewer_id = ?`,
  ).run(Math.floor(Date.now() / 1000), encounterId, viewerId);
}

export function dismissEncounter(
  db: Database.Database,
  viewerId: string,
  encounterId: string,
) {
  db.prepare(
    `UPDATE diary_encounters
     SET dismissed_at = ?
     WHERE id = ? AND viewer_id = ?`,
  ).run(Math.floor(Date.now() / 1000), encounterId, viewerId);
}

export function setEncounterNote(
  db: Database.Database,
  viewerId: string,
  encounterId: string,
  note: string,
) {
  db.prepare(
    `UPDATE diary_encounters
     SET note = ?
     WHERE id = ? AND viewer_id = ?`,
  ).run(note, encounterId, viewerId);
}