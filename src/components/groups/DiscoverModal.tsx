"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

interface DiscoverGroup {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  creatorUsername: string;
  creatorName: string | null;
}

interface DiscoverModalProps {
  onClose: () => void;
  /** Called after a successful join so the parent can move the user into the group. */
  onJoinSuccess: (groupId: string) => void;
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

export function DiscoverModal({ onClose, onJoinSuccess }: DiscoverModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Debounced search. Empty query → empty results (we don't fetch
  // `/api/groups/discover` with `q=""` because the URL params omit it
  // and the backend already returns the most-popular first 50).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url = query.trim()
          ? `/api/groups/discover?q=${encodeURIComponent(query.trim())}&limit=30`
          : `/api/groups/discover?limit=30`;
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const data = await safeJson<DiscoverGroup[]>(res);
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function join(g: DiscoverGroup) {
    if (joiningId) return;
    setJoiningId(g.id);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${g.id}/join`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Không thể tham gia");
        return;
      }
      onJoinSuccess(g.id);
    } catch {
      setError("Lỗi mạng");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#11121a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="globe" size={16} />
            <p className="text-[15px] font-bold text-white">Khám phá nhóm công khai</p>
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

        <div className="shrink-0 border-b border-[#232338] p-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#232338] bg-[#0f1118] px-3 py-2">
            <Icon name="search" size={16} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm nhóm công khai..."
              className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
            />
          </div>
          {error && (
            <p className="mt-2 text-[11px] text-red-400">{error}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[12px] text-[#626775]">
              Đang tìm...
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Icon name="search" size={28} />
              <p className="text-[12px] text-[#67678d]">
                {query.trim() ? "Không tìm thấy nhóm nào" : "Chưa có nhóm công khai nào"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {results.map((g) => {
                const joining = joiningId === g.id;
                return (
                  <li
                    key={g.id}
                    className="flex items-center gap-3 rounded-lg border border-transparent p-2 hover:border-[#232338] hover:bg-white/5"
                  >
                    <SafeAvatar
                      src={g.avatarUrl}
                      alt=""
                      name={g.name}
                      className="size-10 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white">
                        {g.name}
                      </p>
                      <p className="truncate text-[10px] text-[#67678d]">
                        {g.memberCount} thành viên · @{g.creatorUsername}
                      </p>
                      {g.description && (
                        <p className="mt-1 line-clamp-2 text-[10px] text-[#a0a5b5]">
                          {g.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => join(g)}
                      disabled={joining}
                      className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-teal-500 px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-95 disabled:opacity-60"
                    >
                      {joining ? "..." : "Tham gia"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}