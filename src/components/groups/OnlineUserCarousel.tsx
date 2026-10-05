"use client";

import { useEffect, useRef } from "react";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import type { DiscoverPerson } from "@/components/groups/discoverTypes";

interface OnlineUserCarouselProps {
  users: ReadonlyArray<DiscoverPerson>;
  onOpenProfile: (username: string) => void;
}

/**
 * Horizontal carousel of users currently online. Lives at the top of
 * the For-You tab so the viewer can jump straight to a profile with
 * one tap.
 *
 * Auto-scrolls to the left edge when the user list shrinks (e.g. after
 * filtering) so the new head is visible without manual scrolling on
 * a phone.
 */
export function OnlineUserCarousel({
  users,
  onOpenProfile,
}: OnlineUserCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset to the start whenever the user list identity changes so
    // stale scroll offsets don't leave them staring at empty space.
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  }, [users]);

  if (users.length === 0) return null;

  return (
    <section className="border-b border-white/5 px-4 py-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">
          Đang online · {users.length}
        </h2>
      </header>
      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onOpenProfile(u.username)}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <SafeAvatar
              src={u.avatar}
              username={u.username}
              name={u.name}
              alt={u.username}
              imgClassName="size-full rounded-full object-cover"
              className="relative size-14 rounded-full ring-2 ring-emerald-400/40"
            />
            <span className="line-clamp-1 w-full text-center text-[10px] text-white">
              {u.username}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}