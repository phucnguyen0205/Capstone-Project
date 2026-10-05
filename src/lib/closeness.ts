"use client";

/**
 * Client-side hooks for the Closeness / Mirror feature.
 *
 * Pure logic (computeCloseness, computeStreakDays, MIRROR_CONFIG, pairKey)
 * lives in `@/lib/closeness-core` and is safe to import from API routes.
 */

import { useCallback, useEffect, useState } from "react";
import type { ClosenessInfo } from "@/lib/closeness-core";
import { applyLensToCloseness, type LensLevel } from "@/lib/closeness-core";

export { MIRROR_CONFIG, pairKey, computeCloseness, computeStreakDays, getMirrorConfigForLens } from "@/lib/closeness-core";
export type { ClosenessInfo, MirrorSettings, LensLevel } from "@/lib/closeness-core";

/**
 * Result type returned by the mirror hooks. It augments the raw
 * server `ClosenessInfo` with per-lens mirror state so callers can
 * drive their blur / lock UI without re-deriving the rules.
 */
export type MirroredCloseness = ClosenessInfo & {
  friendId: string;
  mirrorEnabled: boolean;
  requiredImageFull: number;
  requiredVideoUnlock: number;
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Fetch the closeness record between the viewer and a specific friend,
 * then re-derive the per-lens mirror state for the post being rendered.
 *
 * Pass `lens="public"` to disable the mirror entirely (no blur, video
 * unlocked). The hook returns `null` while the request is in flight
 * AND when the mirror is disabled so the caller can fall back to a
 * fully-revealed render.
 */
export function useCloseness(
  friendId: string | null | undefined,
  lens: LensLevel | string = "friends",
): {
  info: MirroredCloseness | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [raw, setRaw] = useState<ClosenessInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!friendId) {
      setRaw(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/closeness/${friendId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | (ClosenessInfo & { friendId?: string })
        | { error: string }
        | null;
      if (data && "pairKey" in data) setRaw(data);
    } catch {
      /* ignore — keep previous info */
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Derive the per-lens mirror view on every render. We keep the
  // raw record around so future lens changes don't trigger another
  // network round-trip.
  const info: MirroredCloseness | null = raw && friendId
    ? { ...applyLensToCloseness(raw, lens), friendId }
    : null;

  return { info, loading, refresh };
}

/**
 * Fetch closeness for all members of the viewer's group in a single
 * round-trip. The GroupsLeftSidebar uses this to render the horizontal
 * "current points / target points" progress bar.
 *
 * Note: this hook returns raw ClosenessInfo without per-lens lens
 * derivation — callers that need the mirror UI should call
 * `applyLensToCloseness` on the individual item.
 */
export function useGroupCloseness(): {
  byUserId: Record<string, ClosenessInfo & { friendId: string }>;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [byUserId, setByUserId] = useState<
    Record<string, ClosenessInfo & { friendId: string }>
  >({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/groups/closeness", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | { items: Array<ClosenessInfo & { friendId: string }> }
        | { error: string }
        | null;
      if (data && "items" in data && Array.isArray(data.items)) {
        const map: Record<string, ClosenessInfo & { friendId: string }> = {};
        for (const item of data.items) map[item.friendId] = item;
        setByUserId(map);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { byUserId, loading, refresh };
}