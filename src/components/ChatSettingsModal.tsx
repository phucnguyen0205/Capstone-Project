"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { proxyAvatar } from "@/lib/avatar";
import {
  useChatSettings,
  getThemeId,
  getMuted,
  getPinned,
} from "@/lib/chatSettings";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface ChatTheme {
  id: string;
  label: string;
  /* Gradient for "my" bubble */
  bubbleGradient: string;
  /* Solid bg for "their" bubble */
  theirBubbleBg: string;
  theirBubbleText: string;
  /* Panel & message area */
  bg: string;
  /* Header, input bar */
  surface: string;
  /* Borders, dividers */
  border: string;
  /* Primary text (names, titles) */
  textPrimary: string;
  /* Secondary text (timestamps, subtitles) */
  textSecondary: string;
  /* Accent (unread badges, online dot) */
  accent: string;
}

/* ─── All 16 themes ─────────────────────────────────────────────────────── */

export const THEMES: ChatTheme[] = [
  {
    id: "pink-sunset",
    label: "Hoàng hôn hồng",
    bubbleGradient: "linear-gradient(135deg, #ff2e93 0%, #ff8a56 100%)",
    theirBubbleBg: "#2a1a2e",
    theirBubbleText: "#fce7f3",
    bg: "#0f0a14",
    surface: "#1a1225",
    border: "#2d1f3d",
    textPrimary: "#fce7f3",
    textSecondary: "#9f7aea",
    accent: "#ff2e93",
  },
  {
    id: "purple-cosmic",
    label: "Vũ trụ tím",
    bubbleGradient: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
    theirBubbleBg: "#1e1440",
    theirBubbleText: "#e9d5ff",
    bg: "#0c0918",
    surface: "#18102e",
    border: "#2e2060",
    textPrimary: "#e9d5ff",
    textSecondary: "#8b5cf6",
    accent: "#8b5cf6",
  },
  {
    id: "ocean-teal",
    label: "Đại dương xanh",
    bubbleGradient: "linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)",
    theirBubbleBg: "#0c2a35",
    theirBubbleText: "#cffafe",
    bg: "#061419",
    surface: "#0d2229",
    border: "#1a4050",
    textPrimary: "#cffafe",
    textSecondary: "#22d3ee",
    accent: "#06b6d4",
  },
  {
    id: "golden-sun",
    label: "Nắng vàng",
    bubbleGradient: "linear-gradient(135deg, #d97706 0%, #fbbf24 100%)",
    theirBubbleBg: "#2a1e08",
    theirBubbleText: "#fef3c7",
    bg: "#110e04",
    surface: "#1e1709",
    border: "#3d2e12",
    textPrimary: "#fef3c7",
    textSecondary: "#fbbf24",
    accent: "#f59e0b",
  },
  {
    id: "neon-cyber",
    label: "Cyber neon",
    bubbleGradient: "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
    theirBubbleBg: "#0c0a1f",
    theirBubbleText: "#e0e7ff",
    bg: "#06040f",
    surface: "#0d0b1e",
    border: "#1e1b40",
    textPrimary: "#e0e7ff",
    textSecondary: "#818cf8",
    accent: "#06b6d4",
  },
  {
    id: "mint-fresh",
    label: "Bạc hà tươi",
    bubbleGradient: "linear-gradient(135deg, #059669 0%, #34d399 100%)",
    theirBubbleBg: "#052e1a",
    theirBubbleText: "#d1fae5",
    bg: "#03120d",
    surface: "#052216",
    border: "#0a3d2a",
    textPrimary: "#d1fae5",
    textSecondary: "#6ee7b7",
    accent: "#10b981",
  },
  {
    id: "rose-gold",
    label: "Hồng gold",
    bubbleGradient: "linear-gradient(135deg, #e11d48 0%, #fb7185 100%)",
    theirBubbleBg: "#2a0a14",
    theirBubbleText: "#fecdd3",
    bg: "#110508",
    surface: "#1e0b10",
    border: "#3d1520",
    textPrimary: "#fecdd3",
    textSecondary: "#fb7185",
    accent: "#f43f5e",
  },
  {
    id: "lavender-dream",
    label: "Giấc mơ lavender",
    bubbleGradient: "linear-gradient(135deg, #7c3aed 0%, #c084fc 100%)",
    theirBubbleBg: "#f5f3ff",
    theirBubbleText: "#3b0764",
    bg: "#ede9fe",
    surface: "#faf8ff",
    border: "#ddd6fe",
    textPrimary: "#3b0764",
    textSecondary: "#7c3aed",
    accent: "#8b5cf6",
  },
  {
    id: "midnight-blue",
    label: "Đêm trong xanh",
    bubbleGradient: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
    theirBubbleBg: "#0c1a3a",
    theirBubbleText: "#dbeafe",
    bg: "#040a14",
    surface: "#0a1425",
    border: "#162d50",
    textPrimary: "#dbeafe",
    textSecondary: "#60a5fa",
    accent: "#3b82f6",
  },
  {
    id: "sunset-orange",
    label: "Hoàng hôn cam",
    bubbleGradient: "linear-gradient(135deg, #ea580c 0%, #fb923c 100%)",
    theirBubbleBg: "#2a1000",
    theirBubbleText: "#ffedd5",
    bg: "#110800",
    surface: "#1e0e00",
    border: "#3d1c00",
    textPrimary: "#ffedd5",
    textSecondary: "#fb923c",
    accent: "#f97316",
  },
  {
    id: "berry-purple",
    label: "Việt quất tím",
    bubbleGradient: "linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)",
    theirBubbleBg: "#1e0b40",
    theirBubbleText: "#ede9fe",
    bg: "#0c0618",
    surface: "#160b28",
    border: "#2a1560",
    textPrimary: "#ede9fe",
    textSecondary: "#a855f7",
    accent: "#a855f7",
  },
  {
    id: "spring-green",
    label: "Xuân xanh mướt",
    bubbleGradient: "linear-gradient(135deg, #047857 0%, #10b981 100%)",
    theirBubbleBg: "#022c22",
    theirBubbleText: "#d1fae5",
    bg: "#011510",
    surface: "#022018",
    border: "#044030",
    textPrimary: "#d1fae5",
    textSecondary: "#34d399",
    accent: "#10b981",
  },
  {
    id: "coral-reef",
    label: "San hô",
    bubbleGradient: "linear-gradient(135deg, #dc2626 0%, #fb7185 100%)",
    theirBubbleBg: "#2a0509",
    theirBubbleText: "#fecdd3",
    bg: "#110204",
    surface: "#1e0609",
    border: "#3d0d12",
    textPrimary: "#fecdd3",
    textSecondary: "#fb7185",
    accent: "#ef4444",
  },
  {
    id: "aurora",
    label: "Cực quang",
    bubbleGradient: "linear-gradient(135deg, #0d9488 0%, #22d3ee 0%, #a78bfa 50%, #f472b6 100%)",
    theirBubbleBg: "#0c1a20",
    theirBubbleText: "#e0f2fe",
    bg: "#04090e",
    surface: "#0a1318",
    border: "#14283a",
    textPrimary: "#e0f2fe",
    textSecondary: "#22d3ee",
    accent: "#14b8a6",
  },
  {
    id: "charcoal",
    label: "Than đá",
    bubbleGradient: "linear-gradient(135deg, #374151 0%, #6b7280 100%)",
    theirBubbleBg: "#1f2937",
    theirBubbleText: "#f3f4f6",
    bg: "#111827",
    surface: "#1f2937",
    border: "#374151",
    textPrimary: "#f3f4f6",
    textSecondary: "#9ca3af",
    accent: "#6b7280",
  },
  {
    id: "pure-white",
    label: "Trắng thuần",
    bubbleGradient: "linear-gradient(135deg, #93c5fd 0%, #c4b5fd 100%)",
    theirBubbleBg: "#f3f4f6",
    theirBubbleText: "#1f2937",
    bg: "#ffffff",
    surface: "#f9fafb",
    border: "#e5e7eb",
    textPrimary: "#111827",
    textSecondary: "#6b7280",
    accent: "#6366f1",
  },
];

