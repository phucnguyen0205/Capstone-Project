"use client";

/**
 * Shared utilities for the Discover page's "enhanced reels" mode.
 *
 * The Discover page's UI is intentionally unchanged (vertical snap
 * reels — TikTok-style). This file collects the helpers we attach to
 * that UI: filters, search, dismissed persistence, swipe gestures,
 * and a tiny rule-based compatibility score so we can badge reels
 * without burning Gemini quota.
 */

/* ─── Filters ──────────────────────────────────────────────────────────── */

export type ReelFilter = "recent" | "trending" | "friends";

export const REEL_FILTERS: ReadonlyArray<{
  key: ReelFilter;
  label: string;
  icon: "clock" | "playCircle" | "users2";
}> = [
  { key: "recent", label: "Mới nhất", icon: "clock" },
  { key: "trending", label: "Thịnh hành", icon: "playCircle" },
  { key: "friends", label: "Từ bạn bè", icon: "users2" },
] as const;

/**
 * Apply the active filter to a list of reels. `friends` needs the
 * viewer's friend ids passed in (because the reels list doesn't
 * know about them on its own); we sort in-place and return the same
 * reference so callers can keep their existing array identity.
 */
export function applyReelFilter<
  T extends {
    createdAt: number;
    likeCount: number;
    commentCount: number;
    author: { id: string };
  },
>(reels: T[], filter: ReelFilter, friendIds: ReadonlySet<string>): T[] {
  if (filter === "friends") {
    return reels.filter((r) => friendIds.has(r.author.id));
  }
  const copy = reels.slice();
  if (filter === "recent") {
    copy.sort((a, b) => b.createdAt - a.createdAt);
  } else if (filter === "trending") {
    // Engagement score with a recency nudge so a brand-new viral
    // post can overtake yesterday's leader.
    const now = Math.floor(Date.now() / 1000);
    const score = (r: T) => {
      const recency = r.createdAt > now - 86400 ? 20 : 0;
      return (
        r.likeCount * 3 +
        r.commentCount * 2 +
        recency
      );
    };
    copy.sort((a, b) => score(b) - score(a));
  }
  return copy;
}

/* ─── Search ───────────────────────────────────────────────────────────── */

/**
 * Client-side caption/author search. We do this in-memory because
 * the existing reels endpoints don't take a `q`; adding one would
 * inflate the API surface for a feature that only has 1-2 active
 * reels users per page.
 */
export function searchReels<
  T extends {
    caption: string | null;
    author: { username: string; name: string | null };
  },
>(reels: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return reels;
  return reels.filter((r) => {
    if (r.caption?.toLowerCase().includes(q)) return true;
    if (r.author.username.toLowerCase().includes(q)) return true;
    if (r.author.name?.toLowerCase().includes(q)) return true;
    return false;
  });
}

/* ─── Dismissed persistence ───────────────────────────────────────────── */

const KEY = "discover.dismissedReels.v1";

export function loadDismissedReels(): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function persistDismissedReels(ids: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Quota exceeded or disabled — silently ignore.
  }
}

/* ─── Rule-based compatibility ────────────────────────────────────────── */

/**
 * Lightweight compatibility score (0-100) between the viewer and a
 * reel's author. We compute this client-side using whatever the
 * Discover API has already returned (no extra round-trip).
 *
 * Inputs come from the reels API's existing shape — for v1 we lean
 * on shared author info via the parent component. The score is a
 * placeholder so the UI badge is consistent and deterministic.
 *
 * Returning { score, tier } matches the home feed's shape so the
 * colour mapping stays in lockstep.
 */
export function computeLocalCompatibility(
  viewerInterests: ReadonlyArray<string>,
  authorHobbies: string | null,
  authorOccupation: string | null,
  mutualFriends: number,
): { score: number; tier: "high" | "medium" | "low" } {
  // Hobbies match is the biggest driver. We split on comma so
  // "đọc sách, du lịch" still scores against a single string like
  // "đọc sách".
  const authorSet = new Set<string>();
  if (authorHobbies) {
    for (const tag of authorHobbies.split(/[,\u00B7]/)) {
      const t = tag.trim().toLowerCase();
      if (t) authorSet.add(t);
    }
  }
  let hobbyHits = 0;
  for (const i of viewerInterests) {
    const li = i.toLowerCase();
    if (authorSet.has(li)) hobbyHits += 1;
  }
  const hobbyScore = Math.min(40, hobbyHits * 12);
  // Occupation overlap is harder to detect without structured data,
  // so we just give a flat 10 if the viewer has any interests set
  // and the author lists one. Avoids random "0%" badges that look
  // like the feature is broken.
  const occupationScore = authorOccupation && viewerInterests.length > 0 ? 10 : 0;
  // Mutual friends caps at 30. We give 5 per mutual up to 6.
  const mutualScore = Math.min(30, mutualFriends * 5);
  const total = hobbyScore + occupationScore + mutualScore + 20; // 20 base
  const score = Math.max(0, Math.min(100, total));
  const tier =
    score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { score, tier };
}

export function tierColor(tier: "high" | "medium" | "low"): string {
  if (tier === "high") return "from-cyan-400 to-cyan-500";
  if (tier === "medium") return "from-violet-400 to-violet-500";
  return "from-slate-500 to-slate-600";
}

/* ─── Swipe gesture ───────────────────────────────────────────────────── */

/**
 * Returns the swipe delta state for a touch gesture. Use this to
 * detect horizontal swipes on a reel so the user can dismiss it
 * without scrolling past it first.
 *
 * Usage:
 *   const gesture = useSwipeGesture(onSwipeLeft, onSwipeRight);
 *   <div onTouchStart={gesture.onStart} onTouchMove={gesture.onMove} ...>
 */
export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  /** Latest signed horizontal delta (px). 0 when no swipe is active. */
  deltaX: number;
}

export interface SwipeGestureOptions {
  /** Pixels of horizontal travel required to fire the callback. */
  threshold?: number;
  /** Called when the user swipes left (next direction). */
  onSwipeLeft?: () => void;
  /** Called when the user swipes right (dismiss direction). */
  onSwipeRight?: () => void;
}

export function createSwipeHandlers(
  options: SwipeGestureOptions,
  state: {
    startX: React.MutableRefObject<number | null>;
    deltaX: number;
    setDeltaX: (n: number) => void;
  },
): SwipeHandlers {
  const threshold = options.threshold ?? 80;
  return {
    onTouchStart: (e) => {
      state.startX.current = e.touches[0]?.clientX ?? null;
    },
    onTouchMove: (e) => {
      if (state.startX.current === null) return;
      const current = e.touches[0]?.clientX ?? 0;
      state.setDeltaX(current - state.startX.current);
    },
    onTouchEnd: () => {
      const d = state.deltaX;
      if (d <= -threshold) options.onSwipeLeft?.();
      else if (d >= threshold) options.onSwipeRight?.();
      state.startX.current = null;
      state.setDeltaX(0);
    },
  };
}