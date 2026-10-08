import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;

import '../config/app_config.dart';
import '../models/call_types.dart';
import 'api_service.dart';

/// WebSocket service for real-time call signaling.
/// Replaces SSE (call_signaling_service.dart) with bidirectional WebSocket.
class CallSocketService {
  WebSocketChannel? _channel;
  StreamController<ServerMessage>? _controller;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  bool _closed = false;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  static const Duration _reconnectDelay = Duration(seconds: 2);
  static const Duration _heartbeatInterval = Duration(seconds: 30);

  Stream<ServerMessage> get events {
    _controller ??= StreamController<ServerMessage>.broadcast(
      onListen: _connect,
      onCancel: _disconnect,
    );
    return _controller!.stream;
  }

  bool get isConnected => _channel != null;

  void _connect() {
    if (_closed || _channel != null) return;

    final token = ApiService.sharedToken;
    if (token == null) {
      if (kDebugMode) {
        debugPrint('[CallSocket] No auth token, not connecting');
      }
      return;
    }

    try {
      // WebSocket endpoint: ws://localhost:3000/api/ws/calls
      // In production: wss://yourdomain.com/api/ws/calls
      final wsUrl = AppConfig.apiBaseUrl
          .replaceFirst('http://', 'ws://')
          .replaceFirst('https://', 'wss://');
      
      final uri = Uri.parse('$wsUrl/ws/calls');
      
      if (kDebugMode) {
        debugPrint('[CallSocket] Connecting to $uri');
      }

      _channel = WebSocketChannel.connect(
        uri,
        protocols: ['websocket'],
      );

      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: false,
      );

      _reconnectAttempts = 0;
      
      // Start heartbeat
      _startHeartbeat();

      _safeAdd(const ServerMessage.connected());
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[CallSocket] Connection error: $e');
      }
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic data) {
    if (data is! String) return;

    try {
      final json = jsonDecode(data) as Map<String, dynamic>;
      
      // Socket.IO sends messages with 'type' field
      if (json.containsKey('type')) {
        final msg = ServerMessage.fromJson(json);
        _safeAdd(msg);
        
        if (kDebugMode) {
          debugPrint('[CallSocket] Message: ${msg.type}');
        }
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[CallSocket] Parse error: $e');
      }
    }
  }

  void _onError(dynamic error) {
    if (kDebugMode) {
      debugPrint('[CallSocket] Stream error: $error');
    }
    _safeAdd(ServerMessage.error(error.toString()));
    _scheduleReconnect();
  }

  void _onDone() {
    if (kDebugMode) {
      debugPrint('[CallSocket] Connection closed');
    }
    _safeAdd(const ServerMessage.closed());
    _cleanup();
    
    if (!_closed) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _cleanup();
    
    if (_closed || _reconnectAttempts >= _maxReconnectAttempts) {
      if (kDebugMode && _reconnectAttempts >= _maxReconnectAttempts) {
        debugPrint('[CallSocket] Max reconnect attempts reached');
      }
      return;
    }

    _reconnectAttempts++;
    
    if (kDebugMode) {
      debugPrint('[CallSocket] Reconnecting in ${_reconnectDelay.inSeconds}s (attempt $_reconnectAttempts)');
    }

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(_reconnectDelay, _connect);
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(_heartbeatInterval, (_) {
      if (_channel != null) {
        sendMessage(const ClientMessage.heartbeat());
      }
    });
  }

  void _cleanup() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    
    try {
      _channel?.sink.close(status.normalClosure);
    } catch (_) {}
    _channel = null;
  }

  void _disconnect() {
    _reconnectTimer?.cancel();
    _cleanup();
  }

  void _safeAdd(ServerMessage msg) {
    final c = _controller;
    if (c == null || c.isClosed) return;
    
    try {
      c.add(msg);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[CallSocket] Add error: $e');
      }
    }
  }

  /// Send a signal (offer/answer/ice) to the server
  void sendSignal({
    required String callId,
    required String kind,
    required Map<String, dynamic> payload,
  }) {
    sendMessage(ClientMessage.signal(
      callId: callId,
      kind: kind,
      payload: payload,
    ));
  }

  /// Send a message to the server
  void sendMessage(ClientMessage msg) {
    if (_channel == null) {
      if (kDebugMode) {
        debugPrint('[CallSocket] Cannot send, not connected');
      }
      return;
    }

    try {
      _channel!.sink.add(jsonEncode(msg.toJson()));
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[CallSocket] Send error: $e');
      }
    }
  }

  void dispose() {
    _closed = true;
    _disconnect();
    
    try {
      _controller?.close();
    } catch (_) {}
    _controller = null;
  }
}
