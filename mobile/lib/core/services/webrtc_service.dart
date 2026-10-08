import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

/// Callback invoked whenever a signaling payload (SDP offer / answer /
/// ICE candidate) needs to be sent to the remote peer through the
/// server (e.g. via HTTP POST → SSE relay).
typedef SignalSendCallback = Future<void> Function(
    String callId, String kind, Map<String, dynamic> payload);

/// Callback invoked when the remote peer signals the call is over
/// (hangup). Implementers should tear down UI state.
typedef HangupCallback = void Function();

/// WebRTC wrapper used by the call modal.
///
/// Performs the full peer-connection bootstrap:
///   1. Get local camera + mic stream.
///   2. Create RTCPeerConnection.
///   3. Negotiate SDP offer/answer.
///   4. Exchange ICE candidates.
///   5. Render local and remote tracks.
///
/// The transport layer for SDP/ICE is *application-specific* — pass
/// [onSignal] so this service can publish signaling payloads (the
/// caller normally POSTs to `/api/calls/signal`, the backend then
/// forwards them to the other peer over SSE).
class WebRtcService {
  final SignalSendCallback? onSignal;
  final HangupCallback? onRemoteHangup;

  MediaStream? _localStream;
  RTCPeerConnection? _peer;
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  bool _initialized = false;
  bool _disposed = false;

  /// Set to true once the local SDP offer/answer has been sent and
  /// the remote description applied, so subsequent "negotiationneeded"
  /// events can be ignored until a new session starts.
  bool _negotiating = false;

  /// Role of this side in the call. Decides whether to create an
  /// offer on `negotiationneeded`.
  bool _isCaller = false;

  String? _activeCallId;

  WebRtcService({this.onSignal, this.onRemoteHangup});

  bool get isInitialized => _initialized;

  MediaStream? get localStream => _localStream;
  RTCPeerConnection? get peerConnection => _peer;
  RTCVideoRenderer get localRenderer => _localRenderer;
  RTCVideoRenderer get remoteRenderer => _remoteRenderer;

