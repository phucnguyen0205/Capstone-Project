import 'package:flutter/foundation.dart';

import 'user_model.dart';

/// Chat conversation. 1-1 has `name == null`, group has `name` set.
@immutable
class ConversationModel {
  final String id;
  final String? name;
  final bool isGroup;
  final String? avatarUrl;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<UserModel> participants;

  // Latest message preview fields (from conversations list endpoint)
  final MessageModel? lastMessage;
  final int unreadCount;

  const ConversationModel({
    required this.id,
    this.name,
    this.isGroup = false,
    this.avatarUrl,
    required this.createdAt,
    required this.updatedAt,
    this.participants = const [],
    this.lastMessage,
    this.unreadCount = 0,
  });

  String get displayName {
    if (isGroup && name != null && name!.isNotEmpty) return name!;
    if (participants.isNotEmpty) {
      return participants
          .map((p) => p.name)
          .where((n) => n.isNotEmpty)
          .join(', ');
    }
    return 'Cuộc trò chuyện';
  }

  /// Returns the other participant in a 1-1 conversation (assuming
  /// `currentUserId` is the viewer).
  UserModel? otherParticipant(String currentUserId) {
    if (isGroup) return null;
    for (final p in participants) {
      if (p.id != currentUserId) return p;
    }
    return participants.isNotEmpty ? participants.first : null;
  }

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    final rawParticipants = json['participants'] as List<dynamic>? ?? const [];
    final participants = rawParticipants
        .whereType<Map<String, dynamic>>()
        .map(UserModel.fromJson)
        .toList();

    final last = json['lastMessage'] ?? json['last_message'];
    final lastMsg = last is Map<String, dynamic>
        ? MessageModel.fromJson({...last, 'conversation_id': json['id']})
        : null;

    final unread = json['unreadCount'] ?? json['unread_count'] ?? 0;

    return ConversationModel(
      id: json['id'] as String,
      name: json['name'] as String?,
      isGroup: json['is_group'] == 1 ||
          json['is_group'] == true ||
          json['isGroup'] == true,
      avatarUrl: (json['avatar_url'] ?? json['avatarUrl']) as String?,
      createdAt: _parse(json['created_at']) ?? DateTime.now(),
      updatedAt: _parse(json['updated_at']) ?? DateTime.now(),
      participants: participants,
      lastMessage: lastMsg,
      unreadCount: (unread is num) ? unread.toInt() : 0,
    );
  }

  ConversationModel copyWith({
    String? id,
    String? name,
    bool? isGroup,
    String? avatarUrl,
    DateTime? updatedAt,
    List<UserModel>? participants,
    MessageModel? lastMessage,
    int? unreadCount,
  }) =>
      ConversationModel(
        id: id ?? this.id,
        name: name ?? this.name,
        isGroup: isGroup ?? this.isGroup,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        participants: participants ?? this.participants,
        lastMessage: lastMessage ?? this.lastMessage,
        unreadCount: unreadCount ?? this.unreadCount,
      );
}

/// A single chat message.
@immutable
class MessageModel {
  final String id;
  final String conversationId;
  final String senderId;
  final UserModel? sender; // populated when joined
  final String content;
  final String? mediaUrl;
  final String? mediaType; // 'image' | 'video' | 'file'
  final String? fileName;
  final int? fileSize;
  final DateTime createdAt;
  final DateTime? updatedAt;

  const MessageModel({
    required this.id,
    required this.conversationId,
    required this.senderId,
    this.sender,
    required this.content,
    this.mediaUrl,
    this.mediaType,
    this.fileName,
    this.fileSize,
    required this.createdAt,
    this.updatedAt,
  });

  bool get hasMedia =>
      mediaUrl != null && mediaUrl!.isNotEmpty && mediaType != null;

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: json['id'] as String,
      conversationId: (json['conversation_id'] ?? json['conversationId']) as String,
      senderId: (json['sender_id'] ?? json['senderId']) as String,
      sender: json['sender'] is Map<String, dynamic>
          ? UserModel.fromJson(json['sender'] as Map<String, dynamic>)
          : null,
      content: json['content'] as String? ?? '',
      mediaUrl: (json['media_url'] ?? json['mediaUrl']) as String?,
      mediaType: (json['media_type'] ?? json['mediaType']) as String?,
      fileName: (json['file_name'] ?? json['fileName']) as String?,
      fileSize: (json['file_size'] ?? json['fileSize']) as int?,
      createdAt: _parse(json['created_at']) ?? DateTime.now(),
      updatedAt: _parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toCreateJson() => {
        'content': content,
        if (mediaUrl != null) 'mediaUrl': mediaUrl,
        if (mediaType != null) 'mediaType': mediaType,
        if (fileName != null) 'fileName': fileName,
        if (fileSize != null) 'fileSize': fileSize,
      };
}

DateTime? _parse(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is num) return DateTime.fromMillisecondsSinceEpoch(v.toInt() * 1000);
  if (v is String) return DateTime.tryParse(v);
  return null;
}
