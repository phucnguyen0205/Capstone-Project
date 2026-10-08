import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:video_player/video_player.dart';

import '../../../../core/providers/providers.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/models/models.dart';
import '../../../../core/widgets/safe_image.dart';
import '../../../posts/presentation/pages/create_post_page.dart';
import '../../../../features/moments/presentation/widgets/moments_strip.dart';

/// Social feed page (Dành cho bạn / Đang theo dõi).
///
/// Mirrors the web `FeedColumn` but adapted for a single-column phone
/// layout. Tabs come from the backend `/api/feed?tab=` endpoint through
/// [feedProvider].
class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);

  static const _tabs = ['for-you', 'following'];

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _buildAppBar(context),
            Expanded(
              child: TabBarView(
                controller: _tab,
                children: [
                  _FeedTab(tab: _tabs[0]),
                  _FeedTab(tab: _tabs[1]),
                ],
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: _CreatePostFab(
        onTap: () => _openCreatePost(context),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }

  void _openCreatePost(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CreatePostPage()),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    final unreadAsync = ref.watch(unreadCountProvider);
    final unread = unreadAsync.maybeWhen(data: (n) => n, orElse: () => 0);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 8),
      decoration: const BoxDecoration(
        color: AppColors.backgroundCard,
        border: Border(
          bottom: BorderSide(color: AppColors.borderLight, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(Icons.bolt_rounded,
                    color: Colors.white, size: 18),
              ),
              const SizedBox(width: 8),
              ShaderMask(
                shaderCallback: (bounds) =>
                    AppColors.primaryGradient.createShader(bounds),
                child: const Text(
                  'NameApp',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
              const Spacer(),
              IconButton(
                onPressed: () => context.pushNamed(AppRoutes.search),
                icon: const Icon(Icons.search_rounded,
                    color: AppColors.textSecondary),
              ),
              _NotificationBell(unread: unread),
              const SizedBox(width: 4),
            ],
          ),
          const SizedBox(height: 6),
          TabBar(
            controller: _tab,
            indicator: const UnderlineTabIndicator(
              borderSide: BorderSide(
                width: 3,
                color: AppColors.primaryPink,
              ),
              insets: EdgeInsets.symmetric(horizontal: 16),
            ),
            indicatorSize: TabBarIndicatorSize.label,
            labelColor: AppColors.textPrimary,
            unselectedLabelColor: AppColors.textSecondary,
            labelStyle: AppTextStyles.tabActive,
            unselectedLabelStyle: AppTextStyles.tabInactive,
            tabs: const [
              Tab(text: 'Dành cho bạn'),
              Tab(text: 'Đang theo dõi'),
            ],
          ),
        ],
      ),
    );
  }
}

class _FeedTab extends ConsumerWidget {
  final String tab;
  const _FeedTab({required this.tab});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedAsync = ref.watch(feedProvider(tab));

    return RefreshIndicator(
      color: AppColors.primaryPink,
      backgroundColor: AppColors.backgroundCard,
      onRefresh: () async {
        ref.invalidate(feedProvider(tab));
        await ref.read(feedProvider(tab).future);
      },
      child: feedAsync.when(
        data: (posts) {
          if (posts.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [
                MomentsStrip(),
                SizedBox(height: 120),
                _EmptyFeed(),
              ],
            );
          }

          // Inline post rendering - không dùng PostCard component riêng
          return ListView.builder(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(top: 0, bottom: 96),
            itemCount: posts.length + 1,
            itemBuilder: (context, i) {
              if (i == 0) {
                return const MomentsStrip();
              }
              final post = posts[i - 1];
              return _InlinePostCard(post: post);
            },
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primaryPink),
        ),
        error: (e, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const SizedBox(height: 80),
            _FeedError(message: '$e', onRetry: () => ref.invalidate(feedProvider(tab))),
          ],
        ),
      ),
    );
  }
}

// Inline Post Card - tất cả trong một, không tách component
class _InlinePostCard extends ConsumerStatefulWidget {
  final PostModel post;
  const _InlinePostCard({required this.post});

  @override
  ConsumerState<_InlinePostCard> createState() => _InlinePostCardState();
}

class _InlinePostCardState extends ConsumerState<_InlinePostCard> {
  VideoPlayerController? _videoController;
  bool _videoInitialized = false;
  bool _busy = false;
  late bool _liked;
  late bool _saved;
  late int _likes;

  @override
  void initState() {
    super.initState();
    _liked = widget.post.likedByMe ?? false;
    _saved = widget.post.savedByMe ?? false;
    _likes = widget.post.likesCount;
    
    if (widget.post.mediaType == 'video') {
      _initVideo();
    }
  }

  void _initVideo() async {
    try {
      _videoController = VideoPlayerController.networkUrl(
        Uri.parse(widget.post.mediaUrl),
      );
      await _videoController!.initialize();
      if (mounted) {
        setState(() => _videoInitialized = true);
      }
    } catch (e) {
      debugPrint('Video error: $e');
    }
  }

