import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/conversation_model.dart';
import '../models/presence_info_model.dart';
import '../models/user_model.dart';
import 'core_providers.dart';

/// Conversations stream. Polls every 5s — matching web parity. The
/// backend has no WebSocket for chat (only for calls), so polling is
/// the only way to keep the list live.
final conversationsProvider =
    StreamProvider.autoDispose<List<ConversationModel>>((ref) {
  final api = ref.watch(apiServiceProvider);
  final controller = StreamController<List<ConversationModel>>.broadcast();
  Timer? timer;

  Future<void> fetch() async {
    try {
      final raw = await api.getConversations();
      final list = raw
          .whereType<Map<String, dynamic>>()
          .map(ConversationModel.fromJson)
          .toList();
      controller.add(list);
    } catch (e) {
      if (kDebugMode) debugPrint('[conversationsProvider] $e');
      controller.add(const []);
    }
  }

  fetch();
  timer = Timer.periodic(const Duration(seconds: 5), (_) => fetch());
  ref.onDispose(() {
    timer?.cancel();
    controller.close();
  });
  return controller.stream;
});

/// Active conversation currently open in the chat panel.
final activeConversationProvider =
    StateProvider<ConversationModel?>((ref) => null);

/// Messages for a conversation id. Polls every 3s (web parity).
final messagesProvider = StreamProvider.autoDispose
    .family<List<MessageModel>, String>((ref, conversationId) {
  final api = ref.watch(apiServiceProvider);
  final controller = StreamController<List<MessageModel>>.broadcast();
  Timer? timer;
  Future<void> fetch() async {
    try {
      final raw = await api.getMessages(conversationId);
      final list = raw
          .whereType<Map<String, dynamic>>()
          .map(MessageModel.fromJson)
          .toList();
      controller.add(list);
    } catch (e) {
      if (kDebugMode) debugPrint('[messagesProvider:$conversationId] $e');
      controller.add(const []);
    }
  }

  fetch();
  timer = Timer.periodic(const Duration(seconds: 3), (_) => fetch());
  ref.onDispose(() {
    timer?.cancel();
    controller.close();
  });
  return controller.stream;
});

/// Map of `userId -> PresenceInfo`.
///
/// Refreshes every 15s based on:
///   1. the active conversation's participants (so the chat header
///      dot lights up)
///   2. all visible conversations' participants (so the list-page
///      dots light up too — matches web `ChatColumn.refreshPresence`)
final presenceMapProvider =
    StreamProvider.autoDispose<Map<String, PresenceInfo>>((ref) {
  final api = ref.watch(apiServiceProvider);
  final controller = StreamController<Map<String, PresenceInfo>>.broadcast();
  Timer? timer;
  Map<String, PresenceInfo> last = {};

  Future<void> refresh(List<String> ids) async {
    if (ids.isEmpty) {
      controller.add(last);
      return;
    }
    try {
      final raw = await api.getBulkPresence(ids);
      last = raw.map((k, v) => MapEntry(
            k,
            v is Map<String, dynamic>
                ? PresenceInfo.fromJson(v)
                : PresenceInfo(
                    code: 0,
                    label: '',
                    dotColor: 'gray',
                    isOnline: false,
                  ),
          ));
      controller.add(last);
    } catch (_) {
      controller.add(last);
    }
  }

  Future<void> refreshForConversations(
      List<ConversationModel> convs) async {
    final ids = <String>{};
    for (final c in convs) {
      for (final p in c.participants) {
        ids.add(p.id);
      }
    }
    final me = ref.read(currentUserProvider);
    if (me != null) ids.remove(me.id);
    await refresh(ids.toList());
  }

  // Initial fetch — start with the active conversation's participants.
  final initial = ref.read(activeConversationProvider);
  if (initial != null) {
    refresh(initial.participants.map((p) => p.id).toList());
  } else {
    controller.add(last);
  }

  timer = Timer.periodic(const Duration(seconds: 15), (_) async {
    final active = ref.read(activeConversationProvider);
    if (active != null) {
      await refresh(active.participants.map((p) => p.id).toList());
    }
    // Also refresh presence for everyone in the visible conversation
    // list so the dots stay alive while the user is on /messages.
    final list = ref.read(conversationsProvider).valueOrNull;
    if (list != null && list.isNotEmpty) {
      await refreshForConversations(list);
    }
  });
  ref.onDispose(() {
    timer?.cancel();
    controller.close();
  });
  return controller.stream;
});

