import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/incoming_call_model.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/services/api_service.dart';
import '../../../../core/services/call_signaling_service.dart';
import '../../../../core/services/webrtc_service.dart';

/// Call lifecycle states. Mirrors `useCallNotifications` in web.
enum CallStatus { idle, ringing, connecting, connected, declined, ended }

extension CallStatusX on CallStatus {
  bool get isActive =>
      this == CallStatus.ringing ||
      this == CallStatus.connecting ||
      this == CallStatus.connected;
  bool get isRinging => this == CallStatus.ringing;
  bool get isConnected => this == CallStatus.connected;
  bool get showVideoModal =>
      this == CallStatus.connecting || this == CallStatus.connected;
}

/// Singleton WebRTC service. Constructed lazily with a signal callback
/// that POSTs to /api/calls/signal.
final webRtcServiceProvider = Provider<WebRtcService>((ref) {
  final api = ApiService();
  final service = WebRtcService(
    onSignal: (callId, kind, payload) =>
        api.sendSignal(callId: callId, kind: kind, payload: payload),
    onRemoteHangup: () {
      // Best effort: end via HTTP so the call state cleans up.
      unawaited(api.answerCall(callId: '', action: 'end')
          .catchError((_) => <String, dynamic>{}));
    },
  );
  ref.onDispose(service.dispose);
  return service;
});

/// Singleton signaling service.
final callSignalingServiceProvider = Provider<CallSignalingService>((ref) {
  final service = CallSignalingService();
  ref.onDispose(service.dispose);
  return service;
});

/// Immutable call state snapshot.
@immutable
class CallState {
  final CallStatus status;
  final IncomingCallModel? incomingCall;
  final CallCallerInfo? callerInfo;
  final String? outgoingConversationName;
  final String? outgoingCalleeName;
  final String? outgoingCalleeAvatar;
  final String? outgoingConversationId;
  final String? outgoingCalleeId;
  final bool outgoingIsGroup;
  final String? callId;
  final String? error;
  final String? webrtcError;

  const CallState({
    this.status = CallStatus.idle,
    this.incomingCall,
    this.callerInfo,
    this.outgoingConversationName,
    this.outgoingCalleeName,
    this.outgoingCalleeAvatar,
    this.outgoingConversationId,
    this.outgoingCalleeId,
    this.outgoingIsGroup = false,
    this.callId,
    this.error,
    this.webrtcError,
  });

  /// Active call ID (from incoming or outgoing call).
  String? get activeCallId => callId ?? incomingCall?.id;

  CallState copyWith({
    CallStatus? status,
    IncomingCallModel? incomingCall,
    bool clearIncoming = false,
    CallCallerInfo? callerInfo,
    bool clearCallerInfo = false,
    String? outgoingConversationName,
    String? outgoingCalleeName,
    String? outgoingCalleeAvatar,
    String? outgoingConversationId,
    String? outgoingCalleeId,
    bool? outgoingIsGroup,
    bool clearOutgoing = false,
    String? callId,
    String? error,
    bool clearError = false,
    String? webrtcError,
    bool clearWebrtcError = false,
  }) {
    return CallState(
      status: status ?? this.status,
      incomingCall: clearIncoming ? null : (incomingCall ?? this.incomingCall),
      callerInfo: clearCallerInfo ? null : (callerInfo ?? this.callerInfo),
      outgoingConversationName: clearOutgoing
          ? null
          : (outgoingConversationName ?? this.outgoingConversationName),
      outgoingCalleeName:
          clearOutgoing ? null : (outgoingCalleeName ?? this.outgoingCalleeName),
      outgoingCalleeAvatar: clearOutgoing
          ? null
          : (outgoingCalleeAvatar ?? this.outgoingCalleeAvatar),
      outgoingConversationId: clearOutgoing
          ? null
          : (outgoingConversationId ?? this.outgoingConversationId),
      outgoingCalleeId: clearOutgoing
          ? null
          : (outgoingCalleeId ?? this.outgoingCalleeId),
      outgoingIsGroup:
          clearOutgoing ? false : (outgoingIsGroup ?? this.outgoingIsGroup),
      callId: callId ?? this.callId,
      error: clearError ? null : (error ?? this.error),
      webrtcError:
          clearWebrtcError ? null : (webrtcError ?? this.webrtcError),
    );
  }
}

/// Main Riverpod notifier for call state.
class CallNotifier extends StateNotifier<CallState> {
  CallNotifier({
    required this.api,
    required this.signaling,
    required this.rtc,
  }) : super(const CallState()) {
    _subscribe();
  }

