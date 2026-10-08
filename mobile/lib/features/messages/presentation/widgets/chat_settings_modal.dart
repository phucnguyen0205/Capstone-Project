import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/conversation_model.dart';
import 'chat_theme_picker.dart';

/// Bottom sheet showing chat settings. Mirrors the `ChatSettingsModal`
/// in web. Supports:
///   - main tab (rename, theme, mute, pin, media, files, block, report)
///   - rename tab
///   - colors (theme picker)
///   - media tab
///   - files tab
class ChatSettingsModal extends StatefulWidget {
  final ConversationModel conversation;
  final ChatTheme theme;
  final bool muted;
  final bool pinned;
  final void Function(String) onRename;
  final void Function(String) onPickTheme;
  final void Function(bool) onMute;
  final void Function(bool) onPin;
  final Future<void> Function() onBlock;
  final Future<void> Function() onReport;
  final Future<void> Function() onDelete;

  const ChatSettingsModal({
    super.key,
    required this.conversation,
    required this.theme,
    required this.muted,
    required this.pinned,
    required this.onRename,
    required this.onPickTheme,
    required this.onMute,
    required this.onPin,
    required this.onBlock,
    required this.onReport,
    required this.onDelete,
  });

  static Future<void> show(BuildContext context,
      {required ChatSettingsModal content}) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF171920),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => content,
    );
  }

  @override
  State<ChatSettingsModal> createState() => _ChatSettingsModalState();
}

enum _Tab { main, colors, media, files, rename }

class _ChatSettingsModalState extends State<ChatSettingsModal> {
  _Tab _tab = _Tab.main;

  @override
  Widget build(BuildContext context) {
    final conv = widget.conversation;
    final isGroup = conv.isGroup;
    final title = _tab == _Tab.main
        ? 'Cài đặt cuộc trò chuyện'
        : _tab == _Tab.colors
            ? 'Chủ đề màu sắc'
            : _tab == _Tab.media
                ? 'Ảnh & Phương tiện'
                : _tab == _Tab.files
                    ? 'Tệp đính kèm'
                    : (isGroup ? 'Đổi tên nhóm' : 'Đổi tên hiển thị');

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (_, controller) {
        return Column(
          children: [
            _Header(
              title: title,
              showBack: _tab != _Tab.main,
              onBack: () => setState(() => _tab = _Tab.main),
              onClose: () => Navigator.of(context).pop(),
            ),
            Expanded(
              child: _tab == _Tab.main
                  ? _MainTab(
                      isGroup: isGroup,
                      conversationName: isGroup
                          ? (conv.name ?? 'Nhóm')
                          : (conv.participants
                                  .firstWhereOrNull((p) => true)
                                  ?.name ??
                              'Người dùng'),
                      theme: widget.theme,
                      muted: widget.muted,
                      pinned: widget.pinned,
                      onRename: () => setState(() => _tab = _Tab.rename),
                      onColors: () => setState(() => _tab = _Tab.colors),
                      onMute: () => widget.onMute(!widget.muted),
                      onPin: () => widget.onPin(!widget.pinned),
                      onMedia: () => setState(() => _tab = _Tab.media),
                      onFiles: () => setState(() => _tab = _Tab.files),
                      onBlock: () async {
                        await widget.onBlock();
                        if (mounted) Navigator.of(context).pop();
                      },
                      onReport: () async {
                        await widget.onReport();
                        if (mounted) Navigator.of(context).pop();
                      },
                    )
                  : _tab == _Tab.colors
                      ? _ColorsTab(
                          current: widget.theme,
                          onPick: (id) {
                            widget.onPickTheme(id);
                            setState(() {});
                          },
                        )
                      : _tab == _Tab.media
                          ? const _MediaTab()
                          : _tab == _Tab.files
                              ? const _FilesTab()
                              : _RenameTab(
                                  conversationId: conv.id,
                                  currentName: conv.name ?? '',
                                  onSave: widget.onRename,
                                ),
            ),
          ],
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  final String title;
  final bool showBack;
  final VoidCallback onBack;
  final VoidCallback onClose;
  const _Header({
    required this.title,
    required this.showBack,
    required this.onBack,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFF242831))),
      ),
      child: Stack(
        children: [
          if (showBack)
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: IconButton(
                onPressed: onBack,
                icon: const Icon(LucideIcons.arrowLeft,
                    color: Color(0xFFA0A5B5), size: 18),
              ),
            ),
          Center(
            child: Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: 0,
            bottom: 0,
            child: IconButton(
              onPressed: onClose,
              icon: const Icon(LucideIcons.x,
                  color: Color(0xFFA0A5B5), size: 18),
            ),
          ),
        ],
      ),
    );
  }
}

extension _IterFirstOrNull<T> on Iterable<T> {
  T? firstWhereOrNull(bool Function(T) test) {
    for (final e in this) {
      if (test(e)) return e;
    }
    return null;
  }
}

class _MainTab extends StatelessWidget {
  final bool isGroup;
  final String conversationName;
  final ChatTheme theme;
  final bool muted;
  final bool pinned;
  final VoidCallback onRename;
  final VoidCallback onColors;
  final VoidCallback onMute;
  final VoidCallback onPin;
  final VoidCallback onMedia;
  final VoidCallback onFiles;
  final VoidCallback onBlock;
  final VoidCallback onReport;

