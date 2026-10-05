"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { PostModal } from "@/components/cloudinary/PostModal";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

interface FeedPost {
  id: string;
  userId: string;
  author: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
    isOnline: boolean;
  };
  caption: string;
  mediaUrl: string;
  mediaType: string;
  lens: "public" | "friends" | "close" | "private";
  createdAt: number;
  likes: number;
  comments: number;
  liked: boolean;
}

type TierKey = "all" | "public" | "friends" | "close" | "private";

const TIER_FILTERS: { key: TierKey; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "public", label: "Cấp 1" },
  { key: "friends", label: "Cấp 2" },
  { key: "close", label: "Cấp 3" },
  { key: "private", label: "Cấp 4" },
];

const LENS_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: "public", label: "Công khai", icon: "eye" },
  { key: "friends", label: "Bè bạn", icon: "users2" },
  { key: "close", label: "Bạn thân", icon: "lockSmall" },
];

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
  const delta = Math.floor(Date.now() / 1000 - unix);
  if (delta < 60) return "Vừa xong";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút trước`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ trước`;
  return `${Math.floor(delta / 86400)} ngày trước`;
}

interface DiaryCenterPanelProps {
  activeTier: TierKey;
  onSelectTier: (tier: TierKey) => void;
  refreshSignal?: number;
  onPublished?: () => void;
}

