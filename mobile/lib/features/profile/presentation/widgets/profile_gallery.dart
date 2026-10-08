import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../../../core/models/post_model.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../posts/presentation/widgets/post_card.dart';

/// Posts grid + filter chips + view-mode toggle.
///
/// Mirrors the web posts-grid block. When [userId] is the current user
/// all 4 lens filters are visible (Công khai / Bè bạn / Thân thiết /
/// Riêng tư). For other users we hide "Riêng tư".
class ProfileGallery extends ConsumerStatefulWidget {
  final String userId;
  final bool isMe;
  const ProfileGallery({super.key, required this.userId, required this.isMe});

  @override
  ConsumerState<ProfileGallery> createState() => _ProfileGalleryState();
}

class _ProfileGalleryState extends ConsumerState<ProfileGallery> {
  bool _isGridView = true;
  String _selectedFilter = 'all';

  @override
  Widget build(BuildContext context) {
    final postsAsync = ref.watch(userPostsProvider(widget.userId));

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Bài viết',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              const Spacer(),
              _buildViewButton(Icons.grid_on_rounded, _isGridView, () {
                setState(() => _isGridView = true);
              }),
              const SizedBox(width: 8),
              _buildViewButton(Icons.view_agenda_outlined, !_isGridView, () {
                setState(() => _isGridView = false);
              }),
            ],
          ),
          const SizedBox(height: 12),
          _buildFilterBar(),
          const SizedBox(height: 16),
          postsAsync.when(
            data: (posts) {
              final filtered = _applyFilter(posts);
              if (filtered.isEmpty) {
                return _EmptyState(filter: _selectedFilter, isMe: widget.isMe);
              }
              return _isGridView
                  ? _buildGrid(filtered)
                  : _buildList(filtered);
            },
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.primaryPink),
              ),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'Không thể tải bài viết: $e',
                style: const TextStyle(color: AppColors.textMuted),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<PostModel> _applyFilter(List<PostModel> posts) {
    switch (_selectedFilter) {
      case 'public':
        return posts.where((p) => p.lens == 'public').toList();
      case 'friends':
        return posts.where((p) => p.lens == 'friends').toList();
      case 'close':
        return posts.where((p) => p.lens == 'close').toList();
      case 'private':
        if (!widget.isMe) return const [];
        return posts.where((p) => p.lens == 'private').toList();
      case 'all':
      default:
        return posts;
    }
  }

  Widget _buildFilterBar() {
    final chips = <_FilterChip>[
      const _FilterChip('👁 Tất cả', 'all'),
      const _FilterChip('🌍 Công khai', 'public'),
      const _FilterChip('😄 Bè bạn', 'friends'),
      const _FilterChip('💜 Thân thiết', 'close'),
      if (widget.isMe) const _FilterChip('🔒 Riêng tư', 'private'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (int i = 0; i < chips.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            _buildFilterChip(chips[i].label, chips[i].value),
          ],
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isActive = _selectedFilter == value;
    return GestureDetector(
      onTap: () => setState(() => _selectedFilter = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: isActive ? AppColors.secondaryCyan : Colors.white.withOpacity(0.04),
          border: Border.all(
            color: isActive ? AppColors.secondaryCyan : AppColors.borderLight,
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive ? AppColors.backgroundDark : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildViewButton(IconData icon, bool isActive, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: isActive ? AppColors.backgroundInput : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(
          icon,
          size: 18,
          color: isActive ? AppColors.primaryPink : AppColors.textSecondary,
        ),
      ),
    );
  }

  Widget _buildGrid(List<PostModel> posts) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 4,
        mainAxisSpacing: 4,
        childAspectRatio: 1,
      ),
      itemCount: posts.length,
      itemBuilder: (context, i) => _GridTile(post: posts[i]),
    );
  }

  Widget _buildList(List<PostModel> posts) {
    return Column(
      children: [
        for (final p in posts) ...[
          PostCard(post: p),
        ],
      ],
    );
  }
}

class _GridTile extends StatefulWidget {
  final PostModel post;
  const _GridTile({required this.post});

  @override
  State<_GridTile> createState() => _GridTileState();
}

class _GridTileState extends State<_GridTile> {
  VideoPlayerController? _controller;
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    if (widget.post.mediaType == 'video') {
      _initVideo();
    }
  }

  @override
  void didUpdateWidget(_GridTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Reinitialize video if post changes
    if (widget.post.id != oldWidget.post.id) {
      _controller?.dispose();
      _controller = null;
      _isInitialized = false;
      if (widget.post.mediaType == 'video') {
        _initVideo();
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _initVideo() async {
    try {
      _controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.post.mediaUrl),
      );
      await _controller!.initialize();
      if (mounted) {
        setState(() => _isInitialized = true);
      }
    } catch (e) {
      // Graceful fallback on error
      if (mounted) {
        setState(() => _isInitialized = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.backgroundCard,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: widget.post.mediaType == 'video'
                ? _isInitialized && _controller != null
                    ? FittedBox(
                        fit: BoxFit.cover,
                        child: SizedBox(
                          width: _controller!.value.size.width,
                          height: _controller!.value.size.height,
                          child: VideoPlayer(_controller!),
                        ),
                      )
                    : Container(
                        color: Colors.black,
                        child: const Center(
                          child: Icon(Icons.play_arrow_rounded,
                              size: 36, color: Colors.white70),
                        ),
                      )
                : CachedNetworkImage(
                    imageUrl: widget.post.mediaUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: AppColors.backgroundInput),
                    errorWidget: (_, __, ___) => Container(
                      color: AppColors.backgroundInput,
                      child: const Icon(Icons.broken_image_rounded,
                          color: AppColors.textSecondary, size: 24),
                    ),
                  ),
          ),
          if (widget.post.lens == 'friends')
            Positioned(
              top: 6,
              left: 6,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: AppColors.secondaryCyan,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Icon(Icons.group_rounded,
                    size: 10, color: Colors.black),
              ),
            ),
          if (widget.post.lens == 'close')
            Positioned(
              top: 6,
              left: 6,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: AppColors.primaryOrange,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Icon(Icons.favorite_rounded,
                    size: 10, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}

class _FilterChip {
  final String label;
  final String value;
  const _FilterChip(this.label, this.value);
}

class _EmptyState extends StatelessWidget {
  final String filter;
  final bool isMe;
  const _EmptyState({required this.filter, required this.isMe});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 48),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.image_outlined,
              size: 48, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text(
            isMe
                ? (filter == 'all'
                    ? 'Bạn chưa đăng bài nào'
                    : 'Chưa có bài viết ở mục này')
                : 'Chưa có bài viết công khai',
            style: const TextStyle(
              color: AppColors.textMuted,
              fontSize: 13,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
