"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";
import { ChatSettingsModal, THEMES } from "@/components/ChatSettingsModal";
import { VideoCallModal } from "@/components/VideoCallModal";
import { GroupMemberPanel } from "@/components/groups/GroupMemberPanel";
import {
  Conversation,
  Message,
  PresenceInfo,
  GroupAvatar,
  PresenceDot,
  formatBytes,
} from "./chatShared";

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Cảm xúc",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔"],
  },
  {
    label: "Yêu thích",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏", "💪", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍"],
  },
  {
    label: "Biểu tượng",
    emojis: ["🎉", "🎊", "✨", "🌟", "⭐", "💫", "🔥", "💥", "💯", "✅", "❌", "❓", "❗", "💡", "💬", "💭", "🗨️", "🗯️", "🎵", "🎶", "🎁", "🎈", "🎂", "🍰", "🍕", "🍔", "🍟", "🍩", "☕", "🍺"],
  },
];

/**
 * Sticker tĩnh dạng emoji-rendered-image.
 * Render bằng emoji lớn trên nền tròn gradient (không cần asset ngoài).
 */
const STICKER_PACKS: { label: string; stickers: { emoji: string; label: string }[] }[] = [
  {
    label: "Cảm xúc",
    stickers: [
      { emoji: "😀", label: "Cười" },
      { emoji: "😂", label: "Cười lăn" },
      { emoji: "🥰", label: "Yêu" },
      { emoji: "😍", label: "Mê" },
      { emoji: "🤩", label: "Lấp lánh" },
      { emoji: "😘", label: "Hôn" },
      { emoji: "😎", label: "Ngầu" },
      { emoji: "🤔", label: "Suy nghĩ" },
      { emoji: "😴", label: "Buồn ngủ" },
      { emoji: "😭", label: "Khóc" },
      { emoji: "🤯", label: "Choáng" },
      { emoji: "😱", label: "Hốt" },
    ],
  },
  {
    label: "Phản ứng",
    stickers: [
      { emoji: "👍", label: "Like" },
      { emoji: "👎", label: "Dislike" },
      { emoji: "👏", label: "Vỗ tay" },
      { emoji: "🙌", label: "Giơ tay" },
      { emoji: "🙏", label: "Cầu nguyện" },
      { emoji: "💪", label: "Mạnh mẽ" },
      { emoji: "✌️", label: "Hòa bình" },
      { emoji: "🤝", label: "Bắt tay" },
    ],
  },
  {
    label: "Kỷ niệm",
    stickers: [
      { emoji: "🎉", label: "Chúc mừng" },
      { emoji: "🎂", label: "Sinh nhật" },
      { emoji: "🎁", label: "Quà" },
      { emoji: "❤️", label: "Trái tim" },
      { emoji: "💯", label: "100 điểm" },
      { emoji: "🔥", label: "Cháy" },
      { emoji: "⭐", label: "Sao" },
      { emoji: "✨", label: "Lấp lánh" },
    ],
  },
];

/**
 * GIF tĩnh — dùng hình ảnh demo (emoji động lớn) thay cho asset GIF thật.
 * Sau này có thể thay bằng Tenor API: `https://api.tenor.com/v1/search?q=...&limit=20`.
 */
const GIF_LIBRARY: { id: string; emoji: string; label: string; bg: string }[] = [
  { id: "g1", emoji: "😆", label: "Cười nghiêng", bg: "linear-gradient(135deg,#fbbf24,#f59e0b)" },
  { id: "g2", emoji: "🥳", label: "Ăn mừng", bg: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
  { id: "g3", emoji: "😴", label: "Ngủ ngon", bg: "linear-gradient(135deg,#60a5fa,#3b82f6)" },
  { id: "g4", emoji: "🤔", label: "Hmm...", bg: "linear-gradient(135deg,#f472b6,#ec4899)" },
  { id: "g5", emoji: "😍", label: "Yêu quá", bg: "linear-gradient(135deg,#fb7185,#f43f5e)" },
  { id: "g6", emoji: "😱", label: "Hốt hoảng", bg: "linear-gradient(135deg,#fb923c,#ea580c)" },
  { id: "g7", emoji: "🎉", label: "Tiệc tung", bg: "linear-gradient(135deg,#34d399,#10b981)" },
  { id: "g8", emoji: "💃", label: "Nhảy", bg: "linear-gradient(135deg,#c084fc,#a855f7)" },
  { id: "g9", emoji: "🐱", label: "Mèo cute", bg: "linear-gradient(135deg,#fde68a,#fcd34d)" },
  { id: "g10", emoji: "🐶", label: "Chó cute", bg: "linear-gradient(135deg,#93c5fd,#3b82f6)" },
  { id: "g11", emoji: "🍕", label: "Pizza", bg: "linear-gradient(135deg,#fca5a5,#ef4444)" },
  { id: "g12", emoji: "☕", label: "Cà phê", bg: "linear-gradient(135deg,#a78bfa,#8b5cf6)" },
];

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Phân loại message: ảnh thường / GIF / sticker / voice / text */
type MsgKind = "text" | "image" | "gif" | "sticker" | "voice" | "file";

function classifyMessage(msg: { content?: string | null; mediaType?: string | null }): MsgKind {
  const c = (msg.content ?? "").trim();
  if (c === "[GIF]" && msg.mediaType === "image") return "gif";
  if (c === "[Nhãn dán]" && msg.mediaType === "image") return "sticker";
  if (c === "[Voice]" || msg.mediaType === "file" && c.startsWith("[Voice]")) return "voice";
  if (msg.mediaType === "image") return "image";
  if (msg.mediaType === "video") return "image"; // treat as image bubble (renders <video>)
  if (msg.mediaType === "file") return "file";
  return "text";
}

type TabKey = "personal" | "group";

/** Resolve full theme object from conversation theme ID */
function getThemeFromId(themeId: string | undefined) {
  if (!themeId) return null;
  return THEMES.find((t) => t.id === themeId) ?? null;
}

type CallStatus = "idle" | "ringing" | "connecting" | "connected" | "declined" | "ended";
type IncomingCallInfo = {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  conversationId: string;
  conversationName: string;
  isGroup: boolean;
};
type CallerInfo = { id: string; name: string; avatar: string | null };
type WebRtcInfo = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  toggleMic: () => void;
  toggleCamera: () => void;
  micOn: boolean;
  cameraOn: boolean;
};

