"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";

interface UserRef {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
}

interface PostSummary {
  id: string;
  userId: string;
  username: string;
  authorName: string | null;
  isOwn: boolean;
  hiddenFromFeed: boolean;
  hiddenFromUsers: UserRef[];
  saved: boolean;
  liked: boolean;
  // Relationship for non-authors
  iFollowThem: boolean;
  theyFollowMe: boolean;
}

type Relationship = "none" | "following" | "followers" | "mutual";

// Reason options for reporting
const REPORT_REASONS = [
  { value: "spam", label: "Spam", icon: "flag" as const },
  { value: "harassment", label: "Quấy rối / Bắt nạt", icon: "shieldAlert" as const },
  { value: "misinformation", label: "Thông tin sai lệch", icon: "shieldAlert" as const },
  { value: "nudity", label: "Nội dung khiêu dâm", icon: "shieldAlert" as const },
  { value: "violence", label: "Bạo lực / Thù hận", icon: "shieldAlert" as const },
  { value: "other", label: "Vi phạm khác", icon: "shieldAlert" as const },
] as const;
type ReportReason = typeof REPORT_REASONS[number]["value"];

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
 * Standalone "More options" (3-dot) modal — opened from PostDetailModal or
 * any 3-dot button in the feed.
 *
 * For the author of the post:
 *   - Chia sẻ           → opens ShareModal
 *   - Copy liên kết    → copies post link to clipboard
 *   - Sửa bài viết      → parent enters edit mode
 *   - Lưu bài viết     → toggles bookmark
 *   - Ẩn khỏi feed      → POST /api/posts/[id]/hide {scope:'feed'}
 *   - Ẩn với người cụ thể → inline username input + list management
 *   - Xoá bài viết      → parent confirms
 *
 * For other users:
 *   - Chia sẻ           → opens ShareModal
 *   - Copy liên kết    → copies post link to clipboard
 *   - Theo dõi / Bỏ theo dõi → follow/unfollow
 *   - Báo cáo bài viết  → multi-step reason picker → POST /api/posts/[id]/report
 *   - Quan tâm kênh này ít hơn → POST /api/posts/[id]/dismiss
 *   - Ẩn khỏi feed      → POST /api/posts/[id]/hide {scope:'feed'}
 */
