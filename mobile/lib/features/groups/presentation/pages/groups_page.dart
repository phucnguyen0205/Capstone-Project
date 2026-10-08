import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/providers/core_providers.dart';
import '../../../../core/providers/groups_providers.dart';
import '../widgets/groups_feed.dart';
import '../widgets/groups_left_sidebar.dart';
import '../widgets/groups_right_sidebar.dart';
import '../widgets/groups_top_bar.dart';
import '../widgets/lens_filter_chips.dart';
import 'radar_page.dart';
import 'vault_page.dart';
import 'quiz_page.dart';
import 'diary_page.dart';

/// Groups page — replicates the 3-column web layout but stacks
/// left sidebar → lens chips → feed → right sidebar on mobile.
class GroupsPage extends ConsumerStatefulWidget {
  const GroupsPage({super.key});

  @override
  ConsumerState<GroupsPage> createState() => _GroupsPageState();
}

class _GroupsPageState extends ConsumerState<GroupsPage> {
  String _searchQuery = '';
  int _refreshSignal = 0;

  @override
  void initState() {
    super.initState();
    // ref isn't usable inside initState — defer to first frame so the
    // provider scope is fully wired up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _invalidate();
    });
  }

  void _invalidate() {
    _refreshSignal++;
    ref.invalidate(groupTiersProvider);
    ref.invalidate(groupActivityProvider);
    ref.invalidate(groupMembersProvider);
  }

  GroupsFeedKey get _feedKey => GroupsFeedKey(
        ref.watch(groupLensFilterProvider),
        _refreshSignal,
      );

  @override
  Widget build(BuildContext context) {
    final tiersAsync = ref.watch(groupTiersProvider);
    final lens = ref.watch(groupLensFilterProvider);
    final feedAsync = ref.watch(groupsFeedProvider(_feedKey));
    final membersAsync =
        ref.watch(groupMembersProvider('recent'));
    final activityAsync = ref.watch(groupActivityProvider);
    final invisibleMirror =
        ref.watch(invisibleMirrorEnabledProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      appBar: AppBar(
        title: const Text('Nhóm',
            style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800)),
        backgroundColor: const Color(0xFF0C0C14),
        elevation: 0,
        actions: [
          IconButton(
            tooltip: 'Radar',
            icon: const Icon(LucideIcons.radar,
                color: Color(0xFF8B5CF6), size: 18),
            onPressed: () => context.push('/groups/radar'),
          ),
          IconButton(
            tooltip: 'Trắc nghiệm',
            icon: const Icon(LucideIcons.sparkles,
                color: Color(0xFF06B6D4), size: 18),
            onPressed: () => context.push('/groups/quiz'),
          ),
          IconButton(
            tooltip: 'Vault',
            icon: const Icon(LucideIcons.lock,
                color: Color(0xFFFBBF24), size: 18),
            onPressed: () => context.push('/groups/vault'),
          ),
          IconButton(
            tooltip: 'Ghi chép',
            icon: const Icon(LucideIcons.bookOpen,
                color: Color(0xFFF472B6), size: 18),
            onPressed: () => context.push('/groups/diary'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            GroupsTopBar(
              searchQuery: _searchQuery,
              onSearchChanged: (v) =>
                  setState(() => _searchQuery = v),
              onCreateGroup: () => _createGroup(context),
            ),
            LensFilterChips(
              active: lens,
              counts: tiersAsync.value == null
                  ? null
                  : {
                      for (final t in tiersAsync.value!.tiers) t.key: t.count,
                    },
              onChange: (l) => ref
                  .read(groupLensFilterProvider.notifier)
                  .state = l,
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  // Mobile (default): single scrollable column with all sections
                  return SingleChildScrollView(
                    child: Column(
                      children: [
                        SizedBox(
                          height: 360,
                          child: GroupsLeftSidebar(
                            tiers: tiersAsync.value?.tiers ?? const [],
                            members: membersAsync.value ?? const [],
                            onRadar: () =>
                                context.push('/groups/radar'),
                            onQuiz: () =>
                                context.push('/groups/quiz'),
                            onDiary: () =>
                                context.push('/groups/diary'),
                          ),
                        ),
                        SizedBox(
                          height: constraints.maxHeight < 600
                              ? 480
                              : 640,
                          child: GroupsFeed(
                            posts: feedAsync.value ?? const [],
                            loading: feedAsync.isLoading,
                            onRefresh: () => _invalidate(),
                            onLoadMore: () {
                              // TODO: pagination; ignore for now
                            },
                          ),
                        ),
                        SizedBox(
                          height: 540,
                          child: GroupsRightSidebar(
                            recentGallery:
                                tiersAsync.value?.recent ?? const [],
                            activity: activityAsync.value ?? const [],
                            newMembers: membersAsync.value ?? const [],
                            invisibleMirror: invisibleMirror,
                            onInvisibleMirror: (v) => ref
                                .read(invisibleMirrorEnabledProvider
                                    .notifier)
                                .state = v,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _createGroup(BuildContext context) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171920),
        title: const Text('Tạo nhóm mới',
            style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'Tên nhóm...',
            hintStyle: TextStyle(color: Color(0xFF626775)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Hủy'),
          ),
          TextButton(
            onPressed: () =>
                Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Tạo'),
          ),
        ],
      ),
    );
    if (result == null || result.isEmpty) return;
    try {
      await ref
          .read(apiServiceProvider)
          .createGroupConversation(name: result, participantIds: const []);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đã tạo nhóm "$result"')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi: $e')));
    }
  }
}
