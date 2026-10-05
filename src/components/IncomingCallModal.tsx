"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { IncomingCall } from "@/hooks/useCallNotifications";

interface IncomingCallModalProps {
  call: IncomingCall;
  callId: string;
  onAccept: (callId: string) => void;
  onDecline: () => void;
}

export function IncomingCallModal({ call, callId, onAccept, onDecline }: IncomingCallModalProps) {
  const ringRef = useRef<HTMLDivElement>(null);

  // Ring animation
  useEffect(() => {
    let frame: number;
    let scale = 1;
    let growing = true;
    function animate() {
      if (ringRef.current) {
        ringRef.current.style.transform = `scale(${scale})`;
        ringRef.current.style.opacity = `${Math.max(0.1, (scale - 1) / 0.5)}`;
      }
      scale += growing ? 0.015 : -0.015;
      if (scale >= 1.5) growing = false;
      if (scale <= 1) growing = true;
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 backdrop-blur-md">
      {/* Animated background rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          ref={ringRef}
          className="absolute rounded-full border border-pink-500/30"
          style={{ width: "280px", height: "280px" }}
        />
        <div
          className="absolute rounded-full border border-violet-500/20"
          style={{ width: "360px", height: "360px", animation: "pulse 2s ease-in-out infinite" }}
        />
      </div>

      {/* Card */}
      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Caller avatar */}
        <div className="relative">
          <div
            className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-pink-500 shadow-2xl shadow-violet-500/40"
            style={{ animation: "pulse 1.5s ease-in-out infinite" }}
          >
            {call.callerAvatar ? (
              <img src={call.callerAvatar} alt="" className="size-full rounded-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-white">
                {call.callerName?.[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </div>
          {/* Incoming label */}
          <div className="flex items-center gap-1 absolute -top-1 -right-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-lg">
            <Icon name="phoneCall" size={9} />
            GỌI ĐẾN
          </div>
        </div>

        {/* Info */}
        <div className="text-center">
          <h2 className="text-[18px] font-bold text-white">{call.callerName}</h2>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-[12px] text-[#94a3b8]">
            <span className="size-2 animate-pulse rounded-full bg-red-400" />
            Cuộc gọi video đến
          </p>
        </div>

        {/* Conversation */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] text-white/70 backdrop-blur-md">
          <Icon name="messageCircle" size={11} />
          {call.conversationName}
        </div>

        {/* Actions */}
        <div className="mt-2 flex items-center gap-6">
          {/* Decline */}
          <button
            onClick={onDecline}
            className="flex size-16 items-center justify-center rounded-full bg-red-500 shadow-xl shadow-red-500/50 transition-all hover:scale-110 active:scale-95"
            aria-label="Từ chối"
          >
            <Icon name="phoneCall" size={22} className="rotate-[135deg] text-white" />
          </button>

          {/* Accept */}
          <button
            onClick={() => onAccept(callId)}
            className="flex size-16 items-center justify-center rounded-full bg-emerald-500 shadow-xl shadow-emerald-500/50 transition-all hover:scale-110 active:scale-95"
            aria-label="Chấp nhận"
          >
            <Icon name="phoneCall" size={22} className="text-white" />
          </button>
        </div>

        {/* Labels */}
        <div className="flex w-48 items-center justify-between text-[10px] text-white/50">
          <span>Từ chối</span>
          <span>Chấp nhận</span>
        </div>
      </div>
    </div>
  );
}
