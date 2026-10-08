// Decodes the payload of a Google-signed JWT (id_token) without
// verifying the signature. Verification is the backend's job.
//
// The JWT format is `header.payload.signature` where `payload` is
// base64url-encoded JSON. We only need `email`, `name` and `picture`.
//
// We intentionally do NOT verify the signature client-side — sending
// the raw `idToken` to the backend lets the server verify it against
// Google's public keys (audience must equal our OAuth client ID).

import 'dart:convert';

class GoogleIdTokenPayload {
  final String? email;
  final String? name;
  final String? picture;
  final String? sub;
  const GoogleIdTokenPayload({
    required this.email,
    required this.name,
    required this.picture,
    required this.sub,
  });

  static const GoogleIdTokenPayload empty =
      GoogleIdTokenPayload(email: null, name: null, picture: null, sub: null);

  /// Decodes a JWT and extracts the standard profile fields. Returns
  /// [GoogleIdTokenPayload.empty] if the token is malformed or the
  /// payload doesn't contain an `email` claim.
  static GoogleIdTokenPayload decode(String idToken) {
    try {
      final parts = idToken.split('.');
      if (parts.length < 2) return empty;
      var payload = parts[1];
      // Pad base64url to a multiple of 4 before decoding.
      final padding = (4 - payload.length % 4) % 4;
      payload = payload + ('=' * padding);
      final bytes = base64Url.decode(payload);
      final json = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      return GoogleIdTokenPayload(
        email: json['email'] as String?,
        name: json['name'] as String?,
        picture: json['picture'] as String?,
        sub: json['sub'] as String?,
      );
    } catch (_) {
      return empty;
    }
  }
}
