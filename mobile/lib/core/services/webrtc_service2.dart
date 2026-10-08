import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Modern WebRTC service with perfect negotiation pattern.
/// Eliminates race conditions and improves reliability.
class WebRtcService2 {
  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;
  
  final void Function(String kind, Map<String, dynamic> payload)? onSignal;
  final void Function(MediaStream stream)? onRemoteStream;
  final void Function(RTCPeerConnectionState state)? onConnectionStateChange;
  
  bool _makingOffer = false;
  bool _ignoreOffer = false;
  bool _polite = false; // Is this peer "polite" in negotiation
  bool _disposed = false;

  final List<RTCIceServer> iceServers;

  WebRtcService2({
    this.onSignal,
    this.onRemoteStream,
    this.onConnectionStateChange,
    List<Map<String, dynamic>>? iceServers,
  }) : iceServers = iceServers?.map((s) => RTCIceServer(
          urls: s['urls'] is String ? s['urls'] as String : (s['urls'] as List).cast<String>(),
          username: s['username'] as String?,
          credential: s['credential'] as String?,
        )).toList() ?? 
        [
          RTCIceServer(url: 'stun:stun.l.google.com:19302'),
          RTCIceServer(url: 'stun:stun1.l.google.com:19302'),
        ];

  MediaStream? get localStream => _localStream;
  MediaStream? get remoteStream => _remoteStream;
  RTCPeerConnectionState? get connectionState => _peerConnection?.connectionState;
  RTCIceConnectionState? get iceConnectionState => _peerConnection?.iceConnectionState;

  /// Initialize peer connection and get local media
  Future<void> initialize({bool polite = false}) async {
    if (_disposed) throw StateError('Service disposed');
    if (_peerConnection != null) {
      if (kDebugMode) debugPrint('[WebRTC] Already initialized');
      return;
    }

    _polite = polite;

    try {
      // Get local media first
      _localStream = await navigator.mediaDevices.getUserMedia({
        'video': {
          'mandatory': {
            'minWidth': '640',
            'minHeight': '480',
            'minFrameRate': '15',
          },
          'facingMode': 'user',
          'optional': [],
        },
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
      });

      if (kDebugMode) debugPrint('[WebRTC] Local stream acquired');

      // Create peer connection
      _peerConnection = await createPeerConnection({
        'iceServers': iceServers.map((s) => s.toMap()).toList(),
        'sdpSemantics': 'unified-plan',
      });

      // Add local tracks
      _localStream!.getTracks().forEach((track) {
        _peerConnection!.addTrack(track, _localStream!);
      });

      // Handle remote tracks
      _peerConnection!.onTrack = (RTCTrackEvent event) {
        if (kDebugMode) debugPrint('[WebRTC] Remote track: ${event.track.kind}');
        
        if (event.streams.isNotEmpty) {
          _remoteStream = event.streams[0];
          onRemoteStream?.call(_remoteStream!);
        }
      };

      // Connection state monitoring
      _peerConnection!.onConnectionState = (RTCPeerConnectionState state) {
        if (kDebugMode) debugPrint('[WebRTC] Connection state: $state');
        onConnectionStateChange?.call(state);
        
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
          if (kDebugMode) debugPrint('[WebRTC] Connection failed, restarting ICE');
          _peerConnection?.restartIce();
        }
      };

      _peerConnection!.onIceConnectionState = (RTCIceConnectionState state) {
        if (kDebugMode) debugPrint('[WebRTC] ICE connection state: $state');
      };

      // ICE candidate handling
      _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
        if (onSignal != null) {
          onSignal!('ice', {
            'candidate': candidate.candidate,
            'sdpMid': candidate.sdpMid,
            'sdpMLineIndex': candidate.sdpMLineIndex,
          });
        }
      };