  final ApiService api;
  final CallSignalingService signaling;
  final WebRtcService rtc;
  StreamSubscription? _eventSub;
  Timer? _resetTimer;

  void _subscribe() {
    _eventSub = signaling.events.listen(_onEvent);
  }

  void _onEvent(CallEvent event) {
    if (event.isIncomingCall && event.call != null) {
      try {
        final incoming = IncomingCallModel.fromJson(event.call!);
        state = state.copyWith(
          status: CallStatus.ringing,
          incomingCall: incoming,
          callId: incoming.id,
          clearError: true,
        );
      } catch (e) {
        if (kDebugMode) debugPrint('[CallNotifier] bad incoming: $e');
      }
      return;
    }
    if (event.isCallUpdate && event.call != null) {
      final callState = event.call!['state'] as String?;
      if (callState == 'accepted') {
        // Backend confirmed the callee accepted. If we're the caller,
        // start the WebRTC offer now.
        state = state.copyWith(status: CallStatus.connecting);
        _bootstrapRtc(isCaller: true);
      } else if (callState == 'declined') {
        _reset(CallStatus.declined);
      } else if (callState == 'ended') {
        _reset(CallStatus.ended);
      }
      return;
    }
    if (event.isCallSignal && event.signal != null) {
      _handleSignal(event);
    }
  }

