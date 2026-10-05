"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

/* ─── Types (mirror /api/posts/[id]/comments) ─────────────────────────── */

interface CommentAuthor {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
}

interface CommentRow {
  id: string;
  postId: string;
  parentId: string | null;
  userId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  edited: boolean;
  deleted: boolean;
  author: CommentAuthor;
  reactions: Record<string, number>;
  myReactions: string[];
  replyCount: number;
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
  const delta = Math.floor(Date.now() / 1000 - unix);
  if (delta < 60) return "Vừa xong";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ`;
  if (delta < 604800) return `${Math.floor(delta / 86400)} ngày`;
  return new Date(unix * 1000).toLocaleDateString("vi-VN");
}

/* ─── Bottom-sheet comment panel ──────────────────────────────────────── */

export function ReelCommentsPanel({
  postId,
  onClose,
  onCountChange,
  compact = false,
}: {
  postId: string;
  onClose: () => void;
  onCountChange?: (next: number) => void;
  /**
   * `compact` mode: render the panel inline (no fixed positioning,
   * no backdrop, no close button, no header). Used by the
   * discover page's right rail so the panel can sit alongside
   * the reels player without occluding it.
   */
  compact?: boolean;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Lock body scroll while the sheet is open so the underlying
  // reels player doesn't keep playing in the background.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Close on ESC.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load comments for the active reel.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/posts/${postId}/comments`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await safeJson<CommentRow[]>(res);
        if (!cancelled && Array.isArray(data)) {
          setComments(data);
          onCountChange?.(data.filter((c) => !c.parentId && !c.deleted).length);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [postId, onCountChange]);

  async function submit() {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          parentId: replyTo?.id ?? null,
        }),
      });
      const data = await safeJson<CommentRow>(res);
      if (!res.ok || !data) {
        // Surface the error as a non-blocking message — we
        // intentionally don't blow up the UI for a failed comment.
        return;
      }
      setComments((prev) => {
        if (data.parentId) {
          // Reply: bump the parent's replyCount and insert the child.
          return [
            data,
            ...prev.map((c) =>
              c.id === data.parentId
                ? { ...c, replyCount: c.replyCount + 1 }
                : c,
            ),
          ];
        }
        return [data, ...prev];
      });
      setDraft("");
      setReplyTo(null);
      onCountChange?.(comments.filter((c) => !c.parentId && !c.deleted).length + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const topLevel = comments.filter((c) => !c.parentId && !c.deleted);

  const panelBody = (
    <div
      className={
        compact
          ? "flex h-full w-full flex-col overflow-hidden bg-transparent"
          : "flex h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-3xl bg-[#0c0c14] shadow-2xl"
      }
      onClick={(e) => e.stopPropagation()}
      style={compact ? undefined : { animation: "reelSheetUp 0.25s ease-out" }}
    >
      {/* ── Header (omitted in compact mode — the discover rail
              shows the author strip above the panel) ───────────── */}
      {!compact && (
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex-1 text-center">
            <p className="text-sm font-bold text-white">
              {topLevel.length} bình luận
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>
      )}
      {compact && (
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-2">
          <p className="text-[11px] font-bold text-[#94a3b8]">
            {topLevel.length} bình luận
          </p>
        </div>
      )}

        {/* ── List ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex h-full items-center justify-center py-12">
              <div className="size-7 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
            </div>
          ) : topLevel.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
              <Icon
                name="messageCircle"
                size={32}
                className="text-white/30"
              />
              <p className="text-sm font-semibold text-white">
                Chưa có bình luận nào
              </p>
              <p className="text-[11px] text-[#94a3b8]">
                Hãy là người đầu tiên bình luận về video này.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {topLevel.map((c) => (
                <CommentRowItem
                  key={c.id}
                  comment={c}
                  replies={comments.filter(
                    (r) => r.parentId === c.id && !r.deleted,
                  )}
                  onReply={() => {
                    setReplyTo(c);
                    inputRef.current?.focus();
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Composer ──────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/10 bg-[#0c0c14] px-3 py-3">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#94a3b8]">
              <span>Đang trả lời @{replyTo.author.username}</span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="ml-auto text-white/60 hover:text-white"
                aria-label="Bỏ trả lời"
              >
                <Icon name="circleX" size={12} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter to send, Shift+Enter for newline.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={
                replyTo
                  ? `Trả lời @${replyTo.author.username}…`
                  : "Thêm bình luận…"
              }
              className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/40 focus:border-violet-500/50 focus:outline-none"
              maxLength={1000}
              disabled={submitting}
            />
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || submitting}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ff2e93] text-white transition-opacity disabled:opacity-40"
              aria-label="Gửi"
            >
              <Icon name="cornerDownLeft" size={16} className="text-white" />
            </button>
          </div>
        </div>

      {!compact && (
        <style>{`
          @keyframes reelSheetUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
      )}
    </div>
  );

  if (compact) return panelBody;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bình luận"
    >
      {panelBody}
    </div>
  );
}

/* ─── Single comment row (with one-level replies) ─────────────────────── */

function CommentRowItem({
  comment,
  replies,
  onReply,
}: {
  comment: CommentRow;
  replies: CommentRow[];
  onReply: () => void;
}) {
  const name = comment.author.name ?? `@${comment.author.username}`;
  return (
    <li className="rounded-xl px-2 py-2 hover:bg-white/5">
      <div className="flex gap-2.5">
        <SafeAvatar
          src={comment.author.avatar}
          name={name}
          className="size-8"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[12px] font-bold text-white">
              {name}
            </span>
            <span className="text-[10px] text-[#626775]">
              {timeAgo(comment.createdAt)}
              {comment.edited ? " · đã chỉnh sửa" : ""}
            </span>
          </div>
          <p className="mt-0.5 break-words text-[12px] leading-snug text-white/90">
            {comment.content}
          </p>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-[#94a3b8]">
            <button
              type="button"
              onClick={onReply}
              className="font-semibold hover:text-white"
            >
              Trả lời
            </button>
            <span>·</span>
            <span>Thích</span>
          </div>
          {replies.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2 border-l border-white/10 pl-2">
              {replies.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <SafeAvatar
                    src={r.author.avatar}
                    name={r.author.name ?? r.author.username}
                    className="size-6"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[11px] font-bold text-white">
                        {r.author.name ?? `@${r.author.username}`}
                      </span>
                      <span className="text-[9px] text-[#626775]">
                        {timeAgo(r.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 break-words text-[11px] leading-snug text-white/90">
                      {r.content}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
