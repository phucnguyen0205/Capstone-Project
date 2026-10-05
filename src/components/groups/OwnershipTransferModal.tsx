"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

interface AdminMember {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  role: "creator" | "admin" | "member";
}

interface OwnershipTransferModalProps {
  groupId: string;
  /** Members that are eligible to receive ownership (i.e. role=admin). */
  eligibleMembers: AdminMember[];
  onClose: () => void;
  onTransferred: () => void;
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

export function OwnershipTransferModal({
  groupId,
  eligibleMembers,
  onClose,
  onTransferred,
}: OwnershipTransferModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the first eligible admin so the modal feels actionable
  // without an extra click.
  useEffect(() => {
    if (eligibleMembers.length > 0 && !selectedId) {
      setSelectedId(eligibleMembers[0].id);
    }
  }, [eligibleMembers, selectedId]);

  async function transfer() {
    if (!selectedId || busy) return;
    if (!confirm("Bạn có chắc muốn chuyển quyền người tạo? Bạn sẽ trở thành quản trị viên.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/transfer-ownership`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId: selectedId }),
      });
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Không thể chuyển quyền");
        return;
      }
      onTransferred();
    } catch {
      setError("Lỗi mạng");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#11121a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="users2" size={16} className="text-amber-300" />
            <p className="text-[15px] font-bold text-white">Chuyển quyền người tạo</p>
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

        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-[#a0a5b5]">
            Sau khi chuyển, bạn sẽ trở thành <span className="font-bold text-violet-300">Quản trị viên</span> và
            không thể rời nhóm cho đến khi quyền được chuyển lại.
          </p>

          {eligibleMembers.length === 0 ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              Chưa có quản trị viên nào. Hãy thăng cấp thành viên trước.
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {eligibleMembers.map((m) => {
                const isSelected = m.id === selectedId;
                const name = m.name ?? m.username;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                        isSelected
                          ? "border-amber-500/50 bg-[#2a1f10]"
                          : "border-[#232338] bg-[#0f1118] hover:border-amber-500/30"
                      }`}
                    >
                      <SafeAvatar
                        src={m.avatar}
                        alt=""
                        name={name}
                        username={m.username}
                        className="size-9 rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-white">
                          {name}
                        </p>
                        <p className="truncate text-[10px] text-[#67678d]">
                          @{m.username} · hiện là {m.role === "admin" ? "Quản trị viên" : m.role}
                        </p>
                      </div>
                      {isSelected && (
                        <Icon name="check" size={14} className="text-amber-300" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[#232338] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#232338] bg-[#0f1118] px-3 py-2 text-[12px] font-bold text-[#a0a5b5] hover:bg-white/5"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={transfer}
            disabled={busy || !selectedId || eligibleMembers.length === 0}
            className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-[12px] font-bold text-white hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Đang chuyển..." : "Chuyển quyền"}
          </button>
        </div>
      </div>
    </div>
  );
}