import 'package:flutter/foundation.dart';

import 'user_model.dart';

/// A media post (photo/video) with caption, lens (visibility) and
/// moderation metadata. Mirrors the response shape of
/// `GET /api/feed`, `GET /api/users/[id]/posts`, and `GET /api/posts/[id]`
/// in the Next.js backend.
///
/// Field-name notes (vs backend):
/// * `author` is a nested object — mobile MUST read it from `json['author']`,
///   not `json['user']`.
/// * Counters come back as flat `likes` / `comments`, not `likesCount`.
/// * Viewer-relative booleans are `liked` / `saved`, not `likedByMe`/`savedByMe`.
@immutable
class PostModel {
  final String id;
  final String userId;
  final UserModel? author; // populated when joined (feed, profile posts)
  final String caption;
  final String mediaUrl;
  final String mediaType; // 'image' | 'video'
  final String? publicId; // Cloudinary public_id
  final String lens; // 'public' | 'friends' | 'close'
  final DateTime createdAt;
  final DateTime? updatedAt;
  final String moderationStatus; // 'pending' | 'approved' | 'rejected'
  final String? moderationReason;
  final double? moderationScore;
  final int? mediaWidth;
  final int? mediaHeight;

  // Stats & per-viewer relationship — backend uses `likes`/`comments`,
  // legacy endpoints may still send `likesCount`/`commentsCount`.
  final int likesCount;
  final int commentsCount;
  final int sharesCount;
  final bool? likedByMe;
  final bool? savedByMe;
  final bool? isOwn;

  // Lens constants (map to backend `lens` enum)
  static const String lensPublic = 'public';
  static const String lensFriends = 'friends';
  static const String lensClose = 'close';

  const PostModel({
    required this.id,
    required this.userId,
    this.author,
    required this.caption,
    required this.mediaUrl,
    required this.mediaType,
    this.publicId,
    required this.lens,
    required this.createdAt,
    this.updatedAt,
    this.moderationStatus = 'approved',
    this.moderationReason,
    this.moderationScore,
    this.mediaWidth,
    this.mediaHeight,
    this.likesCount = 0,
    this.commentsCount = 0,
    this.sharesCount = 0,
    this.likedByMe,
    this.savedByMe,
    this.isOwn,
  });

  factory PostModel.fromJson(Map<String, dynamic> json) {
    final authorJson = json['author'] is Map<String, dynamic>
        ? json['author'] as Map<String, dynamic>
        : (json['user'] is Map<String, dynamic>
            ? json['user'] as Map<String, dynamic>
            : null);

    // Defensive: if the author block has neither `id` nor a workable
    // username, treat it as missing so the UI falls back gracefully
    // instead of crashing the entire feed render.
    UserModel? author;
    if (authorJson != null) {
      final hasIdentity =
          (authorJson['id'] ?? authorJson['userId']) != null ||
              (authorJson['username'] is String &&
                  (authorJson['username'] as String).isNotEmpty);
      if (hasIdentity) {
        try {
          author = UserModel.fromJson(authorJson);
        } catch (_) {
          author = null;
        }
      }
    }

    final userId =
        (json['userId'] ?? json['user_id'])?.toString() ?? author?.id ?? '';

    return PostModel(
      id: (json['id'] ?? '').toString(),
      userId: userId,
      author: author,
      caption: json['caption'] as String? ?? '',
      mediaUrl: (json['mediaUrl'] ?? json['media_url']) as String? ?? '',
      mediaType: (json['mediaType'] ?? json['media_type']) as String? ?? 'image',
      publicId: (json['publicId'] ?? json['public_id']) as String?,
      lens: (json['lens'] as String?) ?? 'friends',
      createdAt: _parse(json['createdAt'] ?? json['created_at']) ??
          DateTime.now(),
      updatedAt: _parse(json['updatedAt'] ?? json['updated_at']),
      moderationStatus:
          (json['moderationStatus'] ?? json['moderation_status']) as String? ??
              'approved',
      moderationReason:
          (json['moderationReason'] ?? json['moderation_reason']) as String?,
      moderationScore: (json['moderationScore'] ?? json['moderation_score'])
          as double?,
      mediaWidth: (json['mediaWidth'] ?? json['media_width']) as int?,
      mediaHeight: (json['mediaHeight'] ?? json['media_height']) as int?,
      // Counters — prefer the canonical `likes`/`comments` fields, fall back
      // to older `likesCount`/`commentsCount` names, and finally to nested
      // `_count` (Prisma-style) for legacy responses.
      likesCount: ((json['likes'] ?? json['likesCount'] ?? json['likes_count'])
                  as num?)
              ?.toInt() ??
          ((json['_count']?['likes'] as num?)?.toInt() ?? 0),
      commentsCount: ((json['comments'] ??
                  json['commentsCount'] ??
                  json['comments_count'])
              as num?)
              ?.toInt() ??
          ((json['_count']?['comments'] as num?)?.toInt() ?? 0),
      sharesCount:
          ((json['shares'] ?? json['sharesCount'] ?? json['shares_count'])
                  as num?)
              ?.toInt() ??
              ((json['_count']?['shares'] as num?)?.toInt() ?? 0),
      // Viewer-relative booleans — canonical is `liked`/`saved`, fall back to
      // older names.
      likedByMe: json['liked'] as bool? ??
          json['likedByMe'] as bool? ??
          json['liked_by_me'] as bool?,
      savedByMe: json['saved'] as bool? ??
          json['savedByMe'] as bool? ??
          json['saved_by_me'] as bool?,
      isOwn: json['isOwn'] as bool?,
    );
  }

  Map<String, dynamic> toCreateJson() => {
        'caption': caption,
        'mediaUrl': mediaUrl,
        'mediaType': mediaType,
        'lens': lens,
      };

  PostModel copyWith({
    String? id,
    String? caption,
    String? mediaUrl,
    String? lens,
    int? likesCount,
    int? commentsCount,
    int? sharesCount,
    bool? likedByMe,
    bool? savedByMe,
    bool? isOwn,
  }) =>
      PostModel(
        id: id ?? this.id,
        userId: userId,
        author: author,
        caption: caption ?? this.caption,
        mediaUrl: mediaUrl ?? this.mediaUrl,
        mediaType: mediaType,
        publicId: publicId,
        lens: lens ?? this.lens,
        createdAt: createdAt,
        updatedAt: updatedAt,
        moderationStatus: moderationStatus,
        moderationReason: moderationReason,
        moderationScore: moderationScore,
        mediaWidth: mediaWidth,
        mediaHeight: mediaHeight,
        likesCount: likesCount ?? this.likesCount,
        commentsCount: commentsCount ?? this.commentsCount,
        sharesCount: sharesCount ?? this.sharesCount,
        likedByMe: likedByMe ?? this.likedByMe,
        savedByMe: savedByMe ?? this.savedByMe,
        isOwn: isOwn ?? this.isOwn,
      );
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
