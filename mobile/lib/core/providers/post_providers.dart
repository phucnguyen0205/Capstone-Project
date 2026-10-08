import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import 'core_providers.dart';

/// Tabbed feed. `tab` ∈ { for-you, following, public, friends }.
final feedProvider = FutureProvider.family<List<PostModel>, String>(
  (ref, tab) async {
    final api = ref.watch(apiServiceProvider);
    final raw = await api.getTabbedFeed(tab);
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PostModel.fromJson)
        .toList();
  },
);

/// Comments for a post.
final postCommentsProvider =
    FutureProvider.family<List<CommentModel>, String>((ref, postId) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getComments(postId);
  return raw
      .whereType<Map<String, dynamic>>()
      .map(CommentModel.fromJson)
      .toList();
});
