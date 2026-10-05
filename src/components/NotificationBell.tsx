"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { assets } from "@/lib/assets";
import { useNotificationBell, NotifItem } from "@/hooks/useNotificationBell";

type AssetKey = keyof typeof assets;

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
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
    case "mention":
      return "bell";
    default:
      return "bellDot";
  }
}

function dateBucket(unix: number): string {
  const d = new Date(unix * 1000);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Hôm nay";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "Hôm qua";
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  if (d >= sevenDaysAgo) return "Tuần này";
  return "Trước đó";
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

interface FriendRequestLite {
  id: string;
  user_id: string;
  name: string | null;
  username: string;
  avatar: string | null;
  bio: string | null;
  status: string;
  created_at: number;
}

/**
 * The notification button + dropdown used by both the global Navbar and the
 * /groups sub-page header. They render identically so the bell badge and
 * the unread count stay in sync across the app.
 */
export function NotificationBell() {
  const {
    notifs,
    unreadCount,
    busyId,
    markingAll,
    open,
    toggle,
    close,
    markAsRead,
    deleteOne,
    markAllRead,
  } = useNotificationBell(true);

  // Friend requests are surfaced inline above the regular notifications so
  // the user can accept/decline without opening the dropdown. We
  // intentionally do NOT seed this list from sessionStorage: the
  // server is the only source of truth for pending friendships, and a
  // stale cache would surface ghost rows that return 404 when the user
  // tries to accept/decline them.
  const REQ_CACHE_KEY = "notif-bell-requests:v1";
  const [requests, setRequests] = useState<FriendRequestLite[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  // Mirror the friend-requests list into sessionStorage so other parts
  // of the app (e.g. a quick "are there pending requests?" check) can
  // read it without round-tripping the server.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(REQ_CACHE_KEY, JSON.stringify(requests));
    } catch {
      // ignore
    }
  }, [requests]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/friend-request?mode=received", {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json().catch(() => [])),
      fetch("/api/friend-request?mode=count", {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json().catch(() => ({}))),
    ])
      .then(([reqs, countData]: [FriendRequestLite[], { count?: number }]) => {
        if (cancelled) return;
        if (Array.isArray(reqs)) {
          // Defensive filter: only show pending requests even if the
          // server accidentally returns accepted/declined rows. This
          // prevents the dropdown from showing ghost buttons that
          // would 404 on click.
          const pending = reqs.filter((r) => r.status === "pending");
          const unique = pending.reduce<FriendRequestLite[]>((acc, r) => {
            if (!acc.some((x) => x.id === r.id)) acc.push(r);
            return acc;
          }, []);
          setRequests(unique);
        }
        if (typeof countData?.count === "number") setRequestCount(countData.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleAccept(requestId: string) {
    const res = await fetch("/api/friend-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ requestId, action: "accept" }),
    });
    if (res.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      setRequestCount((c) => Math.max(0, c - 1));
      // Notify the global notifier so the bell badge updates immediately.
      window.dispatchEvent(new CustomEvent("notifications:reload"));
    }
  }

  async function handleDecline(requestId: string) {
    const res = await fetch("/api/friend-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ requestId, action: "decline" }),
    });
    if (res.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      setRequestCount((c) => Math.max(0, c - 1));
      window.dispatchEvent(new CustomEvent("notifications:reload"));
    }
  }

  const visibleNotifs = filter === "unread" ? notifs.filter((n) => !n.read) : notifs;

  // Group notifications by date bucket for the dropdown list.
  const grouped = visibleNotifs.reduce<{ label: string; items: NotifItem[] }[]>(
    (acc, n) => {
      const label = dateBucket(n.createdAt);
      const last = acc[acc.length - 1];
      if (last && last.label === label) last.items.push(n);
      else acc.push({ label, items: [n] });
      return acc;
    },
    [],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative flex size-10 items-center justify-center rounded-[20px] bg-[#2a2d37]"
        aria-label="Thông báo"
        aria-pressed={open}
        title="Thông báo"
      >
        <Icon name="bellDot" size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#ff2e93] text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[520px] flex flex-col rounded-2xl border border-[#242831] bg-[#171920] shadow-xl z-50">
          <div className="flex items-center justify-between border-b border-[#242831] px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-white">Thông báo</h3>
              {unreadCount > 0 && (
                <p className="text-[11px] text-[#626775]">{unreadCount} chưa đọc</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={markingAll}
                  className="rounded-lg border border-[#242831] bg-[#2a2d37] px-2 py-1 text-[11px] font-semibold text-[#a0a5b5] hover:text-white hover:border-[#ff2e93]/50 transition-colors disabled:opacity-50"
                >
                  {markingAll ? "Đang xử lý…" : "Đã đọc tất cả"}
                </button>
              )}
              <Link
                href="/notifications"
                onClick={close}
                className="text-xs text-[#ff2e93] hover:underline"
              >
                Xem tất cả
              </Link>
            </div>
          </div>

          {/* Friend request sub-section */}
          {requests.length > 0 && filter !== "unread" && (
            <div className="border-b border-[#242831] bg-[#1a1d24]">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#626775]">
                  Lời mời kết bạn · {requests.length}
                </span>
              </div>
              <div className="max-h-[180px] overflow-y-auto">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 border-b border-[#242831] px-4 py-3 last:border-0 hover:bg-white/5"
                  >
                    <div className="size-10 shrink-0 overflow-hidden rounded-full">
                      <SafeAvatar
                        src={req.avatar}
                        alt=""
                        name={req.name}
                        username={req.username}
                        className="size-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {req.name ?? req.username}
                      </p>
                      <p className="truncate text-xs text-[#626775]">
                        @{req.username} · {timeAgo(req.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDecline(req.id)}
                        className="size-9 flex items-center justify-center rounded-lg border border-[#242831] bg-[#1f232c] text-[#a0a5b5] hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 active:scale-95 transition-all cursor-pointer"
                        title="Từ chối"
                      >
                        <Icon name="xCircle" size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccept(req.id)}
                        className="size-9 flex items-center justify-center rounded-lg text-white active:scale-95 transition-all cursor-pointer"
                        style={{
                          backgroundImage:
                            "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
                        }}
                        title="Chấp nhận"
                      >
                        <Icon name="heart" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All / Unread filter */}
          <div className="flex border-b border-[#242831] px-2 py-1.5">
            {(
              [
                { id: "all", label: "Tất cả" },
                { id: "unread", label: "Chưa đọc" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
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

          <div className="flex-1 overflow-y-auto">
            {visibleNotifs.length === 0 ? (
              <p className="px-4 py-12 text-center text-[12px] text-[#626775]">
                {filter === "unread" ? "Không có thông báo chưa đọc." : "Chưa có thông báo nào."}
              </p>
            ) : (
              grouped.map(({ label, items }) => (
                <div key={label}>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#626775]">
                    {label}
                  </div>
                  {items.map((n) => {
                    const href = hrefForNotif(n);
                    const row = (
                      <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/5">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#2a2d37]">
                          <Icon
                            name={iconForType(n.type)}
                            size={12}
                            className="text-[#ff2e93]"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${n.read ? "text-[#a0a5b5]" : "text-white font-semibold"}`}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-2 text-[12px] text-[#626775]">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-[#626775]">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-start gap-1.5">
                          {!n.read && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                markAsRead(n);
                              }}
                              disabled={busyId === n.id}
                              className="size-9 flex items-center justify-center rounded-lg border border-[#242831] bg-[#1f232c] text-[#a0a5b5] hover:border-[#3a4258] hover:bg-[#2a2d37] hover:text-white active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                              title="Đánh dấu đã đọc"
                            >
                              <Icon name="check" size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              deleteOne(n);
                            }}
                            disabled={busyId === n.id}
                            className="size-9 flex items-center justify-center rounded-lg border border-[#242831] bg-[#1f232c] text-[#a0a5b5] hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
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
                            close();
                          }}
                          className="block"
                        >
                          {row}
                        </Link>
                      );
                    }
                    return <div key={n.id}>{row}</div>;
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#242831] px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={close}
              className="text-xs text-[#a0a5b5] hover:text-white"
            >
              Mở trang thông báo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
