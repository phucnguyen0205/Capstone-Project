import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/call_signaling_service.dart';
import '../services/presence_service.dart';
import '../services/upload_service.dart';

/// Singleton ApiService (uses AppConfig.apiBaseUrl by default).
final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService();
});

/// AuthService holds the JWT and the cached user data dict.
final authServiceProvider = FutureProvider<AuthService>((ref) async {
  final auth = AuthService();
  await auth.init();
  return auth;
});

/// Currently logged-in user. `null` when not authenticated.
final currentUserProvider = Provider<UserModel?>((ref) {
  final authAsync = ref.watch(authServiceProvider);
  final auth = authAsync.valueOrNull;
  if (auth == null) return null;
  final raw = auth.currentUser;
  if (raw == null) return null;
  try {
    return UserModel.fromJson(raw);
  } catch (_) {
    return null;
  }
});

/// Quick boolean auth flag, used by GoRouter redirect.
final isAuthenticatedProvider = Provider<bool>((ref) {
  final user = ref.watch(currentUserProvider);
  return user != null && ApiService.sharedToken != null;
});

final uploadServiceProvider = Provider<UploadService>((ref) {
  return UploadService(api: ref.watch(apiServiceProvider));
});

final presenceServiceProvider = Provider<PresenceService>((ref) {
  return PresenceService(api: ref.watch(apiServiceProvider));
});

final callSignalingServiceProvider = Provider<CallSignalingService>((ref) {
  return CallSignalingService(api: ref.watch(apiServiceProvider));
});
