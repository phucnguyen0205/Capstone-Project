"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";

interface FriendItem {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
}

type ShareMode = "friend" | "group" | "copy";

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
 * Standalone share modal — opened from PostDetailModal or any 3-dot menu.
 *
 * Three modes:
 *   friend : pick one or many mutual friends to share with
 *   group  : pick groups to share with (placeholder — no group system yet)
 *   copy   : copy the post link to clipboard
 *
 * The modal closes itself after a successful copy/share, and calls
 * `onShared()` so the parent can refresh counters.
 */
export function ShareModal({
  postId,
  postUsername,
  onClose,
  onShared,
}: {
  postId: string;
  postUsername: string;
  onClose: () => void;
  onShared?: () => void;
}) {
  const [mode, setMode] = useState<ShareMode>("friend");
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const me = await fetch(`/api/users/me`, { credentials: "include" });
      const meData = await safeJson<{ id: string }>(me);
      if (!meData?.id) {
        setFriends([]);
        return;
      }
      const r = await fetch(`/api/users/${meData.id}/friends?list=friends`, {
        credentials: "include",
      });
      const data = await safeJson<FriendItem[]>(r);
      setFriends(Array.isArray(data) ? data : []);
    } catch {
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "friend") loadFriends();
  }, [mode, loadFriends]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    if (mode === "copy") {
      const link = `${window.location.origin}/profile/${postUsername}?post=${postId}`;
      try {
        await navigator.clipboard.writeText(link);
        setSuccess("Đã sao chép liên kết vào clipboard");
      } catch {
        // Fallback for browsers without clipboard permission
        try {
          window.prompt("Sao chép liên kết:", link);
          setSuccess("Đã mở hộp thoại sao chép");
        } catch {
          setError("Không thể sao chép — hãy copy thủ công: " + link);
          return;
        }
      }
      // Record a copy event so the share count increases on the post.
      await fetch(`/api/posts/${postId}/share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "copy" }),
      }).catch(() => null);
      onShared?.();
      return;
    }
    if (selected.size === 0) {
      setError("Chọn ít nhất một người/nhóm để chia sẻ");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: mode,
          targets: Array.from(selected),
        }),
      });
      if (!res.ok) {
        const e = await safeJson<{ error: string }>(res);
        setError(e?.error ?? "Chia sẻ thất bại");
        return;
      }
      const data = await safeJson<{ shareCount?: number }>(res);
      const total = data?.shareCount ?? 0;
      setSuccess(`Đã chia sẻ với ${selected.size} người (tổng ${total} lượt)`);
      setSelected(new Set());
      onShared?.();
      // Blur active element before the modal unmounts to avoid React 19
      // hydration-style "removeChild" errors when a focused button inside
      // the modal disappears.
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setTimeout(() => onClose(), 900);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#171920] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
          <p className="text-[15px] font-bold text-white">Chia sẻ bài viết</p>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] hover:bg-white/5 hover:text-white"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex shrink-0 gap-2 border-b border-[#232338] px-4 py-3">
          <ModeButton icon="users2" active={mode === "friend"} onClick={() => setMode("friend")}>
            Bạn bè
          </ModeButton>
          <ModeButton icon="users2" active={mode === "group"} onClick={() => setMode("group")}>
            Nhóm
          </ModeButton>
          <ModeButton icon="link" active={mode === "copy"} onClick={() => setMode("copy")}>
            Sao chép liên kết
          </ModeButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {mode === "copy" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-[#232338] bg-[#0f1118] p-4 text-[12px] text-[#a0a5b5]">
              <p>Sao chép liên kết bài viết để gửi qua bất kỳ ứng dụng nào.</p>
              <code className="break-all rounded bg-black/40 p-2 text-[11px] text-[#00e5ff]">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/profile/${postUsername}?post=${postId}`
                  : `/profile/${postUsername}?post=${postId}`}
              </code>
              <p className="text-[11px] text-[#626775]">
                Nhấn "Sao chép" bên dưới.
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-[12px] text-[#626775]">
              Đang tải...
            </div>
          ) : mode === "friend" && friends.length === 0 ? (
            <EmptyState
              title="Chưa có bạn bè chung"
              description="Hãy follow lẫn nhau với một số người để có thể chia sẻ bài viết."
            />
          ) : mode === "group" ? (
            <EmptyState
              title="Tính năng nhóm đang phát triển"
              description="Hiện chưa có hệ thống nhóm — bạn có thể dùng tab Bạn bè hoặc Sao chép liên kết."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {friends.map((f) => {
                const isSelected = selected.has(f.id);
                return (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors ${
                      isSelected
                        ? "border-[#00e5ff] bg-[#00e5ff]/10 text-white"
                        : "border-[#232338] bg-[#0f1118] text-[#a0a5b5] hover:bg-white/5"
                    }`}
                  >
                    <div className="size-9 shrink-0 overflow-hidden rounded-full bg-[#c6c6c6]">
                      {f.avatar ? (
                        <img
                          src={f.avatar}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[11px] font-bold text-white">
                          {(f.name ?? f.username)[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-white">
                        {f.name ?? f.username}
                      </p>
                      <p className="truncate text-[10px] text-[#626775]">
                        @{f.username}
                      </p>
                    </div>
                    <div
                      className={`flex size-5 items-center justify-center rounded border ${
                        isSelected
                          ? "border-[#00e5ff] bg-[#00e5ff] text-black"
                          : "border-[#232338] bg-transparent"
                      }`}
                    >
                      {isSelected && <Icon name="triangleRight" size={12} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[#232338] bg-[#0f1118] px-4 py-3">
          {error && (
            <p className="flex-1 truncate text-[11px] text-red-400">{error}</p>
          )}
          {success && !error && (
            <p className="flex-1 truncate text-[11px] text-emerald-400">
              {success}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#232338] px-4 py-1.5 text-[12px] text-[#a0a5b5] hover:bg-white/5"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full bg-[#00e5ff] px-4 py-1.5 text-[12px] font-bold text-[#09090f] disabled:opacity-50"
          >
            {mode === "copy" ? (
              success ? (
                <>
                  <Icon name="check" size={12} />
                  Đã sao chép
                </>
              ) : (
                "Sao chép"
              )
            ) : busy ? (
              "Đang gửi..."
            ) : (
              `Chia sẻ (${selected.size})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: keyof typeof import("@/lib/assets").assets;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-[#00e5ff] bg-[#00e5ff]/10 text-[#00e5ff]"
          : "border-[#232338] text-[#a0a5b5] hover:bg-white/5"
      }`}
    >
      <Icon name={icon} size={12} />
      {children}
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#232338] bg-[#0f1118] p-6 text-center">
      <Icon name="users2" size={28} className="text-[#626775]" />
      <p className="text-[12px] font-bold text-white">{title}</p>
      <p className="text-[11px] text-[#626775]">{description}</p>
    </div>
  );
}