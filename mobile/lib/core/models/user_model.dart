import 'package:flutter/foundation.dart';

/// User account profile. Mirrors the backend `users` table response shape.
///
/// Response shape comes from `GET /api/users/me` and `GET /api/users/[id]`
/// in the Next.js backend (see `src/app/api/users/me/route.ts` and
/// `src/app/api/users/[id]/route.ts`).
///
/// Backend uses **camelCase** JSON keys (`coverPhoto`, `relationshipStatus`)
/// and nests computed data under `stats`, `relationship`, and `presence`.
///
/// Timestamps arrive as Unix **seconds** (integers) — we convert them to
/// [DateTime] only on display.
@immutable
class UserModel {
  final String id;
  final String? email;
  final String username;
  final String name;
  final String? avatar;
  final String? bio;
  final String? coverPhoto;
  final DateTime? birthday;
  final String? location;
  final String? website;
  final String? phone;
  final String? gender;
  final String? occupation;
  final String? education;
  final List<String> hobbies;
  final String? relationshipStatus;
  final String? provider; // 'credentials' | 'google' | 'phone'

  // Presence (from /api/users/[id] → presence)
  final bool isOnline;
  final DateTime? lastActiveAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  // Stats (from /api/users/[id] → stats)
  final int? postsCount;
  final int? friendsCount;
  final int? followersCount;
  final int? followingCount;

  // Relationship (from /api/users/[id] → relationship)
  final bool? isFollowing;
  final bool? isFollower;
  final bool? isFriend;

  // Optional follow request state (from /api/users/[id] → relationship)
  final bool? requestSent;
  final bool? requestReceived;

  const UserModel({
    required this.id,
    this.email,
    required this.username,
    required this.name,
    this.avatar,
    this.bio,
    this.coverPhoto,
    this.birthday,
    this.location,
    this.website,
    this.phone,
    this.gender,
    this.occupation,
    this.education,
    this.hobbies = const [],
    this.relationshipStatus,
    this.provider,
    this.isOnline = false,
    this.lastActiveAt,
    this.createdAt,
    this.updatedAt,
    this.postsCount,
    this.friendsCount,
    this.followersCount,
    this.followingCount,
    this.isFollowing,
    this.isFollower,
    this.isFriend,
    this.requestSent,
    this.requestReceived,
  });

  /// Parse backend JSON. Accepts the canonical shape (camelCase + nested
  /// `stats`/`relationship`/`presence`) AND legacy flat shape from older
  /// mobile endpoints so existing cached data keeps working.
  ///
  /// Defensive: missing required fields fall back to safe defaults rather
  /// than throwing — this matters because some endpoints send partial
  /// `author` blocks (e.g. comments embed only username/name/avatar) and
  /// we don't want a single bad row to wipe the whole feed/comment list.
  factory UserModel.fromJson(Map<String, dynamic> json) {
    // Stats block — backend nests under `stats`; mobile may also see flat
    // keys (`postsCount`, `friendsCount`, ...) from older endpoints.
    final stats = json['stats'] is Map<String, dynamic>
        ? json['stats'] as Map<String, dynamic>
        : const <String, dynamic>{};

    // Relationship block — nested `relationship` (or flat legacy).
    final rel = json['relationship'] is Map<String, dynamic>
        ? json['relationship'] as Map<String, dynamic>
        : const <String, dynamic>{};

    // Presence block — nested `presence` (or flat `is_online`).
    final presence = json['presence'] is Map<String, dynamic>
        ? json['presence'] as Map<String, dynamic>
        : const <String, dynamic>{};

    final id = (json['id'] ?? json['userId'] ?? json['user_id'])?.toString() ??
        '';
    final username =
        (json['username'] as String?)?.trim() ?? '';
    final name = (json['name'] as String?)?.trim() ??
        (json['displayName'] as String?)?.trim() ??
        username;

    return UserModel(
      id: id,
      email: json['email'] as String?,
      username: username,
      // Never expose raw `c_xxxx` IDs as a display name — fall back to
      // username (with leading @) when both `name` and `displayName` are
      // empty.
      name: name.isEmpty ? '@$username' : name,
      avatar: json['avatar'] as String? ?? json['image'] as String?,
      bio: json['bio'] as String?,
      coverPhoto: json['coverPhoto'] as String? ?? json['cover_photo'] as String?,
      birthday: _parseDate(json['birthday']),
      location: json['location'] as String?,
      website: json['website'] as String?,
      phone: json['phone'] as String?,
      gender: json['gender'] as String?,
      occupation: json['occupation'] as String?,
      education: json['education'] as String?,
      hobbies: _parseHobbies(json['hobbies']),
      relationshipStatus: json['relationshipStatus'] as String? ??
          json['relationship_status'] as String?,
      provider: json['provider'] as String?,
      // Presence: prefer `presence.isOnline`, fall back to flat `isOnline` /
      // `is_online` for legacy.
      isOnline: presence['isOnline'] as bool? ??
          _bool(json['isOnline']) ??
          _bool(json['is_online']) ??
          false,
      lastActiveAt: _parseDate(presence['lastActiveAt']) ??
          _parseDate(json['lastActiveAt']) ??
          _parseDate(json['last_active_at']),
      createdAt: _parseDate(json['createdAt']) ??
          _parseDate(json['created_at']),
      updatedAt: _parseDate(json['updatedAt']) ??
          _parseDate(json['updated_at']),

      // Stats
      postsCount: (stats['postCount'] as num?)?.toInt() ??
          (json['postsCount'] as num?)?.toInt() ??
          (json['posts_count'] as num?)?.toInt(),
      friendsCount: (stats['friendCount'] as num?)?.toInt() ??
          (stats['friendsCount'] as num?)?.toInt() ??
          (json['friendsCount'] as num?)?.toInt() ??
          (json['friends_count'] as num?)?.toInt(),
      followersCount: (stats['followersCount'] as num?)?.toInt() ??
          (json['followersCount'] as num?)?.toInt() ??
          (json['followers_count'] as num?)?.toInt(),
      followingCount: (stats['followingCount'] as num?)?.toInt() ??
          (json['followingCount'] as num?)?.toInt() ??
          (json['following_count'] as num?)?.toInt(),

      // Relationship
      isFollowing: rel['isFollowing'] as bool? ?? json['isFollowing'] as bool? ?? json['is_following'] as bool?,
      isFollower: rel['isFollower'] as bool? ?? json['isFollower'] as bool? ?? json['is_follower'] as bool?,
      isFriend: rel['isFriend'] as bool? ?? json['isFriend'] as bool? ?? json['is_friend'] as bool?,
      requestSent: rel['requestSent'] as bool?,
      requestReceived: rel['requestReceived'] as bool?,
    );
  }

