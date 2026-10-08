import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

/// Bottom sheet for picking media (image / video / file) before
/// sending. Mirrors the file input flow in web `ChatColumn.tsx`
/// (`handleFileChosen`).
class MediaAttachmentSheet extends StatelessWidget {
  final void Function(_MediaKind kind) onPick;

  const MediaAttachmentSheet({super.key, required this.onPick});

  static Future<_MediaKind?> show(BuildContext context) async {
    return showModalBottomSheet<_MediaKind>(
      context: context,
      backgroundColor: const Color(0xFF171920),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => MediaAttachmentSheet(
        onPick: (k) => Navigator.of(context).pop(k),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Đính kèm',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          ListTile(
            leading: const Icon(LucideIcons.image,
                color: Color(0xFFFF2E93)),
            title: const Text('Ảnh',
                style: TextStyle(color: Colors.white)),
            onTap: () => onPick(_MediaKind.image),
          ),
          ListTile(
            leading: const Icon(LucideIcons.video,
                color: Color(0xFF06B6D4)),
            title: const Text('Video',
                style: TextStyle(color: Colors.white)),
            onTap: () => onPick(_MediaKind.video),
          ),
          ListTile(
            leading: const Icon(LucideIcons.paperclip,
                color: Color(0xFFFBBF24)),
            title: const Text('Tệp',
                style: TextStyle(color: Colors.white)),
            onTap: () => onPick(_MediaKind.file),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

enum _MediaKind { image, video, file }

typedef MediaKind = _MediaKind;