  /// Public STUN servers. TURN is intentionally omitted — for now we
  /// only support same-network / STUN-reachable peers. Add a TURN
  /// server entry here when you have credentials.
  static const Map<String, dynamic> _defaultIceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ],
    'sdpSemantics': 'unified-plan',
  };

  /// Initialize renderers + acquire the local media stream.
  /// Returns null on success, error message on failure.
  Future<String?> start({
    required String callId,
    required bool isCaller,
    bool video = true,
    bool audio = true,
  }) async {
    _activeCallId = callId;
    _isCaller = isCaller;
    try {
      if (!_initialized) {
        await _localRenderer.initialize();
        await _remoteRenderer.initialize();
        _initialized = true;
      }

      // Permissions
      final perms = <Permission>[];
      if (video) perms.add(Permission.camera);
      if (audio) perms.add(Permission.microphone);
      if (perms.isNotEmpty) {
        final result = await perms.first.request();
        if (result.isPermanentlyDenied) {
          return 'Quyền truy cập camera/mic bị từ chối vĩnh viễn';
        }
      }

      final constraints = <String, dynamic>{
        if (audio) 'audio': true,
        if (video) 'video': {
          'facingMode': 'user',
          'width': {'ideal': 1280},
          'height': {'ideal': 720},
        },
      };

      final stream =
          await navigator.mediaDevices.getUserMedia(constraints);
      _localStream = stream;
      _localRenderer.srcObject = stream;

      // Build peer connection
      _peer = await createPeerConnection(_defaultIceServers);
      for (final t in stream.getTracks()) {
        await _peer!.addTrack(t, stream);
      }

      _peer!.onTrack = (RTCTrackEvent event) {
        if (event.streams.isNotEmpty) {
          _remoteRenderer.srcObject = event.streams.first;
        }
      };

      _peer!.onIceCandidate = (RTCIceCandidate candidate) {
        if (onSignal == null || _activeCallId == null) return;
        // Fire and forget — failures are logged, the next candidate
        // may still succeed.
        unawaited(onSignal!(_activeCallId!, 'ice', {
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        }));
      };

      _peer!.onConnectionState = (RTCPeerConnectionState state) {
        if (kDebugMode) {
          debugPrint('[WebRtcService] connectionState=$state');
        }
      };

      _peer!.onIceConnectionState = (RTCIceConnectionState state) {
        if (kDebugMode) {
          debugPrint('[WebRtcService] iceConnectionState=$state');
        }
      };

      _peer!.onRenegotiationNeeded = () async {
        if (!_isCaller || _negotiating) return;
        await _createAndSendOffer();
      };

      return null;
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRtcService] start failed: $e');
      return 'Không thể truy cập camera/mic. Vui lòng cho phép truy cập.';
    }
  }

  Future<void> _createAndSendOffer() async {
    if (_peer == null || _activeCallId == null || onSignal == null) return;
    _negotiating = true;
    try {
      final offer = await _peer!.createOffer({
        'offerToReceiveAudio': true,
        'offerToReceiveVideo': true,
      });
      await _peer!.setLocalDescription(offer);
      await onSignal!(_activeCallId!, 'offer', {
        'type': offer.type,
        'sdp': offer.sdp,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRtcService] offer failed: $e');
    } finally {
      _negotiating = false;
    }
  }

  /// Caller-only: kick off the SDP exchange by creating an offer
  /// and publishing it through the signaling callback.
  Future<void> startCall() async {
    if (!_isCaller) {
      if (kDebugMode) {
        debugPrint('[WebRtcService] startCall ignored (callee)');
      }
      return;
    }
    await _createAndSendOffer();
  }

  /// Callee-only: apply the SDP offer from the caller, create an
  /// answer, and publish it.
  Future<void> handleOffer({
    required String sdp,
    required String type,
  }) async {
    if (_peer == null) return;
    try {
      await _peer!.setRemoteDescription(
        RTCSessionDescription(sdp, type),
      );
      final answer = await _peer!.createAnswer();
      await _peer!.setLocalDescription(answer);
      if (onSignal != null && _activeCallId != null) {
        await onSignal!(_activeCallId!, 'answer', {
          'type': answer.type,
          'sdp': answer.sdp,
        });
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRtcService] handleOffer failed: $e');
    }
  }

  /// Caller-only: apply the SDP answer received from the callee.
  Future<void> handleAnswer({
    required String sdp,
    required String type,
  }) async {
    if (_peer == null) return;
    try {
      await _peer!.setRemoteDescription(
        RTCSessionDescription(sdp, type),
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRtcService] handleAnswer failed: $e');
    }
  }

  /// Both sides: add a remote ICE candidate.
  Future<void> handleIceCandidate({
    required String candidate,
    String? sdpMid,
    int? sdpMLineIndex,
  }) async {
    if (_peer == null) return;
    try {
      await _peer!.addCandidate(
        RTCIceCandidate(candidate, sdpMid, sdpMLineIndex),
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[WebRtcService] addIceCandidate failed: $e');
      }
    }
  }

  /// Remote party hung up. Tear down without flipping our own state
  /// (the caller of this method decides how to react).
  void handleRemoteHangup() {
    if (onRemoteHangup != null) onRemoteHangup!();
  }

  Future<void> toggleCamera() async {
    final tracks = _localStream?.getVideoTracks() ?? [];
    final next = tracks.isEmpty || !tracks.first.enabled;
    for (final t in tracks) {
      t.enabled = next;
    }
  }

  Future<void> toggleMic() async {
    final tracks = _localStream?.getAudioTracks() ?? [];
    final next = tracks.isEmpty || !tracks.first.enabled;
    for (final t in tracks) {
      t.enabled = next;
    }
  }

  bool get cameraOn =>
      _localStream?.getVideoTracks().any((t) => t.enabled) ?? false;

  bool get micOn =>
      _localStream?.getAudioTracks().any((t) => t.enabled) ?? false;

  /// Current WebRTC connection state (new, connecting, connected, etc.)
  String get connectionState =>
      _peer?.connectionState?.name ?? 'new';

  /// Stop all tracks, close the peer connection, release renderers.
  /// Safe to call multiple times.
  Future<void> stop() async {
    _activeCallId = null;
    _isCaller = false;
    _negotiating = false;
    try {
      await _peer?.close();
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRtcService] peer close error: $e');
    }
    _peer = null;
    try {
      _localStream?.getTracks().forEach((t) {
        try {
          t.stop();
        } catch (_) {}
      });
      _localStream?.dispose();
    } catch (e) {
      if (kDebugMode) debugPrint('[WebRtcService] stream stop error: $e');
    }
    _localStream = null;
    try {
      _localRenderer.srcObject = null;
      _remoteRenderer.srcObject = null;
    } catch (_) {}
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await stop();
    if (_initialized) {
      try {
        await _localRenderer.dispose();
      } catch (_) {}
      try {
        await _remoteRenderer.dispose();
      } catch (_) {}
      _initialized = false;
    }
  }
}