import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show Color;

import 'user_model.dart';

/// A "Khoảnh Khắc" (Moment) — a small photo/video shared with a
/// specific list of friends, similar to Locket Widget.
///
/// Unlike posts which live in a public feed, moments are intimate
/// snapshots delivered to a curated audience. They expire after
/// `expiresAt` (default 24h).
///
/// Mirrors the backend `Moment` model in `/api/moments`.
@immutable
class MomentModel {
  final String id;
  final String userId;
  final UserModel? author; // populated when joined
  final String mediaUrl;
  final String mediaType; // 'image' | 'video'
  final String? publicId;
  final String caption; // usually empty (Locket-style: caption-less)
  final String? overlayEmoji; // emoji overlay drawn on top of the photo
  final Color? overlayColor; // background tint behind emoji
  final List<String> recipientIds; // explicit recipient list
  final List<UserModel>? recipients; // populated when joined
  final DateTime createdAt;
  final DateTime? expiresAt;
  final DateTime? viewedAt; // when *this* viewer first opened it
  final int reactionsCount;
  final ReactionType? myReaction;
  final bool? isOwn;

  const MomentModel({
    required this.id,
    required this.userId,
    this.author,
    required this.mediaUrl,
    required this.mediaType,
    this.publicId,
    this.caption = '',
    this.overlayEmoji,
    this.overlayColor,
    this.recipientIds = const [],
    this.recipients,
    required this.createdAt,
    this.expiresAt,
    this.viewedAt,
    this.reactionsCount = 0,
    this.myReaction,
    this.isOwn,
  });

  factory MomentModel.fromJson(Map<String, dynamic> json) {
    final authorJson = json['author'] is Map<String, dynamic>
        ? json['author'] as Map<String, dynamic>
        : (json['user'] is Map<String, dynamic>
            ? json['user'] as Map<String, dynamic>
            : null);

    UserModel? author;
    if (authorJson != null) {
      try {
        author = UserModel.fromJson(authorJson);
      } catch (_) {
        author = null;
      }
    }

    final recipientsJson = json['recipients'];
    List<UserModel>? recipients;
    if (recipientsJson is List) {
      recipients = recipientsJson
          .whereType<Map<String, dynamic>>()
          .map(UserModel.fromJson)
          .toList();
    }

    final recipientIdsRaw = json['recipientIds'] ?? json['recipient_ids'];
    final recipientIds = recipientIdsRaw is List
        ? recipientIdsRaw.map((e) => e.toString()).toList()
        : const <String>[];

    final reactionRaw = json['myReaction'] ?? json['my_reaction'];
    ReactionType? myReaction;
    if (reactionRaw is String) {
      myReaction = ReactionTypeX.tryParse(reactionRaw);
    }

    final colorRaw = json['overlayColor'] ?? json['overlay_color'];
    Color? overlayColor;
    if (colorRaw is String && colorRaw.startsWith('#') && colorRaw.length == 7) {
      overlayColor = Color(int.parse(colorRaw.substring(1), radix: 16) | 0xFF000000);
    } else if (colorRaw is int) {
      overlayColor = Color(colorRaw);
    }

    DateTime? _parse(dynamic v) {
      if (v == null) return null;
      if (v is DateTime) return v;
      if (v is num) {
        final n = v.toInt();
        if (n > 100000000000) {
          return DateTime.fromMillisecondsSinceEpoch(n);
        }
        return DateTime.fromMillisecondsSinceEpoch(n * 1000);
      }
      if (v is String) {
        return DateTime.tryParse(v) ??
            (num.tryParse(v) != null ? _parse(num.tryParse(v)) : null);
      }
      return null;
    }

    return MomentModel(
      id: (json['id'] ?? '').toString(),
      userId: (json['userId'] ?? json['user_id'] ?? author?.id ?? '').toString(),
      author: author,
      mediaUrl: (json['mediaUrl'] ?? json['media_url'] ?? '').toString(),
      mediaType: (json['mediaType'] ?? json['media_type'] ?? 'image').toString(),
      publicId: (json['publicId'] ?? json['public_id']) as String?,
      caption: (json['caption'] as String?) ?? '',
      overlayEmoji: (json['overlayEmoji'] ?? json['overlay_emoji']) as String?,
      overlayColor: overlayColor,
      recipientIds: recipientIds,
      recipients: recipients,
      createdAt: _parse(json['createdAt'] ?? json['created_at']) ?? DateTime.now(),
      expiresAt: _parse(json['expiresAt'] ?? json['expires_at']),
      viewedAt: _parse(json['viewedAt'] ?? json['viewed_at']),
      reactionsCount:
          ((json['reactionsCount'] ?? json['reactions_count']) as num?)?.toInt() ??
              0,
      myReaction: myReaction,
      isOwn: json['isOwn'] as bool? ?? json['is_own'] as bool?,
    );
  }

  Map<String, dynamic> toCreateJson() => {
        'mediaUrl': mediaUrl,
        'mediaType': mediaType,
        if (publicId != null) 'publicId': publicId,
        if (caption.isNotEmpty) 'caption': caption,
        if (overlayEmoji != null) 'overlayEmoji': overlayEmoji,
        if (overlayColor != null) 'overlayColor': '#${overlayColor!.value.toRadixString(16).padLeft(8, '0').substring(2)}',
        'recipientIds': recipientIds,
      };

  MomentModel copyWith({
    String? id,
    String? mediaUrl,
    String? mediaType,
    String? caption,
    String? overlayEmoji,
    Color? overlayColor,
    List<String>? recipientIds,
    DateTime? createdAt,
    DateTime? expiresAt,
    DateTime? viewedAt,
    int? reactionsCount,
    ReactionType? myReaction,
  }) =>
      MomentModel(
        id: id ?? this.id,
        userId: userId,
        author: author,
        mediaUrl: mediaUrl ?? this.mediaUrl,
        mediaType: mediaType ?? this.mediaType,
        publicId: publicId,
        caption: caption ?? this.caption,
        overlayEmoji: overlayEmoji ?? this.overlayEmoji,
        overlayColor: overlayColor ?? this.overlayColor,
        recipientIds: recipientIds ?? this.recipientIds,
        recipients: recipients,
        createdAt: createdAt ?? this.createdAt,
        expiresAt: expiresAt ?? this.expiresAt,
        viewedAt: viewedAt ?? this.viewedAt,
        reactionsCount: reactionsCount ?? this.reactionsCount,
        myReaction: myReaction ?? this.myReaction,
      );

  bool get isExpired =>
      expiresAt != null && DateTime.now().isAfter(expiresAt!);

  bool get isVideo => mediaType == 'video';
}

/// Quick reaction types supported on a moment.
enum ReactionType { heart, fire, laugh, wow, sad }

extension ReactionTypeX on ReactionType {
  String get wire => switch (this) {
        ReactionType.heart => 'heart',
        ReactionType.fire => 'fire',
        ReactionType.laugh => 'laugh',
        ReactionType.wow => 'wow',
        ReactionType.sad => 'sad',
      };

  static ReactionType? tryParse(String? raw) {
    if (raw == null) return null;
    for (final r in ReactionType.values) {
      if (r.wire == raw) return r;
    }
    return null;
  }
}