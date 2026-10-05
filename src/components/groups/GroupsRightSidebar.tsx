"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { PostDetailModal } from "@/components/PostDetailModal";

interface GalleryItem {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  lens: string;
  createdAt: number;
  /** Server-computed: points the viewer still needs to unlock this post.
   *  0 means the viewer can already see it. Undefined for legacy rows
   *  that haven't been through the new feed endpoint yet. */
  pointsToUnlock?: number;
  /** Mirror of the global imageFullPoints so the tile can render a
   *  stable "Cần X/Yđ" tooltip without a second fetch. */
  effectiveUnlock?: number;
}

interface RecentMember {
  id: string;
  name: string | null;
  username: string;
  avatar: string | null;
  friendshipCreatedAt: number;
  addedBy: string | null;
}

interface Activity {
  id: string;
  type: "join" | "like" | "comment";
  actor: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
  postId?: string;
  content?: string;
  createdAt: number;
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

function timeAgo(unix: number): string {
  if (!unix || !Number.isFinite(unix) || unix <= 0) return "—";
  const delta = Math.floor(Date.now() / 1000 - unix);
  // Guard against future-dated records (clock skew) — show the same
  // friendly label we use for very recent timestamps so we never print
  // "Invalid Date" in the UI.
  if (delta < 0) return "Vừa xong";
  if (delta < 60) return "Vừa xong";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút trước`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ trước`;
  if (delta < 604800) return `${Math.floor(delta / 86400)} ngày trước`;
  return new Date(unix * 1000).toLocaleDateString("vi-VN");
}

function activityLabel(act: Activity): string {
  const name = act.actor.name ?? act.actor.username;
  if (act.type === "join") return `${name} đã tham gia nhóm`;
  if (act.type === "like") return `${name} đã thích một bài viết`;
  if (act.type === "comment")
    return `${name} đã bình luận: ${act.content?.slice(0, 40) ?? ""}${act.content && act.content.length > 40 ? "…" : ""}`;
  return name;
}

export function GroupsRightSidebar({
  refreshSignal = 0,
  activeGroupId,
}: {
  refreshSignal?: number;
  activeGroupId: string | null;
}) {
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [recentMembers, setRecentMembers] = useState<RecentMember[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllGallery, setShowAllGallery] = useState(false);

  const loadData = useCallback(async () => {
    // Phase 2: scoped to a single group. When there's no active group,
    // render an empty state instead of fetching the legacy global
    // endpoints (those will be retired in Phase 3).
    if (!activeGroupId) {
      setGallery([]);
      setRecentMembers([]);
      setActivities([]);
      setLoading(false);
      return;
    }
    try {
      // Phase 3: every panel reads from per-group endpoints so the
      // sidebar reflects what happened *inside* the active group.
      // The tier counts + recent gallery live in
      // /api/groups/[id]/gallery now (was /api/groups/tiers which
      // returned the viewer's GLOBAL friend posts — that surfaced
      // off-topic content in the "Thư viện nhóm" tile).
      const [galleryRes, membersRes, activityRes] = await Promise.all([
        fetch(`/api/groups/${activeGroupId}/gallery`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/groups/${activeGroupId}/members`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/groups/${activeGroupId}/activity`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const galleryData = await safeJson<{
        recent: GalleryItem[];
      }>(galleryRes);
      const memData = await safeJson<RecentMember[]>(membersRes);
      const actData = await safeJson<Activity[]>(activityRes);

      setGallery(galleryData?.recent ?? []);
      setRecentMembers(Array.isArray(memData) ? memData : []);
      setActivities(Array.isArray(actData) ? actData : []);
    } finally {
      setLoading(false);
    }
  }, [activeGroupId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  return (
    <aside className="flex min-h-0 w-[310px] shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto border-l border-[#232338] p-4">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="layoutGrid" size={16} />
          <h2 className="text-[13px] font-bold uppercase text-[#f1f1f7]">
            Thư viện nhóm
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="size-[86px] animate-pulse rounded-lg bg-white/5"
              />
            ))}
          </div>
        ) : gallery.length === 0 ? (
          <p className="text-[12px] text-[#67678d]">
            Chưa có ảnh/video nào trong nhóm.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {(showAllGallery ? gallery : gallery.slice(0, 6)).map((item) => (
                <GalleryTile key={item.id} item={item} />
              ))}
            </div>

            {gallery.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllGallery((v) => !v)}
                className="self-start text-[12px] font-semibold text-teal-400"
              >
                {showAllGallery
                  ? "Thu gọn"
                  : `Xem tất cả ${gallery.length} ảnh/video →`}
              </button>
            )}
          </>
        )}
      </section>

      <hr className="border-[#232338]" />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="clock" size={16} />
          <h2 className="text-[13px] font-bold uppercase text-[#f1f1f7]">
            Thành viên mới thêm
          </h2>
        </div>

