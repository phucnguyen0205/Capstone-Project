/**
 * Call system types - shared between client and server
 */

export enum CallState {
  IDLE = 'idle',
  INITIATING = 'initiating',
  RINGING = 'ringing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ENDING = 'ending',
  ENDED = 'ended',
  DECLINED = 'declined',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export interface CallRecord {
  id: string;
  conversationId: string;

  // Participants
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  calleeId: string;
  calleeName?: string;
  calleeAvatar?: string;

  // State
  state: CallState;
  isGroup: boolean;
  conversationName: string;

  // Timing
  createdAt: number;
  ringingAt?: number;
  acceptedAt?: number;
  connectedAt?: number;
  endedAt?: number;

  // Metadata
  endReason?: string;
  duration?: number;
  qualityScore?: number;
}

// WebSocket message types
export interface ClientMessage {
  type: 'signal' | 'heartbeat';
  callId?: string;
  kind?: string;
  payload?: Record<string, any>;
}

export interface ServerMessage {
  type: 'connected' | 'incoming_call' | 'call_update' | 'call_signal' | 'call_ended' | 'error' | 'closed' | 'pong';
  call?: CallRecord;
  callId?: string;
  signal?: {
    kind: string;
    payload: Record<string, any>;
  };
  message?: string;
  code?: string;
}
