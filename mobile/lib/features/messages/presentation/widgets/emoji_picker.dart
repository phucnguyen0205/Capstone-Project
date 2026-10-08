import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

/// Three-category emoji picker mirroring the 90-emoji grid in web
/// `ChatColumn.tsx` (`EMOJI_GROUPS`). Shows the picker as a bottom sheet.
class EmojiPickerSheet extends StatelessWidget {
  final void Function(String emoji) onEmoji;

  const EmojiPickerSheet({super.key, required this.onEmoji});

  static const _emotion = <String>[
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
  ];

  static const _hearts = <String>[
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '🖕', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝',
    '🙏', '💪', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  ];

  static const _symbols = <String>[
    '🎉', '🎊', '✨', '🌟', '⭐', '💫', '🔥', '💥', '💯', '✅',
    '❌', '❓', '❗', '💡', '💬', '💭', '🗨️', '🗯️', '🎵', '🎶',
    '🎁', '🎈', '🎂', '🍰', '🍕', '🍔', '🍟', '🍩', '☕', '🍺',
  ];

  static Future<void> show(BuildContext context,
      {required void Function(String) onEmoji}) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1F2028),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => EmojiPickerSheet(onEmoji: onEmoji),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _row('Cảm xúc', _emotion),
              _row('Yêu thích', _hearts),
              _row('Biểu tượng', _symbols),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String label, List<String> emojis) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              color: Color(0xFF9CA3AF),
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              for (final e in emojis)
                InkWell(
                  onTap: () => onEmoji(e),
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    width: 36,
                    height: 36,
                    child: Center(
                      child: Text(e, style: const TextStyle(fontSize: 20)),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Quick emoji icon button used inside the chat input bar.
class EmojiButton extends StatelessWidget {
  final Color? color;
  final VoidCallback onTap;
  const EmojiButton({super.key, this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(
          LucideIcons.smile,
          color: color ?? const Color(0xFFA0A5B5),
          size: 18,
        ),
      ),
    );
  }
}
