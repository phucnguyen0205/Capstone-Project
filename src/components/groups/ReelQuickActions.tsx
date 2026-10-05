"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  computeLocalCompatibility,
  tierColor,
  type ReelItem,
} from "@/components/groups/reelEnhancements";

interface ReelQuickActionsProps {
  reel: ReelItem;
  /** Viewer's stored interest tags (from profile.hobbies). Used for
   *  the rule-based compatibility badge. */
  viewerInterests: ReadonlyArray<string>;
  /** Number of mutual friends between viewer and this reel's author.
   *  Pre-computed in the parent so we don't make N requests. */
  mutualFriends: number;
  /** When the user reports a reel, parent should open the existing
   *  report modal. The quick action just shows a confirmation then
   *  fires the callback. */
  onReport: (reelId: string) => void;
}

/**
 * Vertical action column that floats to the right of a reel slide.
 * Adds two upgrades on top of the existing like/comment/share:
 *   1. Save (bookmark) — calls /api/posts/[id]/save, tracks own state.
 *   2. Report — fires onReport callback so the parent can show the
 *      existing report modal.
 *   3. AI compatibility badge — small chip above the like button.
 *      Shows the viewer how likely they are to vibe with the author.
 *
 * All additions are positioned absolutely so the original
 * ReelsPlayer layout is unchanged.
 */
export function ReelQuickActions({
  reel,
  viewerInterests,
  mutualFriends,
  onReport,
}: ReelQuickActionsProps) {
  // ── Save state ──
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // We need to ask the API to know if this reel is already saved
  // by the viewer; we do a tiny HEAD/GET on mount. If the endpoint
  // doesn't return the flag, we default to unsaved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${reel.id}/save`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as
          | { saved?: boolean }
          | null;
        if (!cancelled && data?.saved) setSaved(true);
      } catch {
        // Network blip — keep unsaved, user can retry by tapping.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reel.id]);

  const toggleSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    // Optimistic toggle so the user sees the change immediately.
    const next = !saved;
    setSaved(next);
    try {
      const res = await fetch(`/api/posts/${reel.id}/save`, {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        // Roll back on failure.
        setSaved(!next);
      }
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }, [busy, reel.id, saved]);

  // ── Compatibility (rule-based, no AI) ──
  const { score, tier } = computeLocalCompatibility(
    viewerInterests,
    reelHobbies(reel),
    reelOccupation(reel),
    mutualFriends,
  );

  return (
    <div className="pointer-events-none absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-3">
      {/* ── AI compatibility badge ── */}
      <div
        className={`pointer-events-auto flex flex-col items-center gap-0.5 rounded-full bg-gradient-to-r ${tierColor(
          tier,
        )} px-1.5 py-1 text-[#0c0918] shadow-md`}
        title={`Độ tương thích với tác giả: ${score}%`}
      >
        <Icon name="zap" size={11} />
        <span className="text-[9px] font-black">{score}%</span>
      </div>

      {/* ── Save button (bookmark) ── */}
      <button
        type="button"
        onClick={toggleSave}
        disabled={busy}
        className="pointer-events-auto flex flex-col items-center gap-1 text-white drop-shadow"
        aria-label={saved ? "Bỏ lưu" : "Lưu video"}
      >
        <div
          className={`flex size-12 items-center justify-center rounded-full backdrop-blur-sm transition-transform ${
            saved ? "bg-amber-400/30 scale-110" : "bg-black/30"
          }`}
        >
          <Icon
            name={saved ? "bookmark" : "bookmark"}
            size={22}
            className={saved ? "text-amber-300" : "text-white"}
          />
        </div>
        <span className="text-[10px] font-bold drop-shadow">
          {saved ? "Đã lưu" : "Lưu"}
        </span>
      </button>

      {/* ── Report button (flag) ── */}
      <button
        type="button"
        onClick={() => onReport(reel.id)}
        className="pointer-events-auto flex flex-col items-center gap-1 text-white drop-shadow"
        aria-label="Báo cáo video"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-colors hover:bg-red-500/40">
          <Icon name="flag" size={20} className="text-white" />
        </div>
        <span className="text-[10px] font-bold drop-shadow">Báo cáo</span>
      </button>
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

// Reels API doesn't ship hobbies/occupation for the author; we read
// them from the author object when the parent has attached them
// (DiscoverForYou normalises them in). For the original ReelItem
// shape (no hobbies), the badge still works — it just gives a flat
// 20 base score and the tier stays neutral.
function reelHobbies(r: ReelItem): string | null {
  const anyR = r as ReelItem & { author?: { hobbies?: string | null } };
  return anyR.author?.hobbies ?? null;
}
function reelOccupation(r: ReelItem): string | null {
  const anyR = r as ReelItem & { author?: { occupation?: string | null } };
  return anyR.author?.occupation ?? null;
}