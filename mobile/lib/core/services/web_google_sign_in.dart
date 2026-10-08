// Conditional import façade: picks the right WebGoogleSignIn
// implementation based on the target platform.

export 'web_google_sign_in_stub.dart'
    if (dart.library.js_interop) 'web_google_sign_in_web.dart';
