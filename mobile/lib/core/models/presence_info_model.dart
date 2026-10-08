import 'package:flutter/foundation.dart';

/// Presence state for one user. Matches `/api/presence/bulk` payload.
@immutable
class PresenceInfo {
  final int code;
  final String label;
  final String dotColor; // 'green' | 'muted' | 'gray'
  final int? secondsAgo;
  final bool isOnline;

  const PresenceInfo({
    required this.code,
    required this.label,
    required this.dotColor,
    this.secondsAgo,
    required this.isOnline,
  });

  factory PresenceInfo.fromJson(Map<String, dynamic> json) {
    return PresenceInfo(
      code: (json['code'] as num?)?.toInt() ?? 0,
      label: json['label'] as String? ?? '',
      dotColor: json['dotColor'] as String? ?? 'gray',
      secondsAgo: (json['secondsAgo'] as num?)?.toInt(),
      isOnline: json['isOnline'] as bool? ?? false,
    );
  }
}
