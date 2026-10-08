import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/models/models.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_avatar.dart';
import '../../../../core/widgets/safe_image.dart';
import '../../../posts/presentation/widgets/post_card.dart';

class OtherUserProfilePage extends ConsumerWidget {
  final String userId;
  const OtherUserProfilePage({super.key, required this.userId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userByIdProvider(userId));
    final posts = ref.watch(userPostsProvider(userId));
    final me = ref.watch(currentUserProvider);
    final isMe = me?.id == userId;

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: user.when(
        loading: () =>
            const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (e, _) => _ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(userByIdProvider(userId)),
        ),
        data: (u) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(userByIdProvider(userId));
            ref.invalidate(userPostsProvider(userId));
            await ref.read(userByIdProvider(userId).future);
          },
          child: CustomScrollView(
            slivers: [
              _ProfileHeader(user: u, isMe: isMe),
              if (isMe) const SliverToBoxAdapter(child: SizedBox.shrink())
              else
                SliverToBoxAdapter(
                  child: _ActionBar(user: u),
                ),
              SliverToBoxAdapter(
                child: _StatsRow(user: u),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              if (u.bio != null && u.bio!.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(u.bio!, style: AppTextStyles.bodyMedium),
                  ),
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              SliverToBoxAdapter(
                child: DefaultTabController(
                  length: 2,
                  child: Column(
                    children: [
                      TabBar(
                        indicatorColor: AppColors.primaryPink,
                        labelColor: AppColors.primaryPink,
                        unselectedLabelColor: AppColors.textSecondary,
                        tabs: const [
                          Tab(text: 'Bài viết'),
                          Tab(text: 'Bạn bè'),
                        ],
                      ),
                      SizedBox(
                        height: MediaQuery.of(context).size.height - 200,
                        child: TabBarView(
                          children: [
                            _PostsTab(posts: posts),
                            _FriendsTab(userId: u.id),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  final UserModel user;
  final bool isMe;
  const _ProfileHeader({required this.user, required this.isMe});

  @override
  Widget build(BuildContext context) {
    return SliverAppBar(
      pinned: true,
      backgroundColor: AppColors.backgroundDark,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios_new_rounded),
        onPressed: () => context.pop(),
      ),
      actions: [
        if (isMe)
          IconButton(
            icon: const Icon(Icons.edit_rounded),
            tooltip: 'Chỉnh sửa',
            onPressed: () => context.pushNamed('editProfile'),
          ),
      ],
      expandedHeight: 280,
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            if (user.coverPhoto != null && user.coverPhoto!.isNotEmpty)
              CachedNetworkImage(
                imageUrl: user.coverPhoto!,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => Container(color: AppColors.backgroundCard),
              )
            else
              Container(
                decoration: const BoxDecoration(gradient: AppColors.primaryGradient),
              ),
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                height: 120,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      AppColors.backgroundDark.withValues(alpha: 0),
                      AppColors.backgroundDark,
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppColors.backgroundDark,
                        width: 4,
                      ),
                    ),
                    child: CircleAvatar(
                      radius: 44,
                      backgroundColor: AppColors.backgroundCard,
                      backgroundImage: safeNetworkImage(user.avatar),
                      child: (user.avatar == null || user.avatar!.isEmpty || isPlaceholderUrl(user.avatar))
                          ? const Icon(Icons.person_rounded,
                              size: 40, color: AppColors.textSecondary)
                          : null,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(user.name,
                            style: AppTextStyles.headingLarge,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        Text('@${user.username}',
                            style: AppTextStyles.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  final UserModel user;
  const _StatsRow({required this.user});

  @override
  Widget build(BuildContext context) {
    Widget stat(String label, int? value) => Expanded(
          child: Column(
            children: [
              Text(value?.toString() ?? '0',
                  style: AppTextStyles.headingMedium),
              const SizedBox(height: 4),
              Text(label, style: AppTextStyles.bodySmall),
            ],
          ),
        );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          stat('Bài viết', user.postsCount),
          stat('Bạn bè', user.friendsCount),
          stat('Người theo dõi', user.followersCount),
          stat('Đang theo dõi', user.followingCount),
        ],
      ),
    );
  }
}

class _ActionBar extends ConsumerStatefulWidget {
  final UserModel user;
  const _ActionBar({required this.user});
  @override
  ConsumerState<_ActionBar> createState() => _ActionBarState();
}

class _ActionBarState extends ConsumerState<_ActionBar> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) {
    final u = widget.user;
    final isFollowing = u.isFollowing ?? false;
    final isFriend = u.isFriend ?? false;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor:
                    isFollowing ? AppColors.backgroundCard : AppColors.primaryPink,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              icon: Icon(
                isFollowing
                    ? Icons.check_rounded
                    : (isFriend
                        ? Icons.people_alt_rounded
                        : Icons.person_add_rounded),
                size: 18,
              ),
              label: Text(
                isFollowing
                    ? 'Đang theo dõi'
                    : (isFriend ? 'Bạn bè' : 'Theo dõi'),
              ),
              onPressed: _busy
                  ? null
                  : () async {
                      setState(() => _busy = true);
                      try {
                        final api = ref.read(apiServiceProvider);
                        if (isFollowing) {
                          await api.unfollowUser(u.id);
                        } else {
                          await api.followUser(u.id);
                        }
                        ref.invalidate(userByIdProvider(u.id));
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Lỗi: $e')),
                          );
                        }
                      } finally {
                        if (mounted) setState(() => _busy = false);
                      }
                    },
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              side: const BorderSide(color: AppColors.borderLight),
            ),
            icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
            label: const Text('Nhắn tin'),
            onPressed: _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    try {
                      final api = ref.read(apiServiceProvider);
                      final conv = await api.createConversation(u.id);
                      if (!context.mounted) return;
                      final id = (conv['id'] as String?) ??
                          (conv['conversation']?['id'] as String?);
                      if (id == null) {
                        throw Exception('Missing conversation id');
                      }
                      context.pushNamed('chat', pathParameters: {'id': id});
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Lỗi: $e')),
                        );
                      }
                    } finally {
                      if (mounted) setState(() => _busy = false);
                    }
                  },
          ),
        ],
      ),
    );
  }
}

