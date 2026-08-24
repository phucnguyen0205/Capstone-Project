"use client";

import { hiddenTraits, personas } from "@/lib/diary-data";
import { Icon } from "@/components/ui/Icon";

export function DiaryLeftPanel() {
  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-4">
      <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center gap-2">
          <Icon name="theater" size={18} />
          <h2 className="text-lg font-bold text-white">Đa nhân cách</h2>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className={`flex w-full flex-col gap-2 rounded-xl p-3.5 ${
                persona.active
                  ? "border border-cyan-400 bg-[#1e1e35]"
                  : "border border-[#2c264c] bg-[#131326]"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <h3 className="text-[15px] font-semibold text-white">
                  {persona.title}
                </h3>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${persona.badgeClass}`}
                >
                  {persona.badge}
                </span>
              </div>
              <p className="text-[13px] text-[#94a3b8]">
                {persona.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <h3 className="text-[15px] font-bold text-white">Nhãn tính cách ẩn</h3>

        <div className="flex flex-wrap gap-2">
          {hiddenTraits.map((trait) => (
            <span
              key={trait}
              className="flex items-center gap-1.5 rounded-full border border-[#2c264c] bg-[#1a192a] px-2.5 py-1.5 text-xs text-[#e2e8f0]"
            >
              <span>{trait}</span>
              <Icon name="lock" size={10} />
            </span>
          ))}
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-bold text-[#0d0d1a]"
          style={{
            backgroundImage:
              "linear-gradient(16deg, rgb(155, 81, 224) 33%, rgb(0, 242, 254) 100%)",
          }}
        >
          Trắc nghiệm tính cách
        </button>
      </section>
    </aside>
  );
}