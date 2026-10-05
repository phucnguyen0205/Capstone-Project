"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { proxyAvatar } from "@/lib/avatar";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Participant {
  id: string;
  name: string | null;
  username: string;
  avatar: string | null;
}

/* ─── Main Component ───────────────────────────────────────────────────── */

interface VideoCallModalProps {
  callId?: string;
  conversationId: string;
  conversationName: string;
  participants: Participant[];
  isGroup: boolean;
  myId: string;
  /** If true, show "calling" state for outgoing; if false, show "incoming" state */
  isOutgoing: boolean;
  /** Remote user's info (for incoming calls) */
  remoteName?: string;
  remoteAvatar?: string | null;
  onClose: (callId?: string) => void;
  /** WebRTC streams and controls from useWebRTC hook */
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  connectionState?: RTCPeerConnectionState;
  toggleMic?: () => void;
  toggleCamera?: () => void;
  micOn?: boolean;
  cameraOn?: boolean;
}

export function VideoCallModal({
  callId,
  conversationId,
  conversationName,
  participants,
  isGroup,
  myId,
  isOutgoing,
  remoteName,
  remoteAvatar,
  onClose,
  localStream: externalLocalStream,
  remoteStream: externalRemoteStream,
  connectionState = "new",
  toggleMic: externalToggleMic,
  toggleCamera: externalToggleCamera,
  micOn: externalMicOn = true,
  cameraOn: externalCameraOn = true,
}: VideoCallModalProps) {
  const [duration, setDuration] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localStream = externalLocalStream;
  const remoteStream = externalRemoteStream;
  const micOn = externalMicOn;
  const cameraOn = externalCameraOn;
  const calling = connectionState === "new" || connectionState === "connecting";
  const connected = connectionState === "connected";

  /* Attach local and remote streams to video elements */
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  /* Start timer when connected */
  useEffect(() => {
    if (connected && !timerRef.current) {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [connected]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function endCall() {
    if (timerRef.current) clearInterval(timerRef.current);
    onClose(callId);
  }

  const otherParticipants = participants.filter((p) => p.id !== myId);

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col"
      style={{
        background: "linear-gradient(135deg, #0a0c1e 0%, #1a0a2e 50%, #0d1a2e 100%)",
      }}
    >
      {/* ── Animated background ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 size-96 animate-pulse rounded-full bg-gradient-to-br from-violet-600/20 to-fuchsia-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 size-80 animate-pulse rounded-full bg-gradient-to-br from-cyan-600/15 to-blue-500/10 blur-3xl" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* ── Header ── */}
      <div className="relative z-10 flex shrink-0 items-center justify-between px-5 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-md">
            <span className="text-xl">📹</span>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-white">{conversationName}</h2>
            <p className="text-[11px] text-[#94a3b8]">
              {calling ? "Đang kết nối..." : connected ? `Đang gọi · ${formatTime(duration)}` : "Cuộc gọi kết thúc"}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        {connected && !calling && (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1.5 backdrop-blur-md">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-300">
              {isGroup ? `${participants.length} người` : "Đã kết nối"}
            </span>
          </div>
        )}
      </div>

      {/* ── Video area ── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
        {/* Connecting state */}
        {calling && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-violet-500/40 to-pink-500/40 opacity-50" />
              <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-pink-500 shadow-2xl shadow-violet-500/30">
                {isOutgoing
                  ? (otherParticipants[0]?.avatar ? (
                    <img src={proxyAvatar(otherParticipants[0].avatar) ?? ""} alt="" className="size-full rounded-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-white">
                      {otherParticipants[0]?.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  ))
                  : (remoteAvatar ? (
                    <img src={remoteAvatar} alt="" className="size-full rounded-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-white">
                      {remoteName?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  ))
                }
              </div>
            </div>
            <div>
              <p className="text-[16px] font-bold text-white">
                {isOutgoing ? conversationName : (remoteName ?? conversationName)}
              </p>
              <p className="mt-1 text-[12px] text-[#94a3b8]">
                {isOutgoing ? "Đang gọi..." : "Cuộc gọi đến..."}
              </p>
            </div>
            {/* Pulse rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="size-24 animate-ping rounded-full border border-violet-500/30 opacity-0" style={{ animationDelay: "0.3s" }} />
              <div className="absolute size-32 animate-ping rounded-full border border-pink-500/20 opacity-0" style={{ animationDelay: "0.8s" }} />
            </div>
          </div>
        )}

        {/* Connected — group grid */}
        {connected && !calling && isGroup && (
          <div className="grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-3">
            {/* Self */}
            <VideoTile
              participant={{
                name: "Bạn",
                avatar: null,
                isYou: true,
              }}
              videoRef={localVideoRef}
              cameraOn={cameraOn}
            />
            {otherParticipants.map((p) => (
              <VideoTile
                key={p.id}
                participant={{
                  name: p.name ?? p.username,
                  avatar: p.avatar,
                  isYou: false,
                }}
                videoRef={null}
                cameraOn={true}
              />
            ))}
          </div>
        )}

        {/* Connected — 1-on-1 */}
        {connected && !calling && !isGroup && (
          <div className="relative flex w-full max-w-lg flex-col items-center gap-4">
            {/* Remote video */}
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-2xl">
              {remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 to-pink-600/20" />
                  {otherParticipants[0]?.avatar ? (
                    <img
                      src={otherParticipants[0].avatar}
                      alt=""
                      className="absolute inset-0 size-full object-cover opacity-50 blur-sm"
                    />
                  ) : null}
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-pink-500 shadow-xl">
                      {otherParticipants[0]?.avatar ? (
                        <img src={proxyAvatar(otherParticipants[0].avatar) ?? ""} alt="" className="size-full rounded-full object-cover" />
                      ) : (
                        <span className="text-3xl font-black text-white">
                          {otherParticipants[0]?.name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                    </div>
                    <p className="text-[14px] font-bold text-white">{otherParticipants[0]?.name ?? otherParticipants[0]?.username}</p>
                    <p className="text-[11px] text-white/60">Đang tham gia...</p>
                  </div>
                </>
              )}
              {/* Duration overlay */}
              <div className="absolute top-3 right-3 rounded-full bg-black/50 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                {formatTime(duration)}
              </div>
            </div>

            {/* Self preview */}
            <div className="relative w-32 overflow-hidden rounded-xl border border-white/20 shadow-xl">
              {cameraOn && localStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-[#1a1a2e]">
                  <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-500">
                    <span className="text-lg font-black text-white">
                      {myId[0]?.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-md">
                Bạn
              </div>
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/20">
              <span className="text-2xl">📷</span>
            </div>
            <p className="text-[13px] font-semibold text-white">{cameraError}</p>
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="relative z-10 flex shrink-0 items-center justify-center gap-4 px-4 pb-8 pt-4 backdrop-blur-md">
        {/* Mic toggle */}
        <ControlButton
          icon={micOn ? "mic" : "micOff"}
          label={micOn ? "Tắt mic" : "Bật mic"}
          active={micOn}
          onClick={externalToggleMic || (() => {})}
          gradient={micOn ? "from-[#06b6d4]" : "from-[#ef4444]"}
        />

        {/* Camera toggle */}
        <ControlButton
          icon={cameraOn ? "video" : "cameraOff"}
          label={cameraOn ? "Tắt camera" : "Bật camera"}
          active={cameraOn}
          onClick={externalToggleCamera || (() => {})}
          gradient={cameraOn ? "from-[#8b5cf6]" : "from-[#ef4444]"}
          large
        />

        {/* End call */}
        <button
          onClick={endCall}
          className="flex size-16 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-500/40 transition-all hover:scale-110 active:scale-95"
          aria-label="Kết thúc cuộc gọi"
        >
          <Icon name="phoneCall" size={22} className="rotate-[135deg] text-white" />
        </button>

        {/* Group: add participant */}
        {isGroup && (
          <ControlButton
            icon="userPlus"
            label="Mời"
            active={true}
            onClick={() => {}}
            gradient="from-[#10b981]"
          />
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   VIDEO TILE (for group)
   ═════════════════════════════════════════════════════════════════════════ */

function VideoTile({
  participant,
  videoRef,
  cameraOn,
}: {
  participant: { name: string; avatar: string | null; isYou: boolean };
  videoRef: React.RefObject<HTMLVideoElement | null> | null;
  cameraOn: boolean;
}) {
  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-xl">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 to-pink-600/10" />

      {/* Avatar */}
      {participant.avatar ? (
        <img
          src={participant.avatar}
          alt=""
          className={`absolute inset-0 size-full object-cover transition-opacity ${cameraOn ? "opacity-20" : "opacity-60"}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-pink-500">
            <span className="text-xl font-black text-white">
              {participant.name[0]?.toUpperCase()}
            </span>
          </div>
        </div>
      )}

        {/* Video stream */}
        {cameraOn && participant.isYou && videoRef ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
        {participant.isYou ? "Bạn" : participant.name}
      </div>

      {/* Camera off overlay */}
      {!cameraOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Icon name="cameraOff" size={20} className="text-white/60" />
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   CONTROL BUTTON
   ═════════════════════════════════════════════════════════════════════════ */

function ControlButton({
  icon,
  label,
  active,
  onClick,
  gradient,
  large = false,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  gradient: string;
  large?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 ${
        large ? "size-16" : "size-12"
      } ${active ? `bg-gradient-to-br ${gradient} text-white shadow-black/20` : "bg-white/10 text-white/60 shadow-black/10"}`}
    >
      <Icon
        name={icon as any}
        size={large ? 20 : 16}
      />
    </button>
  );
}
