import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/providers/chat_providers.dart';
import '../../../../core/providers/core_providers.dart';

/// Group chat creation — searches users, lets the caller select 2+ of
/// them, then POSTs to `/api/conversations` with
/// `{ name, participantIds: [...] }`.
///
/// Mirrors the web "Tạo nhóm" flow which is wired into the chat box.
class GroupCreatePage extends ConsumerStatefulWidget {
  const GroupCreatePage({super.key});

  @override
  ConsumerState<GroupCreatePage> createState() => _GroupCreatePageState();
}

class _GroupCreatePageState extends ConsumerState<GroupCreatePage> {
  final _nameCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  final Set<String> _selected = {};
  bool _creating = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final api = ref.read(apiServiceProvider);
    final me = ref.read(currentUserProvider);
    if (me == null) return;
    final ids = _selected.toList();
    if (ids.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Cần ít nhất 2 người để tạo nhóm')),
      );
      return;
    }
    setState(() => _creating = true);
    try {
      final res = await api.createGroupConversation(
        name: _nameCtrl.text.trim(),
        participantIds: ids,
      );
      final convId = res['id'] as String?;
      if (convId == null) throw Exception('Tạo nhóm thất bại');
      // Refresh the conversations stream so the new group appears, then
      // navigate into the chat.
      ref.invalidate(conversationsProvider);
      await Future.delayed(const Duration(milliseconds: 300));
      if (!mounted) return;
      // Pop back to messages list and push the chat page.
      if (Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      }
      context.push('/chat/$convId');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = ref.watch(userSearchQueryProvider);
    final search = ref.watch(chatUserSearchProvider(q));
    final me = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0C0C14),
        elevation: 0,
        title: const Text(
          'Tạo nhóm mới',
          style: TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(LucideIcons.arrowLeft,
              color: Color(0xFFA0A5B5)),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextField(
                controller: _nameCtrl,
                style: const TextStyle(color: Colors.white),
                maxLength: 60,
                decoration: const InputDecoration(
                  hintText: 'Tên nhóm (tùy chọn)',
                  hintStyle: TextStyle(color: Color(0xFF626775)),
                  enabledBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF242831)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFFFF2E93)),
                  ),
                  counterStyle: TextStyle(color: Color(0xFF626775)),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextField(
                controller: _searchCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: const InputDecoration(
                  hintText: 'Tìm người để thêm vào nhóm...',
                  hintStyle: TextStyle(color: Color(0xFF626775), fontSize: 13),
                  prefixIcon: Icon(LucideIcons.search,
                      color: Color(0xFF626775), size: 16),
                  enabledBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF242831)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFFFF2E93)),
                  ),
                ),
                onChanged: (v) =>
                    ref.read(userSearchQueryProvider.notifier).state = v,
              ),
            ),
            if (_selected.isNotEmpty)
              Container(
                height: 56,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final id in _selected) _selectedChip(id),
                  ],
                ),
              ),
            Expanded(
              child: search.when(
                data: (users) {
                  if (q.trim().isEmpty) {
                    return const Center(
                      child: Text(
                        'Tìm người dùng để thêm vào nhóm',
                        style: TextStyle(
                          color: Color(0xFF626775),
                          fontSize: 12,
                        ),
                      ),
                    );
                  }
                  final filtered = users
                      .where((u) => me == null || u.id != me.id)
                      .toList();
                  if (filtered.isEmpty) {
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
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final u = filtered[i];
                      final selected = _selected.contains(u.id);
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
                        trailing: Icon(
                          selected
                              ? LucideIcons.checkCircle2
                              : LucideIcons.circle,
                          color: selected
                              ? const Color(0xFFFF2E93)
                              : const Color(0xFF626775),
                          size: 20,
                        ),
                        onTap: () => setState(() {
                          if (selected) {
                            _selected.remove(u.id);
                          } else {
                            _selected.add(u.id);
                          }
                        }),
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
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Container(
                  width: double.infinity,
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                    ),
                  ),
                  child: TextButton(
                    onPressed: _creating || _selected.length < 2
                        ? null
                        : _create,
                    child: Text(
                      _creating
                          ? 'Đang tạo...'
                          : 'Tạo nhóm (${_selected.length})',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _selectedChip(String userId) {
    // We don't have the user object directly here; render a simple chip
    // with the id short-hash. The list below shows full names.
    final initial = userId.isNotEmpty ? userId[0].toUpperCase() : '?';
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Chip(
        backgroundColor: const Color(0xFF242831),
        label: Text(userId.substring(0, userId.length.clamp(0, 8)),
            style: const TextStyle(color: Colors.white, fontSize: 11)),
        avatar: CircleAvatar(
          backgroundColor: const Color(0xFFFF2E93),
          child: Text(initial,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 10,
              )),
        ),
        onDeleted: () => setState(() => _selected.remove(userId)),
        deleteIconColor: const Color(0xFFA0A5B5),
      ),
    );
  }
}