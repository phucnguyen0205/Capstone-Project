import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/conversation_model.dart';
import '../../../../core/models/presence_info_model.dart';
import '../../../../core/providers/chat_providers.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/widgets/safe_image.dart';
import '../widgets/conversation_list_item.dart';
import 'group_create_page.dart';

enum _Tab { personal, group }

/// Messages page — list of conversations with personal/group tabs.
///
/// Mirrors `ChatColumn.tsx` in web (left sidebar + chat panel for wide
/// screen; single column on mobile). On mobile we navigate to a
/// dedicated chat page when the user taps a conversation.
class MessagesPage extends ConsumerStatefulWidget {
  const MessagesPage({super.key});

  @override
  ConsumerState<MessagesPage> createState() => _MessagesPageState();
}

class _MessagesPageState extends ConsumerState<MessagesPage> {
  _Tab _activeTab = _Tab.personal;
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<ConversationModel> _filter(List<ConversationModel> all) {
    return _activeTab == _Tab.group
        ? all.where((c) => c.isGroup).toList()
        : all.where((c) => !c.isGroup).toList();
  }

  void _openChat(ConversationModel conv) {
    ref.read(activeConversationProvider.notifier).state = conv;
    context.push('/chat/${conv.id}');
  }

  Future<void> _startConversationWithSearchResult() async {
    final q = _searchCtrl.text.trim();
    if (q.isEmpty) return;
    // Provider family auto-fetches; we just wait for the AsyncValue.
    final results = await ref.read(chatUserSearchProvider(q).future);
    if (results.isEmpty) return;
    final user = results.first;
    final api = ref.read(apiServiceProvider);
    try {
      final res = await api.createConversation(user.id);
      final convId = res['id'] as String?;
      if (convId == null) return;
      // Refresh conversations and open it.
      ref.invalidate(conversationsProvider);
      _searchCtrl.clear();
      ref.read(userSearchQueryProvider.notifier).state = '';
      await Future.delayed(const Duration(milliseconds: 300));
      final list = await ref.read(conversationsProvider.future);
      final found = list.where((c) => c.id == convId).firstOrNull;
      if (found != null) _openChat(found);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không thể bắt đầu cuộc trò chuyện: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final conversationsAsync = ref.watch(conversationsProvider);
    final searchQuery = ref.watch(userSearchQueryProvider);
    final searchResults = ref.watch(chatUserSearchProvider(searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      appBar: AppBar(
        title: const Text('Tin nhắn',
            style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800)),
        backgroundColor: const Color(0xFF0C0C14),
        elevation: 0,
        actions: [
          IconButton(
            tooltip: 'Tạo nhóm',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                  builder: (_) => const GroupCreatePage()),
            ),
            icon: const Icon(LucideIcons.users2,
                color: Color(0xFFFF2E93), size: 18),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF171920),
                  border: Border.all(color: const Color(0xFF242831)),
                  borderRadius: BorderRadius.circular(12),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    const Icon(LucideIcons.search,
                        color: Color(0xFF626775), size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _searchCtrl,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 13),
                        decoration: const InputDecoration(
                          hintText:
                              'Tìm hoặc bắt đầu cuộc trò chuyện...',
                          hintStyle: TextStyle(
                              color: Color(0xFF626775), fontSize: 13),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                        onChanged: (v) => ref
                            .read(userSearchQueryProvider.notifier)
                            .state = v,
                        onSubmitted: (_) =>
                            _startConversationWithSearchResult(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Tabs
            _TabsRow(
              activeTab: _activeTab,
              conversations:
                  conversationsAsync.value ?? const <ConversationModel>[],
              onChange: (t) => setState(() => _activeTab = t),
            ),
            const SizedBox(height: 8),
            // Search results
            if (searchQuery.trim().isNotEmpty)
              Expanded(
                child: searchResults.when(
                  data: (users) {
                    if (users.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.all(16),
                        child: Text(
                          'Không tìm thấy người dùng',
                          style:
                              TextStyle(color: Color(0xFF626775), fontSize: 13),
                        ),
                      );
                    }
                    return ListView.builder(
                      itemCount: users.length,
                      itemBuilder: (_, i) {
                        final u = users[i];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundImage: (u.avatar != null &&
                                    u.avatar!.isNotEmpty &&
                                    !isPlaceholderUrl(u.avatar))
                                ? CachedNetworkImageProvider(
                                    u.avatar!,
                                    headers: const {
                                      'User-Agent':
                                          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                                      'Accept':
                                          'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
                                    },
                                  )
                                : null,
                            backgroundColor: const Color(0xFF2A2D37),
                            child: (u.avatar == null ||
                                    u.avatar!.isEmpty ||
                                    isPlaceholderUrl(u.avatar))
                                ? Text(
                                    u.name.isNotEmpty
                                        ? u.name[0].toUpperCase()
                                        : '?',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold),
                                  )
                                : null,
                          ),
                          title: Text(u.name,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13)),
                          subtitle: Text('@${u.username}',
                              style: const TextStyle(
                                  color: Color(0xFF626775), fontSize: 11)),
                          onTap: () async {
                            final api = ref.read(apiServiceProvider);
                            try {
                              final res = await api.createConversation(u.id);
                              final convId = res['id'] as String?;
                              if (convId == null) return;
                              _searchCtrl.clear();
                              ref.read(userSearchQueryProvider.notifier).state =
                                  '';
                              ref.invalidate(conversationsProvider);
                              await Future.delayed(
                                  const Duration(milliseconds: 300));
                              final list = await ref
                                  .read(conversationsProvider.future);
                              final found = list
                                  .where((c) => c.id == convId)
                                  .firstOrNull;
                              if (found != null) _openChat(found);
                            } catch (e) {
                              if (!mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Lỗi: $e')));
                            }
                          },
                        );
                      },
                    );
                  },
                  loading: () => const Center(
                      child: CircularProgressIndicator(
                          color: Color(0xFFFF2E93))),
                  error: (e, _) => Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Lỗi tìm kiếm: $e',
                        style: const TextStyle(color: Colors.red)),
                  ),
                ),
              )
            else
              Expanded(
                child: conversationsAsync.when(
                  data: (list) {
                    final filtered = _filter(list);
                    if (filtered.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _activeTab == _Tab.group
                                  ? LucideIcons.users2
                                  : LucideIcons.messageCircle,
                              color: const Color(0xFF626775),
                              size: 32,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _activeTab == _Tab.group
                                  ? 'Chưa có nhóm chat nào'
                                  : 'Chưa có cuộc trò chuyện nào',
                              style: const TextStyle(
                                  color: Color(0xFF626775), fontSize: 13),
                            ),
                            Text(
                              _activeTab == _Tab.group
                                  ? 'Mời bạn bè vào nhóm để bắt đầu'
                                  : 'Tìm người dùng để bắt đầu',
                              style: const TextStyle(
                                  color: Color(0xFF626775), fontSize: 12),
                            ),
                          ],
                        ),
                      );
                    }
                    return RefreshIndicator(
                      color: const Color(0xFFFF2E93),
                      onRefresh: () async {
                        ref.invalidate(conversationsProvider);
                      },
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        itemCount: filtered.length,
                        itemBuilder: (_, i) {
                          final conv = filtered[i];
                          // Watch the current user so we can pass their id
                          // into the list-item, which uses it to pick the
                          // "other participant" in 1-1 conversations.
                          final me = ref.watch(currentUserProvider);
                          return ConversationListItem(
                            conv: conv,
                            currentUserId: me?.id ?? '',
                            otherPresence: _presenceFor(conv, ref),
                            isActive: false,
                            onTap: () => _openChat(conv),
                          );
                        },
                      ),
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
          ],
        ),
      ),
    );
  }

  PresenceInfo? _presenceFor(ConversationModel conv, WidgetRef ref) {
    final presence =
        ref.watch(presenceMapProvider).value ?? const <String, PresenceInfo>{};
    if (conv.isGroup) return null;
    // For 1-1, pick the other participant's presence. Use the current
    // user id (not `participants.first`) so the dot only shows up on
    // the *other* side of the chat.
    final me = ref.watch(currentUserProvider);
    final other = me != null
        ? conv.otherParticipant(me.id)
        : (conv.participants.isNotEmpty ? conv.participants.first : null);
    return other == null ? null : presence[other.id];
  }
}

