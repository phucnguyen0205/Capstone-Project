class FriendRequestModel {
  final String id;
  final String senderId;
  final String receiverId;
  final String status; // 'pending' | 'accepted' | 'rejected' | 'cancelled'
  final DateTime createdAt;
  final DateTime? respondedAt;
  
  // Populated fields
  final Map<String, dynamic>? sender;
  final Map<String, dynamic>? receiver;

  FriendRequestModel({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.status,
    required this.createdAt,
    this.respondedAt,
    this.sender,
    this.receiver,
  });

  factory FriendRequestModel.fromJson(Map<String, dynamic> json) {
    return FriendRequestModel(
      id: json['id'] as String,
      senderId: json['senderId'] as String,
      receiverId: json['receiverId'] as String,
      status: json['status'] as String? ?? 'pending',
      createdAt: DateTime.parse(json['createdAt'] as String),
      respondedAt: json['respondedAt'] != null
          ? DateTime.parse(json['respondedAt'] as String)
          : null,
      sender: json['sender'] as Map<String, dynamic>?,
      receiver: json['receiver'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'senderId': senderId,
      'receiverId': receiverId,
      'status': status,
      'createdAt': createdAt.toIso8601String(),
      if (respondedAt != null) 'respondedAt': respondedAt!.toIso8601String(),
      if (sender != null) 'sender': sender,
      if (receiver != null) 'receiver': receiver,
    };
  }

  bool get isPending => status == 'pending';
  bool get isAccepted => status == 'accepted';
  bool get isRejected => status == 'rejected';
  bool get isCancelled => status == 'cancelled';
}

class ClosenessInfoModel {
  final String userId;
  final String friendId;
  final int points;
  final String tier; // 'new' | 'friend' | 'close' | 'family'
  final DateTime lastInteractionAt;
  final Map<String, int>? signalBreakdown; // e.g., {'messages': 100, 'calls': 50}
  
  // Populated fields
  final Map<String, dynamic>? friend;

  ClosenessInfoModel({
    required this.userId,
    required this.friendId,
    required this.points,
    required this.tier,
    required this.lastInteractionAt,
    this.signalBreakdown,
    this.friend,
  });

  factory ClosenessInfoModel.fromJson(Map<String, dynamic> json) {
    return ClosenessInfoModel(
      userId: json['userId'] as String,
      friendId: json['friendId'] as String,
      points: json['points'] as int? ?? 0,
      tier: json['tier'] as String? ?? 'new',
      lastInteractionAt: DateTime.parse(json['lastInteractionAt'] as String),
      signalBreakdown: json['signalBreakdown'] != null
          ? Map<String, int>.from(json['signalBreakdown'] as Map)
          : null,
      friend: json['friend'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userId': userId,
      'friendId': friendId,
      'points': points,
      'tier': tier,
      'lastInteractionAt': lastInteractionAt.toIso8601String(),
      if (signalBreakdown != null) 'signalBreakdown': signalBreakdown,
      if (friend != null) 'friend': friend,
    };
  }

  bool get isNew => tier == 'new';
  bool get isFriend => tier == 'friend';
  bool get isClose => tier == 'close';
  bool get isFamily => tier == 'family';
}

class VisibilityRowModel {
  final String id;
  final String noteId;
  final String userId;
  final String state; // 'allow' | 'deny'
  final String? moodFilter; // 'happy' | 'sad' | 'angry' | 'neutral'
  final DateTime createdAt;
  
  // Populated fields
  final Map<String, dynamic>? user;

  VisibilityRowModel({
    required this.id,
    required this.noteId,
    required this.userId,
    required this.state,
    this.moodFilter,
    required this.createdAt,
    this.user,
  });

  factory VisibilityRowModel.fromJson(Map<String, dynamic> json) {
    return VisibilityRowModel(
      id: json['id'] as String,
      noteId: json['noteId'] as String,
      userId: json['userId'] as String,
      state: json['state'] as String,
      moodFilter: json['moodFilter'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      user: json['user'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'noteId': noteId,
      'userId': userId,
      'state': state,
      if (moodFilter != null) 'moodFilter': moodFilter,
      'createdAt': createdAt.toIso8601String(),
      if (user != null) 'user': user,
    };
  }

  bool get isAllow => state == 'allow';
  bool get isDeny => state == 'deny';
  bool get hasMoodFilter => moodFilter != null;
}
