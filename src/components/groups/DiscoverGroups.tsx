"use client";

import { useCallback, useEffect, useState } from "react";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { Icon } from "@/components/ui/Icon";
import { type DiscoverGroup } from "@/components/groups/discoverTypes";

interface DiscoverGroupsProps {
  search: string;
  /** Click handler — parent routes to the group detail page. */
  onOpenGroup: (groupId: string) => void;
}

/**
 * Groups grid for the Discover → Nhóm tab.
 *
 * Sources from /api/groups/discover, which returns groups the viewer
 * is NOT a member of (every result is actionable — they can join).
 *
 * Layout: 1 column on phones, 2 columns on tablets, 3 on desktop. We
 * keep the join CTA compact so the grid doesn't feel like a form.
 */
export function DiscoverGroups({ search, onOpenGroup }: DiscoverGroupsProps) {
  const [items, setItems] = useState<DiscoverGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const res = await fetch(`/api/groups/discover?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DiscoverGroup[];
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {error ? (
          <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
            <div>
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                <Icon name="shieldAlert" size={26} />
              </div>
              <p className="text-[13px] font-semibold text-white">Đã có lỗi</p>
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
        ) : !loading && items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
            <div>
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/5 text-[#94a3b8]">
                <Icon name="users2" size={26} />
              </div>
              <p className="text-[13px] font-semibold text-white">
                Không có nhóm phù hợp
              </p>
              <p className="mt-1 text-[11px] text-[#94a3b8]">
                {search
                  ? `Không có nhóm nào khớp với "${search}".`
                  : "Bạn đã tham gia tất cả nhóm công khai rồi!"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((g) => (
              <GroupCard key={g.id} group={g} onOpen={() => onOpenGroup(g.id)} />
            ))}
          </div>
        )}
    </div>
  );
}

/* ─── Single card ─────────────────────────────────────────────────────── */

function GroupCard({
  group,
  onOpen,
}: {
  group: DiscoverGroup;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
      <button type="button" onClick={onOpen} className="flex items-start gap-3 text-left">
        <SafeAvatar
          src={group.avatarUrl}
          username={group.creatorUsername}
          name={group.name}
          alt={group.name}
          imgClassName="size-full rounded-2xl object-cover"
          className="size-14 shrink-0 rounded-2xl ring-2 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[13px] font-bold text-white">
            {group.name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-[#94a3b8]">
            {group.description ?? "Không có mô tả"}
          </p>
          <p className="mt-1 text-[10px] text-[#64748b]">
            Tạo bởi @{group.creatorUsername}
            {group.creatorName ? ` (${group.creatorName})` : ""}
          </p>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
        <span className="inline-flex items-center gap-1 text-[10px] text-[#94a3b8]">
          <Icon name="users2" size={11} />
          {group.memberCount} thành viên
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 px-3 py-1 text-[10px] font-black text-[#0c0918] hover:opacity-90"
        >
          Xem nhóm
        </button>
      </div>
    </div>
  );
}