import { useState, useCallback, useEffect, useRef } from 'react';
import { useCallSocket } from './useCallSocket';
import { useWebRTC2 } from './useWebRTC2';
import { CallRecord, CallState } from '@/lib/callTypes';

type CallStatus = 'idle' | 'ringing' | 'connecting' | 'connected' | 'declined' | 'ended' | 'timeout' | 'error';

export function useCallNotifications2() {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);

  // Incoming call data
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);

  // Outgoing call data
  const [outgoingCall, setOutgoingCall] = useState<{
    conversationId: string;
    conversationName: string;
  } | null>(null);

  // WebSocket
  const socket = useCallSocket({ autoConnect: true });

  // Refs cho closure trong socket handlers
  const isCallerRef = useRef(isCaller);
  const currentCallIdRef = useRef(currentCallId);
  useEffect(() => { isCallerRef.current = isCaller; }, [isCaller]);
  useEffect(() => { currentCallIdRef.current = currentCallId; }, [currentCallId]);

  // Ref để useWebRTC2.onSignal không bị stale closure khi currentCallId đổi.
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // WebRTC
  const webrtc = useWebRTC2({
    polite: !isCaller,
    iceServers,
    onSignal: (kind, payload) => {
      const id = currentCallIdRef.current;
      if (id) {
        socketRef.current.sendSignal(id, kind, payload);
      }
    },
    onRemoteStream: (stream) => {
      console.log('[CallNotifications] Remote stream received');
    },
    onConnectionStateChange: (state) => {
      if (state === 'connected' && callStatusRef.current === 'connecting') {
        setCallStatus('connected');

        // Notify server
        const id = currentCallIdRef.current;
        if (id) {
          fetch('/api/calls/v2/connected', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId: id }),
          }).catch((err) => {
            console.error('[CallNotifications] Failed to notify connected:', err);
          });
        }
      } else if (state === 'failed' || state === 'disconnected') {
        setError('Connection lost');
      }
    },
  });

  // ---- Refs để listeners trong socket không bị re-register khi state đổi ----
  const webrtcRef = useRef(webrtc);
  useEffect(() => {
    webrtcRef.current = webrtc;
  }, [webrtc]);
  const callStatusRef = useRef(callStatus);
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);
  const handleCallEndRef = useRef<() => void>(() => {});
  const handleCallEnd = useCallback(() => {
    webrtc.cleanup();
    setTimeout(() => {
      setCallStatus('idle');
      setCurrentCallId(null);
      setIncomingCall(null);
      setOutgoingCall(null);
      setError(null);
    }, 2000);
  }, [webrtc]);
  useEffect(() => {
    handleCallEndRef.current = handleCallEnd;
  }, [handleCallEnd]);

  // Load ICE servers
  useEffect(() => {
    fetch('/api/calls/v2/ice-servers')
      .then((res) => res.json())
      .then((data) => {
        if (data.iceServers) {
          setIceServers(data.iceServers);
          console.log('[CallNotifications] ICE servers loaded:', data.iceServers.length);
        }
      })
      .catch((err) => {
        console.error('[CallNotifications] Failed to load ICE servers:', err);
      });
  }, []);

  // Socket event handlers — chỉ register MỘT LẦN khi socket ref xuất hiện.
  // Mọi state bên trong handler phải đọc qua ref (webrtcRef, currentCallIdRef,
  // isCallerRef, callStatusRef, handleCallEndRef) để tránh stale closure và
  // tránh phải cleanup/re-register mỗi khi state đổi (gây mất event).
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Incoming call
    cleanups.push(
      socket.on('incoming_call', (data: { call: CallRecord }) => {
        console.log('[CallNotifications] Incoming call:', data.call.id);
        setIncomingCall(data.call);
        setCurrentCallId(data.call.id);
        setIsCaller(false);
        setCallStatus('ringing');
      })
    );

    // Call update
    cleanups.push(
      socket.on('call_update', (data: { call: CallRecord }) => {
        console.log('[CallNotifications] Call update:', data.call.state);

        if (data.call.state === CallState.CONNECTING) {
          setCallStatus('connecting');
          // Caller: chủ động tạo offer khi callee accept
          if (isCallerRef.current) {
            console.log('[CallNotifications] Caller creating offer after CONNECTING');
            setTimeout(() => {
              webrtcRef.current.triggerOffer().catch((err: any) =>
                console.error('[CallNotifications] triggerOffer failed:', err)
              );
            }, 300);
          }
        } else if (data.call.state === CallState.CONNECTED) {
          setCallStatus('connected');
        } else if (data.call.state === CallState.DECLINED) {
          setCallStatus('declined');
          handleCallEndRef.current();
        } else if (data.call.state === CallState.ENDED) {
          setCallStatus('ended');
          handleCallEndRef.current();
        } else if (data.call.state === CallState.TIMEOUT) {
          setCallStatus('timeout');
          setError('No answer');
          handleCallEndRef.current();
        }
      })
    );

    // Call signal
    cleanups.push(
      socket.on('call_signal', async (data: { signal: { kind: string; payload: Record<string, any> } }) => {
        console.log('[CallNotifications] Received signal:', data.signal.kind);
        const w = webrtcRef.current;

        // Callee: khởi tạo WebRTC khi nhận offer đầu tiên
        if (data.signal.kind === 'offer' && !w.localStream) {
          try {
            console.log('[CallNotifications] Initializing WebRTC as callee');
            await w.initialize();
          } catch (err) {
            console.error('[CallNotifications] WebRTC init failed:', err);
            setError('Failed to access camera/microphone');
            return;
          }
        }

        await w.handleSignal(data.signal.kind, data.signal.payload);
      })
    );

    // Call ended
    cleanups.push(
      socket.on('call_ended', () => {
        console.log('[CallNotifications] Call ended');
        setCallStatus('ended');
        handleCallEndRef.current();
      })
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [socket]);

  const initiateCall = useCallback(
    async (
      conversationId: string,
      calleeId: string,
      calleeName: string,
      calleeAvatar: string | undefined,
      conversationName: string,
      isGroup: boolean
    ): Promise<boolean> => {
      if (callStatus !== 'idle') {
        console.warn('[CallNotifications] Already in a call');
        return false;
      }

      setCallStatus('connecting');
      setIsCaller(true);
      setOutgoingCall({ conversationId, conversationName });
      setError(null);

      try {
        // Initialize WebRTC first (caller)
        console.log('[CallNotifications] Initializing WebRTC as caller');
        await webrtc.initialize();

        // Then initiate call on server
        const response = await fetch('/api/calls/v2/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            calleeId,
            calleeName,
            calleeAvatar,
            conversationName,
            isGroup,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to initiate call');
        }

        setCurrentCallId(data.call.id);
        setCallStatus('ringing');
        return true;
      } catch (err: any) {
        console.error('[CallNotifications] Initiate failed:', err);
        setError(err.message);
        setCallStatus('idle');
        setOutgoingCall(null);
        await webrtc.cleanup();
        return false;
      }
    },
    [callStatus, webrtc]
  );

  const acceptCall = useCallback(
    async (callId?: string) => {
      const id = callId || currentCallId;
      if (!id) return;

      try {
        const response = await fetch('/api/calls/v2/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: id, action: 'accept' }),
        });

        if (!response.ok) {
          throw new Error('Failed to accept call');
        }

        setCallStatus('connecting');
      } catch (err: any) {
        console.error('[CallNotifications] Accept failed:', err);
        setError(err.message);
      }
    },
    [currentCallId]
  );

  const declineCall = useCallback(
    async (callId?: string) => {
      const id = callId || currentCallId;
      if (!id) return;

      try {
        await fetch('/api/calls/v2/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: id, action: 'decline' }),
        });
      } catch (err) {
        console.error('[CallNotifications] Decline failed:', err);
      }

      setCallStatus('idle');
      setCurrentCallId(null);
      setIncomingCall(null);
      await webrtc.cleanup();
    },
    [currentCallId, webrtc]
  );

  const endCall = useCallback(async () => {
    if (!currentCallId) return;

    try {
      await fetch('/api/calls/v2/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: currentCallId, action: 'end' }),
      });
    } catch (err) {
      console.error('[CallNotifications] End failed:', err);
    }

    setCallStatus('ended');
    handleCallEnd();
  }, [currentCallId, handleCallEnd]);

  // Derive callerInfo from incomingCall for backward compatibility
  const callerInfo = incomingCall
    ? {
        id: incomingCall.callerId,
        name: incomingCall.callerName,
        avatar: incomingCall.callerAvatar,
      }
    : null;

  return {
    callStatus,
    incomingCall,
    outgoingCall,
    callerInfo,
    callId: currentCallId,
    socketConnected: socket.connected,
    error,
    initiateCall,
    acceptCall,
    declineCall,
    endCall,
    webrtc,
  };
}
