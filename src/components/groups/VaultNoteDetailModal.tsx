"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

/** A single mood chip matches the VaultMainPanel styling so the two
 *  views feel like the same product. */
const MOOD_META: Record<
  string,
  { bg: string; border: string; text: string; icon: "smile" | "eyeOff" | "shieldAlert" | "eye"; label: string }
> = {
  happy: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    icon: "smile",
    label: "Vui vẻ",
  },
  sad: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    icon: "eyeOff",
    label: "Buồn",
  },
  angry: {
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    text: "text-red-400",
    icon: "shieldAlert",
    label: "Tức giận",
  },
  neutral: {
    bg: "bg-white/5",
    border: "border-[#232338]",
    text: "text-[#94a3b8]",
    icon: "eye",
    label: "Bình thường",
  },
};

export interface VaultNoteDetail {
  id: string;
  content: string;
  mood: "happy" | "sad" | "angry" | "neutral";
  createdAt: number;
  updatedAt: number;
  author: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
  /** Closeness points the viewer has with the author (server-computed). */
  closenessPoints: number;
  /** Threshold the author set, or the global default if NULL. */
  effectiveUnlock: number;
  /** "allowed" / "denied" / null — null = pure points check. */
  override: "allowed" | "denied" | null;
}

export function VaultNoteDetailModal({
  note,
  onClose,
}: {
  note: VaultNoteDetail | null;
  onClose: () => void;
}) {
  // Lock background scroll while open. We don't trap focus here because
  // the modal is a short read-only sheet — a11y fine without it for
  // this scope.
  useEffect(() => {
    if (!note) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [note, onClose]);

  if (!note) return null;

  const meta = MOOD_META[note.mood] ?? MOOD_META.neutral;
  const authorName = note.author.name ?? `@${note.author.username}`;
  const isAllowed = note.override !== "denied";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#0c0c14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — author + mood */}
        <div className="flex items-center gap-3 border-b border-[#16162a] px-5 py-4">
          <SafeAvatar
            src={note.author.avatar}
            name={authorName}
            className="size-11"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{authorName}</p>
            <p className="text-[11px] text-[#626775]">
              @{note.author.username} ·{" "}
              {new Date(note.createdAt * 1000).toLocaleString("vi-VN")}
              {note.updatedAt > note.createdAt && (
                <span className="ml-1 italic text-[#626775]">
                  (đã chỉnh sửa)
                </span>
              )}
            </p>
          </div>
          <span
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.bg} ${meta.border} ${meta.text}`}
            title={meta.label}
          >
            <Icon name={meta.icon} size={11} />
            {meta.label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex size-8 items-center justify-center rounded-full text-[#626775] hover:bg-white/5 hover:text-white"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        {/* Body — full content. We render the full text here because the
            caller (VaultMainPanel) only opens this modal for items where
            `override !== "denied"`, so the viewer is allowed to read. */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isAllowed ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">
              {note.content}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-red-500/10">
                <Icon name="lockSmall" size={26} className="text-red-300" />
              </div>
              <p className="text-sm font-semibold text-white">
                Tác giả đã ẩn ghi chú này với bạn
              </p>
              <p className="max-w-sm text-[11px] text-[#626775]">
                Cài đặt riêng tư khiến ghi chú này không hiển thị cho bạn dù
                bạn có đủ điểm thân thiết.
              </p>
            </div>
          )}
        </div>

        {/* Footer — context chips. No mockup data: all values come from
            the API row. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[#16162a] px-5 py-3 text-[11px] text-[#626775]">
          <span className="flex items-center gap-1">
            <Icon name="users2" size={11} className="text-violet-300" />
            <span>
              Điểm thân thiết:{" "}
              <span className="font-semibold text-white">
                {note.closenessPoints}
              </span>{" "}
              / {note.effectiveUnlock}đ
            </span>
          </span>
          {note.override === "allowed" && (
            <span
              className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300"
              title="Tác giả cho phép bạn xem dù chưa đủ điểm"
            >
              <Icon name="eye" size={10} />
              Cho phép đặc biệt
            </span>
          )}
          {note.override === "denied" && (
            <span
              className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-red-300"
              title="Tác giả ẩn note này với bạn dù bạn có đủ điểm"
            >
              <Icon name="eyeOff" size={10} />
              Bị ẩn đặc biệt
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
