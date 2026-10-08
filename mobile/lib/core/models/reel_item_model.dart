import 'package:flutter/foundation.dart';

/// A single reel item returned by `/api/reels/explore` and
/// `/api/reels/mine`.
///
/// The shape mirrors the JSON returned by the Next.js backend (see
/// `src/app/api/reels/explore/route.ts` and `src/app/api/reels/mine/route.ts`)
/// so that the same model can be used for both surfaces. Important
/// differences from the older `ReelModel` in this file:
///   * Media URL comes back as `mediaUrl` (not `videoUrl`).
///   * `createdAt` is a Unix **seconds** integer (the backend never
///     sends ISO strings for reels — keep using `_parseDate`).
///   * `author` is a nested object with its own id/username/name/avatar.
///   * Locked reels come back without a usable `mediaUrl` (the field is
///     intentionally omitted server-side). The mobile UI must check
///     `locked` and `distanceToUnlock` and call `POST /api/reels/[id]/unlock`
///     to fetch the real URL once the viewer is allowed.
@immutable
class ReelItem {
  final String id;
  final String mediaUrl;
  final int? mediaWidth;
  final int? mediaHeight;
  final String? caption;
  final DateTime createdAt;
  final String lens; // 'public' | 'friends' | 'close' | 'private'

  /// Whether the reel is locked for the current viewer. Locked reels
  /// have no playable `mediaUrl` and require either the unlock endpoint
  /// (close lens, threshold met) or becoming friends with the author.
  final bool locked;

  /// Points still needed before the viewer can unlock a `close`-lens reel.
  /// Always 0 for non-close reels.
  final int distanceToUnlock;

  /// Closeness points the viewer has already accumulated with the author.
  /// 0 unless `lens == 'close'`.
  final int myClosenessPoints;

  /// Server-side moderation state. 'pending' only surfaces for the
  /// author's own videos — they get a soft amber chip so they can see
  /// their upload is still in the queue.
  final String? moderationStatus;

  final ReelAuthor author;

  final int likeCount;
  final bool likedByMe;
  final int commentCount;

  /// Optional server-side reason for why this item was surfaced
  /// (e.g. "viral", "friend_recent"). Surfaced in the UI for debugging
  /// only — there is no end-user-facing rendering of this yet.
  final String? recReason;

  const ReelItem({
    required this.id,
    required this.mediaUrl,
    this.mediaWidth,
    this.mediaHeight,
    this.caption,
    required this.createdAt,
    required this.lens,
    required this.locked,
    required this.distanceToUnlock,
    required this.myClosenessPoints,
    this.moderationStatus,
    required this.author,
    required this.likeCount,
    required this.likedByMe,
    required this.commentCount,
    this.recReason,
  });

  /// Aspect ratio (`width / height`) with a sensible default for
  /// vertical video when the backend didn't record dimensions.
  double get aspectRatio {
    if (mediaWidth != null &&
        mediaHeight != null &&
        mediaWidth! > 0 &&
        mediaHeight! > 0) {
      return mediaWidth! / mediaHeight!;
    }
    return 9 / 16;
  }

  bool get isPending => moderationStatus == 'pending';
  bool get isClose => lens == 'close';
  bool get isPublic => lens == 'public';
  bool get isFriends => lens == 'friends';

  factory ReelItem.fromJson(Map<String, dynamic> json) {
    final authorJson = json['author'];
    final author = authorJson is Map<String, dynamic>
        ? ReelAuthor.fromJson(authorJson)
        : const ReelAuthor(
            id: '',
            username: 'unknown',
            name: null,
            avatar: null,
          );

    final createdAtRaw = json['createdAt'];
    DateTime createdAt;
    if (createdAtRaw is num) {
      final n = createdAtRaw.toInt();
      createdAt = n > 100000000000
          ? DateTime.fromMillisecondsSinceEpoch(n)
          : DateTime.fromMillisecondsSinceEpoch(n * 1000);
    } else if (createdAtRaw is String) {
      createdAt = DateTime.tryParse(createdAtRaw) ?? DateTime.now();
    } else {
      createdAt = DateTime.now();
    }

    return ReelItem(
      id: (json['id'] ?? '').toString(),
      // When locked, the backend omits mediaUrl — fall back to empty
      // string so callers can still pass the URL to video_player (which
      // gracefully handles the empty case via the `errorBuilder`).
      mediaUrl: (json['mediaUrl'] ?? '').toString(),
      mediaWidth: (json['mediaWidth'] as num?)?.toInt(),
      mediaHeight: (json['mediaHeight'] as num?)?.toInt(),
      caption: json['caption'] as String?,
      createdAt: createdAt,
      lens: (json['lens'] ?? 'public') as String,
      locked: json['locked'] == true,
      distanceToUnlock: (json['distanceToUnlock'] as num?)?.toInt() ?? 0,
      myClosenessPoints: (json['myClosenessPoints'] as num?)?.toInt() ?? 0,
      moderationStatus: json['moderationStatus'] as String?,
      author: author,
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      likedByMe: json['likedByMe'] == true,
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      recReason: json['recReason'] as String?,
    );
  }

  ReelItem copyWith({
    String? id,
    String? mediaUrl,
    int? mediaWidth,
    int? mediaHeight,
    String? caption,
    DateTime? createdAt,
    String? lens,
    bool? locked,
    int? distanceToUnlock,
    int? myClosenessPoints,
    String? moderationStatus,
    ReelAuthor? author,
    int? likeCount,
    bool? likedByMe,
    int? commentCount,
    String? recReason,
  }) {
    return ReelItem(
      id: id ?? this.id,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      mediaWidth: mediaWidth ?? this.mediaWidth,
      mediaHeight: mediaHeight ?? this.mediaHeight,
      caption: caption ?? this.caption,
      createdAt: createdAt ?? this.createdAt,
      lens: lens ?? this.lens,
      locked: locked ?? this.locked,
      distanceToUnlock: distanceToUnlock ?? this.distanceToUnlock,
      myClosenessPoints: myClosenessPoints ?? this.myClosenessPoints,
      moderationStatus: moderationStatus ?? this.moderationStatus,
      author: author ?? this.author,
      likeCount: likeCount ?? this.likeCount,
      likedByMe: likedByMe ?? this.likedByMe,
      commentCount: commentCount ?? this.commentCount,
      recReason: recReason ?? this.recReason,
    );
  }
}

@immutable
class ReelAuthor {
  final String id;
  final String username;
  final String? name;
  final String? avatar;

  const ReelAuthor({
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

  factory ReelAuthor.fromJson(Map<String, dynamic> json) {
    return ReelAuthor(
      id: (json['id'] ?? '').toString(),
      username: (json['username'] ?? 'unknown').toString(),
      name: json['name'] as String?,
      avatar: json['avatar'] as String?,
    );
  }
}