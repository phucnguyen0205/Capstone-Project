"use client";

import { useCallback, useEffect, useState } from "react";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { Icon } from "@/components/ui/Icon";
import {
  type DiscoverPost,
  type PostsFilter,
} from "@/components/groups/discoverTypes";

interface DiscoverPostsProps {
  search: string;
  filter: PostsFilter;
  onFilterChange: (next: PostsFilter) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (username: string) => void;
}

const FILTERS: ReadonlyArray<{ key: PostsFilter; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "photos", label: "Có ảnh" },
];

/**
 * Posts grid for the Discover → Bài viết tab.
 *
 * Pulls from /api/posts/trending which already excludes group-scoped
 * posts and applies a 7-day engagement ranking. Each card shows the
 * first image (or a coloured fallback for text-only posts), the
 * caption, and engagement counters.
 */
export function DiscoverPosts({
  search,
  filter,
  onFilterChange,
  onOpenPost,
  onOpenProfile,
}: DiscoverPostsProps) {
  const [items, setItems] = useState<DiscoverPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The trending endpoint ignores `search` for v1 (would need a
      // /api/posts/search route to do it properly). Client-side
      // filtering on caption/username gives a good-enough experience
      // and keeps the API surface small.
      const res = await fetch(`/api/posts/trending?limit=50`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: DiscoverPost[] };
      setItems(Array.isArray(data?.items) ? data!.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items
    .filter((p) => {
      if (filter === "photos") return !!p.media_url;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.caption?.toLowerCase().includes(q) ||
        p.username?.toLowerCase().includes(q) ||
        p.author_name?.toLowerCase().includes(q)
      );
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Filter chips ── */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/5 px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                active
                  ? "bg-gradient-to-r from-cyan-400 to-violet-400 text-[#0c0918]"
                  : "border border-white/10 bg-white/5 text-[#94a3b8] hover:text-white"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {loading && (
          <span className="ml-auto shrink-0 text-[10px] text-[#94a3b8]">
            Đang tải…
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !loading && filtered.length === 0 ? (
          <EmptyState
            message={
              search
                ? `Không có bài viết nào khớp với "${search}".`
                : "Chưa có bài viết trending trong tuần này."
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                onOpenPost={() => onOpenPost(p.id)}
                onOpenProfile={() => onOpenProfile(p.username)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Card ────────────────────────────────────────────────────────────── */

function PostCard({
  post,
  onOpenPost,
  onOpenProfile,
}: {
  post: DiscoverPost;
  onOpenPost: () => void;
  onOpenProfile: () => void;
}) {
  const engagement =
    post.like_count + post.comment_count * 2 + post.save_count * 3 + post.share_count * 4;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] transition-colors hover:bg-white/[0.06]">
      <button
        type="button"
        onClick={onOpenPost}
        className="relative aspect-square w-full overflow-hidden"
      >
        {post.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.media_url}
            alt={post.caption ?? "Bài viết"}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 p-4 text-center text-[12px] text-white">
            <span className="line-clamp-4">{post.caption ?? "Bài viết"}</span>
          </div>
        )}
        {post.media_type && post.media_type !== "image" && (
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase text-white">
            {post.media_type}
          </span>
        )}
      </button>
      <div className="flex flex-col gap-1.5 p-2.5">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-1.5 text-left"
        >
          <SafeAvatar
            src={post.author_avatar}
            username={post.username}
            name={post.author_name}
            alt={post.username}
            imgClassName="size-full rounded-full object-cover"
            className="size-5 shrink-0 rounded-full"
          />
          <span className="truncate text-[10px] font-bold text-white">
            {post.author_name ?? post.username}
          </span>
        </button>
        {post.caption && (
          <p className="line-clamp-2 text-[10px] text-[#cbd5e1]">
            {post.caption}
          </p>
        )}
        <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
          <span className="inline-flex items-center gap-0.5">
            <Icon name="heart" size={10} />
            {post.like_count}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Icon name="messageCircle" size={10} />
            {post.comment_count}
          </span>
          <span className="font-bold text-cyan-300">
            {engagement > 1000 ? `${(engagement / 1000).toFixed(1)}k` : engagement}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Empty / error states ────────────────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/5 text-[#94a3b8]">
          <Icon name="layoutGrid" size={26} />
        </div>
        <p className="text-[11px] text-[#94a3b8]">{message}</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <Icon name="shieldAlert" size={26} />
        </div>
        <p className="text-[13px] font-semibold text-white">Đã có lỗi</p>
        <p className="mt-1 text-[11px] text-[#94a3b8]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 px-4 py-1.5 text-[11px] font-bold text-[#0c0918]"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}