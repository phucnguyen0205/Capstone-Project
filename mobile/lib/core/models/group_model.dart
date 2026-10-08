import 'package:flutter/foundation.dart';

import 'user_model.dart';

/// A "group" here is a friend-cluster view (mutual friends, activity
/// streams, member lists). Mirrors the backend's `/api/groups` surface.
@immutable
class GroupModel {
  final String id; // userId acting as group key, or backend-assigned id
  final String? name;
  final String? description;
  final String? avatarUrl;
  final UserModel? owner;
  final int membersCount;
  final int? mutualCount;
  final bool isFriend;
  final DateTime? lastActivityAt;
  final DateTime? createdAt;

  const GroupModel({
    required this.id,
    this.name,
    this.description,
    this.avatarUrl,
    this.owner,
    this.membersCount = 0,
    this.mutualCount,
    this.isFriend = false,
    this.lastActivityAt,
    this.createdAt,
  });

  factory GroupModel.fromJson(Map<String, dynamic> json) {
    return GroupModel(
      id: json['id'] as String,
      name: json['name'] as String?,
      description: json['description'] as String?,
      avatarUrl: (json['avatar_url'] ?? json['avatarUrl']) as String?,
      owner: json['owner'] is Map<String, dynamic>
          ? UserModel.fromJson(json['owner'] as Map<String, dynamic>)
          : null,
      membersCount: ((json['membersCount'] ?? json['members_count']) as num?)
              ?.toInt() ??
          0,
      mutualCount:
          (json['mutualCount'] ?? json['mutual_count'] as num?)?.toInt(),
      isFriend: json['isFriend'] as bool? ??
          json['is_friend'] as bool? ??
          false,
      lastActivityAt: _parse(json['lastActivityAt'] ?? json['last_activity_at']),
      createdAt: _parse(json['created_at'] ?? json['createdAt']),
    );
  }
}

DateTime? _parse(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is num) return DateTime.fromMillisecondsSinceEpoch(v.toInt() * 1000);
  if (v is String) return DateTime.tryParse(v);
  return null;
}