/// Current search query (for debouncing user search).
final userSearchQueryProvider = StateProvider<String>((ref) => '');

/// Debounced user search (300ms) — chat-specific users from
/// `searchUsers` endpoint.
final chatUserSearchProvider = FutureProvider.autoDispose
    .family<List<UserModel>, String>((ref, query) async {
  final q = query.trim();
  if (q.isEmpty) return const [];
  await Future.delayed(const Duration(milliseconds: 300));
  if (ref.read(userSearchQueryProvider) != q) return const [];
  final api = ref.watch(apiServiceProvider);
  try {
    final raw = await api.searchUsers(q);
    return raw
        .whereType<Map<String, dynamic>>()
        .map(UserModel.fromJson)
        .toList();
  } catch (_) {
    return const [];
  }
});

/// Reply-to message.
final replyToProvider = StateProvider<MessageModel?>((ref) => null);

/// Pending media attachment (after pick, before upload).
class PendingMedia {
  final String localPath;
  final String kind; // 'image' | 'video' | 'file'
  final String fileName;
  final int fileSize;
  const PendingMedia({
    required this.localPath,
    required this.kind,
    required this.fileName,
    required this.fileSize,
  });
}

final pendingMediaProvider = StateProvider<PendingMedia?>((ref) => null);

// ============ Chat settings (theme/muted/pinned) ============

@immutable
class ChatSettings {
  final String themeId; // default 'pink-sunset'
  final bool muted;
  final bool pinned;
  const ChatSettings({
    this.themeId = 'pink-sunset',
    this.muted = false,
    this.pinned = false,
  });

  ChatSettings copyWith({String? themeId, bool? muted, bool? pinned}) =>
      ChatSettings(
        themeId: themeId ?? this.themeId,
        muted: muted ?? this.muted,
        pinned: pinned ?? this.pinned,
      );

  Map<String, dynamic> toJson() => {
        'themeId': themeId,
        'muted': muted,
        'pinned': pinned,
      };

  static ChatSettings fromJson(Map<String, dynamic> j) => ChatSettings(
        themeId: j['themeId'] as String? ?? 'pink-sunset',
        muted: j['muted'] as bool? ?? false,
        pinned: j['pinned'] as bool? ?? false,
      );
}

const _settingsIndexKey = 'chatSettings:__index__';

class ChatSettingsNotifier extends StateNotifier<ChatSettings> {
  ChatSettingsNotifier(this.conversationId) : super(const ChatSettings()) {
    _load();
  }
  final String conversationId;

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    final idx = p.getString(_settingsIndexKey);
    if (idx == null) return;
    try {
      final map = jsonDecode(idx) as Map<String, dynamic>;
      final raw = map[conversationId];
      if (raw is Map) {
        state = ChatSettings.fromJson(Map<String, dynamic>.from(raw));
      }
    } catch (_) {}
  }

  Future<void> _persist() async {
    final p = await SharedPreferences.getInstance();
    final idx = p.getString(_settingsIndexKey);
    Map<String, dynamic> map = {};
    if (idx != null) {
      try {
        map = jsonDecode(idx) as Map<String, dynamic>;
      } catch (_) {}
    }
    map[conversationId] = state.toJson();
    await p.setString(_settingsIndexKey, jsonEncode(map));
  }

  Future<void> updateTheme(String id) async {
    state = state.copyWith(themeId: id);
    await _persist();
  }

  Future<void> updateMuted(bool v) async {
    state = state.copyWith(muted: v);
    await _persist();
  }

  Future<void> updatePinned(bool v) async {
    state = state.copyWith(pinned: v);
    await _persist();
  }
}

final chatSettingsProvider = StateNotifierProvider.family
    .autoDispose<ChatSettingsNotifier, ChatSettings, String>(
        (ref, conversationId) =>
            ChatSettingsNotifier(conversationId));