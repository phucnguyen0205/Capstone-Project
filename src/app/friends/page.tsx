"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { proxyAvatar } from "@/lib/avatar";

interface FriendRequest {
  id: string;
  user_id: string;
  name: string | null;
  username: string;
  avatar: string | null;
  bio: string | null;
  status: string;
  created_at: number;
  friends_since?: number;
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return [] as unknown as T;
  try {
    return JSON.parse(text);
  } catch {
    return [] as unknown as T;
  }
}

function timeSince(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 86400) return "Hôm nay";
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)} tuần trước`;
  return `${Math.floor(diff / 86400 / 30)} tháng trước`;
}

export default function FriendsPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"friends" | "requests" | "sent">("friends");
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    Promise.all([
      fetch("/api/friend-request?mode=friends").then((r) => safeJson<FriendRequest[]>(r)),
      fetch("/api/friend-request?mode=received").then((r) => safeJson<FriendRequest[]>(r)),
      fetch("/api/friend-request?mode=sent").then((r) => safeJson<FriendRequest[]>(r)),
    ])
      .then(([f, r, s]) => {
        function dedup<T extends { id: string; user_id?: string }>(arr: unknown): T[] {
          if (!Array.isArray(arr)) return [];
          return (arr as T[]).reduce<T[]>((acc, item) => {
            if (!acc.some((x) => x.id === item.id || (item.user_id && x.user_id === item.user_id)))
              acc.push(item);
            return acc;
          }, []);
        }
        setFriends(dedup<FriendRequest>(f));
        setRequests(dedup<FriendRequest>(r));
        setSent(dedup<FriendRequest>(s));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  function handleAccept(requestId: string) {
    const req = requests.find((r) => r.id === requestId);
    fetch("/api/friend-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "accept" }),
    })
      .then((r) => safeJson(r))
      .then(() => {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        // Also remove from "sent" in case the same id leaked there
        setSent((prev) => prev.filter((r) => r.id !== requestId));
        if (req) {
          setFriends((prev) => {
            // Dedupe by id AND user_id to avoid any Fast Refresh ghosts
            const next = [
              { ...req, status: "accepted", friends_since: Math.floor(Date.now() / 1000) },
              ...prev,
            ];
            return next.reduce<FriendRequest[]>((acc, item) => {
              if (!acc.some((x) => x.id === item.id || x.user_id === item.user_id))
                acc.push(item);
              return acc;
            }, []);
          });
        }
        // Reload notifications from server so the bell badge and dropdown
        // no longer show stale friend_request notifications after accept.
        window.dispatchEvent(new CustomEvent("notifications:reload"));
      })
      .catch(console.error);
  }

  function handleDecline(requestId: string) {
    fetch("/api/friend-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "decline" }),
    })
      .then((r) => safeJson(r))
      .then(() => {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        // Reload notifications so stale friend_request notifications are removed.
        window.dispatchEvent(new CustomEvent("notifications:reload"));
      })
      .catch(console.error);
  }

  function handleCancelSent(requestId: string) {
    fetch("/api/friend-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "cancel" }),
    })
      .then((r) => safeJson(r))
      .then(() => {
        setSent((prev) => prev.filter((r) => r.id !== requestId));
        // Reload notifications so stale friend_request notifications are removed.
        window.dispatchEvent(new CustomEvent("notifications:reload"));
      })
      .catch(console.error);
  }

  function handleMessage(userId: string) {
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: userId }),
    })
      .then((r) => safeJson<{ id: string }>(r))
      .then((data) => {
        if (data?.id) {
          window.location.href = `/?conv=${data.id}`;
        }
      })
      .catch(console.error);
  }

  const tabs: Array<{ id: "friends" | "requests" | "sent"; label: string; count: number }> = [
    { id: "friends", label: "Bạn bè", count: friends.length },
    { id: "requests", label: "Lời mời", count: requests.length },
    { id: "sent", label: "Đã gửi", count: sent.length },
  ];

  const currentData = tab === "friends" ? friends : tab === "requests" ? requests : sent;

  return (
    <div className="flex min-h-screen flex-col bg-[#090a0c]">
      {/* Header */}
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#232338] bg-[#0c0c14] px-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex size-8 items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10"
          >
            <Icon name="arrowLeft" size={16} />
          </Link>
          <div
            className="flex size-9 items-center justify-center rounded-[18px]"
            style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
          >
            <Icon name="heartHandshake" size={20} />
          </div>
          <h1 className="text-xl font-extrabold text-white">Bạn bè</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#232338] bg-[#0c0c14] px-6 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "bg-[#ff2e93]/10 text-[#ff2e93]"
                : "text-[#94a3b8] hover:text-white"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  tab === t.id ? "bg-[#ff2e93]/20 text-[#ff2e93]" : "bg-[#232338] text-[#94a3b8]"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
          </div>
        ) : currentData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-white/5">
              <Icon name="heartHandshake" size={32} className="text-[#626775]" />
            </div>
            <p className="font-semibold text-[#94a3b8]">
              {tab === "friends"
                ? "Chưa có bạn bè nào"
                : tab === "requests"
                  ? "Không có lời mời kết bạn"
                  : "Chưa gửi lời mời nào"}
            </p>
            <p className="mt-1 text-sm text-[#626775]">
              {tab === "friends"
                ? "Swipe phải trên trang chủ để kết bạn"
                : tab === "requests"
                  ? "Lời mời kết bạn sẽ xuất hiện ở đây"
                  : "Tìm người và gửi lời mời kết bạn"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentData.map((item, index) => (
              <div
                key={`${tab}-${item.id}-${index}`}
                className="flex items-center gap-4 rounded-2xl border border-[#1e1e30] bg-[#111317] p-4 transition-colors hover:border-[#232338]"
              >
                {/* Avatar */}
                <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff2e93]/20 to-[#ff8a56]/20">
                  {item.avatar ? (
                    <img src={proxyAvatar(item.avatar) ?? ""} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xl font-bold text-white/60">
                      {(item.name ?? item.username)[0].toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{item.name ?? item.username}</p>
                  <p className="text-sm text-[#626775]">@{item.username}</p>
                  {item.bio && (
                    <p className="mt-1 line-clamp-1 text-xs text-[#94a3b8]">{item.bio}</p>
                  )}
                  {tab === "friends" && item.friends_since && (
                    <p className="mt-1 text-xs text-[#626775]">
                      Bạn bè từ {timeSince(item.friends_since)}
                    </p>
                  )}
                  {(tab === "requests" || tab === "sent") && (
                    <p className="mt-1 text-xs text-[#626775]">
                      {timeAgo(item.created_at)}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0">
                  {tab === "friends" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleMessage(item.user_id)}
                        className="rounded-xl border border-[#232338] bg-white/5 px-4 py-2 text-xs font-semibold text-[#94a3b8] hover:bg-white/10 hover:text-white"
                      >
                        Nhắn tin
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                      >
                        Xóa bạn
                      </button>
                    </>
                  )}
                  {tab === "requests" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDecline(item.id)}
                        className="rounded-xl border border-[#232338] bg-white/5 px-4 py-2 text-xs font-semibold text-[#94a3b8] hover:bg-white/10 hover:text-white"
                      >
                        Từ chối
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccept(item.id)}
                        className="rounded-xl px-4 py-2 text-xs font-bold text-white"
                        style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
                      >
                        Chấp nhận
                      </button>
                    </>
                  )}
                  {tab === "sent" && (
                    <button
                      type="button"
                      onClick={() => handleCancelSent(item.id)}
                      className="rounded-xl border border-[#232338] bg-white/5 px-4 py-2 text-xs font-semibold text-[#94a3b8] hover:bg-white/10 hover:text-white"
                    >
                      Hủy lời mời
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