  @override
  void dispose() {
    _videoController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.post;
    final author = p.author;
    
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.backgroundCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            leading: CircleAvatar(
              radius: 20,
              backgroundColor: AppColors.backgroundInput,
              backgroundImage: safeNetworkImage(author?.avatar),
              child: (author?.avatar == null || author!.avatar!.isEmpty || isPlaceholderUrl(author!.avatar))
                  ? const Icon(Icons.person_rounded, color: AppColors.textSecondary)
                  : null,
            ),
            title: Text(
              author?.name.isNotEmpty == true
                  ? author!.name
                  : (author?.username.isNotEmpty == true
                      ? '@${author!.username}'
                      : '@cộng_đồng'),
              style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(
              timeago.format(p.createdAt),
              style: AppTextStyles.bodySmall.copyWith(color: AppColors.textMuted),
            ),
            trailing: PopupMenuButton<String>(
              color: AppColors.backgroundCard,
              icon: const Icon(Icons.more_horiz_rounded, color: AppColors.textSecondary),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'report', child: Text('Báo cáo')),
                PopupMenuItem(value: 'hide', child: Text('Ẩn')),
              ],
            ),
            onTap: () {
              if (author != null) {
                context.pushNamed('userProfile', pathParameters: {'id': author.id});
              }
            },
          ),
          
          // Caption
          if (p.caption.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Text(p.caption, style: AppTextStyles.bodyMedium),
            ),
          
          // Media (Video or Image)
          _buildMedia(p),
          
          // Actions
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Row(
              children: [
                _buildAction(
                  _liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  _likes > 0 ? _formatCount(_likes) : null,
                  _toggleLike,
                  color: _liked ? AppColors.primaryPink : null,
                ),
                _buildAction(
                  Icons.mode_comment_outlined,
                  p.commentsCount > 0 ? _formatCount(p.commentsCount) : null,
                  () {
                    // TODO: Open comments
                  },
                ),
                _buildAction(Icons.send_outlined, null, _share),
                const Spacer(),
                _buildAction(
                  _saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                  null,
                  _toggleSave,
                  color: _saved ? AppColors.primaryOrange : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMedia(PostModel post) {
    if (post.mediaType == 'video') {
      return AspectRatio(
        aspectRatio: 4 / 5,
        child: Container(
          color: Colors.black,
          child: _videoInitialized && _videoController != null
              ? Stack(
                  fit: StackFit.expand,
                  children: [
                    VideoPlayer(_videoController!),
                    Center(
                      child: IconButton(
                        onPressed: () {
                          setState(() {
                            if (_videoController!.value.isPlaying) {
                              _videoController!.pause();
                            } else {
                              _videoController!.play();
                            }
                          });
                        },
                        icon: Icon(
                          _videoController!.value.isPlaying
                              ? Icons.pause_circle_outline_rounded
                              : Icons.play_circle_outline_rounded,
                          size: 64,
                          color: Colors.white70,
                        ),
                      ),
                    ),
                  ],
                )
              : const Center(
                  child: CircularProgressIndicator(color: AppColors.primaryPink),
                ),
        ),
      );
    }
    
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
      child: AspectRatio(
        aspectRatio: 1,
        child: CachedNetworkImage(
          imageUrl: post.mediaUrl,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => Container(
            color: AppColors.backgroundInput,
            child: const Icon(Icons.broken_image_rounded, color: AppColors.textSecondary),
          ),
        ),
      ),
    );
  }

  Widget _buildAction(IconData icon, String? label, VoidCallback? onTap, {Color? color}) {
    return InkWell(
      onTap: _busy ? null : onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          children: [
            Icon(icon, size: 22, color: color ?? AppColors.textPrimary),
            if (label != null) ...[
              const SizedBox(width: 6),
              Text(label, style: AppTextStyles.bodySmall),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _toggleLike() async {
    setState(() {
      _busy = true;
      _liked = !_liked;
      _likes += _liked ? 1 : -1;
    });
    try {
      final api = ref.read(apiServiceProvider);
      await api.likePost(widget.post.id);
    } catch (e) {
      if (mounted) {
        setState(() {
          _liked = !_liked;
          _likes += _liked ? 1 : -1;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Lỗi: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleSave() async {
    setState(() {
      _busy = true;
      _saved = !_saved;
    });
    try {
      final api = ref.read(apiServiceProvider);
      await api.savePost(widget.post.id);
    } catch (e) {
      if (mounted) {
        setState(() => _saved = !_saved);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Lỗi: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share() async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.sharePost(widget.post.id, type: 'copy');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã sao chép liên kết')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Lỗi: $e')));
      }
    }
  }

  String _formatCount(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        children: [
          const Icon(Icons.feed_outlined,
              size: 64, color: AppColors.textMuted),
          const SizedBox(height: 12),
          const Text(
            'Chưa có bài viết nào',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Hãy theo dõi thêm bạn bè hoặc đăng bài đầu tiên của bạn.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _FeedError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _FeedError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        children: [
          const Icon(Icons.cloud_off_rounded,
              size: 56, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text(
            'Không thể tải feed: $message',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryPink),
            onPressed: onRetry,
            child: const Text('Thử lại'),
          ),
        ],
      ),
    );
  }
}

class _NotificationBell extends StatelessWidget {
  final int unread;
  const _NotificationBell({required this.unread});

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          onPressed: () => context.pushNamed(AppRoutes.notifications),
          icon: const Icon(Icons.notifications_none_rounded,
              color: AppColors.textPrimary),
        ),
        if (unread > 0)
          Positioned(
            right: 6,
            top: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              decoration: BoxDecoration(
                color: AppColors.primaryPink,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.backgroundCard, width: 1.5),
              ),
              child: Text(
                unread > 99 ? '99+' : '$unread',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
      ],
    );
  }
}

class _CreatePostFab extends StatelessWidget {
  final VoidCallback onTap;
  const _CreatePostFab({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryPink.withOpacity(0.4),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: FloatingActionButton(
        onPressed: onTap,
        backgroundColor: Colors.transparent,
        elevation: 0,
        heroTag: 'home-create-post-fab',
        child: const Icon(Icons.add_rounded, color: Colors.white, size: 28),
      ),
    );
  }
}
