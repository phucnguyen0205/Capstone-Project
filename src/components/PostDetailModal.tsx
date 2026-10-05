"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { AssetKey } from "@/lib/assets";
import { ShareModal } from "@/components/ShareModal";
import { MoreOptionsModal } from "@/components/MoreOptionsModal";
import { useCloseness } from "@/lib/closeness";

interface PostDetail {
  id: string;
  userId: string;
  username: string;
  authorName: string | null;
  authorAvatar: string | null;
  caption: string;
  mediaUrl: string;
  mediaType: string;
  publicId: string | null;
  lens: "public" | "friends" | "close";
  createdAt: number;
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
  shareCount: number;
  sharedByMe: boolean;
  hiddenFromUsers: { id: string; username: string; name: string | null; avatar: string | null }[];
  isOwn: boolean;
}

interface CommentItem {
  id: string;
  postId: string;
  parentId: string | null;
  userId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  edited: boolean;
  deleted: boolean;
  author: {
    id: string;
    username: string | null;
    name: string | null;
    avatar: string | null;
  };
  reactions: Record<string, number>;
  myReactions: string[];
  mentionUsernames: string[];
  replyCount: number;
  reported?: boolean;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;
type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/**
 * Render comment content with @mention tokens wrapped in a styled span.
 * The server persists only the resolved handles; we wrap each `@handle`
 * occurrence (case-insensitive) so the chat surface looks like an @mention
 * even though the underlying text is unchanged.
 */
function renderContentWithMentions(content: string, handles: string[]) {
  if (!handles.length) return content;
  const escaped = handles.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(${escaped.join("|")})`, "gi");
  const parts: Array<string | { handle: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    parts.push({ handle: m[1] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <span
        key={i}
        className="font-bold text-[#00e5ff] hover:underline"
      >@{p.handle}</span>
    ),
  );
}

const REPORT_REASONS = [
  { value: "spam", label: "Spam", icon: "flag" as const },
  { value: "harassment", label: "Quấy rối / Bắt nạt", icon: "shieldAlert" as const },
  { value: "misinformation", label: "Thông tin sai lệch", icon: "shieldAlert" as const },
  { value: "nudity", label: "Nội dung khiêu dâm", icon: "shieldAlert" as const },
  { value: "violence", label: "Bạo lực / Thù hận", icon: "shieldAlert" as const },
  { value: "other", label: "Vi phạm khác", icon: "shieldAlert" as const },
] as const;
type ReportReason = typeof REPORT_REASONS[number]["value"];

const LENS_INFO: Record<PostDetail["lens"], { label: string; icon: AssetKey }> = {
  public: { label: "Công khai", icon: "globe" },
  friends: { label: "Bè bạn", icon: "users2" },
  close: { label: "Thân thiết", icon: "lockSmall" },
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

/**
 * Post detail modal — shows the post + comments inline. The Share and
 * More-options actions are NOT tabs inside this modal; they open their
 * own dedicated modals:
 *   - Share button (action row) → ShareModal
 *   - 3-dot button (header)     → MoreOptionsModal (which itself opens
 *                                  ShareModal for the share item, plus
 *                                  hide-from-feed, hide-from-users,
 *                                  edit, delete)
 */
export function PostDetailModal({
  postId,
  onClose,
  onChanged,
  initialEdit = false,
}: {
  postId: string;
  onClose: () => void;
  onChanged?: () => void;
  /**
   * Open the modal directly in edit mode (caption + lens form) instead of
   * the read-only view. Used when the user picks "Sửa bài viết" from a
   * post's MoreOptionsModal outside of the detail view.
   */
  initialEdit?: boolean;
}) {
  const router = useRouter();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editing, setEditing] = useState(initialEdit);
  const [editCaption, setEditCaption] = useState("");
  const [editLens, setEditLens] = useState<PostDetail["lens"]>("public");
  const [editError, setEditError] = useState<string | null>(null);

  // Dedicated modals
  const [showShare, setShowShare] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Comment report flow
  const [reportTarget, setReportTarget] = useState<{ commentId: string; authorUsername: string } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDescription, setReportDescription] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // Edit/reply/share/reaction state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [commentShareCounts, setCommentShareCounts] = useState<Record<string, number>>({});
  // Map parentId -> list of replies (1-level threading).
  const [repliesByParent, setRepliesByParent] = useState<Record<string, CommentItem[]>>({});
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{ id: string; username: string; name: string | null; avatar: string | null }>>([]);
  const [mentionOpenFor, setMentionOpenFor] = useState<"root" | string | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");

  // Copy link
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track current user id for delete-comment permissions
  const [myId, setMyId] = useState<string | null>(null);

  // Bumped after a like/comment so MirrorMedia re-fetches closeness.
  const [closenessRefreshTick, setClosenessRefreshTick] = useState(0);

  const loadPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<PostDetail>(res);
      if (res.ok && data) {
        setPost(data);
        setEditCaption(data.caption ?? "");
        setEditLens(data.lens);
      }
    } catch {
      // ignore — the modal will keep its loading state until the parent
      // re-opens it
    }
  }, [postId]);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<CommentItem[]>(res);
      setComments(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
    loadComments();
    fetch(`/api/users/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((u) => setMyId(u?.id ?? null))
      .catch(() => {});
  }, [loadPost, loadComments]);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const content = text.trim();
    if (!content || submitting) return;
    setCommentError(null);
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
        await Promise.all([loadComments(), loadPost()]);
        // Re-fetch closeness so the mirror blur / unlock state stays in
        // sync with the new comment (comments count toward the streak
        // and the activity ratio).
        setClosenessRefreshTick((v) => v + 1);
      } else {
        const err = await safeJson<{ error: string }>(res);
        setCommentError(err?.error ?? "Gửi bình luận thất bại");
      }
    } catch (err: any) {
      setCommentError(err?.message ?? "Gửi bình luận thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!replyingTo) return;
    const content = replyText.trim();
    if (!content || submitting) return;
    setCommentError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentId: replyingTo.id }),
      });
      if (res.ok) {
        setReplyText("");
        setReplyingTo(null);
        // Reload top-level + reply map + post so the new reply shows up
        // immediately and the count ticks.
        await Promise.all([
          loadComments(),
          loadPost(),
          loadReplies(replyingTo.id),
        ]);
        setClosenessRefreshTick((v) => v + 1);
      } else {
        const err = await safeJson<{ error: string }>(res);
        setCommentError(err?.error ?? "Gửi trả lời thất bại");
      }
    } catch (err: any) {
      setCommentError(err?.message ?? "Gửi trả lời thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCommentEdit(commentId: string) {
    const content = editText.trim();
    if (!content) return;
    try {
      const res = await fetch(`/api/posts/comments/${commentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditText("");
        await loadComments();
      } else {
        const err = await safeJson<{ error: string }>(res);
        setError(err?.error ?? "Sửa bình luận thất bại");
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleReaction(commentId: string, emoji: ReactionEmoji) {
    setReactionPickerFor(null);
    // Optimistic update: flip the viewer's emoji locally, then reconcile
    // with the server response.
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const has = c.myReactions.includes(emoji);
        const nextMine = has
          ? c.myReactions.filter((e) => e !== emoji)
          : [...c.myReactions, emoji];
        const nextReactions = { ...c.reactions };
        if (has) {
          nextReactions[emoji] = Math.max(0, (nextReactions[emoji] ?? 1) - 1);
          if (nextReactions[emoji] === 0) delete nextReactions[emoji];
        } else {
          nextReactions[emoji] = (nextReactions[emoji] ?? 0) + 1;
        }
        return { ...c, myReactions: nextMine, reactions: nextReactions };
      }),
    );
    try {
      const res = await fetch(
        `/api/posts/comments/${commentId}/reaction`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        },
      );
      if (!res.ok) {
        await loadComments();
        return;
      }
      const data = (await res.json()) as {
        reactions: Record<string, number>;
        myReactions: string[];
      };
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, reactions: data.reactions, myReactions: data.myReactions }
            : c,
        ),
      );
    } catch (err) {
      console.error(err);
      await loadComments();
    }
  }

  async function shareComment(commentId: string) {
    setShareBusyId(commentId);
    try {
      const res = await fetch(
        `/api/posts/comments/${commentId}/share`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { shareCount: number };
        setCommentShareCounts((prev) => ({
          ...prev,
          [commentId]: data.shareCount,
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setShareBusyId(null);
    }
  }

  async function loadReplies(parentId: string) {
    try {
      const r = await fetch(
        `/api/posts/comments/${parentId}/replies`,
        { credentials: "include", cache: "no-store" },
      );
      const data = (await safeJson<CommentItem[]>(r)) ?? [];
      setRepliesByParent((prev) => ({ ...prev, [parentId]: data }));
    } catch {
      // ignore
    }
  }

  function toggleReplies(c: CommentItem) {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) {
        next.delete(c.id);
      } else {
        next.add(c.id);
        if (!repliesByParent[c.id]) loadReplies(c.id);
      }
      return next;
    });
  }

  /** Pulls the @query that the user just typed (last `@...` in the input).
   *  Returns "" if there's no active @-token. */
  function currentMentionToken(value: string): string {
    const m = /@([a-zA-Z0-9_.]*)$/.exec(value);
    return m ? m[1] : "";
  }

  // Re-run mention search whenever the active token changes.
  useEffect(() => {
    let cancelled = false;
    const token = currentMentionToken(mentionQuery);
    if (!mentionOpenFor || token === "" && mentionOpenFor) {
      setMentionSuggestions([]);
      return;
    }
    fetch(`/api/users/search?q=${encodeURIComponent(token)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((arr) => {
        if (cancelled) return;
        setMentionSuggestions(Array.isArray(arr) ? arr : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionQuery, mentionOpenFor]);

  async function deleteComment(commentId: string) {
    try {
      const res = await fetch(`/api/posts/comments/${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        await Promise.all([loadComments(), loadPost()]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleLike() {
    if (!post) return;
    setPost({
      ...post,
      liked: !post.liked,
      likes: post.liked ? Math.max(0, post.likes - 1) : post.likes + 1,
    });
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like", postId }),
      });
      if (!res.ok) await loadPost();
      // Re-fetch closeness regardless of like/unlike — both can move the
      // score depending on which way the user toggled.
      setClosenessRefreshTick((v) => v + 1);
    } catch {
      await loadPost();
    }
  }

  async function toggleSave() {
    if (!post) return;
    setPost({ ...post, saved: !post.saved });
    try {
      const res = await fetch(`/api/posts/${postId}/save`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) await loadPost();
    } catch {
      await loadPost();
    }
  }

  async function saveEdit() {
    setEditError(null);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: editCaption, lens: editLens }),
      });
      if (!res.ok) {
        const e = await safeJson<{ error: string }>(res);
        setEditError(e?.error ?? "Lưu thất bại");
        return;
      }
      setEditing(false);
      await loadPost();
      onChanged?.();
    } catch (err: any) {
      setEditError(err?.message ?? "Lưu thất bại");
    }
  }

  async function deletePost() {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        onChanged?.();
        onClose();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function submitReportComment() {
    if (!reportTarget || !reportReason) return;
    setReportBusy(true);
    try {
      const res = await fetch(`/api/posts/comments/${reportTarget.commentId}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason, description: reportDescription }),
      });
      if (res.ok) {
        // Blur focused element before unmounting the form (textarea) to
        // avoid "Failed to execute 'removeChild' on 'Node'" in Chrome.
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setReportSuccess(true);
        setComments((prev) =>
          prev.map((c) =>
            c.id === reportTarget.commentId ? { ...c, reported: true } : c
          )
        );
        setTimeout(() => {
          setReportTarget(null);
          setReportSuccess(false);
          setReportReason(null);
          setReportDescription("");
        }, 1500);
      } else {
        const e = await safeJson<{ error: string }>(res);
        setError(e?.error ?? "Gửi báo cáo thất bại");
      }
    } finally {
      setReportBusy(false);
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/profile/${post?.username}?post=${postId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Sao chép liên kết:", link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!post) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="rounded-2xl bg-[#171920] p-8 text-[#a0a5b5]">Đang tải...</div>
      </div>
    );
  }

  const lensInfo = LENS_INFO[post.lens];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#171920] shadow-2xl md:flex-row"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button — top right */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>

          {/* 3-dot more options — next to close button */}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="absolute right-14 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Tùy chọn khác"
            title="Tùy chọn khác"
          >
            <Icon name="moreHorizontal" size={18} />
          </button>

          {/* Left: media (Gương vô hình — blur ảnh / khóa video theo điểm thân thiết) */}
          <div className="flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden bg-black md:w-[58%] md:max-h-[92vh]">
            <MirrorMedia
              postUserId={post.userId}
              isOwn={post.isOwn}
              authorName={post.authorName}
              authorUsername={post.username}
              mediaUrl={post.mediaUrl}
              mediaType={post.mediaType}
              lens={post.lens}
              refreshSignal={closenessRefreshTick}
            />
          </div>

          {/* Right: header + caption + comments */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[#232338] px-4 py-3 pr-32">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/profile/${post.username}`);
                }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#c6c6c6] transition-opacity hover:opacity-80"
                title={`Xem trang cá nhân của @${post.username}`}
                aria-label={`Xem trang cá nhân của @${post.username}`}
              >
                {post.authorAvatar ? (
                  <img
                    src={post.authorAvatar}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[12px] font-bold text-white">
                    {(post.authorName ?? post.username)[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/profile/${post.username}`);
                }}
                className="min-w-0 flex-1 cursor-pointer text-left hover:underline"
                title={`Xem trang cá nhân của @${post.username}`}
              >
                <p className="truncate text-[13px] font-bold text-white">
                  @{post.username}
                </p>
                <p className="text-[10px] text-[#626775]">
                  {new Date(post.createdAt * 1000).toLocaleString("vi-VN")}
                </p>
              </button>
              <span className="flex items-center gap-1 rounded-full border border-[#232338] px-2 py-0.5 text-[10px] text-[#a0a5b5]">
                <Icon name={lensInfo.icon} size={10} />
                {lensInfo.label}
              </span>
            </div>

            {/* Caption */}
            <div className="border-b border-[#232338] px-4 py-3">
              {editing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-[#232338] bg-[#0f1118] p-2 text-[13px] text-white outline-none focus:border-[#00e5ff]/50"
                    placeholder="Viết caption..."
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#626775]">Lens:</span>
                    {(Object.keys(LENS_INFO) as PostDetail["lens"][]).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setEditLens(l)}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                          editLens === l
                            ? "border-[#00e5ff] bg-[#00e5ff]/10 text-[#00e5ff]"
                            : "border-[#232338] text-[#a0a5b5]"
                        }`}
                      >
                        <Icon name={LENS_INFO[l].icon} size={10} />
                        {LENS_INFO[l].label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="flex-1 rounded-full bg-[#00e5ff] py-1.5 text-[12px] font-bold text-[#09090f]"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="flex-1 rounded-full border border-[#232338] py-1.5 text-[12px] text-[#a0a5b5]"
                    >
                      Huỷ
                    </button>
                  </div>
                  {editError && (
                    <p className="text-[11px] text-red-400">{editError}</p>
                  )}
                </div>
              ) : (
                <p className="min-w-0 flex-1 text-[13px] text-white">
                  {post.caption || (
                    <span className="italic text-[#626775]">Chưa có caption.</span>
                  )}
                </p>
              )}
            </div>

            {/* Comments list */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {comments.length === 0 ? (
                <p className="text-center text-[12px] text-[#626775]">
                  Chưa có bình luận.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {comments
                    .filter((c) => !c.parentId)
                    .map((c) => {
                      const name =
                        c.author.name ?? c.author.username ?? "Ai đó";
                      const canEdit =
                        myId === c.userId && !c.deleted;
                      const canDelete =
                        (myId === c.userId || post.isOwn) && !c.deleted;
                      const isEditing = editingId === c.id;
                      const showReplies = expandedReplies.has(c.id);
                      const replies = repliesByParent[c.id] ?? [];
                      return (
                        <div key={c.id} className="flex flex-col gap-1">
                          <div className="flex items-start gap-2">
                            <div className="size-8 shrink-0 overflow-hidden rounded-full bg-[#c6c6c6]">
                              {c.author.avatar ? (
                                <img
                                  src={c.author.avatar}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              ) : (
                                <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[10px] font-bold text-white">
                                  {name[0]?.toUpperCase() ?? "?"}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-bold text-white">
                                <span className="mr-1">{name}</span>
                                <span className="text-[10px] font-normal text-[#626775]">
                                  @{c.author.username} ·{" "}
                                  {new Date(c.createdAt * 1000).toLocaleString("vi-VN")}
                                  {c.edited && " · đã chỉnh sửa"}
                                </span>
                              </p>
                              {c.deleted ? (
                                <p className="mt-0.5 text-[13px] italic text-[#626775]">
                                  [Bình luận đã xoá]
                                </p>
                              ) : isEditing ? (
                                <div className="mt-1 flex flex-col gap-1">
                                  <textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    rows={2}
                                    className="w-full rounded-md border border-[#232338] bg-[#171920] px-2 py-1 text-[13px] text-white outline-none focus:border-[#00e5ff]/50"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
 
                                    >
                                      Lưu
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingId(null);
                                        setEditText("");
                                      }}
                                      className="rounded-md border border-[#232338] px-2 py-0.5 text-[11px] text-[#a0a5b5]"
                                    >
                                      Huỷ
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-0.5 text-[13px] text-[#cfd2dd]">
                                  {renderContentWithMentions(
                                    c.content,
                                    c.mentionUsernames,
                                  )}
                                </p>
                              )}

                              {/* Reaction bar */}
                              {!c.deleted && (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {Object.entries(c.reactions)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([emoji, count]) => {
                                      const mine = c.myReactions.includes(
                                        emoji as ReactionEmoji,
                                      );
                                      return (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() =>
                                            toggleReaction(
                                              c.id,
                                              emoji as ReactionEmoji,
                                            )
                                          }
                                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                                            mine
                                              ? "border-[#00e5ff]/50 bg-[#00e5ff]/15 text-[#00e5ff]"
                                              : "border-[#232338] bg-[#171920] text-[#cfd2dd] hover:border-[#00e5ff]/30"
                                          }`}
                                        >
                                          <span>{emoji}</span>
                                          <span>{count}</span>
                                        </button>
                                      );
                                    })}
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReactionPickerFor(
                                          reactionPickerFor === c.id
                                            ? null
                                            : c.id,
                                        )
                                      }
                                      className="flex size-6 items-center justify-center rounded-full border border-[#232338] bg-[#171920] text-[#626775] hover:border-[#00e5ff]/30 hover:text-[#00e5ff]"
                                      title="Thả cảm xúc"
                                    >
                                      <Icon name="smile" size={12} />
                                    </button>
                                    {reactionPickerFor === c.id && (
                                      <div className="absolute left-0 top-full z-10 mt-1 flex gap-1 rounded-full border border-[#232338] bg-[#171920] px-2 py-1 shadow-xl">
                                        {REACTION_EMOJIS.map((emoji) => (
                                          <button
                                            key={emoji}
                                            type="button"
                                            onClick={() =>
                                              toggleReaction(c.id, emoji)
                                            }
                                            className="text-base hover:scale-125"
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Action row: reply, share, share-count, edit, delete, report */}
                              {!c.deleted && (
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-[#626775]">
                                  {myId && myId !== c.userId && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReplyingTo(c);
                                        setReplyText("");
                                      }}
                                      className="hover:text-[#00e5ff]"
                                    >
                                      Trả lời
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => shareComment(c.id)}
                                    disabled={shareBusyId === c.id}
                                    className="hover:text-[#00e5ff] disabled:opacity-50"
                                  >
                                    Chia sẻ
                                  </button>
                                  {(commentShareCounts[c.id] ?? 0) > 0 && (
                                    <span className="text-[#a0a5b5]">
                                      · {commentShareCounts[c.id]} lượt chia sẻ
                                    </span>
                                  )}
                                  {c.replyCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleReplies(c)}
                                      className="hover:text-[#00e5ff]"
                                    >
                                      {showReplies
                                        ? "Ẩn phản hồi"
                                        : `Xem ${c.replyCount} phản hồi`}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            {canEdit && !isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditText(c.content);
                                }}
                                className="text-[#626775] hover:text-[#00e5ff]"
                                title="Sửa bình luận"
                              >
                                <Icon name="edit" size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => deleteComment(c.id)}
                                className="text-[#626775] hover:text-red-400"
                                title="Xoá bình luận"
                              >
                                <Icon name="circleX" size={14} />
                              </button>
                            )}
                            {!post.isOwn && c.userId !== myId && !c.deleted && !c.reported && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReportTarget({
                                    commentId: c.id,
                                    authorUsername: c.author.username ?? "",
                                  })
                                }
                                className="text-[#626775] hover:text-red-400"
                                title="Báo cáo bình luận"
                              >
                                <Icon name="shieldAlert" size={14} />
                              </button>
                            )}
                            {c.reported && (
                              <span className="text-[10px] text-[#626775]" title="Đã báo cáo">
                                Đã báo cáo
                              </span>
                            )}
                          </div>

                          {/* Replies */}
                          {showReplies && (
                            <div className="ml-10 flex flex-col gap-2 border-l border-[#232338] pl-3">
                              {replies.map((r) => {
                                const rn = r.author.name ?? r.author.username ?? "Ai đó";
                                return (
                                  <div
                                    key={r.id}
                                    className="flex items-start gap-2"
                                  >
                                    <div className="size-7 shrink-0 overflow-hidden rounded-full bg-[#c6c6c6]">
                                      {r.author.avatar ? (
                                        <img
                                          src={r.author.avatar}
                                          alt=""
                                          className="size-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[10px] font-bold text-white">
                                          {rn[0]?.toUpperCase() ?? "?"}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[12px] font-bold text-white">
                                        <span className="mr-1">{rn}</span>
                                        <span className="text-[10px] font-normal text-[#626775]">
                                          @{r.author.username} ·{" "}
                                          {new Date(
                                            r.createdAt * 1000,
                                          ).toLocaleString("vi-VN")}
                                          {r.edited && " · đã chỉnh sửa"}
                                        </span>
                                      </p>
                                      {r.deleted ? (
                                        <p className="mt-0.5 text-[12px] italic text-[#626775]">
                                          [Bình luận đã xoá]
                                        </p>
                                      ) : (
                                        <p className="mt-0.5 text-[13px] text-[#cfd2dd]">
                                          {renderContentWithMentions(
                                            r.content,
                                            r.mentionUsernames,
                                          )}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Reply form */}
                          {replyingTo?.id === c.id && (
                            <form
                              onSubmit={submitReply}
                              className="ml-10 mt-1 flex flex-col gap-1 rounded-md border border-[#232338] bg-[#0f1118] p-2"
                            >
                              <p className="text-[10px] text-[#626775]">
                                Trả lời {replyingTo.author.username ?? ""}
                              </p>
                              <textarea
                                value={replyText}
                                onChange={(e) => {
                                  setReplyText(e.target.value);
                                  setMentionQuery(e.target.value);
                                  setMentionOpenFor(c.id);
                                }}
                                rows={2}
                                placeholder="Viết phản hồi... (gõ @ để nhắc tên)"
                                className="w-full border border-[#232338] bg-[#171920] px-2 py-1 text-[12px] text-white outline-none focus:border-[#00e5ff]/50"
                              />
                              {mentionOpenFor === c.id && mentionSuggestions.length > 0 && (
                                <div className="flex flex-col gap-1 rounded-md border border-[#232338] bg-[#171920] p-1">
                                  {mentionSuggestions.slice(0, 5).map((u) => (
                                    <button
                                      key={u.id}
                                      type="button"
                                      onClick={() => {
                                        const insert = `@${u.username} `;
                                        const token = currentMentionToken(replyText);
                                        const next = replyText.replace(
                                          new RegExp(`@${token}$`),
                                          insert,
                                        );
                                        setReplyText(next);
                                        setMentionSuggestions([]);
                                        setMentionOpenFor(null);
                                      }}
                                      className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-[12px] text-white"
                                    >
                                      <span className="font-bold">@{u.username}</span>
                                      <span className="text-[#626775]">
                                        {u.name ?? ""}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyingTo(null);
                                    setReplyText("");
                                  }}
                                  className="rounded-md border border-[#232338] px-2 py-0.5 text-[11px] text-[#a0a5b5]"
                                >
                                  Huỷ
                                </button>
                                <button
                                  type="submit"
                                  disabled={!replyText.trim() || submitting}
                                  className="rounded-md bg-[#00e5ff] px-2 py-0.5 text-[11px] font-bold text-[#09090f] disabled:opacity-50"
                                >
                                  {submitting ? "..." : "Gửi"}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Action row */}
            <div className="flex shrink-0 items-center justify-around border-t border-[#232338] px-2 py-2 text-[11px] text-[#a0a5b5]">
              <button
                type="button"
                onClick={toggleLike}
                className={`flex items-center gap-1 rounded-full px-2 py-1 ${post.liked ? "text-red-400" : "hover:text-white"}`}
                title="Like"
              >
                <Icon name={post.liked ? "heartFilled" : "heart"} size={14} />
                {post.likes}
              </button>
              <span
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[#00e5ff]"
                title="Số bình luận"
              >
                <Icon name="messageCircleAlt" size={14} />
                {post.comments}
              </span>
              <button
                type="button"
                onClick={() => setShowShare(true)}
                className="flex items-center gap-1 rounded-full px-2 py-1 hover:text-white"
                title="Chia sẻ"
              >
                <Icon name="share2" size={14} />
                {post.shareCount}
              </button>
              <button
                type="button"
                onClick={toggleSave}
                className={`flex items-center gap-1 rounded-full px-2 py-1 ${post.saved ? "text-yellow-400" : "hover:text-white"}`}
                title="Lưu"
              >
                <Icon name="bookmark" size={14} />
                {post.saved ? "Đã lưu" : "Lưu"}
              </button>
              <button
                type="button"
                onClick={copyLink}
                className={`flex items-center gap-1 rounded-full px-2 py-1 ${copied ? "text-[#00e5ff]" : "hover:text-white"}`}
                title="Sao chép liên kết"
              >
                <Icon name="link" size={14} />
                {copied ? "Đã copy!" : "Copy"}
              </button>
            </div>

            {/* Comment form */}
            <form
              onSubmit={submitComment}
              className="flex shrink-0 flex-col gap-1 border-t border-[#232338] bg-[#0f1118] px-4 py-3"
            >
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (commentError) setCommentError(null);
                    setMentionQuery(e.target.value);
                    setMentionOpenFor("root");
                  }}
                  placeholder="Viết bình luận... (gõ @ để nhắc tên)"
                  disabled={submitting}
                  autoComplete="off"
                  className="flex-1 rounded-full border border-[#232338] bg-[#171920] px-3 py-1.5 text-[13px] text-white outline-none placeholder:text-[#626775] focus:border-[#00e5ff]/50"
                />
                {mentionOpenFor === "root" && mentionSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 max-h-32 overflow-y-auto rounded-md border border-[#232338] bg-[#171920] p-1 shadow-xl">
                    {mentionSuggestions.slice(0, 5).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          const token = currentMentionToken(text);
                          const insert = `@${u.username} `;
                          const next = text.replace(
                            new RegExp(`@${token}$`),
                            insert,
                          );
                          setText(next);
                          setMentionSuggestions([]);
                          setMentionOpenFor(null);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-white hover:bg-[#232338]"
                      >
                        <span className="font-bold">@{u.username}</span>
                        <span className="text-[#626775]">{u.name ?? ""}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!text.trim() || submitting}
                  className="rounded-full bg-[#00e5ff] px-4 py-1.5 text-[12px] font-bold text-[#09090f] disabled:opacity-50"
                >
                  {submitting ? "..." : "Gửi"}
                </button>
              </div>
              {commentError && (
                <p className="text-[11px] text-red-400">{commentError}</p>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Comment report modal */}
      {reportTarget && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setReportTarget(null); setReportReason(null); setReportDescription(""); }}
        >
          <div
            className="relative flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#171920] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
              <p className="text-[14px] font-bold text-white">Báo cáo bình luận</p>
              <button
                type="button"
                onClick={() => { setReportTarget(null); setReportReason(null); setReportDescription(""); }}
                className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] hover:bg-white/5 hover:text-white"
              >
                <Icon name="circleX" size={16} />
              </button>
            </div>

            {reportSuccess ? (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Icon name="check" size={24} />
                </div>
                <p className="text-[14px] font-bold text-white">Đã gửi báo cáo!</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <p className="mb-3 text-[12px] text-[#a0a5b5]">
                    Báo cáo bình luận của{" "}
                    <span className="font-bold text-white">@{reportTarget.authorUsername}</span>:
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {REPORT_REASONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setReportReason(r.value as ReportReason)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[12px] transition-colors ${
                          reportReason === r.value
                            ? "border-red-500 bg-red-500/10 text-white"
                            : "border-[#232338] text-[#a0a5b5] hover:bg-white/5"
                        }`}
                      >
                        <div className={`flex size-4 items-center justify-center rounded border ${
                          reportReason === r.value ? "border-red-500 bg-red-500 text-white" : "border-[#232338]"
                        }`}>
                          {reportReason === r.value && <Icon name="check" size={10} />}
                        </div>
                        <Icon name={r.icon} size={12} className={reportReason === r.value ? "text-red-300" : "text-[#626775]"} />
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {reportReason && (
                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] text-[#626775]">Mô tả thêm (tuỳ chọn)</label>
                      <textarea
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value.slice(0, 500))}
                        rows={2}
                        placeholder="Mô tả thêm..."
                        className="w-full resize-none rounded-lg border border-[#232338] bg-[#0f1118] p-2 text-[12px] text-white outline-none placeholder:text-[#626775] focus:border-red-500/50"
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2 border-t border-[#232338] bg-[#0f1118] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => { setReportTarget(null); setReportReason(null); setReportDescription(""); }}
                    className="flex-1 rounded-full border border-[#232338] py-2 text-[12px] text-[#a0a5b5]"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={submitReportComment}
                    disabled={!reportReason || reportBusy}
                    className="flex-1 rounded-full bg-red-500 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    {reportBusy ? "..." : "Gửi báo cáo"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dedicated Share modal */}
      {showShare && (
        <ShareModal
          postId={postId}
          postUsername={post.username}
          onClose={() => setShowShare(false)}
          onShared={async () => {
            await loadPost();
            onChanged?.();
          }}
        />
      )}

      {/* Dedicated More-options modal */}
      {showMore && (
        <MoreOptionsModal
          postId={postId}
          postUsername={post.username}
          postAuthorName={post.authorName}
          onClose={() => setShowMore(false)}
          onShare={() => setShowShare(true)}
          onEdit={() => setEditing(true)}
          onDelete={deletePost}
          onChanged={async () => {
            await loadPost();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}

/**
 * Renders the post's image / video with the "Gương vô hình" rules:
 *   - own posts                       → always unblurred / unlocked
 *   - public posts                    → no mirror, always clear
 *   - other people's `friends` posts → blurred by `closeness.imageBlur`
 *                                       (24px → 0px as points grow)
 *   - `close` posts                   → same shape but with a higher
 *                                       point threshold (see LENS_MIRROR_CONFIG)
 *   - other people's videos           → fully locked until
 *                                       `points >= lens.videoUnlockPoints`
 * The closeness API is keyed off the post author's userId so the same
 * post looks identical between the detail modal and the inline feed card.
 */
function MirrorMedia({
  postUserId,
  isOwn,
  authorName,
  authorUsername,
  mediaUrl,
  mediaType,
  lens,
  refreshSignal,
}: {
  postUserId: string;
  isOwn: boolean;
  authorName: string | null;
  authorUsername: string;
  mediaUrl: string;
  mediaType: string;
  lens: PostDetail["lens"];
  refreshSignal: number;
}) {
  const { info: closeness, refresh } = useCloseness(
    isOwn ? null : postUserId,
    lens,
  );
  // Re-pull the closeness record whenever the parent signals that the
  // user just liked / commented. The API also bumps persistence server-
  // side, so this stays in sync without a manual cache layer.
  useEffect(() => {
    if (refreshSignal > 0) refresh();
  }, [refreshSignal, refresh]);

  if (!mediaUrl) {
    return <div className="text-[#626775]">Không có media</div>;
  }

  // Public lens (or own post) → no mirror, render raw media.
  if (isOwn || !closeness || !closeness.mirrorEnabled) {
    if (mediaType === "video") {
      return (
        <video
          src={mediaUrl}
          controls
          className="max-h-full max-w-full object-contain"
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mediaUrl}
        alt=""
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  const points = closeness.points;
  const blurPx = closeness.imageBlur;
  const videoUnlocked = closeness.videoUnlocked;
  const requiredImageFull = closeness.requiredImageFull;
  const requiredVideoUnlock = closeness.requiredVideoUnlock;

  // Video lock — only when the post isn't yours and the viewer hasn't
  // earned enough closeness points yet.
  if (mediaType === "video" && !videoUnlocked) {
    return (
      <div className="relative flex size-full flex-col items-center justify-center gap-3 bg-black p-6 text-center">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${mediaUrl})`, filter: "blur(12px)" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative z-10 flex size-14 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/10">
          <Icon name="triangleRight" size={26} className="text-white" />
        </div>
        <p className="relative z-10 text-[15px] font-bold text-white">
          Video đang bị khóa bởi Gương vô hình
        </p>
        <p className="relative z-10 max-w-xs text-[12px] text-white/80">
          Cần đạt {requiredVideoUnlock} điểm thân thiết với{" "}
          <span className="font-semibold text-teal-300">
            {authorName ?? authorUsername}
          </span>{" "}
          để mở khóa video này.
        </p>
        <div className="relative z-10 flex w-56 flex-col gap-1">
          <div className="relative h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-amber-300 transition-all"
              style={{
                width: `${Math.min(
                  (points / requiredImageFull) * 100,
                  100,
                )}%`,
              }}
            />
            <span
              className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border border-white/70 bg-teal-300"
              style={{
                left: `calc(${(requiredVideoUnlock / requiredImageFull) * 100}% - 5px)`,
              }}
              title={`Mở khóa video tại ${requiredVideoUnlock}đ`}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/70">
            <span>
              {points}/{requiredVideoUnlock} điểm cần để mở
            </span>
            <span>
              Chuỗi hiện tại ·{" "}
              <span className="font-semibold text-teal-300">
                {closeness?.streakDays ?? 0}
              </span>{" "}
              ngày
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Video — fully unlocked (own post or viewer earned enough points).
  if (mediaType === "video") {
    return (
      <video
        src={mediaUrl}
        controls
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  // Image — apply filter driven by the closeness score.
  return (
    <div className="relative size-full">
      <img
        src={mediaUrl}
        alt=""
        className="size-full object-contain transition-[filter] duration-500"
        style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined }}
      />
      {blurPx > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 backdrop-blur-[2px]">
          <span className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white">
            <Icon name="eyePreview" size={12} />
            Gương vô hình · {blurPx}px
          </span>
          <div className="flex w-52 flex-col gap-1">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-400 to-violet-400 transition-all"
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
            <div className="flex items-center justify-between text-[10px] text-white/85">
              <span>
                {points}/{requiredImageFull} điểm
              </span>
              <span>
                Streak ·{" "}
                <span className="font-semibold text-teal-300">
                  {closeness?.streakDays ?? 0}
                </span>
              </span>
            </div>
          </div>
          <p className="text-[10px] text-white/75">
            Like / bình luận để rõ dần
          </p>
        </div>
      )}
    </div>
  );
}