import 'api_service.dart';

/// Global API singleton that pages share so the auth token is
/// propagated to every HTTP request without manual plumbing.
class Api {
  Api._();
  static final ApiService instance = ApiService();
}
