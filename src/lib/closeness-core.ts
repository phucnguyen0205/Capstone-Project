/**
 * Pure helpers for the Closeness / Mirror feature — usable from both
 * client and server contexts (no `"use client"` directive, no DOM).
 *
 * Client-side hooks live in `./closeness.ts`; server-side DB plumbing
 * lives in `./closeness.server.ts`.
 */

export interface ClosenessInfo {
  /** Other user id (always the bigger sort key first to canonicalise pair). */
  pairKey: string;
  /** Current points in [0, imageFullPoints]. */
  points: number;
  /** Reciprocal streak (consecutive days both interacted). */
  streakDays: number;
  /** Last day either side interacted (unix seconds, 0 if never). */
  lastActivityAt: number;
  /** Progress fraction in [0, 1]. */
  progress: number;
  /** Current blur amount for images (0 = clear, 1 = max blur). */
  imageBlur: number;
  /** True if the viewer may watch videos for this friend. */
  videoUnlocked: boolean;
}

export interface MirrorSettings {
  imageFullPoints: number;
  videoUnlockPoints: number;
  activityCap: number;
  streakBonusMax: number;
  activityWindowDays: number;
}

/**
 * Lens / privacy levels for posts. Drives how the "Gương vô hình"
 * (invisible mirror) is applied: a `public` post is shown without
 * blur, while `friends` and `close` posts require a higher closeness
 * score to be revealed in full.
 */
export type LensLevel = "public" | "friends" | "close" | "private";

/**
 * Per-lens mirror thresholds. The settings represent "raw closeness
 * points" the viewer must accumulate to unlock the media at this
 * privacy level — the closer the post is to the author's inner
 * circle, the more points are needed to peek inside.
 *
 * Multipliers were chosen so a casual friend can read a `friends`
 * post after a few likes, but a `close` post stays blurry until
 * the viewer and the author have built up a real streak.
 */
export const LENS_MIRROR_CONFIG: Record<
  Exclude<LensLevel, "private" | "public">,
  MirrorSettings
> = {
  friends: {
    imageFullPoints: 130,
    videoUnlockPoints: 80,
    activityCap: 95,
    streakBonusMax: 5,
    activityWindowDays: 14,
  },
  close: {
    imageFullPoints: 220,
    videoUnlockPoints: 140,
    activityCap: 95,
    streakBonusMax: 5,
    activityWindowDays: 14,
  },
};

/** Default tunable thresholds. Mirrored into mirror_settings(id='global'). */
export const MIRROR_CONFIG: MirrorSettings = {
  imageFullPoints: 100,
  videoUnlockPoints: 60,
  activityCap: 95,
  streakBonusMax: 5,
  activityWindowDays: 14,
};

/**
 * Public posts bypass the mirror entirely. Anything in a tighter
 * circle uses the matching lens threshold.
 */
export function getMirrorConfigForLens(lens: LensLevel | string | undefined): MirrorSettings | null {
  if (!lens || lens === "public") return null;
  if (lens === "private") return null;
  return LENS_MIRROR_CONFIG[lens as "friends" | "close"] ?? null;
}

/** Canonical pair key so (a,b) and (b,a) collide on the same DB row. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Translate a friend pair + raw activity counts into a closeness record.
 * Same inputs always produce the same output so server and client agree
 * without sharing state.
 */
