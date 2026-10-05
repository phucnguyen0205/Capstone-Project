"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  DISCOVER_TABS,
  type DiscoverTabKey,
} from "@/components/groups/discoverTypes";

interface DiscoverHeaderProps {
  /** Currently active tab. */
  activeTab: DiscoverTabKey;
  onTabChange: (next: DiscoverTabKey) => void;
  /** Current search query (debounced inside the header before calling back). */
  search: string;
  onSearchChange: (next: string) => void;
  /** Number of new items behind the active tab — used to show a small
   *  red dot if the user hasn't visited it. Stored under
   *  `visitedTabs` so it only fires once per session. */
  hint?: string | null;
  /** Called when the user clears the search box. */
  onClearSearch?: () => void;
}

/**
 * Top bar of the Discover page.
 *
 * Two responsibilities:
 *   1. Tab pills (Dành cho bạn / Mọi người / Video / Nhóm / Bài viết).
 *      Tabs scroll horizontally on narrow viewports so the layout
 *      doesn't wrap awkwardly on a phone.
 *   2. Search box with 300ms debounce so we don't refetch on every
 *      keystroke.
 *
 * Kept as a controlled component so the parent owns the URL query param
 * (good for shareable / refresh-safe state in v1.1).
 */
export function DiscoverHeader({
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  hint = null,
  onClearSearch,
}: DiscoverHeaderProps) {
  const [draft, setDraft] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external `search` prop → local draft when the parent clears
  // it (e.g. user clicks "×" outside the search box). Without this the
  // input would visibly stay filled even though the parent thinks it's
  // empty.
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
    onClearSearch?.();
  };

  return (
    <div className="z-10 shrink-0 border-b border-white/5 bg-gradient-to-b from-black/95 to-black/70 px-4 pt-3 pb-2 backdrop-blur-md">
      {/* ── Row 1: title + search bar + hint badge ── */}
      <div className="mb-2 flex items-center gap-2">
        <h1 className="shrink-0 text-base font-black text-white">Khám phá</h1>
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748b]">
            <Icon name="search" size={14} />
          </span>
          <input
            type="search"
            inputMode="search"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Tìm người, nhóm, bài viết…"
            className="w-full rounded-full border border-white/10 bg-white/5 py-1.5 pl-8 pr-8 text-[12px] text-white placeholder:text-[#64748b] focus:border-cyan-400/40 focus:outline-none"
          />
          {draft && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#94a3b8] hover:bg-white/10 hover:text-white"
              aria-label="Xóa tìm kiếm"
            >
              <Icon name="xCircle" size={14} />
            </button>
          )}
        </div>
        {hint && (
          <span className="hidden shrink-0 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300 md:inline">
            {hint}
          </span>
        )}
      </div>

      {/* ── Row 2: tab pills, horizontally scrollable ── */}
      <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DISCOVER_TABS.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
                active
                  ? "bg-gradient-to-r from-cyan-400 to-violet-400 text-[#0c0918]"
                  : "border border-white/10 bg-white/5 text-[#94a3b8] hover:text-white"
              }`}
            >
              <Icon name={t.icon} size={12} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}