import 'dart:async';
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/conversation_model.dart';
import '../../../../core/models/presence_info_model.dart';
import '../../../../core/providers/chat_providers.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../calls/presentation/providers/call_providers.dart';
import '../widgets/chat_input_bar.dart';
import '../widgets/chat_settings_modal.dart';
import '../widgets/chat_theme_picker.dart';
import '../widgets/emoji_picker.dart';
import '../widgets/group_member_panel.dart';
import '../widgets/media_attachment_sheet.dart';
import '../widgets/message_bubble.dart';
import '../widgets/presence_dot.dart';

/// Chat page — opens a conversation with message list + input bar +
/// header (with video/voice call buttons).
class ChatPage extends ConsumerStatefulWidget {
  final String conversationId;
  const ChatPage({super.key, required this.conversationId});

  @override
  ConsumerState<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends ConsumerState<ChatPage> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  bool _isSending = false;
  bool _isUploading = false;
  bool _showEmoji = false;
  String _currentUserId = '';

  @override
  void initState() {
    super.initState();
    _messageController.addListener(() => setState(() {}));
    // Read the cached current user synchronously so we don't have to wait
    // for `getMe()` round-trip before knowing which side of the chat is
    // "me". Without this, every bubble compares `senderId == ''` and ends
    // up on the wrong side (left/right alignment breaks).
    final cached = ref.read(currentUserProvider);
    if (cached != null && cached.id.isNotEmpty) {
      _currentUserId = cached.id;
    }
    _scrollController.addListener(() {
      // No-op listener kept so we can attach scroll-based behaviour later
      // (e.g. infinite scroll) without touching initState again.
    });
    // Defer any ref.* usage to the first frame — `ref` isn't fully
    // wired up until after initState completes.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _setActiveConversation();
        _loadCurrentUser();
      }
    });
  }

  Future<void> _loadCurrentUser() async {
    final api = ref.read(apiServiceProvider);
    try {
      final me = await api.getMe();
      if (!mounted) return;
      setState(() {
        _currentUserId = (me['id'] ?? '') as String;
      });
    } catch (_) {
      // ignore
    }
  }

  Future<void> _setActiveConversation() async {
    final list = await ref.read(conversationsProvider.future);
    final found = list.where((c) => c.id == widget.conversationId).firstOrNull;
    if (found != null) {
      ref.read(activeConversationProvider.notifier).state = found;
    }
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _messageController.text.trim();
    final pending = ref.read(pendingMediaProvider);
    if (text.isEmpty && pending == null) return;
    if (_isSending || _isUploading) return;

    setState(() => _isSending = true);
    final api = ref.read(apiServiceProvider);

    try {
      String? mediaUrl;
      String? mediaType;
      String? fileName;
      int? fileSize;

      if (pending != null) {
        setState(() => _isUploading = true);
        mediaUrl = await api.uploadFileToCloudinary(
          File(pending.localPath),
          kind: pending.kind,
        );
        mediaType = pending.kind;
        fileName = pending.fileName;
        fileSize = pending.fileSize;
        setState(() => _isUploading = false);
      }

      final reply = ref.read(replyToProvider);
      String finalContent = text.isNotEmpty
          ? (reply != null
              ? '↪ ${reply.content.length > 80 ? reply.content.substring(0, 80) : reply.content}\n$text'
              : text)
          : '[Tệp] ${fileName ?? "đính kèm"}';

      await api.sendMessageWithMedia(
        widget.conversationId,
        content: finalContent,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        fileName: fileName,
        fileSize: fileSize,
      );

      _messageController.clear();
      ref.read(replyToProvider.notifier).state = null;
      ref.read(pendingMediaProvider.notifier).state = null;
      ref.invalidate(messagesProvider(widget.conversationId));
      ref.invalidate(conversationsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không thể gửi: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  Future<void> _pickMedia(MediaKind kind) async {
    try {
      if (kind == MediaKind.image) {
        final picker = ImagePicker();
        final picked = await picker.pickImage(source: ImageSource.gallery);
        if (picked == null) return;
        final file = File(picked.path);
        final size = await file.length();
        ref.read(pendingMediaProvider.notifier).state = PendingMedia(
          localPath: picked.path,
          kind: 'image',
          fileName: picked.name,
          fileSize: size,
        );
      } else if (kind == MediaKind.video) {
        final picker = ImagePicker();
        final picked = await picker.pickVideo(source: ImageSource.gallery);
        if (picked == null) return;
        final file = File(picked.path);
        final size = await file.length();
        ref.read(pendingMediaProvider.notifier).state = PendingMedia(
          localPath: picked.path,
          kind: 'video',
          fileName: picked.name,
          fileSize: size,
        );
      } else {
        final result = await FilePicker.platform.pickFiles();
        if (result == null || result.files.isEmpty) return;
        final f = result.files.first;
        if (f.path == null) return;
        ref.read(pendingMediaProvider.notifier).state = PendingMedia(
          localPath: f.path!,
          kind: 'file',
          fileName: f.name,
          fileSize: f.size,
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không thể chọn tệp: $e')),
      );
    }
  }

  Future<void> _initiateCall({required bool video}) async {
    final conv = ref.read(activeConversationProvider);
    if (conv == null) return;
    final other = conv.isGroup
        ? null
        : conv.participants.firstWhereOrNull((p) => p.id != _currentUserId);
    if (other == null && !conv.isGroup) return;
    final ok = await ref.read(callProvider.notifier).initiate(
          conversationId: conv.id,
          calleeId: other?.id ?? conv.id,
          calleeName: other?.name ?? (conv.name ?? 'Nhóm'),
          calleeAvatar: other?.avatar,
          conversationName: conv.isGroup
              ? (conv.name ?? 'Nhóm')
              : (other?.name ?? 'Cuộc gọi'),
          isGroup: conv.isGroup,
        );
    if (!ok && mounted) {
      final err = ref.read(callProvider).error ?? 'Không thể bắt đầu cuộc gọi';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err)),
      );
    }
  }

  Future<void> _onSettings(ConversationModel conv, ChatTheme theme) async {
    await ChatSettingsModal.show(
      context,
      content: ChatSettingsModal(
        conversation: conv,
        theme: theme,
        muted: ref.read(chatSettingsProvider(conv.id)).muted,
        pinned: ref.read(chatSettingsProvider(conv.id)).pinned,
        onRename: (v) async {
          try {
            await ref
                .read(apiServiceProvider)
                .renameConversation(conv.id, v);
            ref.invalidate(conversationsProvider);
          } catch (_) {}
        },
        onPickTheme: (id) =>
            ref.read(chatSettingsProvider(conv.id).notifier).updateTheme(id),
        onMute: (v) =>
            ref.read(chatSettingsProvider(conv.id).notifier).updateMuted(v),
        onPin: (v) =>
            ref.read(chatSettingsProvider(conv.id).notifier).updatePinned(v),
        onBlock: () async {},
        onReport: () async {},
        onDelete: conv.isGroup ? () => _leaveGroup(conv) : () async {},
      ),
    );
  }

  /// Open the group-member management panel for a group conversation.
  Future<void> _openGroupMembers(ConversationModel conv) async {
    await GroupMemberPanel.show(
      context,
      conversation: conv,
      currentUserId: _currentUserId,
    );
    // Panel invalidates conversationsProvider when it makes writes, so
    // we don't need to do anything else here.
  }

  /// Leave the current group conversation. The backend deletes the
  /// caller's participant row (DELETE /api/conversations/[id]) so the
  /// rest of the group can keep chatting without them. After leaving
  /// we pop back to the messages list.
  Future<void> _leaveGroup(ConversationModel conv) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171920),
        title: const Text('Rời nhóm',
            style: TextStyle(color: Colors.white)),
        content: Text(
          'Bạn có chắc muốn rời "${conv.name ?? "nhóm này"}"? Bạn sẽ không nhận được tin nhắn mới nữa.',
          style: const TextStyle(color: Color(0xFFA0A5B5)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Rời nhóm',
                style: TextStyle(color: Color(0xFFF87171))),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await ref.read(apiServiceProvider).deleteConversation(conv.id);
      ref.invalidate(conversationsProvider);
      if (!mounted) return;
      // Close the settings modal and pop back to /messages.
      Navigator.of(context).pop();
      if (Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    }
  }

  /// Delete a single message. Only the sender can delete their own
  /// messages (enforced by the backend). On web, this is triggered
  /// from a context menu in the message bubble — on mobile we expose
  /// it via long-press.
  Future<void> _deleteMessage(MessageModel m) async {
    if (m.senderId != _currentUserId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bạn chỉ có thể xoá tin nhắn của mình')),
      );
      return;
    }
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171920),
        title: const Text('Xoá tin nhắn',
            style: TextStyle(color: Colors.white)),
        content: const Text(
          'Bạn có chắc muốn xoá tin nhắn này?',
          style: TextStyle(color: Color(0xFFA0A5B5)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Xoá',
                style: TextStyle(color: Color(0xFFF87171))),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await ref.read(apiServiceProvider).deleteMessage(m.id);
      ref.invalidate(messagesProvider(widget.conversationId));
      ref.invalidate(conversationsProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    }
  }

  /// Bottom-sheet menu shown when a message bubble is long-pressed.
  /// Mirrors the web `ChatModal` long-press → action sheet.
  Future<void> _showMessageActions(MessageModel m) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF171920),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading:
                  const Icon(LucideIcons.cornerDownLeft, color: Colors.white),
              title: const Text('Trả lời',
                  style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.of(context).pop('reply'),
            ),
            if (m.senderId == _currentUserId)
              ListTile(
                leading: const Icon(LucideIcons.trash2,
                    color: Color(0xFFF87171)),
                title: const Text('Xoá tin nhắn',
                    style: TextStyle(color: Color(0xFFF87171))),
                onTap: () => Navigator.of(context).pop('delete'),
              ),
            ListTile(
              leading: const Icon(LucideIcons.x, color: Color(0xFFA0A5B5)),
              title: const Text('Huỷ',
                  style: TextStyle(color: Color(0xFFA0A5B5))),
              onTap: () => Navigator.of(context).pop(null),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (action) {
      case 'reply':
        ref.read(replyToProvider.notifier).state = m;
        break;
      case 'delete':
        await _deleteMessage(m);
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final convAsync = ref.watch(conversationsProvider);
    final ConversationModel? conv = convAsync.value
        ?.where((c) => c.id == widget.conversationId)
        .firstOrNull;
    final messagesAsync = ref.watch(messagesProvider(widget.conversationId));
    final settings = ref.watch(chatSettingsProvider(widget.conversationId));
    final theme = themeFromId(settings.themeId);
    final presence = ref.watch(presenceMapProvider).value ??
        const <String, PresenceInfo>{};

    return Scaffold(
      backgroundColor: theme.bg,
      appBar: conv == null
          ? AppBar(
              title: const Text('Đang tải...',
                  style: TextStyle(color: Colors.white)),
              backgroundColor: const Color(0xFF0C0C14),
              iconTheme: const IconThemeData(color: Colors.white),
            )
          : AppBar(
              backgroundColor: theme.surface,
              elevation: 0,
              iconTheme: IconThemeData(color: theme.textPrimary),
              title: GestureDetector(
                onTap: () => _onSettings(conv, theme),
                child: Row(
                  children: [
                    _buildHeaderAvatar(conv, presence),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            _headerName(conv),
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: theme.textPrimary,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            _headerSubtitle(conv, presence),
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: theme.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                IconButton(
                  icon: Icon(LucideIcons.video,
                      color: theme.textSecondary, size: 18),
                  onPressed: () => _initiateCall(video: true),
                ),
                IconButton(
                  icon: Icon(LucideIcons.phone,
                      color: theme.textSecondary, size: 16),
                  onPressed: () => _initiateCall(video: false),
                ),
                if (conv.isGroup)
                  IconButton(
                    icon: Icon(LucideIcons.users2,
                        color: theme.textSecondary, size: 18),
                    onPressed: () => _openGroupMembers(conv),
                  ),
              ],
            ),
      body: conv == null
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFFFF2E93)))
          : Column(
              children: [
                Expanded(
                  child: messagesAsync.when(
                    data: (msgs) {
                      if (msgs.isEmpty) {
                        return Center(
                          child: Text(
                            'Chưa có tin nhắn nào. Gửi lời chào!',
                            style: TextStyle(
                                color: theme.textSecondary, fontSize: 12),
                          ),
                        );
                      }
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (_scrollController.hasClients) {
                          _scrollController.jumpTo(
                            _scrollController.position.maxScrollExtent,
                          );
                        }
                      });
                      return ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(12),
                        itemCount: msgs.length,
                        itemBuilder: (_, i) {
                          final m = msgs[i];
                          final sender = m.sender ??
                              conv.participants
                                  .firstWhereOrNull((p) => p.id == m.senderId);
                          return MessageBubble(
                            message: m,
                            currentUserId: _currentUserId,
                            isGroup: conv.isGroup,
                            theme: theme,
                            sender: sender,
                            onReply: () => ref
                                .read(replyToProvider.notifier)
                                .state = m,
                            onLongPress: m.senderId == _currentUserId
                                ? () => _showMessageActions(m)
                                : null,
                          );
                        },
                      );
                    },
                    loading: () => const Center(
                        child: CircularProgressIndicator(
                            color: Color(0xFFFF2E93))),
                    error: (e, _) => Center(
                      child: Text('Lỗi: $e',
                          style: const TextStyle(color: Colors.red)),
                    ),
                  ),
                ),
                ChatInputBar(
                  theme: theme,
                  isGroup: conv.isGroup,
                  controller: _messageController,
                  sending: _isSending,
                  uploading: _isUploading,
                  hasAttachment: ref.read(pendingMediaProvider) != null,
                  onSend: _send,
                  onEmoji: () async {
                    setState(() => _showEmoji = !_showEmoji);
                    if (_showEmoji) {
                      await EmojiPickerSheet.show(context, onEmoji: (e) {
                        _messageController.text =
                            _messageController.text + e;
                      });
                      setState(() => _showEmoji = false);
                    }
                  },
                  onAttach: () async {
                    final kind = await MediaAttachmentSheet.show(context);
                    if (kind != null) _pickMedia(kind);
                  },
                  onCancelReply: () =>
                      ref.read(replyToProvider.notifier).state = null,
                  onCancelAttachment: () =>
                      ref.read(pendingMediaProvider.notifier).state = null,
                ),
              ],
            ),
    );
  }

  Widget _buildHeaderAvatar(
      ConversationModel conv, Map<String, PresenceInfo> presence) {
    if (conv.isGroup) {
      // Group conversations expose `avatarUrl` which the backend
      // mirrors from the linked `groups.avatarUrl`. Show the group's
      // avatar when present; otherwise fall back to the gradient
      // users-icon placeholder (matching web).
      final url = conv.avatarUrl;
      return SizedBox(
        width: 36,
        height: 36,
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
            ),
            image: (url != null && url.isNotEmpty)
                ? DecorationImage(
                    image: CachedNetworkImageProvider(url),
                    fit: BoxFit.cover,
                  )
                : null,
          ),
          child: (url == null || url.isEmpty)
              ? const Icon(LucideIcons.users2,
                  color: Colors.white, size: 18)
              : null,
        ),
      );
    }
    final other = conv.participants.first;
    return SizedBox(
      width: 36,
      height: 36,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
              ),
            ),
            child: Center(
              child: Text(
                other.name.isNotEmpty
                    ? other.name[0].toUpperCase()
                    : (other.username.isNotEmpty
                        ? other.username[0].toUpperCase()
                        : '?'),
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.bold),
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            right: 0,
            child: PresenceDot(presence: presence[other.id], size: 12),
          ),
        ],
      ),
    );
  }

  String _headerName(ConversationModel conv) {
    if (conv.isGroup) return conv.name ?? 'Nhóm';
    final other = conv.participants.first;
    return other.name.isNotEmpty ? other.name : other.username;
  }

  String _headerSubtitle(
      ConversationModel conv, Map<String, PresenceInfo> presence) {
    if (conv.isGroup) return '${conv.participants.length} thành viên';
    final other = conv.participants.first;
    return presence[other.id]?.label ?? 'Đang tải...';
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

extension _IterFirstWhereOrNull<T> on Iterable<T> {
  T? firstWhereOrNull(bool Function(T) test) {
    for (final e in this) {
      if (test(e)) return e;
    }
    return null;
  }
}
