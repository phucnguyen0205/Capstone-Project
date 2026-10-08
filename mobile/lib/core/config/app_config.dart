/// API and OAuth Configuration for Mobile App
/// These values are synchronized with the web project's .env.local

class AppConfig {
  // API Server
  static const String apiBaseUrl = 'http://localhost:3000/api';
  static const String webBaseUrl = 'http://localhost:3000';

  // OAuth Configuration
  static const OAuthConfig googleOAuth = OAuthConfig(
    clientId: '992995267388-57joah8jo6a35nndn44af14ufhs52bnp.apps.googleusercontent.com',
    // Android/iOS deep link
    redirectUri: 'datingapp://auth/google/callback',
    // HTTP URL used when the OAuth flow is run inside the browser
    // (Flutter web or OAuth via a popup).
    webRedirectUri: 'http://localhost:3000/api/auth/google/callback',
    scopes: [
      'openid',
      'email',
      'profile',
    ],
  );

  // Cloudinary (for image uploads)
  static const String cloudinaryCloudName = 'sei3lgiv';
  static const String cloudinaryUploadPreset = 'diary_upload';

  // Gemini AI (for content moderation). The real key is provisioned
  // through `--dart-define=GEMINI_API_KEY=...` at build time. We keep
  // an empty string as the in-source default so a leaked build never
  // ships a real credential — a forgotten env var will surface as a
  // 401 from the moderation API rather than silently using a leaked
  // key. Rotate the key if it has ever been committed to a public
  // repository.
  static const String geminiApiKey = String.fromEnvironment(
    'GEMINI_API_KEY',
    defaultValue: '',
  );

  // App Settings
  static const Duration heartbeatInterval = Duration(seconds: 30);
  static const Duration sessionTimeout = Duration(hours: 24);
}

class OAuthConfig {
  final String clientId;
  final String redirectUri;
  final String webRedirectUri;
  final List<String> scopes;

  const OAuthConfig({
    required this.clientId,
    required this.redirectUri,
    required this.webRedirectUri,
    required this.scopes,
  });

  String get authorizationUrl {
    return 'https://accounts.google.com/o/oauth2/v2/auth'
        '?client_id=$clientId'
        '&redirect_uri=${Uri.encodeComponent(redirectUri)}'
        '&response_type=code'
        '&scope=${Uri.encodeComponent(scopes.join(' '))}'
        '&access_type=offline'
        '&prompt=consent';
  }

  /// The Google Identity Services (GIS) "popup" mode uses the special
  /// `postmessage` redirect URI; the actual redirect happens in-page
  /// and we receive the auth code through the GIS callback.
  String get gisRedirectUri => 'postmessage';
}
