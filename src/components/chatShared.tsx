"use client";

import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { Icon } from "@/components/ui/Icon";

/**
 * Shared types + helpers used by ChatListPanel, ChatModal, and ChatColumn.
 * Extracted so the three files don't duplicate type definitions or
 * avatar/presence rendering logic.
 */

export interface Message {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  senderId: string;
  conversationId: string;
  createdAt: Date;
}

export interface Participant {
  id: string;
  name: string | null;
  username: string;
  avatar: string | null;
  role?: "creator" | "admin" | "member" | null;
  nickname?: string | null;
}

export interface Conversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  name?: string | null;
  isGroup?: number;
  avatarUrl?: string | null;
  groupId?: string | null;
  participants: Participant[];
  lastMessage: Message | null;
  unreadCount: number;
}

export interface PresenceInfo {
  code: number;
  label: string;
  dotColor: "green" | "muted" | "gray";
  secondsAgo: number | null;
  isOnline: boolean;
}

export function PresenceDot({ presence, size = 3 }: { presence?: PresenceInfo; size?: 3 | 4 }) {
  if (!presence) return null;
  const sizeCls = size === 4 ? "size-4" : "size-3";
  const color =
    presence.dotColor === "green"
      ? "bg-emerald-400"
      : presence.dotColor === "muted"
        ? "bg-[#a0a5b5]"
        : "bg-[#3a3f4b]";
  const pulse = presence.code === 3;
  return (
    <span
      className={`relative inline-flex ${sizeCls} rounded-full border-2 border-[#111317] ${color}`}
      title={presence.label}
    >
      {pulse && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
    </span>
  );
}

/**
 * Stacked avatar — used for group conversations. Shows up to 3 overlapping
 * avatars; falls back to a `users2` icon when none have an image.
 */
export function GroupAvatar({
  participants,
  convName,
  size = 44,
}: {
  participants: Participant[];
  convName?: string | null;
  size?: number;
}) {
  const slice = participants.slice(0, 3);
  const half = Math.round(size / 2);
  const offsets = [
    { top: 0, left: 0 },
    { top: half, left: half },
    { top: 0, left: half },
  ];
  return (
    <div
      className="relative shrink-0 overflow-visible"
      style={{ width: size, height: size }}
    >
      <div className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-teal-500 text-[11px] font-bold text-white">
        <Icon name="users2" size={Math.round(size * 0.5)} />
      </div>
      {slice.map((p, idx) => (
        <div
          key={p.id}
          className="absolute size-[24px] overflow-hidden rounded-full border-2 border-[#111317] bg-[#2a2d37]"
          style={offsets[idx]}
        >
          <SafeAvatar
            src={p.avatar}
            alt=""
            name={p.name}
            username={p.username}
            className="size-full"
          />
        </div>
      ))}
    </div>
  );
}

export function formatTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 172800000) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
