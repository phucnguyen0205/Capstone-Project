"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { AssetKey } from "@/lib/assets";
import { PostModal } from "@/components/cloudinary/PostModal";
import type { LensLevel } from "@/components/cloudinary/PostModal";
import { PostDetailModal } from "@/components/PostDetailModal";
import { ShareModal } from "@/components/ShareModal";
import { MoreOptionsModal } from "@/components/MoreOptionsModal";
import { useCloseness } from "@/lib/closeness";

// ─── Types matching /api/groups/feed ────────────────────────────────────────
interface Author {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  isOnline: boolean;
}

interface FeedPost {
  id: string;
  userId: string;
  author: Author;
  caption: string;
  mediaUrl: string;
  mediaType: string;
  lens: "public" | "friends" | "close" | "private";
  createdAt: number;
  likes: number;
  comments: number;
  liked: boolean;
}

interface GroupsFeedProps {
  /** Force-refresh signal from parent (e.g. after a new post) */
  refreshSignal?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(unix: number): string {
  const delta = Math.floor(Date.now() / 1000 - unix);
  if (delta < 60) return "Vừa xong";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút trước`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ trước`;
  if (delta < 604800) return `${Math.floor(delta / 86400)} ngày trước`;
  return new Date(unix * 1000).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const LENS_LABELS: Record<FeedPost["lens"], { label: string; icon: AssetKey }> = {
  public: { label: "Công khai", icon: "globe" },
  friends: { label: "Bè bạn", icon: "users2" },
  close: { label: "Bạn thân", icon: "lockSmall" },
  private: { label: "Riêng tư", icon: "lock" },
};

const TIER_STYLES: Record<FeedPost["lens"], string> = {
  public: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  friends: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  close: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  private: "border-violet-500/20 bg-violet-500/10 text-violet-400",
};

const TIER_LABELS: Record<FeedPost["lens"], string> = {
  public: "Cấp 1 — Công khai",
  friends: "Cấp 2 — Bè bạn",
  close: "Cấp 3 — Thân thiết",
  private: "Cấp 4 — Riêng tư",
};

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────
export function GroupsFeed({
  refreshSignal = 0,
  activeGroupId,
}: GroupsFeedProps & { activeGroupId: string }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "public" | "friends" | "close">(
    "all"
  );
  const [showPostModal, setShowPostModal] = useState(false);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<{
    postId: string;
    username: string;
    authorName: string | null;
  } | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Phase 2: feed is scoped to the active group. The legacy
      // `/api/groups/feed` endpoint is left intact for callers that
      // don't pick a group (e.g. user feed in a future home tab).
      const res = await fetch(
        `/api/groups/${activeGroupId}/posts?limit=30`,
        { credentials: "include", cache: "no-store" }
      );
      const data = await safeJson<FeedPost[]>(res);
      if (!res.ok) {
        throw new Error("Không tải được bài viết");
      }
      setPosts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Lỗi");
    } finally {
      setLoading(false);
    }
  }, [activeGroupId]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed, refreshSignal]);

  async function toggleLike(post: FeedPost) {
    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              liked: !p.liked,
              likes: p.liked ? Math.max(0, p.likes - 1) : p.likes + 1,
            }
          : p
      )
    );
    try {
      const res = await fetch(`/api/interactions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like", postId: post.id }),
      });
      if (!res.ok) {
        // Revert on failure
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  liked: post.liked,
                  likes: post.likes,
                }
              : p
          )
        );
        return;
      }
    } catch {
      // Revert on network error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                liked: post.liked,
                likes: post.likes,
              }
            : p
        )
      );
    }
  }

  return (
    <>
      {/* h-full on this column resolves to the height of the main flex
          parent (the viewport minus TopBar). The toolbar (post button
          + filter chips) is sticky inside this column so it stays
          visible while the post list scrolls underneath. */}
      <section className="flex min-h-0 flex-1 shrink-0 flex-col gap-4 overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowPostModal(true)}
            className="flex items-center gap-2 rounded-[20px] bg-gradient-to-r from-violet-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0px_4px_6px_rgba(139,92,246,0.25)]"
          >
            <Icon name="camera" size={16} />
            <span>Đăng bài mới</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-[20px] border border-[#232338] bg-white/5 px-3 py-2 text-[13px] font-semibold text-[#f1f1f7]"
            >
              <span>Mới nhất</span>
              <Icon name="chevronDown" size={14} />
            </button>

            <div className="flex gap-0.5 rounded-[10px] bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={`flex items-center rounded p-1.5 ${
                  view === "grid" ? "border border-teal-500 bg-[#1d1d30]" : ""
                }`}
                aria-label="Xem dạng lưới"
              >
                <Icon name="layoutGrid" size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className="flex items-center rounded p-1.5"
                aria-label="Xem dạng danh sách"
              >
                <Icon name="list" size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "all" as const, label: "Tất cả", icon: "eye" as const },
            { key: "public" as const, label: "Công khai", icon: "globe" as const },
            { key: "friends" as const, label: "Bè bạn", icon: "users2" as const },
            { key: "close" as const, label: "Thân thiết", icon: "lockSmall" as const },
          ].map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`flex items-center gap-1.5 rounded-[20px] border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-teal-500 bg-teal-500 font-semibold text-[#0c0c14]"
                    : "border-[#232338] bg-white/5 font-medium text-[#a5a5c7]"
                }`}
              >
                <Icon name={item.icon} size={12} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable feed — only this region scrolls; toolbar + chips
            stay pinned thanks to the parent's overflow-hidden + the
            scroll region's flex-1 + min-h-0. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="size-8 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && posts.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#232338] bg-[rgba(18,18,34,0.4)] p-12 text-center">
              <Icon name="camera" size={32} className="text-[#67678d]" />
              <p className="text-sm font-semibold text-[#a5a5c7]">
                Chưa có bài viết nào trong nhóm
              </p>
              <p className="text-[12px] text-[#67678d]">
                Hãy thêm bạn bè hoặc đăng bài đầu tiên.
              </p>
            </div>
          )}

          {!loading && posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={() => toggleLike(post)}
              onDetail={() => setDetailPostId(post.id)}
              onShare={() => setShareFor(post.id)}
              onMore={() =>
                setMoreFor({
                  postId: post.id,
                  username: post.author.username,
                  authorName: post.author.name,
                })
              }
              onProfile={() =>
                router.push(`/profile/${post.author.username}`)
              }
            />
          ))}
        </div>
      </section>

      {showPostModal && (
        <PostModal
          onClose={() => setShowPostModal(false)}
          onPost={async ({ mediaUrl, mediaType, caption, lens, publicId }) => {
            try {
              // Two-step flow:
              //   1. POST /api/posts           — create a community/feed-scoped post.
              //   2. POST /api/groups/[id]/posts — attach that post to the active
              //      group (idempotent; ignores if already attached). The API
              //      rejects `groupIds` in /api/posts so we can't merge the
              //      calls into one.
              const res = await fetch("/api/posts", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mediaUrl,
                  mediaType,
                  caption,
                  lens,
                  publicId,
                }),
              });
              if (!res.ok) {
                const err = await safeJson<{ error?: string }>(res);
                setError(err?.error || "Đăng bài thất bại");
                setShowPostModal(false);
                return;
              }
              const created = (await safeJson<{ id?: string }>(res)) ?? {};
              if (activeGroupId && created.id) {
                const share = await fetch(
                  `/api/groups/${activeGroupId}/posts`,
                  {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ postId: created.id }),
                  },
                );
                if (!share.ok) {
                  const err = await safeJson<{ error?: string }>(share);
                  // The post already exists on the feed; surface a
                  // non-fatal warning so the author knows the group
                  // attach step didn't go through.
                  setError(
                    err?.error ||
                      "Đã đăng lên feed nhưng không chia sẻ được vào nhóm.",
                  );
                  setShowPostModal(false);
                  return;
                }
              }
              await loadFeed();
            } catch (e: any) {
              setError(e?.message ?? "Đăng bài thất bại");
            }
            setShowPostModal(false);
          }}
        />
      )}

      {detailPostId && (
        <PostDetailModal
          postId={detailPostId}
          onClose={() => setDetailPostId(null)}
          onChanged={() => loadFeed()}
        />
      )}

      {shareFor && (
        <ShareModal
          postId={shareFor}
          postUsername={
            posts.find((p) => p.id === shareFor)?.author.username ?? ""
          }
          onClose={() => setShareFor(null)}
          onShared={() => loadFeed()}
        />
      )}

      {moreFor && (
        <MoreOptionsModal
          postId={moreFor.postId}
          postUsername={moreFor.username}
          postAuthorName={moreFor.authorName}
          onClose={() => setMoreFor(null)}
          onShare={() => {
            setShareFor(moreFor.postId);
            setMoreFor(null);
          }}
          onEdit={() => setDetailPostId(moreFor.postId)}
          onDelete={async () => {
            try {
              const res = await fetch(`/api/posts/${moreFor.postId}`, {
                method: "DELETE",
                credentials: "include",
              });
              if (res.ok) {
                await loadFeed();
                setMoreFor(null);
              }
            } catch (e) {
              console.error(e);
            }
          }}
          onChanged={() => loadFeed()}
        />
      )}
    </>
  );
}

type PostCardProps = {
  post: FeedPost;
  onLike: () => void;
  onDetail: () => void;
  onShare: () => void;
  onMore: () => void;
  onProfile: () => void;
};

function PostCard({ post, onLike, onDetail, onShare, onMore, onProfile }: PostCardProps) {
  const authorName = post.author.name ?? post.author.username;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDetail();
        }
      }}
      className="flex w-full cursor-pointer flex-col gap-3 rounded-2xl border border-violet-500/25 bg-[rgba(18,18,34,0.6)] p-4 backdrop-blur-[10px] transition-colors hover:bg-[rgba(18,18,34,0.8)]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onProfile();
            }}
            className="relative size-9 overflow-hidden rounded-[18px] border border-[#232338] transition-opacity hover:opacity-80"
            title={`Xem trang cá nhân của @${post.author.username}`}
            aria-label={`Xem trang cá nhân của @${post.author.username}`}
          >
            {post.author.avatar ? (
              <img
                src={post.author.avatar}
                alt={authorName}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-sm font-bold text-white">
                {authorName[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            {post.author.isOnline && (
              <span className="absolute bottom-0 right-0 size-2.5">
                <Icon name="onlineIndicator" size={10} />
              </span>
            )}
          </button>
          <div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onProfile();
              }}
              className="block text-sm font-bold text-[#f1f1f7] hover:underline"
              title={`Xem trang cá nhân của @${post.author.username}`}
            >
              {authorName}
            </button>
            {/* Cùng hàng: thời gian (trước) + cấp độ hiển thị (sau) */}
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[11px] text-[#67678d]">
                {timeAgo(post.createdAt)}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIER_STYLES[post.lens]}`}
              >
                {TIER_LABELS[post.lens]}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Tùy chọn"
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
        >
          <Icon name="moreHorizontal" size={16} />
        </button>
      </div>

      {post.caption && (
        <p className="text-[13px] leading-[1.5] text-[#f1f1f7]">
          {post.caption}
        </p>
      )}

      {/* Ảnh full width — phá padding của article để sát mép ngang card */}
      <div className="-mx-4">
        <MediaArea post={post} />
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between text-[12px]"
      >
        <div className="flex items-center gap-4 text-[#a5a5c7]">
          <button
            type="button"
            onClick={onLike}
            className={`flex items-center gap-1 transition-colors hover:text-white ${
              post.liked ? "text-rose-400" : ""
            }`}
            aria-label={post.liked ? "Bỏ thích" : "Thích"}
          >
            <Icon name={post.liked ? "heartFilled" : "heart"} size={14} />
            <span>{post.likes}</span>
          </button>
          <span className="flex items-center gap-1">
            <Icon name="messageCircleAlt" size={14} />
            <span>{post.comments}</span>
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            className="flex items-center gap-1 hover:text-white"
          >
            <Icon name="share2" size={14} />
            <span>Chia sẻ</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onDetail}
          className="flex items-center gap-1.5 text-[#a5a5c7] hover:text-white"
        >
          <Icon name="bookmark" size={14} />
          <span>Lưu</span>
        </button>
      </div>
    </article>
  );
}

