"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { proxyAvatar } from "@/lib/avatar";
import type { AssetKey } from "@/lib/assets";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface RadarUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  bio: string | null;
  hobbies: string | null;
  occupation: string | null;
  age: number;
  distance: string;
  online: boolean;
  presenceCode: number;
  presenceLabel: string;
  dotColor: "green" | "muted" | "gray";
  hasProfile: boolean;
  mutualFriends: number;
  compatibility: number;          // 0-100
  /**
   * AI service emits one of `"super" | "high" | "medium" | "low"`
   * (see `src/lib/ai.ts:RankingResult.tier`). Keep this union in sync
   * with the AI service — if it adds a new tier, add a matching
   * TIER_CONFIG entry or `tierFor()` will fall back gracefully.
   */
  compatibilityTier: "super" | "high" | "medium" | "low";
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
  aiMethod: string;
}

type ViewMode = "swipe" | "list";
type FilterKey = "all" | "hobbies" | "mutual" | "online" | "new";

/* ─── Rankmark Tier Config ──────────────────────────────────────────────── */

/**
 * Tier keys here MUST match the `tier` values emitted by the AI
 * service in `src/lib/ai.ts` (`super | high | medium | low`). If they
 * drift apart, the radar card crashes at runtime with "Cannot read
 * properties of undefined (reading 'gradient')" because
 * `TIER_CONFIG[user.compatibilityTier]` returns undefined and the
 * component then dereferences `tier.gradient`. The `tierFor()` helper
 * below is a defensive fallback for any value the API might emit that
 * we don't recognise yet.
 */
const TIER_CONFIG: Record<
  RadarUser["compatibilityTier"],
  {
    label: string;
    shortLabel: string;
    icon: AssetKey;
    gradient: string;
    glow: string;
    ringColor: string;
    description: string;
    minScore: number;
  }
> = {
  super: {
    label: "Cháy bỏng",
    shortLabel: "Fire",
    icon: "zap",
    gradient: "linear-gradient(135deg, #ff6b6b 0%, #ff2e93 50%, #fb923c 100%)",
    glow: "0 0 24px rgba(255,46,147,0.45)",
    ringColor: "#ff2e93",
    description: "Hợp nhau đỉnh cao — gần như sinh ra để match",
    minScore: 85,
  },
  high: {
    label: "Tia lửa",
    shortLabel: "Spark",
    icon: "zap",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    glow: "0 0 18px rgba(139,92,246,0.4)",
    ringColor: "#8b5cf6",
    description: "Tương thích rất cao — chemistry mạnh",
    minScore: 70,
  },
  medium: {
    label: "Ấm áp",
    shortLabel: "Warm",
    icon: "eyePreview",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #14b8a6 100%)",
    glow: "0 0 12px rgba(20,184,166,0.35)",
    ringColor: "#06b6d4",
    description: "Có nền tảng chung đáng để trò chuyện",
    minScore: 50,
  },
  low: {
    label: "Hữu hình",
    shortLabel: "Cold",
    icon: "eyeOff",
    gradient: "linear-gradient(135deg, #475569 0%, #64748b 100%)",
    glow: "0 0 6px rgba(100,116,139,0.25)",
    ringColor: "#64748b",
    description: "Cần khám phá thêm để thấy kết nối",
    minScore: 0,
  },
};

/**
 * Defensive lookup. If the server emits a tier value we don't know
 * (legacy clients, Gemini drift, etc.) we fall back to the closest
 * tier based on the user's raw compatibility score.
 */
function tierFor(user: RadarUser) {
  const known = TIER_CONFIG[user.compatibilityTier];
  if (known) return known;
  const score = user.compatibility;
  if (score >= 85) return TIER_CONFIG.super;
  if (score >= 70) return TIER_CONFIG.high;
  if (score >= 50) return TIER_CONFIG.medium;
  return TIER_CONFIG.low;
}

/* ─── Filter config ─────────────────────────────────────────────────────── */

