import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import 'api_service.dart';
import 'web_google_sign_in.dart';

class AuthService {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  static const String _tokenKey = 'auth_token';
  static const String _userKey = 'user_data';
  
  String? _token;
  Map<String, dynamic>? _currentUser;

  String? get token => _token;
  Map<String, dynamic>? get currentUser => _currentUser;
  set currentUser(Map<String, dynamic>? value) {
    _currentUser = value;
    if (value != null) {
      _storage.write(key: _userKey, value: json.encode(value));
    } else {
      _storage.delete(key: _userKey);
    }
  }

  /// Update the cached user (and persist) without touching the JWT.
  /// Useful after a `PATCH /users/me` so subsequent `currentUserProvider`
  /// reads see the fresh fields (avatar, cover, name, ...).
  Future<void> setCurrentUser(Map<String, dynamic> value) async {
    _currentUser = value;
    await _storage.write(key: _userKey, value: json.encode(value));
  }

  bool get isLoggedIn => _token != null;

  /// Optional callback fired whenever the auth state changes (login or
  /// logout). Use to invalidate Riverpod providers.
  void Function()? onAuthStateChanged;

  AuthService() {
    _loadStoredAuth();
  }

  /// Wait for the constructor's fire-and-forget storage load to finish
  /// and return once the token/user are populated. Idempotent.
  Future<void> init() async {
    if (_initCompleter != null) return _initCompleter!.future;
    _initCompleter = Completer<void>();
    // _loadStoredAuth is fire-and-forget; give it a moment.
    // (FlutterSecureStorage's read is synchronous-ish on web but we await
    // a microtask to let it complete.)
    await Future<void>.delayed(const Duration(milliseconds: 50));
    _initCompleter!.complete();
    _initCompleter = null;
  }

  Completer<void>? _initCompleter;

  Future<void> _loadStoredAuth() async {
    try {
      _token = await _storage.read(key: _tokenKey);
      final userJson = await _storage.read(key: _userKey);
      if (userJson != null) {
        _currentUser = json.decode(userJson);
      }
      // Push stored token into the shared ApiService so pages created
      // after a hot-restart can still authenticate.
      if (_token != null) {
        ApiService.sharedToken = _token;
      }
    } catch (e) {
      debugPrint('Error loading auth: $e');
    }
  }

