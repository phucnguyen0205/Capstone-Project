import 'dart:async';
import 'package:flutter/foundation.dart';

/// WebRTC quality optimization for Flutter.
/// Based on production systems like Discord, Zoom, Google Meet.

class MediaQualityConfig {
  final VideoQualityConfig video;
  final AudioQualityConfig audio;

  const MediaQualityConfig({
    required this.video,
    required this.audio,
  });
}

class VideoQualityConfig {
  final int maxBitrate;
  final int minBitrate;
  final int startBitrate;
  final int maxWidth;
  final int maxHeight;
  final int maxFrameRate;
  final double? scaleResolutionDownBy;

  const VideoQualityConfig({
    required this.maxBitrate,
    required this.minBitrate,
    required this.startBitrate,
    required this.maxWidth,
    required this.maxHeight,
    required this.maxFrameRate,
    this.scaleResolutionDownBy,
  });

  Map<String, dynamic> toConstraints() {
    return {
      'mandatory': {
        'minWidth': '${maxWidth ~/ 2}',
        'minHeight': '${maxHeight ~/ 2}',
        'maxWidth': '$maxWidth',
        'maxHeight': '$maxHeight',
        'minFrameRate': '${maxFrameRate ~/ 2}',
        'maxFrameRate': '$maxFrameRate',
      },
      'optional': [],
    };
  }
}

class AudioQualityConfig {
  final int maxBitrate;
  final bool echoCancellation;
  final bool noiseSuppression;
  final bool autoGainControl;

  const AudioQualityConfig({
    required this.maxBitrate,
    required this.echoCancellation,
    required this.noiseSuppression,
    required this.autoGainControl,
  });

  Map<String, dynamic> toConstraints() {
    return {
      'echoCancellation': echoCancellation,
      'noiseSuppression': noiseSuppression,
      'autoGainControl': autoGainControl,
    };
  }
}

/// Quality presets based on network conditions
class QualityPresets {
  static const low = MediaQualityConfig(
    video: VideoQualityConfig(
      maxBitrate: 250000, // 250 kbps
      minBitrate: 100000,
      startBitrate: 150000,
      maxWidth: 640,
      maxHeight: 480,
      maxFrameRate: 15,
      scaleResolutionDownBy: 2.0,
    ),
    audio: AudioQualityConfig(
      maxBitrate: 32000, // 32 kbps
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    ),
  );

  static const medium = MediaQualityConfig(
    video: VideoQualityConfig(
      maxBitrate: 800000, // 800 kbps
      minBitrate: 300000,
      startBitrate: 500000,
      maxWidth: 1280,
      maxHeight: 720,
      maxFrameRate: 24,
    ),
    audio: AudioQualityConfig(
      maxBitrate: 48000, // 48 kbps
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    ),
  );

  static const high = MediaQualityConfig(
    video: VideoQualityConfig(
      maxBitrate: 2500000, // 2.5 Mbps
      minBitrate: 800000,
      startBitrate: 1500000,
      maxWidth: 1920,
      maxHeight: 1080,
      maxFrameRate: 30,
    ),
    audio: AudioQualityConfig(
      maxBitrate: 64000, // 64 kbps
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    ),
  );

  static const auto = medium; // Default to medium for auto mode

  static MediaQualityConfig fromString(String quality) {
    switch (quality) {
      case 'low':
        return low;
      case 'medium':
        return medium;
      case 'high':
        return high;
      default:
        return auto;
    }
  }
}

/// Network statistics for quality monitoring
class NetworkStats {
  final int bytesReceived;
  final int bytesSent;
  final int packetsLost;
  final int packetsReceived;
  final double jitter;
  final double roundTripTime;
  final int? availableOutgoingBitrate;
  final DateTime timestamp;

  const NetworkStats({
    required this.bytesReceived,
    required this.bytesSent,
    required this.packetsLost,
    required this.packetsReceived,
    required this.jitter,
    required this.roundTripTime,
    this.availableOutgoingBitrate,
    required this.timestamp,
  });

  double get packetLossRate {
    if (packetsReceived == 0) return 0.0;
    return packetsLost / packetsReceived;
  }

  double get currentBitrate {
    // This should be calculated from delta between two stats
    return bytesSent * 8.0; // bits
  }
}

