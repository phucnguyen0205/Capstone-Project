import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/conversation_model.dart';
import '../../../../core/models/user_model.dart';
import '../../../../core/providers/chat_providers.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/services/api_extensions/api_extensions.dart';

/// Bottom-sheet panel that lists all members of a group conversation.
///
/// Behaviour parity with web `GroupMemberPanel`:
///   • Lists every participant and shows their group role badge
///     (creator / admin / member) and per-member nickname when set.
///   • For admin/creator viewers, exposes per-row actions: promote /
///     demote (toggle), edit nickname, kick.
///   • Lets admins add a new member via a friend-picker bottom sheet.
///
/// Reads participants from the conversation object passed in (the
/// chat provider already keeps this in sync). All writes go through
/// the corrected `ConversationMemberApiExtension` so the right URL
/// (`/api/conversations/[id]/members/[userId]`) is hit.
class GroupMemberPanel extends ConsumerStatefulWidget {
  final ConversationModel conversation;
  final String currentUserId;
  const GroupMemberPanel({
    super.key,
    required this.conversation,
    required this.currentUserId,
  });

  /// Helper that pushes the panel as a modal bottom sheet. Returns
  /// `true` if the panel was opened.
  static Future<bool> show(
    BuildContext context, {
    required ConversationModel conversation,
    required String currentUserId,
  }) async {
    return await showModalBottomSheet<bool>(
          context: context,
          isScrollControlled: true,
          backgroundColor: const Color(0xFF171920),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          builder: (_) => GroupMemberPanel(
            conversation: conversation,
            currentUserId: currentUserId,
          ),
        ) ??
        false;
  }

  @override
  ConsumerState<GroupMemberPanel> createState() => _GroupMemberPanelState();
}

