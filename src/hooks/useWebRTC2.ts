import { useRef, useCallback, useState, useEffect } from 'react';

interface UseWebRTC2Options {
  polite?: boolean;
  iceServers?: RTCIceServer[];
  onSignal?: (kind: string, payload: Record<string, any>) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export function useWebRTC2(options: UseWebRTC2Options = {}) {
  const {
    polite = false,
    iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    onSignal,
    onRemoteStream,
    onConnectionStateChange,
  } = options;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const iceBufferRef = useRef<Array<{ candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }>>([]);

  // Refs cho callbacks để tránh stale closure khi peer connection được tạo
  // trước khi useCallNotifications2 cập nhật callback mới.
  const onSignalRef = useRef(onSignal);
  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);
  const onRemoteStreamRef = useRef(onRemoteStream);
  useEffect(() => {
    onRemoteStreamRef.current = onRemoteStream;
  }, [onRemoteStream]);
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);
  useEffect(() => {
    onConnectionStateChangeRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const initialize = useCallback(async () => {
    if (pcRef.current) {
      console.log('[WebRTC] Already initialized');
      return;
    }

    try {
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers });

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Handle remote tracks
      pc.ontrack = (event) => {
        console.log('[WebRTC] Remote track:', event.track.kind);
        if (event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          setRemoteStream(event.streams[0]);
          onRemoteStreamRef.current?.(event.streams[0]);
        }
      };

      // Connection state
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        setConnectionState(pc.connectionState);
        onConnectionStateChangeRef.current?.(pc.connectionState);

        if (pc.connectionState === 'failed') {
          console.log('[WebRTC] Connection failed, restarting ICE');
          pc.restartIce();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
        setIceConnectionState(pc.iceConnectionState);
      };

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && onSignalRef.current) {
          onSignalRef.current('ice', {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          });
        }
      };

      // Perfect negotiation
      pc.onnegotiationneeded = async () => {
        try {
          console.log('[WebRTC] Negotiation needed (polite:', polite, ')');
          makingOfferRef.current = true;

          await pc.setLocalDescription();
          const desc = pc.localDescription;

          if (desc && onSignalRef.current) {
            onSignalRef.current('offer', {
              type: desc.type,
              sdp: desc.sdp,
            });
            console.log('[WebRTC] Offer sent');
          }
        } catch (err) {
          console.error('[WebRTC] Negotiation error:', err);
        } finally {
          makingOfferRef.current = false;
        }
      };

      pcRef.current = pc;
      console.log('[WebRTC] Initialized');
    } catch (err) {
      console.error('[WebRTC] Initialization failed:', err);
      throw err;
    }
  }, [polite, iceServers, onSignal, onRemoteStream, onConnectionStateChange]);

  const triggerOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      console.warn('[WebRTC] Cannot trigger offer: not initialized');
      return;
    }
    try {
      if (pc.signalingState !== 'stable' || pc.localDescription) {
        console.log('[WebRTC] Skipping offer, state:', pc.signalingState);
        return;
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const desc = pc.localDescription as RTCSessionDescription | null;
      if (desc && onSignalRef.current) {
        onSignalRef.current('offer', { type: desc.type, sdp: desc.sdp ?? '' });
        console.log('[WebRTC] Manual offer sent');
      }
    } catch (err) {
      console.error('[WebRTC] triggerOffer failed:', err);
    }
  }, []);

  const flushIceBuffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const buffered = iceBufferRef.current.splice(0);
    for (const cand of buffered) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
        console.log('[WebRTC] Flushed buffered ICE');
      } catch (err) {
        if (!ignoreOfferRef.current) {
          console.error('[WebRTC] Flush ICE error:', err);
        }
      }
    }
  }, []);

  const handleSignal = useCallback(
    async (kind: string, payload: Record<string, any>) => {
      const pc = pcRef.current;
      if (!pc) {
        console.warn('[WebRTC] Cannot handle signal, not initialized');
        return;
      }

      try {
        if (kind === 'offer') {
          const offerCollision =
            payload.type === 'offer' &&
            (makingOfferRef.current || pc.signalingState !== 'stable');

          ignoreOfferRef.current = !polite && offerCollision;

          if (ignoreOfferRef.current) {
            console.log('[WebRTC] Ignoring offer (impolite collision)');
            return;
          }

          console.log('[WebRTC] Handling offer');
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          await pc.setLocalDescription();

          const desc = pc.localDescription;
          if (desc && onSignalRef.current) {
            onSignalRef.current('answer', {
              type: desc.type,
              sdp: desc.sdp ?? '',
            });
            console.log('[WebRTC] Answer sent');
          }

          // Flush buffered ICE candidates
          await flushIceBuffer();
        } else if (kind === 'answer') {
          console.log('[WebRTC] Handling answer');
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          await flushIceBuffer();
        } else if (kind === 'ice') {
          // Nếu chưa có remote description, buffer lại để xử lý sau
          if (!pc.remoteDescription) {
            console.log('[WebRTC] Buffering ICE candidate (no remote desc yet)');
            iceBufferRef.current.push({
              candidate: payload.candidate,
              sdpMid: payload.sdpMid ?? null,
              sdpMLineIndex: payload.sdpMLineIndex ?? null,
            });
            return;
          }
          console.log('[WebRTC] Adding ICE candidate');
          try {
            await pc.addIceCandidate(
              new RTCIceCandidate({
                candidate: payload.candidate,
                sdpMid: payload.sdpMid,
                sdpMLineIndex: payload.sdpMLineIndex,
              })
            );
          } catch (err) {
            if (!ignoreOfferRef.current) {
              console.error('[WebRTC] ICE candidate error:', err);
            }
          }
        }
      } catch (err) {
        console.error('[WebRTC] Signal handling error:', err);
      }
    },
    [polite, onSignal]
  );

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicOn(audioTracks[0]?.enabled ?? false);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setCameraOn(videoTracks[0]?.enabled ?? false);
  }, []);

  const cleanup = useCallback(async () => {
    console.log('[WebRTC] Cleaning up');

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    iceBufferRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState(null);
    setIceConnectionState(null);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    localStream,
    remoteStream,
    connectionState,
    iceConnectionState,
    micOn,
    cameraOn,
    initialize,
    handleSignal,
    triggerOffer,
    toggleMic,
    toggleCamera,
    cleanup,
  };
}
