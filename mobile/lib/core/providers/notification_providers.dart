import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import 'core_providers.dart';

/// Polling interval for the notifications list and unread count.
const _kNotificationPollInterval = Duration(seconds: 30);

/// Notifications list provider. Auto-refreshes when invalidated and on
/// a periodic timer.
final notificationsProvider =
    FutureProvider<List<NotificationModel>>((ref) async {
  // Start a periodic timer that invalidates the provider so the list
  // re-fetches every [_kNotificationPollInterval] while at least one
  // listener is attached.
  final timer = Timer.periodic(_kNotificationPollInterval, (_) {
    ref.invalidateSelf();
  });
  ref.onDispose(timer.cancel);

  final api = ref.watch(apiServiceProvider);
  final data = await api.getNotifications(limit: 30, offset: 0);
  final items = (data['items'] as List?) ??
      (data['notifications'] as List?) ??
      const [];
  return items
      .whereType<Map<String, dynamic>>()
      .map(NotificationModel.fromJson)
      .toList();
});

/// Unread count badge. Refreshes more often so the bell stays fresh.
final unreadCountProvider = FutureProvider<int>((ref) async {
  // Mirror the polling pattern; on every refresh we depend on the
  // unread-count endpoint directly.
  final timer = Timer.periodic(
      const Duration(seconds: 15), (_) => ref.invalidateSelf());
  ref.onDispose(timer.cancel);

  final api = ref.watch(apiServiceProvider);
  return api.getUnreadNotificationCount();
});
