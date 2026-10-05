/**
 * In-memory call state manager.
 * In production, replace with Redis / DB-backed store.
 */

export type CallState = "ringing" | "accepted" | "declined" | "ended";

export interface ActiveCall {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  calleeId: string;
  conversationId: string;
  conversationName: string;
  isGroup: boolean;
  state: CallState;
  createdAt: number;
  answeredAt?: number;
}

const calls = new Map<string, ActiveCall>();
/** Map of userId → list of pending SSE response controllers */
const listeners = new Map<string, Set<ReadableStreamDefaultController>>();
export const callManager = {
  /** Initiate a new call */
  initiate(call: Omit<ActiveCall, "state" | "createdAt">): ActiveCall {
    const entry: ActiveCall = {
      ...call,
      state: "ringing",
      createdAt: Date.now(),
    };
    calls.set(entry.id, entry);
    // Notify callee
    this.notifyCallee(call.calleeId, entry);
    return entry;
  },

  /** Accept an incoming call */
  accept(callId: string, userId: string): ActiveCall | null {
    const call = calls.get(callId);
    if (!call || call.calleeId !== userId) return null;
    call.state = "accepted";
    call.answeredAt = Date.now();
    this.notifyCaller(call.callerId, call);
    return call;
  },

  /** Decline / reject a call */
  decline(callId: string, userId: string): boolean {
    const call = calls.get(callId);
    if (!call || call.calleeId !== userId) return false;
    call.state = "declined";
    this.notifyCaller(call.callerId, call);
    return true;
  },

  /** End an active call */
  end(callId: string, userId: string): boolean {
    const call = calls.get(callId);
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) return false;
    call.state = "ended";
    this.notifyBoth(call, call);
    calls.delete(callId);
    return true;
  },

  /** Get active call for a user */
  getActiveForUser(userId: string): ActiveCall | null {
    for (const call of calls.values()) {
      if (
        call.state === "ringing" &&
        call.calleeId === userId
      ) {
        return call;
      }
    }
    return null;
  },

  /** Check if a user is already in a ringing call (as caller or callee) */
  hasActiveCall(userId: string): boolean {
    for (const call of calls.values()) {
      if (call.state === "ringing" && (call.callerId === userId || call.calleeId === userId)) {
        return true;
      }
    }
    return false;
  },

  /** Register SSE listener for a user */
  addListener(userId: string, controller: ReadableStreamDefaultController): void {
    if (!listeners.has(userId)) listeners.set(userId, new Set());
    listeners.get(userId)!.add(controller);
  },

  /** Remove SSE listener */
  removeListener(userId: string, controller: ReadableStreamDefaultController): void {
    listeners.get(userId)?.delete(controller);
  },

  /** Send event to callee */
  notifyCallee(calleeId: string, call: ActiveCall): void {
    const userListeners = listeners.get(calleeId);
    if (!userListeners) return;
    const payload = `data: ${JSON.stringify({ type: "incoming_call", call })}\n\n`;
    for (const ctrl of userListeners) {
      try {
        ctrl.enqueue(new TextEncoder().encode(payload));
      } catch {
        listeners.get(calleeId)?.delete(ctrl);
      }
    }
  },

  /** Send event to caller */
  notifyCaller(callerId: string, call: ActiveCall): void {
    const userListeners = listeners.get(callerId);
    if (!userListeners) return;
    const payload = `data: ${JSON.stringify({ type: "call_update", call })}\n\n`;
    for (const ctrl of userListeners) {
      try {
        ctrl.enqueue(new TextEncoder().encode(payload));
      } catch {
        listeners.get(callerId)?.delete(ctrl);
      }
    }
  },

  /** Send event to both parties */
  notifyBoth(call: ActiveCall, update: ActiveCall): void {
    this.notifyCaller(call.callerId, update);
    this.notifyCallee(call.calleeId, update);
  },

  /** Relay a WebRTC signaling payload from `fromUserId` to the other
   *  participant in the same call. Used for OFFER / ANSWER / ICE.
   *  Returns true if the call exists and the user is a participant. */
  relaySignal(
    callId: string,
    fromUserId: string,
    signal: { kind: "offer" | "answer" | "ice" | "hangup"; payload?: unknown }
  ): boolean {
    const call = calls.get(callId);
    if (!call) return false;
    if (call.callerId !== fromUserId && call.calleeId !== fromUserId) return false;
    const targetUserId =
      call.callerId === fromUserId ? call.calleeId : call.callerId;
    const userListeners = listeners.get(targetUserId);
    if (!userListeners) return true; // call exists, peer just offline
    const payload = `data: ${JSON.stringify({
      type: "call_signal",
      callId,
      signal,
    })}\n\n`;
    for (const ctrl of userListeners) {
      try {
        ctrl.enqueue(new TextEncoder().encode(payload));
      } catch {
        listeners.get(targetUserId)?.delete(ctrl);
      }
    }
    return true;
  },
};
