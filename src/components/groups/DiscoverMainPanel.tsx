"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserMenu } from "@/hooks/useUserMenu";
import { DiscoverHeader } from "@/components/groups/DiscoverHeader";
import { DiscoverForYou } from "@/components/groups/DiscoverForYou";
import { DiscoverPeople } from "@/components/groups/DiscoverPeople";
import { DiscoverGroups } from "@/components/groups/DiscoverGroups";
import { DiscoverPosts } from "@/components/groups/DiscoverPosts";
import { DiscoverReels } from "@/components/groups/DiscoverReels";
import {
  DEFAULT_FILTERS,
  type DiscoverFilters,
  type DiscoverTabKey,
} from "@/components/groups/discoverTypes";

/**
 * Root panel for the Discover page (`/discover`).
 *
 * Responsibilities:
 *   - Owns the active tab + filter state and passes them down to each
 *     child panel.
 *   - Owns the search query (debounced inside the header).
 *   - Owns navigation — when a child emits "open profile / group /
 *     post", we forward to the relevant page. Children don't navigate
 *     directly so they stay decoupled from the router.
 *
 * Each tab is mounted unconditionally so its component state (e.g.
 * For You's `dismissedIds`) survives tab switches — feels snappier
 * than tearing the tree down on every change. Tabs that don't need
 * state (Reels, Posts, Groups) still benefit from the cached fetch
 * results.
 */
export function DiscoverMainPanel() {
  const router = useRouter();
  const userMenu = useUserMenu();
  const myId = (userMenu.session?.user as { id?: string } | undefined)?.id ?? null;

  const [activeTab, setActiveTab] = useState<DiscoverTabKey>("for-you");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);

  // ── Navigation helpers (children call up via props) ──
  const openProfile = useCallback(
    (username: string) => {
      router.push(`/profile/${username}`);
    },
    [router],
  );
  const openGroup = useCallback(
    (groupId: string) => {
      router.push(`/groups/${groupId}`);
    },
    [router],
  );
  const openPost = useCallback(
    (postId: string) => {
      // Open the existing detail modal via URL search params so deep
      // links work. The PostDetailModal listens for ?post=<id>.
      router.push(`/discover?post=${postId}`);
    },
    [router],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-black">
      <DiscoverHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        search={search}
        onSearchChange={setSearch}
      />

      {/* ── Active tab ── */}
      <div className="min-h-0 flex-1">
        {activeTab === "for-you" && (
          <DiscoverForYou
            onOpenProfile={openProfile}
            onOpenGroup={openGroup}
            onOpenPost={openPost}
          />
        )}
        {activeTab === "people" && (
          <DiscoverPeople
            search={search}
            filter={filters.people}
            onFilterChange={(next) =>
              setFilters((f) => ({ ...f, people: next }))
            }
            onOpenProfile={openProfile}
          />
        )}
        {activeTab === "video" && (
          <DiscoverReels
            search={search}
            filter={filters.video}
            onFilterChange={(next) =>
              setFilters((f) => ({ ...f, video: next }))
            }
            myId={myId}
          />
        )}
        {activeTab === "groups" && (
          <DiscoverGroups
            search={search}
            onOpenGroup={openGroup}
          />
        )}
        {activeTab === "posts" && (
          <DiscoverPosts
            search={search}
            filter={filters.posts}
            onFilterChange={(next) =>
              setFilters((f) => ({ ...f, posts: next }))
            }
            onOpenPost={openPost}
            onOpenProfile={openProfile}
          />
        )}
      </div>
    </div>
  );
}