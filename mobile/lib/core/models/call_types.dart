/// Call system types - shared between Dart and TypeScript
library;

import 'package:flutter/foundation.dart';

enum CallState {
  idle,
  initiating,
  ringing,
  connecting,
  connected,
  ending,
  ended,
  declined,
  failed,
  timeout;

  String toJson() => name;
  
  static CallState fromJson(String json) {
    return CallState.values.firstWhere(
      (e) => e.name == json,
      orElse: () => CallState.idle,
    );
  }
}

@immutable
class CallRecord {
  final String id;
  final String conversationId;
  
  // Participants
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final String calleeId;
  final String? calleeName;
  final String? calleeAvatar;
  
  // State
  final CallState state;
  final bool isGroup;
  final String conversationName;
  
  // Timing
  final int createdAt;
  final int? ringingAt;
  final int? acceptedAt;
  final int? connectedAt;
  final int? endedAt;
  
  // Metadata
  final String? endReason;
  final int? duration;
  final double? qualityScore;

  const CallRecord({
    required this.id,
    required this.conversationId,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    required this.calleeId,
    this.calleeName,
    this.calleeAvatar,
    required this.state,
    required this.isGroup,
    required this.conversationName,
    required this.createdAt,
    this.ringingAt,
    this.acceptedAt,
    this.connectedAt,
    this.endedAt,
    this.endReason,
    this.duration,
    this.qualityScore,
  });

  factory CallRecord.fromJson(Map<String, dynamic> json) {
    return CallRecord(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      callerId: json['callerId'] as String,
      callerName: json['callerName'] as String,
      callerAvatar: json['callerAvatar'] as String?,
      calleeId: json['calleeId'] as String,
      calleeName: json['calleeName'] as String?,
      calleeAvatar: json['calleeAvatar'] as String?,
      state: CallState.fromJson(json['state'] as String),
      isGroup: json['isGroup'] as bool? ?? false,
      conversationName: json['conversationName'] as String,
      createdAt: json['createdAt'] as int,
      ringingAt: json['ringingAt'] as int?,
      acceptedAt: json['acceptedAt'] as int?,
      connectedAt: json['connectedAt'] as int?,
      endedAt: json['endedAt'] as int?,
      endReason: json['endReason'] as String?,
      duration: json['duration'] as int?,
      qualityScore: (json['qualityScore'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'conversationId': conversationId,
      'callerId': callerId,
      'callerName': callerName,
      'callerAvatar': callerAvatar,
      'calleeId': calleeId,
      'calleeName': calleeName,
      'calleeAvatar': calleeAvatar,
      'state': state.toJson(),
      'isGroup': isGroup,
      'conversationName': conversationName,
      'createdAt': createdAt,
      'ringingAt': ringingAt,
      'acceptedAt': acceptedAt,
      'connectedAt': connectedAt,
      'endedAt': endedAt,
      'endReason': endReason,
      'duration': duration,
      'qualityScore': qualityScore,
    };
  }
}

// WebSocket message types
@immutable
class ClientMessage {
  final String type;
  final String? callId;
  final String? kind;
  final Map<String, dynamic>? payload;

  const ClientMessage._({
    required this.type,
    this.callId,
    this.kind,
    this.payload,
  });

  const ClientMessage.signal({
    required String callId,
    required String kind,
    required Map<String, dynamic> payload,
  }) : this._(type: 'signal', callId: callId, kind: kind, payload: payload);

  const ClientMessage.heartbeat() : this._(type: 'heartbeat');

  Map<String, dynamic> toJson() {
    return {
      'type': type,
      if (callId != null) 'callId': callId,
      if (kind != null) 'kind': kind,
      if (payload != null) 'payload': payload,
    };
  }
}

@immutable
class ServerMessage {
  final String type;
  final CallRecord? call;
  final String? message;
  final String? code;
  final String? callId;
  final SignalPayload? signal;

  const ServerMessage._({
    required this.type,
    this.call,
    this.message,
    this.code,
    this.callId,
    this.signal,
  });

  const ServerMessage.connected() : this._(type: 'connected');
  const ServerMessage.closed() : this._(type: 'closed');
  const ServerMessage.error(String message, [String? code])
      : this._(type: 'error', message: message, code: code);

  factory ServerMessage.fromJson(Map<String, dynamic> json) {
    final type = json['type'] as String? ?? 'unknown';
    
    CallRecord? call;
    if (json['call'] is Map<String, dynamic>) {
      try {
        call = CallRecord.fromJson(json['call'] as Map<String, dynamic>);
      } catch (e) {
        if (kDebugMode) debugPrint('[ServerMessage] Call parse error: $e');
      }
    }

    SignalPayload? signal;
    if (json['signal'] is Map<String, dynamic>) {
      try {
        signal = SignalPayload.fromJson(json['signal'] as Map<String, dynamic>);
      } catch (e) {
        if (kDebugMode) debugPrint('[ServerMessage] Signal parse error: $e');
      }
    }

    return ServerMessage._(
      type: type,
      call: call,
      message: json['message'] as String?,
      code: json['code'] as String?,
      callId: json['callId'] as String?,
      signal: signal,
    );
  }

  bool get isIncomingCall => type == 'incoming_call';
  bool get isCallUpdate => type == 'call_update';
  bool get isCallSignal => type == 'call_signal';
  bool get isCallEnded => type == 'call_ended';
  bool get isError => type == 'error';
  bool get isClosed => type == 'closed';
  bool get isConnected => type == 'connected';
  bool get isPong => type == 'pong';
}

@immutable
class SignalPayload {
  final String kind;
  final Map<String, dynamic>? payload;

  const SignalPayload({
    required this.kind,
    this.payload,
  });

  factory SignalPayload.fromJson(Map<String, dynamic> json) {
    return SignalPayload(
      kind: json['kind'] as String,
      payload: json['payload'] is Map<String, dynamic>
          ? json['payload'] as Map<String, dynamic>
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'kind': kind,
      if (payload != null) 'payload': payload,
    };
  }
}
