import 'dart:async';

import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import 'api_service.dart';

/// Posts `POST /api/presence/heartbeat` every ~30 seconds while the
/// app is in the foreground. Sends `{ isOnline: false }` once on
/// dispose so the user's "online" dot is cleared on logout.
class PresenceService {
  final ApiService _api;
  final Duration interval;
  Timer? _timer;
  bool _running = false;

  PresenceService({ApiService? api, this.interval = const Duration(seconds: 30)})
      : _api = api ?? ApiService(baseUrl: AppConfig.apiBaseUrl);

  void start() {
    if (_running) return;
    _running = true;
    _tick();
    _timer = Timer.periodic(interval, (_) => _tick());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _running = false;
  }

  /// Sends `{ isOnline: false }` once. Call this from logout.
  Future<void> markOffline() async {
    try {
      await _api.sendHeartbeat(isOnline: false);
    } catch (e) {
      if (kDebugMode) debugPrint('[Presence] markOffline error: $e');
    }
  }

  Future<void> _tick() async {
    if (ApiService.sharedToken == null) {
      // not logged in — nothing to do
      return;
    }
    try {
      await _api.sendHeartbeat(isOnline: true);
    } catch (e) {
      if (kDebugMode) debugPrint('[Presence] heartbeat error: $e');
    }
  }

  void dispose() {
    stop();
  }
}
