"use client";

import Image from "next/image";
import { useState } from "react";
import { assets } from "@/lib/assets";
import { trendingItems, videoActions } from "@/lib/mock-data";
import { Icon } from "@/components/ui/Icon";

const thumbMap = {
  thumb1: assets.thumb1,
  thumb2: assets.thumb2,
  thumb3: assets.thumb3,
  thumb4: assets.thumb4,
} as const;

export function FeedColumn() {
  const [activeTab, setActiveTab] = useState<"for-you" | "following">("for-you");

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-lg">
          <button
            type="button"
            onClick={() => setActiveTab("for-you")}
            className={
              activeTab === "for-you"
                ? "font-extrabold text-white"
                : "font-medium text-[#626775]"
            }
          >
            Dành cho bạn
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("following")}
            className={
              activeTab === "following"
                ? "font-extrabold text-white"
                : "font-medium text-[#626775]"
            }
          >
            Đang theo dõi
          </button>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-4 py-2"
          style={{
            backgroundImage:
              "linear-gradient(13deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
          }}
        >
          <Icon name="video" size={16} />
          <span className="text-[13px] font-bold text-white">Tải video lên</span>
        </button>
      </div>

      <div className="flex w-full items-center gap-4">
        <div className="relative flex h-[520px] min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/8 bg-[#171920]">
          <Image
            src={assets.videoThumbnail}
            alt="Video thumbnail"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/25" />

          <button
            type="button"
            className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[32px] bg-white/19 backdrop-blur-[10px]"
            aria-label="Phát video"
          >
            <Icon name="triangleRight" size={32} />
          </button>

          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2.5">
              <div className="size-10 shrink-0 rounded-[20px] bg-[#c6c6c6]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[15px] font-bold text-white">
                    @hoang_nam_acoustic
                  </p>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                    style={{
                      backgroundImage:
                        "linear-gradient(17deg, rgb(0, 229, 255) 25%, rgb(0, 102, 255) 75%)",
                    }}
                  >
                    Theo dõi
                  </span>
                </div>
                <p className="truncate text-[13px] text-[#a0a5b5]">
                  Chương trình đêm nhạc acoustic thu nhỏ tại nhà 🎸🎙️
                </p>
              </div>
            </div>
            <p className="text-[13px] leading-[1.4] text-[#a0a5b5]">
              Thử hát lại bản tình ca xưa cũ dưới góc nhìn mới...{" "}
              <span className="font-semibold text-[#00e5ff]">#acoustic</span>{" "}
              <span className="font-semibold text-[#00e5ff]">#vibehub</span>{" "}
              <span className="font-semibold text-[#00e5ff]">#xuhuong</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-4">
          {videoActions.map((action) => (
            <div key={action.label} className="flex flex-col items-center gap-1">
              <button
                type="button"
                className={`flex size-11 items-center justify-center rounded-[22px] ${
                  action.gradient
                    ? ""
                    : "border border-white/8 bg-[#2a2d37]"
                }`}
                style={
                  action.gradient
                    ? {
                        backgroundImage:
                          "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
                      }
                    : undefined
                }
                aria-label={action.label}
              >
                <Icon name={action.icon} size={20} />
              </button>
              <span className="text-[11px] font-bold text-[#a0a5b5]">
                {action.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <h3 className="text-sm font-extrabold text-white">Xu hướng & Vibe</h3>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {trendingItems.map((item) => (
            <article
              key={item.title}
              className="relative h-[110px] w-[140px] shrink-0 overflow-hidden rounded-xl border border-white/8 bg-[#171920]"
            >
              <Image
                src={thumbMap[item.image]}
                alt={item.title}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-0 flex flex-col justify-between p-2">
                <span className="w-fit rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  {item.views}
                </span>
                <p className="truncate text-[11px] font-bold text-white">
                  {item.title}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
