"use client";

import { useState } from "react";
import { lensFilters, groupPosts } from "@/lib/groups-data";
import { Icon } from "@/components/ui/Icon";
import type { AssetKey } from "@/lib/assets";

const allLens = [
  "🌍 Công khai",
  "😄 Bè bạn ✓",
  "💜 Bạn thân",
];

export function GroupsFeed() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState("👁 Tất cả");

  return (
    <section className="flex h-full w-[540px] shrink-0 flex-col gap-4 overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2 rounded-[20px] bg-gradient-to-r from-violet-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0px_4px_6px_rgba(139,92,246,0.25)]"
        >
          <Icon name="camera" size={16} />
          <span>Đăng bài mới</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[20px] border border-[#232338] bg-white/5 px-3 py-2 text-[13px] font-semibold text-[#f1f1f7]"
          >
            <span>Mới nhất</span>
            <Icon name="chevronDown" size={14} />
          </button>

          <div className="flex gap-0.5 rounded-[10px] bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`flex items-center rounded p-1.5 ${
                view === "grid"
                  ? "border border-teal-500 bg-[#1d1d30]"
                  : ""
              }`}
              aria-label="Xem dạng lưới"
            >
              <Icon name="layoutGrid" size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className="flex items-center rounded p-1.5"
              aria-label="Xem dạng danh sách"
            >
              <Icon name="list" size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {lensFilters.map((item) => {
          const active = filter === item.label;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setFilter(item.label)}
              className={`rounded-[20px] border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-teal-500 bg-teal-500 font-semibold text-[#0c0c14]"
                  : "border-[#232338] bg-white/5 font-medium text-[#a5a5c7]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {groupPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

type PostCardProps = {
  post: (typeof groupPosts)[number];
};

function PostCard({ post }: PostCardProps) {
  return (
    <article className="flex w-full flex-col gap-3 rounded-2xl border border-violet-500/25 bg-[rgba(18,18,34,0.6)] p-4 backdrop-blur-[10px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative size-9 overflow-hidden rounded-[18px] border border-[#232338]">
            {post.avatar ? (
              <img
                src={`/assets/${post.avatar}`}
                alt={post.author}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full bg-[#c6c6c6]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#f1f1f7]">
                {post.author}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${post.tierBadgeClass}`}
              >
                {post.tierLabel}
              </span>
            </div>
            <p className="text-[11px] text-[#67678d]">{post.date}</p>
          </div>
        </div>
        <button type="button" aria-label="Tùy chọn">
          <Icon name="moreHorizontal" size={16} />
        </button>
      </div>

      <div className="flex gap-1">
        {allLens.map((label) => {
          const selected = label === post.selectedLens;
          return (
            <span
              key={label}
              className={`rounded-lg px-2.5 py-1 text-[11px] ${
                selected
                  ? "border border-teal-500 bg-[#1d1f2f] font-semibold text-teal-400"
                  : "text-[#a5a5c7]"
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>

      <MediaArea post={post} />

      {post.caption && (
        <p className="text-[13px] leading-[1.5] text-[#f1f1f7]">
          {post.caption}
        </p>
      )}

      <div className="flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-4 text-[#a5a5c7]">
          <span>❤️ {post.likes}</span>
          <span>💬 {post.comments}</span>
          <button
            type="button"
            className="flex items-center gap-1 hover:text-white"
          >
            <Icon name="share2" size={14} />
            <span>Chia sẻ</span>
          </button>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[#a5a5c7] hover:text-white"
        >
          <Icon name="bookmark" size={14} />
          <span>Lưu</span>
        </button>
      </div>

      <div className="flex items-center gap-1 text-[11px] text-[#67678d]">
        <Icon name="eye" size={12} />
        <span>{post.visibility} thành viên nhóm</span>
      </div>
    </article>
  );
}

function MediaArea({ post }: PostCardProps) {
  if (post.locked === "full") {
    return (
      <div className="flex h-[200px] w-full flex-col items-center justify-center gap-4 rounded-xl border border-[#232338] bg-[rgba(13,13,25,0.8)] p-6 backdrop-blur-[15px]">
        <div className="flex size-12 items-center justify-center rounded-3xl border border-violet-500/25 bg-violet-500/10">
          <Icon name="lockLarge" size={20} />
        </div>
        <p className="text-center text-sm font-bold text-[#f1f1f7]">
          Nội dung Cấp 4 — Chỉ bạn thân mới thấy
        </p>
        <button
          type="button"
          className="flex items-center gap-2 rounded-[20px] bg-gradient-to-r from-violet-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0px_4px_6px_rgba(139,92,246,0.25)]"
        >
          <Icon name="unlockKeyhole" size={16} />
          <span>Yêu cầu mở khóa</span>
        </button>
      </div>
    );
  }

  if (post.locked === "preview" && post.preview) {
    return (
      <div className="relative h-[240px] w-full overflow-hidden rounded-xl">
        <img
          src={`/assets/${post.image}`}
          alt={post.author}
          className="size-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 p-4 backdrop-blur-md">
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
            <Icon name="lockOverlay" size={14} />
            <span>Nội dung Cấp 3 — Thân thiết</span>
          </span>

          <div className="w-[260px]">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-white">
                Độ thân thiết: {post.preview.intimacy}%
              </span>
              <span className="font-semibold text-teal-400">Lv. 2</span>
            </div>
            <div className="relative h-1.5 w-full rounded-[3px] bg-white/15">
              <div className="h-full w-[67%] rounded-[3px] bg-gradient-to-r from-violet-500 to-teal-500" />
            </div>
          </div>

          <p className="text-[11px] text-white/80">
            Tương tác thêm {post.preview.interactionsLeft} lần để mở khóa hoàn
            toàn
          </p>

          <div className="flex items-center gap-1.5 rounded-md border border-[#232338] bg-black/65 px-2.5 py-1">
            <Icon name="eyePreview" size={12} />
            <span className="text-[10px] font-semibold text-[#a5a5c7]">
              Xem trước mờ
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[240px] w-full overflow-hidden rounded-xl">
      <img
        src={`/assets/${post.image}`}
        alt={post.author}
        className="size-full object-cover"
      />
    </div>
  );
}