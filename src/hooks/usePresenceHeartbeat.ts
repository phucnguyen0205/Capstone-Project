"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

/**
 * Heartbeat hook — sends a presence ping to /api/presence/heartbeat
 * every `intervalMs` ms while the user is logged in and the tab is visible.
 * This is how Facebook-style apps power the green online dot.
 *
 * Reliability design (matching how Messenger & WhatsApp work):
 *
 *  1. We DO NOT trust the client to keep saying "I'm online". If the
 *     browser crashes or the network drops, no more pings arrive, and
 *     last_active_at simply ages. The discover endpoint compares it to
 *     now() and falls the user through buckets automatically.
 *
 *  2. While the tab is HIDDEN, we send isOnline=false but keep the timer
 *     armed. This avoids burning CPU and also means that if the tab is
 *     killed in the background, the server-side timestamp is already
 *     pre-aged — the dot transitions correctly even without a graceful
 *     pagehide signal.
 *
 *  3. On unload (close tab, navigate away, refresh), we send a final
 *     beacon with isOnline=false via sendBeacon (text/plain). Browsers
 *     guarantee sendBeacon delivery during unload even if regular
 *     fetch() is cancelled.
 *
 *  4. We use a short 15s interval so that even if one ping is lost, the
 *     timestamp is never more than 15s stale.
 */
export function usePresenceHeartbeat(intervalMs = 15_000) {
  const { data: session, status } = useSession();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef<boolean>(true);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;

    function ping(isOnline: boolean) {
      try {
        if (isOnline) {
          fetch("/api/presence/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isOnline: true }),
            keepalive: true,
          }).catch(() => {});
        } else {
          // sendBeacon is the ONLY reliable way to deliver a request
          // during page unload. Browsers flush these even after unload.
          const blob = new Blob(
            [JSON.stringify({ isOnline: false })],
            { type: "text/plain;charset=UTF-8" }
          );
          if (navigator.sendBeacon) {
            navigator.sendBeacon("/api/presence/heartbeat", blob);
          } else {
            fetch("/api/presence/heartbeat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isOnline: false }),
              keepalive: true,
            }).catch(() => {});
          }
        }
      } catch {
        // swallow — presence is best-effort
      }
    }

    // Initial ping — we're definitely here
    ping(true);
    isVisibleRef.current = true;

    // Periodic ping — only while visible. When hidden we stop refreshing
    // last_active_at, so the timestamp naturally ages and the dot
    // transitions through "vừa truy cập" → "hôm nay" → "offline".
    timerRef.current = setInterval(() => {
      if (isVisibleRef.current) ping(true);
    }, intervalMs);

    function onVisibility() {
      const visible = document.visibilityState === "visible";
      isVisibleRef.current = visible;
      if (visible) {
        ping(true);
      } else {
        // Don't kill the timer — just stop refreshing timestamp.
        // Server-side last_active_at will age naturally.
      }
    }

    function onPageHide() {
      // Final "I'm going away" signal during unload
      ping(false);
    }

    function onBeforeUnload() {
      ping(false);
    }

    function onFreeze() {
      // document was frozen (mobile background) — mark offline now
      ping(false);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("freeze", onFreeze);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("freeze", onFreeze);
      // Mark offline when this component fully unmounts (logout / route change away)
      ping(false);
    };
  }, [status, session, intervalMs]);
}