class _PostsTab extends StatelessWidget {
  final AsyncValue<List<PostModel>> posts;
  const _PostsTab({required this.posts});

  @override
  Widget build(BuildContext context) {
    return posts.when(
      loading: () => const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
      error: (e, _) => Center(
        child: Text('Lỗi: $e', style: AppTextStyles.bodyMedium),
      ),
      data: (items) {
        if (items.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text('Chưa có bài viết nào',
                  style: AppTextStyles.bodyMedium),
            ),
          );
        }
        return ListView.builder(
          itemCount: items.length,
          itemBuilder: (_, i) => PostCard(post: items[i]),
        );
      },
    );
  }
}

class _FriendsTab extends ConsumerWidget {
  final String userId;
  const _FriendsTab({required this.userId});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final friends = ref.watch(
        userFriendsProvider((userId: userId, list: 'friends')));
    return friends.when(
      loading: () =>
          const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      error: (e, _) =>
          Center(child: Text('Lỗi: $e', style: AppTextStyles.bodyMedium)),
      data: (list) {
        if (list.isEmpty) {
          return const Center(
            child: Text('Chưa có bạn bè', style: AppTextStyles.bodyMedium),
          );
        }
        return GridView.builder(
          padding: const EdgeInsets.all(12),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            childAspectRatio: 0.78,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
          ),
          itemCount: list.length,
          itemBuilder: (_, i) {
            final f = list[i];
            return InkWell(
              onTap: () => context.pushNamed('userProfile',
                  pathParameters: {'id': f.id}),
              child: Column(
                children: [
                  Expanded(
                    child: ClipOval(
                      child: SafeAvatar(
                        imageUrl: f.avatar,
                        name: f.name,
                        size: 80,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(f.name,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.bodySmall),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline_rounded,
              size: 48, color: Colors.redAccent),
          const SizedBox(height: 8),
          Text('Lỗi: $message', style: AppTextStyles.bodyMedium),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Thử lại')),
        ],
      ),
    );
  }
}