  Future<void> _saveAuth(String token, Map<String, dynamic> user) async {
    _token = token;
    _currentUser = user;
    ApiService.sharedToken = token;
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _userKey, value: json.encode(user));
    onAuthStateChanged?.call();
  }

  Future<void> _clearAuth() async {
    _token = null;
    _currentUser = null;
    ApiService.sharedToken = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
    onAuthStateChanged?.call();
  }

  // ============ CREDENTIALS LOGIN ============

  Future<bool> loginWithCredentials(String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'email': email,
          'password': password,
        }),
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final token = data['token'];
        final user = data['user'];
        if (token is String && token.isNotEmpty) {
          await _saveAuth(token, {
            'id': user?['id'] ?? email,
            'email': user?['email'] ?? email,
            'name': user?['name'] ?? email.split('@').first,
            'username': user?['username'] ?? email.split('@').first,
            'avatar': user?['avatar'],
          });
          // Push the token to the shared ApiService so subsequent calls
          // include `Authorization: Bearer <token>`.
          ApiService.sharedToken = token;
          return true;
        }
      }

      return false;
    } catch (e) {
      debugPrint('Login error: $e');
      return false;
    }
  }

  // ============ GOOGLE OAUTH ============
  
  String getGoogleAuthUrl({String? callbackUrl}) {
    return AppConfig.googleOAuth.authorizationUrl;
  }

  Future<bool> handleGoogleCallback(Uri callbackUri) async {
    try {
      final code = callbackUri.queryParameters['code'];
      if (code != null) {
        return await exchangeGoogleCode(code);
      }
      return false;
    } catch (e) {
      debugPrint('Google callback error: $e');
      return false;
    }
  }

  Future<bool> exchangeGoogleCode(String code) async {
    debugPrint('[Google Login] Exchanging code with backend at ${AppConfig.apiBaseUrl}/auth/google/exchange');
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/auth/google/exchange'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'code': code,
          'redirectUri': kIsWeb ? AppConfig.googleOAuth.gisRedirectUri : AppConfig.googleOAuth.redirectUri,
        }),
      ).timeout(const Duration(seconds: 30));

      debugPrint('[Google Login] Exchange response: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final token = data['token'];
        if (token is String && token.isNotEmpty) {
          await _saveAuth(token, {
            'id': data['user']?['id'] ?? data['id'] ?? 'google_user',
            'email': data['user']?['email'] ?? data['email'] ?? '',
            'name': data['user']?['name'] ?? data['name'] ?? 'Google User',
            'username': data['user']?['username'],
            'avatar': data['user']?['avatar'] ?? data['avatar'],
          });
          ApiService.sharedToken = token;
          return true;
        }
      } else {
        debugPrint('Google exchange failed: ${response.statusCode} ${response.body}');
      }
      return false;
    } catch (e) {
      debugPrint('Google code exchange error: $e');
      return false;
    }
  }

  /// Web-only: sends the GIS `idToken` directly to the backend, which
  /// verifies it against Google's public keys and returns our app JWT.
  /// This is the simplest web flow because the google_sign_in plugin does
  /// not surface a server auth code on web.
  Future<bool> verifyGoogleIdToken(String idToken) async {
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/auth/google/verify'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'idToken': idToken}),
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final token = data['token'];
        if (token is String && token.isNotEmpty) {
          await _saveAuth(token, {
            'id': data['user']?['id'] ?? data['id'] ?? 'google_user',
            'email': data['user']?['email'] ?? data['email'] ?? '',
            'name': data['user']?['name'] ?? data['name'] ?? 'Google User',
            'username': data['user']?['username'],
            'avatar': data['user']?['avatar'] ?? data['avatar'],
          });
          ApiService.sharedToken = token;
          return true;
        }
      } else {
        debugPrint('Google verify failed: ${response.statusCode} ${response.body}');
      }
      return false;
    } catch (e) {
      debugPrint('Google idToken verify error: $e');
      return false;
    }
  }

  /// High-level helper that runs the appropriate Google login flow for
  /// the current platform:
  ///   * Web  → Google Identity Services (GIS) idToken
  ///   * Native → google_sign_in plugin OAuth Code
  /// Returns true on success (token saved + ApiService updated).
  Future<bool> loginWithGoogle() async {
    if (kIsWeb) {
      return await _loginWithGoogleWeb();
    }
    return await _loginWithGoogleNative();
  }

  Future<bool> _loginWithGoogleWeb() async {
    try {
      debugPrint('[Google Login] Client ID: ${AppConfig.googleOAuth.clientId}');
      debugPrint('[Google Login] Scopes: ${AppConfig.googleOAuth.scopes}');
      debugPrint('[Google Login] Window origin: ${Uri.base.origin}');

      final result = await WebGoogleSignIn.run(
        clientId: AppConfig.googleOAuth.clientId,
        scopes: AppConfig.googleOAuth.scopes,
      );
      if (result == null) {
        debugPrint('[Google Login] No token — user likely cancelled or popup was blocked.');
        return false;
      }

      // Preferred path: GIS Code Client returns both `code` (OAuth auth
      // code) and `id_token` (signed JWT). If both are present, send
      // the code so the backend can verify against Google and issue
      // our app JWT. Fall back to id_token-only verification if the
      // backend already exposes /auth/google/verify.
      final code = result['code'];
      if (code != null && code.isNotEmpty) {
        debugPrint('[Google Login] OAuth code received (${code.length} chars)');
        return await exchangeGoogleCode(code);
      }

      final idToken = result['idToken'];
      if (idToken != null && idToken.isNotEmpty) {
        debugPrint('[Google Login] idToken received (${idToken.length} chars)');
        return await verifyGoogleIdToken(idToken);
      }

      debugPrint('[Google Login] Missing both code and idToken in result');
      return false;
    } catch (e) {
      debugPrint('[Google Login] Error: $e');
      return false;
    }
  }

  Future<bool> _loginWithGoogleNative() async {
    try {
      final result = await WebGoogleSignIn.run(
        clientId: AppConfig.googleOAuth.clientId,
        scopes: AppConfig.googleOAuth.scopes,
      );
      if (result == null) return false;
      final code = result['serverAuthCode'];
      if (code != null && code.isNotEmpty) {
        return await exchangeGoogleCode(code);
      }
      debugPrint('[Google Login] No server auth code from google_sign_in');
      return false;
    } catch (e) {
      debugPrint('Google native login error: $e');
      return false;
    }
  }

  // ============ PHONE OTP ============
  
  Future<bool> sendPhoneOtp(String phone) async {
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/auth/send-otp'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'phone': phone}),
      ).timeout(const Duration(seconds: 30));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Send OTP error: $e');
      return false;
    }
  }

  Future<bool> verifyPhoneOtp(String phone, String otp) async {
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/auth/verify-otp'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'phone': phone, 'otp': otp}),
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final token = data['token'] ?? 'otp_token';
        await _saveAuth(token, {
          'id': data['id'] ?? 'phone_${phone.hashCode}',
          'phone': phone,
          'name': data['name'] ?? 'User',
        });
        ApiService.sharedToken = token;
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Verify OTP error: $e');
      return false;
    }
  }

  // ============ REGISTER ============
  
  Future<bool> register({
    required String email,
    required String password,
    required String name,
    String? username,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'email': email,
          'password': password,
          'name': name,
          'username': username ?? name.toLowerCase().replaceAll(' ', '_'),
        }),
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode == 200 || response.statusCode == 201) {
        return await loginWithCredentials(email, password);
      }
      return false;
    } catch (e) {
      debugPrint('Register error: $e');
      return false;
    }
  }

  // ============ LOGOUT ============
  
  Future<void> logout() async {
    await _clearAuth();
  }

  // ============ SESSION CHECK ============
  
  Future<bool> checkSession() async {
    if (_token == null) return false;
    
    try {
      final response = await http.get(
        Uri.parse('${AppConfig.apiBaseUrl}/auth/session'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      ).timeout(const Duration(seconds: 10));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Session check error: $e');
      return false;
    }
  }
}
