import { EventEmitter } from 'events';
import { CallRecord, CallState } from './callTypes';
import { getRedisClient } from './redis';

/**
 * Modern call manager with Redis persistence and pub/sub.
 *
 * Nếu REDIS_URL không cấu hình (chạy local dev) thì tự động fallback
 * sang in-memory store để vẫn có thể gọi/đổ chuông bình thường.
 */

interface InMemoryStore {
  calls: Map<string, CallRecord>;        // callId → call
  userToCall: Map<string, string>;        // userId → callId
  userSockets: Map<string, string>;       // userId → socketId
  timeouts: Map<string, ReturnType<typeof setTimeout>>; // callId → timeout handle
}

const memory: InMemoryStore = {
  calls: new Map(),
  userToCall: new Map(),
  userSockets: new Map(),
  timeouts: new Map(),
};
export class CallManager2 extends EventEmitter {
  private redis;
  private subscriber;
  private useMemory: boolean;
  private memory: InMemoryStore;

  constructor() {
    super();
    this.memory = memory;
    this.useMemory = !process.env.REDIS_URL;
    if (this.useMemory) {
      // Không có REDIS_URL → dùng in-memory store, không cần kết nối Redis.
      console.log('[CallManager2] REDIS_URL not set, using in-memory store');
      this.redis = null as any;
      this.subscriber = null as any;
      return;
    }
    this.redis = getRedisClient();
    this.subscriber = this.redis.duplicate();
    this.initializeSubscriber();
  }

  private async initializeSubscriber() {
    await this.subscriber.connect();
    await this.subscriber.subscribe('call_events', (message: string) => {
      try {
        const event = JSON.parse(message);
        this.emit(event.type, event.data);
      } catch (error) {
        console.error('[CallManager] Subscribe error:', error);
      }
    });
  }

  private async publish(type: string, data: any) {
    if (this.useMemory) {
      // In-memory mode: emit trực tiếp để socket.ts subscriber xử lý.
      this.emit(type, data);
      return;
    }
    await this.redis.publish('call_events', JSON.stringify({ type, data }));
  }

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async createCall(params: {
    conversationId: string;
    callerId: string;
    callerName: string;
    callerAvatar?: string;
    calleeId: string;
    calleeName?: string;
    calleeAvatar?: string;
    conversationName: string;
    isGroup?: boolean;
  }): Promise<CallRecord> {
    const call: CallRecord = {
      id: this.generateCallId(),
      conversationId: params.conversationId,
      callerId: params.callerId,
      callerName: params.callerName,
      callerAvatar: params.callerAvatar,
      calleeId: params.calleeId,
      calleeName: params.calleeName,
      calleeAvatar: params.calleeAvatar,
      state: CallState.RINGING,
      isGroup: params.isGroup || false,
      conversationName: params.conversationName,
      createdAt: Date.now(),
      ringingAt: Date.now(),
    };

    if (this.useMemory) {
      this.memory.calls.set(call.id, call);
      this.memory.userToCall.set(params.callerId, call.id);
      this.memory.userToCall.set(params.calleeId, call.id);
      this.scheduleTimeout(call.id, 60000);
      this.publish('call_created', call);
      return call;
    }

    // Store in Redis
    await this.redis.setEx(`call:${call.id}`, 3600, JSON.stringify(call));
    await this.redis.setEx(`user_call:${params.callerId}`, 3600, call.id);
    await this.redis.setEx(`user_call:${params.calleeId}`, 3600, call.id);

    // Set timeout for no answer
    await this.scheduleTimeout(call.id, 60000); // 60 seconds

    // Publish event
    await this.publish('call_created', call);

    return call;
  }

  async getCall(callId: string): Promise<CallRecord | null> {
    if (this.useMemory) {
      return this.memory.calls.get(callId) ?? null;
    }
    const data = await this.redis.get(`call:${callId}`);
    return data ? JSON.parse(data) : null;
  }

  async updateCall(callId: string, updates: Partial<CallRecord>): Promise<CallRecord | null> {
    const call = await this.getCall(callId);
    if (!call) return null;

    const updatedCall = { ...call, ...updates };
    if (this.useMemory) {
      this.memory.calls.set(callId, updatedCall);
    } else {
      await this.redis.setEx(`call:${callId}`, 3600, JSON.stringify(updatedCall));
    }

    await this.publish('call_updated', updatedCall);

    return updatedCall;
  }

  async acceptCall(callId: string): Promise<CallRecord | null> {
    return this.updateCall(callId, {
      state: CallState.CONNECTING,
      acceptedAt: Date.now(),
    });
  }

