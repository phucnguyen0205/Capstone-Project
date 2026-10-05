"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface NotifActor {
  id: string;
  username: string | null;
  name: string | null;
  avatar: string | null;
}

export interface NotifItem {
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

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// sessionStorage key for the bell's most recent payload. We only use
// this as a *display* cache so the bell badge / dropdown have something
// to show on the very first render after F5 — the server is still the
// source of truth and we always re-fetch in the background to merge
// in any changes.
const CACHE_KEY = "notif-bell-cache:v1";
type Cached = { items: NotifItem[]; unreadCount: number; ts: number };
function readCache(): Cached | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeCache(items: NotifItem[], unreadCount: number) {
  if (typeof window === "undefined") return;
  try {
    const payload: Cached = { items, unreadCount, ts: Date.now() };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage might be full or disabled (private mode) — ignore.
  }
}

/**
 * Shared state + behaviour for the bell-shaped notification button used in
 * the global navbar and the groups sub-page header. Keeps the two headers
 * visually and behaviourally identical so the user never sees two different
 * bell badges for the same notifications.
 */
export function useNotificationBell(session: unknown) {
  // Always start empty so SSR and the first client render agree (no
  // hydration mismatch). After mount, if we have a sessionStorage cache
  // we apply it before the network fetch resolves so the user doesn't
  // see the bell blink to empty on F5.
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [open, setOpen] = useState(false);

  // Apply the sessionStorage cache exactly once on mount, before the
  // background fetch swaps in fresh server data.
  useEffect(() => {
    if (!session) return;
    const cached = readCache();
    if (!cached) return;
    setNotifs(cached.items);
    setUnreadCount(cached.unreadCount);
  }, [session]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=40", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<{ items: NotifItem[]; unreadCount: number }>(res);
      if (data && Array.isArray(data.items)) {
        setNotifs(data.items);
        setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
        writeCache(data.items, typeof data.unreadCount === "number" ? data.unreadCount : 0);
      }
    } catch {
      // ignore — keep previous state so the UI doesn't blink
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    load();
    const interval = setInterval(load, 12_000);
    const onReload = () => load();
    window.addEventListener("notifications:reload", onReload as EventListener);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("notifications:reload", onReload as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, [session, load]);

  // Keep the sessionStorage cache in sync with the live state so F5
  // always restores the most recent bell view. We skip the first write
  // to avoid clobbering the seed cache before the user has done anything.
  const seed = useRef(true);
  useEffect(() => {
    if (seed.current) {
      seed.current = false;
      return;
    }
    writeCache(notifs, unreadCount);
  }, [notifs, unreadCount]);

  const markAsRead = useCallback(
    async (notif: NotifItem) => {
      if (notif.read) return;
      setBusyId(notif.id);
      const previous = notifs;
      setNotifs((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await fetch(`/api/notifications/${notif.id}`, {
          method: "PATCH",
          credentials: "include",
        });
        if (!res.ok) throw new Error("bad status");
      } catch {
        setNotifs(previous);
        load();
      } finally {
        setBusyId(null);
      }
    },
    [notifs, load],
  );

  const deleteOne = useCallback(
    async (notif: NotifItem) => {
      setBusyId(notif.id);
      const previous = notifs;
      setNotifs((prev) => prev.filter((n) => n.id !== notif.id));
      if (!notif.read) setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await fetch(`/api/notifications/${notif.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("bad status");
      } catch {
        setNotifs(previous);
        load();
      } finally {
        setBusyId(null);
      }
    },
    [notifs, load],
  );

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch {
      load();
    } finally {
      setMarkingAll(false);
    }
  }, [unreadCount, load]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    notifs,
    unreadCount,
    loading,
    busyId,
    markingAll,
    open,
    toggle,
    close,
    markAsRead,
    deleteOne,
    markAllRead,
    reload: load,
  };
}
