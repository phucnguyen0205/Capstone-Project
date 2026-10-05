"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { proxyAvatar } from "@/lib/avatar";
import { assets } from "@/lib/assets";
import { Navbar } from "@/components/Navbar";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";

type AssetKey = keyof typeof assets;

interface NotifActor {
  id: string;
  username: string | null;
  name: string | null;
  avatar: string | null;
}

interface NotifItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  readAt: number | null;
  createdAt: number;
  actor: NotifActor | null;
}

type Filter = "all" | "unread";

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  const d = new Date(unix * 1000);
  return d.toLocaleDateString("vi-VN");
}

function dateBucket(unix: number): string {
  const now = new Date();
  const d = new Date(unix * 1000);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Hôm nay";
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  if (d >= sevenDaysAgo) return "Tuần này";
  return "Trước đó";
}

function iconForType(type: string): AssetKey {
  switch (type) {
    case "friend_request":
      return "heartHandshake";
    case "friend_accept":
      return "heart";
    case "like":
      return "heartFilled";
    case "comment":
      return "messageCircle";
    case "share":
      return "share2";
    case "follow":
      return "userPlus";
    case "group_invite":
      return "users2";
    case "system":
    default:
      return "bellDot";
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case "friend_request":
      return "Lời mời kết bạn";
    case "friend_accept":
      return "Lời mời được chấp nhận";
    case "like":
      return "Lượt thích";
    case "comment":
      return "Bình luận";
    case "share":
      return "Chia sẻ";
    case "follow":
      return "Theo dõi mới";
    case "group_invite":
      return "Lời mời vào nhóm";
    case "system":
    default:
      return "Hệ thống";
  }
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text);
  } catch {
    return {} as T;
  }
}

function hrefForNotif(n: NotifItem): string | null {
  const data = (n.data ?? {}) as Record<string, unknown>;
  switch (n.type) {
    case "friend_request": {
      const requesterId = data.requesterId as string | undefined;
      if (requesterId) return `/profile/${encodeURIComponent(requesterId)}`;
      return "/friends";
    }
    case "friend_accept":
    case "follow": {
      const userId = data.userId as string | undefined;
      if (userId) return `/profile/${encodeURIComponent(userId)}`;
      return null;
    }
    case "like":
    case "comment":
    case "share": {
      const postId = data.postId as string | undefined;
      if (postId) return `/?post=${encodeURIComponent(postId)}`;
      return null;
    }
    case "group_invite": {
      const groupId = data.groupId as string | undefined;
      if (groupId) return `/groups?g=${encodeURIComponent(groupId)}`;
      return "/groups";
    }
    default:
      return null;
  }
}

