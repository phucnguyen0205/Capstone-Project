import 'package:flutter/foundation.dart';

import 'user_model.dart';

/// Member in the private friend-group (groups left sidebar). Matches
/// `/api/groups/members`.
@immutable
class GroupMemberModel {
  final String id;
  final String username;
  final String? name;
  final String? avatar;
  final String? bio;
  final String? hobbies;
  final String? occupation;
  final bool isOnline;
  final int friendshipCreatedAt; // unix seconds
  final String? addedBy;

  const GroupMemberModel({
    required this.id,
    required this.username,
    this.name,
    this.avatar,
    this.bio,
    this.hobbies,
    this.occupation,
    this.isOnline = false,
    required this.friendshipCreatedAt,
    this.addedBy,
  });

  String get displayName =>
      (name != null && name!.isNotEmpty) ? name! : username;

  factory GroupMemberModel.fromJson(Map<String, dynamic> json) {
    final ts = (json['friendshipCreatedAt'] ?? json['friendship_created_at'])
        as num?;
    return GroupMemberModel(
      id: json['id'] as String,
      username: json['username'] as String? ?? '',
      name: json['name'] as String?,
      avatar: json['avatar'] as String?,
      bio: json['bio'] as String?,
      hobbies: json['hobbies'] as String?,
      occupation: json['occupation'] as String?,
      isOnline: json['isOnline'] as bool? ?? false,
      friendshipCreatedAt: ts?.toInt() ?? 0,
      addedBy: json['addedBy'] as String?,
    );
  }
}

/// User-shaped actor (used in activity / recent members).
@immutable
class GroupActorModel {
  final String id;
  final String username;
  final String? name;
  final String? avatar;

  const GroupActorModel({
    required this.id,
    required this.username,
    this.name,
    this.avatar,
  });

  String get displayName =>
      (name != null && name!.isNotEmpty) ? name! : username;

  factory GroupActorModel.fromJson(Map<String, dynamic> json) {
    return GroupActorModel(
      id: (json['id'] ?? '') as String,
      username: (json['username'] ?? '') as String,
      name: json['name'] as String?,
      avatar: json['avatar'] as String?,
    );
  }

  UserModel toUserModel() => UserModel(
        id: id,
        username: username,
        name: name ?? username,
        avatar: avatar,
      );
}
