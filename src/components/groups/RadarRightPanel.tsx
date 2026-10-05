"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";

interface Activity {
  id: string;
  type: "join" | "like" | "comment";
  actor: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
  content?: string;
  createdAt: number;
}

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
  return `${Math.floor(delta / 86400)} ngày trước`;
}

export function RadarRightPanel() {
  const [radius, setRadius] = useState(500);
  const [history, setHistory] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/groups/activity", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<Activity[]>(res);
      setHistory(Array.isArray(data) ? data.slice(0, 6) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute radar stats from real data
  const totalDetected = history.length;
  const matched = history.filter((h) => h.type === "join").length;
  const invites = history.filter((h) => h.type === "like").length;
  const newFriends = history.filter((h) => h.type === "join").length;

  return (
    <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-[#16162a] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Radar Stats */}
      <div className="border-b border-[#16162a] p-6">
        <h3 className="mb-4 text-sm font-semibold text-[#94a3b8]">Thống kê Radar</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Lượt phát hiện", value: totalDetected, sub: "gần đây" },
            { label: "Ghép cặp", value: matched, sub: "tuần này" },
            { label: "Lượt mời", value: invites, sub: "đã gửi" },
            { label: "Kết bạn mới", value: newFriends, sub: "tháng này" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-[#111317] p-3 text-center">
              <p className="text-xl font-bold text-white">{stat.value}</p>
              <p className="text-[10px] text-[#626775]">{stat.sub}</p>
              <p className="mt-0.5 text-xs text-[#94a3b8]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Radar Settings */}
      <div className="border-b border-[#16162a] p-6">
        <h3 className="mb-4 text-sm font-semibold text-[#94a3b8]">Cài đặt Radar</h3>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-[#94a3b8]">Bán kính tìm kiếm</span>
              <span className="text-sm font-semibold text-[#00f2fe]">{radius}m</span>
            </div>
            <input
              type="range"
              min={100}
              max={2000}
              step={100}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-[#00f2fe]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-[#626775]">
              <span>100m</span>
              <span>2km</span>
            </div>
          </div>
          {[
            { label: "Tần số cập nhật", value: "Mỗi 5 phút", icon: "clock" as const },
            { label: "Chế độ ẩn danh", value: "Tắt", icon: "eyeOff" as const },
            { label: "Phát hiện vị trí", value: "Tự động", icon: "globe" as const },
          ].map((setting) => (
            <div
              key={setting.label}
              className="flex items-center justify-between rounded-xl bg-[#111317] px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Icon name={setting.icon} size={14} className="text-[#626775]" />
                <span className="text-xs text-[#94a3b8]">{setting.label}</span>
              </div>
              <span className="text-xs font-medium text-white">{setting.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      <div className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-[#94a3b8]">Lịch sử phát hiện</h3>
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
            ))
          ) : history.length === 0 ? (
            <p className="text-[12px] text-[#626775]">Chưa có hoạt động nào.</p>
          ) : (
            history.map((act) => {
              const name = act.actor.name ?? act.actor.username;
              const showMatched = act.type === "join";
              return (
                <div
                  key={act.id}
                  className="flex items-center justify-between rounded-xl bg-[#111317] px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center overflow-hidden rounded-xl bg-white/5 text-sm font-semibold text-white">
                      {act.actor.avatar ? (
                        <img
                          src={act.actor.avatar}
                          alt={name}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        name[0]?.toUpperCase() ?? "?"
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white">{name}</p>
                      <p className="text-[10px] text-[#626775]">
                        {timeAgo(act.createdAt)}
                      </p>
                    </div>
                  </div>
                  {showMatched && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400">
                      <Icon name="heart" size={8} />
                      Mới
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}