  const _MainTab({
    required this.isGroup,
    required this.conversationName,
    required this.theme,
    required this.muted,
    required this.pinned,
    required this.onRename,
    required this.onColors,
    required this.onMute,
    required this.onPin,
    required this.onMedia,
    required this.onFiles,
    required this.onBlock,
    required this.onReport,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: RichText(
            text: TextSpan(
              style: const TextStyle(
                  color: Color(0xFF626775), fontSize: 11),
              children: [
                const TextSpan(text: 'Đang trò chuyện với '),
                TextSpan(
                  text: conversationName,
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ),
        _Row(
          icon: LucideIcons.edit,
          label: isGroup ? 'Đổi tên nhóm' : 'Đổi tên hiển thị',
          onTap: onRename,
        ),
        _Row(
          icon: LucideIcons.palette,
          label: 'Chủ đề màu sắc',
          sub: theme.label,
          trailing: Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              gradient: theme.bubbleGradient,
              shape: BoxShape.circle,
            ),
          ),
          onTap: onColors,
        ),
        _Row(
          icon: LucideIcons.bellOff,
          label: 'Tắt thông báo',
          trailing: Switch(
            value: muted,
            onChanged: (_) => onMute(),
            activeColor: const Color(0xFFFF2E93),
          ),
          onTap: onMute,
        ),
        _Row(
          icon: LucideIcons.bookmark,
          label: pinned ? 'Bỏ ghim cuộc trò chuyện' : 'Ghim cuộc trò chuyện',
          trailing: Icon(
            LucideIcons.bookmark,
            color: pinned ? const Color(0xFFFF2E93) : const Color(0xFF626775),
            size: 16,
          ),
          onTap: onPin,
        ),
        _Row(
          icon: LucideIcons.paperclip,
          label: 'Tệp & Phương tiện',
          onTap: onMedia,
        ),
        if (!isGroup) ...[
          const Divider(color: Color(0xFF242831), height: 24),
          _Row(
            icon: LucideIcons.lock,
            label: 'Chặn người dùng',
            color: const Color(0xFFFBBF24),
            onTap: onBlock,
          ),
          _Row(
            icon: LucideIcons.flag,
            label: 'Báo cáo vi phạm',
            color: const Color(0xFFF87171),
            onTap: onReport,
          ),
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? sub;
  final Widget? trailing;
  final Color? color;
  final VoidCallback onTap;
  const _Row({
    required this.icon,
    required this.label,
    this.sub,
    this.trailing,
    this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? Colors.white;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFFA0A5B5), size: 16),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style:
                          TextStyle(color: c, fontSize: 13)),
                  if (sub != null)
                    Text(sub!,
                        style: const TextStyle(
                            color: Color(0xFF626775), fontSize: 11)),
                ],
              ),
            ),
            trailing ??
                const Icon(LucideIcons.chevronRight,
                    color: Color(0xFF626775), size: 14),
          ],
        ),
      ),
    );
  }
}

class _ColorsTab extends StatelessWidget {
  final ChatTheme current;
  final void Function(String id) onPick;
  const _ColorsTab({required this.current, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
      ),
      itemCount: THEMES.length,
      itemBuilder: (_, i) {
        final t = THEMES[i];
        final selected = t.id == current.id;
        return InkWell(
          onTap: () => onPick(t.id),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: selected ? Colors.white.withOpacity(0.1) : null,
              borderRadius: BorderRadius.circular(12),
              border: selected
                  ? Border.all(color: Colors.white.withOpacity(0.3))
                  : null,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  height: 28,
                  decoration: BoxDecoration(
                    gradient: t.bubbleGradient,
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  t.label.split(' ').take(2).join(' '),
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 9),
                ),
                if (selected)
                  const Icon(LucideIcons.check,
                      color: Color(0xFF34D399), size: 12),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _RenameTab extends StatefulWidget {
  final String conversationId;
  final String currentName;
  final void Function(String) onSave;
  const _RenameTab({
    required this.conversationId,
    required this.currentName,
    required this.onSave,
  });

  @override
  State<_RenameTab> createState() => _RenameTabState();
}

class _RenameTabState extends State<_RenameTab> {
  late final TextEditingController _ctrl =
      TextEditingController(text: widget.currentName);
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    final v = _ctrl.text.trim();
    if (v.isEmpty) {
      setState(() => _error = 'Tên không được để trống');
      return;
    }
    if (v.length > 60) {
      setState(() => _error = 'Tên tối đa 60 ký tự');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    widget.onSave(v);
    await Future.delayed(const Duration(milliseconds: 300));
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Đổi tên. Tất cả thành viên sẽ thấy tên mới.',
            style: TextStyle(color: Color(0xFFA0A5B5), fontSize: 12),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _ctrl,
            maxLength: 60,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              labelText: 'Tên cuộc trò chuyện',
              labelStyle: TextStyle(color: Color(0xFF626775)),
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFF2A2D37)),
              ),
              focusedBorder: OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFFFF2E93)),
              ),
              counterStyle: TextStyle(color: Color(0xFF626775)),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_error!,
                  style: const TextStyle(color: Color(0xFFF87171), fontSize: 11)),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                ),
              ),
              child: TextButton(
                onPressed: _saving ? null : _save,
                child: Text(
                  _saving ? 'Đang lưu...' : 'Lưu thay đổi',
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MediaTab extends StatelessWidget {
  const _MediaTab();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        'Chưa có ảnh nào được chia sẻ',
        style: TextStyle(color: Color(0xFF626775), fontSize: 12),
      ),
    );
  }
}

class _FilesTab extends StatelessWidget {
  const _FilesTab();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        'Chưa có tệp đính kèm nào',
        style: TextStyle(color: Color(0xFF626775), fontSize: 12),
      ),
    );
  }
}
