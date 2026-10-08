import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import 'core_providers.dart';

/// Discover feed (rule-based) — `/api/discover`.
final discoverProvider = FutureProvider.autoDispose<List<UserModel>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.discoverUsers();
  return raw
      .whereType<Map<String, dynamic>>()
      .map(UserModel.fromJson)
      .toList();
});

/// Groups list — `/api/groups` (friend clusters).
final groupsProvider = FutureProvider<List<GroupModel>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getGroups();
  return raw
      .whereType<Map<String, dynamic>>()
      .map(GroupModel.fromJson)
      .toList();
});

/// Groups feed (friend posts) — `/api/groups/feed`.
final groupsFeedProvider =
    FutureProvider.family<List<PostModel>, String?>((ref, lens) async {
  final api = ref.watch(apiServiceProvider);
  final dynamic raw = await api.getGroupsFeed(lens: lens);
  // The backend can return either:
  //   - a JSON object: { items: [...] } / { posts: [...] }
  //   - a top-level JSON array: [ ... ]
  // Be defensive against both shapes so we never crash on parse.
  List<dynamic> items;
  if (raw is List) {
    items = raw;
  } else if (raw is Map<String, dynamic>) {
    items = (raw['items'] as List?) ??
        (raw['posts'] as List?) ??
        (raw['data'] as List?) ??
        const <dynamic>[];
  } else {
    items = const <dynamic>[];
  }
  return items
      .whereType<Map<String, dynamic>>()
      .map(PostModel.fromJson)
      .toList();
});
