import 'package:flutter/foundation.dart';

/// Comment shape for reels. Mirrors the response from
/// `GET /api/posts/[id]/comments` (see `src/app/api/posts/[id]/comments/route.ts`)
/// which the reels player uses to load + post comments because reels
/// are stored in the same `posts` table as regular posts.
@immutable
class ReelComment {
  final String id;
  final String postId;
  final String? parentId;
  final String userId;
  final String content;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool edited;
  final bool deleted;
  final ReelCommentAuthor author;
  final Map<String, int> reactions;
  final List<String> myReactions;
  final int replyCount;

  const ReelComment({
    required this.id,
    required this.postId,
    this.parentId,
    required this.userId,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
    required this.edited,
    required this.deleted,
    required this.author,
    required this.reactions,
    required this.myReactions,
    required this.replyCount,
  });

  factory ReelComment.fromJson(Map<String, dynamic> json) {
    DateTime parseUnix(dynamic v) {
      if (v is num) {
        final i = v.toInt();
        return i > 100000000000
            ? DateTime.fromMillisecondsSinceEpoch(i)
            : DateTime.fromMillisecondsSinceEpoch(i * 1000);
      }
      if (v is String) {
        final asNum = num.tryParse(v);
        if (asNum != null) return parseUnix(asNum);
        return DateTime.tryParse(v) ?? DateTime.now();
      }
      return DateTime.now();
    }

    final rawAuthor = json['author'];
    final author = rawAuthor is Map<String, dynamic>
        ? ReelCommentAuthor.fromJson(rawAuthor)
        : const ReelCommentAuthor(
            id: '',
            username: 'unknown',
            name: null,
            avatar: null,
          );

    final rawReactions = json['reactions'];
    final reactions = rawReactions is Map<String, dynamic>
        ? rawReactions.map((k, v) => MapEntry(k, (v as num?)?.toInt() ?? 0))
        : const <String, int>{};

    final rawMine = json['myReactions'];
    final myReactions = rawMine is List
        ? rawMine.whereType<String>().toList(growable: false)
        : const <String>[];

    return ReelComment(
      id: (json['id'] ?? '').toString(),
      postId: (json['postId'] ?? '').toString(),
      parentId: json['parentId'] as String?,
      userId: (json['userId'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      createdAt: parseUnix(json['createdAt']),
      updatedAt: parseUnix(json['updatedAt']),
      edited: json['edited'] == true,
      deleted: json['deleted'] == true,
      author: author,
      reactions: reactions,
      myReactions: myReactions,
      replyCount: (json['replyCount'] as num?)?.toInt() ?? 0,
    );
  }
}

@immutable
class ReelCommentAuthor {
  final String id;
  final String username;
  final String? name;
  final String? avatar;

  const ReelCommentAuthor({
    required this.id,
    required this.username,
    this.name,
    this.avatar,
  });

  String get displayName {
    final n = name?.trim();
    if (n != null && n.isNotEmpty) return n;
    return '@$username';
  }

  factory ReelCommentAuthor.fromJson(Map<String, dynamic> json) {
    return ReelCommentAuthor(
      id: (json['id'] ?? '').toString(),
      username: (json['username'] ?? 'unknown').toString(),
      name: json['name'] as String?,
      avatar: json['avatar'] as String?,
    );
  }
}