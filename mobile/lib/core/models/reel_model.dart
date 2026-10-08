class ReelModel {
  final String id;
  final String userId;
  final String videoUrl;
  final String? thumbnailUrl;
  final String? caption;
  final String lens; // 'public' | 'friends' | 'close'
  final int unlockPoints; // closeness points required
  final int viewCount;
  final int likeCount;
  final int commentCount;
  final DateTime createdAt;
  
  // Populated fields
  final Map<String, dynamic>? user;
  final bool? isLiked;
  final bool? unlocked; // whether current user can view
  final int? closenessPoints; // current user's closeness with author

  ReelModel({
    required this.id,
    required this.userId,
    required this.videoUrl,
    this.thumbnailUrl,
    this.caption,
    required this.lens,
    required this.unlockPoints,
    required this.viewCount,
    required this.likeCount,
    required this.commentCount,
    required this.createdAt,
    this.user,
    this.isLiked,
    this.unlocked,
    this.closenessPoints,
  });

  factory ReelModel.fromJson(Map<String, dynamic> json) {
    return ReelModel(
      id: json['id'] as String,
      userId: json['userId'] as String,
      videoUrl: json['videoUrl'] as String,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      caption: json['caption'] as String?,
      lens: json['lens'] as String? ?? 'public',
      unlockPoints: json['unlockPoints'] as int? ?? 0,
      viewCount: json['viewCount'] as int? ?? 0,
      likeCount: json['likeCount'] as int? ?? 0,
      commentCount: json['commentCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      user: json['user'] as Map<String, dynamic>?,
      isLiked: json['isLiked'] as bool?,
      unlocked: json['unlocked'] as bool?,
      closenessPoints: json['closenessPoints'] as int?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'videoUrl': videoUrl,
      if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
      if (caption != null) 'caption': caption,
      'lens': lens,
      'unlockPoints': unlockPoints,
      'viewCount': viewCount,
      'likeCount': likeCount,
      'commentCount': commentCount,
      'createdAt': createdAt.toIso8601String(),
      if (user != null) 'user': user,
      if (isLiked != null) 'isLiked': isLiked,
      if (unlocked != null) 'unlocked': unlocked,
      if (closenessPoints != null) 'closenessPoints': closenessPoints,
    };
  }

  bool get canView => unlocked == true || lens == 'public';
  bool get needsUnlock => !canView && (closenessPoints ?? 0) < unlockPoints;
}
