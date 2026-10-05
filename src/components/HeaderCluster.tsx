"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserMenu, UserMenuButton, SignInButton } from "@/hooks/useUserMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { Icon } from "@/components/ui/Icon";
import {
  isChatColumnVisible,
  toggleChatColumn,
} from "@/lib/chatColumnVisible";

/**
 * The right-side icon cluster used by BOTH the global Navbar and the
 * /groups sub-page header so users see the exact same affordances on
 * every screen.
 *
 *  - chat toggle (only when signed in, mirrors unread badge count)
 *  - notification bell (only when signed in)
 *  - user menu / sign-in button
 *
 * Keeping this cluster in one component is the cheapest insurance
 * against the two surfaces drifting apart again.
 */
export function HeaderCluster() {
  const userMenu = useUserMenu();
  // Lazy-init from localStorage so the first paint reflects the
  // user's previous toggle (no visible flash when chat was hidden).
  const [chatVisible, setChatVisible] = useState<boolean>(() =>
    typeof window === "undefined" ? true : isChatColumnVisible(),
  );
  const [chatUnread, setChatUnread] = useState(0);

  // Sync chat visibility from the event bus + initial localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setChatVisible(isChatColumnVisible());
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ visible: boolean }>).detail;
      setChatVisible(detail.visible);
    };
    window.addEventListener("chat-toggle:state", onUpdate as EventListener);
    return () =>
      window.removeEventListener("chat-toggle:state", onUpdate as EventListener);
  }, []);

  // Poll unread message count for the badge.
  useEffect(() => {
    if (!userMenu.session) return;
    let cancelled = false;
    async function fetchUnread() {
      try {
        const res = await fetch("/api/conversations", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => [])) as unknown;
        if (!cancelled && Array.isArray(data)) {
          const total = (data as Array<{ unreadCount?: number }>).reduce(
            (s, c) => s + (c.unreadCount ?? 0),
            0,
          );
          setChatUnread(total);
        }
      } catch {
        /* ignore */
      }
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 7000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userMenu.session]);

  const handleChatToggle = useCallback(() => {
    userMenu.close();
    toggleChatColumn();
  }, [userMenu]);

  return (
    <div className="flex items-center gap-4">
      {/* Chat toggle */}
      {userMenu.session && (
        <button
          type="button"
          onClick={handleChatToggle}
          className={`relative flex size-10 items-center justify-center rounded-[20px] transition-colors ${
            chatVisible
              ? "bg-gradient-to-br from-[#ff2e93] to-[#ff8a56] text-white"
              : "bg-[#2a2d37] text-[#a0a5b5] hover:text-white"
          }`}
          aria-label={chatVisible ? "Ẩn khung chat" : "Hiện khung chat"}
          aria-pressed={chatVisible}
          title={chatVisible ? "Ẩn khung chat" : "Hiện khung chat"}
        >
          <Icon name="messageCircle" size={20} />
          {chatUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#ff2e93] text-[9px] font-bold text-white">
              {chatUnread > 9 ? "9+" : chatUnread}
            </span>
          )}
        </button>
      )}

      {/* Notification bell */}
      {userMenu.session && <NotificationBell />}

      {/* User menu */}
      {userMenu.session?.user ? (
        <UserMenuButton
          open={userMenu.open}
          onToggle={userMenu.toggle}
          displayName={userMenu.displayName}
          avatar={userMenu.avatar}
          initial={userMenu.initial}
        />
      ) : (
        <SignInButton />
      )}
    </div>
  );
}