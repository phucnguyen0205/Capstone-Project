"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  REEL_FILTERS,
  type ReelFilter,
} from "@/components/groups/reelEnhancements";

interface DiscoverReelEnhancementsProps {
  /** Current search box text (controlled). */
  search: string;
  onSearchChange: (next: string) => void;
  /** Current filter chip (controlled). */
  filter: ReelFilter;
  onFilterChange: (next: ReelFilter) => void;
  /** Number of items currently in the reels list — used as a counter
   *  in the search row. */
  itemCount: number;
}

/**
 * Slim overlay row that lives directly under the Discover tab bar.
 * Adds two upgrades without changing the original layout:
 *   1. Search box (caption + author). 300ms debounce.
 *   2. Filter chips: Mới nhất / Thịnh hành / Từ bạn bè.
 *
 * Visually the row looks like the existing tab bar continuation —
 * same backdrop blur, same dark gradient. It's 100% overlay so
 * ReelsPlayer's layout is untouched below.
 */
export function DiscoverReelEnhancements({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  itemCount,
}: DiscoverReelEnhancementsProps) {
  const [draft, setDraft] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(search);
  }, [search]);

  const handleChange = (value: string) => {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), 300);
  };

  const clear = () => {
    setDraft("");
    onSearchChange("");
  };

  return (
    <div className="z-10 shrink-0 border-b border-white/5 bg-gradient-to-b from-black/80 to-black/40 px-4 py-1.5 backdrop-blur-md">
      <div className="mb-1.5 flex items-center gap-2">
        {/* ── Search box ── */}
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748b]">
            <Icon name="search" size={12} />
          </span>
          <input
            type="search"
            inputMode="search"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Tìm caption, tác giả…"
            className="w-full rounded-full border border-white/10 bg-white/5 py-1 pl-7 pr-7 text-[11px] text-white placeholder:text-[#64748b] focus:border-cyan-400/40 focus:outline-none"
          />
          {draft && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#94a3b8] hover:bg-white/10 hover:text-white"
              aria-label="Xóa tìm kiếm"
            >
              <Icon name="xCircle" size={12} />
            </button>
          )}
        </div>
        {/* ── Counter ── */}
        <span className="shrink-0 text-[10px] text-[#94a3b8]">
          {itemCount} video
        </span>
      </div>
      {/* ── Filter chips ── */}
      <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {REEL_FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all ${
                active
                  ? "bg-gradient-to-r from-cyan-400 to-violet-400 text-[#0c0918]"
                  : "border border-white/10 bg-white/5 text-[#94a3b8] hover:text-white"
              }`}
            >
              <Icon name={f.icon} size={10} />
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}