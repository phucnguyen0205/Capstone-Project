"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  type ReelItem,
  type VideoFilter,
} from "@/components/groups/discoverTypes";
import { ReelsPlayer } from "@/components/groups/ReelsPlayer";

/* Note: `ReelsPlayer` is the existing full-screen reel player. We
 * import it directly here (not via the discoverTypes barrel) so this
 * file stays self-contained if someone moves the barrel later. The
 * barrel still re-exports `ReelItem` so other tabs don't need a second
 * import.
 * ─────────────────────────────────────────────────────────────────────── */

interface DiscoverReelsProps {
  search: string;
  filter: VideoFilter;
  onFilterChange: (next: VideoFilter) => void;
  myId: string | null;
}

const FILTERS: ReadonlyArray<{ key: VideoFilter; label: string }> = [
  { key: "all", label: "Khám phá" },
  { key: "mine", label: "Thư viện của bạn" },
];

/**
 * Video tab on the Discover page.
 *
 * Sources:
 *   all  → /api/reels/explore (curated by the recommender, hides the
 *                viewer's own approved reels)
 *   mine → /api/reels/mine    (the viewer's own videos, including
 *                pending ones for preview)
 *
 * Wraps the existing ReelsPlayer component — moving it inside its own
 * tab lets the page split into multiple stacks without breaking
 * playback / scroll behaviour.
 */
export function DiscoverReels({
  search,
  filter,
  onFilterChange,
  myId,
}: DiscoverReelsProps) {
  const [items, setItems] = useState<ReelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ReelItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        filter === "mine" ? "/api/reels/mine" : "/api/reels/explore";
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as { items?: ReelItem[] }) : null;
      const raw = Array.isArray(data?.items) ? data!.items : [];
      // Apply the global search box as a client-side caption/author filter
      // so the existing reels endpoint doesn't need a new search param.
      const filtered = search
        ? raw.filter((it) => {
            const q = search.toLowerCase();
            return (
              it.caption?.toLowerCase().includes(q) ||
              it.author.username.toLowerCase().includes(q) ||
              it.author.name?.toLowerCase().includes(q)
            );
          })
        : raw;
      setItems(filtered);
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

  const handleItemReplaced = useCallback((next: ReelItem) => {
    setItems((prev) => prev.map((it) => (it.id === next.id ? next : it)));
    setActiveItem((curr) => (curr && curr.id === next.id ? next : curr));
  }, []);

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
        {!loading && (
          <span className="ml-auto shrink-0 text-[10px] text-[#94a3b8]">
            {items.length} video
          </span>
        )}
      </div>

      {/* ── Body: existing player + comments rail layout ── */}
      <div className="relative flex min-h-0 flex-1 items-stretch overflow-hidden">
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
            <ErrorBlock message={error} onRetry={load} />
          ) : items.length === 0 ? (
            <EmptyBlock
              message={
                filter === "mine"
                  ? "Bạn chưa đăng video nào. Hãy vào trang chủ và đăng video — nó sẽ xuất hiện ở đây và trong tab Khám phá của bạn bè."
                  : "Chưa có video để khám phá. Hãy quay lại sau nhé."
              }
            />
          ) : (
            <ReelsPlayer
              items={items}
              myId={myId}
              onItemReplaced={handleItemReplaced}
              onActiveChange={setActiveItem}
              emptyHint={filter === "mine" ? "" : undefined}
            />
          )}
        </div>

        {/* Right rail: comments for the active reel */}
        {activeItem && !loading && (
          <aside className="hidden h-full w-[320px] shrink-0 flex-col border-l border-white/5 bg-black/40 lg:flex">
            <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-3">
              <div className="size-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-violet-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-white">
                  {activeItem.author.name ?? activeItem.author.username}
                </p>
                <p className="truncate text-[10px] text-[#94a3b8]">
                  @{activeItem.author.username} · {items.length} video
                </p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px] text-[#94a3b8]">
              <p>
                Mở rộng bình luận từ trang chính để xem chi tiết.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ─── Inline states ──────────────────────────────────────────────────── */

function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center">
      <div>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <Icon name="shieldAlert" size={26} />
        </div>
        <p className="text-[13px] font-semibold text-white">Đã có lỗi</p>
        <p className="mt-1 text-[11px] text-[#94a3b8]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 px-4 py-1.5 text-[11px] font-bold text-[#0c0918]"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center">
      <div>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/5 text-[#94a3b8]">
          <Icon name="playCircle" size={26} />
        </div>
        <p className="text-[13px] font-semibold text-white">Không có video</p>
        <p className="mt-1 text-[11px] text-[#94a3b8]">{message}</p>
      </div>
    </div>
  );
}