import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/group_activity_model.dart';
import '../models/group_member_model.dart';
import '../models/group_tier_model.dart';
import '../models/post_model.dart';
import 'core_providers.dart';

/// Current lens filter for the groups feed. Defaults to all.
final groupLensFilterProvider =
    StateProvider<GroupLens>((ref) => GroupLens.all);

/// Posts for the current lens filter. Refreshes on refreshSignal change.
class GroupsFeedKey {
  final GroupLens lens;
  final int refreshSignal;
  const GroupsFeedKey(this.lens, this.refreshSignal);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is GroupsFeedKey &&
          other.lens == lens &&
          other.refreshSignal == refreshSignal);
  @override
  int get hashCode => Object.hash(lens, refreshSignal);
}

final groupsFeedProvider = FutureProvider.autoDispose
    .family<List<PostModel>, GroupsFeedKey>((ref, key) async {
  final api = ref.watch(apiServiceProvider);
  final lens = key.lens == GroupLens.all ? null : key.lens.wire;
  try {
    final dynamic raw = await api.getGroupsFeed(lens: lens, limit: 30, offset: 0);
    // Backend may return `{posts:[..]}`, `{items:[..]}` or a top-level
    // JSON array. Handle all three shapes so we never crash on parse.
    final List<dynamic> list;
    if (raw is List) {
      list = raw;
    } else if (raw is Map<String, dynamic>) {
      list = raw['posts'] is List
          ? raw['posts'] as List
          : raw['items'] is List
              ? raw['items'] as List
              : raw['data'] is List
                  ? raw['data'] as List
                  : const <dynamic>[];
    } else {
      list = const <dynamic>[];
    }
    return list
        .whereType<Map<String, dynamic>>()
        .map(PostModel.fromJson)
        .toList();
  } catch (e) {
    if (kDebugMode) debugPrint('[groupsFeedProvider] $e');
    return const [];
  }
});

/// Tiers list + recent gallery (from `/api/groups/tiers`).
final groupTiersProvider =
    FutureProvider.autoDispose<({List<GroupTierInfo> tiers, int total, List<RecentGalleryItem> recent})>((ref) async {
  final api = ref.watch(apiServiceProvider);
  try {
    final raw = await api.getGroupTiers();
    final tiersRaw = raw['tiers'] is List ? raw['tiers'] as List : const [];
    final tiers = tiersRaw
        .whereType<Map<String, dynamic>>()
        .map(GroupTierInfo.fromJson)
        .toList();
    final total = (raw['total'] as num?)?.toInt() ??
        tiers.fold<int>(0, (s, t) => s + t.count);
    final recentRaw =
        raw['recent'] is List ? raw['recent'] as List : const [];
    final recent = recentRaw
        .whereType<Map<String, dynamic>>()
        .map(RecentGalleryItem.fromJson)
        .toList();
    return (tiers: tiers, total: total, recent: recent);
  } catch (e) {
    if (kDebugMode) debugPrint('[groupTiersProvider] $e');
    return (tiers: <GroupTierInfo>[], total: 0, recent: <RecentGalleryItem>[]);
  }
});

/// Item in the right-sidebar gallery grid.
@immutable
class RecentGalleryItem {
  final String id;
  final String mediaUrl;
  final String mediaType; // 'image' | 'video'
  final String lens; // 'public' | 'friends' | 'close' | 'private'
  final int createdAt;
  final String? caption;
  const RecentGalleryItem({
    required this.id,
    required this.mediaUrl,
    required this.mediaType,
    required this.lens,
    required this.createdAt,
    this.caption,
  });

  bool get isPrivate => lens == 'private';
  bool get isClose => lens == 'close';

  factory RecentGalleryItem.fromJson(Map<String, dynamic> json) {
    final ts = (json['createdAt'] ?? json['created_at']) as num?;
    return RecentGalleryItem(
      id: json['id'] as String? ?? '',
      mediaUrl: (json['mediaUrl'] ?? json['media_url']) as String? ?? '',
      mediaType: (json['mediaType'] ?? json['media_type']) as String? ?? 'image',
      lens: json['lens'] as String? ?? 'public',
      createdAt: ts?.toInt() ?? 0,
      caption: json['caption'] as String?,
    );
  }
}

/// Members list (left sidebar). kind='all' or 'recent'.
final groupMembersProvider = FutureProvider.autoDispose
    .family<List<GroupMemberModel>, String>((ref, kind) async {
  final api = ref.watch(apiServiceProvider);
  try {
    final raw = await api.getGroupMembers(limit: kind == 'recent' ? 8 : 100, kind: kind);
    return raw
        .whereType<Map<String, dynamic>>()
        .map(GroupMemberModel.fromJson)
        .toList();
  } catch (e) {
    if (kDebugMode) debugPrint('[groupMembersProvider] $e');
    return const [];
  }
});

/// Recent activity (right sidebar).
final groupActivityProvider =
    FutureProvider.autoDispose<List<GroupActivityModel>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  try {
    final raw = await api.getGroupsActivity();
    return raw
        .whereType<Map<String, dynamic>>()
        .map(GroupActivityModel.fromJson)
        .toList();
  } catch (e) {
    if (kDebugMode) debugPrint('[groupActivityProvider] $e');
    return const [];
  }
});

/// "Invisible Mirror" toggle (persisted locally).
final invisibleMirrorEnabledProvider =
    StateProvider<bool>((ref) => true);
