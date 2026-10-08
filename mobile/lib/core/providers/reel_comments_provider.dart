import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/api_constants.dart';
import '../models/models.dart';
import '../services/api_extensions/api_extensions.dart';
import '../services/api_service.dart';
import 'core_providers.dart';

/// Loads the comments for a given reel/post. Reels use the same
/// `comments` table as regular posts so we hit
/// `/api/posts/[id]/comments` directly — the dedicated `reels/[id]/comments`
/// path doesn't exist on the backend.
///
/// We bypass the existing `getPostCommentsPage` helper because that
/// returns a `{ items, page, hasMore, total }` wrapper (designed for
/// paginated feeds). The reels panel needs a flat list to filter
/// top-level vs replies, and the existing endpoint already returns a flat
/// array — calling it without the `?page=` param gives us that.
final reelCommentsProvider =
    FutureProvider.family<List<ReelComment>, String>((ref, postId) async {
  final api = ref.watch(apiServiceProvider);
  final uri = Uri.parse('${api.baseUrl}/posts/$postId/comments');
  // Use the raw http.Client to call without the `?page=` parameter.
  final response = await api.client.get(uri, headers: api.headers).timeout(
        ApiConstants.connectionTimeout,
      );
  if (response.statusCode == 200) {
    final decoded = json.decode(response.body);
    if (decoded is List) {
      return decoded
          .whereType<Map<String, dynamic>>()
          .map(ReelComment.fromJson)
          .toList(growable: false);
    }
    // Some endpoints may wrap with `{ items: [...] }` — accept both.
    if (decoded is Map<String, dynamic> && decoded['items'] is List) {
      return (decoded['items'] as List)
          .whereType<Map<String, dynamic>>()
          .map(ReelComment.fromJson)
          .toList(growable: false);
    }
  }
  throw ApiException(
    'Không thể tải bình luận',
    response.statusCode,
  );
});