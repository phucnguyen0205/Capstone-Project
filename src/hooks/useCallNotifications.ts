"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebRTC } from "./useWebRTC";

export type CallStatus = "idle" | "ringing" | "connecting" | "connected" | "declined" | "ended";

export interface IncomingCall {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  conversationId: string;
  conversationName: string;
  isGroup: boolean;
}

interface CallState {
  status: CallStatus;
  incomingCall: IncomingCall | null;
  /** Saved caller info for VideoCallModal after incomingCall is cleared */
  callerInfo: { id: string; name: string; avatar: string | null } | null;
  outgoingCall: { conversationId: string; conversationName: string } | null;
  callId: string | null;
  error: string | null;
}

export function useCallNotifications() {
  const [state, setState] = useState<CallState>({
    status: "idle",
    incomingCall: null,
    callerInfo: null,
    outgoingCall: null,
    callId: null,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  // Guards against double-click / rapid taps triggering duplicate
  // POST /api/calls/initiate calls (which the server rejects with 409
  // because the first one already created a "ringing" entry).
  const initiateInFlight = useRef(false);

  const webrtc = useWebRTC();

  // Setup WebRTC signal callback
  useEffect(() => {
    if (!state.callId) return;
    
    webrtc.setOnSignal(async (payload: any) => {
      try {
        await fetch("/api/calls/signal", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            callId: state.callId, 
            kind: payload.type === "offer" ? "offer" : payload.type === "answer" ? "answer" : "ice",
            payload: payload.type === "candidate" ? {
              candidate: payload.candidate.candidate,
              sdpMid: payload.candidate.sdpMid,
              sdpMLineIndex: payload.candidate.sdpMLineIndex,
            } : { sdp: payload.sdp },
          }),
        });
        console.log("[useCallNotifications] Signal sent:", payload.type);
      } catch (err) {
        console.error("[useCallNotifications] Failed to send signal:", err);
      }
    });
  }, [state.callId, webrtc]);

  const connect = useCallback(() => {
    if (!isMounted.current) return;
    if (typeof window === "undefined") return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/calls/stream");
    eventSourceRef.current = es;

    es.onmessage = async (e) => {
      if (!isMounted.current) return;
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === "incoming_call") {
          const call = msg.call as IncomingCall;
          setState((s) => ({
            ...s,
            status: "ringing",
            incomingCall: call,
            callId: call.id,
          }));
        }

        if (msg.type === "call_update") {
          const call = msg.call;
          if (call.state === "accepted") {
            setState((s) => ({
              ...s,
              status: "connecting",
              incomingCall: s.incomingCall ?? null,
            }));
            
            // Caller starts WebRTC offer when callee accepts
            if (state.outgoingCall && call.id) {
              console.log("[useCallNotifications] Call accepted, creating offer as caller");
              webrtc.startCall().catch(err => 
                console.error("[useCallNotifications] Failed to create offer:", err)
              );
            }
          } else if (call.state === "declined" || call.state === "ended") {
            setState((s) => ({
              ...s,
              status: call.state === "declined" ? "declined" : "ended",
              incomingCall: null,
              outgoingCall: null,
              callId: null,
            }));
            // Reset after 2s
            setTimeout(() => {
              if (isMounted.current) {
                setState((s) =>
                  s.status === "declined" || s.status === "ended"
                    ? { ...s, status: "idle", incomingCall: null, callId: null }
                    : s
                );
              }
            }, 2000);
          }
        }

        // Handle signaling events
        if (msg.type === "call_signal") {
          const { signal } = msg;
          console.log("[useCallNotifications] Received signal:", signal.kind);
          
          if (signal.kind === "offer") {
            // Callee receives offer, initialize connection and handle it
            await webrtc.initConnection();
            await webrtc.handleSignal({ type: "offer", sdp: signal.payload.sdp });
            setState((s) => ({ ...s, status: "connected" }));
          } else if (signal.kind === "answer") {
            await webrtc.handleSignal({ type: "answer", sdp: signal.payload.sdp });
            setState((s) => ({ ...s, status: "connected" }));
          } else if (signal.kind === "ice") {
            await webrtc.handleSignal({ 
              type: "candidate", 
              candidate: {
                candidate: signal.payload.candidate,
                sdpMid: signal.payload.sdpMid,
                sdpMLineIndex: signal.payload.sdpMLineIndex,
              }
            });
          } else if (signal.kind === "hangup") {
            setState((s) => ({ ...s, status: "ended", incomingCall: null, outgoingCall: null, callId: null }));
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      // Reconnect after 3s
      if (isMounted.current) {
        reconnectTimeout.current = setTimeout(connect, 3000);
      }
    };
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      eventSourceRef.current?.close();
    };
  }, [connect]);

  /** Initiate a call to another user */
  const initiateCall = useCallback(
    async (conversationId: string, calleeId: string, calleeName: string, calleeAvatar: string | null, conversationName: string, isGroup: boolean) => {
      // Bail out if a request is already on the wire or the user is
      // currently in any non-idle state. Without this, a double-click
      // sends two POSTs within a few milliseconds — the second one
      // hits the server after the first has registered the call in the
      // in-memory map, so /api/calls/initiate replies with 409
      // "Bạn đang có cuộc gọi khác" even though the UI just looks
      // stuck.
      if (initiateInFlight.current) return false;
      if (state.status !== "idle" && state.status !== "declined" && state.status !== "ended") {
        return false;
      }
      initiateInFlight.current = true;
      setState((s) => ({
        ...s,
        status: "connecting",
        outgoingCall: { conversationId, conversationName },
        error: null,
      }));
      try {
        // Initialize WebRTC connection FIRST (get local stream + create peer connection)
        // but DON'T create offer yet - wait for callee to accept
        console.log("[useCallNotifications] Initializing WebRTC as caller");
        await webrtc.initConnection();
        
        const res = await fetch("/api/calls/initiate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, calleeId, calleeName, calleeAvatar, conversationName, isGroup }),
        });
        const data = await res.json();
        if (!res.ok) {
          // Roll back the optimistic state so the UI isn't stuck on
          // "connecting" after a server-side rejection.
          setState((s) => ({ ...s, status: "idle", outgoingCall: null, error: data.error }));
          return false;
        }
        setState((s) => ({ ...s, callId: data.call.id }));
        
        return true;
      } catch {
        setState((s) => ({ ...s, status: "idle", outgoingCall: null, error: "Lỗi kết nối" }));
        return false;
      } finally {
        initiateInFlight.current = false;
      }
    },
    [state.status, webrtc]
  );

  /** Accept an incoming call */
  const acceptCall = useCallback(async (callId: string) => {
    try {
      const res = await fetch("/api/calls/answer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, action: "accept" }),
      });
      if (res.ok) {
        setState((s) => ({
          ...s,
          status: "connecting",
          callerInfo: s.incomingCall
            ? { id: s.incomingCall.callerId, name: s.incomingCall.callerName, avatar: s.incomingCall.callerAvatar }
            : null,
        }));
        // Callee waits for offer via SSE
      }
    } catch { /* ignore */ }
  }, []);

  /** Decline an incoming call */
  const declineCall = useCallback(async (callId: string) => {
    try {
      await fetch("/api/calls/answer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, action: "decline" }),
      });
    } catch { /* ignore */ }
    setState((s) => ({ ...s, status: "idle", incomingCall: null, callId: null }));
  }, []);

  /** End an active call */
  const endCall = useCallback(async () => {
    if (!state.callId) return;
    
    try {
      await fetch("/api/calls/signal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: state.callId, kind: "hangup" }),
      });
      await fetch("/api/calls/answer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: state.callId, action: "end" }),
      });
    } catch { /* ignore */ }
    
    setState((s) => ({ ...s, status: "ended", incomingCall: null, outgoingCall: null, callId: null }));
    setTimeout(() => {
      if (isMounted.current) setState((s) => ({ ...s, status: "idle" }));
    }, 2000);
  }, [state.callId]);

  return {
    callStatus: state.status,
    incomingCall: state.incomingCall,
    callerInfo: state.callerInfo,
    outgoingCall: state.outgoingCall,
    callId: state.callId,
    error: state.error,
    initiateCall,
    acceptCall,
    declineCall,
    endCall,
    webrtc: {
      localStream: webrtc.localStream,
      remoteStream: webrtc.remoteStream,
      connectionState: webrtc.connectionState,
      toggleMic: webrtc.toggleMic,
      toggleCamera: webrtc.toggleCamera,
      micOn: webrtc.micOn,
      cameraOn: webrtc.cameraOn,
    },
  };
}
