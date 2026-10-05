"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { ChatListPanel } from "@/components/ChatListPanel";
import { ChatModal } from "@/components/ChatModal";
import {
  Conversation,
  Message,
  Participant,
  PresenceInfo,
} from "@/components/chatShared";
import { useChatSettings } from "@/lib/chatSettings";

const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024; // 200 MB

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return [] as unknown as T;
  try {
    return JSON.parse(text);
  } catch {
    return [] as unknown as T;
  }
}

type TabKey = "personal" | "group";

export function ChatColumn({
  initialConvId,
  callStatus = "idle",
  incomingCall,
  callerInfo,
  callId,
  onAcceptCall,
  onDeclineCall,
  onInitiateCall,
  onEndCall,
  webrtc,
}: {
  initialConvId?: string | null;
  callStatus?: "idle" | "ringing" | "connecting" | "connected" | "declined" | "ended";
  incomingCall?: { id: string; callerId: string; callerName: string; callerAvatar: string | null; conversationId: string; conversationName: string; isGroup: boolean } | null;
  callerInfo?: { id: string; name: string; avatar: string | null } | null;
  callId?: string | null;
  onAcceptCall?: () => void;
  onDeclineCall?: () => void;
  onInitiateCall?: (
    conversationId: string,
    calleeId: string,
    calleeName: string,
    calleeAvatar: string | null | undefined,
    conversationName: string,
    isGroup: boolean
  ) => Promise<boolean>;
  onEndCall?: () => void;
  webrtc?: {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    connectionState: RTCPeerConnectionState;
    toggleMic: () => void;
    toggleCamera: () => void;
    micOn: boolean;
    cameraOn: boolean;
  };
}) {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Participant[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    preview: string | null;
    kind: "image" | "video" | "file";
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Refs để share state giữa các closure (dùng cho sendMessage / sendGif / sendVoice)
  const pendingFileRef = useRef(pendingFile);
  const inputRef = useRef(input);
  useEffect(() => { pendingFileRef.current = pendingFile; }, [pendingFile]);
  useEffect(() => { inputRef.current = input; }, [input]);

  const { themeId: activeThemeId } = useChatSettings(activeConv?.id);

  function refreshPresence(convs: Conversation[], extras: string[] = []) {
    const ids = new Set<string>();
    convs.forEach((c) => c.participants.forEach((p) => ids.add(p.id)));
    extras.forEach((id) => ids.add(id));
    if (ids.size === 0) return;
    fetch("/api/presence/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: Array.from(ids) }),
    })
      .then((r) => safeJson<Record<string, PresenceInfo>>(r))
      .then((data) => {
        if (data && typeof data === "object") {
          setPresenceMap((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }

  // Load conversations
  useEffect(() => {
    if (!session) return;
    setLoadingConvs(true);
    fetch("/api/conversations")
      .then((r) => safeJson<Conversation[]>(r))
      .then((data) => {
        setConversations(data ?? []);
        if (initialConvId) {
          const found = (data ?? []).find((c) => c.id === initialConvId);
          if (found) {
            setActiveConv(found);
            setActiveTab(found.isGroup ? "group" : "personal");
          }
        }
        refreshPresence(data ?? []);
      })
      .catch(() => setConversations([]))
      .finally(() => setLoadingConvs(false));
  }, [session, initialConvId]);

  const filteredConversations = useMemo(() => {
    if (activeTab === "group") return conversations.filter((c) => c.isGroup === 1);
    return conversations.filter((c) => c.isGroup !== 1);
  }, [conversations, activeTab]);

  const personalCount = useMemo(
    () => conversations.filter((c) => c.isGroup !== 1).length,
    [conversations]
  );
  const groupCount = useMemo(
    () => conversations.filter((c) => c.isGroup === 1).length,
    [conversations]
  );

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConv) return;
    const convId = activeConv.id;
    let cancelled = false;

    async function loadMessages() {
      const data = await fetch(`/api/conversations/${convId}/messages`)
        .then((r) => safeJson<Message[]>(r))
        .catch(() => []);
      if (!cancelled && Array.isArray(data)) {
        setMessages(data);
        fetch("/api/conversations")
          .then((r) => safeJson<Conversation[]>(r))
          .then((d) => { if (!cancelled && Array.isArray(d)) setConversations(d); })
          .catch(() => {});
      }
    }

    loadMessages();
    const interval = setInterval(loadMessages, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeConv]);

  // Poll conversations list every 5s
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      fetch("/api/conversations")
        .then((r) => safeJson<Conversation[]>(r))
        .then((data) => {
          if (Array.isArray(data)) {
            setConversations((prev) => {
              if (
                prev.length !== data.length ||
                JSON.stringify(prev.map((c) => c.id + c.unreadCount)) !==
                  JSON.stringify(data.map((c) => c.id + c.unreadCount))
              ) {
                return data;
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [session]);

  // Refresh presence periodically
  useEffect(() => {
    if (!session || conversations.length === 0) return;
    refreshPresence(conversations);
    const interval = setInterval(() => refreshPresence(conversations), 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, conversations.length]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    const el = messagesEndRef.current;
    if (el) {
      const container = el.parentElement;
      if (container) container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Search users
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(search)}`)
        .then((r) => safeJson<Participant[]>(r))
        .then((data) => {
          setSearchResults(data ?? []);
          setSearchLoading(false);
          refreshPresence([], (data ?? []).map((p) => p.id));
        })
        .catch(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function startConversation(participant: Participant) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id }),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    const convId = data?.id;
    if (convId) {
      const convs = await fetch("/api/conversations")
        .then((r) => safeJson<Conversation[]>(r));
      setConversations(convs ?? []);
      const found = (convs ?? []).find((c) => c.id === convId);
      if (found) {
        setActiveConv(found);
        setActiveTab("personal");
      }
    }
    setSearch("");
    setSearchResults([]);
  }

  async function sendMessage() {
    if (!activeConv) return;
    const curInput = inputRef.current;
    const curPending = pendingFileRef.current;
    const hasText = curInput.trim().length > 0;
    const hasAttachment = curPending !== null;
    if ((!hasText && !hasAttachment) || sending || uploading) return;
    setSending(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      let fileName: string | null = null;
      let fileSize: number | null = null;

      if (curPending) {
        setUploading(true);
        try {
          const uploaded = await uploadAttachment(curPending.file);
          mediaUrl = uploaded.url;
          mediaType = uploaded.kind;
          fileName = curPending.file.name;
          fileSize = curPending.file.size;
        } catch (err) {
          console.error(err);
          alert("Không thể tải tệp lên. Vui lòng thử lại.");
          setSending(false);
          setUploading(false);
          return;
        }
        setUploading(false);
      }

      const baseText = curInput.trim();
      const replyText = replyTo ? `↪ ${replyTo.content.slice(0, 80)}\n${baseText}` : baseText;
      const finalContent = hasText
        ? replyText
        : `[Tệp] ${fileName ?? "đính kèm"}`;

      const res = await fetch(`/api/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConv.id,
          content: finalContent,
          mediaUrl,
          mediaType,
          fileName,
          fileSize,
        }),
      });
      if (res.ok) {
        const text = await res.text();
        const msg: Message = text ? JSON.parse(text) : null;
        if (msg?.id) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
        setInput("");
        setReplyTo(null);
        setPendingFile(null);
        setShowEmoji(false);
        fetch("/api/conversations")
          .then((r) => safeJson<Conversation[]>(r))
          .then((d) => { if (Array.isArray(d)) setConversations(d); })
          .catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
    setSending(false);
  }

  async function uploadAttachment(file: File): Promise<{ url: string; kind: "image" | "video" | "file" }> {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("File exceeds 200MB");
    const isVideo = file.type.startsWith("video/");
    const kind: "image" | "video" | "raw" = isVideo
      ? "video"
      : file.type.startsWith("image/")
        ? "image"
        : "raw";
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("Upload API error", res.status, txt);
      throw new Error("Upload failed");
    }
    const data = await res.json();
    const secure: string = data.secure_url || data.url;
    return {
      url: secure,
      kind: kind === "image" ? "image" : kind === "video" ? "video" : "file",
    };
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES) {
      alert("Tệp vượt quá 200MB. Vui lòng chọn tệp nhỏ hơn.");
      return;
    }
    const kind: "image" | "video" | "file" = f.type.startsWith("image/")
      ? "image"
      : f.type.startsWith("video/")
        ? "video"
        : "file";
    let preview: string | null = null;
    if (kind === "image" || kind === "video") preview = URL.createObjectURL(f);
    setPendingFile({ file: f, preview, kind });
  }

  function insertEmoji(emoji: string) {
    setInput((prev) => prev + emoji);
  }

  /**
   * Upload 1 blob (GIF/Sticker/Voice) lên Cloudinary và gửi message mới
   * (tách biệt sendMessage để tránh phụ thuộc pendingFile closure).
   */
  async function uploadAndSend(blob: Blob, kind: "image" | "video" | "file", displayLabel: string) {
    if (!activeConv || sending || uploading) return;
    setSending(true);
    setUploading(true);
    try {
      const resourceType: "image" | "video" | "raw" =
        kind === "video" ? "video" : kind === "image" ? "image" : "raw";
      const form = new FormData();
      form.append("file", blob, `${displayLabel}-${Date.now()}`);
      form.append("kind", resourceType);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Upload API error", res.status, txt);
        throw new Error("Upload failed");
      }
      const data = await res.json();
      const secure: string = data.secure_url || data.url;
      setUploading(false);

      const res2 = await fetch(`/api/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConv.id,
          content: `[${displayLabel}]`,
          mediaUrl: secure,
          mediaType: kind,
          fileName: `${displayLabel}.${kind === "image" ? "png" : kind === "video" ? "mp4" : "webm"}`,
          fileSize: blob.size,
        }),
      });
      if (res2.ok) {
        const text = await res2.text();
        const m: Message | null = text ? JSON.parse(text) : null;
        if (m?.id) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      }
    } catch (e) {
      console.error("uploadAndSend failed", e);
    }
    setSending(false);
    setUploading(false);
  }

  async function sendGif(gifUrlOrDataUrl: string) {
    try {
      const r = await fetch(gifUrlOrDataUrl);
      const blob = await r.blob();
      await uploadAndSend(blob, "image", "GIF");
    } catch (e) {
      console.error("sendGif failed", e);
    }
  }

  async function sendSticker(stickerUrlOrDataUrl: string) {
    try {
      const r = await fetch(stickerUrlOrDataUrl);
      const blob = await r.blob();
      await uploadAndSend(blob, "image", "Nhãn dán");
    } catch (e) {
      console.error("sendSticker failed", e);
    }
  }

  async function sendVoice(blob: Blob, _durationMs: number) {
    await uploadAndSend(blob, "file", "Voice");
  }

  if (!session) {
    return (
      <aside className="flex h-full w-[360px] shrink-0 flex-col">
        <div className="flex w-full shrink-0 flex-col gap-3 px-1 pb-2">
          <h2 className="text-lg font-extrabold text-white">Tin nhắn</h2>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-[#242831] bg-[rgba(31,33,40,0.63)] p-6 text-center">
          <div>
            <p className="mt-3 text-sm text-[#a0a5b5]">Đăng nhập để nhắn tin</p>
          </div>
        </div>
      </aside>
    );
  }

  const myId = (session.user as any)?.id;
  const activeIsGroup = activeConv?.isGroup === 1;

  return (
    <>
      <aside className="flex h-full w-[360px] shrink-0 flex-col">
        <ChatListPanel
          conversations={conversations}
          activeConv={activeConv}
          setActiveConv={setActiveConv}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          search={search}
          setSearch={setSearch}
          searchResults={searchResults}
          searchLoading={searchLoading}
          loadingConvs={loadingConvs}
          myId={myId}
          presenceMap={presenceMap}
          personalCount={personalCount}
          groupCount={groupCount}
          onStartConversation={startConversation}
          filteredConversations={filteredConversations}
        />
      </aside>

      {/* Chat modal — opens when user picks a conversation. Closes via
          X button or clicking the backdrop. */}
      <ChatModal
        activeConv={activeConv}
        setActiveConv={setActiveConv}
        activeTab={activeTab}
        messages={messages}
        myId={myId}
        presenceMap={presenceMap}
        input={input}
        setInput={setInput}
        sending={sending}
        uploading={uploading}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        pendingFile={pendingFile}
        setPendingFile={(v) => {
          if (v === null && pendingFile?.preview) {
            URL.revokeObjectURL(pendingFile.preview);
          }
          setPendingFile(v);
        }}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        insertEmoji={insertEmoji}
        sendMessage={sendMessage}
        handleFileChosen={handleFileChosen}
        sendGif={sendGif}
        sendSticker={sendSticker}
        sendVoice={sendVoice}
        messagesEndRef={messagesEndRef}
        fileInputRef={fileInputRef}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showGroupMembers={showGroupMembers}
        setShowGroupMembers={setShowGroupMembers}
        activeThemeId={activeThemeId}
        callStatus={callStatus}
        incomingCall={incomingCall}
        callerInfo={callerInfo}
        callId={callId}
        onInitiateCall={onInitiateCall}
        onEndCall={onEndCall}
        webrtc={webrtc}
        onMembersChange={(next) => {
          if (!activeConv) return;
          setConversations((prev) => {
            if (!prev) return prev;
            return prev.map((c) =>
              c.id === activeConv.id ? { ...c, participants: next } : c
            );
          });
        }}
      />
    </>
  );
}
