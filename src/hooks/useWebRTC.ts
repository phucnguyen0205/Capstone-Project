import { useState, useRef, useEffect, useCallback } from "react";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useWebRTC() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const pc = useRef<RTCPeerConnection | null>(null);
  const onSignalCallback = useRef<((payload: any) => void) | null>(null);

  // Initialize peer connection (without creating offer yet)
  const initConnection = useCallback(async () => {
    if (pc.current) return; // Already initialized

    try {
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);

      // Create peer connection
      const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.current = peerConnection;

      // Add local tracks
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      // Handle connection state
      peerConnection.onconnectionstatechange = () => {
        setConnectionState(peerConnection.connectionState);
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && onSignalCallback.current) {
          onSignalCallback.current({
            type: "candidate",
            candidate: event.candidate.toJSON(),
          });
        }
      };

      console.log("[useWebRTC] Peer connection initialized");
    } catch (err) {
      console.error("[useWebRTC] Failed to initialize:", err);
    }
  }, []);

  // Start call by creating and sending offer (caller only)
  const startCall = useCallback(async () => {
    // Wait for peer connection to be ready (max 3 seconds)
    let attempts = 0;
    while (!pc.current && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!pc.current) {
      console.error("[useWebRTC] Cannot start call: no peer connection after 3s");
      return;
    }

    try {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      
      if (onSignalCallback.current) {
        onSignalCallback.current({
          type: "offer",
          sdp: offer.sdp,
        });
      }
      console.log("[useWebRTC] Offer created and sent");
    } catch (err) {
      console.error("[useWebRTC] Failed to create offer:", err);
    }
  }, []);

  // Handle incoming signaling messages
  const handleSignal = useCallback(async (signal: any) => {
    if (!pc.current) {
      console.warn("[useWebRTC] No peer connection, ignoring signal:", signal.type);
      return;
    }

    try {
      if (signal.type === "offer") {
        console.log("[useWebRTC] Received offer, creating answer");
        await pc.current.setRemoteDescription(new RTCSessionDescription({
          type: "offer",
          sdp: signal.sdp,
        }));

        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);

        if (onSignalCallback.current) {
          onSignalCallback.current({
            type: "answer",
            sdp: answer.sdp,
          });
        }
        console.log("[useWebRTC] Answer created and sent");
      } else if (signal.type === "answer") {
        console.log("[useWebRTC] Received answer");
        await pc.current.setRemoteDescription(new RTCSessionDescription({
          type: "answer",
          sdp: signal.sdp,
        }));
      } else if (signal.type === "candidate") {
        console.log("[useWebRTC] Received ICE candidate");
        await pc.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error("[useWebRTC] Failed to handle signal:", err);
    }
  }, []);

  // Set callback for sending signaling messages
  const setOnSignal = useCallback((callback: (payload: any) => void) => {
    onSignalCallback.current = callback;
  }, []);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMicOn((prev) => !prev);
    }
  }, [localStream]);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setCameraOn((prev) => !prev);
    }
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pc.current) {
        pc.current.close();
        pc.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  return {
    localStream,
    remoteStream,
    connectionState,
    micOn,
    cameraOn,
    initConnection,
    startCall,
    handleSignal,
    setOnSignal,
    toggleMic,
    toggleCamera,
  };
}
