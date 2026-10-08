import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/providers/chat_providers.dart';
import 'chat_theme_picker.dart';

/// Chat input bar at the bottom of `ChatPage`.
///
/// Mirrors the input row in web `ChatColumn.tsx` (around line 1025):
/// - emoji button
/// - attach (paperclip) button
/// - text input
/// - send button
/// - reply preview banner above input when replying
class ChatInputBar extends ConsumerStatefulWidget {
  final ChatTheme theme;
  final bool isGroup;
  final TextEditingController controller;
  final bool sending;
  final bool uploading;
  final bool hasAttachment;
  final VoidCallback onSend;
  final VoidCallback onEmoji;
  final VoidCallback onAttach;
  final VoidCallback onCancelReply;
  final VoidCallback onCancelAttachment;

  const ChatInputBar({
    super.key,
    required this.theme,
    required this.isGroup,
    required this.controller,
    required this.sending,
    required this.uploading,
    required this.hasAttachment,
    required this.onSend,
    required this.onEmoji,
    required this.onAttach,
    required this.onCancelReply,
    required this.onCancelAttachment,
  });

  @override
  ConsumerState<ChatInputBar> createState() => _ChatInputBarState();
}

class _ChatInputBarState extends ConsumerState<ChatInputBar> {
  @override
  Widget build(BuildContext context) {
    final reply = ref.watch(replyToProvider);
    final pending = ref.watch(pendingMediaProvider);
    return Container(
      decoration: BoxDecoration(
        color: widget.theme.surface,
        border: Border(top: BorderSide(color: widget.theme.border)),
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (reply != null)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: widget.theme.theirBubbleBg.withOpacity(0.5),
                border: Border(
                  left: BorderSide(color: widget.theme.accent, width: 2),
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(LucideIcons.cornerDownLeft,
                      color: widget.theme.accent, size: 12),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Trả lời',
                            style: TextStyle(
                                color: widget.theme.accent,
                                fontWeight: FontWeight.w600,
                                fontSize: 10)),
                        Text(
                          reply.content.isEmpty ? '(đính kèm)' : reply.content,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: widget.theme.textSecondary, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  InkWell(
                    onTap: widget.onCancelReply,
                    child: Icon(LucideIcons.x,
                        color: widget.theme.textSecondary, size: 14),
                  ),
                ],
              ),
            ),
          if (pending != null)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: widget.theme.accent,
                  style: BorderStyle.solid,
                ),
                color: widget.theme.theirBubbleBg.withOpacity(0.5),
              ),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: widget.theme.accent,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Icon(
                      pending.kind == 'image'
                          ? LucideIcons.image
                          : (pending.kind == 'video'
                              ? LucideIcons.video
                              : LucideIcons.paperclip),
                      color: Colors.white,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(pending.fileName,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: widget.theme.textPrimary,
                                fontSize: 11,
                                fontWeight: FontWeight.w600)),
                        Text(_formatSize(pending.fileSize),
                            style: TextStyle(
                                color: widget.theme.textSecondary, fontSize: 10)),
                      ],
                    ),
                  ),
                  InkWell(
                    onTap: widget.onCancelAttachment,
                    child: Icon(LucideIcons.x,
                        color: widget.theme.textSecondary, size: 14),
                  ),
                ],
              ),
            ),
          Container(
            decoration: BoxDecoration(
              color: widget.theme.theirBubbleBg,
              borderRadius: BorderRadius.circular(28),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: TextField(
                    controller: widget.controller,
                    style: TextStyle(color: widget.theme.textPrimary, fontSize: 13),
                    onSubmitted: (_) => widget.onSend(),
                    decoration: InputDecoration(
                      hintText: widget.isGroup
                          ? 'Gửi tin nhắn nhóm...'
                          : 'Gửi tin nhắn...',
                      hintStyle: TextStyle(
                          color: widget.theme.textSecondary.withOpacity(0.6),
                          fontSize: 13),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: widget.onEmoji,
                  icon: Icon(LucideIcons.smile,
                      color: widget.theme.textSecondary, size: 18),
                  splashRadius: 18,
                ),
                IconButton(
                  onPressed: widget.onAttach,
                  icon: Icon(LucideIcons.paperclip,
                      color: widget.theme.textSecondary, size: 18),
                  splashRadius: 18,
                ),
                _SendButton(
                  theme: widget.theme,
                  onTap: widget.onSend,
                  sending: widget.sending,
                  uploading: widget.uploading,
                  enabled: !widget.sending &&
                      !widget.uploading &&
                      (widget.controller.text.trim().isNotEmpty ||
                          widget.hasAttachment),
                ),
              ],
            ),
          ),
          if (widget.uploading)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Đang tải tệp lên...',
                style: TextStyle(
                    color: widget.theme.textSecondary, fontSize: 10),
              ),
            ),
        ],
      ),
    );
  }

  static String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }
}

class _SendButton extends StatelessWidget {
  final ChatTheme theme;
  final VoidCallback onTap;
  final bool sending;
  final bool uploading;
  final bool enabled;
  const _SendButton({
    required this.theme,
    required this.onTap,
    required this.sending,
    required this.uploading,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    final isLoading = sending || uploading;
    return Opacity(
      opacity: enabled ? 1.0 : 0.4,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            gradient: theme.bubbleGradient,
            borderRadius: BorderRadius.circular(14),
          ),
          child: isLoading
              ? const Padding(
                  padding: EdgeInsets.all(6),
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : const Icon(LucideIcons.arrowRight,
                  color: Colors.white, size: 14),
        ),
      ),
    );
  }
}
