import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../services/api_extensions/api_extensions.dart';
import 'core_providers.dart';

/// Tab key for the reels surface — mirrors the web client's
/// `DiscoverMainPanel` so the same UI conventions apply on both
/// platforms.
enum ReelsTab { explore, mine }

/// Pulls the "Khám phá" reels feed from `/api/reels/explore` and parses
/// each item into a [ReelItem]. Failures surface as [AsyncValue.error]
/// so the UI can show a retry button instead of a stuck spinner.
final reelsFeedProvider =
    FutureProvider.family<List<ReelItem>, ReelsTab>((ref, tab) async {
  final api = ref.watch(apiServiceProvider);
  final raw = tab == ReelsTab.explore
      ? await api.exploreReels()
      : await api.getMyReels();

  return raw
      .whereType<Map<String, dynamic>>()
      .map(ReelItem.fromJson)
      .where((r) => r.id.isNotEmpty)
      .toList(growable: false);
});

/// Identifier for the viewer (used by the player to decide whether to
/// render the "+ Follow" button and the pending-moderation chip).
final reelsViewerIdProvider = Provider<String?>((ref) {
  // We don't import the auth controller here — the page that owns the
  // player can pass its viewerId directly. This provider exists so
  // future screens can rely on a single source of truth without each
  // re-reading currentUserProvider.
  return null;
});