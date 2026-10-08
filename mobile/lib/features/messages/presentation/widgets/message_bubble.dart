import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/conversation_model.dart';
import '../../../../core/models/user_model.dart';
import '../../../../core/widgets/safe_avatar.dart';
import 'chat_theme_picker.dart';

/// One chat message bubble.
///
/// Mirrors `messages.map((msg) => ...)` in web `ChatColumn.tsx`. Supports:
///   - image / video / file media
///   - sender name (in group chats)
///   - gradient "me" bubble + solid "their" bubble
class MessageBubble extends StatelessWidget {
  final MessageModel message;
  final String currentUserId;
  final bool isGroup;
  final ChatTheme theme;
  final UserModel? sender; // when joined (from API)
  final VoidCallback? onReply;
  final VoidCallback? onLongPress;

  const MessageBubble({
    super.key,
    required this.message,
    required this.currentUserId,
    required this.isGroup,
    required this.theme,
    this.sender,
    this.onReply,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final isMe = message.senderId == currentUserId;
    final senderName = sender?.name.isNotEmpty == true
        ? sender!.name
        : (sender?.username ?? 'Người dùng');

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        textDirection: isMe ? TextDirection.rtl : TextDirection.ltr,
        mainAxisAlignment:
            isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isMe)
            Container(
              width: 24,
              height: 24,
              margin: const EdgeInsets.only(right: 6, left: 0),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.theirBubbleBg,
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Themed fallback underneath so the bubble colour shows
                  // through during image load / 429 rate-limit.
                  ClipOval(child: _SenderFallback(name: senderName, theme: theme)),
                  SafeAvatar(
                    imageUrl: sender?.avatar,
                    name: senderName,
                    size: 24,
                  ),
                ],
              ),
            ),
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                if (!isMe && isGroup)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 2),
                    child: Text(
                      senderName,
                      style: TextStyle(
                        color: theme.textSecondary,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                GestureDetector(
                  onLongPress: onLongPress ?? onReply,
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 240),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      gradient: isMe ? theme.bubbleGradient : null,
                      color: isMe ? null : theme.theirBubbleBg,
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(12),
                        topRight: const Radius.circular(12),
                        bottomLeft: Radius.circular(isMe ? 12 : 4),
                        bottomRight: Radius.circular(isMe ? 4 : 12),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (message.mediaUrl != null &&
                            message.mediaType == 'image')
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: CachedNetworkImage(
                              imageUrl: message.mediaUrl!,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => const SizedBox(
                                  height: 80,
                                  child: Icon(Icons.broken_image,
                                      color: Colors.white60)),
                            ),
                          ),
                        if (message.mediaUrl != null &&
                            message.mediaType == 'video')
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: AspectRatio(
                              aspectRatio: 16 / 9,
                              child: Container(
                                color: Colors.black,
                                child: const Center(
                                  child: Icon(Icons.play_arrow,
                                      color: Colors.white, size: 36),
                                ),
                              ),
                            ),
                          ),
                        if (message.mediaUrl != null &&
                            message.mediaType == 'file')
                          _FileAttachment(message: message, isMe: isMe),
                        if (message.content.isNotEmpty)
                          Padding(
                            padding: EdgeInsets.only(
                                top: (message.hasMedia &&
                                        message.mediaType != 'file')
                                    ? 6
                                    : 0),
                            child: Text(
                              message.content,
                              style: TextStyle(
                                color: isMe
                                    ? Colors.white
                                    : theme.theirBubbleText,
                                fontSize: 13,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SenderFallback extends StatelessWidget {
  final String name;
  final ChatTheme theme;
  const _SenderFallback({required this.name, required this.theme});
  @override
  Widget build(BuildContext context) {
    return Container(
      color: theme.theirBubbleBg,
      alignment: Alignment.center,
      child: Text(
        name.isEmpty ? '?' : name[0].toUpperCase(),
        style: TextStyle(
          color: theme.theirBubbleText,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}

class _FileAttachment extends StatelessWidget {
  final MessageModel message;
  final bool isMe;
  const _FileAttachment({required this.message, required this.isMe});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(4),
            ),
            child: const Icon(LucideIcons.paperclip,
                color: Colors.white, size: 14),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message.fileName ?? 'Tệp đính kèm',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                ),
                Text(
                  _formatSize(message.fileSize),
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          const Icon(LucideIcons.arrowRight,
              color: Colors.white70, size: 12),
        ],
      ),
    );
  }

  static String _formatSize(int? bytes) {
    if (bytes == null || bytes <= 0) return 'Tệp';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }
}