/// Adaptive quality controller for Flutter
/// Monitors network and adjusts quality automatically
class AdaptiveQualityController {
  String _currentQuality = 'auto';
  Timer? _monitorTimer;
  NetworkStats? _lastStats;
  final List<NetworkStats> _statsHistory = [];
  static const int _maxHistoryLength = 10;

  final void Function(String quality)? onQualityChange;

  AdaptiveQualityController({this.onQualityChange});

  String get currentQuality => _currentQuality;

  void start({Duration interval = const Duration(seconds: 2)}) {
    if (kDebugMode) debugPrint('[Quality] Starting adaptive quality controller');
    
    _currentQuality = 'auto';
    _notifyQualityChange('auto');

    _monitorTimer?.cancel();
    _monitorTimer = Timer.periodic(interval, (_) {
      _monitor();
    });
  }

  void stop() {
    if (kDebugMode) debugPrint('[Quality] Stopping adaptive quality controller');
    _monitorTimer?.cancel();
    _monitorTimer = null;
  }

  void setQuality(String quality) {
    if (_currentQuality == quality) return;
    
    if (kDebugMode) debugPrint('[Quality] Manual quality change: $_currentQuality → $quality');
    _currentQuality = quality;
    _notifyQualityChange(quality);
  }

  void _monitor() {
    // In a real implementation, you would get stats from RTCPeerConnection
    // For now, this is a placeholder for the monitoring logic
    
    // Example: Simulate network conditions
    // In production, get actual stats from flutter_webrtc
    
    if (kDebugMode) debugPrint('[Quality] Monitoring (current: $_currentQuality)');
  }

  void updateStats(NetworkStats stats) {
    _statsHistory.add(stats);
    if (_statsHistory.length > _maxHistoryLength) {
      _statsHistory.removeAt(0);
    }

    if (_lastStats != null) {
      _adaptQuality(stats, _lastStats!);
    }

    _lastStats = stats;
  }

  void _adaptQuality(NetworkStats current, NetworkStats previous) {
    final timeDiff = current.timestamp.difference(previous.timestamp).inMilliseconds / 1000.0;
    if (timeDiff <= 0) return;

    final bytesSent = current.bytesSent - previous.bytesSent;
    final currentBitrate = (bytesSent * 8) / timeDiff;

    final packetsReceived = current.packetsReceived - previous.packetsReceived;
    final packetsLost = current.packetsLost - previous.packetsLost;
    final packetLossRate = packetsReceived > 0 ? packetsLost / packetsReceived : 0.0;

    final rtt = current.roundTripTime * 1000; // Convert to ms

    String targetQuality = _currentQuality;

    // High packet loss → downgrade
    if (packetLossRate > 0.05) {
      if (_currentQuality == 'high') {
        targetQuality = 'medium';
      } else if (_currentQuality == 'medium') {
        targetQuality = 'low';
      }
    }

    // High RTT → downgrade
    if (rtt > 300) {
      if (_currentQuality == 'high') targetQuality = 'medium';
    }

    // Low available bitrate → downgrade
    if (current.availableOutgoingBitrate != null && current.availableOutgoingBitrate! < 500000) {
      if (_currentQuality != 'low') targetQuality = 'low';
    }

    // Good conditions → upgrade
    if (packetLossRate < 0.01 &&
        rtt < 150 &&
        current.availableOutgoingBitrate != null &&
        current.availableOutgoingBitrate! > 2000000 &&
        _currentQuality == 'low') {
      targetQuality = 'medium';
    }

    if (packetLossRate < 0.005 &&
        rtt < 100 &&
        current.availableOutgoingBitrate != null &&
        current.availableOutgoingBitrate! > 3000000 &&
        _currentQuality == 'medium') {
      targetQuality = 'high';
    }

    // Apply change if needed
    if (targetQuality != _currentQuality) {
      if (kDebugMode) {
        debugPrint('[Quality] Adapting $_currentQuality → $targetQuality');
        debugPrint('[Quality] Loss: ${(packetLossRate * 100).toStringAsFixed(2)}%, '
            'RTT: ${rtt.toStringAsFixed(0)}ms, '
            'Bitrate: ${(currentBitrate / 1000).toStringAsFixed(0)} kbps');
      }
      setQuality(targetQuality);
    }
  }

  void _notifyQualityChange(String quality) {
    onQualityChange?.call(quality);
  }

  List<NetworkStats> get statsHistory => List.unmodifiable(_statsHistory);
  NetworkStats? get lastStats => _lastStats;

  void dispose() {
    stop();
  }
}