export function MoreOptionsModal({
  postId,
  postUsername,
  postAuthorName,
  onClose,
  onShare,
  onEdit,
  onDelete,
  onChanged,
}: {
  postId: string;
  postUsername: string;
  postAuthorName: string | null;
  onClose: () => void;
  onShare: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onChanged?: () => void;
}) {
  const [post, setPost] = useState<PostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hide-from-users sub-form
  const [usernameToHide, setUsernameToHide] = useState("");
  const [hideTried, setHideTried] = useState(false);
  const [hideBusy, setHideBusy] = useState(false);

  // Inline hide-from-feed toggle
  const [hideFromFeedBusy, setHideFromFeedBusy] = useState(false);
  const [hideFromFeedDone, setHideFromFeedDone] = useState(false);

  // Dismiss ("see less from this channel")
  const [dismissBusy, setDismissBusy] = useState(false);
  const [dismissDone, setDismissDone] = useState(false);

  // Report flow
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDescription, setReportDescription] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // Follow/unfollow
  const [followBusy, setFollowBusy] = useState(false);

  // Copy link
  const [copied, setCopied] = useState(false);

  const loadPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        credentials: "include",
      });
      const data = await safeJson<any>(res);
      if (res.ok && data) {
        setPost({
          id: data.id,
          userId: data.userId,
          username: data.username ?? postUsername,
          authorName: data.authorName ?? postAuthorName,
          isOwn: !!data.isOwn,
          hiddenFromFeed: data.hiddenFromFeed ?? false,
          hiddenFromUsers: data.hiddenFromUsers ?? [],
          saved: data.saved ?? false,
          liked: data.liked ?? false,
          iFollowThem: data.iFollowThem ?? false,
          theyFollowMe: data.theyFollowMe ?? false,
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [postId, postUsername, postAuthorName]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  async function toggleHideFromFeed() {
    if (!post) return;
    setHideFromFeedBusy(true);
    try {
      const isHidden = post.hiddenFromFeed;
      const url = `/api/posts/${postId}/hide`;
      const method = isHidden ? "DELETE" : "POST";
      const res = await fetch(
        isHidden ? `${url}?scope=feed` : url,
        {
          method,
          credentials: "include",
          headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
          body: method === "POST" ? JSON.stringify({ scope: "feed" }) : undefined,
        }
      );
      if (res.ok) {
        setHideFromFeedDone(!isHidden);
        setPost((p) => (p ? { ...p, hiddenFromFeed: !isHidden } : p));
        onChanged?.();
      } else {
        const e = await safeJson<{ error: string }>(res);
        setError(e?.error ?? "Thao tác thất bại");
      }
    } finally {
      setHideFromFeedBusy(false);
    }
  }

  async function addHiddenUser(username: string) {
    if (!post?.isOwn || !username) return;
    setHideBusy(true);
    setHideTried(false);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(username)}`, {
        credentials: "include",
      });
      const arr = await safeJson<UserRef[]>(res);
      const user = Array.isArray(arr) ? arr[0] : null;
      if (!user || user.username.toLowerCase() !== username.toLowerCase()) {
        setHideTried(true);
        return;
      }
      const hideRes = await fetch(`/api/posts/${postId}/hide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "users", userIds: [user.id] }),
      });
      if (!hideRes.ok) {
        const e = await safeJson<{ error: string }>(hideRes);
        setError(e?.error ?? "Ẩn thất bại");
        return;
      }
      setUsernameToHide("");
      setHideTried(false);
      await loadPost();
      onChanged?.();
    } finally {
      setHideBusy(false);
    }
  }

  async function removeHiddenUser(userId: string) {
    if (!post?.isOwn) return;
    try {
      const res = await fetch(
        `/api/posts/${postId}/hide?scope=users&userId=${encodeURIComponent(userId)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (res.ok) {
        await loadPost();
        onChanged?.();
      }
    } catch {
      // ignore
    }
  }

  async function toggleDismiss() {
    setDismissBusy(true);
    try {
      const action = dismissDone ? "undo" : "dismiss";
      const res = await fetch(`/api/posts/${postId}/dismiss`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setDismissDone(!dismissDone);
        onChanged?.();
      } else {
        const e = await safeJson<{ error: string }>(res);
        setError(e?.error ?? "Thao tác thất bại");
      }
    } finally {
      setDismissBusy(false);
    }
  }

  async function submitReport() {
    if (!reportReason) return;
    setReportBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason, description: reportDescription }),
      });
      if (res.ok) {
        // Blur any focused element BEFORE swapping the form for the
        // success view — otherwise Chrome tries to move focus to the
        // parent of the removed <textarea> and throws "Failed to execute
        // 'removeChild' on 'Node'".
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setReportSuccess(true);
        setTimeout(() => {
          setShowReport(false);
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

  async function toggleFollow() {
    setFollowBusy(true);
    try {
      if (post?.iFollowThem) {
        // Unfollow
        const res = await fetch(`/api/users/${post.userId}/follow`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) {
          setPost((p) => (p ? { ...p, iFollowThem: false } : p));
          onChanged?.();
        }
      } else {
        // Follow
        const res = await fetch(`/api/users/${post?.userId}/follow`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          setPost((p) => (p ? { ...p, iFollowThem: true } : p));
          onChanged?.();
        }
      }
    } catch {
      // ignore
    } finally {
      setFollowBusy(false);
    }
  }

  async function toggleSave() {
    try {
      const res = await fetch(`/api/posts/${postId}/save`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await safeJson<{ saved: boolean }>(res);
        setPost((p) => (p ? { ...p, saved: data?.saved ?? !p.saved } : p));
        onChanged?.();
      }
    } catch {
      // ignore
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/profile/${post?.username ?? postUsername}?post=${postId}`;
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

  function getRelationshipLabel(): string {
    if (!post) return "";
    const { iFollowThem, theyFollowMe } = post;
    if (iFollowThem && theyFollowMe) return "Bạn bè";
    if (iFollowThem) return "Đang theo dõi";
    if (theyFollowMe) return "Có thể follow lại";
    return "Theo dõi";
  }

  // ─── Report flow overlay ────────────────────────────────────────────────

  if (showReport) {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
        onClick={() => { setShowReport(false); setReportReason(null); setReportDescription(""); }}
      >
        <div
          className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#171920] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
            <p className="text-[15px] font-bold text-white">Báo cáo bài viết</p>
            <button
              type="button"
              onClick={() => { setShowReport(false); setReportReason(null); setReportDescription(""); }}
              className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] hover:bg-white/5 hover:text-white"
              aria-label="Đóng"
            >
              <Icon name="circleX" size={18} />
            </button>
          </div>

          {reportSuccess ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Icon name="check" size={28} />
              </div>
              <p className="text-[15px] font-bold text-white">Đã gửi báo cáo!</p>
              <p className="text-[13px] text-[#626775]">Cảm ơn bạn. Chúng tôi sẽ xem xét bài viết này.</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <p className="mb-4 text-[13px] text-[#a0a5b5]">
                  Chọn lý do báo cáo bài viết của{" "}
                  <span className="font-bold text-white">@{post?.username}</span>.
                </p>
                <div className="flex flex-col gap-2">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReportReason(r.value as ReportReason)}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-[13px] transition-colors ${
                        reportReason === r.value
                          ? "border-red-500 bg-red-500/10 text-white"
                          : "border-[#232338] text-[#a0a5b5] hover:bg-white/5"
                      }`}
                    >
                      <div
                        className={`flex size-5 items-center justify-center rounded border ${
                          reportReason === r.value
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-[#232338] text-[#626775]"
                        }`}
                      >
                        {reportReason === r.value && <Icon name="check" size={12} />}
                      </div>
                      <Icon name={r.icon} size={14} className={reportReason === r.value ? "text-red-300" : "text-[#626775]"} />
                      {r.label}
                    </button>
                  ))}
                </div>

                {reportReason && (
                  <div className="mt-4">
                    <label className="mb-1 block text-[12px] text-[#626775]">
                      Mô tả thêm (tuỳ chọn)
                    </label>
                    <textarea
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value.slice(0, 500))}
                      rows={3}
                      placeholder="Mô tả chi tiết hơn..."
                      className="w-full resize-none rounded-lg border border-[#232338] bg-[#0f1118] p-3 text-[13px] text-white outline-none placeholder:text-[#626775] focus:border-red-500/50"
                    />
                    <p className="mt-1 text-right text-[10px] text-[#626775]">
                      {reportDescription.length}/500
                    </p>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 border-t border-[#232338] bg-[#0f1118] px-4 py-3">
                <button
                  type="button"
                  onClick={() => { setShowReport(false); setReportReason(null); setReportDescription(""); }}
                  className="flex-1 rounded-full border border-[#232338] py-2 text-[13px] text-[#a0a5b5] hover:bg-white/5"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={submitReport}
                  disabled={!reportReason || reportBusy}
                  className="flex-1 rounded-full bg-red-500 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {reportBusy ? "Đang gửi..." : "Gửi báo cáo"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Main modal ─────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#171920] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-white">Tùy chọn bài viết</p>
            <p className="truncate text-[11px] text-[#626775]">
              {post?.authorName ?? postAuthorName ?? "@" + postUsername}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] hover:bg-white/5 hover:text-white"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && !post ? (
            <div className="flex items-center justify-center py-10 text-[12px] text-[#626775]">
              Đang tải...
            </div>
          ) : post ? (
            <div className="flex flex-col">
              {/* Share — always available */}
              <MenuItem
                icon="share2"
                label="Chia sẻ bài viết"
                onClick={() => {
                  onClose();
                  onShare();
                }}
              />

              {/* Copy link — always available */}
              <MenuItem
                icon={copied ? "check" : "link"}
                label={copied ? "Đã sao chép liên kết!" : "Sao chép liên kết"}
                onClick={() => {
                  copyLink();
                }}
                active={copied}
              />

              {/* Save — always available */}
              <MenuItem
                icon="bookmark"
                label={post.saved ? "Đã lưu bài viết" : "Lưu bài viết"}
                onClick={toggleSave}
                active={post.saved}
              />

              {/* Author-only actions */}
              {post.isOwn && (
                <>
                  <MenuItem
                    icon="edit"
                    label="Sửa bài viết"
                    onClick={() => {
                      onClose();
                      onEdit?.();
                    }}
                  />
                  <MenuItem
                    icon="circleX"
                    label="Xoá bài viết"
                    danger
                    onClick={() => {
                      if (!window.confirm("Xoá bài viết này? Hành động không thể hoàn tác.")) return;
                      onClose();
                      onDelete?.();
                    }}
                  />
                </>
              )}

              {/* Non-author: follow / unfollow */}
              {!post.isOwn && (
                <MenuItem
                  icon="userPlus"
                  label={
                    followBusy
                      ? "..."
                      : post.iFollowThem
                        ? "Bỏ theo dõi"
                        : "Theo dõi @" + post.username
                  }
                  onClick={toggleFollow}
                  loading={followBusy}
                />
              )}

              {/* Divider */}
              <div className="my-2 h-px bg-[#232338]" />

              {/* Hide-from-feed */}
              <div className="rounded-lg px-3 py-3 hover:bg-white/5">
                <div className="flex items-start gap-3">
                  <Icon name="eyeOff" size={18} className="mt-0.5 text-[#a0a5b5]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-white">Ẩn khỏi feed của tôi</p>
                    <p className="text-[11px] text-[#626775]">
                      Bài viết sẽ không xuất hiện trên trang chủ của bạn.
                    </p>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={toggleHideFromFeed}
                        disabled={hideFromFeedBusy}
                        className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                          hideFromFeedDone || post.hiddenFromFeed
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-[#626775] text-white hover:bg-[#7a8194]"
                        } disabled:opacity-50`}
                      >
                        {hideFromFeedBusy ? (
                          "..."
                        ) : hideFromFeedDone || post.hiddenFromFeed ? (
                          <>
                            <Icon name="check" size={12} />
                            Đã ẩn
                          </>
                        ) : (
                          "Ẩn ngay"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* See less from this channel — non-authors */}
              {!post.isOwn && (
                <div className="rounded-lg px-3 py-3 hover:bg-white/5">
                  <div className="flex items-start gap-3">
                    <Icon name="thumbsDown" size={18} className="mt-0.5 text-[#a0a5b5]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-white">Quan tâm kênh này ít hơn</p>
                      <p className="text-[11px] text-[#626775]">
                        Bài viết từ @{post.username} sẽ hiển thị ít hơn trên feed của bạn.
                      </p>
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={toggleDismiss}
                          disabled={dismissBusy}
                          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                            dismissDone
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-[#626775] text-white hover:bg-[#7a8194]"
                          } disabled:opacity-50`}
                        >
                          {dismissBusy ? (
                            "..."
                          ) : dismissDone ? (
                            <>
                              <Icon name="check" size={12} />
                              Đã giảm ưu tiên
                            </>
                          ) : (
                            "Giảm ưu tiên"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hide from specific users — author only */}
              {post.isOwn && (
                <div className="mt-1 rounded-lg px-3 py-3 hover:bg-white/5">
                  <div className="flex items-start gap-3">
                    <Icon name="eyeOff" size={18} className="mt-0.5 text-[#a0a5b5]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-white">Ẩn với người cụ thể</p>
                      <p className="text-[11px] text-[#626775]">
                        Những người này sẽ không thấy bài viết trên feed nữa.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          placeholder="@username"
                          value={usernameToHide}
                          onChange={(e) => {
                            setUsernameToHide(e.target.value);
                            setHideTried(false);
                          }}
                          className="flex-1 rounded-full border border-[#232338] bg-[#171920] px-3 py-1.5 text-[12px] text-white outline-none placeholder:text-[#626775] focus:border-[#00e5ff]/50"
                        />
                        <button
                          type="button"
                          disabled={hideBusy || !usernameToHide.trim()}
                          onClick={() =>
                            addHiddenUser(usernameToHide.trim().replace(/^@/, ""))
                          }
                          className="rounded-full bg-[#ff4d6d] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#ff2e57] disabled:opacity-50"
                        >
                          Ẩn
                        </button>
                      </div>
                      {hideTried && (
                        <p className="mt-1 text-[11px] text-red-400">
                          Không tìm thấy người dùng.
                        </p>
                      )}
                      {post.hiddenFromUsers.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          <p className="text-[11px] text-[#626775]">Đang ẩn với:</p>
                          {post.hiddenFromUsers.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center gap-2 rounded border border-[#232338] bg-[#171920] px-2 py-1"
                            >
                              <div className="size-6 shrink-0 overflow-hidden rounded-full bg-[#c6c6c6]">
                                {u.avatar ? (
                                  <img
                                    src={u.avatar}
                                    alt=""
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[10px] font-bold text-white">
                                    {(u.name ?? u.username)[0]?.toUpperCase() ?? "?"}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-bold text-white">
                                  @{u.username}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeHiddenUser(u.id)}
                                className="text-[11px] text-[#00e5ff] hover:underline"
                              >
                                Bỏ ẩn
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Report — non-author only */}
              {!post.isOwn && (
                <MenuItem
                  icon="shieldAlert"
                  label="Báo cáo bài viết"
                  onClick={() => setShowReport(true)}
                  danger
                />
              )}

              {error && (
                <p className="mx-3 mt-2 text-[11px] text-red-400">{error}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── MenuItem helper ──────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  danger,
  active,
  loading,
  onClick,
}: {
  icon: keyof typeof import("@/lib/assets").assets;
  label: string;
  danger?: boolean;
  active?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-[13px] transition-colors hover:bg-white/5 disabled:opacity-50 ${
        danger ? "text-red-400" : active ? "text-[#00e5ff]" : "text-white"
      }`}
    >
      <Icon
        name={icon}
        size={18}
        className={danger ? "text-red-400" : active ? "text-[#00e5ff]" : "text-[#a0a5b5]"}
      />
      <span className="font-medium">{loading ? "..." : label}</span>
    </button>
  );
}
