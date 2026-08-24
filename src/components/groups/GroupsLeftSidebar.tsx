"use client";

import { useState } from "react";
import {
  groupMembers,
  recentMembers,
  tierOptions,
} from "@/lib/groups-data";
import { Icon } from "@/components/ui/Icon";
import type { AssetKey } from "@/lib/assets";

export function GroupsLeftSidebar() {
  const [mirrorEnabled, setMirrorEnabled] = useState(true);

  return (
    <aside className="flex h-full w-[310px] shrink-0 flex-col gap-4 border-r border-[#232338] p-4">
      <section className="flex w-full flex-col gap-3 rounded-2xl border border-violet-500/25 bg-[rgba(18,18,34,0.6)] p-3 backdrop-blur-[10px]">
        <div className="flex items-center gap-2">
          <Icon name="circleX" size={16} />
          <h2 className="text-[13px] font-bold uppercase text-[#f1f1f7]">
            Nhóm riêng tư
          </h2>
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-[10px] border border-[#232338] bg-[#1c1c2e] p-2.5"
        >
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-violet-400" />
            <span className="text-sm font-semibold text-[#f1f1f7]">
              Hội bạn thân Đà Lạt
            </span>
          </div>
          <Icon name="chevronDown" size={14} />
        </button>

        <p className="text-xs text-[#67678d]">
          Quy mô: 8 thành viên · Sáng lập bởi bạn
        </p>

        <div className="grid grid-cols-4 gap-1.5">
          {groupMembers.map((member) => (
            <MemberAvatar
              key={member.name}
              name={member.name}
              online={member.online}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-violet-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0px_4px_6px_rgba(139,92,246,0.25)]"
          >
            <Icon name="plus" size={16} />
            <span>Thêm thành viên</span>
          </button>
          <p className="text-center text-[11px] text-[#67678d]">
            Chỉ thành viên được thêm mới xem được nội dung
          </p>
        </div>
      </section>

      <hr className="border-[#232338]" />

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-bold uppercase text-[#a5a5c7]">
          Cấp độ hiển thị
        </h3>
        <div className="flex flex-col gap-1.5">
          {tierOptions.map((tier) => {
            const active = tier.key === "friends";
            return (
              <button
                key={tier.key}
                type="button"
                className={`flex w-full items-center justify-between rounded-[10px] p-2.5 text-left text-[13px] transition-colors ${
                  active
                    ? "border border-violet-500 bg-[#1d1a30] font-semibold text-[#f1f1f7]"
                    : "border border-[#232338] bg-white/5 text-[#a5a5c7]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon name={tier.icon} size={16} />
                  <span>{tier.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#67678d]">
                    {tier.count} bài
                  </span>
                  <span className="size-3 rounded-full bg-violet-400/60" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex w-full flex-col gap-2.5 rounded-2xl border border-violet-500/25 bg-[rgba(18,18,34,0.6)] p-3 backdrop-blur-[10px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon name="eyeOff" size={16} />
            <h3 className="text-[13px] font-bold text-[#f1f1f7]">Gương vô hình</h3>
          </div>
          <button
            type="button"
            onClick={() => setMirrorEnabled((prev) => !prev)}
            className={`relative h-[18px] w-8 rounded-full transition-colors ${
              mirrorEnabled ? "bg-teal-500" : "bg-[#2a2d37]"
            }`}
            aria-pressed={mirrorEnabled}
            aria-label="Bật gương vô hình"
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
                mirrorEnabled ? "left-3.5" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <p className="text-[11px] text-[#a5a5c7]">Tự động làm mờ với người mới</p>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#67678d]">Thời gian mở khóa:</span>
            <span className="font-semibold text-teal-400">5 ngày</span>
          </div>
          <div className="relative h-1 w-full rounded-sm bg-[#1e1e2f]">
            <div className="h-full w-[55%] rounded-sm bg-teal-500" />
            <span className="absolute left-[53%] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-teal-500 bg-[#0c0c14]" />
          </div>
        </div>
      </section>
    </aside>
  );
}

function MemberAvatar({ name, online }: { name: string; online: boolean }) {
  return (
    <div className="flex w-12 flex-col items-center gap-1">
      <div className="relative size-8 overflow-hidden rounded-2xl border border-[#232338]">
        <div className="size-full bg-[#c6c6c6]" />
        {online && (
          <span className="absolute bottom-0 right-0 size-2.5">
            <Icon name="onlineIndicator" size={10} />
          </span>
        )}
      </div>
      <span
        className={`w-full truncate text-center text-[10px] ${
          online ? "text-[#a5a5c7]" : "text-[#67678d]"
        }`}
      >
        {name}
      </span>
    </div>
  );
}