  Future<void> _handleSignal(CallEvent event) async {
    final signal = event.signal!;
    final kind = signal['kind'] as String?;
    final payload = signal['payload'] is Map<String, dynamic>
        ? signal['payload'] as Map<String, dynamic>
        : <String, dynamic>{};
    if (kind == null) return;
    try {
      switch (kind) {
        case 'offer':
          // Callee: Initialize WebRTC when offer arrives (not at accept time)
          final id = state.callId;
          if (id != null && id.isNotEmpty) {
            final err = await rtc.start(callId: id, isCaller: false);
            if (err != null) {
              if (kDebugMode) debugPrint('[CallNotifier] rtc init on offer: $err');
              state = state.copyWith(webrtcError: err);
              return;
            }
          }
          await rtc.handleOffer(
            sdp: payload['sdp'] as String? ?? '',
            type: payload['type'] as String? ?? 'offer',
          );
          // Once the answer is published via API, flip UI to connected.
          if (state.status != CallStatus.connected) {
            state = state.copyWith(status: CallStatus.connected);
          }
          break;
        case 'answer':
          await rtc.handleAnswer(
            sdp: payload['sdp'] as String? ?? '',
            type: payload['type'] as String? ?? 'answer',
          );
          if (state.status != CallStatus.connected) {
            state = state.copyWith(status: CallStatus.connected);
          }
          break;
        case 'ice':
          await rtc.handleIceCandidate(
            candidate: payload['candidate'] as String? ?? '',
            sdpMid: payload['sdpMid'] as String?,
            sdpMLineIndex:
                (payload['sdpMLineIndex'] as num?)?.toInt(),
          );
          break;
        case 'hangup':
          rtc.handleRemoteHangup();
          _reset(CallStatus.ended);
          break;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[CallNotifier] signal $kind failed: $e');
    }
  }

  /// Initialize WebRTC for the current call. Caller boots SDP offer,
  /// callee waits for offer over SSE.
  Future<void> _bootstrapRtc({required bool isCaller}) async {
    final id = state.callId;
    if (id == null || id.isEmpty) return;
    final err = await rtc.start(callId: id, isCaller: isCaller);
    if (err != null) {
      state = state.copyWith(
        webrtcError: err,
        status: CallStatus.ended,
      );
      return;
    }
    if (isCaller) {
      await rtc.startCall();
    }
  }

  void _reset(CallStatus status) {
    state = state.copyWith(
      status: status,
      clearIncoming: true,
      clearCallerInfo: true,
      clearOutgoing: true,
      callId: null,
      clearWebrtcError: true,
    );
    // Release WebRTC resources in the background.
    unawaited(rtc.stop().catchError((_) {}));
    _resetTimer?.cancel();
    _resetTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted) return;
      if (state.status == status) {
        state = state.copyWith(status: CallStatus.idle);
      }
    });
  }

  Future<bool> initiate({
    required String conversationId,
    required String calleeId,
    required String calleeName,
    String? calleeAvatar,
    required String conversationName,
    required bool isGroup,
  }) async {
    state = state.copyWith(
      status: CallStatus.connecting,
      outgoingConversationId: conversationId,
      outgoingCalleeId: calleeId,
      outgoingCalleeName: calleeName,
      outgoingCalleeAvatar: calleeAvatar,
      outgoingConversationName: conversationName,
      outgoingIsGroup: isGroup,
      clearError: true,
    );
    try {
      final res = await api.initiateCall(
        conversationId: conversationId,
        calleeId: calleeId,
        conversationName: conversationName,
        isGroup: isGroup,
      );
      final callId = (res['call'] is Map ? res['call']['id'] : null) as String?;
      state = state.copyWith(callId: callId);
      // Pre-initialize WebRTC so the offer can be sent as soon as the
      // callee accepts. We don't start the offer yet — that fires when
      // `call_update` state=accepted arrives.
      if (callId != null && callId.isNotEmpty) {
        final err = await rtc.start(callId: callId, isCaller: true);
        if (err != null) {
          if (kDebugMode) debugPrint('[CallNotifier] rtc init: $err');
        }
      }
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(
        status: CallStatus.idle,
        clearOutgoing: true,
        error: e.message,
      );
      return false;
    } catch (e) {
      state = state.copyWith(
        status: CallStatus.idle,
        clearOutgoing: true,
        error: 'Lỗi kết nối',
      );
      return false;
    }
  }

  Future<void> accept({String? callId}) async {
    final id = callId ?? state.callId;
    if (kDebugMode) debugPrint('[CallNotifier] accept() called id=$id');
    if (id == null || id.isEmpty) {
      if (kDebugMode) debugPrint('[CallNotifier] accept early-return: empty id');
      state = state.copyWith(
        status: CallStatus.idle,
        clearIncoming: true,
        clearCallerInfo: true,
        clearOutgoing: true,
        callId: null,
        error: 'Thiếu mã cuộc gọi',
      );
      return;
    }
    try {
      if (kDebugMode) debugPrint('[CallNotifier] posting /api/calls/answer');
      await api.answerCall(callId: id, action: 'accept');
      if (kDebugMode) debugPrint('[CallNotifier] accept ok');
    } on ApiException catch (e) {
      if (kDebugMode) debugPrint('[CallNotifier] accept rejected: ${e.message}');
      state = state.copyWith(
        status: CallStatus.idle,
        clearIncoming: true,
        clearCallerInfo: true,
        clearOutgoing: true,
        callId: null,
        error: e.message,
      );
      return;
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('[CallNotifier] accept error: $e');
        debugPrint('$st');
      }
      state = state.copyWith(
        status: CallStatus.idle,
        clearIncoming: true,
        clearCallerInfo: true,
        clearOutgoing: true,
        callId: null,
        error: 'Không thể chấp nhận cuộc gọi',
      );
      return;
    }
    // Backend will push call_update state=accepted to BOTH peers.
    // Callee-side WebRTC bootstraps lazily on receiving the offer signal.
    state = state.copyWith(
      status: CallStatus.connecting,
      callerInfo: state.incomingCall == null
          ? state.callerInfo
          : CallCallerInfo.fromIncoming(state.incomingCall!),
      clearError: true,
    );
    // DO NOT initialize WebRTC here - wait for the offer signal from caller
    // to avoid race conditions. WebRTC will be initialized in _handleSignal
    // when the 'offer' arrives via SSE.
  }

  Future<void> decline({String? callId}) async {
    final id = callId ?? state.callId;
    if (id != null) {
      try {
        await api.answerCall(callId: id, action: 'decline');
      } catch (_) {}
    }
    _reset(CallStatus.declined);
  }

  Future<void> endCall({String? callId}) async {
    final id = callId ?? state.callId;
    if (id != null) {
      try {
        await api.answerCall(callId: id, action: 'end');
        // Best-effort notify peer that we're hanging up so they can
        // tear down their side without waiting for SSE call_update.
        await api.sendSignal(callId: id, kind: 'hangup');
      } catch (_) {}
    }
    _reset(CallStatus.ended);
  }

  @override
  void dispose() {
    _resetTimer?.cancel();
    _eventSub?.cancel();
    super.dispose();
  }
}

final callProvider =
    StateNotifierProvider<CallNotifier, CallState>((ref) {
  final api = ApiService();
  final signaling = ref.watch(callSignalingServiceProvider);
  final rtc = ref.watch(webRtcServiceProvider);
  return CallNotifier(api: api, signaling: signaling, rtc: rtc);
});