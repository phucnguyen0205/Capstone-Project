/**
 * Shared types + helpers for the Discover page.
 *
 * The Discover page surfaces four tabs (For You, People, Video, Groups)
 * plus a Posts grid (reels live on the Video tab). Each tab hits its
 * own API, but they share two concepts:
 *   1. A list of "items" (users / posts / groups / reels).
 *   2. A set of filter chips the viewer can toggle.
 *
 * These types let the parent panel pass the current selection down to
 * each tab without each tab owning its own copy of the state.
 */
import type { ReelItem } from "@/components/groups/ReelsPlayer";

/** Tabs on the Discover header (in display order, left→right). */
export type DiscoverTabKey =
  | "for-you"
  | "people"
  | "video"
  | "groups"
  | "posts";

export const DISCOVER_TABS: ReadonlyArray<{
  key: DiscoverTabKey;
  label: string;
  icon: "compass" | "users2" | "playCircle" | "video" | "layoutGrid";
}> = [
  { key: "for-you", label: "Dành cho bạn", icon: "compass" },
  { key: "people", label: "Mọi người", icon: "users2" },
  { key: "video", label: "Video", icon: "playCircle" },
  { key: "groups", label: "Nhóm", icon: "video" },
  { key: "posts", label: "Bài viết", icon: "layoutGrid" },
] as const;

/**
 * Sub-filter inside a tab.
 *   people:  all | online | nearby | new
 *   video:   all | mine        (renamed: "Khám phá" / "Thư viện của bạn")
 *   posts:   all | photos      (text-only posts hidden for v1)
 *   groups:  (no sub-filter; search-only)
 *   for-you: (no sub-filter; AI ranking already does the work)
 */
export type PeopleFilter = "all" | "online" | "nearby" | "new";
export type VideoFilter = "all" | "mine";
export type PostsFilter = "all" | "photos";

export interface DiscoverFilters {
  people: PeopleFilter;
  video: VideoFilter;
  posts: PostsFilter;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  people: "all",
  video: "all",
  posts: "all",
};

/* ─── Cross-tab payload types ─────────────────────────────────────────── */

export interface DiscoverPerson {
  id: string;
  name: string | null;
  username: string;
  avatar: string | null;
  bio: string | null;
  age: number;
  compatibility: number;
  compatibilityTier: string;
  compatibilityReasons: string[];
  distance: string;
  online: boolean;
  presenceLabel: string;
  dotColor: "gray" | "muted" | "green";
  mutualFriends: number;
  hobbies: string | null;
  occupation: string | null;
  city: string | null;
  country: string | null;
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

export interface DiscoverPost {
  id: string;
  user_id: string;
  media_url: string | null;
  media_type: string | null;
  caption: string | null;
  lens: string;
  created_at: number;
  author_name: string | null;
  author_avatar: string | null;
  username: string;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
}

/* ─── Re-export ReelItem so panels can `import type { ReelItem } from
 * '@/components/groups/discoverTypes'` without reaching into ReelsPlayer.
 * ─────────────────────────────────────────────────────────────────────── */
export type { ReelItem };

/* ─── LocalStorage helpers for "dismissed" sets ───────────────────────── */

/** Key for "I've already seen / dismissed this reel". Persists across
 * sessions so the user doesn't keep seeing the same content surface. */
export const DISMISSED_REELS_KEY = "discover.dismissedReels.v1";

export function loadDismissedReels(): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_REELS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function persistDismissedReels(ids: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DISMISSED_REELS_KEY,
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // Quota exceeded or disabled storage — silently ignore. The next
    // reload will simply re-show the reel, which is acceptable.
  }
}