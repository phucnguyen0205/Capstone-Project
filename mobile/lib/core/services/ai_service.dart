import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../constants/api_constants.dart';

/// AI Service for content moderation and user ranking
/// Uses Google Gemini AI through the web API
class AIService {
  final String baseUrl;
  final http.Client _client;
  String? _authToken;
  
  AIService({String? baseUrl}) 
      : baseUrl = baseUrl ?? AppConfig.apiBaseUrl,
        _client = http.Client();

  void setAuthToken(String? token) {
    _authToken = token;
  }

  Map<String, String> get _headers {
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_authToken != null) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  // ============ CONTENT MODERATION ============
  
  /// Moderation result from AI
  Future<ModerationResult> moderateContent(String caption, {String? imageUrl}) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/ai/moderate'),
        headers: _headers,
        body: json.encode({
          'caption': caption,
          'imageUrl': imageUrl,
        }),
      ).timeout(ApiConstants.connectionTimeout);

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return ModerationResult.fromJson(data);
      }
      throw AIException('Moderation failed', response.statusCode);
    } catch (e) {
      if (e is AIException) rethrow;
      // Return safe by default on error
      return ModerationResult(
        passed: true,
        ruleScore: 100,
        geminiFlagged: false,
        geminiScore: 100,
        method: 'rule',
      );
    }
  }

  /// Quick check if content is safe (returns bool)
  Future<bool> isContentSafe(String caption) async {
    try {
      final result = await moderateContent(caption);
      return result.passed;
    } catch (e) {
      return true; // Default to safe on error
    }
  }

  // ============ USER RANKING / DISCOVERY ============
  
  /// Get ranked users for discovery (Tinder-style)
  /// Returns users sorted by AI-computed compatibility score
  Future<List<UserRanking>> discoverUsers({String? search}) async {
    try {
      var url = '$baseUrl/discover';
      if (search != null && search.isNotEmpty) {
        url += '?search=${Uri.encodeComponent(search)}';
      }
      
      final response = await _client.get(
        Uri.parse(url),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((json) => UserRanking.fromJson(json)).toList();
      }
      throw AIException('Discovery failed', response.statusCode);
    } catch (e) {
      if (e is AIException) rethrow;
      throw AIException('Discovery error: $e');
    }
  }

  /// Get top matches (users with highest compatibility)
  Future<List<UserRanking>> getTopMatches({int limit = 10}) async {
    try {
      final users = await discoverUsers();
      users.sort((a, b) => b.compatibilityScore.compareTo(a.compatibilityScore));
      return users.take(limit).toList();
    } catch (e) {
      debugPrint('Get top matches error: $e');
      return [];
    }
  }

  // ============ SWIPE MATCHING ============
  
  /// Record a swipe interaction (like/pass/superlike)
  Future<void> recordSwipe(String targetUserId, SwipeAction action) async {
    try {
      final actionStr = action == SwipeAction.superLike ? 'superlike' : action.name;
      await _client.post(
        Uri.parse('$baseUrl/interactions'),
        headers: _headers,
        body: json.encode({
          'targetId': targetUserId,
          'type': actionStr,
        }),
      ).timeout(ApiConstants.connectionTimeout);
    } catch (e) {
      debugPrint('Record swipe error: $e');
    }
  }

  void dispose() {
    _client.close();
  }
}

// ============ DATA MODELS ============

enum SwipeAction { like, pass, superLike }

class ModerationResult {
  final bool passed;
  final String? reason;
  final int ruleScore;
  final bool geminiFlagged;
  final int geminiScore;
  final String method;
  final ModerationCategories? categories;
  final ModerationBreakdown? breakdown;

  ModerationResult({
    required this.passed,
    this.reason,
    required this.ruleScore,
    required this.geminiFlagged,
    required this.geminiScore,
    required this.method,
    this.categories,
    this.breakdown,
  });

  factory ModerationResult.fromJson(Map<String, dynamic> json) {
    return ModerationResult(
      passed: json['passed'] as bool? ?? true,
      reason: json['reason'] as String?,
      ruleScore: json['ruleScore'] as int? ?? 100,
      geminiFlagged: json['geminiFlagged'] as bool? ?? false,
      geminiScore: json['geminiScore'] as int? ?? 100,
      method: json['method'] as String? ?? 'rule',
      categories: json['categories'] != null 
          ? ModerationCategories.fromJson(json['categories'])
          : null,
      breakdown: json['breakdown'] != null 
          ? ModerationBreakdown.fromJson(json['breakdown'])
          : null,
    );
  }

  String get statusLabel => passed ? 'Được phép' : 'Bị từ chối';
  String get statusEmoji => passed ? '✅' : '❌';
}

class ModerationCategories {
  final bool hate;
  final bool harassment;
  final bool violence;
  final bool sexual;
  final bool selfHarm;
  final bool political;
  final bool dangerous;

  ModerationCategories({
    this.hate = false,
    this.harassment = false,
    this.violence = false,
    this.sexual = false,
    this.selfHarm = false,
    this.political = false,
    this.dangerous = false,
  });

  factory ModerationCategories.fromJson(Map<String, dynamic> json) {
    return ModerationCategories(
      hate: json['hate'] as bool? ?? false,
      harassment: json['harassment'] as bool? ?? false,
      violence: json['violence'] as bool? ?? false,
      sexual: json['sexual'] as bool? ?? false,
      selfHarm: json['selfHarm'] as bool? ?? false,
      political: json['political'] as bool? ?? false,
      dangerous: json['dangerous'] as bool? ?? false,
    );
  }

