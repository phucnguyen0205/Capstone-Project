/**
 * WebRTC quality optimization configurations.
 * Based on production systems like Discord, Zoom, Google Meet.
 */

export interface MediaQualityConfig {
  video: {
    // Adaptive bitrate constraints
    maxBitrate: number;
    minBitrate: number;
    startBitrate: number;
    
    // Resolution constraints
    maxWidth: number;
    maxHeight: number;
    maxFrameRate: number;
    
    // Encoding parameters
    scaleResolutionDownBy?: number;
    degradationPreference?: 'maintain-framerate' | 'maintain-resolution' | 'balanced';
  };
  audio: {
    maxBitrate: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
}

/**
 * Quality presets based on network conditions
 */
export const QualityPresets: Record<'low' | 'medium' | 'high' | 'auto', MediaQualityConfig> = {
  low: {
    video: {
      maxBitrate: 250000, // 250 kbps
      minBitrate: 100000,
      startBitrate: 150000,
      maxWidth: 640,
      maxHeight: 480,
      maxFrameRate: 15,
      scaleResolutionDownBy: 2,
      degradationPreference: 'maintain-framerate',
    },
    audio: {
      maxBitrate: 32000, // 32 kbps
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  },
  medium: {
    video: {
      maxBitrate: 800000, // 800 kbps
      minBitrate: 300000,
      startBitrate: 500000,
      maxWidth: 1280,
      maxHeight: 720,
      maxFrameRate: 24,
      degradationPreference: 'balanced',
    },
    audio: {
      maxBitrate: 48000, // 48 kbps
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  },
  high: {
    video: {
      maxBitrate: 2500000, // 2.5 Mbps
      minBitrate: 800000,
      startBitrate: 1500000,
      maxWidth: 1920,
      maxHeight: 1080,
      maxFrameRate: 30,
      degradationPreference: 'maintain-resolution',
    },
    audio: {
      maxBitrate: 64000, // 64 kbps
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  },
  auto: {
    video: {
      maxBitrate: 1500000, // 1.5 Mbps
      minBitrate: 200000,
      startBitrate: 800000,
      maxWidth: 1280,
      maxHeight: 720,
      maxFrameRate: 30,
      degradationPreference: 'balanced',
    },
    audio: {
      maxBitrate: 48000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  },
};

/**
 * Apply quality constraints to peer connection
 */
export async function applyQualityConfig(
  peerConnection: RTCPeerConnection,
  config: MediaQualityConfig
): Promise<void> {
  const senders = peerConnection.getSenders();

  for (const sender of senders) {
    if (!sender.track) continue;

    const params = sender.getParameters();

    if (sender.track.kind === 'video') {
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      params.encodings[0].maxBitrate = config.video.maxBitrate;
      params.encodings[0].maxFramerate = config.video.maxFrameRate;
      
      if (config.video.scaleResolutionDownBy) {
        params.encodings[0].scaleResolutionDownBy = config.video.scaleResolutionDownBy;
      }

      // Set degradation preference (Chrome/Edge only)
      if (params.degradationPreference !== undefined) {
        params.degradationPreference = config.video.degradationPreference;
      }

      await sender.setParameters(params);
    } else if (sender.track.kind === 'audio') {
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      params.encodings[0].maxBitrate = config.audio.maxBitrate;
      await sender.setParameters(params);
    }
  }
}

/**
 * Network quality monitoring
 */
export interface NetworkStats {
  bytesReceived: number;
  bytesSent: number;
  packetsLost: number;
  packetsReceived: number;
  jitter: number;
  roundTripTime: number;
  availableOutgoingBitrate?: number;
  timestamp: number;
}

export async function getNetworkStats(
  peerConnection: RTCPeerConnection
): Promise<NetworkStats | null> {
  try {
    const stats = await peerConnection.getStats();
    let bytesReceived = 0;
    let bytesSent = 0;
    let packetsLost = 0;
    let packetsReceived = 0;
    let jitter = 0;
    let rtt = 0;
    let availableBitrate: number | undefined;

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp') {
        bytesReceived += report.bytesReceived || 0;
        packetsLost += report.packetsLost || 0;
        packetsReceived += report.packetsReceived || 0;
        jitter += report.jitter || 0;
      } else if (report.type === 'outbound-rtp') {
        bytesSent += report.bytesSent || 0;
      } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        rtt = report.currentRoundTripTime || 0;
        availableBitrate = report.availableOutgoingBitrate;
      }
    });

    return {
      bytesReceived,
      bytesSent,
      packetsLost,
      packetsReceived,
      jitter,
      roundTripTime: rtt,
      availableOutgoingBitrate: availableBitrate,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('[Quality] Failed to get stats:', error);
    return null;
  }
}

/**
 * Adaptive quality controller
 * Monitors network and adjusts quality automatically
 */
export class AdaptiveQualityController {
  private peerConnection: RTCPeerConnection;
  private currentQuality: keyof typeof QualityPresets = 'auto';
  private monitorInterval?: NodeJS.Timeout;
  private lastStats?: NetworkStats;
  private statsHistory: NetworkStats[] = [];
  private readonly maxHistoryLength = 10;

  constructor(peerConnection: RTCPeerConnection) {
    this.peerConnection = peerConnection;
  }

  async start(intervalMs: number = 2000): Promise<void> {
    // Apply initial quality
    await this.setQuality('auto');

    // Start monitoring
    this.monitorInterval = setInterval(async () => {
      await this.monitor();
    }, intervalMs);
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  async setQuality(quality: keyof typeof QualityPresets): Promise<void> {
    this.currentQuality = quality;
    const config = QualityPresets[quality];
    await applyQualityConfig(this.peerConnection, config);
    console.log(`[Quality] Set to ${quality}`, config);
  }

  private async monitor(): Promise<void> {
    const stats = await getNetworkStats(this.peerConnection);
    if (!stats) return;

    this.statsHistory.push(stats);
    if (this.statsHistory.length > this.maxHistoryLength) {
      this.statsHistory.shift();
    }

    if (this.lastStats) {
      await this.adaptQuality(stats, this.lastStats);
    }

    this.lastStats = stats;
  }

  private async adaptQuality(current: NetworkStats, previous: NetworkStats): Promise<void> {
    // Calculate metrics
    const timeDiff = (current.timestamp - previous.timestamp) / 1000; // seconds
    const bytesSent = current.bytesSent - previous.bytesSent;
    const currentBitrate = (bytesSent * 8) / timeDiff; // bits per second

    const packetsReceived = current.packetsReceived - previous.packetsReceived;
    const packetsLost = current.packetsLost - previous.packetsLost;
    const packetLossRate = packetsReceived > 0 ? packetsLost / packetsReceived : 0;

    const rtt = current.roundTripTime * 1000; // Convert to ms

    // Decision logic
    let targetQuality = this.currentQuality;

    // High packet loss → downgrade
    if (packetLossRate > 0.05) {
      // >5% loss
      if (this.currentQuality === 'high') targetQuality = 'medium';
      else if (this.currentQuality === 'medium') targetQuality = 'low';
    }

    // High RTT → downgrade
    if (rtt > 300) {
      // >300ms
      if (this.currentQuality === 'high') targetQuality = 'medium';
    }

    // Low available bitrate → downgrade
    if (current.availableOutgoingBitrate && current.availableOutgoingBitrate < 500000) {
      // <500 kbps
      if (this.currentQuality !== 'low') targetQuality = 'low';
    }

    // Good conditions → upgrade
    if (
      packetLossRate < 0.01 && // <1% loss
      rtt < 150 && // <150ms
      current.availableOutgoingBitrate &&
      current.availableOutgoingBitrate > 2000000 && // >2 Mbps
      this.currentQuality === 'low'
    ) {
      targetQuality = 'medium';
    }

    if (
      packetLossRate < 0.005 && // <0.5% loss
      rtt < 100 && // <100ms
      current.availableOutgoingBitrate &&
      current.availableOutgoingBitrate > 3000000 && // >3 Mbps
      this.currentQuality === 'medium'
    ) {
      targetQuality = 'high';
    }

    // Apply change if needed
    if (targetQuality !== this.currentQuality) {
      console.log(
        `[Quality] Adapting ${this.currentQuality} → ${targetQuality}`,
        { packetLossRate, rtt, currentBitrate, availableBitrate: current.availableOutgoingBitrate }
      );
      await this.setQuality(targetQuality);
    }
  }

  getStats(): { current: NetworkStats | undefined; history: NetworkStats[] } {
    return {
      current: this.lastStats,
      history: [...this.statsHistory],
    };
  }
}