export function computeCloseness(
  a: string,
  b: string,
  likes14d: number,
  comments14d: number,
  streakDays: number,
  lastActivityAt: number,
  cfg: MirrorSettings = MIRROR_CONFIG,
): ClosenessInfo {
  const rawActivity = likes14d + comments14d * 2;
  const activityScore = Math.min(rawActivity, cfg.activityCap);
  const ratio = activityScore / cfg.activityCap;
  const streakBonus = Math.min(streakDays, cfg.streakBonusMax);
  const raw =
    streakBonus + ratio * (cfg.imageFullPoints - cfg.streakBonusMax);
  const points = Math.max(
    0,
    Math.min(cfg.imageFullPoints, Math.round(raw)),
  );
  const progress = points / cfg.imageFullPoints;

  // Image blur drops from 24px (floor) to 0px at progress = 1.0. A small
  // floor fraction (15 %) keeps a hint of mystery even when the user is
  // already "close", so the unlock still feels rewarding.
  const blurFloor = 0.15;
  const effectiveProgress = Math.max(blurFloor, progress);
  const imageBlur = Math.round((1 - effectiveProgress) * 24);

  return {
    pairKey: pairKey(a, b),
    points,
    streakDays,
    lastActivityAt,
    progress,
    imageBlur,
    videoUnlocked: points >= cfg.videoUnlockPoints,
  };
}

/**
 * Per-post application of the mirror rules. We always store the raw
 * closeness record once per (me, friend) pair so the score carries
 * across every post they make. When the UI renders a post it picks
 * the right lens threshold and re-derives the blur / unlock flags.
 *
 * - `lens === "public"` (or unknown) → mirror disabled: blur = 0,
 *   video unlocked.
 * - `lens === "friends" | "close"`   → re-scale raw points against
 *   the lens's imageFullPoints / videoUnlockPoints and clamp.
 */
export function applyLensToCloseness(
  raw: ClosenessInfo,
  lens: LensLevel | string | undefined,
): ClosenessInfo & { mirrorEnabled: boolean; requiredImageFull: number; requiredVideoUnlock: number } {
  const cfg = getMirrorConfigForLens(lens);
  if (!cfg) {
    return {
      ...raw,
      imageBlur: 0,
      videoUnlocked: true,
      progress: 1,
      mirrorEnabled: false,
      requiredImageFull: 0,
      requiredVideoUnlock: 0,
    };
  }
  const effectiveRaw = Math.min(raw.points, cfg.imageFullPoints);
  const ratio = effectiveRaw / cfg.imageFullPoints;
  const blurFloor = 0.15;
  const effectiveProgress = Math.max(blurFloor, ratio);
  const imageBlur = Math.round((1 - effectiveProgress) * 24);
  return {
    ...raw,
    imageBlur,
    videoUnlocked: raw.points >= cfg.videoUnlockPoints,
    progress: ratio,
    mirrorEnabled: true,
    requiredImageFull: cfg.imageFullPoints,
    requiredVideoUnlock: cfg.videoUnlockPoints,
  };
}

/**
 * Longest reciprocal-interaction streak ending at the most recent mutual
 * day. Each "day" rolls over at 04:00 local-time so people who hang out
 * late at night don't lose yesterday's streak.
 */
export function computeStreakDays(
  myTimestamps: number[],
  theirTimestamps: number[],
  nowSec: number = Math.floor(Date.now() / 1000),
  cutoffHour: number = 4,
): number {
  const todayStart = nowSec - (nowSec % 86400) - cutoffHour * 3600;
  const byDay = (ts: number[]): Set<number> => {
    const s = new Set<number>();
    for (const t of ts) {
      const dayStart = t - (t % 86400) - cutoffHour * 3600;
      s.add(dayStart);
    }
    return s;
  };
  const myDays = byDay(myTimestamps);
  const theirDays = byDay(theirTimestamps);
  const mutual = new Set<number>();
  for (const d of myDays) if (theirDays.has(d)) mutual.add(d);

  const sorted = Array.from(mutual).sort((a, b) => b - a);
  if (sorted.length === 0) return 0;
  let streak = 1;
  let cursor = sorted[0];
  const gapDays = Math.floor((todayStart - cursor) / 86400);
  if (gapDays > 1) return 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((cursor - sorted[i]) / 86400);
    if (diff === 1) {
      streak++;
      cursor = sorted[i];
    } else if (diff > 1) {
      break;
    }
    // diff === 0 (multiple events same day) → keep walking
  }
  return streak;
}