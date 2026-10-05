"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { LeftColumn } from "@/components/LeftColumn";
import { FeedColumn } from "@/components/FeedColumn";
import { ChatColumn } from "@/components/ChatColumn";
import { IncomingCallModal } from "@/components/IncomingCallModal";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { isChatColumnVisible, subscribeChatColumnVisible } from "@/lib/chatColumnVisible";
import { useCallNotifications2 } from "@/hooks/useCallNotifications2";

export function Dashboard() {
  const searchParams = useSearchParams();
  const initialConvId = searchParams.get("conv");

  // Send a heartbeat every 30s so other users can see us as online
  usePresenceHeartbeat(30_000);

  // Call notifications (SSE + incoming call UI + WebRTC)
  const {
    callStatus,
    incomingCall,
    callerInfo,
    callId,
    acceptCall,
    declineCall,
    initiateCall,
    endCall,
    webrtc,
  } = useCallNotifications2();

  // Visibility state for the chat column (toggled from the Navbar).
  // The deep-link `?conv=` query always forces it open.
  const [chatVisible, setChatVisible] = useState<boolean>(true);
  useEffect(() => {
    if (initialConvId) {
      setChatVisible(true);
      return;
    }
    setChatVisible(isChatColumnVisible());
    return subscribeChatColumnVisible((v) => setChatVisible(v));
  }, [initialConvId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#090a0c]">
      <Navbar />
      <main className="relative flex w-full flex-1 gap-5 overflow-hidden p-5">
        <LeftColumn />
        <FeedColumn />
        {/* Chat panel overlays the right side of the layout instead of
            claiming its own flex column, so the feed / left sidebar are
            never pushed off-screen. Hidden by default; toggled via the
            `chat-toggle:open` event bus from `HeaderCluster`. */}
        {chatVisible && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-30 flex">
            <div className="pointer-events-auto h-full w-[360px] border-l border-[#232338] bg-[#0c0c14] shadow-2xl">
              <ChatColumn
                initialConvId={initialConvId}
                callStatus={callStatus}
                incomingCall={incomingCall}
                callerInfo={callerInfo}
                callId={callId}
                onAcceptCall={() => (callId ? acceptCall(callId) : undefined)}
                onDeclineCall={() =>
                  callId ? declineCall(callId) : undefined
                }
                onInitiateCall={initiateCall}
                onEndCall={endCall}
                webrtc={webrtc}
              />
            </div>
          </div>
        )}
      </main>

      {/* Incoming call overlay — shown globally */}
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          callId={callId ?? incomingCall.id}
          onAccept={(id) => {
            if (!id) return;
            acceptCall(id);
          }}
          onDecline={() => declineCall(callId ?? incomingCall.id)}
        />
      )}
    </div>
  );
}