      // Perfect negotiation pattern
      _peerConnection!.onNegotiationNeeded = () async {
        try {
          if (kDebugMode) debugPrint('[WebRTC] Negotiation needed (polite: $_polite)');
          _makingOffer = true;

          await _peerConnection!.setLocalDescription();
          
          final desc = await _peerConnection!.getLocalDescription();
          if (desc != null && onSignal != null) {
            onSignal!('offer', {
              'type': desc.type,
              'sdp': desc.sdp,
            });
            if (kDebugMode) debugPrint('[WebRTC] Offer sent');
          }
        } catch (e) {
          if (kDebugMode) debugPrint('[WebRTC] Negotiation error: $e');
        } finally {
          _makingOffer = false;
        }
      };

      if (kDebugMode) debugPrint('[WebRTC] Initialized (polite: $polite)');
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRTC] Initialization failed: $e');
      await cleanup();
      rethrow;
    }
  }

  /// Handle incoming signaling messages (perfect negotiation)
  Future<void> handleSignal({
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    if (_disposed || _peerConnection == null) {
      if (kDebugMode) debugPrint('[WebRTC] Cannot handle signal, not initialized');
      return;
    }

    try {
      if (kind == 'offer') {
        final offerCollision = payload['type'] == 'offer' &&
            (_makingOffer || _peerConnection!.signalingState != RTCSignalingState.RTCSignalingStateStable);

        _ignoreOffer = !_polite && offerCollision;

        if (_ignoreOffer) {
          if (kDebugMode) debugPrint('[WebRTC] Ignoring offer due to collision (impolite)');
          return;
        }

        if (kDebugMode) debugPrint('[WebRTC] Handling offer');
        
        await _peerConnection!.setRemoteDescription(
          RTCSessionDescription(payload['sdp'], payload['type']),
        );

        await _peerConnection!.setLocalDescription();
        
        final desc = await _peerConnection!.getLocalDescription();
        if (desc != null && onSignal != null) {
          onSignal!('answer', {
            'type': desc.type,
            'sdp': desc.sdp,
          });
          if (kDebugMode) debugPrint('[WebRTC] Answer sent');
        }
      } else if (kind == 'answer') {
        if (kDebugMode) debugPrint('[WebRTC] Handling answer');
        
        await _peerConnection!.setRemoteDescription(
          RTCSessionDescription(payload['sdp'], payload['type']),
        );
      } else if (kind == 'ice') {
        if (kDebugMode) debugPrint('[WebRTC] Adding ICE candidate');
        
        try {
          await _peerConnection!.addCandidate(
            RTCIceCandidate(
              payload['candidate'],
              payload['sdpMid'],
              payload['sdpMLineIndex'],
            ),
          );
        } catch (e) {
          if (!_ignoreOffer) {
            if (kDebugMode) debugPrint('[WebRTC] ICE candidate error: $e');
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRTC] Signal handling error: $e');
    }
  }

  /// Toggle microphone
  Future<void> toggleMic() async {
    if (_localStream == null) return;

    final audioTracks = _localStream!.getAudioTracks();
    for (final track in audioTracks) {
      await track.setEnabled(!track.enabled);
    }
  }

  /// Toggle camera
  Future<void> toggleCamera() async {
    if (_localStream == null) return;

    final videoTracks = _localStream!.getVideoTracks();
    for (final track in videoTracks) {
      await track.setEnabled(!track.enabled);
    }
  }

  /// Check if mic is enabled
  bool get isMicEnabled {
    if (_localStream == null) return false;
    final tracks = _localStream!.getAudioTracks();
    return tracks.isNotEmpty && tracks.first.enabled;
  }

  /// Check if camera is enabled
  bool get isCameraEnabled {
    if (_localStream == null) return false;
    final tracks = _localStream!.getVideoTracks();
    return tracks.isNotEmpty && tracks.first.enabled;
  }

  /// Cleanup
  Future<void> cleanup() async {
    if (kDebugMode) debugPrint('[WebRTC] Cleaning up');

    try {
      await _peerConnection?.close();
      _peerConnection?.dispose();
      _peerConnection = null;
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRTC] PC cleanup error: $e');
    }

    try {
      await _localStream?.dispose();
      _localStream = null;
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRTC] Local stream cleanup error: $e');
    }

    _remoteStream = null;
  }

  /// Dispose (permanent)
  Future<void> dispose() async {
    _disposed = true;
    await cleanup();
  }
}
