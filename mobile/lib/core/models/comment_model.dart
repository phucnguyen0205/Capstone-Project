import 'package:flutter/foundation.dart';

import 'user_model.dart';

/// A comment on a post. Mirrors the response shape of
/// `GET /api/posts/[id]/comments` in the Next.js backend.
///
/// Backend nests the author under `author` (with username/name/avatar only)
/// rather than `user`. We synthesize a partial [UserModel] from those flat
/// fields so existing UI bindings keep working.
@immutable
class CommentModel {
  final String id;
  final String postId;
  final String userId;
  final UserModel? author;
  final String content;
  final DateTime createdAt;
  final DateTime? updatedAt;

  const CommentModel({
    required this.id,
    required this.postId,
    required this.userId,
    this.author,
    required this.content,
    required this.createdAt,
    this.updatedAt,
  });

  factory CommentModel.fromJson(Map<String, dynamic> json) {
    // The backend nests author info under `author`, not `user`.
    final authorJson = json['author'] is Map<String, dynamic>
        ? json['author'] as Map<String, dynamic>
        : (json['user'] is Map<String, dynamic>
            ? json['user'] as Map<String, dynamic>
            : null);

    UserModel? author;
    if (authorJson != null) {
      // Build a UserModel from the partial author block. Backend's comment
      // author only includes username/name/avatar + id — fill the rest
      // with safe defaults so the UI doesn't crash.
      final partial = <String, dynamic>{
        'id': authorJson['id'] ?? json['userId'] ?? json['user_id'] ?? '',
        'username': authorJson['username'] ?? '',
        'name': authorJson['name'] ?? authorJson['username'] ?? '',
        'avatar': authorJson['avatar'],
      };
      author = UserModel.fromJson(partial);
    }

    return CommentModel(
      id: json['id'] as String,
      postId: (json['postId'] ?? json['post_id']) as String? ?? '',
      userId: (json['userId'] ?? json['user_id']) as String? ?? '',
      author: author,
      content: json['content'] as String? ?? '',
      createdAt: _parse(json['createdAt'] ?? json['created_at']) ??
          DateTime.now(),
      updatedAt: _parse(json['updatedAt'] ?? json['updated_at']),
    );
  }
}

DateTime? _parse(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is num) {
    final n = v.toInt();
    if (n > 100000000000) return DateTime.fromMillisecondsSinceEpoch(n);
    return DateTime.fromMillisecondsSinceEpoch(n * 1000);
  }
  if (v is String) {
    final asNum = num.tryParse(v);
    if (asNum != null) return _parse(asNum);
    return DateTime.tryParse(v);
  }
  return null;
}
