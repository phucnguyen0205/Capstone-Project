import 'package:flutter/foundation.dart';

import 'group_member_model.dart';

/// Group activity item (join / like / comment). Matches `/api/groups/activity`.
enum GroupActivityType { join, like, comment, unknown }

extension GroupActivityTypeX on GroupActivityType {
  String get wire => switch (this) {
        GroupActivityType.join => 'join',
        GroupActivityType.like => 'like',
        GroupActivityType.comment => 'comment',
        GroupActivityType.unknown => 'unknown',
      };

  static GroupActivityType fromWire(String? s) => switch (s) {
        'join' => GroupActivityType.join,
        'like' => GroupActivityType.like,
        'comment' => GroupActivityType.comment,
        _ => GroupActivityType.unknown,
      };

  String get label => switch (this) {
        GroupActivityType.join => 'đã tham gia',
        GroupActivityType.like => 'đã thích',
        GroupActivityType.comment => 'đã bình luận',
        GroupActivityType.unknown => 'đã hoạt động',
      };
}

@immutable
class GroupActivityModel {
  final String id;
  final GroupActivityType type;
  final GroupActorModel actor;
  final String? postId;
  final String? content;
  final int createdAt; // unix seconds

  const GroupActivityModel({
    required this.id,
    required this.type,
    required this.actor,
    this.postId,
    this.content,
    required this.createdAt,
  });

  DateTime get createdAtDt =>
      DateTime.fromMillisecondsSinceEpoch(createdAt * 1000);

  factory GroupActivityModel.fromJson(Map<String, dynamic> json) {
    final ts = (json['createdAt'] ?? json['created_at']) as num?;
    final actorJson = json['actor'];
    return GroupActivityModel(
      id: json['id'] as String? ?? '',
      type: GroupActivityTypeX.fromWire(json['type'] as String?),
      actor: actorJson is Map<String, dynamic>
          ? GroupActorModel.fromJson(actorJson)
          : const GroupActorModel(id: '', username: ''),
      postId: json['postId'] as String?,
      content: json['content'] as String?,
      createdAt: ts?.toInt() ?? 0,
    );
  }
}
