"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

interface TierInfo {
  key: "public" | "friends" | "close" | "private";
  label: string;
  count: number;
}

type TierKey = "all" | TierInfo["key"];

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface UserProfile {
  hobbies: string | null;
  relationshipStatus: string | null;
  occupation: string | null;
  education: string | null;
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  single: "Đang FA",
  in_relationship: "Đang hẹn hò",
  married: "Đã kết hôn",
  complicated: "Tình cảm phức tạp",
};

const TIER_DESCRIPTIONS: Record<TierInfo["key"], string> = {
  public:
    "Những bài đăng chia sẻ với tất cả mọi người — không giới hạn đối tượng.",
  friends:
    "Bài đăng chỉ dành cho bạn bè hai chiều (đã follow lẫn nhau).",
  close:
    "Những khoảnh khắc riêng tư chỉ chia sẻ với thành viên trong nhóm thân thiết.",
  private: "Nhật ký cá nhân — chỉ bạn mới đọc được.",
};

const TIER_BADGE: Record<TierInfo["key"], { label: string; cls: string }> = {
  public: { label: "Mở rộng", cls: "bg-blue-500/10 text-blue-400" },
  friends: { label: "Vui vẻ", cls: "bg-emerald-500/10 text-emerald-400" },
  close: { label: "Bí mật", cls: "bg-violet-500/10 text-violet-400" },
  private: { label: "Chỉ mình", cls: "bg-rose-500/10 text-rose-400" },
};

interface DiaryLeftPanelProps {
  activeTier: TierKey;
  onSelectTier: (tier: TierKey) => void;
  refreshSignal?: number;
}

export function DiaryLeftPanel({
  activeTier,
  onSelectTier,
  refreshSignal = 0,
}: DiaryLeftPanelProps) {
  const router = useRouter();
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [tierRes, profileRes] = await Promise.all([
        fetch("/api/groups/tiers", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/users/me", {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
      ]);
      const tierData = await safeJson<{ tiers: TierInfo[] }>(tierRes);
      if (tierData?.tiers) setTiers(tierData.tiers);

      if (profileRes && profileRes.ok) {
        const profileData = await safeJson<UserProfile>(profileRes);
        if (profileData) setProfile(profileData);
      }
    } catch (e) {
      console.error("[DiaryLeftPanel load error]", e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  // Build personas dynamically from tier counts. Clicking one switches
  // the centre panel's lens filter (lifted state in DiaryDashboard).
  const personas = [
    {
      key: "all" as const,
      title: `Tất cả · ${tiers.reduce((s, t) => s + t.count, 0)} bài`,
      badge: { label: "Hỗn hợp", cls: "bg-cyan-500/10 text-cyan-400" },
      description: "Xem mọi cấp độ ống kính cùng lúc.",
    },
    ...tiers.map((t) => ({
      key: t.key,
      title: `${t.label.replace(/^Cấp \d+ — /, "")} · ${t.count} bài`,
      badge: TIER_BADGE[t.key],
      description: TIER_DESCRIPTIONS[t.key],
    })),
  ];

  // Build hidden traits from real profile data only — no placeholders.
  const hiddenTraits: string[] = [];
  if (
    profile?.relationshipStatus &&
    profile.relationshipStatus in RELATIONSHIP_LABEL
  ) {
    hiddenTraits.push(RELATIONSHIP_LABEL[profile.relationshipStatus]);
  }
  if (profile?.hobbies) {
    profile.hobbies
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 3)
      .forEach((h) => hiddenTraits.push(`Mê ${h}`));
  }
  if (profile?.occupation) hiddenTraits.push(profile.occupation);
  if (profile?.education) hiddenTraits.push(profile.education);

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-4 overflow-y-auto min-h-0 max-h-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-1">
      {/* Personas — clickable, synced with centre panel filter */}
      <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center gap-2">
          <Icon name="theater" size={18} />
          <h2 className="text-lg font-bold text-white">Đa nhân cách</h2>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          {personas.map((persona) => {
            const isActive = activeTier === persona.key;
            return (
              <button
                key={persona.key}
                type="button"
                onClick={() => onSelectTier(persona.key)}
                className={`flex w-full flex-col gap-2 rounded-xl p-3.5 text-left transition-all ${
                  isActive
                    ? "border border-cyan-400 bg-[#1e1e35]"
                    : "border border-[#2c264c] bg-[#131326] hover:border-[#3a3366] hover:bg-[#1a192c]"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-white">
                    {persona.title}
                  </h3>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${persona.badge.cls}`}
                  >
                    {persona.badge.label}
                  </span>
                </div>
                <p className="text-[12px] text-[#94a3b8]">
                  {persona.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Hidden traits (real profile data only) */}
      <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <h3 className="text-[15px] font-bold text-white">Nhãn tính cách ẩn</h3>

        <div className="flex flex-wrap gap-2">
          {hiddenTraits.length === 0 ? (
            <p className="text-[11px] text-[#67678d]">
              Hoàn thiện hồ sơ (sở thích, công việc, trạng thái) để hiển thị
              nhãn tính cách.
            </p>
          ) : (
            hiddenTraits.map((trait, i) => (
              <span
                key={`${trait}-${i}`}
                className="flex items-center gap-1.5 rounded-full border border-[#2c264c] bg-[#1a192a] px-2.5 py-1.5 text-xs text-[#e2e8f0]"
              >
                <span>{trait}</span>
                <Icon name="lock" size={10} />
              </span>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => router.push("/profile")}
          className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-bold text-[#0d0d1a] transition-transform active:scale-[0.98]"
          style={{
            backgroundImage:
              "linear-gradient(16deg, rgb(155, 81, 224) 33%, rgb(0, 242, 254) 100%)",
          }}
          title="Mở trang hồ sơ để hoàn thiện thông tin"
        >
          Hoàn thiện hồ sơ
        </button>
      </section>
    </aside>
  );
}