class DiaryEncounterModel {
  final String id;
  final String userId;
  final String encounteredUserId;
  final DateTime date;
  final String? location;
  final String? note;
  final String status; // 'pending' | 'viewed' | 'dismissed'
  final int closenessPoints;
  final DateTime createdAt;
  
  // Populated fields
  final Map<String, dynamic>? encounteredUser;

  DiaryEncounterModel({
    required this.id,
    required this.userId,
    required this.encounteredUserId,
    required this.date,
    this.location,
    this.note,
    required this.status,
    required this.closenessPoints,
    required this.createdAt,
    this.encounteredUser,
  });

  factory DiaryEncounterModel.fromJson(Map<String, dynamic> json) {
    return DiaryEncounterModel(
      id: json['id'] as String,
      userId: json['userId'] as String,
      encounteredUserId: json['encounteredUserId'] as String,
      date: DateTime.parse(json['date'] as String),
      location: json['location'] as String?,
      note: json['note'] as String?,
      status: json['status'] as String? ?? 'pending',
      closenessPoints: json['closenessPoints'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      encounteredUser: json['encounteredUser'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'encounteredUserId': encounteredUserId,
      'date': date.toIso8601String(),
      if (location != null) 'location': location,
      if (note != null) 'note': note,
      'status': status,
      'closenessPoints': closenessPoints,
      'createdAt': createdAt.toIso8601String(),
      if (encounteredUser != null) 'encounteredUser': encounteredUser,
    };
  }

  bool get isPending => status == 'pending';
  bool get isViewed => status == 'viewed';
  bool get isDismissed => status == 'dismissed';
}

class RadarUserModel {
  final String id;
  final String username;
  final String name;
  final String? avatar;
  final String tier; // 'friend' | 'active' | 'stranger'
  final bool isOnline;
  final DateTime? lastActiveAt;
  final int? closenessPoints;
  final double? distance; // in meters, if available

  RadarUserModel({
    required this.id,
    required this.username,
    required this.name,
    this.avatar,
    required this.tier,
    required this.isOnline,
    this.lastActiveAt,
    this.closenessPoints,
    this.distance,
  });

  factory RadarUserModel.fromJson(Map<String, dynamic> json) {
    return RadarUserModel(
      id: json['id'] as String,
      username: json['username'] as String,
      name: json['name'] as String,
      avatar: json['avatar'] as String?,
      tier: json['tier'] as String? ?? 'stranger',
      isOnline: json['isOnline'] as bool? ?? false,
      lastActiveAt: json['lastActiveAt'] != null
          ? DateTime.parse(json['lastActiveAt'] as String)
          : null,
      closenessPoints: json['closenessPoints'] as int?,
      distance: (json['distance'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'name': name,
      if (avatar != null) 'avatar': avatar,
      'tier': tier,
      'isOnline': isOnline,
      if (lastActiveAt != null) 'lastActiveAt': lastActiveAt!.toIso8601String(),
      if (closenessPoints != null) 'closenessPoints': closenessPoints,
      if (distance != null) 'distance': distance,
    };
  }

  bool get isFriend => tier == 'friend';
  bool get isActive => tier == 'active';
  bool get isStranger => tier == 'stranger';
}
