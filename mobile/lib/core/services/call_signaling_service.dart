import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import 'api_service.dart';

/// Call signaling channel over Server-Sent Events.
///
/// The backend exposes `GET /api/calls/stream` which keeps an open
/// connection and pushes incoming-call / call-update events. The
/// actual media stream is out-of-scope (clients do their own WebRTC).
class CallSignalingService {
  final ApiService _api;
  StreamController<CallEvent>? _controller;
  http.Client? _client;
  StreamSubscription? _subscription; // dynamic type because the chained
                                     // calls below produce different
                                     // stream element types.
  bool _closed = false;

  CallSignalingService({ApiService? api})
      : _api = api ?? ApiService(baseUrl: AppConfig.apiBaseUrl);

  Stream<CallEvent> get events {
    _controller ??= StreamController<CallEvent>.broadcast(
      onListen: connect,
      onCancel: disconnect,
    );
    return _controller!.stream;
  }

  /// Internal helper: push an event without crashing if the controller
  /// has already been closed (e.g. Riverpod disposed this provider
  /// while SSE was still flushing buffered data).
  void _safeAdd(CallEvent event) {
    final c = _controller;
    if (c == null || c.isClosed) return;
    try {
      c.add(event);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[CallSignaling] suppressed add error: $e');
      }
    }
  }

  void connect() {
    if (_closed) return;
    final url = Uri.parse('${AppConfig.apiBaseUrl}/calls/stream');
    final token = ApiService.sharedToken;
    if (token == null) {
      if (kDebugMode) {
        debugPrint('[CallSignaling] No auth token, not connecting');
      }
      return;
    }
    _client = http.Client();
    final req = http.Request('GET', url)
      ..headers['Accept'] = 'text/event-stream'
      ..headers['Cache-Control'] = 'no-cache'
      ..headers['Authorization'] = 'Bearer $token';
    _subscription = _client!.send(req).asStream().listen(
      (response) {
        if (response.statusCode != 200) {
          _safeAdd(CallEvent.error(
              'SSE connect failed: ${response.statusCode}'));
          return;
        }
        final lines = response.stream
            .transform(utf8.decoder)
            .transform(const LineSplitter());
        lines.listen((line) {
          if (line.isEmpty) return;
          if (line.startsWith('data:')) {
            final json = line.substring(5).trim();
            if (json.isEmpty) return;
            try {
              final obj = jsonDecode(json) as Map<String, dynamic>;
              _safeAdd(CallEvent.fromJson(obj));
            } catch (e) {
              if (kDebugMode) debugPrint('[CallSignaling] bad json: $e');
            }
          }
        });
      },
      onError: (e) {
        if (kDebugMode) debugPrint('[CallSignaling] stream error: $e');
        _safeAdd(CallEvent.error(e.toString()));
      },
      onDone: () {
        if (kDebugMode) debugPrint('[CallSignaling] stream closed');
        _safeAdd(const CallEvent.closed());
      },
      cancelOnError: false,
    );
  }

  void disconnect() {
    _subscription?.cancel();
    _subscription = null;
    _client?.close();
    _client = null;
  }

  void dispose() {
    _closed = true;
    disconnect();
    try {
      _controller?.close();
    } catch (_) {}
    _controller = null;
  }
}

@immutable
class CallEvent {
  final String type; // 'incoming_call' | 'call_update' | 'connected' | 'error' | 'closed' | 'call_signal'
  final Map<String, dynamic>? call;
  final String? message;
  final String? callId;
  final Map<String, dynamic>? signal;

  const CallEvent._(this.type, this.call, this.message,
      {this.callId, this.signal});

  const CallEvent.connected() : this._('connected', null, null);
  const CallEvent.closed() : this._('closed', null, null);
  const CallEvent.error(String m) : this._('error', null, m);

  factory CallEvent.fromJson(Map<String, dynamic> json) {
    final signal = json['signal'] is Map<String, dynamic>
        ? json['signal'] as Map<String, dynamic>
        : null;
    return CallEvent._(
      (json['type'] as String?) ?? 'unknown',
      json['call'] is Map<String, dynamic>
          ? json['call'] as Map<String, dynamic>
          : null,
      json['message'] as String?,
      callId: json['callId'] as String?,
      signal: signal,
    );
  }

  bool get isIncomingCall => type == 'incoming_call';
  bool get isCallUpdate => type == 'call_update';
  bool get isClosed => type == 'closed';
  bool get isError => type == 'error';
  bool get isCallSignal => type == 'call_signal';
}