  /// Serialize for `PATCH /api/users/me`. The backend expects these exact
  /// field names — see `src/app/api/users/[id]/route.ts` PATCH handler.
  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'name': name,
        if (avatar != null) 'avatar': avatar,
        if (bio != null) 'bio': bio,
        if (coverPhoto != null) 'coverPhoto': coverPhoto,
        if (birthday != null) 'birthday': birthday!.millisecondsSinceEpoch ~/ 1000,
        if (location != null) 'location': location,
        if (website != null) 'website': website,
        if (phone != null) 'phone': phone,
        if (gender != null) 'gender': gender,
        if (occupation != null) 'occupation': occupation,
        if (education != null) 'education': education,
        // Backend stores hobbies as comma-separated TEXT, not JSON.
        if (hobbies.isNotEmpty) 'hobbies': hobbies.join(','),
        if (relationshipStatus != null) 'relationshipStatus': relationshipStatus,
      };

  UserModel copyWith({
    String? id,
    String? email,
    String? username,
    String? name,
    String? avatar,
    String? bio,
    String? coverPhoto,
    DateTime? birthday,
    String? location,
    String? website,
    String? phone,
    String? gender,
    String? occupation,
    String? education,
    List<String>? hobbies,
    String? relationshipStatus,
    bool? isOnline,
    DateTime? lastActiveAt,
    int? postsCount,
    int? friendsCount,
    int? followersCount,
    int? followingCount,
    bool? isFollowing,
    bool? isFollower,
    bool? isFriend,
    bool? requestSent,
    bool? requestReceived,
  }) =>
      UserModel(
        id: id ?? this.id,
        email: email ?? this.email,
        username: username ?? this.username,
        name: name ?? this.name,
        avatar: avatar ?? this.avatar,
        bio: bio ?? this.bio,
        coverPhoto: coverPhoto ?? this.coverPhoto,
        birthday: birthday ?? this.birthday,
        location: location ?? this.location,
        website: website ?? this.website,
        phone: phone ?? this.phone,
        gender: gender ?? this.gender,
        occupation: occupation ?? this.occupation,
        education: education ?? this.education,
        hobbies: hobbies ?? this.hobbies,
        relationshipStatus: relationshipStatus ?? this.relationshipStatus,
        provider: provider,
        isOnline: isOnline ?? this.isOnline,
        lastActiveAt: lastActiveAt ?? this.lastActiveAt,
        createdAt: createdAt,
        updatedAt: updatedAt,
        postsCount: postsCount ?? this.postsCount,
        friendsCount: friendsCount ?? this.friendsCount,
        followersCount: followersCount ?? this.followersCount,
        followingCount: followingCount ?? this.followingCount,
        isFollowing: isFollowing ?? this.isFollowing,
        isFollower: isFollower ?? this.isFollower,
        isFriend: isFriend ?? this.isFriend,
        requestSent: requestSent ?? this.requestSent,
        requestReceived: requestReceived ?? this.requestReceived,
      );
}

bool? _bool(dynamic v) {
  if (v == null) return null;
  if (v is bool) return v;
  if (v is num) return v != 0;
  if (v is String) {
    final s = v.toLowerCase();
    if (s == '1' || s == 'true') return true;
    if (s == '0' || s == 'false') return false;
  }
  return null;
}

/// Backend stores `hobbies` as a **comma-separated string** (TEXT column,
/// see `schema.ts`). Older endpoints may also send a JSON array.
List<String> _parseHobbies(dynamic v) {
  if (v == null) return const [];
  if (v is List) {
    return v.whereType<String>().map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
  }
  if (v is String) {
    final s = v.trim();
    if (s.isEmpty) return const [];
    // Heuristic: if the string starts with `[` try JSON first.
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        // Avoid pulling dart:convert into this file just for hobbies —
        // strip brackets and split.
        final inner = s.substring(1, s.length - 1);
        return inner
            .split(',')
            .map((e) => e.trim().replaceAll('"', '').replaceAll("'", ''))
            .where((e) => e.isNotEmpty)
            .toList();
      } catch (_) {
        // fall through to comma split
      }
    }
    return s
        .split(',')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
  }
  return const [];
}

DateTime? _parseDate(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is num) {
    // Backend always uses Unix **seconds**. A 13-digit value would be ms —
    // detect & handle both so cached legacy values still parse.
    final n = v.toInt();
    if (n > 100000000000) {
      return DateTime.fromMillisecondsSinceEpoch(n);
    }
    return DateTime.fromMillisecondsSinceEpoch(n * 1000);
  }
  if (v is String) {
    // Try numeric-string first.
    final asNum = num.tryParse(v);
    if (asNum != null) return _parseDate(asNum);
    return DateTime.tryParse(v);
  }
  return null;
}
