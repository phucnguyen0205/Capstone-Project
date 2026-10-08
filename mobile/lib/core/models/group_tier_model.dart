import 'package:flutter/foundation.dart';

/// Tier/level info for the groups feed. Matches `/api/groups/tiers`.
enum GroupLens { public, friends, close, private, all }

extension GroupLensX on GroupLens {
  String get wire => switch (this) {
        GroupLens.public => 'public',
        GroupLens.friends => 'friends',
        GroupLens.close => 'close',
        GroupLens.private => 'private',
        GroupLens.all => 'all',
      };

  String get label => switch (this) {
        GroupLens.public => 'Công khai',
        GroupLens.friends => 'Bè bạn',
        GroupLens.close => 'Thân thiết',
        GroupLens.private => 'Riêng tư',
        GroupLens.all => 'Tất cả',
      };

  static GroupLens fromWire(String? s) => switch (s) {
        'public' => GroupLens.public,
        'friends' => GroupLens.friends,
        'close' => GroupLens.close,
        'private' => GroupLens.private,
        _ => GroupLens.all,
      };
}

@immutable
class GroupTierModel {
  final GroupLens key;
  final String label;
  final int count;

  const GroupTierModel({
    required this.key,
    required this.label,
    required this.count,
  });

  factory GroupTierModel.fromJson(Map<String, dynamic> json) {
    return GroupTierModel(
      key: GroupLensX.fromWire(json['key'] as String?),
      label: json['label'] as String? ?? '',
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Single tier metadata used by the left sidebar.
@immutable
class GroupTierInfo {
  final String key;
  final String label;
  final int count;

  const GroupTierInfo({
    required this.key,
    required this.label,
    required this.count,
  });

  factory GroupTierInfo.fromJson(Map<String, dynamic> json) {
    return GroupTierInfo(
      key: json['key'] as String? ?? 'all',
      label: json['label'] as String? ?? '',
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }
}
