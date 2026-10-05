"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { assets, type AssetKey } from "@/lib/assets";
import { Icon } from "@/components/ui/Icon";
import { PostModal } from "@/components/cloudinary/PostModal";
import { PostDetailModal } from "@/components/PostDetailModal";
import { ShareModal } from "@/components/ShareModal";
import { MoreOptionsModal } from "@/components/MoreOptionsModal";
import { useCloseness } from "@/lib/closeness";

interface FeedAuthor {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  isOnline: boolean;
}

interface FeedPost {
  id: string;
  userId: string;
  caption: string;
  mediaUrl: string;
  mediaType: string;
  publicId: string | null;
  lens: "public" | "friends" | "close";
  createdAt: number;
  author: FeedAuthor;
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
  isOwn: boolean;
  mediaWidth?: number;
  mediaHeight?: number;
}

type Tab = "for-you" | "following";

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function FeedColumn() {
  const [activeTab, setActiveTab] = useState<Tab>("for-you");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Per-post action state (UI loading flags)
  const [busyLikeIds, setBusyLikeIds] = useState<Set<string>>(new Set());
  const [busySaveIds, setBusySaveIds] = useState<Set<string>>(new Set());

  // Comments drawer for a specific post
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  // When set, opens PostDetailModal directly in edit mode (used by
  // "Sửa bài viết" from the MoreOptionsModal of a feed card).
  const [editDirectPostId, setEditDirectPostId] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<{
    postId: string;
    username: string;
    authorName: string | null;
  } | null>(null);
  const router = useRouter();

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/feed?tab=${activeTab}&limit=20`,
        { credentials: "include", cache: "no-store" }
      );
      const data = await safeJson<FeedPost[]>(res);
      if (!res.ok) {
        throw new Error("Không tải được feed");
      }
      // Deduplicate by post id — guards against stale Fast Refresh network ghosts
      const unique = Array.isArray(data)
        ? (data as FeedPost[]).reduce<FeedPost[]>((acc, post) => {
            if (!acc.some((p) => p.id === post.id)) acc.push(post);
            return acc;
          }, [])
        : [];
      setPosts(unique);
    } catch (e: any) {
      setError(e?.message ?? "Lỗi");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  async function toggleLike(post: FeedPost) {
    if (busyLikeIds.has(post.id)) return;
    setBusyLikeIds((prev) => new Set([...prev, post.id]));

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
      const res = await fetch("/api/interactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like", postId: post.id }),
      });
      if (!res.ok) {
        // Revert
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
    } catch {
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
    } finally {
      setBusyLikeIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  }

  async function toggleSave(post: FeedPost) {
    if (busySaveIds.has(post.id)) return;
    setBusySaveIds((prev) => new Set([...prev, post.id]));

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, saved: !p.saved } : p
      )
    );
    try {
      const res = await fetch(`/api/posts/${post.id}/save`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        // Revert
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id ? { ...p, saved: post.saved } : p
          )
        );
      }
    } catch {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, saved: post.saved } : p
        )
      );
    } finally {
      setBusySaveIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  }

  async function deletePost(post: FeedPost) {
    if (!post.isOwn) return;
    if (!window.confirm("Xoá bài viết này?")) return;
    return deletePostById(post.id);
  }

  async function deletePostById(postId: string) {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        setMoreFor(null);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function onCommentPosted(postId: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments: p.comments + 1 } : p
      )
    );
  }

  // In the "Đang theo dõi" tab, the API includes own posts alongside
  // mutual-friend posts, but their relative order is plain
  // `created_at DESC`. The viewer mostly cares about their own posts
  // here (it's the only place they get surfaced on this tab), so we
  // pull them to the top — keeps them obvious and prevents them from
  // being missed if the list scrolls fast. For the for-you tab we
  // keep the recency order.
  const mainPost =
    activeTab === "following"
      ? posts.find((p) => p.isOwn) ?? posts[0]
      : posts[0];
  const restPosts = mainPost
    ? posts.filter((p) => p.id !== mainPost.id)
    : posts.slice(1);

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-lg">
          <button
            type="button"
            onClick={() => setActiveTab("for-you")}
            className={
              activeTab === "for-you"
                ? "font-extrabold text-white"
                : "font-medium text-[#626775]"
            }
          >
            Dành cho bạn
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("following")}
            className={
              activeTab === "following"
                ? "font-extrabold text-white"
                : "font-medium text-[#626775]"
            }
          >
            Đang theo dõi
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 rounded-full px-4 py-2"
          style={{
            backgroundImage:
              "linear-gradient(13deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
          }}
        >
          <Icon name="video" size={16} />
          <span className="text-[13px] font-bold text-white">Tải video lên</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyFeed tab={activeTab} onUpload={() => setShowUploadModal(true)} />
      ) : (
        <>
          {mainPost && (
            <FeaturedPost
              post={mainPost}
              onLike={() => toggleLike(mainPost)}
              onSave={() => toggleSave(mainPost)}
              onComment={() => setCommentsFor(mainPost.id)}
              onDetail={() => setDetailPostId(mainPost.id)}
              onShare={() => setShareFor(mainPost.id)}
              onMore={() =>
                setMoreFor({
                  postId: mainPost.id,
                  username: mainPost.author.username,
                  authorName: mainPost.author.name,
                })
              }
              onDelete={() => deletePost(mainPost)}
              onProfile={() =>
                router.push(`/profile/${mainPost.author.username}`)
              }
            />
          )}

          {restPosts.length > 0 && (
            <div className="flex flex-col gap-4">
              {restPosts.map((post, i) => (
                <FeedPostRow
                  key={post.id}
                  post={post}
                  onLike={() => toggleLike(post)}
                  onSave={() => toggleSave(post)}
                  onComment={() => setCommentsFor(post.id)}
                  onDetail={() => setDetailPostId(post.id)}
                  onShare={() => setShareFor(post.id)}
                  onMore={() =>
                    setMoreFor({
                      postId: post.id,
                      username: post.author.username,
                      authorName: post.author.name,
                    })
                  }
                  onDelete={() => deletePost(post)}
                  onProfile={() => router.push(`/profile/${post.author.username}`)}
                  priority={i === 0}
                />
              ))}
            </div>
          )}

          {/* The previous "Trending strip" rendered hardcoded
              trendingItems from src/lib/mock-data. Removed: the app only
              surfaces real posts; any "trending" surface should be
              backed by an analytics endpoint, not static placeholders. */}
        </>
      )}

      {commentsFor && (
        <CommentsDrawer
          postId={commentsFor}
          onClose={() => setCommentsFor(null)}
          onPosted={() => onCommentPosted(commentsFor)}
        />
      )}

      {detailPostId && (
        <PostDetailModal
          postId={detailPostId}
          onClose={() => setDetailPostId(null)}
          onChanged={() => loadFeed()}
        />
      )}

      {editDirectPostId && (
        <PostDetailModal
          postId={editDirectPostId}
          initialEdit
          onClose={() => setEditDirectPostId(null)}
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
          onEdit={() => setEditDirectPostId(moreFor.postId)}
          onDelete={() => deletePostById(moreFor.postId)}
          onChanged={() => {
            loadFeed();
          }}
        />
      )}

      {showUploadModal && (
        <PostModal
          onClose={() => setShowUploadModal(false)}
          onPost={async ({ mediaUrl, mediaType, caption, lens, mediaWidth, mediaHeight }) => {
            try {
              const res = await fetch("/api/feed", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mediaUrl, mediaType, caption, lens, mediaWidth, mediaHeight }),
              });
              if (res.ok) {
                await loadFeed();
              }
            } catch (e) {
              console.error(e);
            }
            setShowUploadModal(false);
          }}
        />
      )}
    </section>
  );
}

// ─── Featured post (the first/main one) ──────────────────────────────────────
function FeaturedPost({
  post,
  onLike,
  onSave,
  onComment,
  onDetail,
  onShare,
  onMore,
  onDelete,
  onProfile,
}: {
  post: FeedPost;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
  onDetail: () => void;
  onShare: () => void;
  onMore: () => void;
  onDelete: () => void;
  onProfile: () => void;
}) {
  return (
    <div className="relative mb-4 flex h-[520px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-white/8 bg-[#171920]">
      {/* Media — contained within frame (object-contain) so the image is
          never cropped or distorted outside its frame. Click opens detail
          for non-video media; for videos, the video element below stops
          click propagation so clicking the video plays it instead of
          opening the detail modal. The "Gương vô hình" overlay (blur for
          images, lock for videos) is rendered inside so the mirror rules
          apply to the feed card exactly as they do in the detail modal. */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-black">
        <button
          type="button"
          onClick={onDetail}
          className="block h-full w-full cursor-pointer"
          aria-label="Xem chi tiết bài viết"
        >
          <FeedMedia
            postUserId={post.userId}
            isOwn={post.isOwn}
            authorName={post.author.name ?? post.author.username}
            authorUsername={post.author.username}
            mediaUrl={post.mediaUrl}
            mediaType={post.mediaType}
            lens={post.lens}
          />
        </button>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40" />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onProfile();
            }}
            className="size-10 shrink-0 overflow-hidden rounded-[20px] bg-[#c6c6c6] transition-opacity hover:opacity-80"
            title={`Xem trang cá nhân của @${post.author.username}`}
            aria-label={`Xem trang cá nhân của @${post.author.username}`}
          >
            {post.author.avatar ? (
              <img
                src={post.author.avatar}
                alt={post.author.username}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-sm font-bold text-white">
                {(post.author.name ?? post.author.username)[0]?.toUpperCase() ?? "?"}
              </div>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onProfile();
                }}
                className="truncate text-[15px] font-bold text-white hover:underline"
                title={`Xem trang cá nhân của @${post.author.username}`}
              >
                @{post.author.username}
              </button>
              {!post.isOwn && (
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                  style={{
                    backgroundImage:
                      "linear-gradient(17deg, rgb(0, 229, 255) 25%, rgb(0, 102, 255) 75%)",
                  }}
                >
                  Theo dõi
                </span>
              )}
              {post.isOwn && (
                <span className="shrink-0 rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-bold text-white">
                  Của bạn
                </span>
              )}
            </div>
            <p className="truncate text-[13px] text-[#a0a5b5]">
              {post.caption || "Nội dung bài viết"}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="absolute right-4 bottom-24 z-10 flex flex-col items-center gap-3">
        <ActionButton
          icon={post.liked ? "heartFilled" : "heart"}
          label={formatCount(post.likes)}
          gradient
          active={post.liked}
          onClick={onLike}
        />
        <ActionButton
          icon="messageCircleAlt"
          label={formatCount(post.comments)}
          onClick={onComment}
        />
        <ActionButton
          icon={post.saved ? "bookmark" : "bookmark"}
          label={post.saved ? "Đã lưu" : "Lưu"}
          active={post.saved}
          onClick={onSave}
        />
        <ActionButton
          icon="share2"
          label="Chia sẻ"
          onClick={onShare}
        />
        <ActionButton
          icon="moreHorizontal"
          label="Thêm"
          onClick={onMore}
        />
        {post.isOwn && (
          <ActionButton
            icon="circleX"
            label="Xoá"
            onClick={onDelete}
          />
        )}
      </div>
    </div>
  );
}

// ─── Compact feed row (subsequent posts) ────────────────────────────────────
function FeedPostRow({
  post,
  onLike,
  onSave,
  onComment,
  onDetail,
  onShare,
  onMore,
  onDelete,
  onProfile,
  priority = false,
}: {
  post: FeedPost;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
  onDetail: () => void;
  onShare: () => void;
  onMore: () => void;
  onDelete: () => void;
  onProfile: () => void;
  priority?: boolean;
}) {
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
      className="flex cursor-pointer gap-3 rounded-2xl border border-white/8 bg-[#171920] p-4 transition-colors hover:bg-[#1c1f2b]"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onProfile();
        }}
        className="size-10 shrink-0 overflow-hidden rounded-full bg-[#c6c6c6] transition-opacity hover:opacity-80"
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
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onProfile();
            }}
            className="truncate text-[13px] font-bold text-white hover:underline"
            title={`Xem trang cá nhân của @${post.author.username}`}
          >
            @{post.author.username}
          </button>
          <span className="text-[11px] text-[#626775]">
            · {new Date(post.createdAt * 1000).toLocaleString("vi-VN")}
          </span>
          <span
            className={`ml-auto flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${lensBadgeClass(post.lens)}`}
          >
            <Icon name={lensIcon(post.lens)} size={10} />
            {lensLabel(post.lens)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
            className="flex size-7 items-center justify-center rounded-full text-[#626775] hover:bg-white/5 hover:text-white"
            title="Tùy chọn khác"
          >
            <Icon name="moreHorizontal" size={14} />
          </button>
        </div>

        {post.caption && (
          <p className="mt-1 text-[13px] text-[#cfd2dd]">{post.caption}</p>
        )}

        {post.mediaUrl && (
          <MediaGrid
            mediaUrl={post.mediaUrl}
            mediaType={post.mediaType}
            width={post.mediaWidth}
            height={post.mediaHeight}
            authorName={authorName}
            priority={priority}
          />
        )}

        {/* Action row — stops propagation so clicks don't open detail */}
        <div
          className="mt-3 flex items-center gap-4 text-[11px] text-[#a0a5b5]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onLike}
            className={`flex items-center gap-1 ${post.liked ? "text-red-400" : "hover:text-white"}`}
          >
            <Icon name={post.liked ? "heartFilled" : "heart"} size={14} />
            {post.likes}
          </button>
          <button
            type="button"
            onClick={onComment}
            className="flex items-center gap-1 hover:text-white"
          >
            <Icon name="messageCircleAlt" size={14} />
            {post.comments}
          </button>
          <button
            type="button"
            onClick={onSave}
            className={`flex items-center gap-1 ${post.saved ? "text-yellow-400" : "hover:text-white"}`}
          >
            <Icon name="bookmark" size={14} />
            {post.saved ? "Đã lưu" : "Lưu"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            className="flex items-center gap-1 hover:text-white"
          >
            <Icon name="share2" size={14} />
            Chia sẻ
          </button>
          {post.isOwn && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto flex items-center gap-1 text-[#a0a5b5] hover:text-red-400"
            >
              <Icon name="circleX" size={14} />
              Xoá
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Comments drawer ────────────────────────────────────────────────────────
function CommentsDrawer({
  postId,
  onClose,
  onPosted,
}: {
  postId: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [comments, setComments] = useState<
    {
      id: string;
      postId: string;
      userId: string;
      content: string;
      createdAt: number;
      author: { username: string; name: string | null; avatar: string | null };
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<typeof comments>(res);
      setComments(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setText("");
        await load();
        onPosted();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-[#232338] bg-[#171920] p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-bold text-white">Bình luận</p>
          <button
            type="button"
            onClick={onClose}
            className="text-[#a0a5b5] hover:text-white"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[#626775]">
              Đang tải...
            </div>
          ) : comments.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[12px] text-[#626775]">
              Chưa có bình luận nào.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map((c) => {
                const name = c.author.name ?? c.author.username;
                return (
                  <div key={c.id} className="flex items-start gap-2">
                    <div className="size-8 shrink-0 overflow-hidden rounded-full bg-[#c6c6c6]">
                      {c.author.avatar ? (
                        <img
                          src={c.author.avatar}
                          alt={name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[10px] font-bold text-white">
                          {name[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 rounded-xl bg-[#0f1118] p-2.5">
                      <p className="text-[12px] font-bold text-white">
                        {name}
                        <span className="ml-2 text-[10px] font-normal text-[#626775]">
                          @{c.author.username} ·{" "}
                          {new Date(c.createdAt * 1000).toLocaleString("vi-VN")}
                        </span>
                      </p>
                      <p className="mt-1 text-[13px] text-[#cfd2dd]">{c.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="mt-3 flex items-center gap-2 border-t border-[#232338] pt-3"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Viết bình luận..."
            disabled={submitting}
            className="flex-1 rounded-full border border-[#232338] bg-[#0f1118] px-4 py-2 text-[13px] text-white outline-none placeholder:text-[#626775] focus:border-[#00e5ff]/50"
          />
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="rounded-full bg-[#00e5ff] px-4 py-2 text-[12px] font-bold text-[#09090f] disabled:opacity-50"
          >
            Gửi
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── ActionButton (used inside FeaturedPost) ────────────────────────────────
function ActionButton({
  icon,
  label,
  gradient,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  gradient?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1"
    >
      <div
        className={`flex size-11 items-center justify-center rounded-[22px] ${
          active ? "bg-white/20" : gradient ? "" : "border border-white/8 bg-[#2a2d37]"
        } ${icon === "heartFilled" && active ? "text-red-400" : ""} ${icon === "bookmark" && active ? "text-yellow-400" : ""}`}
        style={
          gradient && !active
            ? {
                backgroundImage:
                  "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
              }
            : undefined
        }
      >
        <Icon name={icon as any} size={20} />
      </div>
      <span className="text-[11px] font-bold text-[#a0a5b5]">{label}</span>
    </button>
  );
}

function EmptyFeed({
  tab,
  onUpload,
}: {
  tab: Tab;
  onUpload: () => void;
}) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-[#242831] bg-[#171920]">
      <div className="flex size-16 items-center justify-center rounded-full bg-white/5">
        <Icon name="video" size={32} className="text-[#626775]" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-[#94a3b8]">
          {tab === "following"
            ? "Chưa có bài nào từ bạn bè (follow lẫn nhau)"
            : "Chưa có bài viết nào"}
        </p>
        <p className="mt-1 text-xs text-[#626775]">
          {tab === "following"
            ? "Hãy kết nối với nhiều người hơn để xem bài viết của họ ở đây."
            : "Hãy là người đầu tiên đăng bài!"}
        </p>
      </div>
      <button
        type="button"
        onClick={onUpload}
        className="flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold text-white"
        style={{
          backgroundImage:
            "linear-gradient(13deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
        }}
      >
        <Icon name="camera" size={14} />
        Tải lên ngay
      </button>
    </div>
  );
}

// ─── Facebook-style media grid ──────────────────────────────────────────────
function MediaGrid({
  mediaUrl,
  mediaType,
  width,
  height,
  authorName,
  priority = false,
}: {
  mediaUrl: string;
  mediaType: string;
  width?: number;
  height?: number;
  authorName: string;
  priority?: boolean;
}) {
  // Determine aspect ratio from stored dimensions or infer from URL pattern.
  // When dimensions are missing, fall back to 16/9. We also keep a generous
  // `min-height` so the container always has a definite height — some flex
  // parents can momentarily report 0 width on first render, which would
  // otherwise collapse `aspect-ratio` to 0 and cause `next/image` (with
  // `fill`) to warn about a 0-height parent.
  const aspectRatio = width && height ? `${width}/${height}` : "16/9";

  const containerClass =
    "relative mt-3 flex w-full min-w-0 grow overflow-hidden rounded-xl bg-black";

  if (mediaType === "video") {
    const [isPlaying, setIsPlaying] = React.useState(false);
    
    return (
      <div
        className={containerClass}
        style={{ aspectRatio: "16/9", maxHeight: 500 }}
      >
        <video
          src={mediaUrl}
          className="size-full object-contain"
          controls
          playsInline
          preload="metadata"
          onClick={(e) => {
            // Don't bubble to the surrounding "open detail" button —
            // clicking the video should play/pause it, not open detail.
            e.stopPropagation();
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
        {/* Play icon overlay - hidden when playing */}
        {!isPlaying && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Icon name="triangleRight" size={32} className="text-white" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Single image — use stored aspect ratio, cap at reasonable max
  return (
    <div
      className={containerClass}
      style={{
        aspectRatio,
        maxHeight: 500,
        minHeight: 280,
      }}
    >
      <Image
        src={mediaUrl}
        alt={authorName}
        fill
        sizes="(max-width: 768px) 100vw, 540px"
        priority={priority}
        className="object-contain"
      />
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function lensBadgeClass(lens: FeedPost["lens"]) {
  if (lens === "public") return "border-blue-500/20 bg-blue-500/10 text-blue-400";
  if (lens === "friends") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
  return "border-amber-500/20 bg-amber-500/10 text-amber-400";
}

function lensLabel(lens: FeedPost["lens"]) {
  if (lens === "public") return "Công khai";
  if (lens === "friends") return "Bè bạn";
  return "Thân thiết";
}

function lensIcon(lens: FeedPost["lens"]): AssetKey {
  if (lens === "public") return "globe";
  if (lens === "friends") return "users2";
  return "lockSmall";
}

/**
 * Feed-card media with the "Gương vô hình" rules:
 *   - own posts                       → always unblurred / unlocked
 *   - public posts                    → mirror disabled, render raw
 *   - `friends` posts                 → blur / unlock via LENS_MIRROR_CONFIG.friends
 *   - `close` posts                   → blur / unlock via LENS_MIRROR_CONFIG.close
 *
 * Keeps the rules identical between the inline card and the detail
 * modal so users can never bypass the mirror by clicking through.
 */
function FeedMedia({
  postUserId,
  isOwn,
  authorName,
  authorUsername,
  mediaUrl,
  mediaType,
  lens,
}: {
  postUserId: string;
  isOwn: boolean;
  authorName: string;
  authorUsername: string;
  mediaUrl: string;
  mediaType: string;
  lens: FeedPost["lens"];
}) {
  const { info: closeness } = useCloseness(isOwn ? null : postUserId, lens);

  if (!mediaUrl) {
    return (
      <div className="flex size-full items-center justify-center text-[#626775]">
        <Icon name="fileVideo" size={48} />
      </div>
    );
  }

  // Own post or public lens → mirror off, render raw media.
  if (isOwn || !closeness || !closeness.mirrorEnabled) {
    if (mediaType === "video") {
      return (
        <video
          src={mediaUrl}
          controls
          className="size-full object-contain"
        />
      );
    }
    return (
      <Image
        src={mediaUrl}
        alt="Post"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 540px"
        className="object-contain"
      />
    );
  }

  const points = closeness.points;
  const blurPx = closeness.imageBlur;
  const videoUnlocked = closeness.videoUnlocked;
  const requiredImageFull = closeness.requiredImageFull;
  const requiredVideoUnlock = closeness.requiredVideoUnlock;

  if (mediaType === "video" && !videoUnlocked) {
    return (
      <div className="relative flex size-full items-center justify-center bg-black">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{
            backgroundImage: `url(${mediaUrl})`,
            filter: "blur(10px)",
          }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative z-10 flex flex-col items-center gap-2 p-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/10">
            <Icon name="playCircle" size={22} className="text-white" />
          </div>
          <p className="text-[12px] font-bold text-white">
            Video khóa · Gương vô hình
          </p>
          <p className="max-w-[260px] text-[10px] text-white/80">
            Cần {requiredVideoUnlock} điểm với @{authorUsername} để mở.
          </p>
          <div className="flex w-44 flex-col gap-1">
            <div className="relative h-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-amber-300"
                style={{
                  width: `${Math.min(
                    (points / requiredImageFull) * 100,
                    100,
                  )}%`,
                }}
              />
            </div>
            <span className="text-[9px] text-white/70">
              {points}/{requiredVideoUnlock} điểm
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (mediaType === "video") {
    return (
      <video
        src={mediaUrl}
        controls
        className="size-full object-contain"
      />
    );
  }

  return (
    <div className="relative size-full">
      <Image
        src={mediaUrl}
        alt="Post"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 540px"
        className="object-contain transition-[filter] duration-500"
        style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined }}
      />
      {blurPx > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35">
          <span className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-[11px] font-bold text-white">
            <Icon name="eyePreview" size={11} />
            Gương vô hình · {blurPx}px
          </span>
          <div className="flex w-44 flex-col gap-1">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-400 to-violet-400"
                style={{
                  width: `${Math.min(
                    (points / requiredImageFull) * 100,
                    100,
                  )}%`,
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
            <span className="text-center text-[10px] text-white/80">
              {points}/{requiredImageFull} điểm
            </span>
          </div>
        </div>
      )}
    </div>
  );
}