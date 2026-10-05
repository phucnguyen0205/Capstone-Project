"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { proxyAvatar } from "@/lib/avatar";
import type { AssetKey } from "@/lib/assets";
import { useSession } from "next-auth/react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface DiscoverUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  bio: string | null;
  hobbies: string | null;
  compatibility: number;
  compatibilityTier: "fire" | "spark" | "warm" | "cold";
  compatibilityBreakdown: {
    avatar: number;
    bio: number;
    hobbies: number;
    online: number;
    mutualFriends: number;
    freshness: number;
    distance: number;
  };
  compatibilityReasons: string[];
  distance: string;
  online: boolean;
  presenceCode: number;
  presenceLabel: string;
  dotColor: "green" | "muted" | "gray";
  hasProfile: boolean;
  mutualFriends: number;
}

/* ─── Tier config (đồng bộ Discover/Radar) ──────────────────────────── */

const TIER_CONFIG: Record<
  DiscoverUser["compatibilityTier"],
  { label: string; icon: AssetKey; gradient: string; glow: string; ringColor: string }
> = {
  fire: {
    label: "Cực phù hợp",
    icon: "zap",
    gradient: "linear-gradient(135deg, #ff6b6b 0%, #ff2e93 50%, #fb923c 100%)",
    glow: "0 0 20px rgba(255,46,147,0.5)",
    ringColor: "#ff2e93",
  },
  spark: {
    label: "Đáng chú ý",
    icon: "zap",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    glow: "0 0 16px rgba(139,92,246,0.45)",
    ringColor: "#8b5cf6",
  },
  warm: {
    label: "Tiềm năng",
    icon: "eyePreview",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #14b8a6 100%)",
    glow: "0 0 12px rgba(20,184,166,0.4)",
    ringColor: "#06b6d4",
  },
  cold: {
    label: "Mới tham gia",
    icon: "userPlus",
    gradient: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
    glow: "0 0 8px rgba(16,185,129,0.35)",
    ringColor: "#10b981",
  },
};

/* ─── Default interests ────────────────────────────────────────────────
 * Fixed list of interest tags the user can pick as a filter on the
 * Discover panel. These are UI choices (label vocabulary), not
 * placeholder data, so we keep them hardcoded.
 * ──────────────────────────────────────────────────────────────────────── */
