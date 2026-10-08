import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import 'core_providers.dart';

/// Loads the full profile of the currently logged-in user.
///
/// The mobile app needs stats (postCount/friendCount/followersCount/
/// followingCount), relationship, and presence — but the bare
/// `/api/users/me` endpoint only returns the editable profile fields.
///
/// Strategy:
///   1. Call `/api/users/me` for the canonical profile fields.
///   2. If it has an `id`, also call `/api/users/[id]` and merge the
///      `stats`/`relationship`/`presence` blocks in.
///   3. If the second call fails, fall back to the bare profile.
final meProvider = FutureProvider<UserModel>((ref) async {
  final api = ref.watch(apiServiceProvider);

  final basic = await api.getMe();
  final basicUser = UserModel.fromJson(basic);

  final id = basicUser.id;
  if (id.isEmpty) return basicUser;

  try {
    final full = await api.getUserById(id);
    final fullUser = UserModel.fromJson(full);
    // Re-create with stats/relationship/presence from the full endpoint
    // while preserving editable fields from the bare endpoint (in case
    // they ever drift).
    return basicUser.copyWith(
      postsCount: fullUser.postsCount,
      friendsCount: fullUser.friendsCount,
      followersCount: fullUser.followersCount,
      followingCount: fullUser.followingCount,
      isFollowing: fullUser.isFollowing,
      isFollower: fullUser.isFollower,
      isFriend: fullUser.isFriend,
      isOnline: fullUser.isOnline,
      lastActiveAt: fullUser.lastActiveAt,
      requestSent: fullUser.requestSent,
      requestReceived: fullUser.requestReceived,
    );
  } catch (_) {
    // Stats endpoint is non-critical — fall back to the bare profile.
    return basicUser;
  }
});

/// Loads a user by id or username: `GET /api/users/:id`.
/// `family` lets us cache per-id.
final userByIdProvider =
    FutureProvider.family<UserModel, String>((ref, idOrUsername) async {
  final api = ref.watch(apiServiceProvider);
  final data = await api.getUserById(idOrUsername);
  return UserModel.fromJson(data);
});

/// Friends list of a given user. `list` selects the type.
final userFriendsProvider = FutureProvider.family<
    List<UserModel>,
    ({String userId, String list})>((ref, args) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getUserFriends(args.userId, list: args.list);
  return raw
      .whereType<Map<String, dynamic>>()
      .map(UserModel.fromJson)
      .toList();
});

/// User search results.
final userSearchProvider =
    FutureProvider.family<List<UserModel>, String>((ref, query) async {
  if (query.trim().isEmpty) return const [];
  final api = ref.watch(apiServiceProvider);
  final raw = await api.searchUsers(query.trim());
  return raw
      .whereType<Map<String, dynamic>>()
      .map(UserModel.fromJson)
      .toList();
});

/// Posts authored by a user.
final userPostsProvider =
    FutureProvider.family<List<PostModel>, String>((ref, userId) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getUserPosts(userId);
  return raw
      .whereType<Map<String, dynamic>>()
      .map(PostModel.fromJson)
      .toList();
});
