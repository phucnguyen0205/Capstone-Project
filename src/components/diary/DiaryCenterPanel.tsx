"use client";

import { useState } from "react";
import { diaryPosts, privacyTiers } from "@/lib/diary-data";
import { Icon } from "@/components/ui/Icon";

const lensOptions = ["Công khai", "Bè bạn", "Bạn thân"];

export function DiaryCenterPanel() {
  const [activeTier, setActiveTier] = useState("Cấp 2");

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Nhật ký Đa ống kính</h2>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-[#9b51e0] px-4 py-2 text-[13px] font-semibold text-white"
          >
            <Icon name="plus" size={14} />
            <span>Đăng bài mới</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#94a3b8]">Xem theo cấp độ:</span>
          {privacyTiers.map((tier) => {
            const active = tier.label === activeTier;
            return (
              <button
                key={tier.label}
                type="button"
                onClick={() => setActiveTier(tier.label)}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-cyan-400 bg-cyan-400/15 font-bold text-cyan-400"
                    : "border-[#2c264c] bg-[#161622] font-medium text-[#94a3b8]"
                }`}
              >
                {tier.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {diaryPosts.map((post) => (
          <DiaryPost key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

function DiaryPost({ post }: { post: (typeof diaryPosts)[number] }) {
  if (post.lockedTier) {
    return (
      <article className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-5 backdrop-blur-[8px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#9b51e0]">
            🔒 NHÂN CÁCH CẤP 3+
          </span>
          <span className="text-[11px] text-[#64748b]">
            Đăng bởi {post.author}
          </span>
        </div>
        <div className="flex h-[120px] w-full flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-[#9b51e0] bg-[rgba(24,19,43,0.5)] p-5 backdrop-blur-[6px]">
          <div className="flex size-6 items-center justify-center">
            <Icon name="lockLarge" size={22} />
          </div>
          <p className="text-center text-sm font-semibold text-[#e2e8f0]">
            {post.caption}
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-5 backdrop-blur-[8px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {post.avatar ? (
            <img
              src="/assets/avatar-pic.png"
              alt={post.author}
              className="size-9 rounded-full object-cover"
            />
          ) : (
            <div className="size-9 rounded-[18px] bg-[#c6c6c6]" />
          )}
          <div>
            <p className="text-sm font-semibold text-white">{post.author}</p>
            <p className="text-[11px] text-[#64748b]">{post.time}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {lensOptions.map((label) => {
            const selected = label === post.selectedLens;
            return (
              <span
                key={label}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  selected
                    ? "border-[#9b51e0] bg-[#1d1e35] font-semibold text-white"
                    : "border-[#1c1c28] bg-[#0d0d14] font-medium text-[#94a3b8]"
                }`}
              >
                {label === "Bè bạn" ? `😄 ${label}` : `👁 ${label}`}
              </span>
            );
          })}
        </div>
      </div>

      {post.image && (
        <div className="relative h-[260px] w-full overflow-hidden rounded-xl border border-[#2c264c]">
          <img
            src="/assets/post-photo.png"
            alt={post.author}
            className="size-full object-cover"
          />
        </div>
      )}

      <p className="text-sm leading-[20px] text-[#e2e8f0]">{post.caption}</p>

      {post.blurred && (
        <div className="flex w-full items-center gap-2 rounded-lg border border-[#0e3042] bg-[#101b2b] p-2.5 text-xs text-[#e2e8f0]">
          <Icon name="eye" size={14} />
          <p>
            <span className="font-bold text-cyan-400">Gương vô hình: </span>
            Rõ nét sau 5 ngày tương tác tích cực.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-[#94a3b8]">
          <span className="flex items-center gap-1">
            <Icon name="heart" size={16} />
            {post.likes}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="messageSquare" size={16} />
            {post.comments}
          </span>
        </div>
        <Icon name="share2" size={16} />
      </div>
    </article>
  );
}