        <div className="flex flex-col gap-2.5">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
            ))
          ) : recentMembers.length === 0 ? (
            <p className="text-[12px] text-[#67678d]">
              Chưa có thành viên nào.
            </p>
          ) : (
            recentMembers.slice(0, 5).map((member) => {
              const name = member.name ?? member.username;
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2.5"
                >
                  <div className="size-8 shrink-0 overflow-hidden rounded-2xl border border-[#232338] bg-[#c6c6c6]">
                    <SafeAvatar
                      src={member.avatar}
                      alt={name}
                      name={name}
                      className="size-full"
                    />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-xs text-[#f1f1f7]">
                    <span className="font-bold">{name}</span>
                    {member.addedBy ? (
                      <>
                        <span> được thêm bởi </span>
                        <span className="font-semibold text-teal-400">
                          {member.addedBy}
                        </span>
                      </>
                    ) : (
                      <span className="text-[#67678d]"> · tự tham gia</span>
                    )}
                  </p>
                  <span className="shrink-0 text-[11px] text-[#67678d]">
                    {timeAgo(member.friendshipCreatedAt)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="w-full rounded-lg border border-violet-500/15 bg-[#1e1929] p-2.5 text-[11px] leading-[1.4] text-[#a5a5c7]">
          Thành viên mới chỉ xem được bài từ ngày được thêm vào nhóm.
        </div>
      </section>

      <hr className="border-[#232338]" />

      <section className="flex flex-col gap-3">
        <h3 className="text-[13px] font-bold uppercase text-[#a5a5c7]">
          Hoạt động gần đây
        </h3>

        <div className="flex flex-col gap-2.5 text-xs">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-white/5" />
            ))
          ) : activities.length === 0 ? (
            <p className="text-[12px] text-[#67678d]">
              Chưa có hoạt động nào gần đây.
            </p>
          ) : (
            activities.slice(0, 6).map((act, index) => (
              <div
                key={act.id}
                className={`flex min-w-0 flex-col gap-0.5 pb-2 ${
                  index < Math.min(activities.length, 6) - 1
                    ? "border-b border-[#232338]"
                    : ""
                }`}
              >
                <p className="min-w-0 truncate text-[12px] leading-[1.4] text-[#f1f1f7]">
                  {activityLabel(act)}
                </p>
                <p className="text-[11px] text-[#67678d]">
                  {timeAgo(act.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

function GalleryTile({ item }: { item: GalleryItem }) {
  const date = new Date(item.createdAt * 1000).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
// A tile is locked when:
//   - The post is private (lens === 'private'). The viewer is never
//     allowed to see this; the post is owner-only.
//   - The post is close-friends AND the viewer doesn't have enough
//     closeness points to meet the global unlock. The server tells
//     us `pointsToUnlock > 0` in this case.
// Note: a close-lens post the viewer DOES have enough to unlock is
// treated as unlocked — the hover hint and click-to-detail both
// apply. We don't blanket-block all "close" lens posts here; the
// server's pointsToUnlock is the source of truth for that.
const isPrivate = item.lens === "private";
const isPointsLocked =
  typeof item.pointsToUnlock === "number" && item.pointsToUnlock > 0;
const isLocked = isPrivate || isPointsLocked;
const [open, setOpen] = useState(false);

const hoverHint = isPointsLocked
  ? `Cần thêm ${item.pointsToUnlock} điểm thân thiết để mở khoá (hiện có ${(item.effectiveUnlock ?? 0) - item.pointsToUnlock!}/${item.effectiveUnlock ?? 0}đ)`
  : isPrivate
    ? "Bài viết riêng tư — không thể mở khoá từ thư viện"
    : "Bấm để xem chi tiết";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isLocked) return;
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (isLocked) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        title={hoverHint}
        aria-label={isLocked ? hoverHint : `Mở bài viết ngày ${date}`}
        className={`group/tile relative size-[86px] shrink-0 overflow-hidden rounded-lg outline-none transition-all ${
          isLocked
            ? "cursor-default"
            : "cursor-pointer hover:ring-2 hover:ring-violet-400/60 focus-visible:ring-2 focus-visible:ring-violet-400/80"
        }`}
      >
        {item.mediaType === "video" ? (
          <video
            src={item.mediaUrl}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={item.mediaUrl}
            alt={date}
            className="size-full object-cover"
            loading="lazy"
          />
        )}

        {item.mediaType === "video" && (
          <div className="absolute left-1/2 top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-black/40">
            <Icon name="playCircle" size={14} />
          </div>
        )}

        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-[3px]">
            <Icon name="lockSmall" size={14} />
          </div>
        )}

        {/* Hover overlay for locked tiles — a small chip that names
            the gap so users know whether it's a "Cần X điểm" lock
            or a hard private-lens lock. Native `title` is the
            fallback for screen readers and accessibility tooling. */}
        {isLocked && (
          <div
            className="pointer-events-none absolute inset-x-1 bottom-5 rounded bg-black/75 px-1 py-0.5 text-center text-[8px] font-semibold text-amber-200 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100"
            role="tooltip"
          >
            {isPointsLocked
              ? `Cần ${item.pointsToUnlock} điểm để mở`
              : "Bài riêng tư"}
          </div>
        )}

        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
          {date}
        </span>
      </button>

      {!isLocked && open && (
        <PostDetailModal postId={item.id} onClose={() => setOpen(false)} />
      )}
    </>
  );
}