import { useEffect, useRef, useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { ServerMessage, ClientMessage } from '@/lib/callTypes';
import type { Session } from 'next-auth';

interface UseCallSocketOptions {
  autoConnect?: boolean;
}

export function useCallSocket(options: UseCallSocketOptions = {}) {
  const { autoConnect = true } = options;
  const session = useSession();
  // next-auth type có thể không có `id` trong user — cast tạm để truy cập.
  const sessionData = session.data as (Session & { user?: { id?: string } }) | null;
  const userId = sessionData?.user?.id;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    if (!userId) {
      console.warn('[CallSocket] No user session, cannot connect');
      return;
    }

    // Connect to WebSocket namespace.
    //
    // Lưu ý: `io(namespace, opts)` với `path` chỉ định path HTTP socket.io
    // (mặc định '/socket.io'). Khi `path` trùng với endpoint server đang
    // listen, client sẽ tự route namespace qua connect-packet.
    const socket = io('/api/ws/calls', {
      path: '/api/socket/io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      auth: {
        userId,
      },
    });

    socket.on('connect', () => {
      console.log('[CallSocket] Connected');
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('[CallSocket] Disconnected:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[CallSocket] Connection error:', err);
      setError(err.message);
    });

    // Forward all events to listeners
    socket.onAny((eventName, data) => {
      const listeners = listenersRef.current.get(eventName);
      if (listeners) {
        listeners.forEach((listener) => listener(data));
      }
    });

    socketRef.current = socket;
  }, [userId]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, []);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);

    // Return cleanup function
    return () => {
      const listeners = listenersRef.current.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          listenersRef.current.delete(event);
        }
      }
    };
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (!socketRef.current?.connected) {
      console.warn('[CallSocket] Cannot emit, not connected');
      return;
    }
    socketRef.current.emit(event, data);
  }, []);

  const sendSignal = useCallback(
    (callId: string, kind: string, payload: Record<string, any>) => {
      const message: ClientMessage = {
        type: 'signal',
        callId,
        kind,
        payload,
      };
      emit('signal', message);
    },
    [emit]
  );

  useEffect(() => {
    if (autoConnect && userId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, userId, connect, disconnect]);

  return {
    connected,
    error,
    connect,
    disconnect,
    on,
    emit,
    sendSignal,
  };
}
