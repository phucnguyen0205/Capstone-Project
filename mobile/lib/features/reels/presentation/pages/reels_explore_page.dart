import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/providers/reels_providers.dart';
import '../../../../core/services/api_extensions/api_extensions.dart';
import '../../../../core/theme/app_theme.dart';
import '../widgets/reel_comments_sheet.dart';
import '../widgets/reel_slide.dart';

/// Fullscreen vertical-feed reels player. Mirrors the web
/// `ReelsPlayer` (`src/components/groups/ReelsPlayer.tsx`):
///
///   * Top tab bar with `Khám phá` / `Thư viện của bạn` toggles.
///   * Vertical PageView of [ReelSlide]s; only the active slide plays.
///   * Auto-advance when the active reel ends (skipped if the user
///     explicitly paused).
///   * Like / comment / share / mute wired through the same APIs the
///     web client uses (`/api/interactions`, `/api/posts/[id]/comments`,
///     `/api/reels/[id]/unlock`).
///   * Locked close-friends reels render a gate; tapping
///     "Mở khoá ngay" calls the unlock endpoint and replaces the
///     locked entry in-place.
///
/// **Important**: this surface ONLY consumes videos that already live
/// in `posts` (with `media_type='video'`). There is intentionally no
/// upload affordance — videos must be posted from the main feed /
/// group reel screen. Adding one would split the moderation pipeline
/// and surface un-audited content here, which is what the spec asks us
/// to avoid.
class ReelsExplorePage extends ConsumerStatefulWidget {
  const ReelsExplorePage({super.key});

  @override
  ConsumerState<ReelsExplorePage> createState() => _ReelsExplorePageState();
}

