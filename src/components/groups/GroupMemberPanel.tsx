"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

/**
 * A participant of a group conversation as the UI wants to render it:
 *
 *   - role    : "creator" | "admin" | "member"
 *   - nickname: optional per-conversation display name. When set, the
 *               chat UI prefers this over `name`.
 *
 * `isYou` is precomputed by the parent so the panel can disable
 * self-targeting controls (a creator can't kick themselves, etc).
 */
export interface GroupMember {
  id: string;
  name: string | null;
  username: string;
  avatar: string | null;
  role: "creator" | "admin" | "member";
  nickname: string | null;
}

interface GroupMemberPanelProps {
  conversationId: string;
  conversationName: string;
  members: GroupMember[];
  myId: string;
  /** Whether the current viewer is an admin/creator of this group. */
  canManage: boolean;
  onClose: () => void;
  onMembersChange?: (next: GroupMember[]) => void;
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

function displayName(m: GroupMember): string {
  // The nickname is the admin-curated display name. We only fall back
  // to the underlying user fields when the admin never set one.
  if (m.nickname) return m.nickname;
  return m.name ?? m.username;
}

function roleBadge(role: GroupMember["role"]) {
  if (role === "creator") {
    return {
      label: "Người tạo",
      cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    };
  }
  if (role === "admin") {
    return {
      label: "Quản trị viên",
      cls: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
    };
  }
  return null;
}

export function GroupMemberPanel({
  conversationId,
  conversationName,
  members,
  myId,
  canManage,
  onClose,
  onMembersChange,
}: GroupMemberPanelProps) {
  // Local copy so optimistic updates render before the server replies.
  const [list, setList] = useState<GroupMember[]>(members);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Sync incoming prop changes (parent re-fetched the conversation).
  useEffect(() => {
    setList(members);
  }, [members]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  function patchLocal(userId: string, patch: Partial<GroupMember>) {
    setList((prev) => {
      const next = prev.map((m) => (m.id === userId ? { ...m, ...patch } : m));
      onMembersChange?.(next);
      return next;
    });
  }

  async function saveNickname(userId: string) {
    if (!canManage) return;
    const trimmed = editingValue.trim().slice(0, 30);
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/members/${userId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: trimmed || null }),
        }
      );
      const data = await safeJson<{ error?: string; nickname?: string | null }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Không thể cập nhật biệt danh");
        return;
      }
      patchLocal(userId, { nickname: data?.nickname ?? (trimmed || null) });
      setEditingId(null);
      setEditingValue("");
    } catch {
      setError("Lỗi mạng");
    } finally {
      setBusyId(null);
    }
  }

  async function promote(userId: string) {
    if (!canManage) return;
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/members/${userId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "admin" }),
        }
      );
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Không thể thăng cấp");
        return;
      }
      patchLocal(userId, { role: "admin" });
    } catch {
      setError("Lỗi mạng");
    } finally {
      setBusyId(null);
    }
  }

  async function demote(userId: string) {
    if (!canManage) return;
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/members/${userId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "member" }),
        }
      );
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Không thể hạ cấp");
        return;
      }
      patchLocal(userId, { role: "member" });
    } catch {
      setError("Lỗi mạng");
    } finally {
      setBusyId(null);
    }
  }

  async function kick(userId: string) {
    if (!canManage) return;
    if (!confirm("Xóa thành viên này khỏi nhóm?")) return;
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/members/${userId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Không thể xóa");
        return;
      }
      const next = list.filter((m) => m.id !== userId);
      setList(next);
      onMembersChange?.(next);
    } catch {
      setError("Lỗi mạng");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = list.filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (m.name ?? "").toLowerCase().includes(q) ||
      (m.username ?? "").toLowerCase().includes(q) ||
      (m.nickname ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-violet-500/30 bg-[#11121a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#232338] px-4 py-3">
          <div>
            <p className="text-[15px] font-bold text-white">Thành viên nhóm</p>
            <p className="text-[11px] text-[#67678d]">
              {conversationName} · {list.length} thành viên
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

        {/* Search + admin add row */}
        <div className="shrink-0 space-y-2 border-b border-[#232338] p-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#232338] bg-[#0f1118] px-3 py-2">
            <Icon name="search" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, nickname hoặc @username..."
              className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
            />
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-teal-500 px-3 py-2 text-[12px] font-bold text-white hover:opacity-95"
            >
              <Icon name="plus" size={14} />
              <span>Thêm thành viên vào nhóm</span>
            </button>
          )}
        </div>

        {/* Add-member panel */}
        {canManage && showAdd && (
          <AddMemberInline
            conversationId={conversationId}
            existingIds={list.map((m) => m.id)}
            onAdded={(newMember) => {
              setList((prev) => {
                if (prev.some((p) => p.id === newMember.id)) return prev;
                const next = [...prev, newMember];
                onMembersChange?.(next);
                return next;
              });
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
            onError={setError}
          />
        )}

        {/* Error banner */}
        {error && (
          <div className="shrink-0 bg-red-500/10 px-4 py-2 text-[11px] text-red-300">
            {error}
          </div>
        )}

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="flex flex-col gap-1">
            {filtered.map((m) => {
              const badge = roleBadge(m.role);
              const isMe = m.id === myId;
              const isEditing = editingId === m.id;
              const busy = busyId === m.id;
              // Sort: creator, admins, then members (alphabetical by nickname/name).
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-transparent p-2 hover:border-[#232338] hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <SafeAvatar
                      src={m.avatar}
                      alt=""
                      name={m.name}
                      username={m.username}
                      className="size-9 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingValue}
                            maxLength={30}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveNickname(m.id);
                              if (e.key === "Escape") {
                                setEditingId(null);
                                setEditingValue("");
                              }
                            }}
                            className="w-full rounded border border-violet-500/40 bg-[#0f1118] px-2 py-1 text-[13px] text-white outline-none"
                            placeholder="Biệt danh"
                          />
                        ) : (
                          <p className="truncate text-[13px] font-semibold text-white">
                            {displayName(m)}
                            {isMe && (
                              <span className="ml-1 text-[10px] font-normal text-[#67678d]">
                                (bạn)
                              </span>
                            )}
                          </p>
                        )}
                        {badge && !isEditing && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        )}
                      </div>
                      {m.nickname && !isEditing && (
                        <p className="truncate text-[10px] text-[#67678d]">
                          @{m.username} · biệt danh: {m.nickname}
                        </p>
                      )}
                      {!m.nickname && !isEditing && (
                        <p className="truncate text-[10px] text-[#67678d]">
                          @{m.username}
                        </p>
                      )}
                    </div>

                    {/* Admin actions */}
                    {canManage && !isEditing && (
                      <div className="flex shrink-0 items-center gap-1">
                        {m.role !== "creator" && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditingValue(m.nickname ?? "");
                            }}
                            title="Đổi biệt danh"
                            className="flex size-7 items-center justify-center rounded-full text-[#a0a5b5] hover:bg-white/10 hover:text-white"
                            disabled={busy}
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        )}
                        {m.role === "member" && (
                          <button
                            type="button"
                            onClick={() => promote(m.id)}
                            title="Thăng cấp quản trị viên"
                            className="rounded-full border border-violet-500/40 px-2 py-1 text-[10px] font-bold text-violet-300 hover:bg-violet-500/10"
                            disabled={busy}
                          >
                            {busy ? "..." : "Thăng cấp"}
                          </button>
                        )}
                        {m.role === "admin" && m.id !== myId && (
                          <button
                            type="button"
                            onClick={() => demote(m.id)}
                            title="Hạ cấp về thành viên"
                            className="rounded-full border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/10"
                            disabled={busy}
                          >
                            {busy ? "..." : "Hạ cấp"}
                          </button>
                        )}
                        {m.role !== "creator" && m.id !== myId && (
                          <button
                            type="button"
                            onClick={() => kick(m.id)}
                            title="Xóa khỏi nhóm"
                            className="flex size-7 items-center justify-center rounded-full text-red-400 hover:bg-red-500/15"
                            disabled={busy}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Editing controls */}
                    {canManage && isEditing && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => saveNickname(m.id)}
                          className="rounded-full bg-gradient-to-r from-violet-500 to-teal-500 px-2 py-1 text-[10px] font-bold text-white"
                          disabled={busy}
                        >
                          {busy ? "..." : "Lưu"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingValue("");
                          }}
                          className="rounded-full border border-[#232338] px-2 py-1 text-[10px] font-bold text-[#a0a5b5] hover:bg-white/5"
                        >
                          Hủy
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer hint */}
        <div className="shrink-0 border-t border-[#232338] px-4 py-2 text-[10px] text-[#67678d]">
          {canManage
            ? "Bạn có quyền thăng cấp, hạ cấp, đổi biệt danh và xóa thành viên."
            : "Chỉ quản trị viên mới có thể chỉnh sửa thành viên."}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline search-and-invite panel inside the group member panel.
 * Keeps the existing AddMemberModal's friend-request flow untouched —
 * this one hits POST /api/conversations/[id]/members so we control
 * exactly who gets added, with no auto-accept.
 */
