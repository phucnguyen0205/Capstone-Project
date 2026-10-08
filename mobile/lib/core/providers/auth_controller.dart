import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/auth_service.dart';
import 'core_providers.dart';
import 'user_providers.dart';

/// Glue between Riverpod and the (non-Riverpod) [AuthService]. Exposes
/// imperative helpers (`loginWithCredentials`, `logout`, ...) and
/// drives the `currentUserProvider` on auth state changes.
class AuthController {
  final Ref _ref;
  AuthController(this._ref) {
    // Wait for the auth service future to settle so we know whether the
    // token was re-hydrated from secure storage before we attach our
    // callback.
    _ref.listen<AsyncValue<AuthService>>(
      authServiceProvider,
      (_, next) {
        next.whenData((auth) {
          auth.onAuthStateChanged = () {
            // Re-evaluate the auth service provider so currentUserProvider
            // and isAuthenticatedProvider pick up the new state.
            _ref.invalidate(authServiceProvider);
            _ref.invalidate(meProvider);
          };
        });
      },
      fireImmediately: true,
    );
  }

  AuthService _requireAuth() =>
      _ref.read(authServiceProvider).requireValue;

  Future<bool> loginWithCredentials(String email, String password) =>
      _requireAuth().loginWithCredentials(email, password);

  Future<bool> register({
    required String email,
    required String password,
    required String name,
    String? username,
  }) =>
      _requireAuth().register(
            email: email,
            password: password,
            name: name,
            username: username,
          );

  Future<bool> loginWithGoogle() => _requireAuth().loginWithGoogle();

  Future<bool> verifyPhoneOtp(String phone, String otp) =>
      _requireAuth().verifyPhoneOtp(phone, otp);

  Future<void> logout() async {
    // Clear the JWT and the cached user *first*, then notify Riverpod so
    // the router redirect to /login can start before we tear down the
    // realtime services. If we tore them down first we'd race with
    // in-flight SSE/heartbeat requests and risk blocking the redirect on
    // a hung future. Each teardown is wrapped in its own try/catch so a
    // failure in one (e.g. presence service not initialised on web)
    // doesn't prevent logout from completing.
    await _requireAuth().logout();

    // Drop the cached data providers so the next login starts fresh.
    // IMPORTANT: do NOT invalidate `goRouterProvider` — the router's
    // `refreshListenable` already redirects to /login when
    // `currentUserProvider` becomes null. Tearing the router down mid
    // way through that redirect fires `currentConfiguration.isNotEmpty`
    // assertions in go_router's delegate and the Navigator
    // `_effectiveObservers.isEmpty` assertion in navigator.dart:4064
    // when the old Navigator is disposed while observers are attached.
    _ref.invalidate(meProvider);
    _ref.invalidate(currentUserProvider);
    _ref.invalidate(isAuthenticatedProvider);

    // Best-effort teardown of realtime services AFTER logout so any
    // background work has already stopped touching the API. Errors are
    // swallowed because the user is already logged out — there's nothing
    // actionable we can do here, and we don't want a stuck socket to
    // block the redirect.
    try {
      await _ref.read(presenceServiceProvider).markOffline();
    } catch (_) {}
    try {
      _ref.read(callSignalingServiceProvider).dispose();
    } catch (_) {}
    try {
      _ref.read(presenceServiceProvider).stop();
    } catch (_) {}
  }
}

final authControllerProvider = Provider<AuthController>((ref) {
  return AuthController(ref);
});