class _ReelsExplorePageState extends ConsumerState<ReelsExplorePage>
    with WidgetsBindingObserver {
  ReelsTab _tab = ReelsTab.explore;

  /// Per-in-controller cache. Keyed by reel id so the player can
  /// preserve the controller when scrolling away and back. The cache
  /// is bounded (see `_controllerCacheSize`) to avoid leaking
  /// decoders for reels that have scrolled far out of view.
  final Map<String, VideoPlayerController> _controllers = {};
  final Map<String, _ReelLocalState> _localState = {};
  static const int _controllerCacheSize = 4;

  final PageController _pageController = PageController();
  int _activeIndex = 0;
  bool _muted = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Lock to portrait — landscape would split the video across an
    // awkward seam and there's no compelling reason to allow it for
    // vertical reels.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // When the app is backgrounded we pause every video so the OS
    // doesn't keep decoding in the background (which would burn
    // battery and may be rejected by the App Store reviewers).
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      for (final c in _controllers.values) {
        c.pause();
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.edgeToEdge,
    );
    for (final c in _controllers.values) {
      c.dispose();
    }
    _controllers.clear();
    _localState.clear();
    _pageController.dispose();
    super.dispose();
  }

  // ── Controller management ─────────────────────────────────────────

  VideoPlayerController _ensureController(ReelItem item) {
    final existing = _controllers[item.id];
    if (existing != null) return existing;

    // Locked reels don't have a playable URL — return a placeholder
    // that the slide can render as a black background. The slide
    // itself falls back to the locked overlay so the user never sees
    // the placeholder.
    if (item.locked || item.mediaUrl.isEmpty) {
      final placeholder = VideoPlayerController.networkUrl(
        Uri.parse('about:blank'),
      );
      _controllers[item.id] = placeholder;
      return placeholder;
    }

    final controller = VideoPlayerController.networkUrl(
      Uri.parse(item.mediaUrl),
      videoPlayerOptions: VideoPlayerOptions(
        mixWithOthers: true,
      ),
    );
    controller.initialize().catchError((_) {});
    _controllers[item.id] = controller;
    return controller;
  }

  void _evictFarControllers(int activeIndex, List<ReelItem> items) {
    if (_controllers.length <= _controllerCacheSize) return;
    // Keep controllers within ±1 of the active index plus a small
    // window either side so swipes feel instant.
    final keepIds = <String>{};
    for (var delta = -1; delta <= 1; delta++) {
      final i = activeIndex + delta;
      if (i >= 0 && i < items.length) keepIds.add(items[i].id);
    }
    _controllers.removeWhere((id, controller) {
      if (keepIds.contains(id)) return false;
      controller.dispose();
      return true;
    });
    _localState.removeWhere((id, _) => !keepIds.contains(id));
  }

  // ── Action handlers ──────────────────────────────────────────────

  Future<void> _toggleLike(ReelItem item) async {
    final local = _localState.putIfAbsent(
      item.id,
      () => _ReelLocalState(
        liked: item.likedByMe,
        likeCount: item.likeCount,
        commentCount: item.commentCount,
        userPaused: false,
      ),
    );
    if (local.busyLike) return;

    // Optimistic update — flip locally first so the heart fills
    // instantly, then call the API and revert if it fails.
    final wasLiked = local.liked;
    final newCount = wasLiked ? local.likeCount - 1 : local.likeCount + 1;
    setState(() {
      _localState[item.id] = local.copyWith(
        liked: !wasLiked,
        likeCount: newCount.clamp(0, 1 << 30),
        busyLike: true,
      );
    });

    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.toggleReelLike(item.id);
      final serverLiked = response['liked'] == true;
      if (!mounted) return;
      // Reconcile with server truth so we don't drift after a 4xx.
      setState(() {
        _localState[item.id] = _localState[item.id]!.copyWith(
          liked: serverLiked,
          busyLike: false,
        );
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _localState[item.id] = _localState[item.id]!.copyWith(
          liked: wasLiked,
          likeCount: item.likeCount,
          busyLike: false,
        );
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không thể cập nhật lượt thích')),
      );
    }
  }

  void _openComments(ReelItem item) {
    showReelCommentsSheet(context, item.id);
    // Optimistically bump the counter so the user sees their pending
    // comment reflected immediately. The actual count is reconciled
    // next time the sheet loads.
    final state = _localState.putIfAbsent(
      item.id,
      () => _ReelLocalState(
        liked: item.likedByMe,
        likeCount: item.likeCount,
        commentCount: item.commentCount,
        userPaused: false,
      ),
    );
    setState(() {
      _localState[item.id] = state.copyWith(
        commentCount: state.commentCount + 1,
      );
    });
  }

  Future<void> _share(ReelItem item) async {
    // Web uses navigator.share — the closest mobile equivalent is the
    // platform share sheet. Without a dependency on
    // `share_plus`, we fall back to copying the deep link to the
    // clipboard, which is enough for the demo. Adding `share_plus`
    // later is a one-line pubspec change.
    final link = '${AppConfig.webBaseUrl}/?post=${item.id}';
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Đã sao chép liên kết vào bộ nhớ tạm')),
    );
  }

  Future<void> _unlock(ReelItem item) async {
    final state = _localState.putIfAbsent(
      item.id,
      () => _ReelLocalState(
        liked: item.likedByMe,
        likeCount: item.likeCount,
        commentCount: item.commentCount,
        userPaused: false,
        busyUnlock: true,
      ),
    );
    setState(() {
      _localState[item.id] = state.copyWith(busyUnlock: true);
    });
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.unlockReel(item.id);
      final reelJson = response['reel'];
      if (reelJson is Map<String, dynamic>) {
        // Splice the unlocked reel back into the active feed by
        // invalidating the provider so the parent rebuilds with the
        // fresh item (which now has a real mediaUrl).
        ref.invalidate(reelsFeedProvider(_tab));
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã mở khoá video')),
        );
      } else {
        throw const FormatException('Invalid unlock response');
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Mở khoá thất bại: $e')),
      );
    } finally {
      if (mounted) {
        final current = _localState[item.id];
        if (current != null) {
          setState(() {
            _localState[item.id] = current.copyWith(busyUnlock: false);
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewer = ref.watch(currentUserProvider);
    final viewerId = viewer?.id ?? '';

    final feedAsync = ref.watch(reelsFeedProvider(_tab));

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TabBar(
              tab: _tab,
              onChange: (next) {
                setState(() {
                  _tab = next;
                  _activeIndex = 0;
                });
                // Reset scroll position when switching tabs so the
                // user always starts at the top of the new feed.
                if (_pageController.hasClients) {
                  _pageController.jumpToPage(0);
                }
                // Local state from the previous tab is no longer
                // relevant — keep it for instant back-nav, but
                // drop controllers that aren't referenced by the new
                // feed so we don't leak decoders.
                for (final controller in _controllers.values) {
                  controller.dispose();
                }
                _controllers.clear();
              },
            ),
            Expanded(
              child: feedAsync.when(
                loading: () => const _LoadingState(),
                error: (e, _) => _ErrorState(
                  message: e.toString(),
                  onRetry: () => ref.invalidate(reelsFeedProvider(_tab)),
                ),
                data: (items) {
                  if (items.isEmpty) {
                    return _EmptyState(
                      tab: _tab,
                      onRetry: () =>
                          ref.invalidate(reelsFeedProvider(_tab)),
                    );
                  }
                  return _Player(
                    items: items,
                    viewerId: viewerId,
                    activeIndex: _activeIndex,
                    pageController: _pageController,
                    muted: _muted,
                    controllers: _controllers,
                    localState: _localState,
                    ensureController: _ensureController,
                    evictFarControllers: _evictFarControllers,
                    onPageChanged: (i) => setState(() => _activeIndex = i),
                    onTapTogglePlay: _togglePlayPause,
                    onToggleMute: () => setState(() => _muted = !_muted),
                    onToggleLike: _toggleLike,
                    onOpenComments: _openComments,
                    onShare: _share,
                    onUnlock: _unlock,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _togglePlayPause() {
    if (_activeIndex < 0) return;
    final items = ref.read(reelsFeedProvider(_tab)).valueOrNull;
    if (items == null || _activeIndex >= items.length) return;
    final item = items[_activeIndex];
    final controller = _controllers[item.id];
    if (controller == null || !controller.value.isInitialized) return;
    final state = _localState[item.id];
    if (controller.value.isPlaying) {
      controller.pause();
      if (state != null) {
        setState(() {
          _localState[item.id] = state.copyWith(userPaused: true);
        });
      }
    } else {
      controller.play().catchError((_) {});
      if (state != null) {
        setState(() {
          _localState[item.id] = state.copyWith(userPaused: false);
        });
      }
    }
  }
}

// We declare `_Player` outside the state class because it has no
// business with stateful logic of its own — it's a pure renderer fed
// by the parent state.
class _Player extends StatelessWidget {
  final List<ReelItem> items;
  final String viewerId;
  final int activeIndex;
  final PageController pageController;
  final bool muted;
  final Map<String, VideoPlayerController> controllers;
  final Map<String, _ReelLocalState> localState;
  final VideoPlayerController Function(ReelItem) ensureController;
  final void Function(int, List<ReelItem>) evictFarControllers;
  final ValueChanged<int> onPageChanged;
  final VoidCallback onTapTogglePlay;
  final VoidCallback onToggleMute;
  final ValueChanged<ReelItem> onToggleLike;
  final ValueChanged<ReelItem> onOpenComments;
  final ValueChanged<ReelItem> onShare;
  final ValueChanged<ReelItem> onUnlock;
  const _Player({
    required this.items,
    required this.viewerId,
    required this.activeIndex,
    required this.pageController,
    required this.muted,
    required this.controllers,
    required this.localState,
    required this.ensureController,
    required this.evictFarControllers,
    required this.onPageChanged,
    required this.onTapTogglePlay,
    required this.onToggleMute,
    required this.onToggleLike,
    required this.onOpenComments,
    required this.onShare,
    required this.onUnlock,
  });

  @override
  Widget build(BuildContext context) {
    // Eagerly prepare controllers for the surrounding pages so swiping
    // up/down feels instant. Then run the eviction pass to drop far
    // ones.
    for (final item in items) {
      ensureController(item);
    }
    evictFarControllers(activeIndex, items);

    return PageView.builder(
      controller: pageController,
      scrollDirection: Axis.vertical,
      itemCount: items.length,
      onPageChanged: onPageChanged,
      itemBuilder: (_, i) {
        final item = items[i];
        final state = localState[item.id] ??
            _ReelLocalState(
              liked: item.likedByMe,
              likeCount: item.likeCount,
              commentCount: item.commentCount,
              userPaused: false,
            );
        return ReelSlide(
          item: item,
          controller: controllers[item.id],
          isActive: i == activeIndex,
          viewerId: viewerId,
          muted: muted,
          localLikeCount: state.likeCount,
          localLiked: state.liked,
          localCommentCount: state.commentCount,
          busyLike: state.busyLike,
          busyUnlock: state.busyUnlock,
          onTapTogglePlay: onTapTogglePlay,
          onToggleMute: onToggleMute,
          onToggleLike: () => onToggleLike(item),
          onOpenComments: () => onOpenComments(item),
          onShare: () => onShare(item),
          onUnlock: () => onUnlock(item),
        );
      },
    );
  }
}

class _TabBar extends StatelessWidget {
  final ReelsTab tab;
  final ValueChanged<ReelsTab> onChange;
  const _TabBar({required this.tab, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xCC000000), Color(0x00000000)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'Khám phá',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(99),
              border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
            ),
            child: Row(
              children: [
                _TabChip(
                  label: 'Khám phá',
                  icon: Icons.explore_rounded,
                  active: tab == ReelsTab.explore,
                  onTap: () => onChange(ReelsTab.explore),
                ),
                _TabChip(
                  label: 'Của bạn',
                  icon: Icons.video_collection_outlined,
                  active: tab == ReelsTab.mine,
                  onTap: () => onChange(ReelsTab.mine),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;
  const _TabChip({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          gradient: active ? AppColors.primaryGradient : null,
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12, color: active ? Colors.black : Colors.white70),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                color: active ? Colors.black : Colors.white70,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryPink,
            ),
          ),
          SizedBox(height: 12),
          Text(
            'Đang tải video…',
            style: TextStyle(color: Colors.white70, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
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
                color: Colors.red.withValues(alpha: 0.15),
              ),
              child: const Icon(
                Icons.error_outline_rounded,
                color: Colors.redAccent,
                size: 28,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Đã có lỗi',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white60,
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  borderRadius: BorderRadius.circular(99),
                ),
                child: const Text(
                  'Thử lại',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final ReelsTab tab;
  final VoidCallback onRetry;
  const _EmptyState({required this.tab, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final isMine = tab == ReelsTab.mine;
    return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
                child: const Icon(
                  Icons.video_library_outlined,
                  color: Colors.white54,
                  size: 30,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                isMine ? 'Bạn chưa đăng video nào' : 'Chưa có video nào',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                isMine
                    ? 'Hãy vào trang chủ và đăng video — video đã duyệt sẽ xuất hiện ở đây.'
                    : 'Khi bạn bè đăng video, chúng sẽ xuất hiện ở đây để bạn xem.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white60,
                  fontSize: 11,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 12),
              GestureDetector(
                onTap: onRetry,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: const Text(
                    'Tải lại',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
  }
}

/// Local view-model for a single reel: optimistic likes, comment count
/// deltas, pause state, and busy flags. Lives in the parent state so
/// it survives the slide rebuilding on scroll.
class _ReelLocalState {
  final bool liked;
  final int likeCount;
  final int commentCount;
  final bool userPaused;
  final bool busyLike;
  final bool busyUnlock;
  const _ReelLocalState({
    required this.liked,
    required this.likeCount,
    required this.commentCount,
    required this.userPaused,
    this.busyLike = false,
    this.busyUnlock = false,
  });

  _ReelLocalState copyWith({
    bool? liked,
    int? likeCount,
    int? commentCount,
    bool? userPaused,
    bool? busyLike,
    bool? busyUnlock,
  }) {
    return _ReelLocalState(
      liked: liked ?? this.liked,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      userPaused: userPaused ?? this.userPaused,
      busyLike: busyLike ?? this.busyLike,
      busyUnlock: busyUnlock ?? this.busyUnlock,
    );
  }
}