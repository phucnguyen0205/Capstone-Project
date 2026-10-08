import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:video_player/video_player.dart';

import '../../../../core/models/moment_model.dart';
import '../../../../core/models/user_model.dart';
import '../../../../core/providers/moment_providers.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_avatar.dart';
import '../pages/moment_detail_page.dart';

/// Locket-style row of circular friend avatars pinned to the top of the
/// home feed. Tapping a circle opens the moment in a fullscreen view.
///
/// Pattern mirrors Locket Widget: 1:1 circular photos, the sender's
/// initial in the corner when unviewed, and a subtle ring around
/// unseen moments.
class MomentsStrip extends ConsumerStatefulWidget {
  const MomentsStrip({super.key});

  @override
  ConsumerState<MomentsStrip> createState() => _MomentsStripState();
}

class _MomentsStripState extends ConsumerState<MomentsStrip> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final momentsAsync = ref.watch(momentsFeedProvider);
    return momentsAsync.when(
      data: (moments) {
        if (moments.isEmpty) {
          return _CreateMomentTile(
            onTap: () => _openCamera(context),
          );
        }
        final unseen = moments.where((m) => m.viewedAt == null).toList();
        final visible = _expanded ? moments : moments.take(8).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: visible.length + 1,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (_, i) {
                  if (i == visible.length) {
                    return _TrailingTile(
                      hasMore: moments.length > visible.length - 1,
                      onMore: () => setState(() => _expanded = !_expanded),
                      onCreate: () => _openCamera(context),
                    );
                  }
                  return _MomentCircle(
                    moment: visible[i],
                    onTap: () => _openDetail(context, visible[i]),
                  );
                },
              ),
            ),
            if (unseen.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AppColors.primaryPink,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${unseen.length} khoảnh khắc mới',
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
      loading: () => const SizedBox(
        height: 96,
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryPink,
            ),
          ),
        ),
      ),
      error: (_, __) => _CreateMomentTile(onTap: () => _openCamera(context)),
    );
  }

  void _openCamera(BuildContext context) {
    context.pushNamed(AppRoutes.momentsCamera);
  }

  void _openDetail(BuildContext context, MomentModel m) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MomentDetailPage(momentId: m.id),
      ),
    );
  }
}

class _MomentCircle extends StatefulWidget {
  final MomentModel moment;
  final VoidCallback onTap;
  const _MomentCircle({required this.moment, required this.onTap});

  @override
  State<_MomentCircle> createState() => _MomentCircleState();
}

class _MomentCircleState extends State<_MomentCircle> {
  VideoPlayerController? _video;
  bool _videoReady = false;
  bool _showVideo = false;

  @override
  void initState() {
    super.initState();
    if (widget.moment.isVideo) {
      _initVideo();
    }
  }

  Future<void> _initVideo() async {
    try {
      final c = VideoPlayerController.networkUrl(Uri.parse(widget.moment.mediaUrl));
      await c.initialize();
      if (!mounted) return;
      setState(() {
        _video = c;
        _videoReady = true;
      });
      // Auto play (muted) when circle is first built — gives the Locket
      // feel of a moving tile.
      Future.delayed(const Duration(milliseconds: 150), () {
        if (mounted && _video != null) {
          _video!.setLooping(true);
          _video!.play();
          setState(() => _showVideo = true);
        }
      });
    } catch (e) {
      // Silent fallback to thumbnail.
    }
  }

  @override
  void dispose() {
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.moment;
    final isUnseen = m.viewedAt == null;
    return GestureDetector(
      onTap: widget.onTap,
      onLongPress: () => _showPreview(context, m),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: isUnseen ? AppColors.primaryGradient : null,
              border: isUnseen
                  ? null
                  : Border.all(color: AppColors.borderLight, width: 2),
            ),
            padding: const EdgeInsets.all(2),
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.backgroundCard,
                shape: BoxShape.circle,
              ),
              padding: const EdgeInsets.all(2),
              child: ClipOval(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _MediaPreview(
                      moment: m,
                      video: _showVideo && _videoReady ? _video : null,
                    ),
                    if (m.overlayEmoji != null)
                      Center(
                        child: Text(
                          m.overlayEmoji!,
                          style: const TextStyle(fontSize: 32),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -2,
            right: -2,
            child: _SenderBadge(author: m.author),
          ),
        ],
      ),
    );
  }

  void _showPreview(BuildContext context, MomentModel m) {
    final author = m.author;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.backgroundCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SafeAvatar(
                  imageUrl: author?.avatar,
                  name: author?.name,
                  size: 40,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        author?.name.isNotEmpty == true
                            ? author!.name
                            : '@${author?.username ?? ''}',
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        timeago.format(m.createdAt, locale: 'vi'),
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (m.caption.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(m.caption, style: const TextStyle(color: AppColors.textPrimary)),
            ],
          ],
        ),
      ),
    );
  }
}

class _MediaPreview extends StatelessWidget {
  final MomentModel moment;
  final VideoPlayerController? video;
  const _MediaPreview({required this.moment, this.video});

  @override
  Widget build(BuildContext context) {
    if (moment.isVideo && video != null) {
      return FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: video!.value.size.width,
          height: video!.value.size.height,
          child: VideoPlayer(video!),
        ),
      );
    }
    return CachedNetworkImage(
      imageUrl: moment.mediaUrl,
      fit: BoxFit.cover,
      placeholder: (_, __) => Container(color: AppColors.backgroundInput),
      errorWidget: (_, __, ___) => Container(
        color: AppColors.backgroundInput,
        child: const Icon(Icons.broken_image_rounded,
            color: AppColors.textSecondary),
      ),
    );
  }
}

class _SenderBadge extends StatelessWidget {
  final UserModel? author;
  const _SenderBadge({this.author});

  @override
  Widget build(BuildContext context) {
    final initial = author?.name.isNotEmpty == true
        ? author!.name[0].toUpperCase()
        : (author?.username.isNotEmpty == true
            ? author!.username[0].toUpperCase()
            : '?');
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.backgroundDark, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _TrailingTile extends StatelessWidget {
  final bool hasMore;
  final VoidCallback onMore;
  final VoidCallback onCreate;
  const _TrailingTile({
    required this.hasMore,
    required this.onMore,
    required this.onCreate,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (hasMore)
          GestureDetector(
            onTap: onMore,
            child: Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.backgroundCard,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.borderLight, width: 2),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.expand_more_rounded,
                  color: AppColors.textPrimary, size: 28),
            ),
          ),
        const SizedBox(width: 10),
        GestureDetector(
          onTap: onCreate,
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.backgroundCard,
              shape: BoxShape.circle,
              border: Border.all(
                  color: AppColors.primaryPink.withValues(alpha: 0.4),
                  width: 2,
                  style: BorderStyle.solid),
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.add_rounded,
                color: AppColors.primaryPink, size: 32),
          ),
        ),
      ],
    );
  }
}

class _CreateMomentTile extends StatelessWidget {
  final VoidCallback onTap;
  const _CreateMomentTile({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                AppColors.primaryPink.withValues(alpha: 0.15),
                AppColors.primaryOrange.withValues(alpha: 0.15),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppColors.primaryPink.withValues(alpha: 0.4),
              width: 1.2,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: const BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.camera_alt_rounded,
                    color: Colors.white, size: 20),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Gửi khoảnh khắc',
                      style: TextStyle(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Chụp và chia sẻ ngay tức thì',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}