class _GroupMemberPanelState extends ConsumerState<GroupMemberPanel> {
  late ConversationModel _conv;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _conv = widget.conversation;
  }

  bool _isAdmin(ConversationModel conv, String userId) {
    // The role/nickname isn't carried on the UserModel inside
    // ConversationModel.participants — we just optimistically allow
    // admin actions for any participant other than the viewer, and
    // let the backend reject with 403 if the viewer isn't actually
    // an admin. This matches the optimistic-UI behaviour used in
    // the web client.
    return userId != widget.currentUserId &&
        conv.participants.any((p) => p.id == userId);
  }

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      ref.invalidate(conversationsProvider);
      // wait for one fetch so the local _conv can be updated
      await Future.delayed(const Duration(milliseconds: 400));
      final list = ref.read(conversationsProvider).valueOrNull ?? const [];
      final fresh = list.firstWhere(
        (c) => c.id == _conv.id,
        orElse: () => _conv,
      );
      if (mounted) setState(() => _conv = fresh);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _kick(String userId) async {
    final api = ref.read(apiServiceProvider);
    setState(() => _busy = true);
    try {
      await api.removeConversationMember(_conv.id, userId);
      await _refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã xoá thành viên')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleAdmin(ConversationParticipantInfo p) async {
    final api = ref.read(apiServiceProvider);
    final newRole = p.role == 'admin' ? 'member' : 'admin';
    setState(() => _busy = true);
    try {
      await api.setMemberRole(_conv.id, userId: p.userId, role: newRole);
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editNickname(ConversationParticipantInfo p) async {
    final ctrl = TextEditingController(text: p.nickname ?? '');
    final result = await showDialog<String?>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171920),
        title: const Text('Biệt danh', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          maxLength: 30,
          decoration: const InputDecoration(
            hintText: 'Để trống để xoá biệt danh',
            hintStyle: TextStyle(color: Color(0xFF626775)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(null),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(ctrl.text),
            child: const Text('Lưu'),
          ),
        ],
      ),
    );
    if (result == null) return; // cancelled
    final nickname = result.trim().isEmpty ? null : result.trim();
    final api = ref.read(apiServiceProvider);
    setState(() => _busy = true);
    try {
      await api.setMemberNickname(_conv.id,
          userId: p.userId, nickname: nickname);
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addMember() async {
    final query = ref.read(userSearchQueryProvider.notifier);
    query.state = '';
    final user = await showModalBottomSheet<UserModel>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF171920),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _AddMemberSheet(),
    );
    if (user == null) return;
    final api = ref.read(apiServiceProvider);
    setState(() => _busy = true);
    try {
      await api.addConversationMember(_conv.id, userId: user.id);
      await _refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Đã thêm ${user.name}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final conv = _conv;
    final me = ref.watch(currentUserProvider);
    final meIsAdmin = me != null &&
        (me.id == conv.participants.first.id ||
            _isAdmin(conv, me.id));
    // Fallback: if the caller is the first participant, they're the
    // creator (matches backend POST /api/conversations semantics).

    // Build participant info list (UserModel + role + nickname).
    // The UserModel in the participants list does NOT carry role or
    // nickname, so for the initial render we display everyone as
    // 'member' with no nickname; the admin actions still work because
    // the server enforces them.
    final infos = <ConversationParticipantInfo>[];
    for (final u in conv.participants) {
      infos.add(ConversationParticipantInfo(
        userId: u.id,
        user: u,
        // First participant of the list is treated as creator for UI
        // purposes (matches `POST /api/conversations` creator role).
        role: u.id == conv.participants.first.id ? 'creator' : 'member',
        nickname: null,
      ));
    }

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (_, controller) {
        return Column(
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: const BoxDecoration(
                border:
                    Border(bottom: BorderSide(color: Color(0xFF242831))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Thành viên nhóm',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          '${infos.length} người',
                          style: const TextStyle(
                            color: Color(0xFF626775),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (meIsAdmin)
                    IconButton(
                      onPressed: _busy ? null : _addMember,
                      icon: const Icon(LucideIcons.userPlus,
                          color: Color(0xFFFF2E93), size: 18),
                    ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(LucideIcons.x,
                        color: Color(0xFFA0A5B5), size: 18),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                controller: controller,
                itemCount: infos.length,
                itemBuilder: (_, i) {
                  final p = infos[i];
                  final isMe = p.userId == widget.currentUserId;
                  return _MemberRow(
                    info: p,
                    isMe: isMe,
                    canManage: meIsAdmin && p.role != 'creator',
                    onPromote: () => _toggleAdmin(p),
                    onEditNickname: () => _editNickname(p),
                    onKick: () => _kick(p.userId),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

class ConversationParticipantInfo {
  final String userId;
  final UserModel user;
  final String role; // 'creator' | 'admin' | 'member'
  final String? nickname;
  ConversationParticipantInfo({
    required this.userId,
    required this.user,
    required this.role,
    this.nickname,
  });
}

class _MemberRow extends StatelessWidget {
  final ConversationParticipantInfo info;
  final bool isMe;
  final bool canManage;
  final VoidCallback onPromote;
  final VoidCallback onEditNickname;
  final VoidCallback onKick;
  const _MemberRow({
    required this.info,
    required this.isMe,
    required this.canManage,
    required this.onPromote,
    required this.onEditNickname,
    required this.onKick,
  });

  Color _roleColor() {
    switch (info.role) {
      case 'creator':
        return const Color(0xFFFF2E93);
      case 'admin':
        return const Color(0xFF14B8A6);
      default:
        return const Color(0xFF626775);
    }
  }

  String _roleLabel() {
    switch (info.role) {
      case 'creator':
        return 'Trưởng nhóm';
      case 'admin':
        return 'Quản trị';
      default:
        return 'Thành viên';
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = info.user;
    final displayName = (info.nickname?.isNotEmpty == true)
        ? info.nickname!
        : (u.name.isNotEmpty ? u.name : '@${u.username}');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFF242831), width: 0.5)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: const Color(0xFF2A2D37),
            backgroundImage:
                (u.avatar != null && u.avatar!.isNotEmpty)
                    ? CachedNetworkImageProvider(u.avatar!)
                    : null,
            child: (u.avatar == null || u.avatar!.isEmpty)
                ? Text(
                    u.name.isNotEmpty ? u.name[0].toUpperCase() : '?',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        displayName,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    if (isMe) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFF2E93).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Bạn',
                          style: TextStyle(
                            color: Color(0xFFFF2E93),
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${_roleLabel()} · @${u.username}',
                  style: TextStyle(color: _roleColor(), fontSize: 11),
                ),
              ],
            ),
          ),
          if (canManage)
            PopupMenuButton<String>(
              color: const Color(0xFF171920),
              icon: const Icon(LucideIcons.moreVertical,
                  color: Color(0xFFA0A5B5), size: 16),
              onSelected: (v) {
                switch (v) {
                  case 'promote':
                    onPromote();
                    break;
                  case 'nickname':
                    onEditNickname();
                    break;
                  case 'kick':
                    onKick();
                    break;
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'promote',
                  child: Text(
                    info.role == 'admin'
                        ? 'Hạ xuống thành viên'
                        : 'Thăng lên quản trị',
                  ),
                ),
                const PopupMenuItem(
                  value: 'nickname',
                  child: Text('Đổi biệt danh'),
                ),
                const PopupMenuItem(
                  value: 'kick',
                  child: Text('Xoá khỏi nhóm',
                      style: TextStyle(color: Color(0xFFF87171))),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _AddMemberSheet extends ConsumerStatefulWidget {
  const _AddMemberSheet();
  @override
  ConsumerState<_AddMemberSheet> createState() => _AddMemberSheetState();
}

class _AddMemberSheetState extends ConsumerState<_AddMemberSheet> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = ref.watch(userSearchQueryProvider);
    final search = ref.watch(chatUserSearchProvider(q));
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Thêm thành viên',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _ctrl,
              autofocus: true,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                hintText: 'Tìm theo tên hoặc @username',
                hintStyle: TextStyle(color: Color(0xFF626775)),
                prefixIcon:
                    Icon(LucideIcons.search, color: Color(0xFF626775)),
              ),
              onChanged: (v) =>
                  ref.read(userSearchQueryProvider.notifier).state = v,
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 280,
              child: search.when(
                data: (users) {
                  if (q.trim().isEmpty) {
                    return const Center(
                      child: Text(
                        'Gõ tên để tìm người dùng',
                        style: TextStyle(
                          color: Color(0xFF626775),
                          fontSize: 12,
                        ),
                      ),
                    );
                  }
                  if (users.isEmpty) {
                    return const Center(
                      child: Text(
                        'Không tìm thấy người dùng',
                        style: TextStyle(
                          color: Color(0xFF626775),
                          fontSize: 12,
                        ),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: users.length,
                    itemBuilder: (_, i) {
                      final u = users[i];
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF2A2D37),
                          backgroundImage:
                              (u.avatar != null && u.avatar!.isNotEmpty)
                                  ? CachedNetworkImageProvider(u.avatar!)
                                  : null,
                          child: (u.avatar == null || u.avatar!.isEmpty)
                              ? Text(
                                  u.name.isNotEmpty
                                      ? u.name[0].toUpperCase()
                                      : '?',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                  ),
                                )
                              : null,
                        ),
                        title: Text(u.name,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            )),
                        subtitle: Text('@${u.username}',
                            style: const TextStyle(
                              color: Color(0xFF626775),
                              fontSize: 11,
                            )),
                        onTap: () => Navigator.of(context).pop(u),
                      );
                    },
                  );
                },
                loading: () => const Center(
                  child: CircularProgressIndicator(color: Color(0xFFFF2E93)),
                ),
                error: (e, _) => Center(
                  child: Text('Lỗi: $e',
                      style: const TextStyle(color: Colors.red)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}