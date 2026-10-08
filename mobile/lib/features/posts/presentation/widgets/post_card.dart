import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:video_player/video_player.dart';

import '../../../../core/models/models.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_image.dart';

/// A reusable post card used by feed, profile, groups-feed, etc.
class PostCard extends ConsumerWidget {
  final PostModel post;
  final VoidCallback? onTap;
  const PostCard({super.key, required this.post, this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = post;
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
          _Header(post: p),
          if (p.caption.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Text(p.caption, style: AppTextStyles.bodyMedium),
            ),
          _Media(post: p),
          _Actions(post: p),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final PostModel post;
  const _Header({required this.post});

  @override
  Widget build(BuildContext context) {
    final author = post.author;
    return ListTile(
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
      subtitle: Text(timeago.format(post.createdAt),
          style: AppTextStyles.bodySmall.copyWith(color: AppColors.textMuted)),
      trailing: PopupMenuButton<String>(
        color: AppColors.backgroundCard,
        icon: const Icon(Icons.more_horiz_rounded, color: AppColors.textSecondary),
        onSelected: (v) {
          // delegate to caller; the action sheet uses ConsumerStatefulWidget
          // so it can be re-implemented inside _Actions if needed
        },
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
    );
  }
}

class _Media extends StatefulWidget {
  final PostModel post;
  const _Media({required this.post});

  @override
  State<_Media> createState() => _MediaState();
}

class _MediaState extends State<_Media> {
  VideoPlayerController? _controller;
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    if (widget.post.mediaType == 'video') {
      _initializeVideo();
    }
  }

  void _initializeVideo() async {
    try {
      _controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.post.mediaUrl),
      );
      await _controller!.initialize();
      if (mounted) {
        setState(() => _isInitialized = true);
      }
    } catch (e) {
      debugPrint('Video init error: $e');
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.post.mediaType == 'video') {
      return AspectRatio(
        aspectRatio: 4 / 5,
        child: Container(
          color: Colors.black,
          child: _isInitialized && _controller != null
              ? Stack(
                  fit: StackFit.expand,
                  children: [
                    VideoPlayer(_controller!),
                    Center(
                      child: IconButton(
                        onPressed: () {
                          setState(() {
                            if (_controller!.value.isPlaying) {
                              _controller!.pause();
                            } else {
                              _controller!.play();
                            }
                          });
                        },
                        icon: Icon(
                          _controller!.value.isPlaying
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
                  child: CircularProgressIndicator(
                    color: AppColors.primaryPink,
                  ),
                ),
        ),
      );
    }
    
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
      child: AspectRatio(
        aspectRatio: 1,
        child: CachedNetworkImage(
          imageUrl: widget.post.mediaUrl,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => Container(
            color: AppColors.backgroundInput,
            child: const Icon(Icons.broken_image_rounded,
                color: AppColors.textSecondary),
          ),
        ),
      ),
    );
  }
}

class _Actions extends ConsumerStatefulWidget {
  final PostModel post;
  const _Actions({required this.post});
  @override
  ConsumerState<_Actions> createState() => _ActionsState();
}

class _ActionsState extends ConsumerState<_Actions> {
  bool _busy = false;
  late bool _liked = widget.post.likedByMe ?? false;
  late bool _saved = widget.post.savedByMe ?? false;
  late int _likes = widget.post.likesCount;

  @override
  Widget build(BuildContext context) {
    final p = widget.post;
    Widget action(IconData icon, String? label, VoidCallback? onTap, {Color? color}) {
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

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        children: [
          action(_liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              _likes > 0 ? _formatCount(_likes) : null, () => _toggleLike(), color: _liked ? AppColors.primaryPink : null),
          action(Icons.mode_comment_outlined,
              p.commentsCount > 0 ? _formatCount(p.commentsCount) : null, () {}),
          action(Icons.send_outlined, null, () => _share()),
          const Spacer(),
          action(_saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
              null, () => _toggleSave(), color: _saved ? AppColors.primaryOrange : null),
        ],
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
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Lỗi: $e')));
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
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Lỗi: $e')));
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
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Lỗi: $e')));
      }
    }
  }
}

String _formatCount(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
  return n.toString();
}
