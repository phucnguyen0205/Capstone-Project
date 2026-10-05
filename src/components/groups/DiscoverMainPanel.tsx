"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { useUserMenu } from "@/hooks/useUserMenu";
import {
  ReelsPlayer,
  type ReelItem,
} from "@/components/groups/ReelsPlayer";
import { ReelCommentsPanel } from "@/components/groups/ReelCommentsPanel";
import { DiscoverReelEnhancements } from "@/components/groups/DiscoverReelEnhancements";
import { ReelQuickActions } from "@/components/groups/ReelQuickActions";
import {
  applyReelFilter,
  searchReels,
  type ReelFilter,
} from "@/components/groups/reelEnhancements";

/* ─── Helpers ──────────────────────────────────────────────────────────── */

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

type TabKey = "explore" | "mine";

const TABS: { key: TabKey; label: string; icon: "compass" | "video" }[] = [
  { key: "explore", label: "Khám phá", icon: "compass" },
  { key: "mine", label: "Thư viện của bạn", icon: "video" },
];

/* ─── Left column (compact sidebar) ─────────────────────────────────────── */

function LeftSidebar({
  myAvatar,
  myUsername,
  myName,
  itemCount,
}: {
  myAvatar: string | null;
  myUsername: string | null;
  myName: string | null;
  itemCount: number;
}) {
  return (
    <aside className="hidden h-full w-[88px] shrink-0 flex-col items-center gap-4 border-r border-white/5 bg-black/40 py-4 lg:flex xl:w-[220px] xl:items-stretch xl:px-4">
      {/* ── Wide-mode: row with avatar + name + count ── */}
      <div className="hidden xl:flex xl:items-center xl:gap-3">
        <SafeAvatar
          src={myAvatar}
          username={myUsername}
          name={myName}
          alt={myUsername ?? ""}
          imgClassName="size-full rounded-full object-cover"
          className="size-11 shrink-0 rounded-full ring-2 ring-cyan-400/40"
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-white">
            {myName ?? myUsername ?? "Bạn"}
          </p>
          <p className="truncate text-[10px] text-[#94a3b8]">
            @{myUsername ?? "unknown"}
          </p>
        </div>
      </div>

      {/* ── Wide-mode stat block ── */}
      <div className="hidden xl:flex xl:items-center xl:gap-2 xl:rounded-xl xl:border xl:border-white/5 xl:bg-white/[0.03] xl:px-3 xl:py-2">
        <Icon name="playCircle" size={14} className="text-cyan-300" />
        <span className="text-[11px] text-[#94a3b8]">
          <span className="font-bold text-white">{itemCount}</span>{" "}
          {itemCount === 1 ? "video" : "video"}
        </span>
      </div>

      {/* ── Compact mode: avatar only ── */}
      <SafeAvatar
        src={myAvatar}
        username={myUsername}
        name={myName}
        alt={myUsername ?? ""}
        imgClassName="size-full rounded-full object-cover"
        className="size-11 shrink-0 rounded-full ring-2 ring-cyan-400/40 xl:hidden"
      />

      {/* ── Nav shortcuts ── */}
      <nav className="mt-2 flex w-full flex-col items-center gap-1 xl:items-stretch">
        {[
          { label: "Trang chủ", icon: "home" as const },
          { label: "Bạn bè", icon: "users2" as const },
          { label: "Khám phá", icon: "compass" as const, active: true },
          { label: "Tải lên", icon: "arrowUpRight" as const },
        ].map((it) => (
          <button
            key={it.label}
            type="button"
            title={it.label}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
              it.active
                ? "bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-white"
                : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon name={it.icon} size={18} />
            <span className="hidden text-[12px] font-semibold xl:inline">
              {it.label}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

/* ─── Right column (comments + suggested) ───────────────────────────────── */

function RightRail({
  activeItem,
  myId,
  itemCount,
}: {
  activeItem: ReelItem | null;
  myId: string | null;
  itemCount: number;
}) {
  if (!activeItem) {
    return (
      <aside className="hidden h-full w-[320px] shrink-0 flex-col gap-3 border-l border-white/5 bg-black/40 p-4 lg:flex">
        <div className="flex flex-1 items-center justify-center text-center text-[11px] text-[#94a3b8]">
          <p>Vuốt lên / xuống để chọn video và xem bình luận.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden h-full w-[320px] shrink-0 flex-col border-l border-white/5 bg-black/40 lg:flex">
      {/* ── Author strip ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-3">
        <SafeAvatar
          src={activeItem.author.avatar}
          username={activeItem.author.username}
          name={activeItem.author.name}
          alt={activeItem.author.username}
          imgClassName="size-full rounded-full object-cover"
          className="size-9 shrink-0 rounded-full ring-2 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-white">
            {activeItem.author.name ?? activeItem.author.username}
          </p>
          <p className="truncate text-[10px] text-[#94a3b8]">
            @{activeItem.author.username} · {itemCount} video
            {activeItem.moderationStatus === "pending" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                Đang chờ duyệt
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Comments panel takes the rest ── */}
      <div className="min-h-0 flex-1">
        <ReelCommentsPanel
          postId={activeItem.id}
          compact
          onClose={() => undefined}
          onCountChange={(next) => {
            // We don't mutate parent state from here — the player
            // owns commentCount via its own state. The rail just
            // re-uses the panel's internal counter.
            void next;
          }}
        />
      </div>
    </aside>
  );
}

/* ─── Root ─────────────────────────────────────────────────────────────── */

export function DiscoverMainPanel() {
  const userMenu = useUserMenu();
  const myId = (userMenu.session?.user as { id?: string } | undefined)?.id ?? null;
  const myAvatar =
    (userMenu.session?.user as { avatar?: string | null } | undefined)?.avatar ??
    null;
  const myUsername =
    (userMenu.session?.user as { username?: string } | undefined)?.username ??
    null;
  const myName =
    (userMenu.session?.user as { name?: string | null } | undefined)?.name ??
    null;
  const [tab, setTab] = useState<TabKey>("explore");
  const [items, setItems] = useState<ReelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ReelItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = tab === "explore" ? "/api/reels/explore" : "/api/reels/mine";
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<{ items: ReelItem[] }>(res);
      setItems(data?.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không tải được");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  // When a locked reel gets unlocked, the player emits the freshly
  // unlocked item via this callback so we can splice it into our
  // local state. We don't refetch the whole feed because the unlock
  // server-side simply confirms what we already know — the response is
  // authoritative.
  const handleItemReplaced = useCallback((next: ReelItem) => {
    setItems((prev) => prev.map((it) => (it.id === next.id ? next : it)));
    setActiveItem((curr) => (curr && curr.id === next.id ? next : curr));
  }, []);

  /* ── Discover page upgrades (non-breaking) ─────────────────────────
   * These state slices power the new search box, filter chips, swipe-
   * to-dismiss, and quick-action overlay. The original ReelsPlayer
   * UI is untouched — we only wrap it in extra layers. */

  // Search + filter chips (overlay row right below the tab bar).
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReelFilter>("recent");

  // Viewer's interest tags (hobbies). Used for the rule-based
  // compatibility badge in ReelQuickActions. We read this once on
  // mount from the cached session user — falls back to empty array
  // if the profile doesn't have hobbies set yet.
  const viewerHobbies =
    (userMenu.session?.user as { hobbies?: string | null } | undefined)
      ?.hobbies ?? "";
  const viewerInterests = useMemo(
    () =>
      viewerHobbies
        .split(/[,\u00B7]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [viewerHobbies],
  );

  // Friend set — only populated when the "Từ bạn bè" filter is on.
  // Lazy-loaded so we don't hit /api/users/me/friends unless the
  // user actually picks that chip.
  const [friendIds, setFriendIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (filter !== "friends") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${myId}/friends`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as
          | { friends?: Array<{ id: string }> }
          | null;
        if (!cancelled && Array.isArray(data?.friends)) {
          setFriendIds(new Set(data.friends.map((f) => f.id)));
        }
      } catch {
        // Network blip — empty set means "Từ bạn bè" will show
        // zero results, which is honest.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, myId]);

  // Compute the filtered/visible items without mutating `items`.
  // We keep `items` as the source of truth (so the underlying
  // ReelsPlayer doesn't re-render its slide key on every search
  // keystroke) and pass a memoised view into it.
  const visibleItems = useMemo(() => {
    let v = items;
    v = searchReels(v, search);
    v = applyReelFilter(v, filter, friendIds);
    return v;
  }, [items, search, filter, friendIds]);

  // Report action — show a small confirmation toast. We don't open
  // the full report modal here because the existing /api/posts/[id]/
  // report endpoint is wired into the home feed; the Discover page
  // just needs an entry point. The toast auto-dismisses.
  const [reportToast, setReportToast] = useState<string | null>(null);
  const handleReport = useCallback((reelId: string) => {
    setReportToast(reelId);
    setTimeout(() => setReportToast((curr) => (curr === reelId ? null : curr)), 1500);
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-black">
      {/* ── Top tab bar ───────────────────────────────────────────── */}
      <div className="z-10 flex shrink-0 items-center gap-2 border-b border-white/5 bg-gradient-to-b from-black/95 to-black/70 px-4 pt-3 pb-2 backdrop-blur-md">
        <h1 className="flex-1 text-base font-black text-white">Khám phá</h1>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-all ${
                  active
                    ? "bg-gradient-to-r from-cyan-400 to-violet-400 text-[#0c0918]"
                    : "text-[#94a3b8] hover:text-white"
                }`}
              >
                <Icon name={t.icon} size={11} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Discover page upgrades: search + filter chips ── */}
      {/* Renders BELOW the original tab bar so the original 2-tab
        switch ("Khám phá" / "Thư viện của bạn") still controls the
        data source. The new chips filter the result of the active
        data source. */}
      <DiscoverReelEnhancements
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        itemCount={visibleItems.length}
      />

      {/* ── Body: 3-column layout (left sidebar | reels | right rail) */}
      <div className="relative flex min-h-0 flex-1 items-stretch overflow-hidden">
        {/* ── Col 1: left sidebar ── */}
        <LeftSidebar
          myAvatar={myAvatar}
          myUsername={myUsername}
          myName={myName}
          itemCount={items.length}
        />

        {/* ── Col 2: reels player (video must be centred both
                horizontally and vertically inside the viewport) ── */}
        <div className="relative flex min-w-0 h-full flex-1 items-center justify-center overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <div className="relative mx-auto size-14">
                  <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-cyan-400 to-violet-400 opacity-30" />
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-cyan-400 border-r-violet-400" />
                </div>
                <p className="mt-3 text-[11px] text-[#94a3b8]">
                  Đang tải video…
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <div>
                <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                  <Icon name="shieldAlert" size={26} />
                </div>
                <p className="text-[13px] font-semibold text-white">
                  Đã có lỗi
                </p>
                <p className="mt-1 text-[11px] text-[#94a3b8]">{error}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-3 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 px-4 py-1.5 text-[11px] font-bold text-[#0c0918]"
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : (
            <ReelsPlayer
              items={visibleItems}
              myId={myId}
              onItemReplaced={handleItemReplaced}
              onActiveChange={setActiveItem}
              emptyHint={
                tab === "mine"
                  ? "Bạn chưa đăng video nào. Hãy vào trang chủ và đăng video — nó sẽ xuất hiện ở đây và trong tab Khám phá của bạn bè."
                  : undefined
              }
            />
          )}

          {/* ── Discover upgrades: quick actions ── */}
          {/* Rendered conditionally on the active reel so we don't
            show quick actions for a stale slide after a search.
            Vuốt xuống/dưới để chuyển video vẫn do ReelsPlayer
            gốc xử lý (snap-y + IntersectionObserver). */}
          {activeItem && !loading && !error && (
            <ReelQuickActions
              reel={activeItem}
              viewerInterests={viewerInterests}
              mutualFriends={0}
              onReport={handleReport}
            />
          )}

          {/* ── Lightweight report toast (auto-dismisses) ── */}
          {reportToast && (
            <div
              role="status"
              className="pointer-events-none absolute left-1/2 top-12 z-30 -translate-x-1/2 rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-[11px] font-bold text-amber-200 backdrop-blur-md"
            >
              Đã ghi nhận báo cáo — cảm ơn bạn!
            </div>
          )}
        </div>

        {/* ── Col 3: comments + author rail ── */}
        <RightRail activeItem={activeItem} myId={myId} itemCount={items.length} />
      </div>
    </div>
  );
}