"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

interface RadarUser {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  isOnline: boolean;
  origin: "friend" | "active" | "stranger";
  points: number;
}

interface EncounterUser {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  isOnline: boolean;
}

interface TodayEncounter {
  id: string;
  pickedAt: number;
  viewed: boolean;
  dismissed: boolean;
  note: string | null;
  user: EncounterUser;
  points: number;
  daysSince: number;
}

interface EncounterHistoryRow {
  id: string;
  pickedAt: number;
  viewed: boolean;
  dismissed: boolean;
  user: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
}

interface VaultStats {
  total: number;
  thisWeek: number;
  positiveRatio: number;
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

function dayLabel(pickedAt: number): string {
  const delta = Math.floor(Date.now() / 1000 - pickedAt);
  if (delta < 60) return "Vừa chạm mặt";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút trước`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ trước`;
  return `${Math.floor(delta / 86400)} ngày trước`;
}

/** Place a radar pin at one of 6 fixed positions around the dial. The
 *  positions are deterministic per slot index so the layout stays
 *  stable across re-renders (avoiding jitter when a friend comes
 *  online mid-session). */
const RADAR_POSITIONS: Array<{
  left: string;
  top: string;
  size: number;
}> = [
  { left: "calc(50% - 36px)", top: "calc(50% - 28px)", size: 22 },
  { left: "calc(50% + 38px)", top: "calc(50% + 18px)", size: 20 },
  { left: "calc(50% - 18px)", top: "calc(50% + 48px)", size: 18 },
  { left: "calc(50% + 30px)", top: "calc(50% - 38px)", size: 17 },
  { left: "calc(50% - 50px)", top: "calc(50% + 12px)", size: 15 },
  { left: "calc(50% + 6px)", top: "calc(50% - 60px)", size: 14 },
];

const ORIGIN_LABEL: Record<RadarUser["origin"], string> = {
  friend: "Bạn bè",
  active: "Đang hoạt động",
  stranger: "Lạ",
};
const ORIGIN_CLS: Record<
  RadarUser["origin"],
  { ring: string; text: string }
> = {
  friend: {
    ring: "border-emerald-400",
    text: "bg-emerald-500/15 text-emerald-300",
  },
  active: {
    ring: "border-cyan-400",
    text: "bg-cyan-500/15 text-cyan-300",
  },
  stranger: {
    ring: "border-violet-400",
    text: "bg-violet-500/15 text-violet-300",
  },
};

export function DiaryRightPanel() {
  const router = useRouter();
  const [radarOn, setRadarOn] = useState(true);
  const [radarItems, setRadarItems] = useState<RadarUser[]>([]);
  const [radarLoading, setRadarLoading] = useState(true);
  const [onlineFriends, setOnlineFriends] = useState(0);

  const [today, setToday] = useState<TodayEncounter | null>(null);
  const [history, setHistory] = useState<EncounterHistoryRow[]>([]);
  const [encounterLoading, setEncounterLoading] = useState(true);
  const [encounterNote, setEncounterNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);
  const [mirrorPercent, setMirrorPercent] = useState(0);

  // ── Radar ─────────────────────────────────────────────────────────────
  const loadRadar = useCallback(async () => {
    setRadarLoading(true);
    try {
      const res = await fetch("/api/diary/radar", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<{
        items: RadarUser[];
        onlineFriends: number;
      }>(res);
      if (data?.items) setRadarItems(data.items);
      if (typeof data?.onlineFriends === "number") {
        setOnlineFriends(data.onlineFriends);
      }
    } finally {
      setRadarLoading(false);
    }
  }, []);

  // ── Encounters ────────────────────────────────────────────────────────
  const loadEncounters = useCallback(async () => {
    setEncounterLoading(true);
    try {
      const res = await fetch("/api/diary/encounters", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await safeJson<{
        today: TodayEncounter | null;
        history: EncounterHistoryRow[];
      }>(res);
      if (data) {
        setToday(data.today);
        setHistory(data.history ?? []);
        setEncounterNote(data.today?.note ?? "");
      }
    } finally {
      setEncounterLoading(false);
    }
  }, []);

  // ── Vault stats + closeness summary ───────────────────────────────────
  const loadSupporting = useCallback(async () => {
    try {
      const [vaultRes, closenessRes] = await Promise.all([
        fetch("/api/vault/notes", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/groups/closeness", {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
      ]);
      const vault = await safeJson<{ stats: VaultStats }>(vaultRes);
      if (vault?.stats) setVaultStats(vault.stats);

      if (closenessRes && closenessRes.ok) {
        const closenessData = await safeJson<{
          items: Array<{ points: number }>;
        }>(closenessRes);
        const points = (closenessData?.items ?? []).map((i) => i.points ?? 0);
        if (points.length > 0) {
          const avg = points.reduce((s, x) => s + x, 0) / points.length;
          setMirrorPercent(Math.round(avg));
        } else {
          setMirrorPercent(0);
        }
      }
    } catch (e) {
      console.error("[DiaryRightPanel load error]", e);
    }
  }, []);

  useEffect(() => {
    loadRadar();
    loadEncounters();
    loadSupporting();
  }, [loadRadar, loadEncounters, loadSupporting]);

  async function handleDismissEncounter() {
    if (!today) return;
    try {
      const res = await fetch("/api/diary/encounters", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss",
          encounterId: today.id,
        }),
      });
      const data = await safeJson<{ next: TodayEncounter | null }>(res);
      setToday(data?.next ?? null);
      setEncounterNote("");
      await loadEncounters();
    } catch (e) {
      console.error("[Encounter dismiss]", e);
    }
  }

  async function handleSaveNote() {
    if (!today) return;
    setSavingNote(true);
    try {
      await fetch("/api/diary/encounters", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "note",
          encounterId: today.id,
          note: encounterNote,
        }),
      });
    } finally {
      setSavingNote(false);
    }
  }

  const visibleRadar = radarOn
    ? radarItems
    : radarItems.map((u) => ({ ...u, isOnline: false }));

  return (
    <aside className="flex w-[330px] shrink-0 flex-col gap-4 overflow-y-auto min-h-0 max-h-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-1">
      {/* ── Ra khơi tìm bạn (radar) ─────────────────────────────────── */}
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

        <div className="relative flex h-[160px] w-full items-center justify-center overflow-hidden">
          <span className="absolute left-1/2 top-1/2 size-[140px] -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarOuter" size={140} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-[100px] -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarMid" size={100} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-[60px] -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarInner" size={60} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2">
            <Icon name="radarCenterDot" size={24} />
          </span>

          {radarLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-5 animate-spin rounded-full border-2 border-[#232338] border-t-cyan-400" />
            </div>
          ) : visibleRadar.length === 0 ? (
            <p className="absolute text-[11px] text-[#67678d]">
              Không tìm thấy ai trong vùng quét
            </p>
          ) : (
            visibleRadar.slice(0, 6).map((m, i) => {
              const pos = RADAR_POSITIONS[i % RADAR_POSITIONS.length];
              const name = m.name ?? m.username;
              const cls = ORIGIN_CLS[m.origin];
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => router.push(`/profile/${m.username}`)}
                  className={`absolute cursor-pointer overflow-hidden rounded-[11px] border-[1.5px] ${cls.ring} transition-transform hover:scale-110`}
                  style={{
                    left: pos.left,
                    top: pos.top,
                    width: pos.size,
                    height: pos.size,
                    opacity: radarOn && m.isOnline ? 1 : 0.5,
                    padding: 0,
                  }}
                  title={`${name} · ${ORIGIN_LABEL[m.origin]}${
                    m.isOnline ? " · online" : ""
                  } — mở hồ sơ`}
                >
                  {m.avatar ? (
                    <img
                      src={m.avatar}
                      alt={name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[10px] font-bold text-white">
                      {name[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
          <span>
            {radarLoading
              ? "Đang quét…"
              : `${onlineFriends} bạn · ${visibleRadar.length} mục tiêu`}
          </span>
          <button
            type="button"
            onClick={loadRadar}
            className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:bg-white/10"
          >
            Quét lại
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {visibleRadar.length === 0 ? (
            <p className="text-[12px] text-[#67678d]">
              Kết nối thêm bạn bè để radar nhộn nhịp hơn.
            </p>
          ) : (
            visibleRadar.slice(0, 4).map((m) => {
              const name = m.name ?? m.username;
              const cls = ORIGIN_CLS[m.origin];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => router.push(`/profile/${m.username}`)}
                  className="flex w-full items-center justify-between rounded-lg bg-[#171728] p-2.5 text-left transition-colors hover:bg-[#1d1d34]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={`size-8 overflow-hidden rounded-2xl border ${cls.ring}`}
                    >
                      {m.avatar ? (
                        <img
                          src={m.avatar}
                          alt={name}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[10px] font-bold text-white">
                          {name[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white">
                        {name}
                      </p>
                      <p className="text-[10px] text-[#94a3b8]">
                        @{m.username} · {m.isOnline ? "Online" : "Offline"}
                        {m.points > 0 ? ` · ${m.points}đ` : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${cls.text}`}
                  >
                    {ORIGIN_LABEL[m.origin]}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ── Chạm mặt bất ngờ ───────────────────────────────────────── */}
      <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-white">Chạm mặt bất ngờ</h3>
          {today && (
            <span className="flex items-center gap-1 rounded bg-[#2a171b] px-2 py-0.5 text-[11px] font-bold text-amber-300">
              <Icon name="zap" size={11} />
              {dayLabel(today.pickedAt)}
            </span>
          )}
        </div>

        {encounterLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="size-5 animate-spin rounded-full border-2 border-[#232338] border-t-amber-500" />
          </div>
        ) : today ? (
          <EncounterCard
            today={today}
            note={encounterNote}
            setNote={setEncounterNote}
            savingNote={savingNote}
            onSaveNote={handleSaveNote}
            onDismiss={handleDismissEncounter}
            onOpenProfile={() =>
              router.push(`/profile/${today.user.username}`)
            }
          />
        ) : (
          <p className="text-[12px] text-[#67678d]">
            Chưa có dữ liệu để chọn encounter hôm nay.
          </p>
        )}

        {history.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-[#232338] pt-2">
            <p className="text-[10px] font-bold uppercase text-[#67678d]">
              Lịch sử
            </p>
            {history.slice(0, 4).map((h) => {
              const name = h.user.name ?? h.user.username;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => router.push(`/profile/${h.user.username}`)}
                  className="flex w-full items-center gap-2 rounded-lg border border-[#232338] bg-[#11121a] p-2 text-left transition-colors hover:bg-[#1d1d34]"
                >
                  <SafeAvatar
                    src={h.user.avatar}
                    name={name}
                    className="size-7"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-white">
                      {name}
                    </p>
                    <p className="text-[10px] text-[#67678d]">
                      @{h.user.username} · {dayLabel(h.pickedAt)}
                      {h.dismissed ? " · đã bỏ qua" : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Hộp bí mật (link-out) ────────────────────────────────────── */}
      <section className="flex w-full flex-col gap-2.5 rounded-2xl border border-[#3a3366] bg-[rgba(19,19,31,0.7)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center gap-2">
          <Icon name="shieldAlert" size={16} />
          <h3 className="text-[15px] font-bold text-white">Hộp bí mật</h3>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[#e2e8f0]">
            Mood Dump — Chỉ mình bạn thấy
          </p>
          <p className="text-[11px] text-[#9b51e0]">
            {vaultStats
              ? `${vaultStats.thisWeek} ghi chú mới lưu trữ bảo mật`
              : "Đang tải..."}
          </p>
        </div>
      </section>

      {/* ── Gương vô hình ─────────────────────────────────────────────── */}
      <section className="flex w-full items-center gap-3 rounded-xl border border-cyan-400 bg-[rgba(20,20,36,0.94)] p-3.5 shadow-[0px_4px_12px_rgba(0,0,0,0.25)]">
        <div className="relative size-10 shrink-0">
          <span className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2">
            <Icon name="ringTrack" size={40} />
          </span>
          <span className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2">
            <Icon name="ringProgress" size={40} />
          </span>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-cyan-400">
            {mirrorPercent}%
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white">Gương vô hình</p>
          <p className="text-[11px] text-[#94a3b8]">
            Tương tác thêm để rõ nét chân dung bạn thân
          </p>
        </div>
      </section>
    </aside>
  );
}

// ─── Encounter card (today) ─────────────────────────────────────────────────

function EncounterCard({
  today,
  note,
  setNote,
  savingNote,
  onSaveNote,
  onDismiss,
  onOpenProfile,
}: {
  today: TodayEncounter;
  note: string;
  setNote: (s: string) => void;
  savingNote: boolean;
  onSaveNote: () => void;
  onDismiss: () => void;
  onOpenProfile: () => void;
}) {
  const name = today.user.name ?? today.user.username;
  const isFriend = today.daysSince > 0 || today.points > 0;

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-lg border border-[#9b51e0] bg-[#1c182a] p-3">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-white/5"
        title="Mở hồ sơ"
      >
        <div className="size-10 shrink-0 overflow-hidden rounded-2xl bg-[#c6c6c6]">
          {today.user.avatar ? (
            <img
              src={today.user.avatar}
              alt={name}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[11px] font-bold text-white">
              {name[0]?.toUpperCase() ?? "?"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white">
            {name}
          </p>
          <p className="truncate text-[11px] text-[#94a3b8]">
            @{today.user.username}
            {today.user.isOnline ? " · Đang online" : ""}
            {isFriend ? ` · ${today.points}đ` : " · Chưa kết nối"}
          </p>
        </div>
        <Icon name="arrowRight" size={14} className="text-[#626775]" />
      </button>

      {today.user.bio && (
        <p className="line-clamp-2 text-[11px] text-[#c4b5fd]">
          "{today.user.bio}"
        </p>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú nhanh về cuộc gặp (vd: gặp ở quán cà phê)…"
        rows={2}
        className="w-full resize-none rounded-lg border border-[#232338] bg-[#11121a] p-2 text-[11px] text-white placeholder:text-[#67678d] focus:border-violet-500/40 focus:outline-none"
        maxLength={500}
      />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSaveNote}
          disabled={savingNote}
          className="flex-1 rounded-lg bg-violet-500/15 px-3 py-1.5 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/25 disabled:opacity-60"
        >
          {savingNote ? "Đang lưu…" : "Lưu ghi chú"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-[#232338] px-3 py-1.5 text-[11px] font-semibold text-[#94a3b8] hover:bg-white/5"
          title="Bỏ qua — chọn người khác cho hôm nay"
        >
          Bỏ qua
        </button>
      </div>
    </div>
  );
}