import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/post_model.dart';
import '../../../../core/models/user_model.dart';

/// Center column — list of group posts.
///
/// Mirrors `GroupsFeed` in web. Shows author, media grid, caption,
/// like/comment counts, lens badge.
class GroupsFeed extends StatelessWidget {
  final List<PostModel> posts;
  final bool loading;
  final void Function(PostModel)? onLike;
  final void Function(PostModel)? onComment;
  final VoidCallback onRefresh;
  final VoidCallback onLoadMore;

  const GroupsFeed({
    super.key,
    required this.posts,
    required this.loading,
    required this.onRefresh,
    required this.onLoadMore,
    this.onLike,
    this.onComment,
  });

  @override
  Widget build(BuildContext context) {
    if (loading && posts.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFFFF2E93)),
      );
    }
    if (posts.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(LucideIcons.compass, color: Color(0xFF626775), size: 32),
            SizedBox(height: 8),
            Text('Chưa có bài đăng nào',
                style: TextStyle(color: Color(0xFF626775), fontSize: 13)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      color: const Color(0xFFFF2E93),
      onRefresh: () async => onRefresh(),
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: posts.length + (loading ? 1 : 0),
        itemBuilder: (_, i) {
          if (loading && i == posts.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      color: Color(0xFFFF2E93), strokeWidth: 2),
                ),
              ),
            );
          }
          final p = posts[i];
          return _PostCard(
            post: p,
            onLike: onLike == null ? null : () => onLike!(p),
            onComment: onComment == null ? null : () => onComment!(p),
          );
        },
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  final PostModel post;
  final VoidCallback? onLike;
  final VoidCallback? onComment;
  const _PostCard({required this.post, this.onLike, this.onComment});

  @override
  Widget build(BuildContext context) {
    final author = post.author;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF171920),
        border: Border.all(color: const Color(0xFF242831)),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(
                width: 36,
                height: 36,
                child: Container(
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                    ),
                  ),
                  child: Center(
                    child: Text(
                      _authorInitial(author),
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      author == null
                          ? 'Ẩn danh'
                          : (author.name.isNotEmpty
                              ? author.name
                              : author.username),
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600),
                    ),
                    if (author != null)
                      Text(
                        author.username,
                        style: const TextStyle(
                            color: Color(0xFF626775), fontSize: 11),
                      ),
                  ],
                ),
              ),
              _LensBadge(lens: post.lens),
            ],
          ),
          if (post.mediaUrl.isNotEmpty) ...[
            const SizedBox(height: 10),
            _MediaGrid(urls: [post.mediaUrl]),
          ],
          if (post.caption.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              post.caption,
              style: const TextStyle(
                  color: Color(0xFFE5E7EB), fontSize: 13, height: 1.4),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              InkWell(
                onTap: onLike,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Row(
                    children: [
                      Icon(
                        LucideIcons.heart,
                        size: 14,
                        color: (post.likedByMe ?? false)
                            ? const Color(0xFFFF2E93)
                            : const Color(0xFF626775),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${post.likesCount}',
                        style: const TextStyle(
                            color: Color(0xFFA0A5B5), fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              InkWell(
                onTap: onComment,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.messageCircle,
                          size: 14, color: Color(0xFF626775)),
                      const SizedBox(width: 4),
                      Text(
                        '${post.commentsCount}',
                        style: const TextStyle(
                            color: Color(0xFFA0A5B5), fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _authorInitial(UserModel? author) {
    if (author == null) return '?';
    if (author.name.isNotEmpty) return author.name[0].toUpperCase();
    if (author.username.isNotEmpty) return author.username[0].toUpperCase();
    return '?';
  }
}

class _MediaGrid extends StatelessWidget {
  final List<String> urls;
  const _MediaGrid({required this.urls});

  @override
  Widget build(BuildContext context) {
    if (urls.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: AspectRatio(
          aspectRatio: 4 / 3,
          child: CachedNetworkImage(
            imageUrl: urls.first,
            fit: BoxFit.cover,
            errorWidget: (_, __, ___) => const SizedBox(
              child: Icon(LucideIcons.imageOff,
                  color: Color(0xFF626775), size: 24),
            ),
          ),
        ),
      );
    }
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: urls.length > 1 ? 2 : 1,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        childAspectRatio: 1,
      ),
      itemCount: urls.length.clamp(0, 4),
      itemBuilder: (_, i) => ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: urls[i],
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => const Icon(LucideIcons.imageOff,
              color: Color(0xFF626775), size: 18),
        ),
      ),
    );
  }
}

class _LensBadge extends StatelessWidget {
  final String lens;
  const _LensBadge({required this.lens});

  @override
  Widget build(BuildContext context) {
    final color = switch (lens) {
      'public' => const Color(0xFF06B6D4),
      'friends' => const Color(0xFF34D399),
      'close' => const Color(0xFFF472B6),
      'private' => const Color(0xFFFBBF24),
      _ => const Color(0xFF8B5CF6),
    };
    final label = switch (lens) {
      'public' => 'Công khai',
      'friends' => 'Bè bạn',
      'close' => 'Thân thiết',
      'private' => 'Riêng tư',
      _ => 'Mặc định',
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        border: Border.all(color: color.withOpacity(0.4)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: color, fontSize: 9, fontWeight: FontWeight.w600),
      ),
    );
  }
}