interface AddMemberInlineProps {
  conversationId: string;
  existingIds: string[];
  onAdded: (m: GroupMember) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

interface SearchUser {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
}

function AddMemberInline({
  conversationId,
  existingIds,
  onAdded,
  onCancel,
  onError,
}: AddMemberInlineProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = q.trim();
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
  }, [q]);

  async function add(user: SearchUser) {
    if (existingIds.includes(user.id)) {
      onError("Người dùng đã ở trong nhóm");
      return;
    }
    setBusyId(user.id);
    onError("");
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/members`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        }
      );
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        onError(data?.error ?? "Không thể thêm");
        return;
      }
      onAdded({
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        role: "member",
        nickname: null,
      });
    } catch {
      onError("Lỗi mạng");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = results.filter((u) => !existingIds.includes(u.id));

  return (
    <div className="shrink-0 border-b border-[#232338] bg-[#0f1118] px-3 py-2">
      <div className="flex items-center gap-2 rounded-lg border border-[#232338] bg-[#11121a] px-3 py-1.5">
        <Icon name="search" size={14} />
        <input
          autoFocus
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm username để thêm..."
          className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-[#626775]"
        />
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] font-bold text-[#a0a5b5] hover:text-white"
        >
          Hủy
        </button>
      </div>
      <div className="mt-2 max-h-44 overflow-y-auto">
        {loading ? (
          <p className="px-2 py-3 text-center text-[11px] text-[#626775]">Đang tìm...</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-[#626775]">
            {q.trim() ? "Không tìm thấy ai phù hợp" : "Nhập tên để tìm"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {filtered.map((u) => {
              const name = u.name ?? u.username;
              const busy = busyId === u.id;
              return (
                <li
                  key={u.id}
                  className="flex items-center gap-2 rounded-md p-1.5 hover:bg-white/5"
                >
                  <SafeAvatar
                    src={u.avatar}
                    alt=""
                    name={name}
                    username={u.username}
                    className="size-7 rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-white">
                      {name}
                    </p>
                    <p className="truncate text-[10px] text-[#67678d]">@{u.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => add(u)}
                    disabled={busy}
                    className="rounded-full bg-gradient-to-r from-violet-500 to-teal-500 px-2.5 py-1 text-[10px] font-bold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {busy ? "..." : "Thêm"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}