export interface ChatModalProps {
  activeConv: Conversation | null;
  setActiveConv: (c: Conversation | null) => void;
  activeTab: TabKey;

  // Chat data
  messages: Message[];
  myId: string;
  presenceMap: Record<string, PresenceInfo>;

  // Chat input state
  input: string;
  setInput: (s: string) => void;
  sending: boolean;
  uploading: boolean;
  replyTo: Message | null;
  setReplyTo: (m: Message | null) => void;
  pendingFile: { file: File; preview: string | null; kind: "image" | "video" | "file" } | null;
  setPendingFile: (
    v: { file: File; preview: string | null; kind: "image" | "video" | "file" } | null
  ) => void;
  showEmoji: boolean;
  setShowEmoji: (b: boolean | ((s: boolean) => boolean)) => void;
  insertEmoji: (e: string) => void;
  sendMessage: () => void;
  handleFileChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // GIF / Sticker / Voice
  sendGif?: (gifUrl: string) => Promise<void> | void;
  sendSticker?: (stickerUrl: string) => Promise<void> | void;
  sendVoice?: (audioBlob: Blob, durationMs: number) => Promise<void> | void;

  // Refs
  messagesEndRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;

  // Modals
  showSettings: boolean;
  setShowSettings: (b: boolean) => void;
  showGroupMembers: boolean;
  setShowGroupMembers: (b: boolean) => void;

  // Active theme
  activeThemeId: string | undefined;

  // Call state
  callStatus: CallStatus;
  incomingCall?: IncomingCallInfo | null;
  callerInfo?: CallerInfo | null;
  callId?: string | null;
  onInitiateCall?: (
    conversationId: string,
    calleeId: string,
    calleeName: string,
    calleeAvatar: string | null | undefined,
    conversationName: string,
    isGroup: boolean
  ) => Promise<boolean>;
  onEndCall?: () => void;
  webrtc?: WebRtcInfo;

  // List sync (for group member panel to push back to parent)
  onMembersChange?: (
    members: {
      id: string;
      name: string | null;
      username: string;
      avatar: string | null;
      role: "creator" | "admin" | "member";
      nickname: string | null;
    }[]
  ) => void;
}

/**
 * MessageBody — render 1 message theo `kind` với hiệu ứng giống Facebook Messenger.
 *
 * - text:    bubble tròn có text
 * - image:   ảnh full trong bubble, có thể kèm caption
 * - gif:     ảnh GIF không viền (loop animation)
 * - sticker: ảnh lớn không bubble (sticky-style)
 * - voice:   bubble có dải sóng giả + nút play, duration
 * - file:    bubble có tên file + size
 */
