// Web implementation of the GIS interop. Loaded only when compiling for
// web (see `web_google_sign_in.dart` conditional export).
//
// Google Identity Services is loaded from `web/index.html` as the global
// `window.google` object. We use the **Code Client**
// (`google.accounts.oauth2.initCodeClient`) — unlike the Token Client it
// returns an OAuth `code` AND an `id_token` (a signed JWT). The id_token
// carries the user's email/name/picture directly in its payload and can
// be verified by the backend against Google's public keys.
//
// `access_token` is intentionally not requested — the People API is
// only needed for fetching profile data, which we get for free from
// the id_token JWT payload.
//
// Uses `dart:js` so we can manipulate the `google` JS object dynamically
// without enumerating every property in a typed extension. This file is
// only compiled for web builds (conditional export in
// `web_google_sign_in.dart`).

// ignore_for_file: avoid_web_libraries_in_flutter

import 'dart:async';
// ignore: deprecated_member_use
import 'dart:js' as js;

class GisInterop {
  /// Opens the GIS Code Client popup. Resolves with a non-empty map
  /// (`code`, possibly `id_token`) on success, or an empty map on
  /// cancel/close/error.
  static Future<Map<String, String>> requestGoogleCode({
    required String clientId,
    required String scope,
    required String prompt,
  }) {
    final completer = Completer<Map<String, String>>();

    void onResponse(js.JsObject response) {
      try {
        final error = response['error'];
        if (error != null) {
          // User cancelled, closed the popup, or access was denied.
          completer.complete(const {});
          return;
        }
        final out = <String, String>{};
        final code = response['code'];
        if (code is String && code.isNotEmpty) out['code'] = code;
        final idToken = response['id_token'];
        if (idToken is String && idToken.isNotEmpty) out['id_token'] = idToken;
        completer.complete(out);
      } catch (e) {
        completer.complete(const {});
      }
    }

    final google = js.context['google'];
    final oauth2 = google['accounts']['oauth2'];

    final client = oauth2.callMethod('initCodeClient', [
      js.JsObject.jsify({
        'client_id': clientId,
        'scope': scope,
        'callback': onResponse,
        // 'select_account' forces account picker each time, which
        // mirrors the Token Client UX. Omit for silent login.
        'ux_mode': 'popup',
      }),
    ]);

    client.callMethod('requestCode', [
      js.JsObject.jsify({'prompt': prompt}),
    ]);

    return completer.future;
  }
}
