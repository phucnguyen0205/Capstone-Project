"use client";

import Image from "next/image";
import { useState } from "react";
import { assets } from "@/lib/assets";
import { interests } from "@/lib/mock-data";
import { Icon } from "@/components/ui/Icon";

export function LeftColumn() {
  const [selectedInterests, setSelectedInterests] = useState(
    interests.map((item) => item.active),
  );

  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-4">
      <div className="flex w-full flex-col gap-3">
        <h2 className="text-lg font-extrabold text-white">Bạn bè mới</h2>
        <div className="flex w-full items-center gap-2 rounded-xl border border-[#242831] bg-[#171920] px-3 py-2.5">
          <Icon name="search" size={16} />
          <span className="flex-1 text-[13px] text-[#626775]">
            Tìm kiếm bạn bè...
          </span>
        </div>
      </div>

      <div className="relative flex h-[360px] w-full flex-col overflow-hidden rounded-[20px] shadow-[0px_8px_12px_rgba(0,0,0,0.38)]">
        <Image
          src={assets.thumb1}
          alt="Profile"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/35" />

        <div
          className="absolute left-4 top-4 rounded-full px-2.5 py-1"
          style={{
            backgroundImage:
              "linear-gradient(9deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
          }}
        >
          <span className="text-[11px] font-bold text-white">
            TƯƠNG THÍCH 96%
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4">
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-extrabold text-white">Name</p>
            <p className="text-lg font-medium text-white">22</p>
          </div>
          <div className="flex items-center gap-1">
            <Icon name="mapPin" size={12} />
            <p className="truncate text-xs text-[#a0a5b5]">
              Quận 1, TP. Hồ Chí Minh • Cách 3.2 km
            </p>
          </div>
          <p className="line-clamp-2 text-xs leading-[1.4] text-[#a0a5b5]">
            Thích nghe nhạc indie, nhâm nhi cafe vào ngày mưa. Tìm kiếm một tâm
            hồn đồng điệu ✨
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          className="flex size-14 items-center justify-center rounded-[28px] border border-white/8 bg-[#2a2d37] shadow-[0px_8px_12px_rgba(0,0,0,0.38)]"
          aria-label="Bỏ qua"
        >
          <Icon name="xCircle" size={24} />
        </button>
        <button
          type="button"
          className="flex size-12 items-center justify-center rounded-3xl shadow-[0px_8px_12px_rgba(0,0,0,0.38)]"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgb(0, 229, 255) 25%, rgb(0, 102, 255) 75%)",
          }}
          aria-label="Boost"
        >
          <Icon name="zap" size={20} />
        </button>
        <button
          type="button"
          className="flex size-14 items-center justify-center rounded-[28px] shadow-[0px_8px_12px_rgba(0,0,0,0.38)]"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
          }}
          aria-label="Thích"
        >
          <Icon name="heart" size={26} />
        </button>
      </div>

      <div className="w-full rounded-2xl border border-white/8 bg-[rgba(31,33,40,0.63)] p-4 backdrop-blur-[10px]">
        <p className="mb-4 text-sm font-bold text-white">Bộ lọc tìm kiếm</p>

        <div className="mb-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#a0a5b5]">Độ tuổi</span>
            <span className="font-bold text-white">18 - 25 tuổi</span>
          </div>
          <div className="relative h-1.5 w-full rounded-[3px] bg-[#2a2d37]">
            <div
              className="absolute inset-y-0 left-10 w-[180px] rounded-[3px]"
              style={{
                backgroundImage:
                  "linear-gradient(2deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
              }}
            />
            <span className="absolute -top-[5px] left-[34px] size-4">
              <Icon name="sliderThumb" size={16} />
            </span>
            <span className="absolute -top-[5px] left-[210px] size-4">
              <Icon name="sliderThumb" size={16} />
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#a0a5b5]">Sở thích</span>
          <div className="flex flex-wrap gap-2">
            {interests.map((item, index) => {
              const active = selectedInterests[index];

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() =>
                    setSelectedInterests((prev) =>
                      prev.map((value, i) => (i === index ? !value : value)),
                    )
                  }
                  className={`rounded-full px-2.5 py-1.5 text-xs font-medium text-white ${
                    active
                      ? ""
                      : "border border-white/8 bg-[#2a2d37]"
                  }`}
                  style={
                    active
                      ? {
                          backgroundImage:
                            "linear-gradient(20deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
                        }
                      : undefined
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
