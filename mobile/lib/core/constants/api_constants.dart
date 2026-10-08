import '../config/app_config.dart';

class ApiConstants {
  // Base URL - Web API Server (synced with AppConfig)
  static const String baseUrl = AppConfig.apiBaseUrl;
  
  // Auth endpoints
  static const String authSignin = '/auth/signin';
  static const String authSignup = '/auth/signup';
  static const String authGoogle = '/auth/google';
  static const String authSendOtp = '/auth/send-otp';
  static const String authVerifyOtp = '/auth/verify-otp';
  
  // User & Profile endpoints
  static const String users = '/users';
  static const String profiles = '/profiles';
  static const String discover = '/discover';
  
  // Chat & Messages endpoints
  static const String conversations = '/conversations';
  static const String messages = '/messages';
  
  // Posts & Feed endpoints
  static const String posts = '/posts';
  static const String feed = '/feed';
  
  // AI endpoints
  static const String aiDiscover = '/ai/discover';
  static const String aiModerate = '/ai/moderate';
  
  // Groups endpoints
  static const String groups = '/groups';
  static const String groupsFeed = '/groups/feed';
  static const String groupsMembers = '/groups/members';
  static const String groupsTiers = '/groups/tiers';
  static const String groupsActivity = '/groups/activity';
  
  // Interactions
  static const String interactions = '/interactions';
  static const String presence = '/presence';
  static const String presenceHeartbeat = '/presence/heartbeat';
  static const String presenceBulk = '/presence/bulk';
  
  // Timeouts
  static const Duration connectionTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);
  
  // Google OAuth
  static const String googleOAuthUrl = 'http://localhost:3000/api/auth/google';
}
