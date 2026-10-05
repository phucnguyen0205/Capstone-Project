"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { GroupsTopBar } from "@/components/groups/GroupsTopBar";
import { GroupsLeftSidebar } from "@/components/groups/GroupsLeftSidebar";
import { GroupsFeed } from "@/components/groups/GroupsFeed";
import { GroupsRightSidebar } from "@/components/groups/GroupsRightSidebar";
import { GroupLockScreen } from "@/components/groups/GroupLockScreen";
import { PublicGroupPreview } from "@/components/groups/PublicGroupPreview";
import { ChatColumn } from "@/components/ChatColumn";
import { IncomingCallModal } from "@/components/IncomingCallModal";
import { useCallNotifications2 } from "@/hooks/useCallNotifications2";
import {
  isChatColumnVisible,
  subscribeChatColumnVisible,
  closeChatColumn,
} from "@/lib/chatColumnVisible";

export function GroupsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Chat column visibility — same event bus as the main Dashboard so
  // the `HeaderCluster` chat toggle in `GroupsTopBar` opens/closes the
  // chat panel here. Without subscribing, the button visibly does
  // nothing on the /groups page.
  const [chatVisible, setChatVisible] = useState<boolean>(true);
  useEffect(() => {
    // Sync with localStorage after mount to avoid hydration mismatch
    setChatVisible(isChatColumnVisible());
    // Subscribe so changes from the header toggle propagate here.
    return subscribeChatColumnVisible((v) => setChatVisible(v));
  }, []);

  // Reuse the call-notification hook from the main Dashboard so the
  // chat column on /groups has the same call affordances as on /feed.
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

  // The active group id is sourced from `?group=...`. Reading it from
  // the URL (instead of local state) means reload + share-link both
  // restore the same view. `null` means the user hasn't picked a group
  // yet — the centre column renders an empty state instead.
  const activeGroupId = searchParams.get("group");

  // When a group is opened, hide the chat column overlay so the layout
  // stays at 3 columns (left sidebar + feed + right sidebar). The user
  // can still reopen chat manually with the header toggle. We only
  // fire `closeChatColumn()` (not local state) so other consumers of
  // the event bus (main Dashboard) also see the change.
  useEffect(() => {
    if (!activeGroupId) return;
    if (isChatColumnVisible()) closeChatColumn();
    // We intentionally don't re-run on chatVisible changes — only when
    // the group itself changes. This avoids a click on the chat
    // toggle being immediately undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  // Re-fetch signal for child columns after a new post or membership
  // change. Bumping the counter tells children to re-pull their data.
  const [refreshSignal, setRefreshSignal] = useState(0);
  const triggerRefresh = useCallback(() => {
    setRefreshSignal((v) => v + 1);
  }, []);

  // ─── Track viewer permissions for the active group ─────────────────
  // We ask `/api/groups/[id]` once per id and remember it in this cache
  // so the centre column can pick the right view (feed / lock / empty).
  // We also pass `viewerCanJoin` so the right column can hide the
  // members panel when the viewer doesn't have access.
  const [accessInfo, setAccessInfo] = useState<{
    groupId: string;
    isMember: boolean;
    visibility: "public" | "private";
    viewerCanJoin: boolean;
    memberCount: number;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    creatorUsername: string;
    creatorName: string | null;
  } | null>(null);

  useEffect(() => {
    if (!activeGroupId) {
      setAccessInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/groups/${activeGroupId}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (cancelled || !res.ok || !data) {
          setAccessInfo(null);
          return;
        }
        setAccessInfo({
          groupId: activeGroupId,
          isMember: !!data.isMember,
          visibility: data.visibility,
          viewerCanJoin: !!data.viewerCanJoin,
          memberCount: data.memberCount,
          name: data.name,
          description: data.description,
          avatarUrl: data.avatarUrl,
          creatorUsername: data.creator?.username ?? "",
          creatorName: data.creator?.name ?? null,
        });
      } catch {
        if (!cancelled) setAccessInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeGroupId, refreshSignal]);

  const selectGroup = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("group", id);
      else params.delete("group");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0c0c14]">
      <GroupsTopBar />

      <main className="relative flex w-full min-h-0 flex-1 overflow-hidden">
        <GroupsLeftSidebar
          refreshSignal={refreshSignal}
          activeGroupId={activeGroupId}
          onSelectGroup={selectGroup}
        />

        {/*
          Centre column has three modes:
           1. No active group → empty state
           2. Active group, viewer is a member → the full feed
           3. Active group, viewer is NOT a member:
              - public  → read-only preview with join CTA
              - private → lock screen (server already 404s for this case)
        */}
        {!activeGroupId ? (
          <div className="flex flex-1 items-center justify-center bg-[#0c0c14] p-6">
            <div className="flex max-w-md flex-col items-center gap-2 text-center">
              <p className="text-[15px] font-bold text-white">
                Chọn nhóm để xem nội dung
              </p>
              <p className="text-[12px] text-[#a0a5b5]">
                Chọn 1 nhóm trong danh sách bên trái, hoặc tham gia nhóm
                công khai để bắt đầu.
              </p>
            </div>
          </div>
        ) : accessInfo?.isMember ? (
          <GroupsFeed
            refreshSignal={refreshSignal}
            activeGroupId={activeGroupId}
          />
        ) : accessInfo?.visibility === "public" && accessInfo.viewerCanJoin ? (
          <PublicGroupPreview
            groupId={accessInfo.groupId}
            name={accessInfo.name}
            description={accessInfo.description}
            avatarUrl={accessInfo.avatarUrl}
            memberCount={accessInfo.memberCount}
            creatorUsername={accessInfo.creatorUsername}
            creatorName={accessInfo.creatorName}
            onJoined={() => triggerRefresh()}
          />
        ) : (
          <GroupLockScreen />
        )}

        <GroupsRightSidebar
          refreshSignal={refreshSignal}
          activeGroupId={accessInfo?.isMember ? activeGroupId : null}
        />

        {/*
          Chat panel overlays the right side of the groups layout
          instead of claiming its own flex column, so the centre feed
          and right sidebar stay at full width. The `HeaderCluster`
          toggle in `GroupsTopBar` controls visibility via the event
          bus.
        */}
        {chatVisible && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-30 flex">
            <div className="pointer-events-auto h-full w-[360px] border-l border-[#232338] bg-[#0c0c14] shadow-2xl">
              <ChatColumn
                callStatus={callStatus}
                incomingCall={incomingCall}
                callerInfo={callerInfo}
                callId={callId}
                onAcceptCall={() =>
                  callId ? acceptCall(callId) : undefined
                }
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

      {/* Incoming call overlay — same global behaviour as the main
          Dashboard so calls received while on /groups still pop up.
          `decline` closes the modal without an answer payload, but the
          hook requires a callId so we feed it the active incoming call
          id (modal is only rendered when `incomingCall` is set). */}
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          callId={callId ?? incomingCall.id}
          onAccept={(id) => {
            if (!id) return;
            acceptCall(id);
          }}
          onDecline={() => {
            const id = callId ?? incomingCall.id;
            if (id) declineCall(id);
          }}
        />
      )}
    </div>
  );
}