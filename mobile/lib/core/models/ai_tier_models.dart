class AiModerationResult {
  final bool passed;
  final String? reason;
  final double ruleScore;
  final bool geminiFlagged;
  final double geminiScore;
  final String method; // 'rule' | 'gemini' | 'hybrid'
  final List<String> categories; // e.g., ['violence', 'hate_speech']

  AiModerationResult({
    required this.passed,
    this.reason,
    required this.ruleScore,
    required this.geminiFlagged,
    required this.geminiScore,
    required this.method,
    required this.categories,
  });

  factory AiModerationResult.fromJson(Map<String, dynamic> json) {
    return AiModerationResult(
      passed: json['passed'] as bool,
      reason: json['reason'] as String?,
      ruleScore: (json['ruleScore'] as num?)?.toDouble() ?? 0.0,
      geminiFlagged: json['geminiFlagged'] as bool? ?? false,
      geminiScore: (json['geminiScore'] as num?)?.toDouble() ?? 0.0,
      method: json['method'] as String? ?? 'rule',
      categories: (json['categories'] as List?)?.cast<String>() ?? [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'passed': passed,
      if (reason != null) 'reason': reason,
      'ruleScore': ruleScore,
      'geminiFlagged': geminiFlagged,
      'geminiScore': geminiScore,
      'method': method,
      'categories': categories,
    };
  }

  bool get isRuleOnly => method == 'rule';
  bool get isGeminiOnly => method == 'gemini';
  bool get isHybrid => method == 'hybrid';
}

class CompatibilityResult {
  final String userId;
  final double score;
  final String method; // 'gemini' | 'rule' | 'hybrid'
  final Map<String, dynamic>? breakdown; // detailed scoring factors
  
  // Populated fields
  final Map<String, dynamic>? user;

  CompatibilityResult({
    required this.userId,
    required this.score,
    required this.method,
    this.breakdown,
    this.user,
  });

  factory CompatibilityResult.fromJson(Map<String, dynamic> json) {
    return CompatibilityResult(
      userId: json['userId'] as String,
      score: (json['score'] as num?)?.toDouble() ?? 0.0,
      method: json['method'] as String? ?? 'rule',
      breakdown: json['breakdown'] as Map<String, dynamic>?,
      user: json['user'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userId': userId,
      'score': score,
      'method': method,
      if (breakdown != null) 'breakdown': breakdown,
      if (user != null) 'user': user,
    };
  }

  String get scorePercent => '${(score * 100).toStringAsFixed(0)}%';
  bool get isHighCompatibility => score >= 0.7;
  bool get isMediumCompatibility => score >= 0.4 && score < 0.7;
  bool get isLowCompatibility => score < 0.4;
}

class TierModel {
  final String id;
  final String name; // 'New' | 'Friend' | 'Close' | 'Family'
  final int minPoints;
  final int maxPoints;
  final String color; // hex color for UI
  final String description;

  TierModel({
    required this.id,
    required this.name,
    required this.minPoints,
    required this.maxPoints,
    required this.color,
    required this.description,
  });

  factory TierModel.fromJson(Map<String, dynamic> json) {
    return TierModel(
      id: json['id'] as String,
      name: json['name'] as String,
      minPoints: json['minPoints'] as int,
      maxPoints: json['maxPoints'] as int,
      color: json['color'] as String? ?? '#6B7280',
      description: json['description'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'minPoints': minPoints,
      'maxPoints': maxPoints,
      'color': color,
      'description': description,
    };
  }

  bool containsPoints(int points) {
    return points >= minPoints && points <= maxPoints;
  }
}
