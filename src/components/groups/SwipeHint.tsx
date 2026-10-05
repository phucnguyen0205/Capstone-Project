"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

interface SwipeHintProps {
  /** Called when the user swipes right on a reel (dismiss). */
  onDismiss: () => void;
  /** Called when the user taps the "Bỏ qua" button — alternative
   *  to swiping for users who don't discover the gesture. */
  onTapDismiss?: () => void;
}

/**
 * Tiny floating chip that teaches the swipe-to-dismiss gesture.
 *
 * Two-part design:
 *   1. An always-visible pill in the bottom-right that lets the user
 *      tap to dismiss (no gesture learning required).
 *   2. A swipe hint that appears once per session and fades after
 *      the first dismissal.
 *
 * Renders next to the existing reels UI; doesn't change the
 * ReelsPlayer's layout.
 */
export function SwipeHint({ onDismiss, onTapDismiss }: SwipeHintProps) {
  const [hintShown, setHintShown] = useState(false);

  useEffect(() => {
    // Show the hint after 4s the first time the user lands here. We
    // never show it again — once they've discovered the gesture or
    // tapped the button, we trust them.
    const seen = typeof window !== "undefined"
      ? window.localStorage.getItem("discover.swipeHintSeen.v1")
      : "1";
    if (seen) return;
    const t = setTimeout(() => setHintShown(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("discover.swipeHintSeen.v1", "1");
    }
    setHintShown(false);
    onTapDismiss?.();
    onDismiss();
  };

  return (
    <>
      {/* ── Always-visible "Bỏ qua" pill ── */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 bottom-24 z-20 flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md transition-colors hover:bg-black/75"
        aria-label="Bỏ qua video"
      >
        <Icon name="xCircle" size={11} />
        Bỏ qua
      </button>

      {/* ── First-time swipe hint (auto-fades) ── */}
      {hintShown && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-1/3 z-30 -translate-x-1/2 animate-pulse rounded-full border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-[12px] font-bold text-cyan-200 backdrop-blur-md"
        >
          Vuốt sang phải để bỏ qua video
        </div>
      )}
    </>
  );
}