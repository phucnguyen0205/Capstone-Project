"use client";

import { useState } from "react";
import { chatMessages, conversations } from "@/lib/mock-data";
import { Icon } from "@/components/ui/Icon";

export function ChatColumn() {
  const [message, setMessage] = useState("");

  return (
    <aside className="flex w-[360px] shrink-0 flex-col gap-4">
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-white">Tin nhắn</h2>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-[18px] bg-[#2a2d37]"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={16} />
          </button>
        </div>

        <div className="flex w-full items-center gap-2 rounded-xl border border-[#242831] bg-[#171920] px-3 py-2.5">
          <Icon name="search" size={16} />
          <span className="flex-1 text-[13px] text-[#626775]">
            Tìm kiếm cuộc trò chuyện...
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5"
          >
            {conversation.avatar ? (
              <span className="relative size-11 shrink-0">
                <Icon name={conversation.avatar} size={44} />
              </span>
            ) : (
              <div className="size-11 shrink-0 rounded-[22px] bg-[#c4c4c4]" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-white">
                  {conversation.name}
                </p>
                <span className="shrink-0 text-[11px] text-[#626775]">
                  {conversation.time}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`truncate text-[13px] ${
                    conversation.active ? "text-white" : "text-[#a0a5b5]"
                  }`}
                >
                  {conversation.message}
                </p>
                {conversation.unread > 0 && (
                  <span
                    className="shrink-0 rounded-[10px] px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{
                      backgroundImage:
                        "linear-gradient(40deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
                    }}
                  >
                    {conversation.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-white/8 bg-[rgba(31,33,40,0.63)] backdrop-blur-[10px]">
        <div className="flex items-center justify-between border-b border-[#242831] bg-[#171920] p-3">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-[18px] bg-[#c4c4c4]" />
            <div>
              <p className="text-[13px] font-bold text-white">Name</p>
              <div className="flex items-center gap-1">
                <Icon name="ellipse" size={6} />
                <span className="text-[11px] text-[#626775]">Đang hoạt động</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Gọi thoại">
              <Icon name="phoneCall" size={16} />
            </button>
            <button type="button" aria-label="Gọi video">
              <Icon name="videoCall" size={16} />
            </button>
          </div>
        </div>

        <div className="flex h-[220px] flex-col gap-3 overflow-y-auto p-3">
          {chatMessages.map((item) =>
            item.type === "received" ? (
              <div key={item.id} className="flex items-end gap-2">
                <div className="size-6 shrink-0 rounded-xl bg-[#c4c4c4]" />
                <div className="max-w-[220px] rounded-bl rounded-br-xl rounded-t-xl bg-[#2a2d37] px-3 py-2">
                  <p className="text-[13px] text-white">{item.text}</p>
                </div>
              </div>
            ) : (
              <div key={item.id} className="flex justify-end">
                <div
                  className="max-w-[220px] rounded-bl-xl rounded-br rounded-t-xl px-3 py-2"
                  style={{
                    backgroundImage:
                      "linear-gradient(16deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
                  }}
                >
                  <p className="text-[13px] text-white">{item.text}</p>
                </div>
              </div>
            ),
          )}
        </div>

        <div className="border-t border-[#242831] bg-[#171920] p-3">
          <div className="flex items-center gap-2 rounded-full bg-[#2a2d37] px-3 py-2">
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Gửi tin nhắn..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#626775]"
            />
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Emoji">
                <Icon name="smile" size={16} />
              </button>
              <button type="button" aria-label="Đính kèm">
                <Icon name="paperclip" size={16} />
              </button>
              <button type="button" aria-label="Video">
                <Icon name="fileVideo" size={16} />
              </button>
            </div>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-[14px]"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
              }}
              aria-label="Gửi"
            >
              <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
