"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import type { AssetKey } from "@/lib/assets";
import { AddMemberModal } from "@/components/groups/AddMemberModal";
import { GroupSelector } from "@/components/groups/GroupSelector";
import { OwnershipTransferModal } from "@/components/groups/OwnershipTransferModal";
import { CreateGroupModal } from "@/components/groups/CreateGroupModal";
import {
  useGroupCloseness,
  MIRROR_CONFIG,
} from "@/lib/closeness";

interface Member {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  isOnline: boolean;
  friendshipCreatedAt: number;
  addedBy: string | null;
  // Phase 3: role is read from `/api/groups/[id]/members`. We keep it
  // optional so legacy callers (still wired into TierInfo etc.) don't
  // trip on undefined.
  role?: "creator" | "admin" | "member";
}

interface TierInfo {
  key: "public" | "friends" | "close" | "private";
  label: string;
  count: number;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Icon prefix shown before the tier label for quick visual scanning.
// Replaces the previous TIER_EMOJI (Unicode emoji) so every status indicator
// renders as a real SVG.
const TIER_ICON: Record<TierInfo["key"], AssetKey> = {
  public: "globe",
  friends: "users2",
  close: "lockSmall",
  private: "lock",
};

// Status dot colour for each display level. "active" = the dot pulses, the
// row is highlighted; "idle" = muted gray dot, row is in default state.
// We intentionally do not mark any tier as active by default — the user
// picks which audience they're composing for.
const TIER_STATUS: Record<
  TierInfo["key"],
  { color: string; pulse: boolean; description: string }
> = {
  public: {
    color: "bg-emerald-400",
    pulse: false,
    description: "Tất cả mọi người",
  },
  friends: {
    color: "bg-cyan-400",
    pulse: false,
    description: "Chỉ bạn bè (đã follow lẫn nhau)",
  },
  close: {
    color: "bg-violet-400",
    pulse: true,
    description: "Chỉ thành viên thân thiết",
  },
  private: {
    color: "bg-rose-400",
    pulse: false,
    description: "Chỉ mình bạn",
  },
};

export function GroupsLeftSidebar({
  refreshSignal = 0,
  activeGroupId,
  onSelectGroup,
}: {
  refreshSignal?: number;
  activeGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
}) {
  const [mirrorEnabled, setMirrorEnabled] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  // Free-text filter applied to the user's own groups in GroupSelector.
  // Lives in the sidebar (not GroupSelector) so the search input can
  // live above the group list as the column's topmost element.
  const [search, setSearch] = useState("");
  // Open the create-group modal from anywhere in the sidebar (the `+`
  // button next to the search bar, the empty-state hint, etc.).
  const [showCreate, setShowCreate] = useState(false);
  // Bumping this counter inside the sidebar forces a member re-fetch
  // (used after AddMemberModal sends a friend request).
  const [memberRefreshTick, setMemberRefreshTick] = useState(0);
  // Phase 3: caller's own role inside the active group. Used to gate
  // the "Chuyển quyền người tạo" button (creator only) and the
  // ownership-transfer UI.
  const [myRole, setMyRole] = useState<"creator" | "admin" | "member" | null>(null);
  const [showTransferOwnership, setShowTransferOwnership] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeGroupId) {
      setMembers([]);
      setTiers([]);
      setMyRole(null);
      setLoadingMembers(false);
      return;
    }
    try {
      // Phase 3: load the active group's metadata, members, and tier
      // counts in parallel. The tier endpoint is still the legacy
      // global one (it doesn't change with the group); we just don't
      // read its output here.
      const [groupRes, memRes] = await Promise.all([
        fetch(`/api/groups/${activeGroupId}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/groups/${activeGroupId}/members`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const groupData = await safeJson<{
        role: "creator" | "admin" | "member" | null;
        isMember: boolean;
      }>(groupRes);
      const memData = await safeJson<Member[]>(memRes);
      setMembers(Array.isArray(memData) ? memData : []);
      setMyRole(groupData?.isMember ? groupData.role ?? "member" : null);
    } finally {
      setLoadingMembers(false);
    }
  }, [activeGroupId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal, memberRefreshTick]);

  // Closeness data — drives the "Gương vô hình" progress bar
  const { byUserId: closenessByUser } = useGroupCloseness();

  // Average closeness across the group, normalised against the unlock
  // target. Renders the "Gương vô hình" progress bar so users see how
  // close they collectively are to revealing content.
  const memberPoints = members.map(
    (m) => closenessByUser[m.id]?.points ?? 0,
  );
  const totalPoints = memberPoints.reduce((s, p) => s + p, 0);
  const averagePoints =
    members.length > 0 ? Math.round(totalPoints / members.length) : 0;
  const unlockedCount = memberPoints.filter(
    (p) => p >= MIRROR_CONFIG.videoUnlockPoints,
  ).length;
  const mirrorPercent = members.length > 0
    ? Math.round((totalPoints / (members.length * MIRROR_CONFIG.imageFullPoints)) * 100)
    : 0;
  // Back-compat — old UI showed a "days since oldest" line.  Keep it as a
  // small subtitle so existing copy stays intact.
  const oldestFriendship = members[members.length - 1]?.friendshipCreatedAt;
  const daysSinceOldest = oldestFriendship
    ? Math.max(0, Math.floor((Date.now() / 1000 - oldestFriendship) / 86400))
    : 5;
  const unlockDays = Math.min(Math.max(daysSinceOldest, 1), 30);

  return (
    <aside className="flex min-h-0 w-[360px] shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto border-r border-[#232338] p-4">
      {/* Search bar lives at the top of column 1 so it's the first
          thing the eye lands on. Filters the "Nhóm của tôi" list below.
          A `+` button next to it opens the CreateGroupModal so users can
          spin up a new group without leaving this column. */}
      <div className="flex w-full items-center gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#67678d]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm nhóm…"
            className="w-full rounded-[14px] border border-[#232338] bg-[#11121a] py-2 pl-9 pr-3 text-[13px] text-white placeholder:text-[#67678d] focus:border-violet-500/50 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            setShowCreate(true);
          }}
          title="Tạo nhóm mới"
          className="flex size-9 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-r from-violet-500 to-teal-500 text-white hover:opacity-90"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <section className="flex w-full flex-col gap-3 rounded-2xl border border-violet-500/25 bg-[rgba(18,18,34,0.6)] p-3 backdrop-blur-[10px]">
        <div className="flex items-center gap-2">
          <Icon name="users2" size={16} />
          <h2 className="text-[13px] font-bold uppercase text-[#f1f1f7]">
            Nhóm
          </h2>
        </div>