  async declineCall(callId: string): Promise<void> {
    const call = await this.getCall(callId);
    if (!call) return;

    await this.updateCall(callId, {
      state: CallState.DECLINED,
      endedAt: Date.now(),
      endReason: 'declined',
    });

    await this.publish('call_ended', {
      callId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      reason: 'declined',
    });

    // Cleanup
    await this.cleanupCall(callId, call.callerId, call.calleeId);
  }

  async markConnected(callId: string): Promise<CallRecord | null> {
    return this.updateCall(callId, {
      state: CallState.CONNECTED,
      connectedAt: Date.now(),
    });
  }

  async endCall(callId: string, reason?: string): Promise<void> {
    const call = await this.getCall(callId);
    if (!call) return;

    const duration = call.connectedAt ? Date.now() - call.connectedAt : undefined;

    await this.updateCall(callId, {
      state: CallState.ENDED,
      endedAt: Date.now(),
      endReason: reason || 'ended',
      duration,
    });

    await this.publish('call_ended', {
      callId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      reason: reason || 'ended',
    });

    // Cleanup
    await this.cleanupCall(callId, call.callerId, call.calleeId);
  }

  private async cleanupCall(callId: string, callerId: string, calleeId: string) {
    if (this.useMemory) {
      const existing = this.memory.timeouts.get(callId);
      if (existing) {
        clearTimeout(existing);
        this.memory.timeouts.delete(callId);
      }
      // Xoá user→call mapping ngay; call record giữ lại 5 phút cho history
      this.memory.userToCall.delete(callerId);
      this.memory.userToCall.delete(calleeId);
      setTimeout(() => {
        this.memory.calls.delete(callId);
      }, 5 * 60 * 1000);
      return;
    }

    // Remove call data after 5 minutes for history
    setTimeout(async () => {
      await this.redis.del(`call:${callId}`);
      await this.redis.del(`call_timeout:${callId}`);
    }, 5 * 60 * 1000);

    // Remove user associations immediately
    await this.redis.del(`user_call:${callerId}`);
    await this.redis.del(`user_call:${calleeId}`);
  }

  private async scheduleTimeout(callId: string, timeoutMs: number) {
    if (this.useMemory) {
      const handle = setTimeout(async () => {
        const call = await this.getCall(callId);
        if (call && (call.state === CallState.RINGING || call.state === CallState.CONNECTING)) {
          await this.updateCall(callId, {
            state: CallState.TIMEOUT,
            endedAt: Date.now(),
            endReason: 'timeout',
          });

          await this.publish('call_ended', {
            callId,
            callerId: call.callerId,
            calleeId: call.calleeId,
            reason: 'timeout',
          });

          await this.cleanupCall(callId, call.callerId, call.calleeId);
        }
      }, timeoutMs);
      this.memory.timeouts.set(callId, handle);
      return;
    }

    await this.redis.setEx(`call_timeout:${callId}`, Math.ceil(timeoutMs / 1000), 'pending');

    setTimeout(async () => {
      const timeoutStatus = await this.redis.get(`call_timeout:${callId}`);
      if (timeoutStatus === 'pending') {
        const call = await this.getCall(callId);
        if (call && (call.state === CallState.RINGING || call.state === CallState.CONNECTING)) {
          await this.updateCall(callId, {
            state: CallState.TIMEOUT,
            endedAt: Date.now(),
            endReason: 'timeout',
          });

          await this.publish('call_ended', {
            callId,
            callerId: call.callerId,
            calleeId: call.calleeId,
            reason: 'timeout',
          });

          await this.cleanupCall(callId, call.callerId, call.calleeId);
        }
      }
    }, timeoutMs);
  }

  async getUserActiveCalls(userId: string): Promise<CallRecord[]> {
    if (this.useMemory) {
      const callId = this.memory.userToCall.get(userId);
      if (!callId) return [];
      const call = this.memory.calls.get(callId);
      return call ? [call] : [];
    }
    const callId = await this.redis.get(`user_call:${userId}`);
    if (!callId) return [];

    const call = await this.getCall(callId);
    return call ? [call] : [];
  }

  async setUserSocket(userId: string, socketId: string) {
    if (this.useMemory) {
      this.memory.userSockets.set(userId, socketId);
      return;
    }
    await this.redis.setEx(`user_socket:${userId}`, 3600, socketId);
  }

  async getUserSocket(userId: string): Promise<string | null> {
    if (this.useMemory) {
      return this.memory.userSockets.get(userId) ?? null;
    }
    return this.redis.get(`user_socket:${userId}`);
  }

  async removeUserSocket(userId: string) {
    if (this.useMemory) {
      this.memory.userSockets.delete(userId);
      return;
    }
    await this.redis.del(`user_socket:${userId}`);
  }
}

let instance: CallManager2 | null = null;

export function getCallManager2(): CallManager2 {
  if (!instance) {
    instance = new CallManager2();
  }
  return instance;
}
