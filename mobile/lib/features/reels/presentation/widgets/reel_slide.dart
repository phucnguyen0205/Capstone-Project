import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../../../../core/models/models.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_avatar.dart';

/// A single full-bleed reel slide. Renders the [VideoPlayer] (or a
/// "locked" overlay if the reel hasn't been unlocked yet) along with
/// the right-side action column (like / comment / share / mute) and the
/// bottom author + caption strip.
///
/// The widget is intentionally **stateless**: the parent owns the
/// controller list and passes a fresh `controller` whenever the
/// underlying media URL changes. We never call `setState` here — every
/// state change is propagated up so the surrounding `PageView` can
/// drive the lifecycle of all controllers in lockstep.
class ReelSlide extends StatefulWidget {
  final ReelItem item;
  final VideoPlayerController? controller;
  final bool isActive;
  final String viewerId;
  final bool muted;
  final int localLikeCount;
  final bool localLiked;
  final int localCommentCount;
  final bool busyLike;
  final bool busyUnlock;
  final VoidCallback onTapTogglePlay;
  final VoidCallback onToggleMute;
  final VoidCallback onToggleLike;
  final VoidCallback onOpenComments;
  final VoidCallback onShare;
  final VoidCallback onUnlock;

  const ReelSlide({
    super.key,
    required this.item,
    required this.controller,
    required this.isActive,
    required this.viewerId,
    required this.muted,
    required this.localLikeCount,
    required this.localLiked,
    required this.localCommentCount,
    required this.busyLike,
    required this.busyUnlock,
    required this.onTapTogglePlay,
    required this.onToggleMute,
    required this.onToggleLike,
    required this.onOpenComments,
    required this.onShare,
    required this.onUnlock,
  });

  @override
  State<ReelSlide> createState() => _ReelSlideState();
}

class _ReelSlideState extends State<ReelSlide> {
  /// Whether the user has explicitly paused this reel (by tapping). The
  /// auto-next behavior in the parent consults this flag so we don't
  /// race the user's "pause" intent with auto-advance.
  bool _userPaused = false;

  @override
  void didUpdateWidget(covariant ReelSlide oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.id != widget.item.id) {
      // New reel mounted in this widget — reset the user-pause state.
      _userPaused = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Stack(
      fit: StackFit.expand,
      children: [
        // Layer 1: video (or locked overlay)
        _MediaLayer(
          controller: widget.controller,
          isActive: widget.isActive,
          isLocked: item.locked,
          aspect: item.aspectRatio,
          muted: widget.muted,
          onTapTogglePlay: widget.onTapTogglePlay,
          userPaused: _userPaused,
          onUserPauseChange: (paused) =>
              setState(() => _userPaused = paused),
        ),

        // Layer 2: locked overlay for close-friends reels that the
        // viewer can't watch yet.
        if (item.locked)
          _LockedOverlay(
            item: item,
            busy: widget.busyUnlock,
            onUnlock: widget.onUnlock,
          ),

        // Layer 3: pause indicator (centred play button when paused)
        if (_userPaused && !item.locked && widget.controller != null)
          IgnorePointer(
            child: Center(
              child: Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.black.withValues(alpha: 0.45),
                ),
              ),
            ),
          ),

        // Layer 4: pending-moderation chip (only the author sees their
        // own pending reels because the explore endpoint filters them
        // out for non-authors).
        if (item.isPending)
          Positioned(
            left: 12,
            top: 12,
            child: _PendingChip(),
          ),

        // Layer 5: right-side action column
        Positioned(
          right: 8,
          bottom: 120,
          child: _ActionColumn(
            likeCount: widget.localLikeCount,
            liked: widget.localLiked,
            commentCount: widget.localCommentCount,
            muted: widget.muted,
            busyLike: widget.busyLike,
            onToggleLike: widget.onToggleLike,
            onOpenComments: widget.onOpenComments,
            onShare: widget.onShare,
            onToggleMute: widget.onToggleMute,
          ),
        ),

        // Layer 6: bottom author + caption strip
        Positioned(
          left: 0,
          right: 64, // leave room for the right action column
          bottom: 24,
          child: _AuthorStrip(
            item: item,
            isMine: widget.viewerId.isNotEmpty &&
                widget.viewerId == item.author.id,
          ),
        ),
      ],
    );
  }
}

