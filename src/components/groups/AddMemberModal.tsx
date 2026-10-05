"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";

interface SearchUser {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
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

interface AddMemberModalProps {
  onClose: () => void;
  /** Called after a member is successfully invited so the sidebar can refresh */
  onAdded?: () => void;
}

export function AddMemberModal({ onClose, onAdded }: AddMemberModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the search field on mount; blur anything else that was focused
    // so unmounting doesn't trigger removeChild errors.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: "include", cache: "no-store" }
        );
        const data = await safeJson<SearchUser[]>(res);
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function invite(user: SearchUser) {
    if (busyIds.has(user.id) || sentIds.has(user.id)) return;
    setBusyIds((prev) => new Set(prev).add(user.id));
    setError(null);
    try {
      const res = await fetch("/api/friend-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action: "send" }),
      });
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Không gửi được lời mời");
        return;
      }
      setSentIds((prev) => new Set(prev).add(user.id));
      onAdded?.();
    } catch {
      setError("Lỗi mạng");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  function handleClose() {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={handleClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-violet-500/30 bg-[#11121a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="userPlus" size={16} />
            <p className="text-[15px] font-bold text-white">Thêm thành viên</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] hover:bg-white/5 hover:text-white"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-[#232338] p-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#232338] bg-[#0f1118] px-3 py-2">
            <Icon name="search" size={16} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc @username..."
              className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
            />
          </div>
          {error && (
            <p className="mt-2 text-[11px] text-red-400">{error}</p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[12px] text-[#626775]">
              Đang tìm...
            </div>
          ) : query.trim() === "" ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Icon name="search" size={28} />
              <p className="text-[12px] text-[#67678d]">
                Nhập tên hoặc username để tìm thành viên
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[12px] text-[#626775]">
              Không tìm thấy ai phù hợp
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((u) => {
                const sent = sentIds.has(u.id);
                const busy = busyIds.has(u.id);
                const name = u.name ?? u.username;
                return (
                  <li
                    key={u.id}
                    className="flex items-center gap-3 rounded-lg border border-transparent p-2 hover:border-[#232338] hover:bg-white/5"
                  >
                    <div className="size-9 shrink-0 overflow-hidden rounded-full bg-[#c6c6c6]">
                      {u.avatar ? (
                        <img
                          src={u.avatar}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[12px] font-bold text-white">
                          {name[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white">
                        {name}
                      </p>
                      <p className="truncate text-[10px] text-[#67678d]">
                        @{u.username}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => invite(u)}
                      disabled={busy || sent}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                        sent
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-gradient-to-r from-violet-500 to-teal-500 text-white hover:opacity-90 disabled:opacity-60"
                      }`}
                    >
                      {sent ? (
                        <span className="flex items-center gap-1">
                          <Icon name="check" size={12} />
                          Đã mời
                        </span>
                      ) : busy ? (
                        "..."
                      ) : (
                        "Mời"
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="shrink-0 border-t border-[#232338] px-4 py-2.5 text-[11px] text-[#67678d]">
          Họ phải chấp nhận lời mời để trở thành thành viên
        </div>
      </div>
    </div>
  );
}