type SettingsTab = "main" | "search" | "colors" | "media" | "files" | "block" | "report" | "members" | "rename";

/* ─── Main Component ────────────────────────────────────────────────────── */

export function ChatSettingsModal({
  conversationId,
  isGroup,
  conversationName,
  participants = [],
  onClose,
  onThemeChange,
  onMuteChange,
  onPinChange,
  onBlock,
  onReport,
}: {
  conversationId: string;
  isGroup: boolean;
  conversationName: string;
  participants?: { id: string; name: string | null; username: string; avatar: string | null }[];
  initialThemeId?: string;
  initialMuted?: boolean;
  initialPinned?: boolean;
  onClose: () => void;
  onThemeChange?: (themeId: string) => void;
  onMuteChange?: (muted: boolean) => void;
  onPinChange?: (pinned: boolean) => void;
  onBlock?: () => void;
  onReport?: () => void;
}) {
  /* Load persistent settings for this conversation */
  const {
    themeId: selectedTheme,
    muted,
    pinned,
    updateTheme,
    updateMuted,
    updatePinned,
  } = useChatSettings(conversationId);

  const [tab, setTab] = useState<SettingsTab>("main");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const currentTheme = THEMES.find((t) => t.id === selectedTheme) ?? THEMES[0];

  function toggleMute() {
    const next = !muted;
    updateMuted(next);
    onMuteChange?.(next);
  }

  function togglePin() {
    const next = !pinned;
    updatePinned(next);
    onPinChange?.(next);
  }

  function pickTheme(themeId: string) {
    updateTheme(themeId);
    onThemeChange?.(themeId);
  }

  async function searchMessages() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const r = await fetch(
        `/api/conversations/${conversationId}/messages?q=${encodeURIComponent(searchQuery)}`,
        { credentials: "include" }
      );
      const data = await r.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function submitBlock() {
    setShowBlockConfirm(false);
    onBlock?.();
    onClose();
  }

  async function submitReport() {
    if (!reportReason.trim()) return;
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReportForm(false);
      setReportSubmitted(false);
      setReportReason("");
    }, 1500);
  }

  /* ── Tab label ── */
  const tabLabel =
    tab === "main" ? "Cài đặt cuộc trò chuyện"
    : tab === "search" ? "Tìm kiếm tin nhắn"
    : tab === "colors" ? "Chủ đề màu sắc"
    : tab === "media" ? "Ảnh & Phương tiện"
    : tab === "files" ? "Tệp đính kèm"
    : tab === "rename" ? (isGroup ? "Đổi tên nhóm" : "Đổi tên hiển thị")
    : tab === "block" ? "Chặn người dùng"
    : tab === "report" ? "Báo cáo vi phạm"
    : "Thành viên nhóm";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-[#232338] bg-[#171920] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Tab bar ──────────────────────────────────────────── */}
        <div className="relative flex shrink-0 items-center border-b border-[#242831]">
          {tab !== "main" && (
            <button
              type="button"
              onClick={() => setTab("main")}
              className="z-10 flex size-10 shrink-0 items-center justify-center text-[#a0a5b5] hover:text-white"
              aria-label="Quay lại"
            >
              <Icon name="arrowLeft" size={16} />
            </button>
          )}
          <p className="min-w-0 flex-1 px-2 text-center text-[14px] font-bold text-white">
            {tabLabel}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-[#a0a5b5] hover:bg-white/5 hover:text-white"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={18} />
          </button>
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {tab === "main" && (
            <MainTab
              isGroup={isGroup}
              conversationName={conversationName}
              participants={participants}
              muted={muted}
              pinned={pinned}
              selectedThemeId={selectedTheme}
              selectedTheme={currentTheme}
              onToggleMute={toggleMute}
              onTogglePin={togglePin}
              onTab={setTab}
              onBlock={() => setShowBlockConfirm(true)}
              onReport={() => setShowReportForm(true)}
            />
          )}
          {tab === "search" && (
            <SearchTab
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchResults={searchResults}
              searchLoading={searchLoading}
              onSearch={searchMessages}
            />
          )}
          {tab === "colors" && (
            <ColorsTab
              themes={THEMES}
              selectedThemeId={selectedTheme}
              onPick={pickTheme}
            />
          )}
          {tab === "rename" && (
            <RenameTab
              conversationId={conversationId}
              isGroup={isGroup}
              currentName={conversationName}
              onSaved={(newName) => {
                onClose();
                if (typeof window !== "undefined") window.location.reload();
              }}
            />
          )}
          {tab === "media" && (
            <MediaTab conversationId={conversationId} />
          )}
          {tab === "files" && (
            <FilesTab conversationId={conversationId} />
          )}
          {tab === "members" && (
            <MembersTab participants={participants} />
          )}
          {tab === "block" && (
            <BlockTab
              conversationName={conversationName}
              onCancel={() => setTab("main")}
              onConfirm={submitBlock}
            />
          )}
          {tab === "report" && showReportForm && (
            <ReportTab
              reportReason={reportReason}
              setReportReason={setReportReason}
              submitted={reportSubmitted}
              onCancel={() => { setShowReportForm(false); setTab("main"); }}
              onSubmit={submitReport}
            />
          )}
        </div>
      </div>

      {/* ── Block confirmation overlay ──────────────────────────── */}
      {showBlockConfirm && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/80"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-4 rounded-2xl border border-[#232338] bg-[#1a1c25] p-5 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-red-500/20">
              <Icon name="lock" size={22} className="text-red-400" />
            </div>
            <h3 className="mb-1 text-[15px] font-bold text-white">Chặn {conversationName}?</h3>
            <p className="mb-4 text-[12px] text-[#a0a5b5]">
              Bạn sẽ không nhận được tin nhắn từ người này nữa.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowBlockConfirm(false)}
                className="flex-1 rounded-full border border-[#2a2d37] py-2 text-[12px] text-[#a0a5b5]"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={submitBlock}
                className="flex-1 rounded-full bg-red-500 py-2 text-[12px] font-bold text-white"
              >
                Chặn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Tab ───────────────────────────────────────────────────────────── */

function MainTab({
  isGroup,
  conversationName,
  participants = [],
  muted,
  pinned,
  selectedThemeId: _selectedThemeId,
  selectedTheme,
  onToggleMute,
  onTogglePin,
  onTab,
  onBlock,
  onReport,
}: {
  isGroup: boolean;
  conversationName: string;
  participants?: { id: string; name: string | null; username: string; avatar: string | null }[];
  muted: boolean;
  pinned: boolean;
  selectedThemeId: string;
  selectedTheme: ChatTheme;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onTab: (t: SettingsTab) => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  return (
    <div className="flex flex-col py-1">
      {/* Conversation label */}
      <div className="border-b border-[#242831] px-4 py-3">
        <p className="break-words text-[11px] text-[#626775]">
          Đang trò chuyện với{" "}
          <strong className="break-words text-white">{conversationName}</strong>
        </p>
      </div>

      {/* Search */}
      <SettingsRow icon="search" label="Tìm kiếm tin nhắn" onClick={() => onTab("search")} />

      {/* Rename */}
      <SettingsRow
        icon="edit"
        label={isGroup ? "Đổi tên nhóm" : "Đổi tên hiển thị"}
        onClick={() => onTab("rename")}
      />

      {/* Color theme */}
      <button
        type="button"
        onClick={() => onTab("colors")}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] text-white transition-colors hover:bg-white/5"
      >
        <Icon name="palette" size={16} className="shrink-0 text-[#a0a5b5]" />
        <div className="min-w-0 flex-1">
          <p className="break-words">Chủ đề màu sắc</p>
          <p className="break-words text-[11px] text-[#626775]">{selectedTheme.label}</p>
        </div>
        <div
          className="size-6 shrink-0 rounded-full"
          style={{ background: selectedTheme.bubbleGradient }}
        />
        <Icon name="arrowRight" size={14} className="shrink-0 text-[#626775]" />
      </button>

      {/* Mute toggle */}
      <SettingsRow
        icon="bell"
        label="Tắt thông báo"
        onClick={onToggleMute}
        trailing={
          <div
            className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${
              muted ? "bg-[#ff2e93]" : "bg-[#2a2d37]"
            }`}
            onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          >
            <div
              className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
                muted ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
        }
      />

      {/* Pin toggle */}
      <SettingsRow
        icon="bookmark"
        label={pinned ? "Bỏ ghim cuộc trò chuyện" : "Ghim cuộc trò chuyện"}
        onClick={onTogglePin}
        trailing={
          <div
            className={`flex items-center justify-center rounded-full p-1 ${
              pinned ? "text-[#ff2e93]" : "text-[#626775]"
            }`}
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          >
            <Icon name="bookmark" size={14} className={pinned ? "text-[#ff2e93]" : "text-[#626775]"} />
          </div>
        }
      />

      {/* Media */}
      <SettingsRow icon="fileVideo" label="Tệp & Phương tiện" onClick={() => onTab("media")} />

      {/* Group call */}
      {isGroup && (
        <SettingsRow icon="phoneCall" label="Gọi thoại nhóm" onClick={() => {}} />
      )}

      {/* Members */}
      {isGroup && (
        <SettingsRow
          icon="users2"
          label="Xem thành viên"
          onClick={() => onTab("members")}
          trailing={
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">
              {participants.length} người
            </span>
          }
        />
      )}

      <div className="my-1 h-px bg-[#242831]" />

      {/* Block */}
      {!isGroup && (
        <SettingsRow
          icon="lock"
          label="Chặn người dùng"
          onClick={onBlock}
          className="text-amber-400 hover:bg-amber-400/10"
        />
      )}

      {/* Report */}
      {!isGroup && (
        <SettingsRow
          icon="flag"
          label="Báo cáo vi phạm"
          onClick={onReport}
          className="text-red-400 hover:bg-red-400/10"
        />
      )}
    </div>
  );
}

/* ─── Colors Tab ────────────────────────────────────────────────────────── */

function ColorsTab({
  themes,
  selectedThemeId,
  onPick,
}: {
  themes: ChatTheme[];
  selectedThemeId: string;
  onPick: (id: string) => void;
}) {
  const current = themes.find((t) => t.id === selectedThemeId) ?? themes[0];
  const isDarkBg = isLight(current.bg) === false;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Preview */}
      <div
        className="flex flex-col gap-2 rounded-xl border p-4"
        style={{ background: current.bg, borderColor: current.border }}
      >
        <p className="text-[11px] font-semibold" style={{ color: current.textSecondary }}>
          XEM TRƯỚC
        </p>

        {/* Their bubble */}
        <div className="flex items-end gap-2">
          <div
            className="size-8 shrink-0 rounded-full"
            style={{ background: invertColor(current.theirBubbleBg) }}
          />
          <div
            className="inline-block max-w-[65%] rounded-2xl rounded-bl rounded-br rounded-tl px-3 py-2 text-[13px]"
            style={{
              background: current.theirBubbleBg,
              color: current.theirBubbleText,
            }}
          >
            Tin nhắn của họ
          </div>
        </div>

        {/* My bubble */}
        <div className="flex items-end justify-end gap-2">
          <div
            className="inline-block max-w-[65%] rounded-2xl rounded-bl rounded-br rounded-tr px-3 py-2 text-[13px] text-white"
            style={{ background: current.bubbleGradient }}
          >
            Tin nhắn của bạn
          </div>
        </div>
      </div>

      {/* Theme grid */}
      <div>
        <p className="mb-2 text-[11px] font-semibold text-[#626775]">
          CHỌN CHỦ ĐỀ ({themes.length} màu)
        </p>
        <div className="grid grid-cols-3 gap-2">
          {themes.map((theme) => {
            const isSelected = theme.id === selectedThemeId;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onPick(theme.id)}
                className={`flex flex-col items-center gap-1 rounded-xl p-2 transition-all ${
                  isSelected ? "bg-white/10 ring-2 ring-white/30" : "hover:bg-white/5"
                }`}
                title={theme.label}
              >
                <div
                  className="size-8 w-full rounded-full"
                  style={{ background: theme.bubbleGradient }}
                />
                <span
                  className="w-full truncate text-center text-[9px]"
                  style={{ color: isDarkBg ? theme.textSecondary : theme.textPrimary }}
                >
                  {theme.label.split(" ").slice(0, 2).join(" ")}
                </span>
                {isSelected && (
                  <span className="flex items-center justify-center text-emerald-400">
                    <Icon name="check" size={10} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function isLight(hexColor: string): boolean {
  const c = hexColor.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}

function invertColor(hexColor: string): string {
  const c = hexColor.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const ri = 255 - r;
  const gi = 255 - g;
  const bi = 255 - b;
  return `#${ri.toString(16).padStart(2, "0")}${gi.toString(16).padStart(2, "0")}${bi.toString(16).padStart(2, "0")}`;
}

/* ─── Search Tab ───────────────────────────────────────────────────────── */

function SearchTab({
  searchQuery,
  setSearchQuery,
  searchResults,
  searchLoading,
  onSearch,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchResults: any[];
  searchLoading: boolean;
  onSearch: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function formatTime(s: string) {
    const d = new Date(s);
    return d.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "numeric",
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 rounded-full border border-[#2a2d37] bg-[#232338] px-3 py-2">
        <Icon name="search" size={14} className="shrink-0 text-[#626775]" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Tìm tin nhắn..."
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-[#626775] hover:text-white"
            aria-label="Xoá"
          >
            <Icon name="circleX" size={12} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onSearch}
        disabled={!searchQuery.trim() || searchLoading}
        className="rounded-full bg-gradient-to-r from-[#ff2e93] to-[#ff8a56] py-2 text-[12px] font-bold text-white disabled:opacity-50"
      >
        {searchLoading ? "Đang tìm..." : "Tìm kiếm"}
      </button>

      <div className="flex flex-col gap-2">
        {searchLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
          </div>
        )}
        {!searchLoading && searchQuery && searchResults.length === 0 && (
          <p className="py-8 text-center text-[12px] text-[#626775]">
            Không tìm thấy tin nhắn nào
          </p>
        )}
        {searchResults.map((msg) => (
          <div
            key={msg.id}
            className="flex items-start gap-2 rounded-lg border border-[#242831] bg-[#0f1118] p-3"
          >
            <div className="size-7 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#ff2e93] to-[#ff8a56]">
              <div className="flex size-full items-center justify-center text-[10px] font-bold text-white">
                {(msg.senderId ?? "?")[0].toUpperCase()}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-[12px] text-white">{msg.content}</p>
              <p className="text-[10px] text-[#626775]">{formatTime(msg.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Media Tab ────────────────────────────────────────────────────────── */

function MediaTab({ conversationId }: { conversationId: string }) {
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/messages`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: any[]) => {
        const images = (Array.isArray(data) ? data : []).filter(
          (m) => m.mediaUrl && m.mediaType === "image"
        );
        setMedia(images);
      })
      .catch(() => setMedia([]))
      .finally(() => setLoading(false));
  }, [conversationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="gallery1" size={32} className="text-[#3a3f4b]" />
        <p className="text-[12px] text-[#626775]">Chưa có ảnh nào được chia sẻ</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[11px] font-semibold text-[#626775]">
        ẢNH & PHƯƠNG TIỆN ({media.length})
      </p>
      <div className="grid grid-cols-3 gap-1">
        {media.map((m) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={m.id}
            src={m.mediaUrl}
            alt=""
            className="aspect-square w-full rounded-lg object-cover"
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Block Tab ────────────────────────────────────────────────────────── */

function BlockTab({
  conversationName,
  onCancel,
  onConfirm,
}: {
  conversationName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-500/20">
        <Icon name="lock" size={28} className="text-amber-400" />
      </div>
      <div>
        <h3 className="text-[15px] font-bold text-white">
          Chặn @{conversationName}
        </h3>
        <p className="mt-1 text-[12px] text-[#a0a5b5]">
          Bạn sẽ không nhận được tin nhắn, cuộc gọi hay thông báo từ người này.
          <br />
          Cuộc trò chuyện sẽ bị ẩn khỏi danh sách.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-full bg-amber-500 py-2.5 text-[13px] font-bold text-white"
        >
          Xác nhận chặn
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-full border border-[#2a2d37] py-2.5 text-[13px] text-[#a0a5b5]"
        >
          Quay lại
        </button>
      </div>
    </div>
  );
}

/* ─── Report Tab ────────────────────────────────────────────────────────── */

function ReportTab({
  reportReason,
  setReportReason,
  submitted,
  onCancel,
  onSubmit,
}: {
  reportReason: string;
  setReportReason: (v: string) => void;
  submitted: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const reasons = [
    "Spam hoặc quảng cáo",
    "Nội dung không phù hợp",
    "Quấy rối hoặc lăng mạ",
    "Thông tin sai lệch",
    "Hành vi đáng ngờ",
    "Khác",
  ];

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/20">
          <Icon name="bell" size={28} className="text-emerald-400" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-white">Đã gửi báo cáo</h3>
          <p className="mt-1 text-[12px] text-[#a0a5b5]">
            Cảm ơn bạn. Chúng tôi sẽ xem xét và hành động trong thời gian sớm nhất.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-[12px] text-[#a0a5b5]">
        Chọn lý do báo cáo. Chúng tôi sẽ xem xét và hành động phù hợp.
      </p>
      <div className="flex flex-col gap-2">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReportReason(r)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[12px] transition-colors ${
              reportReason === r
                ? "border-red-500 bg-red-500/10 text-red-400"
                : "border-[#242831] bg-[#0f1118] text-[#a0a5b5] hover:bg-white/5"
            }`}
          >
            <div
              className={`size-4 shrink-0 rounded-full border ${
                reportReason === r ? "border-red-500 bg-red-500" : "border-[#3a3f4b]"
              }`}
            >
              {reportReason === r && (
                <div className="flex size-full items-center justify-center text-white">
                  <Icon name="check" size={10} />
                </div>
              )}
            </div>
            {r}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!reportReason}
          className="w-full rounded-full bg-red-500 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          Gửi báo cáo
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-full border border-[#2a2d37] py-2.5 text-[13px] text-[#a0a5b5]"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}

/* ─── Members Tab ────────────────────────────────────────────────────────── */

function MembersTab({
  participants = [],
}: {
  participants?: { id: string; name: string | null; username: string; avatar: string | null }[];
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = participants.filter(
    (p) =>
      !searchQuery ||
      (p.name ?? p.username).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-full border border-[#2a2d37] bg-[#232338] px-3 py-2">
        <Icon name="search" size={14} className="shrink-0 text-[#626775]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm thành viên..."
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="text-[#626775] hover:text-white">
            <Icon name="circleX" size={12} />
          </button>
        )}
      </div>

      {/* Count */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-[#626775]">
          THÀNH VIÊN ({filtered.length})
        </p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">
          {filtered.length} người
        </span>
      </div>

      {/* List */}
      <div className="flex flex-col gap-1">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-[#242831] bg-[#0f1118] px-3 py-2.5 transition-colors hover:bg-white/5"
          >
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#ff2e93] to-[#ff8a56]">
                {p.avatar ? (
                  <img src={proxyAvatar(p.avatar) ?? ""} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-white">
                    {(p.name ?? p.username)?.[0]?.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="break-words text-[13px] font-semibold text-white">
                {p.name ?? p.username}
              </p>
              <p className="break-words text-[11px] text-[#626775]">@{p.username}</p>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full bg-white/5 text-[#a0a5b5] transition-colors hover:bg-white/10 hover:text-white"
                title="Nhắn tin"
              >
                <Icon name="messageCircle" size={13} />
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[12px] text-[#626775]">Không tìm thấy thành viên</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Rename Tab ─────────────────────────────────────────────────────── */

function RenameTab({
  conversationId,
  isGroup,
  currentName,
  onSaved,
}: {
  conversationId: string;
  isGroup: boolean;
  currentName: string;
  onSaved: (newName: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Tên không được để trống");
      return;
    }
    if (trimmed.length > 60) {
      setError("Tên tối đa 60 ký tự");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Lưu thất bại");
      }
      setSuccess(true);
      setTimeout(() => onSaved(trimmed), 600);
    } catch (e: any) {
      setError(e?.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="mb-1 text-[12px] text-[#a0a5b5]">
          {isGroup
            ? "Đổi tên nhóm. Tất cả thành viên sẽ thấy tên mới."
            : "Đổi tên cuộc trò chuyện với người này. Chỉ bạn thấy."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-[#626775]">
          Tên cuộc trò chuyện
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Nhập tên..."
          className="w-full whitespace-normal break-words rounded-lg border border-[#2a2d37] bg-[#0f1118] px-3 py-2 text-[13px] text-white outline-none focus:border-[#ff2e93]"
        />
        <p className="text-right text-[10px] text-[#626775]">
          {name.length}/60
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          {error}
        </p>
      )}

      {success && (
        <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-400">
          <Icon name="check" size={11} />
          Đã lưu
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || !name.trim()}
        className="w-full rounded-full bg-gradient-to-r from-[#ff2e93] to-[#ff8a56] py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
      >
        {saving ? "Đang lưu..." : "Lưu thay đổi"}
      </button>
    </div>
  );
}

/* ─── Files Tab (non-image attachments) ────────────────────────────────── */

function FilesTab({ conversationId }: { conversationId: string }) {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/messages`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data: any[]) => {
        const attachments = (Array.isArray(data) ? data : []).filter(
          (m) => m.mediaUrl && m.mediaType && m.mediaType !== "image" && m.mediaType !== "video"
        );
        setFiles(attachments);
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [conversationId]);

  function formatTime(s: string) {
    const d = new Date(s);
    return d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" });
  }

  function fileNameFromUrl(url: string): string {
    try {
      const u = new URL(url);
        return decodeURIComponent(u.pathname.split("/").pop() || "file");
      } catch {
        return "file";
      }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="paperclip" size={32} className="text-[#3a3f4b]" />
        <p className="text-[12px] text-[#626775]">Chưa có tệp đính kèm nào</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[11px] font-semibold text-[#626775]">
        TỆP ĐÍNH KÈM ({files.length})
      </p>
      <div className="flex flex-col gap-2">
        {files.map((f) => (
          <a
            key={f.id}
            href={f.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 rounded-lg border border-[#242831] bg-[#0f1118] p-3 transition-colors hover:bg-white/5"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#171920]">
              <Icon name="paperclip" size={16} className="text-[#a0a5b5]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-all text-[12px] font-semibold text-white">
                {fileNameFromUrl(f.mediaUrl)}
              </p>
              <p className="text-[10px] text-[#626775]">{formatTime(f.createdAt)}</p>
            </div>
            <Icon name="arrowRight" size={14} className="shrink-0 text-[#626775]" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ─── Settings Row ─────────────────────────────────────────────────────── */

function SettingsRow({
  icon,
  label,
  onClick,
  trailing,
  className = "",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] text-white transition-colors hover:bg-white/5 ${className}`}
    >
      <Icon name={icon as any} size={16} className="shrink-0 text-[#a0a5b5]" />
      <span className="min-w-0 flex-1 whitespace-normal break-words">{label}</span>
      {trailing ?? (
        <Icon name="arrowRight" size={14} className="shrink-0 text-[#626775]" />
      )}
    </button>
  );
}