class _TabsRow extends StatelessWidget {
  final _Tab activeTab;
  final List<ConversationModel> conversations;
  final void Function(_Tab) onChange;
  const _TabsRow({
    required this.activeTab,
    required this.conversations,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final personal = conversations.where((c) => !c.isGroup).length;
    final group = conversations.where((c) => c.isGroup).length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF171920),
          border: Border.all(color: const Color(0xFF242831)),
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            Expanded(
              child: _TabButton(
                label: 'Cá nhân',
                icon: LucideIcons.messageCircle,
                count: personal,
                isActive: activeTab == _Tab.personal,
                gradient: const LinearGradient(
                  colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                ),
                onTap: () => onChange(_Tab.personal),
              ),
            ),
            Expanded(
              child: _TabButton(
                label: 'Nhóm',
                icon: LucideIcons.users2,
                count: group,
                isActive: activeTab == _Tab.group,
                gradient: const LinearGradient(
                  colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
                ),
                onTap: () => onChange(_Tab.group),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final int count;
  final bool isActive;
  final Gradient gradient;
  final VoidCallback onTap;
  const _TabButton({
    required this.label,
    required this.icon,
    required this.count,
    required this.isActive,
    required this.gradient,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          gradient: isActive ? gradient : null,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon,
                size: 12,
                color: isActive
                    ? Colors.white
                    : const Color(0xFFA0A5B5)),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                    color: isActive
                        ? Colors.white
                        : const Color(0xFFA0A5B5),
                    fontSize: 12,
                    fontWeight: FontWeight.w600)),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: isActive
                      ? Colors.white.withOpacity(0.25)
                      : const Color(0xFF2A2D37),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(count.toString(),
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