function NotificationsPage() {
  const { data: session, status } = useSession();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const url = new URL("/api/notifications", window.location.origin);
      url.searchParams.set("limit", "100");
      if (filter === "unread") url.searchParams.set("unread", "1");
      const res = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const data = await safeJson<{ items: NotifItem[]; total: number; unreadCount: number }>(res);
      if (Array.isArray(data?.items)) setItems(data.items);
      if (typeof data?.total === "number") setTotal(data.total);
      if (typeof data?.unreadCount === "number") setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }, [session, filter]);

  useEffect(() => {
    load();
    // Listen for explicit reload requests from other parts of the app so
    // the page refreshes after a friend request is accepted/declined/
    // cancelled elsewhere (e.g. the bell dropdown or /friends page).
    const onReload = () => load();
    window.addEventListener("notifications:reload", onReload as EventListener);
    // Re-sync when the tab regains focus so a fresh F5 or tab switch
    // doesn't leave stale notifications visible on the page.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("notifications:reload", onReload as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function markAsRead(n: NotifItem) {
    if (n.read) return;
    setBusyId(n.id);
    const previous = items;
    setItems((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read: true, readAt: Math.floor(Date.now() / 1000) } : x))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(n.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error("Failed to mark read", err);
      setItems(previous);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteOne(n: NotifItem) {
    setBusyId(n.id);
    const previous = items;
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.read) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(n.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error("Failed to delete", err);
      setItems(previous);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const now = Math.floor(Date.now() / 1000);
      setItems((prev) => prev.map((n) => (n.read ? n : { ...n, read: true, readAt: now })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all read", err);
      load();
    } finally {
      setMarkingAll(false);
    }
  }

  const grouped = useMemo(() => {
    const seen = new Map<string, NotifItem[]>();
    for (const n of items) {
      const bucket = dateBucket(n.createdAt);
      if (!seen.has(bucket)) seen.set(bucket, []);
      seen.get(bucket)!.push(n);
    }
    return Array.from(seen, ([label, list]) => ({ label, list }));
  }, [items]);

  if (status === "loading") {
    return (
      <div className="flex h-[calc(100vh-72px)] items-center justify-center bg-[#111317]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-[calc(100vh-72px)] items-center justify-center bg-[#111317] text-[#a0a5b5]">
        <div className="text-center">
          <p className="text-sm">Vui lòng đăng nhập để xem thông báo.</p>
          <Link
            href="/auth/signin"
            className="mt-3 inline-block rounded-full px-4 py-2 text-[13px] font-bold text-white"
            style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Thông báo</h1>
          <p className="mt-1 text-sm text-[#626775]">
            Tổng cộng {total} · {unreadCount} chưa đọc
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-[#242831] bg-[#2a2d37] px-3 py-2 text-xs font-semibold text-[#a0a5b5] hover:text-white hover:border-[#ff2e93]/50 transition-colors disabled:opacity-50"
            title="Tải lại"
          >
            {loading ? "Đang tải…" : "Làm mới"}
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll}
              className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
            >
              {markingAll ? "Đang xử lý…" : "Đánh dấu tất cả đã đọc"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-xl border border-[#242831] bg-[#171920] p-1">
        {([
          { id: "all", label: "Tất cả" },
          { id: "unread", label: "Chưa đọc" },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              filter === t.id
                ? "bg-[#2a2d37] text-white"
                : "text-[#626775] hover:text-white"
            }`}
          >
            {t.label}
            {t.id === "unread" && unreadCount > 0 && (
              <span className="ml-1 rounded-full bg-[#ff2e93] px-1.5 py-0.5 text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#242831] bg-[#171920] py-16 text-center">
          <Icon name="bellDot" size={36} className="text-[#626775]" />
          <p className="text-sm text-[#626775]">
            {filter === "unread" ? "Bạn đã đọc hết thông báo." : "Bạn chưa có thông báo nào."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-[#626775]">
                {group.label}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-[#242831] bg-[#171920]">
                {group.list.map((n, idx) => {
                  const href = hrefForNotif(n);
                  const row = (
                    <div
                      key={n.id}
                      className={`flex gap-3 px-4 py-3 transition-colors ${
                        idx > 0 ? "border-t border-[#242831]" : ""
                      } ${n.read ? "" : "bg-[#ff2e93]/[0.06]"} hover:bg-white/5`}
                    >
                      <div className="relative size-10 shrink-0">
                        <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#ff2e93] to-[#ff8a56] text-white">
                          {n.actor?.avatar ? (
                            <img src={proxyAvatar(n.actor?.avatar) ?? ""} alt="" className="size-full object-cover" />
                          ) : n.actor ? (
                            <span className="text-sm font-bold">
                              {(n.actor.name ?? n.actor.username ?? "?")[0]?.toUpperCase()}
                            </span>
                          ) : (
                            <Icon name={iconForType(n.type)} size={18} className="text-white" />
                          )}
                        </div>
                        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-[#171920] bg-[#2a2d37]">
                          <Icon name={iconForType(n.type)} size={10} className="text-[#ff2e93]" />
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#2a2d37] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#a0a5b5]">
                            {typeLabel(n.type)}
                          </span>
                          {!n.read && (
                            <span className="size-2 rounded-full bg-[#ff2e93]" title="Chưa đọc" />
                          )}
                        </div>
                        <p className={`mt-1 text-sm ${n.read ? "text-[#a0a5b5]" : "text-white font-semibold"}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-[13px] text-[#626775]">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-[#626775]">{timeAgo(n.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-start gap-1">
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => markAsRead(n)}
                            disabled={busyId === n.id}
                            className="size-8 flex items-center justify-center rounded-lg border border-transparent text-[#626775] hover:border-[#242831] hover:bg-[#2a2d37] hover:text-white transition-colors disabled:opacity-50"
                            title="Đánh dấu đã đọc"
                          >
                            <Icon name="check" size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteOne(n)}
                          disabled={busyId === n.id}
                          className="size-8 flex items-center justify-center rounded-lg border border-transparent text-[#626775] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Xoá thông báo"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  );
                  if (href) {
                    return (
                      <Link
                        key={n.id}
                        href={href}
                        onClick={() => {
                          if (!n.read) markAsRead(n);
                        }}
                        className="block"
                      >
                        {row}
                      </Link>
                    );
                  }
                  return row;
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  // Keep heartbeat in sync with the rest of the app — notifications page
  // shows "Online" status to friends on the avatar fallback.
  usePresenceHeartbeat(30_000);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#090a0c]">
      <Navbar />
      <main className="flex w-full flex-1 gap-5 overflow-y-auto p-5">
        <NotificationsPage />
      </main>
    </div>
  );
}