const DEFAULT_INTERESTS = [
  "Âm nhạc", "Cafe", "Du lịch", "Thể thao", "Đọc sách",
  "Nhiếp ảnh", "Game", "Phim", "Nấu ăn", "Yoga",
  "Đi bộ", "Bơi lội", "Viết", "Hội họa", "Khiêu vũ",
];

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function PresenceDot({ code, dotColor }: { code?: number; dotColor?: string }) {
  const color =
    dotColor === "green"
      ? "bg-emerald-400"
      : dotColor === "muted"
        ? "bg-[#a0a5b5]"
        : "bg-[#3a3f4b]";
  const pulse = code === 3;
  return (
    <span className={`relative inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-black/60 ${color}`}>
      {pulse && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
    </span>
  );
}

function buildHighlights(u: DiscoverUser): { icon: AssetKey | null; text: string; weight: number }[] {
  const out: { icon: AssetKey | null; text: string; weight: number }[] = [];
  if (!u.hasProfile) out.push({ icon: "userPlus", text: "Mới tham gia", weight: 10 });
  if (u.avatar) out.push({ icon: "heartFilled", text: "Có ảnh", weight: 6 });
  if (u.bio && u.bio.length > 20) out.push({ icon: "messageCircle", text: "Viết bio", weight: 6 });
  if (u.hobbies) out.push({ icon: "heartFilled", text: u.hobbies.split(",")[0].trim(), weight: 7 });
  if (u.mutualFriends >= 1) out.push({ icon: "users2", text: `${u.mutualFriends} bạn chung`, weight: 8 });
  if (u.online) out.push({ icon: "onlineIndicator", text: "Online", weight: 6 });
  if (u.compatibilityReasons[0]) out.push({ icon: null, text: u.compatibilityReasons[0], weight: 9 });
  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

function getCompatibilityTier(score: number): DiscoverUser["compatibilityTier"] {
  if (score >= 85) return "fire";
  if (score >= 70) return "spark";
  if (score >= 50) return "warm";
  return "cold";
}

/* ─── Main Component ─────────────────────────────────────────────────── */

export function LeftColumn() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [swiping, setSwiping] = useState<"left" | "right" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DiscoverUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 50]);
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  /* ── Fetch ── */
  const loadDiscover = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discover", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
        setCurrentIdx(0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscover();
    const refresh = setInterval(loadDiscover, 30_000);
    return () => clearInterval(refresh);
  }, [loadDiscover]);

  /* ── Search ── */
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/discover?search=${encodeURIComponent(searchQuery)}`)
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setSearchResults(data); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* ── Client-side filter: age + interests ── */
  const filtered = useMemo(() => {
    if (selectedInterests.size === 0) return users;
    return users.filter((u) => {
      if (!u.hobbies) return false;
      const userHobbies = u.hobbies.split(",").map((h) => h.trim().toLowerCase());
      return [...selectedInterests].some((sel) =>
        userHobbies.some((uh) => uh.includes(sel.toLowerCase()))
      );
    });
  }, [users, selectedInterests]);

  const current = filtered[currentIdx];
  const next = filtered[currentIdx + 1];

  /* ── Swipe ── */
  function handleSwipe(direction: "left" | "right") {
    if (swiping || !current) return;
    setSwiping(direction);
    setTimeout(() => {
      if (direction === "right") {
        fetch("/api/friend-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: current.id, action: "send" }),
        }).catch(() => {});
      }
      setCurrentIdx((prev) => {
        const nextIdx = prev + 1;
        return nextIdx >= filtered.length ? 0 : nextIdx;
      });
      setSwiping(null);
    }, 300);
  }

  function handleInvite(id: string) {
    setInvitedIds((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ── Interest toggle ── */
  function toggleInterest(label: string) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const hasFilters = selectedInterests.size > 0 || ageRange[0] !== 18 || ageRange[1] !== 50;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto px-3 py-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xl">🪄</span>
            <h2 className="text-base font-black text-white">Bạn bè mới</h2>
          </div>
          <p className="text-[10px] text-[#94a3b8]">
            {filtered.length > 0 ? `${filtered.length} người gợi ý` : "AI gợi ý"}
          </p>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] font-bold transition-all ${
            showFilters
              ? "border-transparent bg-gradient-to-r from-[#ff2e93] to-[#fb923c] text-white"
              : hasFilters
                ? "border-[#ff2e93]/40 bg-[#ff2e93]/10 text-[#ff2e93]"
                : "border-white/10 bg-white/5 text-[#94a3b8] hover:bg-white/10"
          }`}
        >
          <Icon name="slidersHorizontal" size={12} />
          Bộ lọc
          {hasFilters && (
            <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-white text-[8px] font-black text-[#ff2e93]">
              {selectedInterests.size || "•"}
            </span>
          )}
        </button>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-[#242831] bg-[#171920] px-3 py-2">
          <Icon name="search" size={14} className="shrink-0 text-[#626775]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên, username..."
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
          />
          {searching && (
            <div className="size-3 animate-spin rounded-full border border-[#232338] border-t-[#ff2e93]" />
          )}
          {searchQuery && !searching && (
            <button onClick={() => setSearchQuery("")} className="text-[#626775] hover:text-white">
              <Icon name="circleX" size={12} />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[200px] overflow-y-auto rounded-xl border border-[#242831] bg-[#171920] shadow-xl">
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 hover:bg-white/5"
              >
                <div className="size-8 shrink-0 overflow-hidden rounded-full">
                  <SafeAvatar
                    src={u.avatar}
                    alt=""
                    name={u.name}
                    username={u.username}
                    className="size-full"
                  />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[12px] font-semibold text-white">{u.name}</p>
                  <p className="truncate text-[10px] text-[#626775]">@{u.username}</p>
                </div>
                <span className="shrink-0 rounded-full bg-gradient-to-r from-[#ff2e93] to-[#fb923c] px-2 py-0.5 text-[9px] font-bold text-white">
                  {u.compatibility}%
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Card stack ── */}
      <div className="relative h-[340px] w-full">
        {/* Gradient bg */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#0e0e1a]" />

        {loading ? (
          <div className="flex size-full items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-[#ff2e93]/30 to-[#fb923c]/30 opacity-50" />
              <div className="size-10 animate-spin rounded-full border-2 border-transparent border-t-[#ff2e93] border-r-[#fb923c]" />
            </div>
          </div>
        ) : !current ? (
          <div className="flex size-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-white/5 text-[#a0a5b5]">
              <Icon name="compass" size={28} />
            </div>
            <p className="text-[13px] font-bold text-white">Đã xem hết!</p>
            <p className="mt-1 text-[11px] text-[#94a3b8]">Quay lại sau nhé</p>
            <button
              onClick={loadDiscover}
              className="mt-3 rounded-full bg-gradient-to-r from-[#ff2e93] to-[#fb923c] px-4 py-1.5 text-[11px] font-bold text-white"
            >
              Tải lại
            </button>
          </div>
        ) : (
          <>
            {/* Next card (behind) */}
            {next && <SwipeCard user={next} z={0} scale={0.93} opacity={0.4} />}
            {/* Current card */}
            <SwipeCard
              user={current}
              z={10}
              scale={1}
              opacity={1}
              onClick={() => { window.location.href = `/profile/${current.username}`; }}
            />
          </>
        )}
      </div>

      {/* ── Swipe buttons ── */}
      {current && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handleSwipe("left")}
            className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[#94a3b8] shadow-lg transition-all hover:scale-110 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 active:scale-95"
            aria-label="Bỏ qua"
          >
            <Icon name="circleX" size={22} />
          </button>

          <button
            onClick={() => handleInvite(current.id)}
            className={`flex size-10 items-center justify-center rounded-full border shadow-lg transition-all hover:scale-110 active:scale-95 ${
              invitedIds.has(current.id)
                ? "border-[#00f2fe]/40 bg-[#00f2fe]/15 text-[#00f2fe]"
                : "border-white/10 bg-white/5 text-[#94a3b8] hover:border-[#00f2fe]/40 hover:bg-[#00f2fe]/10 hover:text-[#00f2fe]"
            }`}
            aria-label="Mời nhóm"
          >
            <Icon name="users2" size={18} />
          </button>

          <button
            onClick={() => handleSwipe("right")}
            className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[#ff2e93] to-[#fb923c] text-white shadow-lg shadow-pink-500/30 transition-all hover:scale-110 active:scale-95"
            aria-label="Kết bạn"
          >
            <Icon name="heart" size={24} />
          </button>
        </div>
      )}

      {/* Counter */}
      {current && (
        <p className="text-center text-[10px] text-[#626775]">
          {currentIdx + 1} / {filtered.length}
        </p>
      )}

      {/* ── Collapsible Filter panel ── */}
      {showFilters && (
        <div className="rounded-2xl border border-white/8 bg-[rgba(31,33,40,0.8)] p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-bold text-white">Bộ lọc</p>
            {hasFilters && (
              <button
                onClick={() => {
                  setSelectedInterests(new Set());
                  setAgeRange([18, 50]);
                }}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Đặt lại
              </button>
            )}
          </div>

          {/* Age range */}
          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-[#94a3b8]">Độ tuổi</span>
              <span className="text-[11px] font-bold text-white">
                {ageRange[0]} – {ageRange[1]} tuổi
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="range"
                min={18}
                max={60}
                value={ageRange[0]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAgeRange([Math.min(val, ageRange[1] - 1), ageRange[1]]);
                }}
                className="flex-1 accent-pink-500"
              />
              <input
                type="range"
                min={18}
                max={60}
                value={ageRange[1]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAgeRange([ageRange[0], Math.max(val, ageRange[0] + 1)]);
                }}
                className="flex-1 accent-pink-500"
              />
            </div>
          </div>

          {/* Interests */}
          <div>
            <p className="mb-2 text-[11px] text-[#94a3b8]">Sở thích</p>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_INTERESTS.map((label) => {
                const active = selectedInterests.has(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleInterest(label)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                      active
                        ? "bg-gradient-to-r from-[#ff2e93] to-[#fb923c] text-white"
                        : "border border-white/8 bg-[#2a2d37] text-[#a0a5b5] hover:bg-white/10"
                    }`}
                  >
                    {label}
                    {active && <span className="ml-1 opacity-80">×</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Apply */}
          <button
            onClick={() => setShowFilters(false)}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#ff2e93] to-[#fb923c] py-2 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Áp dụng
          </button>
        </div>
      )}
    </aside>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   SWIPE CARD
   ═════════════════════════════════════════════════════════════════════════ */

function SwipeCard({
  user,
  z,
  scale,
  opacity,
  onClick,
}: {
  user: DiscoverUser;
  z: number;
  scale: number;
  opacity: number;
  onClick?: () => void;
}) {
  const tier = TIER_CONFIG[user.compatibilityTier] ?? TIER_CONFIG.cold;
  const highlights = useMemo(() => buildHighlights(user), [user]);

  return (
    <button
      onClick={onClick}
      className="absolute inset-0 w-full cursor-pointer overflow-hidden rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-pink-500"
      style={{
        zIndex: z,
        transform: `scale(${scale})`,
        opacity,
        borderColor: tier.ringColor,
        boxShadow: tier.glow,
        background: user.avatar ? undefined : tier.gradient,
      }}
    >
      {/* Background image or gradient */}
      {user.avatar ? (
        <>
          <img src={proxyAvatar(user.avatar) ?? ""} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        </>
      ) : (
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -top-8 -right-8 size-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute bottom-12 -left-8 size-24 rounded-full bg-white/10 blur-xl" />
        </div>
      )}

      {/* Badges top row */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
        {/* Compatibility + tier */}
        <div className="flex flex-col gap-1">
          <div
            className="flex items-center gap-1 rounded-full px-2.5 py-1 backdrop-blur-md"
            style={{ background: tier.gradient }}
          >
            <span className="flex items-center justify-center">
              <Icon name={tier.icon} size={10} className="text-white" />
            </span>
            <span className="text-[10px] font-black uppercase text-white">
              {user.compatibility}%
            </span>
          </div>
          {user.compatibilityTier === "fire" && (
            <div className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-md">
              <Icon name="zap" size={9} />
              Top Pick
            </div>
          )}
        </div>

        {/* Online status */}
        <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 backdrop-blur-md">
          <PresenceDot code={user.presenceCode} dotColor={user.dotColor} />
          <span className="text-[10px] font-semibold text-white">
            {user.presenceCode === 3 ? "Online" : user.presenceCode === 2 ? "Vừa online" : user.presenceLabel}
          </span>
        </div>
      </div>

      {/* Highlights bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
        {/* Highlights chips */}
        {highlights.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {highlights.map((h, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-md"
              >
                {h.icon && <Icon name={h.icon} size={9} />}
                {h.text}
              </span>
            ))}
          </div>
        )}

        {/* Name + meta */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-black text-white">{user.name}</h3>
            <p className="flex items-center gap-1 text-[10px] text-white/80">
              <span>@{user.username}</span>
              {user.mutualFriends > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-violet-300">
                    <Icon name="users2" size={10} />
                    {user.mutualFriends} bạn chung
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/80">
            <Icon name="mapPin" size={10} />
            <span>{user.distance}</span>
          </div>
        </div>

        {/* Bio */}
        {user.bio && (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-white/80">
            {user.bio}
          </p>
        )}
      </div>
    </button>
  );
}