  List<String> get flaggedCategories {
    final flags = <String>[];
    if (hate) flags.add('Hate speech');
    if (harassment) flags.add('Harassment');
    if (violence) flags.add('Violence');
    if (sexual) flags.add('Sexual content');
    if (selfHarm) flags.add('Self-harm');
    if (political) flags.add('Political');
    if (dangerous) flags.add('Dangerous content');
    return flags;
  }
}

class ModerationBreakdown {
  final RuleBasedBreakdown? ruleBased;
  final GeminiBreakdown? gemini;

  ModerationBreakdown({this.ruleBased, this.gemini});

  factory ModerationBreakdown.fromJson(Map<String, dynamic> json) {
    return ModerationBreakdown(
      ruleBased: json['ruleBased'] != null 
          ? RuleBasedBreakdown.fromJson(json['ruleBased'])
          : null,
      gemini: json['gemini'] != null 
          ? GeminiBreakdown.fromJson(json['gemini'])
          : null,
    );
  }
}

class RuleBasedBreakdown {
  final int score;
  final bool passed;

  RuleBasedBreakdown({required this.score, required this.passed});

  factory RuleBasedBreakdown.fromJson(Map<String, dynamic> json) {
    return RuleBasedBreakdown(
      score: json['score'] as int? ?? 100,
      passed: json['passed'] as bool? ?? true,
    );
  }
}

class GeminiBreakdown {
  final bool flagged;
  final int score;

  GeminiBreakdown({required this.flagged, required this.score});

  factory GeminiBreakdown.fromJson(Map<String, dynamic> json) {
    return GeminiBreakdown(
      flagged: json['flagged'] as bool? ?? false,
      score: json['score'] as int? ?? 100,
    );
  }
}

class UserRanking {
  final String id;
  final String name;
  final String username;
  final String? avatar;
  final String? bio;
  final int age;
  final double compatibilityScore;
  final String compatibilityTier;
  final CompatibilityBreakdown? breakdown;
  final List<String> compatibilityReasons;
  final String? distance;
  final bool online;
  final int? presenceCode;
  final String? presenceLabel;
  final int mutualFriends;
  final List<String>? hobbies;
  final String? occupation;
  final String aiMethod;

  UserRanking({
    required this.id,
    required this.name,
    required this.username,
    this.avatar,
    this.bio,
    required this.age,
    required this.compatibilityScore,
    required this.compatibilityTier,
    this.breakdown,
    required this.compatibilityReasons,
    this.distance,
    this.online = false,
    this.presenceCode,
    this.presenceLabel,
    this.mutualFriends = 0,
    this.hobbies,
    this.occupation,
    this.aiMethod = 'rule',
  });

  factory UserRanking.fromJson(Map<String, dynamic> json) {
    return UserRanking(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? json['username'] as String? ?? 'User',
      username: json['username'] as String? ?? '',
      avatar: json['avatar'] as String?,
      bio: json['bio'] as String?,
      age: json['age'] as int? ?? 22,
      compatibilityScore: (json['compatibility'] as num?)?.toDouble() ?? 
                        (json['compatibilityScore'] as num?)?.toDouble() ?? 50.0,
      compatibilityTier: json['compatibilityTier'] as String? ?? 'medium',
      breakdown: json['compatibilityBreakdown'] != null 
          ? CompatibilityBreakdown.fromJson(json['compatibilityBreakdown'])
          : null,
      compatibilityReasons: (json['compatibilityReasons'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList() ?? [],
      distance: json['distance'] as String?,
      online: json['online'] as bool? ?? false,
      presenceCode: json['presenceCode'] as int?,
      presenceLabel: json['presenceLabel'] as String?,
      mutualFriends: json['mutualFriends'] as int? ?? 0,
      hobbies: (json['hobbies'] as String?)?.split(',').map((e) => e.trim()).toList(),
      occupation: json['occupation'] as String?,
      aiMethod: json['aiMethod'] as String? ?? 'rule',
    );
  }

  String get tierEmoji {
    switch (compatibilityTier) {
      case 'super': return '🔥';
      case 'high': return '⭐';
      case 'medium': return '💫';
      default: return '✨';
    }
  }

  String get tierLabel {
    switch (compatibilityTier) {
      case 'super': return 'Siêu phù hợp';
      case 'high': return 'Phù hợp cao';
      case 'medium': return 'Khá phù hợp';
      default: return 'Có thể phù hợp';
    }
  }

  bool get hasProfile => avatar != null || (bio != null && bio!.isNotEmpty);
}

class CompatibilityBreakdown {
  final int avatar;
  final int bio;
  final int hobbies;
  final int online;
  final int mutualFriends;
  final int freshness;
  final int distance;

  CompatibilityBreakdown({
    required this.avatar,
    required this.bio,
    required this.hobbies,
    required this.online,
    required this.mutualFriends,
    required this.freshness,
    required this.distance,
  });

  factory CompatibilityBreakdown.fromJson(Map<String, dynamic> json) {
    return CompatibilityBreakdown(
      avatar: json['avatar'] as int? ?? 0,
      bio: json['bio'] as int? ?? 0,
      hobbies: json['hobbies'] as int? ?? 0,
      online: json['online'] as int? ?? 0,
      mutualFriends: json['mutualFriends'] as int? ?? 0,
      freshness: json['freshness'] as int? ?? 0,
      distance: json['distance'] as int? ?? 0,
    );
  }

  int get total => avatar + bio + hobbies + online + mutualFriends + freshness + distance;
}

class AIException implements Exception {
  final String message;
  final int? statusCode;

  AIException(this.message, [this.statusCode]);

  @override
  String toString() => statusCode != null 
      ? 'AIException: $message (Status: $statusCode)'
      : 'AIException: $message';
}
