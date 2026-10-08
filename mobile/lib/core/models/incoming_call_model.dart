import 'package:flutter/foundation.dart';

/// Incoming call metadata pushed via SSE. Matches `incoming_call`
/// events from `/api/calls/stream`.
@immutable
class IncomingCallModel {
  final String id;
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final String conversationId;
  final String conversationName;
  final bool isGroup;
  final bool isVideo;

  const IncomingCallModel({
    required this.id,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    required this.conversationId,
    required this.conversationName,
    required this.isGroup,
    this.isVideo = true,
  });

  factory IncomingCallModel.fromJson(Map<String, dynamic> json) {
    final type = (json['type'] as String?)?.toLowerCase();
    final isVideo = json['isVideo'] as bool? ??
        json['is_video'] as bool? ??
        (type == null || type == 'video');
    return IncomingCallModel(
      id: json['id'] as String? ?? '',
      callerId: json['callerId'] as String? ?? json['caller_id'] as String? ?? '',
      callerName:
          json['callerName'] as String? ?? json['caller_name'] as String? ?? '',
      callerAvatar:
          json['callerAvatar'] as String? ?? json['caller_avatar'] as String?,
      conversationId: json['conversationId'] as String? ??
          json['conversation_id'] as String? ??
          '',
      conversationName: json['conversationName'] as String? ??
          json['conversation_name'] as String? ??
          '',
      isGroup: json['isGroup'] as bool? ?? json['is_group'] as bool? ?? false,
      isVideo: isVideo,
    );
  }
}

/// Lightweight info persisted in provider after the incoming call is
/// consumed (used by VideoCallModal).
@immutable
class CallCallerInfo {
  final String id;
  final String name;
  final String? avatar;

  const CallCallerInfo({required this.id, required this.name, this.avatar});

  factory CallCallerInfo.fromJson(Map<String, dynamic> json) => CallCallerInfo(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        avatar: json['avatar'] as String?,
      );

  factory CallCallerInfo.fromIncoming(IncomingCallModel c) => CallCallerInfo(
        id: c.callerId,
        name: c.callerName,
        avatar: c.callerAvatar,
      );
}