        {/* Selector: list of groups the user is a member of. Selecting
            a group updates the URL (`?group=...`) so the choice survives
            a reload and the parent re-routes the centre/right columns to
            that group's data. The list is filtered by `search` above. */}
        <GroupSelector
          activeGroupId={activeGroupId}
          onSelectGroup={onSelectGroup}
          search={search}
        />
      </section>

      {/* ── Active-group members + add-member CTA ────────────────────── */}
      {/* Only render the legacy "Hội bạn thân" grid + AddMemberModal when
          the user has selected a group they're a member of. When no group
          is active (or the URL points to a public group they haven't
          joined yet) the columns stay quiet. */}
      {activeGroupId && (
        <>
          <section className="flex w-full flex-col gap-2 rounded-2xl border border-[#232338] bg-[#11121a] p-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-violet-400" />
              <h3 className="text-[13px] font-bold uppercase text-[#f1f1f7]">
                Thành viên nhóm
              </h3>
            </div>
            <p className="text-[11px] text-[#67678d]">
              {loadingMembers
                ? "Đang tải..."
                : `Quy mô: ${members.length} thành viên`}
            </p>

            <div className="grid grid-cols-3 gap-1.5">
              {loadingMembers
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-2xl bg-white/5"
                    />
                  ))
                : members.slice(0, 12).map((member) => (
                    <MemberAvatar
                      key={member.id}
                      name={member.name ?? member.username}
                      avatar={member.avatar}
                      online={member.isOnline}
                    />
                  ))}
              {!loadingMembers && members.length === 0 && (
                <p className="col-span-3 text-center text-[11px] text-[#67678d]">
                  Chưa có thành viên nào trong nhóm
                </p>
              )}
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                  setShowAddMember(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-violet-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0px_4px_6px_rgba(139,92,246,0.25)] hover:opacity-95"
              >
                <Icon name="plus" size={16} />
                <span>Mời thêm thành viên</span>
              </button>
              <p className="text-center text-[11px] text-[#67678d]">
                Người được mời sẽ nhận lời mời kết bạn
              </p>

