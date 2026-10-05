"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import {
  type DiscoverGroup,
  type DiscoverPerson,
  type DiscoverPost,
} from "@/components/groups/discoverTypes";
import { UserSuggestionCard } from "@/components/groups/UserSuggestionCard";
import { OnlineUserCarousel } from "@/components/groups/OnlineUserCarousel";

interface DiscoverForYouProps {
  onOpenProfile: (username: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenPost: (postId: string) => void;
}

/**
 * Personalized "Dành cho bạn" feed on the Discover page.
 *
 * Composition of three data sources (all already on the server):
 *   1. /api/ai/discover  — AI-ranked user compatibility
 *   2. /api/posts/trending — engagement-ranked posts (last 7 days)
 *   3. /api/groups/discover — public groups the viewer hasn't joined
 *
 * Layout, top to bottom:
 *   [Online carousel]
 *   [People you may know]
 *   [Posts trending this week]
 *   [Public groups for you]
 *
 * The four blocks are rendered in this order because each one
 * progressively widens the viewer's scope (people → posts → groups).
 *
 * Each block has its own loading state — a slow AI call won't hold up
 * the posts or groups underneath.
 */
export function DiscoverForYou({
  onOpenProfile,
  onOpenGroup,
  onOpenPost,
}: DiscoverForYouProps) {
  // ── People (AI-ranked) ──
  const [people, setPeople] = useState<DiscoverPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);

  // ── Posts (trending) ──
  const [posts, setPosts] = useState<DiscoverPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // ── Groups ──
  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  // ── Errors per block ──
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  // ── Dismissed suggestions (kept local — they're "for you" only) ──
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());

  const loadPeople = useCallback(async () => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const res = await fetch("/api/ai/discover?filter=all&limit=20", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results?: any[] };
      const raw = data?.results ?? [];
      // /api/ai/discover returns `aiScore` etc.; normalize to the
      // shape DiscoverPerson expects so the rest of the page is
      // agnostic to which endpoint populated it.
      const normalized: DiscoverPerson[] = raw.map((p: any) => ({
        id: p.id,
        name: p.name,
        username: p.username,
        avatar: p.avatar,
        bio: p.bio,
        age: 0,
        compatibility: p.aiScore ?? 0,
        compatibilityTier:
          p.aiScore >= 70 ? "high" : p.aiScore >= 40 ? "medium" : "low",
        compatibilityReasons: p.aiReasons ?? [],
        distance: "—",
        online: !!p.online,
        presenceLabel: p.lastActive ?? "",
        dotColor: p.online ? "green" : "muted",
        mutualFriends: p.mutualFriends ?? 0,
        hobbies: p.hobbies ?? null,
        occupation: p.occupation ?? null,
        city: null,
        country: null,
      }));
      setPeople(normalized);
    } catch (e) {
      setPeopleError(e instanceof Error ? e.message : "Không tải được");
    } finally {
      setPeopleLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(null);
    try {
      const res = await fetch("/api/posts/trending?limit=8", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: DiscoverPost[] };
      setPosts(Array.isArray(data?.items) ? data!.items : []);
    } catch (e) {
      setPostsError(e instanceof Error ? e.message : "Không tải được");
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const res = await fetch("/api/groups/discover?limit=6", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DiscoverGroup[];
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      setGroupsError(e instanceof Error ? e.message : "Không tải được");
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeople();
    loadPosts();
    loadGroups();
  }, [loadPeople, loadPosts, loadGroups]);

  // Filter out dismissed people for the suggestion list. Online
  // carousel always shows everyone (they're transient anyway).
  const visibleSuggestions = useMemo(
    () => people.filter((p) => !dismissedIds.has(p.id)),
    [people, dismissedIds],
  );
  const online = useMemo(
    () => people.filter((p) => p.online),
    [people],
  );

  const dismissSuggestion = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* ── 1. Online carousel ── */}
      {online.length > 0 && (
        <OnlineUserCarousel users={online} onOpenProfile={onOpenProfile} />
      )}

      {/* ── 2. People you may know ── */}
      <Section
        title="Có thể bạn quen"
        subtitle="Gợi ý dựa trên sở thích và bạn bè chung"
        loading={peopleLoading}
        error={peopleError}
        onRetry={loadPeople}
      >
        {visibleSuggestions.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleSuggestions.slice(0, 6).map((p) => (
              <UserSuggestionCard
                key={p.id}
                user={p}
                onOpenProfile={onOpenProfile}
                onDismiss={dismissSuggestion}
              />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#94a3b8]">
            Hãy hoàn thiện hồ sơ (sở thích, thành phố, công việc) để nhận gợi ý tốt hơn.
          </p>
        )}
      </Section>

      {/* ── 3. Posts trending ── */}
      <Section
        title="Bài viết nổi bật tuần này"
        subtitle="Được nhiều người thích, lưu và chia sẻ nhất"
        loading={postsLoading}
        error={postsError}
        onRetry={loadPosts}
      >
        {posts.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {posts.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenPost(p.id)}
                className="group relative aspect-square overflow-hidden rounded-xl"
              >
                {p.media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.media_url}
                    alt={p.caption ?? ""}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500/30 to-cyan-500/30 p-2 text-center text-[10px] text-white">
                    {p.caption ?? ""}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <Icon name="heart" size={8} className="mr-0.5 inline" />
                  {p.like_count}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#94a3b8]">Chưa có bài viết trending.</p>
        )}
      </Section>

      {/* ── 4. Groups ── */}
      <Section
        title="Nhóm dành cho bạn"
        subtitle="Nhóm công khai bạn có thể tham gia"
        loading={groupsLoading}
        error={groupsError}
        onRetry={loadGroups}
        last
      >
        {groups.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {groups.slice(0, 4).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onOpenGroup(g.id)}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition-colors hover:bg-white/[0.06]"
              >
                <SafeAvatar
                  src={g.avatarUrl}
                  username={g.creatorUsername}
                  name={g.name}
                  alt={g.name}
                  imgClassName="size-full rounded-xl object-cover"
                  className="size-11 shrink-0 rounded-xl ring-2 ring-white/10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-white">{g.name}</p>
                  <p className="truncate text-[10px] text-[#94a3b8]">
                    {g.memberCount} thành viên
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#94a3b8]">
            Bạn đã tham gia tất cả nhóm công khai hoặc chưa có nhóm nào để gợi ý.
          </p>
        )}
      </Section>
    </div>
  );
}

/* ─── Section block ───────────────────────────────────────────────────── */

function Section({
  title,
  subtitle,
  loading,
  error,
  onRetry,
  children,
  last,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`px-4 py-3 ${last ? "" : "border-b border-white/5"}`}>
      <header className="mb-2">
        <h2 className="text-[12px] font-black text-white">{title}</h2>
        {subtitle && <p className="text-[10px] text-[#94a3b8]">{subtitle}</p>}
      </header>
      {loading ? (
        <div className="flex items-center gap-2 text-[10px] text-[#94a3b8]">
          <span className="size-3 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
          Đang tải…
        </div>
      ) : error ? (
        <div>
          <p className="text-[11px] text-red-400">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[10px] font-bold text-cyan-300 hover:text-cyan-200"
          >
            Thử lại
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}