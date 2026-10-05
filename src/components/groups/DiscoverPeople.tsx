"use client";

import { useCallback, useEffect, useState } from "react";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { Icon } from "@/components/ui/Icon";
import {
  type DiscoverPerson,
  type PeopleFilter,
} from "@/components/groups/discoverTypes";

interface DiscoverPeopleProps {
  search: string;
  filter: PeopleFilter;
  onFilterChange: (next: PeopleFilter) => void;
  /** Click handler so the parent can route to the profile page. */
  onOpenProfile: (username: string) => void;
  /** Number of items to render per "load more" page. Defaults to 12. */
  pageSize?: number;
}

const FILTERS: ReadonlyArray<{ key: PeopleFilter; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "online", label: "Đang online" },
  { key: "nearby", label: "Gần bạn" },
  { key: "new", label: "Mới" },
];

/**
 * People grid for the Discover → Mọi người tab.
 *
 * Three concerns:
 *   1. Fetch users from /api/discover with `filter` + `search`.
 *   2. Render a responsive 2-3 column grid of profile cards.
 *   3. "Tải thêm" button paginates by `pageSize`.
 *
 * Cards always show the user's name, city (if any), online dot, mutual
 * friends count, and a coloured compatibility badge. Tapping anywhere
 * on the card opens the profile.
 */
export function DiscoverPeople({
  search,
  filter,
  onFilterChange,
  onOpenProfile,
  pageSize = 12,
}: DiscoverPeopleProps) {
  const [items, setItems] = useState<DiscoverPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("filter", filter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/discover?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DiscoverPerson[];
      setItems(Array.isArray(data) ? data : []);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = items.slice(0, page * pageSize);
  const hasMore = visible.length < items.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Filter chips ── */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/5 px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                active
                  ? "bg-gradient-to-r from-cyan-400 to-violet-400 text-[#0c0918]"
                  : "border border-white/10 bg-white/5 text-[#94a3b8] hover:text-white"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {loading && (
          <span className="ml-auto shrink-0 text-[10px] text-[#94a3b8]">
            Đang tải…
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <EmptyState
            icon="shieldAlert"
            title="Đã có lỗi"
            subtitle={error}
            action={{ label: "Thử lại", onClick: load }}
          />
        ) : !loading && visible.length === 0 ? (
          <EmptyState
            icon="users2"
            title="Không tìm thấy ai"
            subtitle={
              search
                ? `Không có kết quả cho "${search}".`
                : filter === "nearby"
                  ? "Hãy thêm thành phố trong hồ sơ để xem người ở gần."
                  : "Thử đổi bộ lọc."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((u) => (
              <PersonCard
                key={u.id}
                user={u}
                onOpen={() => onOpenProfile(u.username)}
              />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {hasMore && !loading && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-white/10"
            >
              Tải thêm ({items.length - visible.length} còn lại)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Single card ─────────────────────────────────────────────────────── */

function PersonCard({
  user,
  onOpen,
}: {
  user: DiscoverPerson;
  onOpen: () => void;
}) {
  const tierColor =
    user.compatibilityTier === "high"
      ? "from-cyan-400 to-cyan-500"
      : user.compatibilityTier === "medium"
        ? "from-violet-400 to-violet-500"
        : "from-slate-500 to-slate-600";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-left transition-colors hover:bg-white/[0.06]"
    >
      {/* Header: avatar + online dot */}
      <div className="relative w-fit">
        <SafeAvatar
          src={user.avatar}
          username={user.username}
          name={user.name}
          alt={user.username}
          imgClassName="size-full rounded-full object-cover"
          className="size-16 rounded-full ring-2 ring-white/10"
        />
        {user.online && (
          <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-black bg-emerald-400" />
        )}
        <span
          className={`absolute -top-1 -right-1 rounded-full bg-gradient-to-r ${tierColor} px-1.5 py-0.5 text-[9px] font-black text-[#0c0918]`}
        >
          {Math.round(user.compatibility)}%
        </span>
      </div>

      {/* Name + meta */}
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-white">
          {user.name ?? user.username}
        </p>
        <p className="truncate text-[10px] text-[#94a3b8]">
          @{user.username}
          {user.city ? ` · ${user.city}` : user.country ? ` · ${user.country}` : ""}
        </p>
      </div>

      {/* Bio */}
      {user.bio && (
        <p className="line-clamp-2 text-[11px] text-[#cbd5e1]">{user.bio}</p>
      )}

      {/* Footer: mutual + distance */}
      <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
        <span className="inline-flex items-center gap-1">
          <Icon name="users2" size={11} />
          {user.mutualFriends} bạn chung
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="mapPin" size={11} />
          {user.distance}
        </span>
      </div>
    </button>
  );
}

/* ─── Empty state ─────────────────────────────────────────────────────── */

function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: "shieldAlert" | "users2";
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/5 text-[#94a3b8]">
          <Icon name={icon} size={26} />
        </div>
        <p className="text-[13px] font-semibold text-white">{title}</p>
        <p className="mt-1 text-[11px] text-[#94a3b8]">{subtitle}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-3 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 px-4 py-1.5 text-[11px] font-bold text-[#0c0918]"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}