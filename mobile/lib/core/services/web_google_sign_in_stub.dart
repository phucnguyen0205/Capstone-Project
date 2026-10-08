// Stub used on non-web platforms. The real web implementation lives in
// `web_google_sign_in_web.dart`; selection happens in `web_google_sign_in.dart`.

import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

class WebGoogleSignIn {
  /// Returns a map of tokens (`idToken`, `serverAuthCode`, ...) on
  /// success, or null if the user cancelled / sign-in failed.
  static Future<Map<String, String>?> run({
    required String clientId,
    required List<String> scopes,
  }) async {
    try {
      final signIn = GoogleSignIn(
        scopes: scopes,
        serverClientId: clientId,
      );
      final account = await signIn.signIn();
      if (account == null) return null;
      final auth = await account.authentication;
      final out = <String, String>{};
      if (auth.idToken != null && auth.idToken!.isNotEmpty) {
        out['idToken'] = auth.idToken!;
      }
      if (auth.serverAuthCode != null && auth.serverAuthCode!.isNotEmpty) {
        out['serverAuthCode'] = auth.serverAuthCode!;
      }
      return out.isEmpty ? null : out;
    } catch (e) {
      if (kDebugMode) debugPrint('[WebGoogleSignIn] native error: $e');
      return null;
    }
  }
}
