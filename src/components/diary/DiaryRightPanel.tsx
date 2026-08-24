"use client";

import { useState } from "react";
import {
  mirrorProgress,
  radarMatches,
  recentEncounter,
  vaultInfo,
} from "@/lib/diary-data";
import { Icon } from "@/components/ui/Icon";

export function DiaryRightPanel() {
  const [radarOn, setRadarOn] = useState(true);

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-4">
      <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="compass" size={18} />
            <h2 className="text-[15px] font-bold text-white">Ra khơi tìm bạn</h2>
          </div>

          <button
            type="button"
            onClick={() => setRadarOn((prev) => !prev)}
            className="flex items-center gap-1.5"
            aria-pressed={radarOn}
          >
            <span className="text-[11px] font-bold text-cyan-400">
              {radarOn ? "ON" : "OFF"}
            </span>
            <span
              className={`relative h-4 w-7 rounded-full transition-colors ${
                radarOn ? "bg-cyan-400" : "bg-[#2a2d37]"
              }`}
            >
              <span
                className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${
                  radarOn ? "left-3.5" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </div>

        <div className="relative flex h-[140px] w-full items-center justify-center overflow-hidden">
          <span className="absolute left-1/2 top-1/2 size-[130px] -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarOuter" size={130} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-[90px] -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarMid" size={90} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-[50px] -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarInner" size={50} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarCenterDot" size={24} />
          </span>

          <span className="absolute left-[calc(50%-35px)] top-[calc(50%-25px)] size-[22px] overflow-hidden rounded-[11px] border-[1.5px] border-cyan-400">
            <img
              src="/assets/radar-user-1.png"
              alt="Match 1"
              className="size-full object-cover"
            />
          </span>
          <span className="absolute left-[calc(50%+40px)] top-[calc(50%+15px)] size-5 overflow-hidden rounded-[10px] border-[1.5px] border-cyan-400">
            <img
              src="/assets/radar-user-2.png"
              alt="Match 2"
              className="size-full object-cover"
            />
          </span>
          <span className="absolute left-[calc(50%-15px)] top-[calc(50%+45px)] size-[18px] overflow-hidden rounded-[9px] border border-cyan-400">
            <img
              src="/assets/radar-user-3.png"
              alt="Match 3"
              className="size-full object-cover"
            />
          </span>
        </div>

        <p className="text-center text-xs text-[#94a3b8]">
          Đang quét bán kính 200m...
        </p>

        <div className="flex flex-col gap-2">
          {radarMatches.map((match) => (
            <div
              key={match.name}
              className="flex w-full items-center justify-between rounded-lg bg-[#171728] p-2.5"
            >
              <div>
                <p className="text-[13px] font-semibold text-white">
                  {match.name} — {match.distance}
                </p>
                <p className={`text-[11px] ${match.affinityClass}`}>
                  {match.affinity}
                </p>
              </div>
              {match.canInvite && (
                <button
                  type="button"
                  className="rounded-md bg-cyan-400 px-2.5 py-1 text-[11px] font-bold text-[#09090f]"
                >
                  Rủ ngồi chung
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-white">Chạm mặt bất ngờ</h3>
          <span className="rounded bg-[#2a171b] px-2 py-0.5 text-[11px] font-bold text-[#fff2cc]">
            {recentEncounter.streak}
          </span>
        </div>

        <div className="flex w-full items-center gap-2.5 rounded-lg border border-[#9b51e0] bg-[#1c182a] p-2.5">
          <div className="size-8 shrink-0 overflow-hidden rounded-2xl bg-[#c6c6c6]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white">
              {recentEncounter.name}
            </p>
            <p className="truncate text-[11px] text-[#94a3b8]">
              {recentEncounter.location}
            </p>
          </div>
        </div>
      </section>

      <section className="flex w-full flex-col gap-2.5 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center gap-2">
          <Icon name="shieldAlert" size={16} />
          <h3 className="text-[15px] font-bold text-white">Hộp bí mật</h3>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[#e2e8f0]">
            {vaultInfo.title}
          </p>
          <p className="text-[11px] text-[#9b51e0]">{vaultInfo.subtitle}</p>
        </div>
      </section>

      <section className="flex w-full items-center gap-3 rounded-xl border border-cyan-400 bg-[rgba(20,20,36,0.94)] p-3.5 shadow-[0px_4px_12px_rgba(0,0,0,0.25)]">
        <div className="relative size-10 shrink-0">
          <span className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2">
            <Icon name="ringTrack" size={40} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2">
            <Icon name="ringProgress" size={40} />
          </span>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-cyan-400">
            {mirrorProgress.percent}%
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white">
            {mirrorProgress.title}
          </p>
          <p className="text-[11px] text-[#94a3b8]">
            {mirrorProgress.subtitle}
          </p>
        </div>
      </section>
    </aside>
  );
}