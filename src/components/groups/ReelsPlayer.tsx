"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { ReelCommentsPanel } from "@/components/groups/ReelCommentsPanel";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface ReelItem {
  id: string;
  mediaUrl: string;
  mediaWidth: number | null;
  mediaHeight: number | null;
  caption: string | null;
  createdAt: number;
  lens: string;
  locked: boolean;
  distanceToUnlock: number;
  /**
   * Số điểm thân thiết (closeness) bạn đã có với tác giả. Chỉ có ý
   * nghĩa khi lens='close'. UI dùng để render "Bạn đã có X điểm"
   * trên thẻ khoá, đồng thời truyền vào logic mở khoá tự động khi
   * đạt ngưỡng.
   */
  myClosenessPoints: number;
  /**
   * Trạng thái kiểm duyệt ('approved' | 'pending' | 'rejected'). Khi
   * là 'pending', UI phủ một lớp "Đang chờ duyệt" để tác giả biết
   * video của họ chưa tới tay người xem khác.
   */
  moderationStatus?: string;
  author: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function timeAgo(unix: number): string {
  const delta = Math.floor(Date.now() / 1000 - unix);
  if (delta < 60) return "Vừa xong";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút trước`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ trước`;
  if (delta < 604800) return `${Math.floor(delta / 86400)} ngày trước`;
  return new Date(unix * 1000).toLocaleDateString("vi-VN");
}

/* ─── Reels Player (root) ──────────────────────────────────────────────── */

export function ReelsPlayer({
  items,
  myId,
  emptyHint,
  onItemReplaced,
  onActiveChange,
}: {
  items: ReelItem[];
  myId: string | null;
  emptyHint?: string;
  /**
   * Fired when a locked reel has just been unlocked (the player
   * fetched the media URL via /api/reels/[id]/unlock and got 200).
   * The parent replaces the locked entry with the unlocked one in
   * its own list so the unlocked reel stays in place if the user
   * swipes back to it.
   */
  onItemReplaced?: (next: ReelItem) => void;
  /**
   * Fired whenever the player scrolls to a new reel (the reel that's
   * at least 60% visible in the scroller). Used by the discover
   * page to sync the comments panel on the right column to the
   * currently playing video.
   */
  onActiveChange?: (item: ReelItem | null) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openCommentsFor, setOpenCommentsFor] = useState<ReelItem | null>(null);

  // ── Auto-advance: when the active reel ends, scroll to the next one
  // unless the user paused it manually. We track which reel is currently
  // looping and whether it was paused by a tap so the auto-next respects
  // the user's "pause" intent.
  const [pausedActive, setPausedActive] = useState(false);
  const handleActivePlayedEnd = useCallback(() => {
    if (pausedActive) return;
    setActiveIndex((curr) => Math.min(curr + 1, items.length - 1));
  }, [pausedActive, items.length]);

  // When the user swipes to a new reel, scroll the snap container so
  // the new reel comes into view. We do this on index change rather
  // than in the IntersectionObserver callback to avoid feedback loops.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-reel-slide][data-index="${activeIndex}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeIndex]);

  // Track which video is the "active" one as the user swipes up/down.
  // We rely on IntersectionObserver rather than scroll-end debounce
  // because the latter feels janky on short reels lists.
  //
  // NOTE: We do NOT depend on the `items` array itself — only on its
  // length. The parent filters/sorts the list on every keystroke and
  // that would otherwise tear down + re-create the observer, which
  // in turn remounts the <video> elements and forces the browser to
  // re-fetch + re-decode the media URL. We snapshot the active item
  // via a ref so the callback always reads the latest array without
  // needing it in the dep list.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index ?? "0");
            const nextItem = itemsRef.current[idx] ?? null;
            // Defer state writes out of the observer callback so we
            // don't trigger a "setState during render of another
            // component" warning when the parent (DiscoverMainPanel)
            // runs its own setState in `onActiveChange`. queueMicrotask
            // runs after the current event-loop tick but before the
            // browser paints, so the active slide still updates in
            // the same frame from the user's perspective.
            queueMicrotask(() => {
              setActiveIndex((curr) => {
                if (curr === idx) return curr;
                onActiveChangeRef.current?.(nextItem);
                return idx;
              });
            });
          }
        }
      },
      { root, threshold: [0, 0.6, 1] },
    );
    const slides = root.querySelectorAll<HTMLElement>("[data-reel-slide]");
    slides.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
    // Depend ONLY on items.length so the observer survives search /
    // filter re-renders that produce a new array reference but the
    // same slide set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-white/5">
            <Icon name="fileVideo" size={28} className="text-[#626775]" />
          </div>
          <p className="text-sm font-semibold text-white">
            Chưa có video nào
          </p>
          <p className="mt-1 max-w-xs text-[12px] text-[#94a3b8]">
            {emptyHint ??
              "Khi bạn bè đăng video, chúng sẽ xuất hiện ở đây để bạn xem."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollerRef}
        className="h-full snap-y snap-mandatory overflow-y-auto bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, idx) => (
          <MemoReelSlide
            key={item.id}
            item={item}
            index={idx}
            isActive={idx === activeIndex}
            myId={myId}
            onOpenComments={() => setOpenCommentsFor(item)}
            onUpdated={() => {
              // No-op for now: the parent (`DiscoverMainPanel`)
              // re-derives like/comment counts from the server
              // response. Earlier revisions called `updateReel`
              // here which flipped the active index and triggered
              // the autoplay effect on every keystroke of the
              // search box → every <video> restarted. The active
              // index is owned by the IntersectionObserver now.
            }}
            onUnlocked={(unlocked) => onItemReplaced?.(unlocked)}
            onPlayedEnd={idx === activeIndex ? handleActivePlayedEnd : undefined}
            onPauseChange={idx === activeIndex ? setPausedActive : undefined}
          />
        ))}
      </div>

      {openCommentsFor && (
        <ReelCommentsPanel
          postId={openCommentsFor.id}
          onClose={() => setOpenCommentsFor(null)}
          // We don't need the full comment list returned to the
          // player — the panel mutates counts via a callback. The
          // count update does NOT need to flip the active index; we
          // just no-op here. (Previously this called `updateReel`
          // which set the active index to the open comment's
          // position, triggering autoplay restart on every panel
          // close.)
          onCountChange={() => {}}
        />
      )}
    </>
  );
}

