import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/vault_note_model.dart';
import '../services/api_service.dart';
import 'chat_providers.dart';
import 'core_providers.dart';

@immutable
class VaultStats {
  final int total;
  final int thisWeek;
  final int positiveRatio;
  const VaultStats({
    this.total = 0,
    this.thisWeek = 0,
    this.positiveRatio = 0,
  });

  factory VaultStats.fromJson(Map<String, dynamic> json) => VaultStats(
        total: (json['total'] as num?)?.toInt() ?? 0,
        thisWeek: (json['thisWeek'] as num?)?.toInt() ?? 0,
        positiveRatio: (json['positiveRatio'] as num?)?.toInt() ?? 0,
      );
}

class VaultData {
  final List<VaultNoteModel> notes;
  final VaultStats stats;
  const VaultData({this.notes = const [], this.stats = const VaultStats()});
}

final vaultDataProvider =
    FutureProvider.autoDispose<VaultData>((ref) async {
  final api = ref.watch(apiServiceProvider);
  try {
    final raw = await api.getVaultNotes();
    final notes = (raw['notes'] is List
            ? raw['notes'] as List
            : const [])
        .whereType<Map<String, dynamic>>()
        .map(VaultNoteModel.fromJson)
        .toList();
    final stats = raw['stats'] is Map<String, dynamic>
        ? VaultStats.fromJson(raw['stats'] as Map<String, dynamic>)
        : const VaultStats();
    return VaultData(notes: notes, stats: stats);
  } catch (e) {
    if (kDebugMode) debugPrint('[vaultDataProvider] $e');
    return const VaultData();
  }
});

/// Backwards-compat alias returning just the list of notes.
final vaultNotesProvider = FutureProvider.autoDispose<List<VaultNoteModel>>((ref) async {
  final data = await ref.watch(vaultDataProvider.future);
  return data.notes;
});

/// Backwards-compat alias returning VaultStats.
final vaultStatsProvider =
    FutureProvider.autoDispose<VaultStats>((ref) async {
  final data = await ref.watch(vaultDataProvider.future);
  return data.stats;
});

/// Currently selected mood filter for vault list.
final vaultMoodFilterProvider =
    StateProvider<VaultMood?>((ref) => null);
