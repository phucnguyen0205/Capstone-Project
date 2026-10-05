"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

interface PublicGroupPreviewProps {
  groupId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  creatorUsername: string;
  creatorName: string | null;
  onJoined: () => void;
}

/**
 * Shown in the center column when the user has selected a public group
 * they're not yet a member of. It surfaces just enough info to make a
 * join decision — name, description, member count, creator — but does
 * NOT show posts (the post stream is gated behind membership).
 */
export function PublicGroupPreview({
  groupId,
  name,
  description,
  avatarUrl,
  memberCount,
  creatorUsername,
  creatorName,
  onJoined,
}: PublicGroupPreviewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/join`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Không thể tham gia");
        return;
      }
      // Parent will re-fetch and re-route the user into the member view.
      onJoined();
    } catch {
      setError("Lỗi mạng");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#0c0c14] p-6">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-emerald-500/30 bg-[#11121a] p-6 text-center shadow-2xl">
        <SafeAvatar
          src={avatarUrl}
          alt=""
          name={name}
          className="size-20 rounded-full"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-[18px] font-bold text-white">{name}</h2>
            <Icon name="globe" size={14} className="text-emerald-300" />
          </div>
          <p className="text-[11px] text-[#67678d]">
            {memberCount} thành viên · Tạo bởi{" "}
            <span className="font-semibold text-[#a5a5c7]">
              @{creatorUsername}
              {creatorName ? ` (${creatorName})` : ""}
            </span>
          </p>
        </div>

        {description && (
          <p className="text-[12px] leading-relaxed text-[#a0a5b5]">
            {description}
          </p>
        )}

        <p className="text-[11px] text-[#67678d]">
          Đây là nhóm công khai. Bạn có thể xin tham gia để xem các bài
          đăng trong nhóm.
        </p>

        <button
          type="button"
          onClick={join}
          disabled={busy}
          className="mt-2 w-full max-w-xs rounded-xl bg-gradient-to-r from-violet-500 to-teal-500 px-4 py-2.5 text-[13px] font-bold text-white shadow-[0px_4px_6px_rgba(139,92,246,0.25)] hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "Đang tham gia..." : "Tham gia nhóm"}
        </button>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}