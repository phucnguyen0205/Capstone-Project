"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

/**
 * Shape returned by /api/groups for the caller's own groups.
 *
 * `role` is the caller's role inside the group, used to render the
 * "Người tạo" / "Quản trị viên" badge next to the group name.
 */
export interface MyGroup {
  id: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  visibility: "public" | "private";
  creatorId: string;
  creatorUsername: string;
  creatorName: string | null;
  memberCount: number;
  role: "creator" | "admin" | "member";
  createdAt: number;
}

export interface DiscoverGroup {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  creatorUsername: string;
  creatorName: string | null;
}

interface GroupSelectorProps {
  /** Currently-selected group id (matches `?group=...` in URL). */
  activeGroupId: string | null;
  /** Called whenever the user picks a different group. */
  onSelectGroup: (id: string | null) => void;
  /** Free-text filter applied to the user's groups list. Owned by the
   *  parent so the search input can live above this component. */
  search: string;
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

function roleLabel(role: MyGroup["role"]) {
  if (role === "creator") return { label: "Người tạo", cls: "text-amber-300" };
  if (role === "admin") return { label: "Quản trị viên", cls: "text-violet-300" };
  return null;
}

export function GroupSelector({
  activeGroupId,
  onSelectGroup,
  search = "",
}: GroupSelectorProps) {
  const [mine, setMine] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/groups", { credentials: "include", cache: "no-store" });
      const data = await safeJson<{ mine: MyGroup[]; discover: DiscoverGroup[] }>(res);
      setMine(data?.mine ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex w-full flex-col gap-3">
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : mine.length === 0 ? (
        <p className="rounded-xl border border-[#232338] bg-[#11121a] p-3 text-center text-[11px] text-[#67678d]">
          Bạn chưa tham gia nhóm nào. Bấm + để tạo nhóm riêng.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(() => {
            // Filter the user's own groups by the parent's search query.
            // Matches name, description, or creator username (case
            // insensitive). Empty search → show everything.
            const q = search.trim().toLowerCase();
            const filtered = q
              ? mine.filter((g) => {
                  const haystack = [
                    g.name,
                    g.description ?? "",
                    g.creatorUsername,
                    g.creatorName ?? "",
                  ]
                    .join(" ")
                    .toLowerCase();
                  return haystack.includes(q);
                })
              : mine;
            if (filtered.length === 0) {
              return (
                <li>
                  <p className="rounded-xl border border-[#232338] bg-[#11121a] p-3 text-center text-[11px] text-[#67678d]">
                    Không tìm thấy nhóm phù hợp với "{search}".
                  </p>
                </li>
              );
            }
            return filtered.map((g) => {
              const isActive = g.id === activeGroupId;
              const badge = roleLabel(g.role);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onSelectGroup(g.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${
                      isActive
                        ? "border-violet-500/50 bg-[#1d1a30]"
                        : "border-[#232338] bg-[#11121a] hover:border-violet-500/30 hover:bg-[#161827]"
                    }`}
                  >
                    <SafeAvatar
                      src={g.avatarUrl}
                      alt=""
                      name={g.name}
                      className="size-9 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-white">
                          {g.name}
                        </p>
                        {g.visibility === "private" && (
                          <Icon name="lockSmall" size={10} className="text-[#67678d]" />
                        )}
                      </div>
                      <p className="truncate text-[10px] text-[#67678d]">
                        {g.memberCount} thành viên
                        {badge && (
                          <span className={`ml-1 ${badge.cls}`}>· {badge.label}</span>
                        )}
                      </p>
                    </div>
                    {isActive && (
                      <Icon name="check" size={14} className="text-violet-300" />
                    )}
                  </button>
                </li>
              );
            });
          })()}
        </ul>
      )}

      {/* (Discover / public-group section removed by request.) */}

      {/* Create modal is rendered by the parent sidebar so the trigger
          can sit at the top of the column next to the search input. */}
    </div>
  );
}