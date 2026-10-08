import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/models/conversation_model.dart';
import '../../../../core/models/presence_info_model.dart';
import '../../../../core/widgets/safe_avatar.dart';
import 'group_avatar.dart';
import 'presence_dot.dart';

/// One row in the conversation list.
///
/// Mirrors the row markup in web `ChatColumn.tsx` (the `filteredConversations.map`
/// block, around line 668).
class ConversationListItem extends StatelessWidget {
  final ConversationModel conv;
  final String currentUserId;
  final PresenceInfo? otherPresence;
  final bool isActive;
  final VoidCallback onTap;

  const ConversationListItem({
    super.key,
    required this.conv,
    required this.currentUserId,
    this.otherPresence,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isGroup = conv.isGroup;
    final other =
        isGroup ? null : conv.otherParticipant(currentUserId);
    final displayName = isGroup
        ? (conv.name ?? 'Nhóm')
        : (other?.name.isNotEmpty == true ? other!.name : (other?.username ?? 'Người dùng'));

    final lastMsg = conv.lastMessage;
    final lastText = lastMsg?.content ?? 'Bắt đầu cuộc trò chuyện';
    final lastTime = _formatTime(lastMsg?.createdAt);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? Colors.white.withOpacity(0.05) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _buildAvatar(isGroup, other?.avatar, other?.name ?? other?.username),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: RichText(
                          overflow: TextOverflow.ellipsis,
                          text: TextSpan(
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                            children: [
                              TextSpan(text: displayName),
                              if (isGroup)
                                TextSpan(
                                  text: ' · ${conv.participants.length} người',
                                  style: const TextStyle(
                                    color: Color(0xFF67678D),
                                    fontSize: 11,
                                    fontWeight: FontWeight.normal,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                      if (lastTime.isNotEmpty)
                        Text(
                          lastTime,
                          style: const TextStyle(
                            color: Color(0xFF626775),
                            fontSize: 11,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          lastText,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFFA0A5B5),
                            fontSize: 13,
                          ),
                        ),
                      ),
                      if (conv.unreadCount > 0)
                        Container(
                          margin: const EdgeInsets.only(left: 6),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            gradient: isGroup
                                ? const LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      Color(0xFF8B5CF6),
                                      Color(0xFF14B8A6)
                                    ],
                                  )
                                : const LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      Color(0xFFFF2E93),
                                      Color(0xFFFF8A56)
                                    ],
                                  ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            conv.unreadCount.toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 10,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(bool isGroup, String? avatarUrl, String? name) {
    final initial = (name == null || name!.isEmpty) ? '?' : name![0].toUpperCase();
    if (isGroup) {
      return GroupAvatar(
        participants: conv.participants,
        groupName: conv.name,
        size: 44,
      );
    }
    return SizedBox(
      width: 44,
      height: 44,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
            ),
            child: ClipOval(
              child: SafeAvatar(
                imageUrl: avatarUrl,
                name: (conv.name != null && conv.name!.isNotEmpty)
                    ? conv.name
                    : conv.id,
                size: 44,
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            right: 0,
            child: PresenceDot(presence: otherPresence, size: 12),
          ),
        ],
      ),
    );
  }
}

String _formatTime(DateTime? d) {
  if (d == null) return '';
  final now = DateTime.now();
  final diff = now.difference(d);
  if (diff.inDays < 1 && d.day == now.day) {
    final h = d.hour.toString().padLeft(2, '0');
    final m = d.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
  if (diff.inHours < 24) return 'Hôm qua';
  return '${d.day}/${d.month}';
}

class _InitialFallback extends StatelessWidget {
  final String initial;
  const _InitialFallback({required this.initial});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          fontSize: 16,
        ),
      ),
    );
  }
}
