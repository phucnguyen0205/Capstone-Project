"use client";

import { useState, useCallback } from "react";
import { GroupsTopBar } from "@/components/groups/GroupsTopBar";
import { DiaryLeftPanel } from "@/components/diary/DiaryLeftPanel";
import { DiaryCenterPanel } from "@/components/diary/DiaryCenterPanel";
import { DiaryRightPanel } from "@/components/diary/DiaryRightPanel";

/**
 * Diary layout shell. State that's shared between the left tier-list
 * and the centre feed (the `lens` filter) is lifted here so clicking
 * a persona on the left switches the centre panel and vice versa.
 *
 * Tab structure:
 *   - "feed"  : the multi-lens diary posts (default)
 *   - "mine"  : could be a future tab for "only my posts"
 *
 * The encounter + radar panels on the right are self-contained — they
 * own their own loading state.
 */
export function DiaryDashboard() {
  // Lifted tier filter so left personas ↔ centre feed stay in sync.
  const [activeTier, setActiveTier] = useState<
    "all" | "public" | "friends" | "close" | "private"
  >("all");

  // Bump after the centre publishes a new post so left/right can
  // refresh their counts.
  const [refreshSignal, setRefreshSignal] = useState(0);
  const triggerRefresh = useCallback(() => {
    setRefreshSignal((v) => v + 1);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black">
      <GroupsTopBar />
      <main className="flex w-full min-h-0 flex-1 items-start gap-4 overflow-hidden px-6 pb-6 pt-4">
        <DiaryLeftPanel
          activeTier={activeTier}
          onSelectTier={setActiveTier}
          refreshSignal={refreshSignal}
        />
        <DiaryCenterPanel
          activeTier={activeTier}
          onSelectTier={setActiveTier}
          refreshSignal={refreshSignal}
          onPublished={triggerRefresh}
        />
        <DiaryRightPanel />
      </main>
    </div>
  );
}