/* ─── Single Reel Slide ────────────────────────────────────────────────── */

function ReelSlide({
  item,
  index,
  isActive,
  myId,
  onOpenComments,
  onUpdated,
  onUnlocked,
}: {
  item: ReelItem;
  index: number;
  isActive: boolean;
  myId: string | null;
  onOpenComments: () => void;
  onUpdated: (next: Partial<ReelItem>) => void;
  /**
   * Fired after the slide's locked overlay successfully fetches the
   * media URL via /api/reels/[id]/unlock. The parent replaces the
   * reel in its list so the unlocked item survives a re-render.
   */
  onUnlocked?: (unlocked: ReelItem) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [pausedByTap, setPausedByTap] = useState(false);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [liked, setLiked] = useState(item.likedByMe);
  const [busyLike, setBusyLike] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentCount);

  // Reset local state when the user swipes to a different reel
  // (the component instance is reused thanks to virtualization
  // via the dataset index). This keeps the count chips from
  // lagging behind the server.
  useEffect(() => {
    setLikeCount(item.likeCount);
    setLiked(item.likedByMe);
    setCommentCount(item.commentCount);
  }, [item.id, item.likeCount, item.likedByMe, item.commentCount]);

  // Autoplay only the active slide. Inactive slides get
  // programmatically paused to free the decoder and avoid two
  // videos playing at once.
  //
  // IMPORTANT: We only restart playback when the `isActive` flag
  // actually flips, not on every render. If the parent re-renders
  // us with the same isActive value (e.g. because a sibling's
  // state changed), we leave the video element alone — otherwise
  // the browser would re-buffer the entire media URL on every
  // keystroke of the search box.
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const wasActive = isActiveRef.current;
    isActiveRef.current = isActive;
    if (isActive === wasActive) return;
    if (isActive && !item.locked) {
      v.currentTime = 0;
      const playPromise = v.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.catch(() => {
          // Autoplay was blocked — we don't surface an error UI
          // because most browsers allow muted autoplay. A user
          // tap (toggle pause) will retry.
        });
      }
    } else {
      v.pause();
    }
  }, [isActive, item.locked]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPausedByTap(false);
    } else {
      v.pause();
      setPausedByTap(true);
    }
  }, []);

  const toggleLike = useCallback(async () => {
    if (busyLike || !myId) return;
    // Optimistic update — the user sees the heart fill instantly.
    setLiked((prev) => !prev);
    setLikeCount((c) => (liked ? Math.max(0, c - 1) : c + 1));
    setBusyLike(true);
    try {
      const res = await fetch(`/api/posts/${item.id}/save`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "like" }),
      });
      if (!res.ok) {
        // Revert on failure
        setLiked((prev) => !prev);
        setLikeCount((c) => (liked ? Math.max(0, c - 1) : c + 1));
      }
    } catch {
      setLiked((prev) => !prev);
      setLikeCount((c) => (liked ? Math.max(0, c - 1) : c + 1));
    } finally {
      setBusyLike(false);
    }
    onUpdated({});
  }, [busyLike, myId, item.id, liked, onUpdated]);

  const authorName = item.author.name ?? `@${item.author.username}`;
  const isMine = myId === item.author.id;
  const aspect =
    item.mediaWidth && item.mediaHeight
      ? item.mediaWidth / item.mediaHeight
      : 9 / 16;

  return (
    <div
      data-reel-slide
      data-index={index}
      className="relative flex h-full w-full snap-start items-center justify-center bg-black"
    >
      {/* ── Video (or locked overlay) ───────────────────────────────── */}
      {!item.locked ? (
        <video
          ref={videoRef}
          src={item.mediaUrl}
          muted={muted}
          playsInline
          loop
          preload="metadata"
          onClick={togglePlay}
          className="max-h-full max-w-full object-contain"
          style={{ aspectRatio: aspect }}
        />
      ) : (
        <LockedReel
          item={item}
          aspect={aspect}
          onUnlocked={onUnlocked}
        />
      )}

      {/* Pause indicator */}
      {pausedByTap && !item.locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-black/40">
            <Icon name="playCircle" size={36} className="text-white" />
          </div>
        </div>
      )}

      {/* ── Right-side action column (TikTok / FB style) ───────────── */}
      <div className="pointer-events-none absolute inset-y-0 right-2 flex w-16 flex-col items-center justify-end gap-4 pb-24">
        <button
          type="button"
          onClick={toggleLike}
          className="pointer-events-auto flex flex-col items-center gap-1 text-white drop-shadow"
          aria-label={liked ? "Bỏ thích" : "Thích"}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
            <Icon
              name={liked ? "heartFilled" : "heart"}
              size={26}
              className={liked ? "text-[#ff2e93]" : "text-white"}
            />
          </div>
          <span className="text-[11px] font-bold drop-shadow">
            {likeCount}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenComments}
          className="pointer-events-auto flex flex-col items-center gap-1 text-white drop-shadow"
          aria-label="Bình luận"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
            <Icon name="messageCircle" size={26} className="text-white" />
          </div>
          <span className="text-[11px] font-bold drop-shadow">
            {commentCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.share) {
              navigator
                .share({
                  title: "Reel",
                  text: item.caption ?? "",
                  url: `${window.location.origin}/?post=${item.id}`,
                })
                .catch(() => {});
            } else if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(
                `${window.location.origin}/?post=${item.id}`,
              );
            }
          }}
          className="pointer-events-auto flex flex-col items-center gap-1 text-white drop-shadow"
          aria-label="Chia sẻ"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
            <Icon name="share2" size={22} className="text-white" />
          </div>
          <span className="text-[11px] font-bold drop-shadow">Chia sẻ</span>
        </button>

        <button
          type="button"
          onClick={toggleMute}
          className="pointer-events-auto flex flex-col items-center gap-1 text-white drop-shadow"
          aria-label={muted ? "Bật tiếng" : "Tắt tiếng"}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
            <Icon
              name={muted ? "micOff" : "mic"}
              size={18}
              className="text-white"
            />
          </div>
        </button>
      </div>

      {/* Pending moderation overlay. We render a soft amber chip on the
          top-left of the slide so the author can see this is their own
          upload waiting in the moderation queue. Non-owners never see
          pending videos because the explore endpoint filters those out. */}
      {item.moderationStatus === "pending" && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-amber-500/95 px-3 py-1 text-[10px] font-bold text-[#0c0918] shadow-lg">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#0c0918]/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#0c0918]" />
          </span>
          Đang chờ duyệt
        </div>
      )}

      {/* ── Bottom overlay: author + caption ───────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pb-6">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <SafeAvatar
                src={item.author.avatar}
                name={authorName}
                className="size-9"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-white drop-shadow">
                  {authorName}
                </p>
                <p className="truncate text-[10px] text-white/80">
                  @{item.author.username} · {timeAgo(item.createdAt)}
                </p>
              </div>
              {!isMine && !item.locked && (
                <button
                  type="button"
                  className="pointer-events-auto rounded-full bg-[#ff2e93] px-3 py-1 text-[11px] font-bold text-white"
                  // Following the existing social graph — this is a
                  // best-effort, no-op shortcut for v1. Full friend
                  // flow lives elsewhere.
                  onClick={() => {}}
                >
                  + Follow
                </button>
              )}
            </div>
            {item.caption && (
              <p className="mt-2 line-clamp-3 text-[12px] text-white/95 drop-shadow">
                {item.caption}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Locked reel (close-friends gate) ─────────────────────────────────── */

function LockedReel({
  item,
  aspect,
  onUnlocked,
}: {
  item: ReelItem;
  aspect: number;
  onUnlocked?: (unlocked: ReelItem) => void;
}) {
  // A blurred teaser + progress-to-unlock. The video URL is
  // intentionally not loaded for locked reels so we don't burn
  // bandwidth on content the viewer can't watch.
  //
  // The two "not unlocked yet" branches differ in copy:
  //   - distanceToUnlock > 0 AND myClosenessPoints === 0 → bạn chưa
  //     từng tương tác với tác giả (0 điểm).
  //   - distanceToUnlock > 0 AND myClosenessPoints > 0  → bạn đang
  //     trên đường tới ngưỡng, hiện progress.
  //   - distanceToUnlock === 0 → đã kết bạn nhưng chưa đủ điểm.
  const points = item.myClosenessPoints ?? 0;
  const distance = item.distanceToUnlock ?? 0;
  const total = points + distance;
  const progress = total > 0 ? Math.min(100, (points / total) * 100) : 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The unlock button only appears when the viewer *might* be able
  // to unlock now: friends-only lens = "Kết bạn để mở khoá" (we can't
  // resolve that here, so we hide the button), close lens with
  // distance === 0 → "Mở khoá ngay".
  const showUnlockButton = item.lens === "close" && distance === 0;

  const handleUnlock = useCallback(async () => {
    if (busy || !onUnlocked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels/${item.id}/unlock`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<{
        ok?: boolean;
        reel?: ReelItem;
        error?: string;
      }>(res);
      if (!res.ok || !data?.reel) {
        setError(data?.error ?? "Không mở khoá được");
        return;
      }
      onUnlocked({ ...item, ...data.reel, locked: false, distanceToUnlock: 0 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi mạng");
    } finally {
      setBusy(false);
    }
  }, [busy, item, onUnlocked]);

  return (
    <div
      className="relative flex h-full w-full items-center justify-center bg-gradient-to-b from-[#1a0d18] via-[#0c0c14] to-black"
      style={{ aspectRatio: aspect }}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Icon
          name="playCircle"
          size={120}
          className="text-white/10"
        />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-amber-500/40 bg-black/40">
          <Icon name="lockSmall" size={26} className="text-amber-300" />
        </div>
        <p className="text-sm font-bold text-white">Video bị khoá</p>
        <p className="max-w-xs text-[11px] text-white/70">
          {distance > 0 && points === 0
            ? `Hãy tương tác với @${item.author.username} để bắt đầu tích điểm thân thiết và mở khoá video này.`
            : distance > 0
              ? `Bạn cần thêm ${distance} điểm thân thiết với @${item.author.username} để mở khoá video này.`
              : `Bạn cần kết bạn với @${item.author.username} để xem video này.`}
        </p>
        {total > 0 && (
          <div className="w-full max-w-[260px]">
            <div className="mb-1 flex items-center justify-between text-[10px] text-white/70">
              <span>{points} điểm</span>
              <span>{total} điểm</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-pink-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        {showUnlockButton && (
          <button
            type="button"
            onClick={handleUnlock}
            disabled={busy}
            className="mt-2 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 px-4 py-2 text-[12px] font-bold text-[#1a0d18] shadow-lg transition-opacity"
          >
            <Icon name="unlockKeyhole" size={14} className="text-[#1a0d18]" />
            {busy ? "Đang mở khoá…" : "Mở khoá ngay"}
          </button>
        )}
        {error && (
          <p className="max-w-xs text-[10px] text-red-300">{error}</p>
        )}
      </div>
    </div>
  );
}

/* ─── ReelSlide memo ───────────────────────────────────────────────────
 * React.memo with a custom equality check. We deliberately compare
 * only the fields that affect the rendered output (NOT identity
 * of `item`) so a parent re-render that produces a new `items`
 * array reference (e.g. typing in the search box on /discover)
 * doesn't re-render every slide. The <video> DOM element survives
 * the skip — the browser keeps its decoded buffer and continues
 * playing instead of re-fetching the media URL.
 */
const MemoReelSlide = React.memo(ReelSlide, (prev, next) => {
  if (prev.index !== next.index) return false;
  if (prev.isActive !== next.isActive) return false;
  if (prev.myId !== next.myId) return false;
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.mediaUrl !== next.item.mediaUrl) return false;
  if (prev.item.locked !== next.item.locked) return false;
  if (prev.item.likeCount !== next.item.likeCount) return false;
  if (prev.item.likedByMe !== next.item.likedByMe) return false;
  if (prev.item.commentCount !== next.item.commentCount) return false;
  if (prev.item.moderationStatus !== next.item.moderationStatus) return false;
  if (prev.item.author.avatar !== next.item.author.avatar) return false;
  return true;
});
