import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:video_player/video_player.dart';

import '../../../../core/models/moment_model.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_avatar.dart';

/// Full-screen viewer for a single Khoảnh Khắc (Moment).
/// Mirrors the Locket Widget full-screen experience: large media,
/// sender avatar + reaction buttons, with a tap-to-dismiss affordance.
class MomentDetailPage extends ConsumerStatefulWidget {
  final String momentId;
  const MomentDetailPage({super.key, required this.momentId});

  @override
  ConsumerState<MomentDetailPage> createState() => _MomentDetailPageState();
}

class _MomentDetailPageState extends ConsumerState<MomentDetailPage> {
  VideoPlayerController? _video;
  bool _videoReady = false;

  @override
  void initState() {
    super.initState();
    _loadMoment();
  }

  Future<void> _loadMoment() async {
    final api = ref.read(apiServiceProvider);
    try {
      // Mark as viewed server-side.
      await api.viewMoment(widget.momentId);
    } catch (_) {}
    if (!mounted) return;

    // Look up the moment from the in-memory cache.
    final momentsAsync = ref.read(momentsFeedProvider);
    final list = momentsAsync.valueOrNull ?? const [];
    MomentModel? m;
    try {
      m = list.firstWhere((e) => e.id == widget.momentId);
    } catch (_) {
      m = null;
    }
    if (m == null) return;

    if (m.isVideo) {
      try {
        final c = VideoPlayerController.networkUrl(Uri.parse(m.mediaUrl));
        await c.initialize();
        if (!mounted) return;
        setState(() {
          _video = c;
          _videoReady = true;
        });
        c.setLooping(true);
        c.play();
      } catch (_) {}
    }
  }

  @override
  void dispose() {
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final momentsAsync = ref.watch(momentsFeedProvider);
    MomentModel? m;
    momentsAsync.whenData((list) {
      try {
        m = list.firstWhere((e) => e.id == widget.momentId);
      } catch (_) {
        m = null;
      }
    });

    if (m == null) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: CircularProgressIndicator(color: Colors.white),
        ),
      );
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Media
          GestureDetector(
            onTap: () => _togglePlay(),
            child: m!.isVideo
                ? _videoReady && _video != null
                    ? FittedBox(
                        fit: BoxFit.contain,
                        child: SizedBox(
                          width: _video!.value.size.width,
                          height: _video!.value.size.height,
                          child: VideoPlayer(_video!),
                        ),
                      )
                    : const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      )
                : CachedNetworkImage(
                    imageUrl: m!.mediaUrl,
                    fit: BoxFit.contain,
                    placeholder: (_, __) => const Center(
                      child: CircularProgressIndicator(color: Colors.white),
                    ),
                    errorWidget: (_, __, ___) => const Center(
                      child: Icon(Icons.broken_image_rounded,
                          color: Colors.white, size: 48),
                    ),
                  ),
          ),
          // Emoji overlay
          if (m!.overlayEmoji != null)
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 18, vertical: 10),
                decoration: BoxDecoration(
                  color: (m!.overlayColor ?? Colors.white).withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(m!.overlayEmoji!, style: const TextStyle(fontSize: 56)),
              ),
            ),
          // Top header
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back_rounded,
                        color: Colors.white),
                  ),
                  SafeAvatar(
                    imageUrl: m!.author?.avatar,
                    name: m!.author?.name,
                    size: 36,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          m!.author?.name.isNotEmpty == true
                              ? m!.author!.name
                              : '@${m!.author?.username ?? ''}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          timeago.format(m!.createdAt, locale: 'vi'),
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (m!.isOwn == true)
                    IconButton(
                      onPressed: () => _deleteMoment(m!.id),
                      icon: const Icon(Icons.delete_outline_rounded,
                          color: Colors.white),
                    ),
                ],
              ),
            ),
          ),
          // Bottom reactions + caption
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (m!.caption.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          m!.caption,
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _ReactionButton(
                          emoji: '❤️',
                          onTap: () => _react(m!.id, ReactionType.heart),
                        ),
                        _ReactionButton(
                          emoji: '🔥',
                          onTap: () => _react(m!.id, ReactionType.fire),
                        ),
                        _ReactionButton(
                          emoji: '😂',
                          onTap: () => _react(m!.id, ReactionType.laugh),
                        ),
                        _ReactionButton(
                          emoji: '😮',
                          onTap: () => _react(m!.id, ReactionType.wow),
                        ),
                        _ReactionButton(
                          emoji: '😢',
                          onTap: () => _react(m!.id, ReactionType.sad),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _togglePlay() {
    if (_video == null) return;
    setState(() {
      if (_video!.value.isPlaying) {
        _video!.pause();
      } else {
        _video!.play();
      }
    });
  }

  Future<void> _react(String id, ReactionType type) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.reactMoment(id, type.wire);
      ref.invalidate(momentsFeedProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    }
  }

  Future<void> _deleteMoment(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.backgroundCard,
        title: const Text('Xoá khoảnh khắc?',
            style: TextStyle(color: AppColors.textPrimary)),
        content: const Text('Người nhận sẽ không còn thấy ảnh này.',
            style: TextStyle(color: AppColors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Huỷ',
                style: TextStyle(color: AppColors.textSecondary)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryPink),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xoá'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiServiceProvider).deleteMoment(id);
      ref.invalidate(momentsFeedProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e')),
      );
    }
  }
}

class _ReactionButton extends StatelessWidget {
  final String emoji;
  final VoidCallback onTap;
  const _ReactionButton({required this.emoji, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.5),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24, width: 1),
        ),
        alignment: Alignment.center,
        child: Text(emoji, style: const TextStyle(fontSize: 26)),
      ),
    );
  }
}