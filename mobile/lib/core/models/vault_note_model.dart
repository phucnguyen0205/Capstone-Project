import 'package:flutter/foundation.dart';

enum VaultMood { happy, sad, angry, neutral }

extension VaultMoodX on VaultMood {
  String get wire => switch (this) {
        VaultMood.happy => 'happy',
        VaultMood.sad => 'sad',
        VaultMood.angry => 'angry',
        VaultMood.neutral => 'neutral',
      };

  static VaultMood fromWire(String? s) => switch (s) {
        'happy' => VaultMood.happy,
        'sad' => VaultMood.sad,
        'angry' => VaultMood.angry,
        _ => VaultMood.neutral,
      };

  String get label => switch (this) {
        VaultMood.happy => 'Vui',
        VaultMood.sad => 'Buồn',
        VaultMood.angry => 'Giận',
        VaultMood.neutral => 'Bình thường',
      };

  String get emoji => switch (this) {
        VaultMood.happy => '😊',
        VaultMood.sad => '😢',
        VaultMood.angry => '😠',
        VaultMood.neutral => '😐',
      };
}

/// A private diary note (Vault) entry. Not visible to other users.
@immutable
class VaultNoteModel {
  final String id;
  final String userId;
  final String content;
  final VaultMood mood;
  final DateTime createdAt;
  final DateTime? updatedAt;

  const VaultNoteModel({
    required this.id,
    required this.userId,
    required this.content,
    required this.mood,
    required this.createdAt,
    this.updatedAt,
  });

  factory VaultNoteModel.fromJson(Map<String, dynamic> json) {
    return VaultNoteModel(
      id: json['id'] as String,
      userId: (json['user_id'] ?? json['userId']) as String,
      content: json['content'] as String? ?? '',
      mood: VaultMoodX.fromWire(json['mood'] as String?),
      createdAt: _parse(json['created_at'] ?? json['createdAt']) ??
          DateTime.now(),
      updatedAt: _parse(json['updated_at'] ?? json['updatedAt']),
    );
  }

  Map<String, dynamic> toCreateJson() => {
        'content': content,
        'mood': mood.wire,
      };
}

DateTime? _parse(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is num) return DateTime.fromMillisecondsSinceEpoch(v.toInt() * 1000);
  if (v is String) return DateTime.tryParse(v);
  return null;
}