class _MediaLayer extends StatefulWidget {
  final VideoPlayerController? controller;
  final bool isActive;
  final bool isLocked;
  final double aspect;
  final bool muted;
  final VoidCallback onTapTogglePlay;
  final bool userPaused;
  final ValueChanged<bool> onUserPauseChange;
  const _MediaLayer({
    required this.controller,
    required this.isActive,
    required this.isLocked,
    required this.aspect,
    required this.muted,
    required this.onTapTogglePlay,
    required this.userPaused,
    required this.onUserPauseChange,
  });

  @override
  State<_MediaLayer> createState() => _MediaLayerState();
}

class _MediaLayerState extends State<_MediaLayer> {
  @override
  void didUpdateWidget(covariant _MediaLayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    final controller = widget.controller;
    if (controller == null) return;

    // Drive the controller's lifecycle based on whether this slide
    // is the active one. We always start from the beginning when a
    // reel becomes active so each swipe-up feels fresh.
    if (widget.isActive && !widget.isLocked) {
      controller
        ..setLooping(true)
        ..setVolume(widget.muted ? 0 : 1);
      if (controller.value.isInitialized && controller.value.duration > Duration.zero) {
        controller.seekTo(Duration.zero);
      }
      controller.play().catchError((_) {});
    } else {
      controller.pause();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isLocked) {
      return Container(color: const Color(0xFF0A0B10));
    }
    final controller = widget.controller;
    if (controller == null || !controller.value.isInitialized) {
      return Container(
        color: const Color(0xFF050507),
        child: const Center(
          child: SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryPink,
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      onTap: () {
        // Forward to parent so it can toggle play state — but also
        // remember the user-pause intent so auto-advance respects it.
        widget.onTapTogglePlay();
        if (controller.value.isPlaying) {
          widget.onUserPauseChange(true);
        } else {
          widget.onUserPauseChange(false);
        }
        HapticFeedback.selectionClick();
      },
      child: AspectRatio(
        aspectRatio: widget.aspect,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: AspectRatio(
                aspectRatio: controller.value.aspectRatio == 0
                    ? widget.aspect
                    : controller.value.aspectRatio,
                child: VideoPlayer(controller),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LockedOverlay extends StatelessWidget {
  final ReelItem item;
  final bool busy;
  final VoidCallback onUnlock;
  const _LockedOverlay({
    required this.item,
    required this.busy,
    required this.onUnlock,
  });

  @override
  Widget build(BuildContext context) {
    final points = item.myClosenessPoints;
    final distance = item.distanceToUnlock;
    final total = points + distance;
    final progress =
        total > 0 ? (points / total).clamp(0.0, 1.0) : 0.0;
    // Show the unlock button only when the viewer has met the
    // friendship requirement AND just needs to confirm the unlock
    // (i.e. the server says distance == 0).
    final showUnlockButton = item.isClose && distance == 0;

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1A0D18), Color(0xFF0C0C14), Color(0xFF000000)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.black.withValues(alpha: 0.4),
                  border: Border.all(
                    color: const Color(0xFFFFC857).withValues(alpha: 0.4),
                    width: 1.5,
                  ),
                ),
                child: const Icon(
                  Icons.lock_rounded,
                  color: Color(0xFFFFC857),
                  size: 28,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Video bị khoá',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                distance > 0 && points == 0
                    ? 'Hãy tương tác với @${item.author.username} để bắt đầu tích điểm thân thiết và mở khoá video này.'
                    : distance > 0
                        ? 'Bạn cần thêm $distance điểm thân thiết với @${item.author.username} để mở khoá video này.'
                        : 'Bạn cần kết bạn với @${item.author.username} để xem video này.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
              if (total > 0) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: 220,
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '$points điểm',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 10,
                            ),
                          ),
                          Text(
                            '$total điểm',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(99),
                        child: LinearProgressIndicator(
                          value: progress,
                          minHeight: 4,
                          backgroundColor: Colors.white10,
                          valueColor: const AlwaysStoppedAnimation(
                            Color(0xFFFFC857),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (showUnlockButton) ...[
                const SizedBox(height: 18),
                GestureDetector(
                  onTap: busy ? null : onUnlock,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFFFC857), Color(0xFFFF2E93)],
                      ),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.lock_open_rounded,
                          size: 14,
                          color: Color(0xFF1A0D18),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          busy ? 'Đang mở khoá…' : 'Mở khoá ngay',
                          style: const TextStyle(
                            color: Color(0xFF1A0D18),
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingChip extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFFFC857).withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(99),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.access_time_rounded,
              size: 11, color: Color(0xFF1A0D18)),
          SizedBox(width: 4),
          Text(
            'Đang chờ duyệt',
            style: TextStyle(
              color: Color(0xFF1A0D18),
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionColumn extends StatelessWidget {
  final int likeCount;
  final bool liked;
  final int commentCount;
  final bool muted;
  final bool busyLike;
  final VoidCallback onToggleLike;
  final VoidCallback onOpenComments;
  final VoidCallback onShare;
  final VoidCallback onToggleMute;
  const _ActionColumn({
    required this.likeCount,
    required this.liked,
    required this.commentCount,
    required this.muted,
    required this.busyLike,
    required this.onToggleLike,
    required this.onOpenComments,
    required this.onShare,
    required this.onToggleMute,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _ActionButton(
          icon: liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          color: liked ? const Color(0xFFFF2E93) : Colors.white,
          label: _formatCount(likeCount),
          onTap: busyLike ? null : onToggleLike,
        ),
        const SizedBox(height: 18),
        _ActionButton(
          icon: Icons.mode_comment_outlined,
          color: Colors.white,
          label: _formatCount(commentCount),
          onTap: onOpenComments,
        ),
        const SizedBox(height: 18),
        _ActionButton(
          icon: Icons.ios_share_rounded,
          color: Colors.white,
          label: 'Chia sẻ',
          onTap: onShare,
        ),
        const SizedBox(height: 18),
        GestureDetector(
          onTap: onToggleMute,
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black.withValues(alpha: 0.3),
            ),
            child: Icon(
              muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
              color: Colors.white,
              size: 18,
            ),
          ),
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback? onTap;
  const _ActionButton({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black.withValues(alpha: 0.3),
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              shadows: [Shadow(blurRadius: 4, color: Colors.black)],
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthorStrip extends StatelessWidget {
  final ReelItem item;
  final bool isMine;
  const _AuthorStrip({required this.item, required this.isMine});

  String _timeAgo(DateTime t) {
    final delta = DateTime.now().difference(t);
    if (delta.inSeconds < 60) return 'Vừa xong';
    if (delta.inMinutes < 60) return '${delta.inMinutes} phút trước';
    if (delta.inHours < 24) return '${delta.inHours} giờ trước';
    if (delta.inDays < 7) return '${delta.inDays} ngày trước';
    return '${t.day.toString().padLeft(2, '0')}/${t.month.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.black.withValues(alpha: 0.0),
            Colors.black.withValues(alpha: 0.55),
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    SafeAvatar(
                      imageUrl: item.author.avatar,
                      name: item.author.displayName,
                      size: 36,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.author.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              shadows: [Shadow(blurRadius: 4, color: Colors.black)],
                            ),
                          ),
                          Text(
                            '@${item.author.username} · ${_timeAgo(item.createdAt)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (!isMine && !item.locked)
                      Container(
                        margin: const EdgeInsets.only(left: 6),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          gradient: AppColors.primaryGradient,
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: const Text(
                          '+ Follow',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                  ],
                ),
                if (item.caption != null && item.caption!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    item.caption!,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      height: 1.35,
                      shadows: [Shadow(blurRadius: 4, color: Colors.black)],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _formatCount(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
  return n.toString();
}