              {/* Phase 3: creator-only "chuyển quyền người tạo" affordance.
                  Required because creator can't leave the group until
                  ownership is moved to someone else. */}
              {myRole === "creator" && (
                <button
                  type="button"
                  onClick={() => setShowTransferOwnership(true)}
                  className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:underline"
                >
                  <Icon name="users2" size={10} />
                  <span>Chuyển quyền người tạo</span>
                </button>
              )}
            </div>
          </section>

          <hr className="border-[#232338]" />
        </>
      )}

      {/* ── Display level ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold uppercase text-[#a5a5c7]">
            Cấp độ hiển thị
          </h3>
          <span className="text-[10px] text-[#67678d]">
            {tiers.reduce((s, t) => s + t.count, 0)} bài
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {tiers.map((tier) => {
            const status = TIER_STATUS[tier.key];
            return (
              <button
                key={tier.key}
                type="button"
                title={status.description}
                className="flex w-full items-center justify-between rounded-[10px] border border-[#232338] bg-white/5 p-2.5 text-left text-[13px] text-[#a5a5c7] transition-colors hover:border-violet-500/40 hover:bg-[#1d1a30] hover:text-[#f1f1f7]"
              >
                <div className="flex items-center gap-2.5">
                  {/* Icon prefix — quick visual identifier (SVG, not emoji) */}
                  <span className="flex size-5 items-center justify-center text-[#a5a5c7]">
                    <Icon name={TIER_ICON[tier.key]} size={14} />
                  </span>
                  <span className="font-medium">{tier.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#67678d]">
                    {tier.count} bài
                  </span>
                  {/* Status dot — colour matches the audience. Pulsing for the
                      "close" tier to signal the most-private audience. */}
                  <span className="relative flex size-2.5">
                    {status.pulse && (
                      <span
                        className={`absolute inset-0 animate-ping rounded-full ${status.color} opacity-60`}
                      />
                    )}
                    <span className={`relative size-2.5 rounded-full ${status.color}`} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Invisible Mirror (Gương vô hình) ───────────────────────────── */}
      <section className="flex w-full flex-col gap-2.5 rounded-2xl border border-violet-500/25 bg-[rgba(18,18,34,0.6)] p-3 backdrop-blur-[10px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                mirrorEnabled
                  ? "bg-teal-500/15 text-teal-400"
                  : "bg-[#0f1118] text-[#67678d]"
              }`}
            >
              <Icon name={mirrorEnabled ? "eyeOff" : "eye"} size={14} />
            </span>
            <div className="flex flex-col">
              <h3 className="text-[13px] font-bold text-[#f1f1f7]">Gương vô hình</h3>
              <p className="text-[10px] text-[#67678d]">
                {mirrorEnabled ? "Đang bật" : "Đang tắt"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMirrorEnabled((prev) => !prev)}
            className={`relative h-[20px] w-9 rounded-full transition-colors ${
              mirrorEnabled ? "bg-teal-500" : "bg-[#2a2d37]"
            }`}
            aria-pressed={mirrorEnabled}
            aria-label="Bật gương vô hình"
          >
            <span
              className={`absolute top-0.5 size-[14px] rounded-full bg-white shadow transition-all ${
                mirrorEnabled ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <p className="text-[11px] text-[#a5a5c7]">
          Tự động làm mờ nội dung với thành viên mới trong nhóm
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#67678d]">Điểm thân thiết trung bình:</span>
            <span className="font-semibold text-teal-400">
              {averagePoints}
              <span className="text-[#67678d]"> / {MIRROR_CONFIG.imageFullPoints}</span>
            </span>
          </div>

          {/* Horizontal progress bar — current points vs full-points target */}
          <div
            className="relative h-2 w-full overflow-hidden rounded-full bg-[#1e1e2f]"
            title={`${mirrorPercent}% — ${averagePoints}/${MIRROR_CONFIG.imageFullPoints} điểm`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-violet-500 transition-all"
              style={{
                width: `${Math.min((averagePoints / MIRROR_CONFIG.imageFullPoints) * 100, 100)}%`,
              }}
            />
            {/* Video-unlock marker */}
            <span
              className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-[#0c0c14] bg-teal-300"
              style={{
                left: `calc(${(MIRROR_CONFIG.videoUnlockPoints / MIRROR_CONFIG.imageFullPoints) * 100}% - 5px)`,
              }}
              title={`Mở khóa video tại ${MIRROR_CONFIG.videoUnlockPoints} điểm`}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#67678d]">
            <span>
              <span className="font-semibold text-teal-400">{unlockedCount}</span>
              /{members.length || 0} đã đủ điểm xem video
            </span>
            <span>Video · {MIRROR_CONFIG.videoUnlockPoints}đ</span>
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#67678d]">
            <span>Hoạt động {MIRROR_CONFIG.activityWindowDays} ngày qua</span>
            <span>
              Streak tối đa ·{" "}
              <span className="font-semibold text-teal-400">
                +{MIRROR_CONFIG.streakBonusMax}
              </span>
            </span>
          </div>

          <p className="text-[10px] text-[#67678d]">
            Thời gian quen nhau: {unlockDays} ngày
          </p>
        </div>
      </section>

      {/* ── Add member modal ──────────────────────────────────────────── */}
      {showAddMember && (
        <AddMemberModal
          onClose={() => setShowAddMember(false)}
          onAdded={() => setMemberRefreshTick((v) => v + 1)}
        />
      )}

      {/* ── Ownership transfer modal (creator only) ──────────────────── */}
      {showTransferOwnership && activeGroupId && (
        <OwnershipTransferModal
          groupId={activeGroupId}
          eligibleMembers={members
            .filter((m) => m.role === "admin")
            // AdminMember type is a strict subset of Member, but TS can't
            // narrow `role?: "creator" | "admin" | "member"` through a
            // filter predicate. We cast through unknown to make the
            // conversion explicit at the call site.
            .map((m) => ({
              id: m.id,
              username: m.username,
              name: m.name,
              avatar: m.avatar,
              role: m.role ?? "member",
            }))}
          onClose={() => setShowTransferOwnership(false)}
          onTransferred={() => {
            setShowTransferOwnership(false);
            setMemberRefreshTick((v) => v + 1);
          }}
        />
      )}

      {/* ── Create-group modal (triggered from the + next to search) ── */}
      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(g) => {
            setShowCreate(false);
            // Auto-select the freshly created group + bump the refresh
            // tick so the centre feed and GroupSelector pull it in.
            onSelectGroup(g.id);
            setMemberRefreshTick((v) => v + 1);
          }}
        />
      )}
    </aside>
  );
}

function MemberAvatar({
  name,
  avatar,
  online,
}: {
  name: string;
  avatar: string | null;
  online: boolean;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col items-center gap-1">
      <div className="relative size-8 overflow-hidden rounded-2xl border border-[#232338]">
        <SafeAvatar
          src={avatar}
          alt={name}
          name={name}
          className="size-full"
        />
        {online && (
          <span className="absolute bottom-0 right-0 size-2.5">
            <Icon name="onlineIndicator" size={10} />
          </span>
        )}
      </div>
      <span
        className={`w-full truncate text-center text-[10px] ${
          online ? "text-[#a5a5c7]" : "text-[#67678d]"
        }`}
      >
        {name}
      </span>
    </div>
  );
}