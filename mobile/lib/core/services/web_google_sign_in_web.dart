// Web implementation. Drives the Google Identity Services OAuth 2.0
// Token Client via JS interop — no google_sign_in_web plugin, no
// People API dependency.
//
// `window.google` is loaded by web/index.html as a global script
// (`https://accounts.google.com/gsi/client`).
//
// This file is selected at compile time via the conditional export in
// `web_google_sign_in.dart` and only ever compiled for web builds.

// ignore_for_file: avoid_web_libraries_in_flutter

import 'dart:async';
// ignore: deprecated_member_use
import 'dart:js' as js;

import 'package:flutter/foundation.dart';

import 'gis_interop_web.dart';

class WebGoogleSignIn {
  static const _kTimeout = Duration(seconds: 10);

  static Future<Map<String, String>?> run({
    required String clientId,
    required List<String> scopes,
  }) async {
    try {
      if (kDebugMode) {
        debugPrint('[WebGoogleSignIn] GIS Code Client starting...');
        debugPrint('[WebGoogleSignIn] Client ID: $clientId');
        debugPrint('[WebGoogleSignIn] Scopes: $scopes');
      }

      if (!await _waitForGoogle(_kTimeout)) {
        if (kDebugMode) {
          debugPrint('[WebGoogleSignIn] GIS failed to load (timeout)');
        }
        return null;
      }

      final tokens = await GisInterop.requestGoogleCode(
        clientId: clientId,
        scope: scopes.join(' '),
        prompt: 'consent',
      );

      if (kDebugMode) {
        debugPrint('[WebGoogleSignIn] Tokens received: ${tokens.keys.toList()}');
      }
      return tokens.isEmpty ? null : tokens;
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('[WebGoogleSignIn] error: $e\n$st');
      }
      return null;
    }
  }

  static Future<bool> _waitForGoogle(Duration timeout) async {
    final start = DateTime.now();
    while (DateTime.now().difference(start) < timeout) {
      if (_googleAccountsOauth2Available()) return true;
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    return false;
  }

  static bool _googleAccountsOauth2Available() {
    try {
      final google = js.context['google'];
      if (google == null) return false;
      final accounts = google['accounts'];
      if (accounts == null) return false;
      return accounts['oauth2'] != null;
    } catch (_) {
      return false;
    }
  }
}
