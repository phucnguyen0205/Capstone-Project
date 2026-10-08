import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../models/call_types.dart';
import '../services/api_service.dart';
import '../services/call_socket_service.dart';
import '../services/webrtc_service2.dart';
import 'auth_notifier.dart';

part 'call_notifier2.g.dart';

enum CallStatus {
  idle,
  ringing,
  connecting,
  connected,
  declined,
  ended,
  timeout,
  error;
}

@immutable
class CallNotifierState {
  final CallStatus status;
  final String? callId;
  final bool isCaller;
  
  // Incoming call data
  final String? incomingCallId;
  final String? incomingCallerId;
  final String? incomingCallerName;
  final String? incomingCallerAvatar;
  final String? incomingConversationId;
  final String? incomingConversationName;
  
  // Outgoing call data
  final String? outgoingConversationId;
  final String? outgoingConversationName;
  
  // WebRTC streams
  final MediaStream? localStream;
  final MediaStream? remoteStream;
  
  // State
  final RTCPeerConnectionState? connectionState;
  final RTCIceConnectionState? iceConnectionState;
  final bool micOn;
  final bool cameraOn;
  final String? error;
  final bool socketConnected;

  const CallNotifierState({
    this.status = CallStatus.idle,
    this.callId,
    this.isCaller = false,
    this.incomingCallId,
    this.incomingCallerId,
    this.incomingCallerName,
    this.incomingCallerAvatar,
    this.incomingConversationId,
    this.incomingConversationName,
    this.outgoingConversationId,
    this.outgoingConversationName,
    this.localStream,
    this.remoteStream,
    this.connectionState,
    this.iceConnectionState,
    this.micOn = true,
    this.cameraOn = true,
    this.error,
    this.socketConnected = false,
  });

  CallNotifierState copyWith({
    CallStatus? status,
    String? callId,
    bool? isCaller,
    String? incomingCallId,
    String? incomingCallerId,
    String? incomingCallerName,
    String? incomingCallerAvatar,
    String? incomingConversationId,
    String? incomingConversationName,
    String? outgoingConversationId,
    String? outgoingConversationName,
    MediaStream? localStream,
    MediaStream? remoteStream,
    RTCPeerConnectionState? connectionState,
    RTCIceConnectionState? iceConnectionState,
    bool? micOn,
    bool? cameraOn,
    String? error,
    bool? socketConnected,
    bool clearIncoming = false,
    bool clearOutgoing = false,
    bool clearStreams = false,
    bool clearError = false,
  }) {
    return CallNotifierState(
      status: status ?? this.status,
      callId: callId ?? this.callId,
      isCaller: isCaller ?? this.isCaller,
      incomingCallId: clearIncoming ? null : (incomingCallId ?? this.incomingCallId),
      incomingCallerId: clearIncoming ? null : (incomingCallerId ?? this.incomingCallerId),
      incomingCallerName: clearIncoming ? null : (incomingCallerName ?? this.incomingCallerName),
      incomingCallerAvatar: clearIncoming ? null : (incomingCallerAvatar ?? this.incomingCallerAvatar),
      incomingConversationId: clearIncoming ? null : (incomingConversationId ?? this.incomingConversationId),
      incomingConversationName: clearIncoming ? null : (incomingConversationName ?? this.incomingConversationName),
      outgoingConversationId: clearOutgoing ? null : (outgoingConversationId ?? this.outgoingConversationId),
      outgoingConversationName: clearOutgoing ? null : (outgoingConversationName ?? this.outgoingConversationName),
      localStream: clearStreams ? null : (localStream ?? this.localStream),
      remoteStream: clearStreams ? null : (remoteStream ?? this.remoteStream),
      connectionState: connectionState ?? this.connectionState,
      iceConnectionState: iceConnectionState ?? this.iceConnectionState,
      micOn: micOn ?? this.micOn,
      cameraOn: cameraOn ?? this.cameraOn,
      error: clearError ? null : (error ?? this.error),
      socketConnected: socketConnected ?? this.socketConnected,
    );
  }
}

@riverpod
class CallNotifier2 extends _$CallNotifier2 {
  CallSocketService? _socket;
  WebRtcService2? _webrtc;
  StreamSubscription<ServerMessage>? _socketSub;
  List<Map<String, dynamic>>? _iceServers;
  bool _initiateInFlight = false;

  @override
  CallNotifierState build() {
    ref.onDispose(() {
      _cleanup();
    });

    _initialize();
    return const CallNotifierState();
  }