function MessageBody({
  msg,
  kind,
  isMe,
  t,
}: {
  msg: { id?: string; content?: string | null; mediaUrl?: string | null; mediaType?: string | null; fileName?: string | null; fileSize?: number | null; createdAt?: Date | string | null };
  kind: MsgKind;
  isMe: boolean;
  t: (typeof THEMES)[number];
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Sticker: ảnh lớn không nền, hover scale ──────────────────────────
  if (kind === "sticker") {
    return (
      <div className="relative animate-[stickerIn_220ms_cubic-bezier(.34,1.56,.64,1)] transition-transform hover:scale-105 cursor-pointer">
        {msg.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.mediaUrl}
            alt="sticker"
            className="size-32 object-contain drop-shadow-lg"
          />
        )}
      </div>
    );
  }

  // ── GIF: ảnh lớn có overlay "GIF" ở góc, hover zoom ─────────────────
  if (kind === "gif") {
    return (
      <div
        className={`group relative overflow-hidden rounded-xl ${
          isMe ? "rounded-br-md" : "rounded-bl-md"
        } animate-[bubbleIn_200ms_ease-out]`}
        style={{ background: isMe ? "transparent" : t.theirBubbleBg }}
      >
        {msg.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.mediaUrl}
            alt="GIF"
            className="block max-h-[200px] w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <span
          className="absolute right-1.5 bottom-1.5 rounded bg-black/50 px-1 py-0.5 text-[9px] font-black uppercase tracking-wider text-white"
        >
          GIF
        </span>
      </div>
    );
  }

  // ── Voice: bubble có waveform giả + nút play ─────────────────────────
  if (kind === "voice") {
    // Estimate duration ~ size proxy (1KB/s for 8kbps opus); fallback 5s
    const durSec = msg.fileSize ? Math.min(60, Math.max(1, Math.round(msg.fileSize / 1000))) : 5;
    return (
      <div
        className={`flex min-w-[200px] items-center gap-2.5 rounded-full px-3 py-2 ${
          isMe ? "rounded-br-md text-white" : "rounded-bl-md"
        } animate-[bubbleIn_200ms_ease-out]`}
        style={
          isMe
            ? { backgroundImage: t.bubbleGradient }
            : { background: t.theirBubbleBg, color: t.theirBubbleText }
        }
      >
        <button
          type="button"
          aria-label={playing ? "Dừng voice" : "Nghe voice"}
          onClick={() => {
            if (!msg.mediaUrl) return;
            if (playing) {
              audioRef.current?.pause();
              setPlaying(false);
              return;
            }
            const a = new Audio(msg.mediaUrl);
            audioRef.current = a;
            a.onended = () => setPlaying(false);
            a.onpause = () => setPlaying(false);
            a.play().catch(() => setPlaying(false));
            setPlaying(true);
          }}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 transition active:scale-95"
        >
          {playing ? (
            <span className="block size-2.5 bg-white" style={{ clipPath: "polygon(0 0, 35% 0, 35% 100%, 0 100%, 0 0, 65% 0, 65% 100%, 65% 0, 100% 0, 100% 100%, 65% 100%, 100% 100%)" }} />
          ) : (
            <Icon name="triangleRight" size={14} className="text-white" />
          )}
        </button>
        <div className="flex flex-1 items-center gap-0.5">
          {Array.from({ length: 28 }).map((_, i) => {
            // Tạo pattern sóng giả deterministic
            const heights = [4, 8, 12, 6, 10, 14, 8, 4, 10, 16, 12, 6, 8, 14, 18, 10, 6, 12, 16, 14, 8, 10, 14, 6, 10, 14, 12, 8];
            const h = heights[i % heights.length];
            return (
              <span
                key={i}
                className={`block w-0.5 rounded-full transition-all duration-200 ${
                  playing && i / 28 < 0.5 ? "animate-pulse" : ""
                }`}
                style={{
                  height: `${h * 1.2}px`,
                  background: isMe ? "rgba(255,255,255,0.85)" : t.theirBubbleText + "99",
                }}
              />
            );
          })}
        </div>
        <span className="shrink-0 text-[10px] font-medium tabular-nums opacity-90">
          {playing ? "0:0?" : formatDuration(durSec * 1000)}
        </span>
      </div>
    );
  }

  // ── Ảnh / video / file đính kèm thường ──────────────────────────────
  if (kind === "image") {
    const isVideo = msg.mediaType === "video";
    return (
      <div
        className={`overflow-hidden rounded-xl ${
          isMe ? "rounded-br-md" : "rounded-bl-md"
        } animate-[bubbleIn_200ms_ease-out]`}
      >
        {msg.mediaUrl && isVideo && (
          <video
            src={msg.mediaUrl}
            controls
            className="block max-h-[220px] w-full"
          />
        )}
        {msg.mediaUrl && !isVideo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.mediaUrl}
            alt=""
            className="block max-h-[220px] w-full object-cover transition-transform hover:scale-105"
          />
        )}
        {msg.content && msg.content.trim() !== "" && !msg.content.startsWith("[") && (
          <div
            className={`px-3 py-2 text-[13px] ${
              isMe ? "rounded-br-md text-white" : "rounded-bl-md"
            }`}
            style={
              isMe
                ? { backgroundImage: t.bubbleGradient }
                : { background: t.theirBubbleBg, color: t.theirBubbleText }
            }
          >
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
        )}
      </div>
    );
  }

  if (kind === "file") {
    return (
      <a
        href={msg.mediaUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 rounded-2xl border px-3 py-2 transition hover:scale-[1.02] ${
          isMe
            ? "rounded-br-md text-white"
            : "rounded-bl-md"
        } animate-[bubbleIn_200ms_ease-out]`}
        style={
          isMe
            ? { backgroundImage: t.bubbleGradient, borderColor: "rgba(255,255,255,0.15)" }
            : { background: t.theirBubbleBg, color: t.theirBubbleText, borderColor: "rgba(0,0,0,0.08)" }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: isMe ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)" }}
        >
          <Icon name="paperclip" size={16} className={isMe ? "text-white" : ""} style={!isMe ? { color: t.theirBubbleText } : undefined} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold">
            {msg.fileName ?? "Tệp đính kèm"}
          </p>
          <p className="text-[10px] opacity-80">
            {msg.fileSize ? formatBytes(msg.fileSize) : "Tệp"}
          </p>
        </div>
        <Icon name="arrowRight" size={12} className="opacity-80" />
      </a>
    );
  }

  // ── Text bubble (default) ──────────────────────────────────────────
  return (
    <div
      className={`rounded-2xl px-3 py-2 ${
        isMe ? "rounded-br-md text-white" : "rounded-bl-md"
      } animate-[bubbleIn_180ms_ease-out]`}
      style={
        isMe
          ? { backgroundImage: t.bubbleGradient }
          : { background: t.theirBubbleBg, color: t.theirBubbleText }
      }
    >
      <p className="whitespace-pre-wrap break-words text-[13px]">{msg.content}</p>
    </div>
  );
}

/**
 * ChatModal — modal chat hiển thị khi user chọn 1 cuộc trò chuyện.
 * Render overlay với backdrop, đóng bằng nút X hoặc click backdrop.
 */
export function ChatModal({
  activeConv,
  setActiveConv,
  activeTab,
  messages,
  myId,
  presenceMap,
  input,
  setInput,
  sending,
  uploading,
  replyTo,
  setReplyTo,
  pendingFile,
  setPendingFile,
  showEmoji,
  setShowEmoji,
  insertEmoji,
  sendMessage,
  handleFileChosen,
  messagesEndRef,
  fileInputRef,
  showSettings,
  setShowSettings,
  showGroupMembers,
  setShowGroupMembers,
  activeThemeId,
  callStatus,
  incomingCall,
  callerInfo,
  callId,
  onInitiateCall,
  onEndCall,
  webrtc,
  onMembersChange,
  sendGif,
  sendSticker,
  sendVoice,
}: ChatModalProps) {
  const router = useRouter();
  const activeTheme = getThemeFromId(activeThemeId) ?? THEMES[0];
  const t = activeTheme;
  const activeIsGroup = activeConv?.isGroup === 1;

  // ─── GIF / Sticker / Voice state ────────────────────────────────
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [gifSearch, setGifSearch] = useState("");
  const [stickerPackIdx, setStickerPackIdx] = useState(0);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0); // drag-to-cancel tracking
  const dragStartRef = useRef<{ x: number; t: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);

  // Cleanup khi unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
    };
  }, []);

  // Đóng panel khác khi mở 1 panel
  function toggleGif() {
    setShowGifPanel((v) => !v);
    setShowStickerPanel(false);
    setShowEmoji(false);
  }
  function toggleSticker() {
    setShowStickerPanel((v) => !v);
    setShowGifPanel(false);
    setShowEmoji(false);
  }

  async function handlePickGif(gif: { id: string; emoji: string; label: string; bg: string }) {
    // Encode GIF thành data URL để gửi qua mediaUrl (giống cơ chế file)
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${gif.bg.match(/#[0-9a-f]{6}/i)?.[0] ?? "#7c3aed"}'/><stop offset='100%' stop-color='${gif.bg.match(/#[0-9a-f]{6}/gi)?.[1] ?? "#3b82f6"}'/></linearGradient></defs><rect width='120' height='120' rx='12' fill='url(#g)'/><text x='60' y='78' text-anchor='middle' font-size='64'>${gif.emoji}</text></svg>`
    )}`;
    try {
      if (sendGif) await sendGif(dataUrl);
      else if (sendSticker) await sendSticker(dataUrl); // fallback
      setShowGifPanel(false);
      setGifSearch("");
    } catch (e) {
      console.error("sendGif failed", e);
    }
  }

  async function handlePickSticker(sticker: { emoji: string; label: string }) {
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23ffffff' stroke='%23e5e7eb' stroke-width='2'/><text x='50' y='66' text-anchor='middle' font-size='56'>${sticker.emoji}</text></svg>`
    )}`;
    try {
      if (sendSticker) await sendSticker(dataUrl);
      setShowStickerPanel(false);
    } catch (e) {
      console.error("sendSticker failed", e);
    }
  }

  async function startRecording() {
    if (!sendVoice) return;
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const duration = Date.now() - recordingStartRef.current;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Tắt mic để đỡ tốn tài nguyên
        stream.getTracks().forEach((tr) => tr.stop());
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setIsRecording(false);
        setRecordingMs(0);
        if (blob.size === 0) return;
        try {
          await sendVoice(blob, duration);
        } catch (e) {
          console.error("sendVoice failed", e);
          setVoiceError("Không gửi được voice. Vui lòng thử lại.");
        }
      };
      mediaRecorderRef.current = mr;
      recordingStartRef.current = Date.now();
      mr.start();
      setIsRecording(true);
      setRecordingMs(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingMs(Date.now() - recordingStartRef.current);
      }, 100);
    } catch (err: any) {
      console.error(err);
      setVoiceError(
        err?.name === "NotAllowedError"
          ? "Bạn cần cấp quyền microphone để ghi âm."
          : "Không thể truy cập microphone."
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    chunksRef.current = [];
    if (mediaRecorderRef.current) {
      const tr = (mediaRecorderRef.current as any).stream?.getTracks?.();
      if (tr) tr.forEach((t: MediaStreamTrack) => t.stop());
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingMs(0);
    setDragOffsetX(0);
    dragStartRef.current = null;
  }

  // Drag-to-cancel handlers (giống Facebook Messenger)
  function handleDragStart(e: React.PointerEvent) {
    if (!isRecording) return;
    dragStartRef.current = { x: e.clientX, t: Date.now() };
    setDragOffsetX(0);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handleDragMove(e: React.PointerEvent) {
    if (!isRecording || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x; // âm = kéo qua trái
    setDragOffsetX(Math.min(0, dx));
  }
  function handleDragEnd(e: React.PointerEvent) {
    if (!isRecording || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    if (dx < -80) {
      // Kéo đủ xa → huỷ
      cancelRecording();
    } else {
      // Không đủ xa → gửi
      setDragOffsetX(0);
      stopRecording();
    }
    dragStartRef.current = null;
  }

  const filteredGifs = gifSearch.trim()
    ? GIF_LIBRARY.filter((g) => g.label.toLowerCase().includes(gifSearch.toLowerCase()))
    : GIF_LIBRARY;

  if (!activeConv) return null;

  function close() {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveConv(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end"
      onClick={(e) => {
        // Đóng khi click ra ngoài panel (vào backdrop)
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="flex h-[calc((100vh-100px)*0.65)] w-[320px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: t.bg, borderColor: t.border, marginRight: "40px", marginBottom: "20px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chat header */}
        <div
          className="flex items-center justify-between border-b p-3 transition-colors"
          style={{ background: t.surface, borderColor: t.border }}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative">
              {activeIsGroup ? (
                <GroupAvatar
                  participants={activeConv.participants}
                  convName={activeConv.name}
                  size={36}
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const other = activeConv.participants.find((p) => p.id !== myId);
                      if (other?.username) router.push(`/profile/${other.username}`);
                    }}
                    className="block overflow-hidden rounded-[18px] transition-opacity hover:opacity-80"
                    title="Xem hồ sơ"
                  >
                    <div className="size-9">
                      {(() => {
                        const other = activeConv.participants.find((p) => p.id !== myId);
                        return (
                          <SafeAvatar
                            src={other?.avatar}
                            alt=""
                            name={other?.name}
                            username={other?.username}
                            className="size-full"
                          />
                        );
                      })()}
                    </div>
                  </button>
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceDot
                      presence={presenceMap[activeConv.participants.find((p) => p.id !== myId)?.id ?? ""]}
                    />
                  </span>
                </>
              )}
            </div>
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="block max-w-[260px] truncate text-left text-[14px] font-bold transition-opacity hover:opacity-80"
                style={{ color: t.textPrimary }}
                title="Cài đặt cuộc trò chuyện"
              >
                {activeIsGroup
                  ? (activeConv.name ?? "Nhóm")
                  : (activeConv.participants.find((p) => p.id !== myId)?.name ??
                    activeConv.participants.find((p) => p.id !== myId)?.username)}
              </button>
              <div className="flex items-center gap-1.5">
                {activeIsGroup ? (
                  <>
                    <Icon name="users2" size={10} style={{ color: t.textSecondary }} />
                    <span className="truncate text-[11px]" style={{ color: t.textSecondary }}>
                      {activeConv.participants.length} thành viên
                    </span>
                  </>
                ) : (
                  <>
                    <PresenceDot
                      presence={presenceMap[activeConv.participants.find((p) => p.id !== myId)?.id ?? ""]}
                      size={4}
                    />
                    <span className="text-[11px]" style={{ color: t.textSecondary }}>
                      {presenceMap[activeConv.participants.find((p) => p.id !== myId)?.id ?? ""]?.label ?? "Đang tải..."}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {activeIsGroup && (
              <button
                type="button"
                aria-label="Quản lý thành viên"
                title="Quản lý thành viên"
                onClick={() => setShowGroupMembers(true)}
                className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] transition-all hover:bg-white/10 hover:text-white"
                style={{ color: t.textSecondary }}
              >
                <Icon name="users2" size={16} />
              </button>
            )}
            <button
              type="button"
              aria-label="Gọi video"
              disabled={callStatus !== "idle"}
              onClick={() => {
                if (!activeConv || !onInitiateCall) return;
                if (callStatus !== "idle") return;
                const callee = activeConv.participants.find((p) => p.id !== myId);
                onInitiateCall(
                  activeConv.id,
                  callee?.id ?? "",
                  callee?.name ?? callee?.username ?? "Người dùng",
                  callee?.avatar ?? null,
                  activeIsGroup ? (activeConv.name ?? "Nhóm") : (callee?.name ?? callee?.username ?? "Người dùng"),
                  activeIsGroup
                );
              }}
              className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ color: t.textSecondary }}
            >
              <Icon name="videoCall" size={16} />
            </button>
            <button
              type="button"
              aria-label="Gọi thoại"
              disabled={callStatus !== "idle"}
              onClick={() => {
                if (!activeConv || !onInitiateCall) return;
                if (callStatus !== "idle") return;
                const callee = activeConv.participants.find((p) => p.id !== myId);
                onInitiateCall(
                  activeConv.id,
                  callee?.id ?? "",
                  callee?.name ?? callee?.username ?? "Người dùng",
                  callee?.avatar ?? null,
                  activeIsGroup ? (activeConv.name ?? "Nhóm") : (callee?.name ?? callee?.username ?? "Người dùng"),
                  activeIsGroup
                );
              }}
              className="flex size-8 items-center justify-center rounded-full text-[#a0a5b5] transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ color: t.textSecondary }}
            >
              <Icon name="phoneCall" size={16} />
            </button>
            <button
              type="button"
              aria-label="Đóng"
              onClick={close}
              className="flex size-8 items-center justify-center rounded-full transition-all hover:bg-white/10 hover:text-white"
              style={{ color: t.textSecondary }}
            >
              <Icon name="circleX" size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-center text-[12px]" style={{ color: t.textSecondary }}>
              Chưa có tin nhắn nào. Gửi lời chào!
            </p>
          )}
          {messages.map((msg) => {
            const isMe = msg.senderId === myId;
            const sender = activeConv.participants.find((p) => p.id === msg.senderId);
            return (
            <div
              key={msg.id}
              className={`flex w-full items-end gap-2 ${isMe ? "flex-row-reverse" : ""} animate-[msgIn_180ms_ease-out]`}
            >
              {!isMe && (
                <div className="size-6 shrink-0 overflow-hidden rounded-xl">
                  <SafeAvatar
                    src={sender?.avatar}
                    alt=""
                    name={sender?.name}
                    username={sender?.username}
                    className="size-full"
                  />
                </div>
              )}
              <div className="flex max-w-[220px] flex-col gap-0.5">
                {!isMe && activeIsGroup && (
                  <span className="px-1 text-[10px] font-semibold" style={{ color: t.textSecondary }}>
                    {sender?.nickname ?? sender?.name ?? sender?.username ?? "Người dùng"}
                  </span>
                )}
                <MessageBody
                  msg={msg}
                  kind={classifyMessage(msg)}
                  isMe={isMe}
                  t={t}
                />
              </div>
            </div>
          );
        })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          className="border-t p-3 transition-colors"
          style={{ background: t.surface, borderColor: t.border }}
        >
          {replyTo && (
            <div
              className="mb-2 flex items-center gap-2 rounded-lg border-l-2 px-2.5 py-1.5"
              style={{
                borderColor: t.accent,
                background: `${t.theirBubbleBg}80`,
              }}
            >
              <Icon name="cornerDownLeft" size={12} className="shrink-0" style={{ color: t.accent }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold" style={{ color: t.accent }}>
                  Trả lời
                </p>
                <p className="truncate text-[11px]" style={{ color: t.textSecondary }}>
                  {replyTo.content || "(đính kèm)"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 hover:text-white"
                style={{ color: t.textSecondary }}
                aria-label="Huỷ trả lời"
              >
                <Icon name="circleX" size={12} />
              </button>
            </div>
          )}
          <div className="relative">
            {voiceError && (
              <p className="mb-1 text-[10px] text-red-400">{voiceError}</p>
            )}

            {/* ─── GIF Panel ───────────────────────────────────────── */}
            {showGifPanel && (
              <div
                className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[280px] overflow-hidden rounded-2xl border shadow-2xl animate-[panelSlideUp_180ms_ease-out]"
                style={{ background: t.theirBubbleBg, borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-center gap-2 border-b p-2" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <input
                    autoFocus
                    type="text"
                    value={gifSearch}
                    onChange={(e) => setGifSearch(e.target.value)}
                    placeholder="Tìm GIF..."
                    className="min-w-0 flex-1 rounded-full bg-black/30 px-3 py-1 text-[12px] outline-none"
                    style={{ color: t.textPrimary }}
                  />
                  <button
                    type="button"
                    onClick={() => { setShowGifPanel(false); setGifSearch(""); }}
                    className="text-[10px]"
                    style={{ color: t.textSecondary }}
                  >
                    Đóng
                  </button>
                </div>
                <div className="max-h-[220px] overflow-y-auto p-2">
                  {filteredGifs.length === 0 ? (
                    <p className="py-4 text-center text-[11px]" style={{ color: t.textSecondary }}>
                      Không tìm thấy GIF.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {filteredGifs.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => handlePickGif(g)}
                          className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl transition-transform hover:scale-110 active:scale-95"
                          style={{ background: g.bg }}
                          title={g.label}
                        >
                          <span>{g.emoji}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Sticker Panel ───────────────────────────────────── */}
            {showStickerPanel && (
              <div
                className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[280px] overflow-hidden rounded-2xl border shadow-2xl animate-[panelSlideUp_180ms_ease-out]"
                style={{ background: t.theirBubbleBg, borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-center justify-between border-b p-2" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: t.textSecondary }}>
                    {STICKER_PACKS[stickerPackIdx].label}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowStickerPanel(false)}
                    className="text-[10px]"
                    style={{ color: t.textSecondary }}
                  >
                    Đóng
                  </button>
                </div>
                <div className="flex gap-1 overflow-x-auto border-b p-2" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  {STICKER_PACKS.map((p, i) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setStickerPackIdx(i)}
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        stickerPackIdx === i ? "bg-white/20" : "bg-black/20"
                      }`}
                      style={{ color: t.textPrimary }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-[180px] overflow-y-auto p-2">
                  <div className="grid grid-cols-4 gap-2">
                    {STICKER_PACKS[stickerPackIdx].stickers.map((s) => (
                      <button
                        key={s.emoji + s.label}
                        type="button"
                        onClick={() => handlePickSticker(s)}
                        className="group flex flex-col items-center gap-1 rounded-xl p-2 transition-all hover:scale-110 hover:bg-white/15 active:scale-95"
                        title={s.label}
                      >
                        <span className="text-3xl transition-transform group-hover:scale-110">{s.emoji}</span>
                        <span className="text-[9px]" style={{ color: t.textSecondary }}>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showEmoji && (
              <div
                className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[260px] overflow-y-auto rounded-2xl border p-2 shadow-2xl"
                style={{ background: t.theirBubbleBg, borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowEmoji(false)}
                    className="text-[10px]"
                    style={{ color: t.textSecondary }}
                  >
                    Đóng
                  </button>
                </div>
                {EMOJI_GROUPS.map((g) => (
                  <div key={g.label} className="mb-2">
                    <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: t.textSecondary }}>
                      {g.label}
                    </p>
                    <div className="grid grid-cols-8 gap-0.5">
                      {g.emojis.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => insertEmoji(e)}
                          className="flex aspect-square items-center justify-center rounded text-lg hover:bg-white/10"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── Voice Recording Bar (overlay khi đang ghi âm) ──── */}
            {isRecording && (
              <div
                className="absolute bottom-full left-0 right-0 z-30 mb-1 select-none animate-[panelSlideUp_160ms_ease-out]"
                style={{ transform: `translateX(${dragOffsetX}px)`, transition: dragStartRef.current ? "none" : "transform 200ms ease-out" }}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              >
                <div
                  className="flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-2xl"
                  style={{ background: t.theirBubbleBg, borderColor: "rgba(239,68,68,0.4)" }}
                >
                  <span
                    className="relative flex size-2.5 rounded-full"
                    style={{ animation: "micPulse 1.2s ease-out infinite" }}
                  >
                    <span className="absolute inset-0 rounded-full bg-red-500" />
                  </span>
                  <p className="flex-1 text-[12px] font-semibold text-red-400">
                    Đang ghi âm · {formatDuration(recordingMs)}
                  </p>
                  <span className="text-[10px]" style={{ color: t.textSecondary }}>
                    ← Kéo để huỷ
                  </span>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="rounded-full px-2 py-1 text-[11px] hover:bg-white/10"
                    style={{ color: t.textSecondary }}
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="rounded-full bg-red-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-red-600"
                  >
                    Gửi
                  </button>
                </div>
              </div>
            )}

            <div
              className="flex items-center gap-2 rounded-full px-3 py-2"
              style={{ background: t.theirBubbleBg }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={activeIsGroup ? "Gửi tin nhắn nhóm..." : "Gửi tin nhắn..."}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: t.textPrimary }}
              />
              <button
                type="button"
                aria-label="Nhãn dán"
                title="Nhãn dán"
                onClick={toggleSticker}
                className="flex size-7 items-center justify-center rounded-full text-base transition-all hover:scale-125 active:scale-95"
                style={{ color: showStickerPanel ? t.accent : t.textSecondary }}
              >
                🎭
              </button>
              <button
                type="button"
                aria-label="GIF"
                title="GIF"
                onClick={toggleGif}
                className="rounded-full px-1 py-1 text-[10px] font-black tracking-tight transition-all hover:scale-110 active:scale-95"
                style={{ color: showGifPanel ? t.accent : t.textSecondary }}
              >
                GIF
              </button>
              <button
                type="button"
                aria-label="Voice"
                title="Ghi âm"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!sendVoice}
                className="rounded-full p-1 transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
                style={{ color: isRecording ? "#ef4444" : t.textSecondary }}
              >
                <Icon name="mic" size={16} />
              </button>
              <button
                type="button"
                aria-label="Emoji"
                onClick={() => setShowEmoji((s: any) => !s)}
                className="rounded-full p-1 hover:bg-white/10"
                style={{ color: t.textSecondary }}
              >
                <Icon name="smile" size={16} />
              </button>
              <button
                type="button"
                aria-label="Đính kèm"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full p-1 hover:bg-white/10"
                style={{ color: t.textSecondary }}
              >
                <Icon name="paperclip" size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={handleFileChosen}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={(!input.trim() && !pendingFile) || sending || uploading}
                className="relative flex size-7 items-center justify-center rounded-[14px] text-white disabled:opacity-40 transition active:scale-95"
                style={{ backgroundImage: t.bubbleGradient }}
                aria-label="Gửi"
              >
                {uploading ? (
                  <span className="block size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Icon name="arrowRight" size={14} />
                )}
              </button>
            </div>
          </div>
          {pendingFile && (
            <div
              className="mt-2 flex items-center gap-2 overflow-hidden rounded-2xl border-2 p-1.5 animate-[bubbleIn_220ms_ease-out]"
              style={{ borderColor: t.accent + "55", background: `${t.theirBubbleBg}cc` }}
            >
              {pendingFile.kind === "image" && pendingFile.preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pendingFile.preview}
                  alt="preview"
                  className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                />
              )}
              {pendingFile.kind === "video" && pendingFile.preview && (
                <video src={pendingFile.preview} className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
              )}
              {pendingFile.kind === "file" && (
                <div
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: t.accent }}
                >
                  <Icon name="paperclip" size={18} className="text-white" />
                </div>
              )}
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-[11px] font-semibold" style={{ color: t.textPrimary }}>
                  {pendingFile.file.name}
                </p>
                <p className="text-[10px]" style={{ color: t.textSecondary }}>
                  {formatBytes(pendingFile.file.size)} · {pendingFile.kind === "image" ? "Ảnh" : pendingFile.kind === "video" ? "Video" : "Tệp"}
                </p>
                {uploading && (
                  <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="absolute inset-y-0 left-0 w-1/2 animate-shimmer rounded-full" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (pendingFile.preview) URL.revokeObjectURL(pendingFile.preview);
                  setPendingFile(null);
                }}
                aria-label="Huỷ đính kèm"
                className="flex size-7 shrink-0 items-center justify-center rounded-full transition hover:scale-110 hover:bg-white/10"
                style={{ color: t.textSecondary }}
              >
                <Icon name="circleX" size={14} />
              </button>
            </div>
          )}
          {uploading && (
            <p className="mt-1 text-[10px]" style={{ color: t.textSecondary }}>
              Đang tải tệp lên...
            </p>
          )}
        </div>
      </div>

      {/* Chat settings modal */}
      {showSettings && (
        <ChatSettingsModal
          conversationId={activeConv.id}
          isGroup={activeIsGroup}
          conversationName={
            activeIsGroup
              ? (activeConv.name ?? "Nhóm")
              : (activeConv.participants.find((p) => p.id !== myId)?.name ??
                activeConv.participants.find((p) => p.id !== myId)?.username ??
                "Người dùng")
          }
          participants={activeConv.participants}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* GroupMemberPanel */}
      {activeIsGroup && showGroupMembers && (
        <GroupMemberPanel
          conversationId={activeConv.id}
          conversationName={activeConv.name ?? "Nhóm"}
          myId={myId}
          canManage={
            activeConv.participants.find((p) => p.id === myId)?.role === "creator" ||
            activeConv.participants.find((p) => p.id === myId)?.role === "admin"
          }
          members={activeConv.participants.map((p) => ({
            id: p.id,
            name: p.name,
            username: p.username,
            avatar: p.avatar,
            role: (p.role ?? "member") as "creator" | "admin" | "member",
            nickname: p.nickname ?? null,
          }))}
          onClose={() => setShowGroupMembers(false)}
          onMembersChange={onMembersChange ?? (() => {})}
        />
      )}

      {/* Video call — outgoing (connecting/connected) */}
      {(callStatus === "connecting" || callStatus === "connected") && !incomingCall && (
        <VideoCallModal
          callId={callId ?? undefined}
          conversationId={activeConv.id}
          conversationName={
            activeIsGroup
              ? (activeConv.name ?? "Nhóm")
              : (activeConv.participants.find((p) => p.id !== myId)?.name ??
                activeConv.participants.find((p) => p.id !== myId)?.username ??
                "Người dùng")
          }
          participants={activeConv.participants}
          isGroup={activeIsGroup}
          myId={myId}
          isOutgoing={true}
          remoteName={
            activeIsGroup
              ? undefined
              : activeConv.participants.find((p) => p.id !== myId)?.name ??
                activeConv.participants.find((p) => p.id !== myId)?.username
          }
          remoteAvatar={
            activeIsGroup ? undefined : activeConv.participants.find((p) => p.id !== myId)?.avatar
          }
          onClose={onEndCall ?? (() => {})}
          localStream={webrtc?.localStream}
          remoteStream={webrtc?.remoteStream}
          connectionState={webrtc?.connectionState}
          toggleMic={webrtc?.toggleMic}
          toggleCamera={webrtc?.toggleCamera}
          micOn={webrtc?.micOn}
          cameraOn={webrtc?.cameraOn}
        />
      )}

      {/* Video call — connected incoming */}
      {callStatus === "connected" && callId && callerInfo && incomingCall && (
        <VideoCallModal
          callId={callId}
          conversationId={incomingCall?.conversationId ?? callId}
          conversationName={incomingCall?.conversationName ?? "Cuộc gọi"}
          participants={[
            {
              id: callerInfo.id,
              name: callerInfo.name,
              username: callerInfo.name,
              avatar: callerInfo.avatar,
            },
          ]}
          isGroup={incomingCall?.isGroup ?? false}
          myId={myId}
          isOutgoing={false}
          remoteName={callerInfo.name}
          remoteAvatar={callerInfo.avatar ?? null}
          onClose={() => onEndCall?.()}
          localStream={webrtc?.localStream}
          remoteStream={webrtc?.remoteStream}
          connectionState={webrtc?.connectionState}
          toggleMic={webrtc?.toggleMic}
          toggleCamera={webrtc?.toggleCamera}
          micOn={webrtc?.micOn}
          cameraOn={webrtc?.cameraOn}
        />
      )}
    </div>
  );
}
