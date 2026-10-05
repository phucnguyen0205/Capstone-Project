/**
 * Shared helpers for the Vault feature.
 *
 * Visibility decision tree (see `src/lib/db/schema.ts` for the table
 * definitions):
 *
 *   1. If `note.visibility === "private"` → only the author can see it.
 *   2. If the viewer is the author → always visible.
 *   3. Look up the explicit override row in `vault_note_visibility` for
 *      (noteId, viewerId). If `state = "denied"` → blocked. If `state =
 *      "allowed"` → grants access regardless of points.
 *   4. Fall back to the closeness-points check: viewer must have
 *      `closeness.points >= unlock_points` (or the global
 *      mirror_settings.video_unlock_points when `unlock_points` is NULL).
 *
 * The same helper is reused by:
 *   - GET /api/vault/notes         (owner's notes only — no permission check)
 *   - GET /api/vault/feed          (shared notes the viewer can see)
 *   - GET /api/vault/notes/[id]    (single-note read with permission gate)
 */

import type Database from "better-sqlite3";

export const VAULT_DEFAULT_UNLOCK_POINTS = 60; // matches mirror_settings default

export interface ClosenessSnapshot {
  points: number;
  streakDays: number;
}

export interface MirrorSettingsSnapshot {
  videoUnlockPoints: number;
  imageFullPoints: number;
}

export function loadMirrorSettings(db: Database.Database): MirrorSettingsSnapshot {
  const row = db
    .prepare(
      `SELECT video_unlock_points as v, image_full_points as i
       FROM mirror_settings WHERE id = 'global'`,
    )
    .get() as { v: number; i: number } | undefined;
  return {
    videoUnlockPoints: row?.v ?? VAULT_DEFAULT_UNLOCK_POINTS,
    imageFullPoints: row?.i ?? 100,
  };
}

/**
 * Canonical (a, b) pair key — must match the one in
 * `src/lib/closeness-core.ts` so we read the same row.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function loadClosenessPoints(
  db: Database.Database,
  viewerId: string,
  authorId: string,
): number {
  if (viewerId === authorId) return 0;
  const row = db
    .prepare(`SELECT points FROM closeness WHERE pair_key = ?`)
    .get(pairKey(viewerId, authorId)) as { points: number } | undefined;
  return row?.points ?? 0;
}

export interface NoteRow {
  id: string;
  user_id: string;
  content: string;
  mood: string;
  created_at: number;
  updated_at: number;
  unlock_points: number | null;
  visibility: string;
}

export interface VisibilityDecision {
  /** Can the viewer see this note's full content? */
  allowed: boolean;
  /** Author-defined points threshold (or global default when NULL). */
  effectiveUnlock: number;
  /** Closeness points between viewer and author (0 for self). */
  closenessPoints: number;
  /** Did an explicit allow/deny row override the points check? */
  override: "allowed" | "denied" | null;
  /** Did a mood-filtered override apply to this (note, viewer, mood)? */
  moodFiltered: boolean;
}

const VALID_MOOD_SET = new Set([
  "happy",
  "sad",
  "angry",
  "neutral",
] as const);

/**
 * Parse the comma-separated `mood_filter` column into a set of moods.
 * Returns `null` when the filter is absent (means "all moods").
 */
function parseMoodFilter(raw: string | null | undefined): Set<string> | null {
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return new Set(parts.filter((p) => VALID_MOOD_SET.has(p as any)));
}

/**
 * Decide whether `viewerId` may read `note`. Pure function — caller is
 * responsible for fetching the note + override rows from the DB.
 *
 * Pass `db` so we can read the global mirror_settings default when the
 * note's unlock_points is NULL.
 *
 * Optional `noteMood` lets the caller check whether a mood-filtered
 * override applies to the specific mood of the note being read.
 */
export function decideNoteVisibility(args: {
  db: Database.Database;
  note: NoteRow;
  viewerId: string;
  noteMood?: string;
}): VisibilityDecision {
  const { db, note, viewerId } = args;
  const mood = args.noteMood ?? null;

  // Rule 1 — author always sees their own notes.
  if (note.user_id === viewerId) {
    return {
      allowed: true,
      effectiveUnlock: note.unlock_points ?? VAULT_DEFAULT_UNLOCK_POINTS,
      closenessPoints: 0,
      override: null,
      moodFiltered: false,
    };
  }

  // Rule 2 — private notes are owner-only.
  if (note.visibility === "private") {
    return {
      allowed: false,
      effectiveUnlock: note.unlock_points ?? VAULT_DEFAULT_UNLOCK_POINTS,
      closenessPoints: 0,
      override: null,
      moodFiltered: false,
    };
  }

  // Rule 3 — explicit allow/deny rows. We scan every row for this
  // (note, viewer) pair so a mood-filtered override can coexist with a
  // blanket one. If any row blocks, we block; if any row allows, we
  // allow. (The PUT endpoint is responsible for keeping these clean.)
  const overrides = db
    .prepare(
      `SELECT state, mood_filter FROM vault_note_visibility
       WHERE note_id = ? AND user_id = ?`,
    )
    .all(note.id, viewerId) as Array<{
    state: string;
    mood_filter: string | null;
  }>;

  let moodFiltered = false;
  let explicitAllowed = false;
  let explicitDenied = false;

  for (const row of overrides) {
    const filter = parseMoodFilter(row.mood_filter);
    const applies = filter === null
      ? true
      : mood !== null && filter.has(mood);
    if (!applies) continue;
    moodFiltered = moodFiltered || filter !== null;
    if (row.state === "denied") explicitDenied = true;
    else if (row.state === "allowed") explicitAllowed = true;
  }

  // "denied" beats "allowed" when both exist (PUT upserts clean state,
  // but defensive in case of legacy data). A denied override always
  // wins over the points check.
  if (explicitDenied) {
    return {
      allowed: false,
      effectiveUnlock: note.unlock_points ?? VAULT_DEFAULT_UNLOCK_POINTS,
      closenessPoints: loadClosenessPoints(db, viewerId, note.user_id),
      override: "denied",
      moodFiltered,
    };
  }
  if (explicitAllowed) {
    return {
      allowed: true,
      effectiveUnlock: note.unlock_points ?? VAULT_DEFAULT_UNLOCK_POINTS,
      closenessPoints: loadClosenessPoints(db, viewerId, note.user_id),
      override: "allowed",
      moodFiltered,
    };
  }

  // Rule 4 — closeness points check.
  const settings = loadMirrorSettings(db);
  const effectiveUnlock = note.unlock_points ?? settings.videoUnlockPoints;
  const closeness = loadClosenessPoints(db, viewerId, note.user_id);
  return {
    allowed: closeness >= effectiveUnlock,
    effectiveUnlock,
    closenessPoints: closeness,
    override: null,
    moodFiltered: false,
  };
}
