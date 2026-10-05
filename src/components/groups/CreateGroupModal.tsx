"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (g: { id: string; name: string; visibility: "public" | "private" }) => void;
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

export function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => nameRef.current?.focus());
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) {
      setError("Tên nhóm không được để trống");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim().slice(0, 500),
          visibility,
        }),
      });
      const data = await safeJson<{ id?: string; name?: string; visibility?: "public" | "private"; error?: string }>(res);
      if (!res.ok || !data?.id) {
        setError(data?.error ?? "Không thể tạo nhóm");
        return;
      }
      onCreated({
        id: data.id,
        name: data.name ?? trimmed,
        visibility: data.visibility ?? visibility,
      });
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
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-violet-500/30 bg-[#11121a] shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="users2" size={16} />
            <p className="text-[15px] font-bold text-white">Tạo nhóm mới</p>
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
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase text-[#a5a5c7]">
              Tên nhóm
            </span>
            <input
              ref={nameRef}
              type="text"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Hội bạn cấp 3"
              className="rounded-lg border border-[#232338] bg-[#0f1118] px-3 py-2 text-[13px] text-white outline-none focus:border-violet-500/50"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase text-[#a5a5c7]">
              Mô tả (tuỳ chọn)
            </span>
            <textarea
              maxLength={500}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn về nhóm..."
              className="resize-none rounded-lg border border-[#232338] bg-[#0f1118] px-3 py-2 text-[13px] text-white outline-none focus:border-violet-500/50"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase text-[#a5a5c7]">
              Quyền riêng tư
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left text-[11px] transition-colors ${
                  visibility === "private"
                    ? "border-violet-500/50 bg-[#1d1a30] text-white"
                    : "border-[#232338] bg-[#0f1118] text-[#a0a5b5] hover:border-violet-500/30"
                }`}
              >
                <Icon name="lock" size={14} />
                <span className="font-bold">Riêng tư</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left text-[11px] transition-colors ${
                  visibility === "public"
                    ? "border-emerald-500/50 bg-[#152822] text-white"
                    : "border-[#232338] bg-[#0f1118] text-[#a0a5b5] hover:border-emerald-500/30"
                }`}
              >
                <Icon name="globe" size={14} />
                <span className="font-bold">Công khai</span>
              </button>
            </div>
            <p className="text-[10px] text-[#67678d]">
              {visibility === "private"
                ? "Chỉ thành viên mới thấy nội dung và thông tin nhóm."
                : "Mọi người có thể thấy nhóm trên Discover và xin tham gia."}
            </p>
          </div>

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
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-teal-500 px-4 py-2 text-[12px] font-bold text-white hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Đang tạo..." : "Tạo nhóm"}
          </button>
        </div>
      </form>
    </div>
  );
}