  Future<void> _initialize() async {
    // Load ICE servers
    try {
      final response = await ApiService.get('/api/calls/v2/ice-servers');
      if (response['iceServers'] is List) {
        _iceServers = (response['iceServers'] as List).cast<Map<String, dynamic>>();
        if (kDebugMode) debugPrint('[CallNotifier] ICE servers loaded: ${_iceServers!.length}');
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[CallNotifier] Failed to load ICE servers: $e');
    }

    // Initialize WebSocket
    _socket = CallSocketService();
    _socketSub = _socket!.events.listen(_handleSocketMessage);
  }

  void _handleSocketMessage(ServerMessage msg) {
    if (kDebugMode) debugPrint('[CallNotifier] Message: ${msg.type}');

    if (msg.isConnected) {
      state = state.copyWith(socketConnected: true);
      return;
    }

    if (msg.isClosed) {
      state = state.copyWith(socketConnected: false);
      return;
    }

    if (msg.isIncomingCall && msg.call != null) {
      _handleIncomingCall(msg.call!);
      return;
    }

    if (msg.isCallUpdate && msg.call != null) {
      _handleCallUpdate(msg.call!);
      return;
    }

    if (msg.isCallSignal && msg.signal != null) {
      _handleSignal(msg.signal!);
      return;
    }

    if (msg.isCallEnded) {
      _handleCallEnded();
      return;
    }

    if (msg.isError) {
      state = state.copyWith(error: msg.message ?? 'Unknown error');
    }
  }

  void _handleIncomingCall(CallRecord call) {
    state = state.copyWith(
      status: CallStatus.ringing,
      callId: call.id,
      isCaller: false,
      incomingCallId: call.id,
      incomingCallerId: call.callerId,
      incomingCallerName: call.callerName,
      incomingCallerAvatar: call.callerAvatar,
      incomingConversationId: call.conversationId,
      incomingConversationName: call.conversationName,
    );
  }

  Future<void> _handleCallUpdate(CallRecord call) async {
    if (call.state == CallState.connecting) {
      state = state.copyWith(status: CallStatus.connecting);

      // Caller initiates WebRTC when callee accepts
      if (state.isCaller && _webrtc != null) {
        if (kDebugMode) debugPrint('[CallNotifier] Callee accepted, WebRTC will auto-negotiate');
      }
    } else if (call.state == CallState.connected) {
      state = state.copyWith(status: CallStatus.connected);
    } else if (call.state == CallState.declined) {
      state = state.copyWith(status: CallStatus.declined);
      await _cleanupWebRTC();
      _scheduleReset();
    } else if (call.state == CallState.ended) {
      state = state.copyWith(status: CallStatus.ended);
      await _cleanupWebRTC();
      _scheduleReset();
    } else if (call.state == CallState.timeout) {
      state = state.copyWith(status: CallStatus.timeout, error: 'Không có phản hồi');
      await _cleanupWebRTC();
      _scheduleReset();
    }
  }

  Future<void> _handleSignal(SignalPayload signal) async {
    // Initialize WebRTC when receiving first signal (callee side)
    if (_webrtc == null && signal.kind == 'offer') {
      if (kDebugMode) debugPrint('[CallNotifier] Initializing WebRTC as callee');
      try {
        await _initializeWebRTC(polite: true);
      } catch (e) {
        if (kDebugMode) debugPrint('[CallNotifier] WebRTC init failed: $e');
        state = state.copyWith(error: 'Không thể truy cập camera/microphone');
        return;
      }
    }

    if (_webrtc != null && signal.payload != null) {
      await _webrtc!.handleSignal(
        kind: signal.kind,
        payload: signal.payload!,
      );
    }
  }

  void _handleCallEnded() {
    state = state.copyWith(status: CallStatus.ended);
    _cleanupWebRTC();
    _scheduleReset();
  }

  Future<void> _initializeWebRTC({required bool polite}) async {
    _webrtc = WebRtcService2(
      iceServers: _iceServers,
      onSignal: (kind, payload) {
        if (state.callId != null && _socket != null) {
          _socket!.sendSignal(
            callId: state.callId!,
            kind: kind,
            payload: payload,
          );
        }
      },
      onRemoteStream: (stream) {
        state = state.copyWith(remoteStream: stream);
      },
      onConnectionStateChange: (connState) {
        state = state.copyWith(connectionState: connState);

        // Notify server when WebRTC connects
        if (connState == RTCPeerConnectionState.RTCPeerConnectionStateConnected && 
            state.status == CallStatus.connecting) {
          if (kDebugMode) debugPrint('[CallNotifier] WebRTC connected, notifying server');
          
          if (state.callId != null) {
            ApiService.post('/api/calls/v2/connected', {
              'callId': state.callId,
            }).catchError((e) {
              if (kDebugMode) debugPrint('[CallNotifier] Failed to notify connected: $e');
            });
          }
        }

        if (connState == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
            connState == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
          state = state.copyWith(error: 'Kết nối bị gián đoạn');
        }
      },
    );

    await _webrtc!.initialize(polite: polite);

    state = state.copyWith(
      localStream: _webrtc!.localStream,
      micOn: _webrtc!.isMicEnabled,
      cameraOn: _webrtc!.isCameraEnabled,
    );
  }

  Future<void> _cleanupWebRTC() async {
    await _webrtc?.cleanup();
    _webrtc = null;
    state = state.copyWith(clearStreams: true);
  }

  void _scheduleReset() {
    Future.delayed(const Duration(seconds: 2), () {
      if (state.status == CallStatus.declined ||
          state.status == CallStatus.ended ||
          state.status == CallStatus.timeout) {
        state = const CallNotifierState();
      }
    });
  }

  /// Initiate a call
  Future<bool> initiateCall({
    required String conversationId,
    required String calleeId,
    required String calleeName,
    String? calleeAvatar,
    required String conversationName,
    bool isGroup = false,
  }) async {
    if (_initiateInFlight) return false;
    if (state.status != CallStatus.idle &&
        state.status != CallStatus.declined &&
        state.status != CallStatus.ended) {
      return false;
    }

    _initiateInFlight = true;
    state = state.copyWith(
      status: CallStatus.connecting,
      isCaller: true,
      outgoingConversationId: conversationId,
      outgoingConversationName: conversationName,
      clearError: true,
    );

    try {
      // Initialize WebRTC first
      if (kDebugMode) debugPrint('[CallNotifier] Initializing WebRTC as caller');
      await _initializeWebRTC(polite: false);

      // Then initiate call on server
      final response = await ApiService.post('/api/calls/v2/initiate', {
        'conversationId': conversationId,
        'calleeId': calleeId,
        'calleeName': calleeName,
        'calleeAvatar': calleeAvatar,
        'conversationName': conversationName,
        'isGroup': isGroup,
      });

      if (response['call'] != null) {
        final call = CallRecord.fromJson(response['call'] as Map<String, dynamic>);
        state = state.copyWith(callId: call.id, status: CallStatus.ringing);
        return true;
      }

      return false;
    } catch (e) {
      if (kDebugMode) debugPrint('[CallNotifier] Initiate failed: $e');
      state = state.copyWith(
        status: CallStatus.idle,
        clearOutgoing: true,
        error: e.toString(),
      );
      await _cleanupWebRTC();
      return false;
    } finally {
      _initiateInFlight = false;
    }
  }

  /// Accept incoming call
  Future<void> acceptCall() async {
    if (state.incomingCallId == null) return;

    try {
      await ApiService.post('/api/calls/v2/answer', {
        'callId': state.incomingCallId,
        'action': 'accept',
      });

      state = state.copyWith(status: CallStatus.connecting);
      // WebRTC will initialize when receiving offer signal
    } catch (e) {
      if (kDebugMode) debugPrint('[CallNotifier] Accept failed: $e');
      state = state.copyWith(error: 'Không thể chấp nhận cuộc gọi');
    }
  }

  /// Decline incoming call
  Future<void> declineCall() async {
    if (state.incomingCallId == null) return;

    try {
      await ApiService.post('/api/calls/v2/answer', {
        'callId': state.incomingCallId,
        'action': 'decline',
      });
    } catch (e) {
      if (kDebugMode) debugPrint('[CallNotifier] Decline failed: $e');
    }

    state = const CallNotifierState();
    await _cleanupWebRTC();
  }

  /// End active call
  Future<void> endCall() async {
    if (state.callId == null) return;

    try {
      await ApiService.post('/api/calls/v2/answer', {
        'callId': state.callId,
        'action': 'end',
      });
    } catch (e) {
      if (kDebugMode) debugPrint('[CallNotifier] End failed: $e');
    }

    state = state.copyWith(status: CallStatus.ended);
    await _cleanupWebRTC();
    _scheduleReset();
  }

  /// Toggle microphone
  Future<void> toggleMic() async {
    await _webrtc?.toggleMic();
    state = state.copyWith(micOn: _webrtc?.isMicEnabled ?? state.micOn);
  }

  /// Toggle camera
  Future<void> toggleCamera() async {
    await _webrtc?.toggleCamera();
    state = state.copyWith(cameraOn: _webrtc?.isCameraEnabled ?? state.cameraOn);
  }

  void _cleanup() {
    _socketSub?.cancel();
    _socket?.dispose();
    _webrtc?.dispose();
  }
}
