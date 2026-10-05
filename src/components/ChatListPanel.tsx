"use client";

import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import {
  Participant,
  Conversation,
  PresenceInfo,
  GroupAvatar,
  PresenceDot,
  formatTime,
} from "./chatShared";

type TabKey = "personal" | "group";

/**
 * Danh sách cuộc trò chuyện (header + search + tabs + list).
 * Render bên trong `ChatColumn` — nhận toàn bộ state qua props.
 */
export function ChatListPanel({
  activeConv,
  setActiveConv,
  activeTab,
  setActiveTab,
  search,
  setSearch,
  searchResults,
  searchLoading,
  loadingConvs,
  myId,
  presenceMap,
  personalCount,
  groupCount,
  onStartConversation,
  filteredConversations,
}: {
  conversations: Conversation[];
  activeConv: Conversation | null;
  setActiveConv: (c: Conversation | null) => void;
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  search: string;
  setSearch: (s: string) => void;
  searchResults: Participant[];
  searchLoading: boolean;
  loadingConvs: boolean;
  myId: string;
  presenceMap: Record<string, PresenceInfo>;
  personalCount: number;
  groupCount: number;
  onStartConversation: (p: Participant) => void;
  filteredConversations: Conversation[];
}) {
  return (
    <>
      {/* Header + Search — sticky on top, never scrolls */}
      <div className="flex w-full shrink-0 flex-col gap-3 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-white">Tin nhắn</h2>
        </div>
        <div className="flex w-full items-center gap-2 rounded-xl border border-[#242831] bg-[#171920] px-3 py-2.5">
          <Icon name="search" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm hoặc bắt đầu cuộc trò chuyện..."
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
          />
        </div>

        {/* Tabs: Cá nhân | Nhóm */}
        <div className="flex w-full rounded-xl border border-[#242831] bg-[#171920] p-1">
          <button
            type="button"
            onClick={() => {
              if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              setActiveTab("personal");
              setActiveConv(null);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition-colors ${
              activeTab === "personal"
                ? "bg-gradient-to-r from-[#ff2e93] to-[#ff8a56] text-white"
                : "text-[#a0a5b5] hover:text-white"
            }`}
          >
            <Icon name="messageCircle" size={12} />
            Cá nhân
            {personalCount > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                  activeTab === "personal" ? "bg-white/25" : "bg-[#2a2d37]"
                }`}
              >
                {personalCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              setActiveTab("group");
              setActiveConv(null);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition-colors ${
              activeTab === "group"
                ? "bg-gradient-to-r from-violet-500 to-teal-500 text-white"
                : "text-[#a0a5b5] hover:text-white"
            }`}
          >
            <Icon name="users2" size={12} />
            Nhóm
            {groupCount > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                  activeTab === "group" ? "bg-white/25" : "bg-[#2a2d37]"
                }`}
              >
                {groupCount}
              </span>
            )}
          </button>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="rounded-xl border border-[#242831] bg-[#171920] py-2">
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => onStartConversation(u)}
                className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-white/5"
              >
                <div className="size-9 shrink-0 overflow-hidden rounded-full">
                  <SafeAvatar
                    src={u.avatar}
                    alt=""
                    name={u.name}
                    username={u.username}
                    className="size-full"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-white">{u.name ?? u.username}</p>
                  <p className="truncate text-[11px] text-[#626775]">@{u.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {searchLoading && <p className="text-[12px] text-[#626775]">Đang tìm...</p>}
      </div>

      {/* Conversation list — scrolls independently */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {loadingConvs ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#232338] border-t-[#ff2e93]" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <Icon name={activeTab === "group" ? "users2" : "messageCircle"} size={32} />
            <p className="text-[13px] text-[#626775]">
              {activeTab === "group"
                ? "Chưa có nhóm chat nào"
                : "Chưa có cuộc trò chuyện nào"}
            </p>
            <p className="text-[12px] text-[#626775]">
              {activeTab === "group"
                ? "Mời bạn bè vào nhóm để bắt đầu"
                : "Tìm người dùng để bắt đầu"}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isGroup = conv.isGroup === 1;
            const other = !isGroup
              ? conv.participants.find((p) => p.id !== myId)
              : undefined;
            const otherPresence = other ? presenceMap[other.id] : undefined;
            const displayName = isGroup
              ? (conv.name ?? "Nhóm")
              : (other?.name ?? other?.username ?? "Người dùng");

            return (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                  activeConv?.id === conv.id ? "bg-white/5" : "hover:bg-white/5"
                }`}
              >
                <div className="relative shrink-0">
                  {isGroup ? (
                    <GroupAvatar
                      participants={conv.participants}
                      convName={conv.name}
                      size={44}
                    />
                  ) : (
                    <>
                      <div className="size-11 overflow-hidden rounded-full">
                        <SafeAvatar
                          src={other?.avatar}
                          alt=""
                          name={other?.name}
                          username={other?.username}
                          className="size-full"
                        />
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <PresenceDot presence={otherPresence} />
                      </span>
                    </>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white">
                      {displayName}
                      {isGroup && (
                        <span className="ml-1 text-[10px] font-normal text-[#67678d]">
                          · {conv.participants.length} người
                        </span>
                      )}
                    </p>
                    <span className="shrink-0 text-[11px] text-[#626775]">
                      {conv.lastMessage ? formatTime((conv.lastMessage as any).createdAt) : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] text-[#a0a5b5]">
                      {(conv.lastMessage as any)?.content ?? "Bắt đầu cuộc trò chuyện"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span
                        className="shrink-0 rounded-[10px] px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{
                          backgroundImage: isGroup
                            ? "linear-gradient(45deg, rgb(139, 92, 246) 25%, rgb(20, 184, 166) 75%)"
                            : "linear-gradient(40deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
                        }}
                      >
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
