import { Server, Socket } from 'socket.io';
import { getCallManager2 } from './callManager2';
import { CallRecord, ClientMessage, ServerMessage } from './callTypes';

/**
 * Initialize WebSocket server for call signaling
 */
export function initializeCallSocket(io: Server) {
  const callManager = getCallManager2();

  // Namespace for call signaling
  const callNamespace = io.of('/api/ws/calls');

  callNamespace.on('connection', async (socket: Socket) => {
    console.log('[CallSocket] Client connected:', socket.id);

    // Get user from socket handshake (auth middleware should set this)
    const userId = (socket.handshake.auth as any)?.userId || socket.handshake.query.userId as string;

    if (!userId) {
      console.log('[CallSocket] No userId, disconnecting');
      socket.emit('error', { message: 'Authentication required', code: 'AUTH_REQUIRED' });
      socket.disconnect();
      return;
    }

    // Store user connection
    await callManager.setUserSocket(userId, socket.id);

    // Send connected message
    socket.emit('connected', {});

    // Handle incoming signals
    socket.on('signal', async (data: ClientMessage) => {
      try {
        if (data.type === 'signal' && data.callId && data.kind && data.payload) {
          const call = await callManager.getCall(data.callId);
          if (!call) {
            socket.emit('error', { message: 'Call not found', code: 'CALL_NOT_FOUND' });
            return;
          }

          // Determine target user (other participant)
          const targetUserId = call.callerId === userId ? call.calleeId : call.callerId;
          const targetSocketId = await callManager.getUserSocket(targetUserId);

          if (targetSocketId) {
            // Forward signal to other participant
            callNamespace.to(targetSocketId).emit('call_signal', {
              type: 'call_signal',
              callId: data.callId,
              signal: {
                kind: data.kind,
                payload: data.payload,
              },
            });
          }
        } else if (data.type === 'heartbeat') {
          socket.emit('pong', {});
        }
      } catch (error) {
        console.error('[CallSocket] Signal error:', error);
        socket.emit('error', { message: 'Signal failed', code: 'SIGNAL_ERROR' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log('[CallSocket] Client disconnected:', socket.id);
      await callManager.removeUserSocket(userId);

      // Check if user has active call and end it
      const activeCalls = await callManager.getUserActiveCalls(userId);
      for (const call of activeCalls) {
        await callManager.endCall(call.id, 'disconnected');
        
        // Notify other participant
        const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
        const otherSocketId = await callManager.getUserSocket(otherUserId);
        
        if (otherSocketId) {
          callNamespace.to(otherSocketId).emit('call_ended', {
            type: 'call_ended',
            callId: call.id,
            message: 'Other participant disconnected',
          });
        }
      }
    });

    socket.on('error', (error) => {
      console.error('[CallSocket] Socket error:', error);
    });
  });

  // Subscribe to call events from Redis pub/sub
  callManager.on('call_created', async (call: CallRecord) => {
    const calleeSocketId = await callManager.getUserSocket(call.calleeId);
    if (calleeSocketId) {
      callNamespace.to(calleeSocketId).emit('incoming_call', {
        type: 'incoming_call',
        call,
      });
    }
  });

  callManager.on('call_updated', async (call: CallRecord) => {
    const callerSocketId = await callManager.getUserSocket(call.callerId);
    const calleeSocketId = await callManager.getUserSocket(call.calleeId);

    const message = {
      type: 'call_update',
      call,
    };

    if (callerSocketId) {
      callNamespace.to(callerSocketId).emit('call_update', message);
    }
    if (calleeSocketId) {
      callNamespace.to(calleeSocketId).emit('call_update', message);
    }
  });

  callManager.on('call_ended', async (data: { callId: string; callerId: string; calleeId: string; reason?: string }) => {
    const callerSocketId = await callManager.getUserSocket(data.callerId);
    const calleeSocketId = await callManager.getUserSocket(data.calleeId);

    const message = {
      type: 'call_ended',
      callId: data.callId,
      message: data.reason || 'Call ended',
    };

    if (callerSocketId) {
      callNamespace.to(callerSocketId).emit('call_ended', message);
    }
    if (calleeSocketId) {
      callNamespace.to(calleeSocketId).emit('call_ended', message);
    }
  });

  console.log('[CallSocket] WebSocket server initialized');
}