function MediaArea({ post }: { post: FeedPost }) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const isClose = post.lens === "close";
  const isPrivate = post.lens === "private";

  // "Gương vô hình" — pull the closeness score for this post's author
  // and use it to drive the blur amount on images and the unlock state
  // on videos. The lens decides how aggressive the mirror is: public
  // posts are exempt, friends needs 130/80, close needs 220/140.
  const { info: closeness } = useCloseness(
    post.userId === "self" ? null : post.userId,
    post.lens,
  );

  // Public lens or own post → no mirror, render the raw media.
  if (
    post.userId === "self" ||
    post.lens === "public" ||
    !closeness ||
    !closeness.mirrorEnabled
  ) {
    if (post.mediaType?.startsWith("video")) {
      return (
        <div className="relative w-full bg-black">
          <video
            src={post.mediaUrl}
            className="block max-h-[560px] w-full object-contain"
            controls
            playsInline
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
          {/* Play icon overlay - hidden when playing */}
          {!isPlaying && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                <Icon name="playCircle" size={40} className="text-white" />
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="relative w-full bg-black">
        <img
          src={post.mediaUrl}
          alt={post.author.name ?? post.author.username}
          className="block max-h-[560px] w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  const points = closeness.points;
  const blurPx = closeness.imageBlur;
  const videoUnlocked = closeness.videoUnlocked;
  const requiredImageFull = closeness.requiredImageFull;
  const requiredVideoUnlock = closeness.requiredVideoUnlock;

  if (isPrivate) {
    return (
      <div className="flex h-[200px] w-full flex-col items-center justify-center gap-4 border border-[#232338] bg-[rgba(13,13,25,0.8)] p-6 backdrop-blur-[15px]">
        <div className="flex size-12 items-center justify-center rounded-3xl border border-violet-500/25 bg-violet-500/10">
          <Icon name="lockLarge" size={20} />
        </div>
        <p className="text-center text-sm font-bold text-[#f1f1f7]">
          Nội dung Cấp 4 — Riêng tư
        </p>
        <p className="text-center text-[12px] text-[#67678d]">
          Chỉ tác giả mới thấy bài viết này.
        </p>
      </div>
    );
  }

  if (isClose) {
    return (
      <div className="relative w-full overflow-hidden">
        <img
          src={post.mediaUrl}
          alt={post.author.name ?? post.author.username}
          className="block max-h-[560px] w-full object-contain transition-[filter] duration-500"
          style={{ filter: `blur(${blurPx}px)` }}
          loading="lazy"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 p-4 backdrop-blur-md">
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
            <Icon name="lockOverlay" size={14} />
            <span>Nội dung Cấp 3 — Thân thiết</span>
          </span>

          {/* Closeness progress — visible points vs full-points target */}
          <div className="flex w-full max-w-[260px] flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-white/85">
              <span>Điểm thân thiết</span>
              <span className="font-semibold text-teal-300">
                {points}/{requiredImageFull}
              </span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-violet-400 transition-all"
                style={{
                  width: `${Math.min((points / requiredImageFull) * 100, 100)}%`,
                }}
              />
              <span
                className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full border border-white/70 bg-teal-300"
                style={{
                  left: `calc(${(requiredVideoUnlock / requiredImageFull) * 100}% - 4px)`,
                }}
                title={`Mở khóa video tại ${requiredVideoUnlock}đ`}
              />
            </div>
          </div>

          <p className="text-[11px] text-white/80">
            Tương tác thường xuyên để mở khóa hoàn toàn
          </p>

          <div className="flex items-center gap-1.5 rounded-md border border-[#232338] bg-black/65 px-2.5 py-1">
            <Icon name="eyePreview" size={12} />
            <span className="text-[10px] font-semibold text-[#a5a5c7]">
              {blurPx > 0 ? `Đang mờ ${blurPx}px` : "Rõ nét"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // public / friends — videos require enough closeness points to be
  // watched, images get progressively less blurred.
  if (post.mediaType === "video") {
    if (!videoUnlocked) {
      return (
        <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden border border-amber-500/30 bg-black">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url(${post.mediaUrl})`, filter: "blur(8px)" }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 flex size-12 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/10">
            <Icon name="playCircle" size={22} className="text-white" />
          </div>
          <p className="relative z-10 text-center text-sm font-bold text-white">
            Video bị khóa
          </p>
          <p className="relative z-10 px-6 text-center text-[11px] text-white/80">
            Cần đạt {requiredVideoUnlock} điểm thân thiết với{" "}
            {post.author.name ?? post.author.username} để xem.
          </p>
          <div className="relative z-10 flex w-44 flex-col gap-1">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-amber-300"
                style={{
                  width: `${Math.min((points / requiredImageFull) * 100, 100)}%`,
                }}
              />
            </div>
            <span className="text-center text-[10px] text-white/70">
              {points}/{requiredVideoUnlock} điểm cần để mở
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="relative w-full bg-black">
        <video
          src={post.mediaUrl}
          className="block max-h-[560px] w-full object-contain"
          controls
          playsInline
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
        {/* Play icon overlay - hidden when playing */}
        {!isPlaying && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Icon name="playCircle" size={40} className="text-white" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Image with closeness-driven blur — full width, capped height so very
  // tall portraits don't push the card off-screen. No `rounded-xl` here
  // because the image sits flush against the card edges thanks to the
  // `-mx-4` wrapper in PostCard.
  return (
    <div className="relative w-full bg-black">
      <img
        src={post.mediaUrl}
        alt={post.author.name ?? post.author.username}
        className="block max-h-[560px] w-full object-contain transition-[filter] duration-500"
        style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined }}
        loading="lazy"
      />
      {blurPx > 0 && (
        <span className="absolute bottom-2 right-2 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-md">
          Mờ {blurPx}px · {points}/{requiredImageFull}
        </span>
      )}
    </div>
  );
}