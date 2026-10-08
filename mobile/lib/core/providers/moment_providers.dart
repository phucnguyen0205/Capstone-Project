import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/moment_model.dart';
import 'core_providers.dart';

/// Khoảnh Khắc (Moment) feed provider.
/// Loads the latest moments from friends — like Locket's home widget.
final momentsFeedProvider = FutureProvider<List<MomentModel>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getMoments();
  return raw
      .whereType<Map<String, dynamic>>()
      .map(MomentModel.fromJson)
      .toList();
});

/// Moments received by the current user.
final receivedMomentsProvider = FutureProvider<List<MomentModel>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getReceivedMoments();
  return raw
      .whereType<Map<String, dynamic>>()
      .map(MomentModel.fromJson)
      .toList();
});

/// Moments sent by the current user.
final sentMomentsProvider = FutureProvider<List<MomentModel>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getSentMoments();
  return raw
      .whereType<Map<String, dynamic>>()
      .map(MomentModel.fromJson)
      .toList();
});