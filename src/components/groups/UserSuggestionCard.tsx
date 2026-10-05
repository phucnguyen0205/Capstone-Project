"use client";

import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { Icon } from "@/components/ui/Icon";
import type { DiscoverPerson } from "@/components/groups/discoverTypes";

interface UserSuggestionCardProps {
  user: DiscoverPerson;
  onOpenProfile: (username: string) => void;
  /** Called when the user dismisses the suggestion. The parent is
   *  responsible for actually removing it from the suggestion list —
   *  this card just emits the event. */
  onDismiss?: (id: string) => void;
}

/**
 * Compact card used in the "Có thể bạn quen" widget on the Discover
 * page. Single horizontal row (avatar | name + meta | action).
 *
 * The "Tương thích" badge uses the same colour scheme the home feed
 * uses, so users instantly recognise high-compat (cyan) vs medium
 * (violet) vs low (muted).
 */
export function UserSuggestionCard({
  user,
  onOpenProfile,
  onDismiss,
}: UserSuggestionCardProps) {
  const tierColor =
    user.compatibilityTier === "high"
      ? "from-cyan-400 to-cyan-500"
      : user.compatibilityTier === "medium"
        ? "from-violet-400 to-violet-500"
        : "from-slate-500 to-slate-600";

  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
      <button
        type="button"
        onClick={() => onOpenProfile(user.username)}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <SafeAvatar
          src={user.avatar}
          username={user.username}
          name={user.name}
          alt={user.username}
          imgClassName="size-full rounded-full object-cover"
          className="size-11 shrink-0 rounded-full ring-2 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-white">
            {user.name ?? user.username}
          </p>
          <p className="truncate text-[10px] text-[#94a3b8]">
            @{user.username}
            {user.city ? ` · ${user.city}` : ""}
            {user.online ? (
              <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Online
              </span>
            ) : null}
          </p>
        </div>
        <div className={`shrink-0 rounded-full bg-gradient-to-r ${tierColor} px-2 py-0.5 text-[9px] font-black text-[#0c0918]`}>
          {Math.round(user.compatibility)}%
        </div>
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(user.id)}
          className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border border-white/10 bg-black/70 text-[#94a3b8] hover:text-white group-hover:flex"
          aria-label="Bỏ qua gợi ý"
        >
          <Icon name="xCircle" size={11} />
        </button>
      )}
    </div>
  );
}