export function DiaryCenterPanel({
  activeTier,
  onSelectTier,
  refreshSignal = 0,
  onPublished,
}: DiaryCenterPanelProps) {
  const [showPostModal, setShowPostModal] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comments drawer state
  const [commentPostId, setCommentPostId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lens = activeTier === "all" ? "all" : activeTier;
      const res = await fetch(`/api/groups/feed?lens=${lens}&limit=30`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<FeedPost[]>(res);
      if (!res.ok) throw new Error("Không tải được nhật ký");
      setPosts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Lỗi");
    } finally {
      setLoading(false);
    }
  }, [activeTier]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts, refreshSignal]);

  // For tier filter "Cấp 4" (private) — show only posts with lens === 'private'
  const visiblePosts =
    activeTier === "private"
      ? posts.filter((p) => p.lens === "private")
      : posts;

  async function toggleLike(post: FeedPost) {
    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) }
          : p,
      ),
    );
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like", postId: post.id }),
      });
      const data = await safeJson<{ liked: boolean }>(res);
      if (!res.ok) {
        // rollback
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, liked: post.liked, likes: post.likes }
              : p,
          ),
        );
        return;
      }
      if (data) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, liked: data.liked, likes: p.likes + (data.liked ? 1 : -1) }
              : p,
          ),
        );
      }
    } catch {
      // rollback on error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked: post.liked, likes: post.likes }
            : p,
        ),
      );
    }
  }

  async function handleShare(post: FeedPost) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/post/${post.id}`,
      );
    } catch {
      /* clipboard not available */
    }
    try {
      await fetch(`/api/posts/${encodeURIComponent(post.id)}/share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "copy" }),
      });
    } catch {
      /* silent */
    }
  }

  return (
    <>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-1">
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Nhật ký Đa ống kính</h2>
            <button
              type="button"
              onClick={() => setShowPostModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#9b51e0] px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-[#a45be8] active:scale-[0.98]"
            >
              <Icon name="plus" size={14} />
              <span>Đăng bài mới</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-[#94a3b8]">Xem theo cấp độ:</span>
            {TIER_FILTERS.map((tier) => {
              const isActive = activeTier === tier.key;
              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => onSelectTier(tier.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "border-cyan-400 bg-cyan-400/15 font-bold text-cyan-400"
                      : "border-[#2c264c] bg-[#161622] font-medium text-[#94a3b8] hover:bg-[#1e1e35]"
                  }`}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="size-8 animate-spin rounded-full border-2 border-[#232338] border-t-[#9b51e0]" />
            </div>
          )}

          {!loading && visiblePosts.length === 0 && !error && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#3a3366] bg-[rgba(19,19,31,0.4)] p-12 text-center">
              <Icon name="lockSmall" size={32} className="text-[#67678d]" />
              <p className="text-sm font-semibold text-[#a5a5c7]">
                Chưa có bài viết nào ở cấp này
              </p>
              <p className="text-[12px] text-[#67678d]">
                Hãy đăng bài đầu tiên của bạn.
              </p>
            </div>
          )}

          {!loading &&
            visiblePosts.map((post) => (
              <DiaryPost
                key={post.id}
                post={post}
                onLike={() => toggleLike(post)}
                onShare={() => handleShare(post)}
                onComment={() => setCommentPostId(post.id)}
              />
            ))}
        </div>
      </section>

      {showPostModal && (
        <PostModal
          onClose={() => setShowPostModal(false)}
          onPost={async ({ mediaUrl, mediaType, caption, lens }) => {
            try {
              const res = await fetch("/api/posts", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mediaUrl, mediaType, caption, lens }),
              });
              if (res.ok) {
                onPublished?.();
                await loadPosts();
              }
            } catch (e) {
              console.error("[Diary post error]", e);
            }
            setShowPostModal(false);
          }}
        />
      )}

      {commentPostId && (
        <CommentsDrawer
          postId={commentPostId}
          onClose={() => setCommentPostId(null)}
        />
      )}
    </>
  );
}

function DiaryPost({
  post,
  onLike,
  onShare,
  onComment,
}: {
  post: FeedPost;
  onLike: () => void;
  onShare: () => void;
  onComment: () => void;
}) {
  const authorName = post.author.name ?? post.author.username;
  const isCloseLocked = post.lens === "close";

  if (isCloseLocked) {
    return (
      <article className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-5 backdrop-blur-[8px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <SafeAvatar
              src={post.author.avatar}
              name={authorName}
              className="size-9"
            />
            <div>
              <p className="text-sm font-semibold text-white">{authorName}</p>
              <p className="text-[11px] text-[#64748b]">
                @{post.author.username} · {timeAgo(post.createdAt)}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-[#9b51e0]">
            <Icon name="lock" size={11} />
            Cấp 3+
          </span>
        </div>
        <div className="flex h-[120px] w-full flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-[#9b51e0] bg-[rgba(24,19,43,0.5)] p-5 backdrop-blur-[6px]">
          <Icon name="lockLarge" size={22} />
          <p className="text-center text-sm font-semibold text-[#e2e8f0]">
            Nội dung Cấp 3 — cần đủ điểm thân thiết để mở
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-5 backdrop-blur-[8px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <SafeAvatar
            src={post.author.avatar}
            name={authorName}
            className="size-9"
          />
          <div>
            <p className="text-sm font-semibold text-white">{authorName}</p>
            <p className="text-[11px] text-[#64748b]">
              @{post.author.username}
              {post.author.isOnline && (
                <span className="ml-1.5 text-emerald-400">· Đang online</span>
              )}
              {" · "}
              {timeAgo(post.createdAt)}
            </p>
          </div>
        </div>

        <span
          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            post.lens === "private"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "border-[#9b51e0] bg-[#1d1e35] text-white"
          }`}
        >
          <Icon
            name={
              post.lens === "private"
                ? "lockSmall"
                : post.lens === "friends"
                  ? "users2"
                  : "eye"
            }
            size={12}
          />
          {
            LENS_OPTIONS.find((l) => l.key === post.lens)?.label ?? "Chỉ mình"
          }
        </span>
      </div>

      {post.mediaUrl && (
        <div className="relative h-[260px] w-full overflow-hidden rounded-xl border border-[#2c264c]">
          {post.mediaType === "video" ? (
            <video
              src={post.mediaUrl}
              className="size-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={post.mediaUrl}
              alt={authorName}
              className="size-full object-cover"
              loading="lazy"
            />
          )}
        </div>
      )}

      <p className="text-sm leading-[20px] text-[#e2e8f0]">{post.caption}</p>

      {post.lens === "friends" && (
        <div className="flex w-full items-center gap-2 rounded-lg border border-[#0e3042] bg-[#101b2b] p-2.5 text-xs text-[#e2e8f0]">
          <Icon name="eye" size={14} />
          <p>
            <span className="font-bold text-cyan-400">Gương vô hình: </span>
            Bài viết chỉ hiển thị cho bạn bè đã follow lẫn nhau.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onLike}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
              post.liked
                ? "bg-pink-500/15 text-pink-400"
                : "text-[#94a3b8] hover:bg-white/5"
            }`}
            aria-pressed={post.liked}
          >
            <Icon name={post.liked ? "heartFilled" : "heart"} size={16} />
            {post.likes}
          </button>
          <button
            type="button"
            onClick={onComment}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#94a3b8] transition-colors hover:bg-white/5"
          >
            <Icon name="messageSquare" size={16} />
            {post.comments}
          </button>
        </div>
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#94a3b8] transition-colors hover:bg-white/5"
          title="Sao chép liên kết"
        >
          <Icon name="share2" size={14} />
          Chia sẻ
        </button>
      </div>
    </article>
  );
}

// ─── Comments drawer ─────────────────────────────────────────────────────────

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: number;
  username?: string;
  author_name?: string | null;
}

function CommentsDrawer({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/interactions?postId=${encodeURIComponent(postId)}`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await safeJson<{ comments: Comment[] }>(res);
      setComments(data?.comments ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function submit() {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", postId, content: text }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data?.error ?? "Không gửi được");
      }
      setDraft("");
      await loadComments();
    } catch (e: any) {
      setError(e?.message ?? "Lỗi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-3xl border-t border-[#3a3366] bg-[#0c0c14] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#232338] px-4 py-3">
          <h3 className="text-sm font-bold text-white">Bình luận</h3>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-[#94a3b8] hover:bg-white/5"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-6 animate-spin rounded-full border-2 border-[#232338] border-t-[#9b51e0]" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Icon name="messageSquare" size={28} className="text-[#626775]" />
              <p className="mt-2 text-xs text-[#94a3b8]">
                Chưa có bình luận nào. Hãy là người đầu tiên.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-[#232338] bg-[#11121a] p-2.5"
                >
                  <p className="text-[12px] font-semibold text-white">
                    {c.author_name ?? c.username ?? "Người dùng"}
                  </p>
                  <p className="text-[10px] text-[#626775]">
                    {new Date(c.created_at * 1000).toLocaleString("vi-VN")}
                  </p>
                  <p className="mt-1 text-[12px] text-[#e2e8f0]">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-[#232338] px-3 py-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Viết bình luận…"
            rows={2}
            disabled={submitting}
            className="flex-1 resize-none rounded-xl border border-[#232338] bg-[#11121a] p-2 text-[12px] text-white placeholder:text-[#626775] focus:border-violet-500/40 focus:outline-none disabled:opacity-60"
            maxLength={1000}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || submitting}
            className="flex items-center gap-1 rounded-xl bg-[#9b51e0] px-3 py-2 text-[12px] font-bold text-white hover:bg-[#a45be8] active:scale-95 disabled:opacity-60"
          >
            <Icon name="cornerDownLeft" size={14} />
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}