const FILTERS: { key: FilterKey; label: string; icon: AssetKey }[] = [
  { key: "all", label: "Tất cả", icon: "zap" },
  { key: "hobbies", label: "Cùng sở thích", icon: "heartFilled" },
  { key: "mutual", label: "Bạn chung", icon: "users2" },
  { key: "online", label: "Đang online", icon: "onlineIndicator" },
  { key: "new", label: "Mới tham gia", icon: "userPlus" },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function relativeTime(presenceCode: number, label: string): string {
  if (presenceCode === 3) return "Đang hoạt động";
  if (presenceCode === 2) return "Vừa online";
  return label;
}

/* ─── Main Component ────────────────────────────────────────────────────── */

export function RadarMainPanel() {
  const [users, setUsers] = useState<RadarUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("swipe");
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ── Fetch ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/discover?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<RadarUser[]>(res);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Không tải được");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  /* ── Filter pipeline ── */
  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (activeFilter === "online") return u.online;
      if (activeFilter === "hobbies")
        return u.compatibilityReasons.some((r) => /sở thích|hobby/i.test(r));
      if (activeFilter === "mutual") return u.mutualFriends >= 1;
      if (activeFilter === "new") return !u.hasProfile;
      return true;
    });
  }, [users, activeFilter]);

  /* ── Swipe stack state ── */
  const swipeStack = useMemo(
    () => filtered.filter((u) => !swipedIds.has(u.id)),
    [filtered, swipedIds]
  );
  const currentSwipe = swipeStack[swipeIndex];

  function pass() {
    if (!currentSwipe) return;
    setSwipedIds((p) => new Set(p).add(currentSwipe.id));
    setSwipeIndex(0);
  }

  function like() {
    if (!currentSwipe) return;
    // TODO: API call /api/users/[id]/follow + /api/friend-request
    setSwipedIds((p) => new Set(p).add(currentSwipe.id));
    setSwipeIndex(0);
  }

  function undo() {
    if (swipedIds.size === 0) return;
    const last = Array.from(swipedIds).pop()!;
    setSwipedIds((p) => {
      const next = new Set(p);
      next.delete(last);
      return next;
    });
  }

  /* ── Stats ── */
  const stats = useMemo(() => {
    const fireCount = filtered.filter((u) => u.compatibilityTier === "super").length;
    const avgScore = filtered.length
      ? Math.round(
          filtered.reduce((s, u) => s + u.compatibility, 0) / filtered.length
        )
      : 0;
    return { fireCount, avgScore, total: filtered.length };
  }, [filtered]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-gradient-to-br from-[#0c0918] via-[#0e0c1f] to-[#110b1a]">
      {/* ── Animated background blobs ── */}
      <BgBlobs />

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-white/5 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🪐</span>
              <h2 className="text-lg font-black tracking-tight text-white">
                Khám phá
              </h2>
              <span className="rounded-full bg-gradient-to-r from-[#ff2e93] to-[#fb923c] px-2 py-0.5 text-[9px] font-black uppercase text-white">
                AI
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#94a3b8]">
              {stats.total > 0 ? (
                <>
                  {stats.fireCount} rank cao · Trung bình{" "}
                  <strong className="text-white">{stats.avgScore}%</strong>
                </>
              ) : (
                "Gợi ý người phù hợp theo AI"
              )}
            </p>
          </div>

          {/* View toggle */}
          <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5">
            {(["swipe", "list"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`size-7 rounded-full transition-all ${
                  view === m
                    ? "bg-gradient-to-r from-[#ff2e93] to-[#fb923c] text-white"
                    : "text-[#94a3b8] hover:text-white"
                }`}
                title={m === "swipe" ? "Lướt" : "Danh sách"}
              >
                <Icon
                  name={m === "swipe" ? "radarCenterDot" : "list"}
                  size={12}
                  className="mx-auto"
                />
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Filter pills (sticky horizontal scroll) ── */}
      <div className="relative z-10 border-b border-white/5 backdrop-blur-md">
        <div className="flex gap-1.5 overflow-x-auto px-5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                activeFilter === f.key
                  ? "border-transparent bg-white text-[#0c0918]"
                  : "border-white/10 bg-white/5 text-[#a0a5b5] hover:bg-white/10"
              }`}
            >
              <Icon name={f.icon} size={11} />
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex-1 overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : view === "swipe" ? (
          <SwipeView
            users={swipeStack}
            currentIndex={swipeIndex}
            onPass={pass}
            onLike={like}
            onUndo={undo}
            canUndo={swipedIds.size > 0}
            onSelect={(id) => setSelectedId(id)}
          />
        ) : (
          <ListView users={filtered} onSelect={(id) => setSelectedId(id)} />
        )}
      </div>

      {/* ── Detail bottom sheet ── */}
      {selectedId && (
        <DetailSheet
          user={users.find((u) => u.id === selectedId)!}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   SWIPE VIEW
   ═════════════════════════════════════════════════════════════════════════ */

function SwipeView({
  users,
  currentIndex,
  onPass,
  onLike,
  onUndo,
  canUndo,
  onSelect,
}: {
  users: RadarUser[];
  currentIndex: number;
  onPass: () => void;
  onLike: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onSelect: (id: string) => void;
}) {
  const current = users[currentIndex];
  const next = users[currentIndex + 1];

  if (!current) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[#ff2e93] to-[#fb923c] text-white">
          <Icon name="zap" size={36} />
        </div>
        <h3 className="text-xl font-black text-white">Đã xem hết!</h3>
        <p className="mt-1 text-sm text-[#94a3b8]">
          Quay lại sau nhé — AI sẽ cập nhật gợi ý mới
        </p>
        {canUndo && (
          <button
            onClick={onUndo}
            className="mt-4 rounded-full bg-white px-5 py-2 text-[12px] font-bold text-[#0c0918]"
          >
            ↩ Hoàn tác
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col px-5 pt-3 pb-4">
      {/* Card stack — current + next behind */}
      <div className="relative flex-1">
        {next && (
          <CardContainer user={next} z={0} offset={8} scale={0.96} opacity={0.5} onClick={() => {}} />
        )}
        <CardContainer
          user={current}
          z={10}
          offset={0}
          scale={1}
          opacity={1}
          onClick={() => onSelect(current.id)}
        />
      </div>

      {/* Action bar */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <ActionButton
          onClick={onPass}
          icon="circleX"
          variant="pass"
          label="Bỏ qua"
        />
        <ActionButton
          onClick={onUndo}
          icon="rotateLeft"
          variant="undo"
          label="Hoàn tác"
          disabled={!canUndo}
        />
        <ActionButton
          onClick={() => onSelect(current.id)}
          icon="eye"
          variant="info"
          label="Chi tiết"
        />
        <ActionButton
          onClick={onLike}
          icon="heart"
          variant="like"
          label="Thích"
        />
      </div>

      {/* Counter */}
      <p className="mt-3 text-center text-[10px] text-[#626775]">
        {currentIndex + 1} / {users.length}
      </p>
    </div>
  );
}

function CardContainer({
  user,
  z,
  offset,
  scale,
  opacity,
  onClick,
}: {
  user: RadarUser;
  z: number;
  offset: number;
  scale: number;
  opacity: number;
  onClick: () => void;
}) {
  // Use `tierFor` so a stale/missing tier from the server never crashes
  // the swipe card with "Cannot read properties of undefined".
  const tier = tierFor(user);
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 cursor-pointer transition-all duration-300 ease-out"
      style={{
        zIndex: z,
        transform: `translateY(${offset}px) scale(${scale})`,
        opacity,
      }}
    >
      <SwipeCard user={user} tier={tier} />
    </div>
  );
}

function SwipeCard({ user, tier }: { user: RadarUser; tier: (typeof TIER_CONFIG)[RadarUser["compatibilityTier"]] }) {
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-3xl border-2 shadow-2xl"
      style={{
        background: tier.gradient,
        borderColor: tier.ringColor,
        boxShadow: tier.glow,
      }}
    >
      {/* ── Big visual area ── */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Background blur from avatar */}
        <div
          className="absolute inset-0 opacity-50 blur-3xl"
          style={{ background: tier.gradient }}
        />

        {/* Decorative orbs */}
        <div className="absolute -top-12 -right-12 size-40 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute bottom-12 -left-12 size-32 rounded-full bg-white/10 blur-xl" />

        {/* Avatar */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className="flex size-44 items-center justify-center overflow-hidden rounded-[2rem] border-4 border-white/30 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-6xl font-black text-white">
                {user.name[0]?.toUpperCase()}
              </span>
            )}
          </div>

          {user.online && (
            <div className="absolute -bottom-1 right-4 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-emerald-600 shadow-lg">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Online
            </div>
          )}
        </div>

        {/* Rank badge (top-left) */}
        <div className="absolute top-4 left-4 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 shadow-lg">
            <Icon name={tier.icon} size={12} className="text-[#0c0918]" />
            <span className="text-[10px] font-black uppercase tracking-wider text-[#0c0918]">
              {tier.shortLabel}
            </span>
          </div>
          <div className="rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-md">
            <span className="text-base font-black text-white">
              {user.compatibility}
              <span className="text-[10px] opacity-80">%</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom info ── */}
      <div className="relative bg-gradient-to-t from-black/80 via-black/60 to-transparent px-5 pt-12 pb-5 backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-2xl font-black text-white">
              {user.name}, {user.age}
            </h3>
            <p className="mt-0.5 text-[12px] text-white/70">
              @{user.username}
              {user.occupation && <span className="ml-2">· {user.occupation}</span>}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur-md">
            <Icon name="mapPin" size={10} />
            {user.distance}
          </span>
        </div>

        {user.bio && (
          <p className="mt-2 line-clamp-2 text-[12px] text-white/85">
            {user.bio}
          </p>
        )}

        {user.compatibilityReasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {user.compatibilityReasons.slice(0, 3).map((r, i) => (
              <span
                key={i}
                className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md"
              >
                {r}
              </span>
            ))}
          </div>
        )}

        {user.mutualFriends > 0 && (
          <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-white/90">
            <Icon name="users2" size={10} />
            {user.mutualFriends} bạn chung
          </p>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   LIST VIEW
   ═════════════════════════════════════════════════════════════════════════ */

function ListView({
  users,
  onSelect,
}: {
  users: RadarUser[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="space-y-2">
        {users.map((u) => (
          <ListCard key={u.id} user={u} onClick={() => onSelect(u.id)} />
        ))}
      </div>
    </div>
  );
}

function ListCard({ user, onClick }: { user: RadarUser; onClick: () => void }) {
  const tier = tierFor(user);
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
    >
      {/* Avatar with tier ring */}
      <div
        className="relative shrink-0 rounded-2xl border-2 p-0.5"
        style={{ borderColor: tier.ringColor, boxShadow: tier.glow }}
      >
        <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500/30 to-orange-500/30">
          {user.avatar ? (
            <img src={proxyAvatar(user.avatar) ?? ""} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-lg font-black text-white">
              {user.name[0]?.toUpperCase()}
            </span>
          )}
        </div>
        {user.online && (
          <span className="absolute -bottom-0.5 -right-0.5 flex size-3 items-center justify-center rounded-full bg-[#0c0918]">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
          </span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h4 className="truncate text-[13px] font-bold text-white">{user.name}</h4>
          <Icon name={tier.icon} size={12} className="shrink-0 text-white" />
          <span className="ml-auto shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white">
            {user.compatibility}%
          </span>
        </div>
        <p className="truncate text-[10px] text-[#94a3b8]">
          @{user.username} · {relativeTime(user.presenceCode, user.presenceLabel)}
          {user.mutualFriends > 0 && (
            <span className="ml-1.5 text-violet-300">
              · {user.mutualFriends} bạn chung
            </span>
          )}
        </p>
      </div>

      <Icon name="arrowRight" size={14} className="shrink-0 text-[#626775]" />
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   DETAIL BOTTOM SHEET
   ═════════════════════════════════════════════════════════════════════════ */

function DetailSheet({ user, onClose }: { user: RadarUser; onClose: () => void }) {
  const tier = tierFor(user);
  const hobbies = (user.hobbies ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const [muted, setMuted] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-3xl bg-[#11121a] shadow-2xl animate-[slideUp_0.3s_ease-out]"
      >
        {/* ── Hero ── */}
        <div
          className="relative shrink-0 overflow-hidden px-5 pt-5 pb-4"
          style={{ background: tier.gradient }}
        >
          <div className="absolute -top-12 -right-12 size-40 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 size-40 rounded-full bg-white/10 blur-3xl" />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/50"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={16} />
          </button>

          <div className="relative flex items-end gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/30 shadow-xl">
              {user.avatar ? (
                <img src={proxyAvatar(user.avatar) ?? ""} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-white">
                  {user.name[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-white">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-lg font-black">
                  {user.name}, {user.age}
                </h3>
              </div>
              <p className="text-[11px] opacity-90">@{user.username}</p>
              {user.occupation && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] opacity-90">
                  <Icon name="briefcase" size={11} />
                  {user.occupation}
                </p>
              )}
            </div>
          </div>

          {/* Tier banner */}
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/15 px-3 py-2 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-xl bg-white/15 text-white">
                <Icon name={tier.icon} size={18} className="text-white" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-white">
                  {tier.label}
                </p>
                <p className="text-[10px] text-white/80">{tier.description}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black leading-none text-white">
                {user.compatibility}
              </p>
              <p className="text-[9px] opacity-80">/100</p>
            </div>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* AI Breakdown */}
          <section className="px-5 py-4">
            <p className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#94a3b8]">
              <Icon name="zap" size={11} />
              Tại sao AI chọn {user.compatibility}%
            </p>
            <div className="space-y-1.5">
              {[
                { label: "Ảnh đại diện", v: user.compatibilityBreakdown.avatar, max: 20 },
                { label: "Bio", v: user.compatibilityBreakdown.bio, max: 15 },
                { label: "Sở thích chung", v: user.compatibilityBreakdown.hobbies, max: 25 },
                { label: "Đang hoạt động", v: user.compatibilityBreakdown.online, max: 10 },
                { label: "Bạn chung", v: user.compatibilityBreakdown.mutualFriends, max: 15 },
                { label: "Tài khoản mới", v: user.compatibilityBreakdown.freshness, max: 10 },
                { label: "Khoảng cách", v: user.compatibilityBreakdown.distance, max: 5 },
              ].map(({ label, v, max }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[11px] text-[#a0a5b5]">{label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(v / max) * 100}%`,
                        background: tier.gradient,
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] font-bold text-white">
                    +{v}
                  </span>
                </div>
              ))}
            </div>
            {user.compatibilityReasons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {user.compatibilityReasons.map((r, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Bio */}
          {user.bio && (
            <section className="border-t border-white/5 px-5 py-3">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#94a3b8]">
                <Icon name="messageCircle" size={11} />
                Giới thiệu
              </p>
              <p className="text-[12px] leading-relaxed text-white">{user.bio}</p>
            </section>
          )}

          {/* Hobbies */}
          {hobbies.length > 0 && (
            <section className="border-t border-white/5 px-5 py-3">
              <p className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#94a3b8]">
                <Icon name="heartFilled" size={11} />
                Sở thích
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hobbies.map((h, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-2.5 py-1 text-[11px] text-violet-300"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Meta */}
          <section className="grid grid-cols-2 gap-2 border-t border-white/5 px-5 py-3">
            <Meta icon="mapPin" label="Khoảng cách" value={user.distance} />
            <Meta
              icon={user.online ? "onlineIndicator" : "clock"}
              label="Trạng thái"
              value={relativeTime(user.presenceCode, user.presenceLabel)}
            />
            {user.mutualFriends > 0 && (
              <Meta icon="users2" label="Bạn chung" value={`${user.mutualFriends} người`} />
            )}
            {user.occupation && (
              <Meta icon="briefcase" label="Công việc" value={user.occupation} />
            )}
          </section>
        </div>

        {/* ── Action bar (sticky) ── */}
        <div className="flex shrink-0 gap-2 border-t border-white/10 bg-[#0c0918] px-4 py-3">
          <SheetAction icon="messageCircle" label="Chat" primary={false} />
          <SheetAction icon="userPlus" label="Kết bạn" primary={true} />
          <SheetAction icon="users2" label="Mời nhóm" primary={false} />
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Meta({ icon, label, value }: { icon: AssetKey; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] text-[#94a3b8]">
        <Icon name={icon} size={10} />
        {label}
      </p>
      <p className="mt-0.5 truncate text-[12px] font-semibold text-white">{value}</p>
    </div>
  );
}

function SheetAction({
  icon,
  label,
  primary,
}: {
  icon: string;
  label: string;
  primary: boolean;
}) {
  return (
    <button
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-bold transition-all active:scale-95 ${
        primary
          ? "bg-gradient-to-r from-[#ff2e93] to-[#fb923c] text-white shadow-lg"
          : "bg-white/10 text-white hover:bg-white/15"
      }`}
    >
      <Icon name={icon as any} size={16} />
      {label}
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   ACTION BUTTONS (swipe view)
   ═════════════════════════════════════════════════════════════════════════ */

function ActionButton({
  onClick,
  icon,
  variant,
  label,
  disabled,
}: {
  onClick: () => void;
  icon: string;
  variant: "pass" | "undo" | "info" | "like";
  label: string;
  disabled?: boolean;
}) {
  const styles = {
    pass: "size-12 bg-white/10 text-[#94a3b8] hover:bg-red-500/20 hover:text-red-400",
    undo: "size-9 bg-white/10 text-[#94a3b8] hover:bg-white/20",
    info: "size-12 bg-white/10 text-[#94a3b8] hover:bg-cyan-500/20 hover:text-cyan-400",
    like: "size-14 bg-gradient-to-br from-[#ff2e93] to-[#fb923c] text-white shadow-lg shadow-pink-500/40 hover:scale-105",
  };
  const sizes = variant === "like" ? "size-14" : variant === "undo" ? "size-9" : "size-12";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-full transition-all active:scale-90 ${styles[variant]} ${sizes} disabled:opacity-40`}
      title={label}
    >
      <Icon name={icon as any} size={variant === "like" ? 22 : 16} />
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   STATES
   ═════════════════════════════════════════════════════════════════════════ */

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="relative mx-auto mb-4 size-16">
          <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-[#ff2e93] to-[#fb923c] opacity-30" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#ff2e93] border-r-[#fb923c]" />
        </div>
        <p className="text-[12px] text-[#94a3b8]">AI đang phân tích…</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="text-center">
        <div className="mb-3 flex size-14 mx-auto items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <Icon name="shieldAlert" size={26} />
        </div>
        <p className="text-[13px] font-semibold text-white">Đã có lỗi</p>
        <p className="mt-1 text-[11px] text-[#94a3b8]">{message}</p>
        <button
          onClick={onRetry}
          className="mt-3 rounded-full bg-gradient-to-r from-[#ff2e93] to-[#fb923c] px-4 py-1.5 text-[11px] font-bold text-white"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="text-center">
        <div className="mb-4 flex size-20 mx-auto items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-pink-500/20">
          <span className="text-4xl">🔭</span>
        </div>
        <h3 className="text-base font-bold text-white">Chưa có gợi ý</h3>
        <p className="mt-1 text-[12px] text-[#94a3b8]">
          Hãy hoàn thiện profile để AI hiểu bạn hơn
        </p>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   BG BLOBS (decorative)
   ═════════════════════════════════════════════════════════════════════════ */

function BgBlobs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 -left-32 size-80 rounded-full bg-gradient-to-br from-violet-600/20 to-fuchsia-500/10 blur-3xl animate-pulse" />
      <div
        className="absolute top-1/3 -right-32 size-96 rounded-full bg-gradient-to-br from-cyan-500/15 to-blue-500/5 blur-3xl animate-pulse"
        style={{ animationDelay: "1s" }}
      />
      <div
        className="absolute -bottom-32 left-1/4 size-80 rounded-full bg-gradient-to-br from-pink-500/15 to-orange-500/10 blur-3xl animate-pulse"
        style={{ animationDelay: "2s" }}
      />
    </div>
  );
}
